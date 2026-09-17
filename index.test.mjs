import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { createRequire } from "node:module";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import test, { after } from "node:test";

// Match Pi's extension loader: the pi-ai root resolves to its compatibility API.
const piRequire = createRequire(import.meta.resolve("@earendil-works/pi-coding-agent"));
const piAi = piRequire.resolve.paths("@earendil-works/pi-ai")
	.map((path) => join(path, "@earendil-works/pi-ai/dist/compat.js")).find(existsSync);
assert.ok(piAi, "Pi's installed pi-ai package must be available");
const { createJiti } = piRequire("jiti");
const jiti = createJiti(import.meta.url, { alias: { "@earendil-works/pi-ai": piAi } });
const { default: extension, parseConfig, routingInput } = await jiti.import("./index.ts");
const { createAssistantMessageEventStream } = await import(pathToFileURL(piAi));
// Never read or write the developer's settings.
const originalAgentDir = process.env.PI_CODING_AGENT_DIR;
const agentDir = mkdtempSync(join(tmpdir(), "jev-settings-"));
const settingsPath = join(agentDir, "settings.json");
process.env.PI_CODING_AGENT_DIR = agentDir;
after(() => {
	if (originalAgentDir === undefined) delete process.env.PI_CODING_AGENT_DIR;
	else process.env.PI_CODING_AGENT_DIR = originalAgentDir;
	rmSync(agentDir, { recursive: true, force: true });
});
const FAST = "openai-codex/gpt-5.6-luna";
const DEEP = "openai-codex/gpt-6-astra";
const usage = { input: 100, output: 10, cacheRead: 50, cacheWrite: 0, totalTokens: 160, cost: { input: 1, output: 2, cacheRead: 3, cacheWrite: 0, total: 6 } };
const user = (text, timestamp = 1) => ({ role: "user", content: text, timestamp });
const context = (text = "Fix a typo", timestamp = 1) => ({ systemPrompt: "PRIVATE SYSTEM INSTRUCTIONS", tools: [], messages: [user(text, timestamp)] });

async function harness({ refs = [FAST, DEEP], gatewayKey = true, backendError = false, incomplete = false, auth, history = [], sessionId = "main" } = {}) {
	const handlers = new Map();
	const commands = new Map();
	const calls = [], entries = structuredClone(history), notices = [];
	const models = refs.map((ref) => ({
		provider: ref.split("/")[0], id: ref.slice(ref.indexOf("/") + 1), name: ref,
		api: "openai-codex-responses", baseUrl: "https://example.invalid",
		contextWindow: 272000, maxTokens: 128000, input: ["text", "image"], reasoning: true,
		thinkingLevelMap: { xhigh: "xhigh", max: "max" }, cost: usage.cost,
	}));
	let registration;
	const backend = {
		streamSimple(model, ctx, options) {
			const output = createAssistantMessageEventStream();
			const message = {
				role: "assistant", api: model.api, provider: model.provider, model: model.id,
				content: [{ type: "toolCall", id: "call-1", name: "read", arguments: { path: "README.md" } }],
				usage, timestamp: 2, stopReason: backendError ? "error" : "toolUse",
				...(backendError ? { errorMessage: "Backend failure" } : {}),
			};
			void (async () => {
				const payload = await options.onPayload?.({ model: model.id }, model);
				calls.push({ model, context: ctx, options, message, payload });
				output.push({ type: "start", partial: message });
				output.push({ type: "toolcall_end", contentIndex: 0, toolCall: message.content[0], partial: message });
				if (!incomplete) output.push(backendError ? { type: "error", reason: "error", error: message } : { type: "done", reason: "toolUse", message });
				output.end(message);
			})();
			return output;
		},
	};
	const registry = {
		getAvailable: () => models,
		getProvider: () => backend,
		getProviderAuth: async (provider) => {
			assert.equal(provider, "vercel-ai-gateway");
			return gatewayKey ? { auth: { apiKey: "gateway-test-key" } } : undefined;
		},
		getProviderAuthStatus: () => ({ configured: gatewayKey }),
		getApiKeyAndHeaders: auth ?? (async () => ({ ok: true, apiKey: "codex-test-key", headers: { "x-backend": "yes" }, env: { BACKEND: "yes" }, baseUrl: "https://backend.example.invalid" })),
		find: (provider, id) => provider === "auto" ? { ...registration.models[0], provider, api: registration.api, baseUrl: registration.baseUrl } : models.find((model) => model.provider === provider && model.id === id),
	};
	const ctx = {
		modelRegistry: registry,
		sessionManager: {
			getSessionId: () => sessionId,
			getEntries: () => entries.map(({ name, data }) => ({ type: "custom", customType: name, data })),
		},
		ui: { setStatus() {}, notify: (...args) => notices.push(args) },
	};
	const pi = {
		registerProvider(provider, value) {
			assert.equal(provider, "auto");
			registration = value;
			// Pi refreshes the active model from the registry without a model_select event.
			if (ctx.model?.provider === provider) ctx.model = registry.find(provider, ctx.model.id);
		},
		on(name, handler) { handlers.set(name, handler); },
		appendEntry: (name, data) => entries.push({ name, data }),
		registerCommand(name, command) { commands.set(name, command); },
		setModel: async (model) => { ctx.model = model; return true; },
	};
	extension(pi);
	ctx.model = registry.find("auto", "jev");
	await handlers.get("session_start")({}, ctx);
	return {
		calls, entries, notices, models, ctx, handlers, commands,
		stream: (input = context(), options = {}) => registration.streamSimple(ctx.model, input, { sessionId, apiKey: "router-key", headers: { Authorization: "router-secret" }, env: { ROUTER_SECRET: "private" }, ...options }),
	};
}

