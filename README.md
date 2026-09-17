# Jev model router for Pi

Select `auto/jev` to let TypeSafe's Jev choose a coding model and reasoning effort once, then pin both for the session. Optional monitoring suggests forks for tasks that may benefit from another model; it never switches the active model or effort. Jev runs through Vercel AI Gateway; the chosen model runs through your existing Pi provider and credentials. This extension does not send Codex credentials to Vercel or generate coding responses through Gateway.

## Install

Requires [Pi](https://pi.dev) 0.85.1 or later and Node.js 22.19 or later. Tested against Pi 0.85.1. Jev evaluation requires a Vercel AI Gateway key and is billed separately from your generation provider.

```sh
pi install git:github.com/mejiasd3v/pi-jev-router
```

If you already have a manually installed copy, disable or move that copy outside Pi's extension directories before installing the package. Load only one copy.

## Use

1. Authenticate your destination providers with `/login`. The default routes use OpenAI Codex; configure `jevRouter` in global `settings.json` if those model IDs are not available to your account.
2. Configure a valid Vercel AI Gateway API key using `/login vercel-ai-gateway`, or launch Pi with `AI_GATEWAY_API_KEY` set. Existing Pi Gateway credentials, including configured secret commands, are reused. Keep keys in Pi's credential storage, your environment, or a secret store, never in this repository or the `jevRouter` configuration.
3. Run `/reload`.
4. Run `/model auto/jev`.
5. Start with your actual task, not a greeting. Use `/jev` to inspect the pin, monitoring, and any fork suggestion.

The startup default and scoped models are unchanged. Selecting a concrete model bypasses the router. Returning to `auto/jev` resumes the existing session pin. If you want the router as your startup default, save it in Pi's model picker with Ctrl+S.

A configured key is not necessarily valid. A `401` fallback means Vercel rejected the resolved credential. Replace the key in its configured source or log in again. Fix the credentials, then start a new session or fork to get a fresh routing decision. An existing fallback pin is not silently replaced.

## Routes

Configure `jevRouter` in **global** `~/.pi/agent/settings.json`, then run `/reload`. Merge this key into your existing settings; keep your other settings unchanged:

```json
{
  "jevRouter": {
    "options": {
      "openai-codex/gpt-5.6-luna": {
        "description": "Routine implementation, small fixes, tests, and straightforward questions.",
        "thinking": "auto"
      },
      "openai-codex/gpt-6-astra": {
        "description": "Architecture, planning, code review, difficult debugging, and complex reasoning.",
        "thinking": "auto"
      }
    },
    "fallback": "openai-codex/gpt-6-astra",
    "timeoutMs": 5000,
    "monitor": true
  }
}
```

The extension respects `PI_CODING_AGENT_DIR` when locating global settings. Project `.pi/settings.json` cannot override routing. `/jev` shows the configuration source and the settings path to edit. Loading the extension never rewrites your settings.

When `jevRouter` is absent, built-in defaults retain fixed Luna `max` and Astra `xhigh` thinking, with Astra as fallback and a five-second evaluation timeout. The example above opts both models into automatic effort. A configured `jevRouter` replaces the defaults completely; routes are not merged. Invalid JSON or an invalid `jevRouter` prevents the extension from loading instead of silently choosing other routes.

Each option is a Pi `provider/model-id`, with a description for Jev and an optional `thinking` policy (see below). You can add other existing Pi providers here. Only authenticated, available, explicitly listed models are eligible. The fallback must also be listed. `timeoutMs` defaults to 5000 and must be an integer from 1 to 60000. Evaluation requests are not retried.

**Migrating from 0.1.0:** move the contents of your old `routes.json` into the `jevRouter` key and unset `JEV_ROUTES_FILE`. Neither the route file nor that environment variable is read anymore.

The router restores the pinned backend's context window and output limit on reload/resume. Before the first pin, it uses the smallest available limits. Once selected, the backend's limits are applied before generation and refreshed on subsequent main requests. Pi's context display and compaction checks use those limits. Suggestions never change them.

## Session pinning and monitoring

The first main request chooses the model and effort. The pin is saved after generation authentication succeeds, just before generation starts. It stays fixed across later user messages, tool loops, retries, compaction, cancellation, `/reload`, `/resume`, and `/tree` navigation.

- `/new`, `/fork`, and `/clone` create independent sessions with fresh routing decisions. Pins copied from the parent are ignored.
- Changing routing or thinking settings and running `/reload` affects future pins and monitoring, not the model/effort of an existing pin. Removing a pinned model from the allowlist, losing authentication, or losing support for its effort/input produces an error rather than an automatic switch.
- Existing sessions from the per-message routing implementation have no saved pin. Their next main request selects and saves one.

Monitoring is **on by default**. Set `"monitor": false` in `jevRouter` and `/reload` for just the initial routing evaluation and no later advisory evaluations.

When enabled, monitoring checks new user text before generation, including steering/follow-up messages. It offers the current pin as the preferred choice and asks Jev to suggest a different model only for a material benefit, accounting for possible loss of cache reuse. It does not reassess effort alone on the same model.

Checks use the same text limits, timeout, and no-retry policy as initial routing. They add evaluation cost and can delay generation by up to `timeoutMs`; they do not run on a timer or on every tool call. Monitoring errors are recorded and leave generation on the pin. User cancellation still aborts the request.

Each alternative model is suggested at most once per session, including across reloads. Already-suggested models are excluded from later checks, and checking stops when no unsuggested eligible alternatives remain. The suggestion appears as a notification and in `/jev`, never as text injected into the coding model's conversation. No fork is created automatically.

To follow a suggestion, use `/fork`, then `/model provider/model-id` and `/thinking level` in the fork. Selecting that concrete model bypasses Jev. The original session keeps its pin. Forking preserves conversation history, but does not transfer a provider cache to a different model.

Pinning favors cache reuse; it does not guarantee cache hits or lower cost. Cache expiration, compaction, prompt changes, and provider behavior still matter, and Jev's suggestions are heuristic rather than measured savings.

## Reasoning effort

Set `thinking` on each route in global `jevRouter.options`:

- `"auto"`: Jev chooses among the backend's supported effort levels, using built-in descriptions that favor the lowest sufficient effort.
- A fixed level, such as `"high"`: force that effort for the route. Jev can choose the model but cannot override this setting. Unsupported fixed levels are clamped by Pi to a supported level.
- An object of levels and descriptions: customize both the allowed efforts and when Jev should choose them. For example:

  ```json
  "thinking": {
    "low": "Small fixes, tests, and routine changes with clear requirements.",
    "high": "Difficult debugging, ambiguous requirements, and security-sensitive changes."
  }
  ```

- Omitted: inherit Pi's selected thinking level when creating the initial pin. Later `/thinking` changes do not alter an existing `auto/jev` pin.

Levels are `off`, `minimal`, `low`, `medium`, `high`, `xhigh`, and `max`. Automatic policies only offer levels supported by each backend. A custom policy with no supported levels makes that route ineligible; its restrictions are never silently ignored.

Jev selects a **model + effort pair in one evaluation request**, not a second network call. A single available model still needs evaluation if it has multiple effort choices. A single eligible pair needs no evaluation. Model and effort stay pinned for the session; later evaluations are advisory only. If the backend stops supporting the pinned effort, the router reports an error instead of silently changing it.

If initial evaluation fails, times out, or cannot run, the fallback route uses its fixed/inherited level or its **highest allowed, supported automatic level**. That choice becomes the session pin once generation starts. Auxiliary calls such as compaction use the pin; before a pin exists, they use fallback without creating a pin.

The router status and `/jev` show the pinned effort, stored in `jev-pin` session entries. Pi's own thinking selector remains the inherited setting, not the pinned effort. Change settings and `/reload` to force or customize effort for new sessions; there are no extra session override commands. Automatic effort selection is a heuristic, not a guarantee of lower cost or equal answer quality.

## Behavior

- Selects one model/effort pair per session. Monitoring may recommend a fork but cannot change that pair.
- Sends at most eight recent user/assistant text messages, totaling at most 16,000 characters, plus the eligible model IDs, effort levels, route/effort descriptions, and routing instructions to Jev. It does not include the system prompt, reasoning blocks, tool-result blocks, image data, destination-provider credentials, or model objects. User/assistant text can contain secrets, pasted files, or summaries of tool results; it is not redacted. Selecting `auto/jev` adds Vercel/TypeSafe as recipients of that text.
- Initial routing uses the configured fallback for missing/invalid Gateway credentials, evaluation errors/timeouts, oversized user text, and image-only requests. Fallback is reported in a notification and `/jev`. A single eligible model/effort pair needs no evaluation.
- Auxiliary requests do not trigger monitoring or replace a session pin.
- Does not switch models after a generation-provider error. Pi handles its usual retries. User cancellation never triggers fallback generation.
- Delegates to the registered Pi provider, preserving provider overrides, streaming events, tool calls, backend usage, and assistant-message model identity. Credentials are resolved for each generation request through Pi, including OAuth refresh.
- Keeps Pi's selected model and shell session metadata as `auto/jev`. Extensions that make decisions from `ctx.model` see the router, not the backend; provider-specific hooks that depend on that field may need adaptation.
- Does not support deferred/background generation. Select a concrete model for that mode.

Image-capable routes are selected when images are present in the initial request. If a text-only route was already pinned and a later user message or tool result contains an image, the router reports an error rather than silently discarding it or switching models.

## Usage accounting

Pi's normal usage totals retain the backend's reported usage. Jev's reported tokens, evaluation latency, and estimated input cost are stored in `jev-route` (initial selection) and `jev-monitor` (advisory checks) session entries. `/jev` shows the latest check since loading. Evaluation usage and costs are **not** added to Pi's footer totals. The estimate uses the current listed input price of $0.042 per million tokens. Failed or timed-out evaluations may still be billed and cannot be estimated from a missing response.

## Development

```sh
git clone https://github.com/mejiasd3v/pi-jev-router.git
cd pi-jev-router
nub install --frozen-lockfile --ignore-scripts
nub run test
```

[Nub](https://nubjs.com) uses the committed `lock.yaml`. Alternatively, `npm install --ignore-scripts` and `npm test` work, but npm does not use that lockfile.

Tests install their own pinned Pi development dependency and use the real AI SDK evaluation serialization with mocked network responses. No global Pi installation, API keys, or paid requests are needed. The AI SDK is pinned because evaluation is experimental. Runtime installations use the host Pi's core packages, not the development copy.

Try a checkout with `pi -e ./index.ts` after installing dependencies. Disable any other copy first. Contributions should include a focused test for behavior changes. Do not attach API keys or private session transcripts to issues.

## License

[MIT](LICENSE).

## References

Sources: [Eve autoModel](https://github.com/vercel/eve/blob/main/docs/guides/evaluate.md), [Vercel evaluation API](https://vercel.com/docs/ai-gateway/modalities/evaluation), [Jev pricing](https://vercel.com/ai-gateway/models/jev).
