import assert from "node:assert/strict";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { createRequire } from "node:module";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import test from "node:test";

// Match Pi's extension loader: the pi-ai root resolves to its compatibility API.
const piRequire = createRequire(import.meta.resolve("@earendil-works/pi-coding-agent"));
const piAi = piRequire.resolve.paths("@earendil-works/pi-ai")
	.map((path) => join(path, "@earendil-works/pi-ai/dist/compat.js")).find(existsSync);
assert.ok(piAi, "Pi's installed pi-ai package must be available");
const { createJiti } = piRequire("jiti");
const jiti = createJiti(import.meta.url, { alias: { "@earendil-works/pi-ai": piAi } });
const { default: extension, parseConfig, routingInput } = await jiti.import("./index.ts");
const { createAssistantMessageEventStream } = await import(pathToFileURL(piAi));
// Developer-specific routes must not change the test fixtures.
delete process.env.JEV_ROUTES_FILE;
const FAST = "openai-codex/gpt-5.6-luna";
const DEEP = "openai-codex/gpt-6-astra";
const usage = { input: 100, output: 10, cacheRead: 50, cacheWrite: 0, totalTokens: 160, cost: { input: 1, output: 2, cacheRead: 3, cacheWrite: 0, total: 6 } };
const user = (text, timestamp = 1) => ({ role: "user", content: text, timestamp });
const context = (text = "Fix a typo", timestamp = 1) => ({ systemPrompt: "PRIVATE SYSTEM INSTRUCTIONS", tools: [], messages: [user(text, timestamp)] });

async function harness({ refs = [FAST, DEEP], gatewayKey = true, backendError = false, incomplete = false, auth } = {}) {
	const handlers = new Map();
	const commands = new Map();
	const calls = [], entries = [], notices = [];
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
	const ctx = { modelRegistry: registry, sessionManager: { getSessionId: () => "main" }, ui: { setStatus() {}, notify: (...args) => notices.push(args) } };
	const pi = {
		registerProvider(provider, value) { assert.equal(provider, "auto"); registration = value; },
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
		stream: (input = context(), options = {}) => registration.streamSimple(ctx.model, input, { sessionId: "main", apiKey: "router-key", headers: { Authorization: "router-secret" }, env: { ROUTER_SECRET: "private" }, ...options }),
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
		return Response.json({ answers: { route: { type: "choice", choice: result } }, usage: { inputTokens: 1000, outputTokens: 0 } });
	};
	t.after(() => { globalThis.fetch = previous; });
	return requests;
}

test("routes once per user prompt, forwards tools/auth/hooks/usage, and preserves actual model identity", async (t) => {
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
	assert.deepEqual(Object.keys(requests[0].questions.route.criteria), [FAST, DEEP]);
	assert.doesNotMatch(JSON.stringify(requests), /PRIVATE|codex-test-key|router-secret/);
	assert.equal(h.entries[0].data.inputTokens, 1000);
	assert.equal(h.entries[0].data.estimatedCost, 0.000042);

	await h.stream({ ...input, messages: [...input.messages, first.message] }).result();
	assert.equal(requests.length, 1, "tool continuation must keep its route");
	await h.stream(context("Fix a typo", 3)).result();
	assert.equal(requests.length, 2, "a new user message must route again");
	await h.stream(context("Summarize", 4), { sessionId: "compaction" }).result();
	assert.equal(requests.length, 2, "auxiliary calls must not expose synthetic prompts to Jev");
	assert.equal(h.calls.at(-1).model.id, "gpt-6-astra");
	await h.stream(context("Fix a typo", 3)).result();
	assert.equal(requests.length, 2, "compaction must not replace the main route");
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
	assert.match(h.entries[1].data.reason, /credentials \(401\)/);
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

test("external route files survive package updates and /jev shows the loaded path", async (t) => {
	const directory = mkdtempSync(join(tmpdir(), "jev-routes-"));
	t.after(() => { delete process.env.JEV_ROUTES_FILE; rmSync(directory, { recursive: true, force: true }); });
	const path = join(directory, "routes.json");
	writeFileSync(path, JSON.stringify({ options: { [FAST]: { description: "Custom route", thinking: "low" } }, fallback: FAST }));
	process.env.JEV_ROUTES_FILE = path;
	const h = await harness();
	assert.equal((await h.stream().result()).model, "gpt-5.6-luna");
	assert.equal(h.calls[0].options.reasoning, "low");
	await h.commands.get("jev").handler("", h.ctx);
	assert.ok(h.notices.at(-1)[0].includes(`Edit ${path}, then /reload.`));
	assert.ok(!h.notices.at(-1)[0].includes(DEEP));
	writeFileSync(path, "{}");
	await assert.rejects(harness(), /requires options and a fallback/);
	process.env.JEV_ROUTES_FILE = join(directory, "missing.json");
	await assert.rejects(harness(), /ENOENT/);
});

test("validates config and bounds routing text without sending thinking, tools, images or the system prompt", () => {
	for (const config of [null, {}, { options: {}, fallback: FAST }, { options: { "auto/jev": { description: "loop" } }, fallback: "auto/jev" }, { options: { [FAST]: { description: "fast", thinking: "nonsense" } }, fallback: FAST }]) {
		assert.throws(() => parseConfig(config));
	}
	assert.throws(() => parseConfig({ options: { [FAST]: { description: "fast" } }, fallback: FAST, timeoutMs: Infinity }));
	const input = context("latest", 100);
	input.messages.unshift(...Array.from({ length: 20 }, (_, i) => user(`earlier ${i}`, i)));
	assert.equal(routingInput(input).messages.length, 8);
	const rich = context();
	rich.messages.unshift({ role: "assistant", content: [{ type: "thinking", thinking: "PRIVATE REASONING" }, { type: "text", text: "Previous answer" }], timestamp: 0 });
	assert.deepEqual(routingInput(rich).messages, [{ role: "assistant", text: "Previous answer" }, { role: "user", text: "Fix a typo" }]);
	assert.equal(routingInput(context("x".repeat(16001))).messages, undefined);
});