function mockGateway(t, respond = () => FAST) {
	const previous = globalThis.fetch;
	const requests = [];
	globalThis.fetch = async (url, options) => {
		assert.match(String(url), /^https:\/\/ai-gateway\.vercel\.sh\/.+\/evaluation-model$/);
		assert.equal(new Headers(options.headers).get("authorization"), "Bearer gateway-test-key");
		assert.equal(new Headers(options.headers).get("ai-model-id"), "typesafe-ai/jev");
		const body = JSON.parse(options.body);
		requests.push(body);
		const result = await respond(options, body);
		if (result instanceof Response) return result;
		const desired = typeof result === "string" ? { target: result } : result;
		const choice = Object.entries(body.questions.route.criteria).find(([, profile]) =>
			profile.model === desired.target && (desired.thinking === undefined || profile.thinking === desired.thinking))?.[0] ?? "unoffered-profile";
		return Response.json({ answers: { route: { type: "choice", choice } }, usage: { inputTokens: 1000, outputTokens: 0 } });
	};
	t.after(() => { globalThis.fetch = previous; });
	return requests;
}

test("declares the AI SDK's required runtime peers for Pi's peer-disabled npm installs", () => {
	const manifest = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8"));
	const sdk = JSON.parse(readFileSync(new URL(import.meta.resolve("ai/package.json")), "utf8"));
	for (const peer of Object.keys(sdk.peerDependencies ?? {})) {
		if (sdk.peerDependenciesMeta?.[peer]?.optional) continue;
		assert.ok(manifest.dependencies?.[peer], `Pi skips peer installation; ${peer} must be a runtime dependency.`);
	}
});

test("pins the session, forwards tools/auth/hooks/usage, and preserves actual model identity", async (t) => {
	const requests = mockGateway(t);
	const h = await harness();
	assert.equal(h.ctx.model.contextWindow, 272000);
	assert.deepEqual(h.ctx.model.input, ["text", "image"]);
	const input = context();
	input.messages.unshift({ role: "toolResult", toolCallId: "old", toolName: "bash", content: [{ type: "text", text: "PRIVATE TOOL OUTPUT" }], timestamp: 0 });
	const events = [];
	for await (const event of h.stream(input, { onPayload: (payload, model) => ({ ...payload, actualProvider: model.provider }), maxTokens: 999999 })) events.push(event);
	assert.deepEqual(events.map((event) => event.type), ["start", "toolcall_end", "done"]);
	const first = h.calls[0];
	assert.equal(first.model.id, "gpt-5.6-luna");
	assert.equal(first.model.baseUrl, "https://backend.example.invalid");
	assert.equal(first.options.apiKey, "codex-test-key");
	assert.deepEqual(first.options.headers, { "x-backend": "yes" });
	assert.deepEqual(first.options.env, { BACKEND: "yes" });
	assert.equal(first.options.reasoning, "max");
	assert.equal(first.options.maxTokens, 128000);
	assert.equal(first.context, input);
	assert.equal(first.payload.actualProvider, "openai-codex");
	assert.equal(events.at(-1).message, first.message);
	assert.equal(events.at(-1).message.usage, usage);
	assert.deepEqual(requests[0].state.messages, [{ role: "user", text: "Fix a typo" }]);
	assert.deepEqual(Object.values(requests[0].questions.route.criteria).map(({ model, thinking }) => [model, thinking]), [[FAST, "max"], [DEEP, "xhigh"]]);
	assert.doesNotMatch(JSON.stringify(requests), /PRIVATE|codex-test-key|router-secret/);
	assert.equal(h.entries[0].data.inputTokens, 1000);
	assert.equal(h.entries[0].data.estimatedCost, 0.000042);

	await h.stream({ ...input, messages: [...input.messages, first.message] }).result();
	assert.equal(requests.length, 1, "tool continuation must keep its route");
	await h.stream(context("Fix a typo", 3)).result();
	assert.equal(requests.length, 2, "a new user message may trigger an advisory check");
	assert.equal(h.calls.at(-1).model.id, "gpt-5.6-luna");
	await h.stream(context("Summarize", 4), { sessionId: "compaction" }).result();
	assert.equal(requests.length, 2, "auxiliary calls must not expose synthetic prompts to Jev");
	assert.equal(h.calls.at(-1).model.id, "gpt-5.6-luna", "auxiliary calls use the session pin");
	await h.stream(context("Fix a typo", 3)).result();
	assert.equal(requests.length, 2, "compaction must not replace the main route");
});

