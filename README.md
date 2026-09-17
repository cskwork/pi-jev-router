# Jev model router for Pi

Select `auto/jev` to let TypeSafe's Jev choose a coding model for each user message. Jev runs through Vercel AI Gateway; the chosen model runs through your existing Pi provider and credentials. This extension does not send Codex credentials to Vercel or generate coding responses through Gateway.

## Install

Requires [Pi](https://pi.dev) 0.85.1 or later and Node.js 22.19 or later. Tested against Pi 0.85.1. Jev evaluation requires a Vercel AI Gateway key and is billed separately from your generation provider.

```sh
pi install git:github.com/mejiasd3v/pi-jev-router
```

If you already have a manually installed copy, disable or move that copy outside Pi's extension directories before installing the package. Load only one copy.

## Use

1. Authenticate your destination providers with `/login`. The bundled routes use OpenAI Codex; change them if those model IDs are not available to your account.
2. Configure a valid Vercel AI Gateway API key using `/login vercel-ai-gateway`, or launch Pi with `AI_GATEWAY_API_KEY` set. Existing Pi Gateway credentials, including configured secret commands, are reused. Keep keys in Pi's credential storage, your environment, or a secret store, never in this repository or route files.
3. Run `/reload`.
4. Run `/model auto/jev`.
5. Use `/jev` to inspect the loaded configuration path, credential presence, and the last routing decision.

The startup default and scoped models are unchanged. Selecting another model disables routing for that model. If you want the router as your startup default, save it in Pi's model picker with Ctrl+S.

A configured key is not necessarily valid. A `401` fallback means Vercel rejected the resolved credential. Replace the key in its configured source or log in again. After fixing credentials, the next user message tries Jev again.

## Routes

The bundled [`routes.json`](routes.json) provides these defaults:

- `openai-codex/gpt-5.6-luna`, thinking `max`: routine work.
- `openai-codex/gpt-6-astra`, thinking `xhigh`: harder reasoning and engineering.
- Fallback: `openai-codex/gpt-6-astra`.
- Evaluation timeout: 5 seconds, with no evaluation retries.

Each option is a Pi `provider/model-id`, with a description for Jev and an optional `thinking` level. Omit `thinking` to use the router's selected thinking level, clamped to the destination model's capabilities. You can add other existing Pi providers here. Only authenticated, available, explicitly listed models are eligible. The fallback must also be listed.

To customize routes without losing edits during package updates, copy `routes.json` to a file outside the installed package, edit it, and set `JEV_ROUTES_FILE` before starting Pi:

```sh
JEV_ROUTES_FILE="$HOME/.pi/agent/jev-routes.json" pi
```

The file must already exist and contain the full configuration. Invalid or missing override files fail extension loading rather than silently using other routes. `/jev` shows the exact path in use. After editing the file, run `/reload`. Without `JEV_ROUTES_FILE`, the extension reads its bundled `routes.json`; direct edits there may be overwritten by package updates.

The router advertises the smallest context window and output limit among available routes at session startup/reload. It does not assume that models share limits. Reload after changing routes or provider catalogs.

## Behavior

- Classifies once per latest user message, including newly delivered steering/follow-up messages. Tool-loop continuations and retries retain that choice.
- Sends at most eight recent user/assistant text messages, totaling at most 16,000 characters, plus the eligible model IDs, route descriptions, and routing instructions to Jev. It does not include the system prompt, reasoning blocks, tool-result blocks, image data, destination-provider credentials, or model objects. User/assistant text can contain secrets, pasted files, or summaries of tool results; it is not redacted. Selecting `auto/jev` adds Vercel/TypeSafe as recipients of that text.
- Uses the configured fallback for missing/invalid Gateway credentials, evaluation errors/timeouts, oversized user text, and image-only requests. Fallback is visible in the status and a notification. If only one eligible route exists, uses it without calling Jev.
- Uses the fallback for auxiliary calls with a different request session ID, including Pi's normal compaction calls. These do not disturb the main turn's choice.
- Does not switch models after a generation-provider error. Pi handles its usual retries. User cancellation never triggers fallback generation.
- Delegates to the registered Pi provider, preserving provider overrides, streaming events, tool calls, backend usage, and assistant-message model identity. Credentials are resolved for each generation request through Pi, including OAuth refresh.
- Keeps Pi's selected model and shell session metadata as `auto/jev`. Extensions that make decisions from `ctx.model` see the router, not the backend; provider-specific hooks that depend on that field may need adaptation.
- Does not support deferred/background generation. Select a concrete model for that mode.

Image-capable routes are selected when images are present. If a text-only route was already pinned and a later tool returns an image, the router reports an error rather than silently discarding the image or switching models mid-turn.

## Usage accounting

Pi's normal usage totals retain the backend's reported usage. Jev's reported tokens, selection latency, and estimated input cost are stored in `jev-route` session entries and shown by `/jev`; they are **not** added to Pi's footer totals. The estimate uses the current listed input price of $0.042 per million tokens. Failed or timed-out evaluations may still be billed and cannot be estimated from a missing response.

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