test("active router limits follow the backend without rerouting continuations or auxiliary calls", async (t) => {
	let selected = DEEP;
	const requests = mockGateway(t, () => selected);
	const h = await harness();
	Object.assign(h.models[0], { contextWindow: 128000, maxTokens: 8192, input: ["text"] });
	Object.assign(h.models[1], { contextWindow: 1000000, maxTokens: 64000 });
	await h.handlers.get("session_start")({}, h.ctx);
	assert.equal(h.ctx.model.contextWindow, 128000, "startup limits remain conservative until routing");
	const initialRouter = h.ctx.model;

	let windowAtGeneration;
	const large = await h.stream(context(), { onPayload: (payload) => {
		windowAtGeneration = h.ctx.model.contextWindow;
		return payload;
	} }).result();
	assert.equal(large.model, "gpt-6-astra");
	assert.equal(windowAtGeneration, 1000000, "limits must update before generation");
	assert.equal(h.ctx.model.maxTokens, 64000);
	assert.equal(h.ctx.model.provider, "auto");
	assert.equal(h.ctx.model.id, "jev");
	assert.equal(h.ctx.modelRegistry.find("auto", "jev").contextWindow, 1000000);
	// Scoped model cycling can restore an older model object than the registry holds.
	h.ctx.model = initialRouter;
	await h.stream().result();
	assert.equal(h.ctx.model.contextWindow, 1000000);
	assert.equal(requests.length, 1, "refreshing limits must not clear the pinned route");

	selected = FAST;
	const next = context("A smaller task", 3);
	assert.equal((await h.stream(next).result()).model, "gpt-6-astra");
	assert.equal(h.ctx.model.contextWindow, 1000000, "advice must not change the active limits");
	assert.equal(h.ctx.model.maxTokens, 64000);
	assert.deepEqual(h.ctx.model.input, ["text", "image"]);
	assert.equal((await h.stream(context("Summarize"), { sessionId: "compaction" }).result()).model, "gpt-6-astra");
	assert.equal(h.ctx.model.contextWindow, 1000000);
	Object.assign(h.models[1], { contextWindow: 256000, maxTokens: 16384 });
	assert.equal((await h.stream(next).result()).model, "gpt-6-astra");
	assert.equal(h.ctx.model.contextWindow, 256000, "refresh changed limits on the pinned backend");
	assert.equal(h.ctx.model.maxTokens, 16384);
	await h.handlers.get("session_start")({ reason: "reload" }, h.ctx);
	assert.equal(h.ctx.model.contextWindow, 256000, "reload restores the pinned backend's limits before generation");
	assert.equal(requests.length, 2);
});

test("Jev chooses automatic effort once, and pins it across messages and auxiliary calls", async (t) => {
	t.after(() => rmSync(settingsPath, { force: true }));
	writeFileSync(settingsPath, JSON.stringify({ jevRouter: { options: { [FAST]: { description: "Routine work", thinking: "auto" } }, fallback: FAST } }));
	let thinking = "low";
	const requests = mockGateway(t, () => ({ target: FAST, thinking }));
	const h = await harness({ refs: [FAST] });
	await h.stream().result();
	assert.equal(requests.length, 1, "one model still needs effort selection");
	assert.deepEqual(Object.values(requests[0].questions.route.criteria).map((profile) => profile.thinking), ["off", "minimal", "low", "medium", "high", "xhigh", "max"]);
	assert.equal(h.calls[0].options.reasoning, "low");
	assert.equal(h.entries[0].data.thinking, "low");
	await h.commands.get("jev").handler("", h.ctx);
	assert.match(h.notices.at(-1)[0], /thinking low/);

	await h.stream(context("Summarize"), { sessionId: "compaction" }).result();
	assert.equal(h.calls.at(-1).options.reasoning, "low", "auxiliary calls use the pinned effort");
	thinking = "high";
	await h.stream().result();
	assert.equal(h.calls.at(-1).options.reasoning, "low");
	assert.equal(requests.length, 1);
	await h.stream(context("Harder task", 3)).result();
	assert.equal(h.calls.at(-1).options.reasoning, "low", "a new message must not change effort");
	assert.equal(requests.length, 1, "no different model exists to recommend");
	h.models[0].thinkingLevelMap.low = null;
	const callsBefore = h.calls.length;
	assert.match((await h.stream(context("Another task", 4)).result()).errorMessage, /pinned Jev thinking level is no longer supported/);
	assert.equal(h.calls.length, callsBefore, "unsupported pins must not silently change");
	const fork = await harness({ refs: [FAST], history: h.entries, sessionId: "fork" });
	await fork.stream(context("Harder task", 5)).result();
	assert.equal(fork.calls[0].options.reasoning, "high");
	assert.equal(requests.length, 2);
});

test("custom effort choices filter unsupported levels while fixed levels override Pi thinking", async (t) => {
	t.after(() => rmSync(settingsPath, { force: true }));
	writeFileSync(settingsPath, JSON.stringify({ jevRouter: {
		options: {
			[FAST]: { description: "Routine work", thinking: { low: "Small patches", high: "Risky patches", xhigh: "Major investigation" } },
			[DEEP]: { description: "Deep work", thinking: "max" },
		}, fallback: DEEP,
	} }));
	let target = FAST;
	const requests = mockGateway(t, () => target);
	const h = await harness();
	h.models[0].thinkingLevelMap = { low: null, xhigh: null };
	await h.stream().result();
	const profiles = Object.values(requests[0].questions.route.criteria);
	assert.deepEqual(profiles.map(({ model, thinking }) => [model, thinking]), [[FAST, "high"], [DEEP, "max"]]);
	assert.equal(profiles[0].effort, "Risky patches");
	assert.equal(h.calls[0].options.reasoning, "high");
	target = DEEP;
	const fixed = await harness();
	await fixed.stream(context("Next task", 3), { reasoning: "low" }).result();
	assert.equal(fixed.calls[0].options.reasoning, "max", "a fixed route policy must win over Pi's selected level");
	const clamped = await harness();
	clamped.models[1].thinkingLevelMap.max = null;
	await clamped.stream(context("Another task", 4)).result();
	assert.equal(clamped.calls[0].options.reasoning, "xhigh", "fixed effort is clamped before the initial pin");
});

test("effort fallback stays within custom choices and non-reasoning models need no evaluator", async (t) => {
	t.after(() => rmSync(settingsPath, { force: true }));
	const options = { [FAST]: { description: "Routine work", thinking: { high: "Complex", low: "Simple" } } };
	writeFileSync(settingsPath, JSON.stringify({ jevRouter: { options, fallback: FAST } }));
	const requests = mockGateway(t, () => ({ target: FAST, thinking: "max" }));
	const h = await harness({ refs: [FAST] });
	await h.stream().result();
	assert.equal(h.entries[0].data.source, "fallback", "unoffered effort must be rejected");
	assert.equal(h.calls[0].options.reasoning, "high", "fallback uses effort order, not config insertion order");
	const missing = await harness({ refs: [FAST], gatewayKey: false });
	await missing.stream().result();
	assert.equal(missing.calls[0].options.reasoning, "high");
	assert.equal(requests.length, 1);

	writeFileSync(settingsPath, JSON.stringify({ jevRouter: { options: { [FAST]: { description: "No reasoning", thinking: "auto" } }, fallback: FAST } }));
	const noReasoning = await harness({ refs: [FAST] });
	noReasoning.models[0].reasoning = false;
	await noReasoning.stream().result();
	assert.equal(noReasoning.calls[0].options.reasoning, undefined);
	assert.equal(noReasoning.entries[0].data.thinking, "off");
	assert.equal(requests.length, 1);
	writeFileSync(settingsPath, JSON.stringify({ jevRouter: { options, fallback: FAST } }));
	const unsupported = await harness({ refs: [FAST] });
	unsupported.models[0].reasoning = false;
	assert.match((await unsupported.stream().result()).errorMessage, /No Jev routes support the configured thinking/);
	assert.equal(unsupported.calls.length, 0);
});

test("fork suggestions never switch the session pin and survive reload without repeated notices", async (t) => {
	let desired = FAST;
	const requests = mockGateway(t, () => desired);
	const h = await harness();
	await h.stream().result();
	assert.equal(h.entries.filter((entry) => entry.name === "jev-pin").length, 1);
	desired = DEEP;
	const followup = context("Investigate a difficult architecture problem", 3);
	assert.equal((await h.stream(followup).result()).model, "gpt-5.6-luna");
	assert.equal(h.calls.at(-1).options.reasoning, "max");
	assert.equal(h.calls.at(-1).context, followup);
	assert.equal(followup.messages.length, 1, "suggestions must not be injected into model context");
	assert.match(requests[1].questions.route.instructions, /Prefer keeping it/);
	assert.equal(h.entries.filter((entry) => entry.name === "jev-suggestion").length, 1);
	assert.match(h.notices.at(-1)[0], /\/fork.*\/model openai-codex\/gpt-6-astra.*\/thinking xhigh/);
	assert.equal(h.entries.find((entry) => entry.name === "jev-monitor").data.inputTokens, 1000);
	await h.stream(followup).result();
	await h.stream(context("Continue the investigation", 4)).result();
	assert.equal(requests.length, 2, "no more evaluations once every alternative has been suggested");
	assert.equal(h.notices.length, 1);

	const resumed = await harness({ history: h.entries });
	resumed.ctx.sessionManager.getBranch = () => [];
	await resumed.handlers.get("session_start")({ reason: "reload" }, resumed.ctx);
	assert.equal((await resumed.stream(context("Continue", 5)).result()).model, "gpt-5.6-luna");
	assert.equal(requests.length, 2, "pins and suggestion suppression survive reload/resume and tree branches");
	await resumed.commands.get("jev").handler("", resumed.ctx);
	assert.match(resumed.notices.at(-1)[0], /Pinned: openai-codex\/gpt-5.6-luna, thinking max/);
	assert.match(resumed.notices.at(-1)[0], /Fork suggestion: openai-codex\/gpt-6-astra/);
	resumed.ctx.model = resumed.models[1];
	await resumed.handlers.get("model_select")({ model: resumed.ctx.model }, resumed.ctx);
	resumed.ctx.model = resumed.ctx.modelRegistry.find("auto", "jev");
	await resumed.handlers.get("model_select")({ model: resumed.ctx.model }, resumed.ctx);
	assert.equal((await resumed.stream(context("Return to auto", 6)).result()).model, "gpt-5.6-luna");
	assert.equal(requests.length, 2);

	const fork = await harness({ history: h.entries, sessionId: "new-fork-id" });
	assert.equal((await fork.stream(context("Investigate", 7)).result()).model, "gpt-6-astra");
	assert.equal(requests.length, 3, "a fork must not inherit its parent's pin");
	assert.equal(fork.entries.filter((entry) => entry.name === "jev-pin" && entry.data.sessionId === "new-fork-id").length, 1);
});

test("monitor can be disabled and saved pins never silently change after config or availability changes", async (t) => {
	t.after(() => rmSync(settingsPath, { force: true }));
	const config = { options: { [FAST]: { description: "Routine", thinking: "low" }, [DEEP]: { description: "Deep", thinking: "high" } }, fallback: DEEP, monitor: false };
	writeFileSync(settingsPath, JSON.stringify({ jevRouter: config }));
	let desired = FAST;
	const requests = mockGateway(t, () => desired);
	const h = await harness();
	await h.stream().result();
	desired = DEEP;
	assert.equal((await h.stream(context("Different task", 3)).result()).model, "gpt-5.6-luna");
	assert.equal(requests.length, 1);
	config.options[FAST].thinking = "high";
	writeFileSync(settingsPath, JSON.stringify({ jevRouter: config }));
	const resumed = await harness({ history: h.entries });
	await resumed.stream(context("Continue", 4)).result();
	assert.equal(resumed.calls[0].options.reasoning, "low", "settings edits must not rewrite an existing pin");
	delete config.options[FAST];
	writeFileSync(settingsPath, JSON.stringify({ jevRouter: config }));
	const removed = await harness({ history: h.entries });
	assert.match((await removed.stream().result()).errorMessage, /pinned Jev route is unavailable/);
	assert.equal(removed.calls.length, 0);
	assert.equal(requests.length, 1);
	await assert.rejects(harness({ history: [{ name: "jev-pin", data: { sessionId: "main", target: FAST, thinking: "turbo" } }] }), /Invalid saved jev-pin/);
});

test("failed or cancelled monitoring never suggests a fallback or drops the existing pin", async (t) => {
	let mode = "initial";
	const started = Promise.withResolvers();
	const requests = mockGateway(t, (options) => {
		if (mode === "failed") return Response.json({ error: "PRIVATE MONITOR BODY" }, { status: 503 });
		if (mode === "hanging") return new Promise((_, reject) => {
			started.resolve();
			options.signal.addEventListener("abort", () => reject(options.signal.reason), { once: true });
		});
		return mode === "initial" ? FAST : DEEP;
	});
	const h = await harness();
	await h.stream().result();
	mode = "failed";
	assert.equal((await h.stream(context("Harder task", 3)).result()).model, "gpt-5.6-luna");
	assert.equal(h.entries.filter((entry) => entry.name === "jev-suggestion").length, 0);
	assert.doesNotMatch(JSON.stringify(h.entries), /PRIVATE MONITOR BODY/);
	const resumed = await harness({ history: h.entries });
	await resumed.stream(context("Harder task", 3)).result();
	assert.equal(requests.length, 2, "reload must not repeat a completed check for the same message");
	mode = "hanging";
	const controller = new AbortController();
	const pending = h.stream(context("Another task", 4), { signal: controller.signal }).result();
	await started.promise;
	controller.abort();
	assert.equal((await pending).stopReason, "aborted");
	assert.equal(h.calls.length, 2);
	mode = "recommend";
	assert.equal((await h.stream(context("Another task", 4)).result()).model, "gpt-5.6-luna");
	assert.equal(h.calls.at(-1).options.reasoning, "max");
	assert.equal(h.entries.filter((entry) => entry.name === "jev-pin").length, 1);
	assert.equal(h.entries.filter((entry) => entry.name === "jev-suggestion").length, 1);
});

test("auxiliary requests before the first user route do not create a session pin", async (t) => {
	const requests = mockGateway(t);
	const h = await harness();
	assert.equal((await h.stream(context("Synthetic summary"), { sessionId: "compaction" }).result()).model, "gpt-6-astra");
	assert.equal(requests.length, 0);
	assert.equal(h.entries.length, 0);
	assert.equal((await h.stream().result()).model, "gpt-5.6-luna");
	assert.equal((await h.stream(context("Synthetic summary"), { sessionId: "compaction" }).result()).model, "gpt-5.6-luna");
	assert.equal(requests.length, 1);
});

test("only allowlisted available models are offered; Gateway failures never invoke Gateway generation", async (t) => {
	const requests = mockGateway(t, () => Response.json({ error: "PRIVATE SERVER BODY" }, { status: 503 }));
	const h = await harness();
	const result = await h.stream().result();
	assert.equal(result.model, "gpt-6-astra");
	assert.equal(requests.length, 1, "no SDK retry delays");
	assert.equal(h.calls[0].options.reasoning, "xhigh");
	assert.equal(h.entries[0].data.source, "fallback");
	assert.doesNotMatch(JSON.stringify(h.notices), /PRIVATE SERVER BODY/);
	await h.stream().result();
	assert.equal(requests.length, 1, "fallback is also pinned");

	const single = await harness({ refs: [FAST] });
	await single.stream().result();
	assert.equal(single.calls[0].model.id, "gpt-5.6-luna");
	assert.equal(requests.length, 1, "one candidate needs no evaluator");
	const none = await harness({ refs: [] });
	assert.equal((await none.stream().result()).stopReason, "error");
	assert.equal(none.calls.length, 0);
});

test("missing key, invalid choice, image-only and oversized prompts use the configured fallback", async (t) => {
	const requests = mockGateway(t, () => "openai/unapproved-paid-model");
	const invalid = await harness();
	assert.equal((await invalid.stream().result()).model, "gpt-6-astra");
	const missing = await harness({ gatewayKey: false });
	assert.equal((await missing.stream().result()).model, "gpt-6-astra");
	assert.equal(requests.length, 1);
	assert.equal((await missing.stream(context("x".repeat(16001), 2)).result()).model, "gpt-6-astra");
	const imageInput = context();
	imageInput.messages = [{ role: "user", content: [{ type: "image", data: "PRIVATE BASE64", mimeType: "image/png" }], timestamp: 3 }];
	assert.equal((await missing.stream(imageInput).result()).model, "gpt-6-astra");
	assert.equal(requests.length, 1);
});

test("cancellation during evaluation or auth never falls through to inference or retains a cancelled choice", async (t) => {
	const started = Promise.withResolvers();
	let hanging = true;
	const requests = mockGateway(t, (options) => hanging ? new Promise((_, reject) => {
		started.resolve();
		options.signal.addEventListener("abort", () => reject(options.signal.reason), { once: true });
	}) : FAST);
	const h = await harness();
	const controller = new AbortController();
	const pending = h.stream(context(), { signal: controller.signal }).result();
	await started.promise;
	controller.abort();
	assert.equal((await pending).stopReason, "aborted");
	assert.equal(h.calls.length, 0);
	assert.equal(h.entries.length, 0);
	hanging = false;
	assert.equal((await h.stream().result()).model, "gpt-5.6-luna");
	assert.equal(requests.length, 2, "a cancelled evaluation must not pin a choice");

	const authStarted = Promise.withResolvers();
	const auth = await harness({ refs: [FAST], auth: () => { authStarted.resolve(); return new Promise(() => {}); } });
	const authController = new AbortController();
	const authPending = auth.stream(context(), { signal: authController.signal }).result();
	await authStarted.promise;
	authController.abort();
	assert.equal((await authPending).stopReason, "aborted");
	assert.equal(auth.calls.length, 0);
	assert.equal(auth.entries.filter((entry) => entry.name === "jev-pin").length, 0, "auth cancellation must not persist a pin");
	assert.equal((await h.stream(context(), { signal: AbortSignal.abort() }).result()).stopReason, "aborted");
});

test("evaluation timeouts fall back, while authentication failures expose only the HTTP status", async (t) => {
	const originalTimeout = AbortSignal.timeout;
	t.mock.method(AbortSignal, "timeout", (ms) => {
		assert.equal(ms, 5000);
		return originalTimeout(10);
	});
	let rejectAuth = false;
	mockGateway(t, (options) => rejectAuth ? Response.json({ error: "SECRET ERROR BODY" }, { status: 401 }) : delay(1000, FAST, { signal: options.signal }));
	const h = await harness();
	assert.equal((await h.stream().result()).model, "gpt-6-astra");
	assert.equal(h.entries[0].data.reason, "Jev timed out");
	rejectAuth = true;
	assert.equal((await h.stream(context("Next", 2)).result()).model, "gpt-6-astra");
	assert.match(h.entries.findLast((entry) => entry.name === "jev-monitor").data.reason, /credentials \(401\)/);
	assert.equal(h.entries.filter((entry) => entry.name === "jev-pin").length, 1);
	assert.equal(h.entries.filter((entry) => entry.name === "jev-suggestion").length, 0);
	assert.doesNotMatch(JSON.stringify(h.notices), /SECRET ERROR BODY/);
});

test("a pinned text-only model cannot silently receive images from later tool results", async (t) => {
	mockGateway(t);
	const h = await harness();
	h.models[0].input = ["text"];
	await h.stream().result();
	const input = context();
	input.messages.push({ role: "toolResult", toolCallId: "image", toolName: "read", content: [{ type: "image", data: "image", mimeType: "image/png" }], timestamp: 2 });
	const result = await h.stream(input).result();
	assert.equal(result.stopReason, "error");
	assert.match(result.errorMessage, /pinned Jev route/);
	assert.equal(h.calls.length, 1);
});

test("backend errors are forwarded without switching models; incomplete streams fail instead of hanging", async (t) => {
	mockGateway(t);
	const h = await harness({ backendError: true });
	const result = await h.stream().result();
	assert.equal(result.errorMessage, "Backend failure");
	assert.equal(result.model, "gpt-5.6-luna");
	assert.equal(h.calls.length, 1);
	const broken = await harness({ incomplete: true });
	assert.match((await broken.stream().result()).errorMessage, /without a terminal event/);
	const expired = await harness({ auth: async () => ({ ok: false, error: "PRIVATE AUTH DETAILS" }) });
	assert.match((await expired.stream().result()).errorMessage, /Authentication failed/);
	assert.equal(expired.calls.length, 0);
});

test("loads global jevRouter settings without merging default routes, and reloads changes", async (t) => {
	t.after(() => rmSync(settingsPath, { force: true }));
	const custom = { options: { [FAST]: { description: "Custom route", thinking: "low" } }, fallback: FAST, timeoutMs: 1000 };
	const original = "\uFEFF" + JSON.stringify({ theme: "dark", jevRouter: custom });
	writeFileSync(settingsPath, original);
	const h = await harness();
	assert.equal((await h.stream().result()).model, "gpt-5.6-luna");
	assert.equal(h.calls[0].options.reasoning, "low");
	await h.commands.get("jev").handler("", h.ctx);
	assert.ok(h.notices.at(-1)[0].includes(`Config: ${settingsPath} (jevRouter)`));
	assert.ok(h.notices.at(-1)[0].includes(`Edit jevRouter in ${settingsPath}, then /reload.`));
	assert.ok(!h.notices.at(-1)[0].includes(DEEP));
	assert.equal(readFileSync(settingsPath, "utf8"), original, "loading must not rewrite unrelated settings");

	writeFileSync(settingsPath, JSON.stringify({ jevRouter: { options: { [DEEP]: { description: "Changed route" } }, fallback: DEEP } }));
	const reloaded = await harness();
	assert.equal((await reloaded.stream().result()).model, "gpt-6-astra");
	writeFileSync(settingsPath, JSON.stringify({ theme: "dark" }));
	const defaults = await harness({ refs: [FAST] });
	assert.equal((await defaults.stream().result()).model, "gpt-5.6-luna");
	assert.equal(defaults.calls[0].options.reasoning, "max");
});

test("invalid global settings fail instead of using other routes or exposing JSON contents", async (t) => {
	t.after(() => rmSync(settingsPath, { recursive: true, force: true }));
	for (const value of [null, [], { jevRouter: null }, { jevRouter: {} }, { jevRouter: { options: {}, fallback: FAST } }]) {
		writeFileSync(settingsPath, JSON.stringify(value));
		await assert.rejects(harness(), /Expected a JSON object|Jev configuration requires|Jev fallback/);
	}
	writeFileSync(settingsPath, '{"privateKey":"DO_NOT_EXPOSE", BROKEN');
	await assert.rejects(harness(), (error) => {
		assert.equal(error.message, `Invalid JSON in ${settingsPath}.`);
		assert.doesNotMatch(error.message, /DO_NOT_EXPOSE|BROKEN/);
		return true;
	});
});

test("validates config and bounds routing text without sending thinking, tools, images or the system prompt", () => {
	for (const config of [null, {}, { options: {}, fallback: FAST }, { options: { "auto/jev": { description: "loop" } }, fallback: "auto/jev" }, { options: { [FAST]: { description: "fast", thinking: "nonsense" } }, fallback: FAST }]) {
		assert.throws(() => parseConfig(config));
	}
	assert.throws(() => parseConfig({ options: { [FAST]: { description: "fast" } }, fallback: FAST, timeoutMs: Infinity }));
	for (const monitor of [null, "false", 0, {}]) {
		assert.throws(() => parseConfig({ options: { [FAST]: { description: "fast" } }, fallback: FAST, monitor }), /monitor must be a boolean/);
	}
	for (const thinking of [null, [], {}, { low: "" }, { low: 1 }, { turbo: "Fast" }]) {
		assert.throws(() => parseConfig({ options: { [FAST]: { description: "fast", thinking } }, fallback: FAST }));
	}
	for (const thinking of ["auto", "off", { low: "Simple", high: "Complex" }]) {
		assert.deepEqual(parseConfig({ options: { [FAST]: { description: "fast", thinking } }, fallback: FAST }).options[FAST].thinking, thinking);
	}
	const input = context("latest", 100);
	input.messages.unshift(...Array.from({ length: 20 }, (_, i) => user(`earlier ${i}`, i)));
	assert.equal(routingInput(input).messages.length, 8);
	const rich = context();
	rich.messages.unshift({ role: "assistant", content: [{ type: "thinking", thinking: "PRIVATE REASONING" }, { type: "text", text: "Previous answer" }], timestamp: 0 });
	assert.deepEqual(routingInput(rich).messages, [{ role: "assistant", text: "Previous answer" }, { role: "user", text: "Fix a typo" }]);
	assert.equal(routingInput(context("x".repeat(16001))).messages, undefined);
});
