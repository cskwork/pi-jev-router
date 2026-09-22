# Pi router Jev

[한국어](README.md) · English · [Browser-language docs](https://cskwork.github.io/pi-jev-router/)

Let [TypeSafe's Jev](https://vercel.com/ai-gateway/models/jev) choose a model and reasoning effort for [Pi](https://pi.dev). The model stays fixed for the session unless you enable the usage-limit fallback below. Effort stays fixed too, unless you enable adaptive effort for Codex Astra. Generation uses your existing Pi providers and credentials, including Claude Opus, Fable, and Sonnet, plus Codex Luna, Terra, and Sol.

## Get started

Requires Pi **0.85.1+** and Node.js **22.19+**. Use a TypeSafe key, a Vercel AI Gateway key, or the optional local Laya service.

```sh
pi install npm:pi-router-jev
```

Git installation: `pi install git:github.com/cskwork/pi-jev-router`. Keep one installation. This fork of [mejiasd3v/pi-jev-router](https://github.com/mejiasd3v/pi-jev-router) is published as `pi-router-jev`; the npm package `pi-jev-router` remains the upstream project.

1. Use `/login` for your generation provider. For Jev, set a TypeSafe key as described below, or use `/login vercel-ai-gateway` / `AI_GATEWAY_API_KEY`.
2. Run `/reload`, then `/model auto/jev`. To start every new session on the router, set `"defaultProvider": "auto"` and `"defaultModel": "jev"` in global settings, or press Ctrl+S on `auto/jev` in `/model`.
3. Start with your actual task. `/jev` shows the pin, selected effort, and fork suggestions.

## Classifier and API keys

Jev is the default classifier. The selection order is `TYPESAFE_API_KEY`, `TYPESAFE_AI_API_KEY` (the AI SDK alias), `jevRouter.typesafeApiKey`, then the Pi Gateway credential. When **no cloud key is configured**, the router tries local Laya. An invalid configured key does not silently switch evaluators; the error is reported and the generation fallback is used.

```sh
export TYPESAFE_API_KEY='your-key'
pi
```

Alternatively, add `"typesafeApiKey": "your-key"` under global `jevRouter`, then `/reload`. Use a private settings file; never commit keys. Keys are not included in `/jev`, session routing records, or generation-provider requests. An environment key takes precedence over the setting. Changing a shell environment variable requires restarting Pi from that shell.

Direct calls use the [official AI SDK TypeSafe provider](https://ai-sdk.dev/providers/ai-sdk-providers/typesafe-ai), `jev-latest`, and [TypeSafe's API](https://docs.typesafe.ai/api). Model routing, opt-in skill selection, and adaptive effort use the same evaluator. `/jev` shows which evaluator is selected. Direct and local calls show token usage without applying Gateway cost estimates.

### Local multilingual Laya

Set `"classifier": "local"` to explicitly use local inference even when keys exist. Keep `"classifier": "jev"` for Jev-first behavior. The local URL defaults to `http://127.0.0.1:8765/v1`; `localUrl` accepts loopback HTTP addresses only. Cloud credentials are never forwarded to this service, and redirects are refused.

From a Git checkout of this repository:

```sh
python3 -m venv .venv-laya
.venv-laya/bin/pip install 'laya==0.3.5'
.venv-laya/bin/python scripts/laya-server.py
```

Leave that terminal open. First startup downloads the checkpoint from Hugging Face. The service binds to `127.0.0.1:8765` and loads `convaiinnovations/laya`'s **multilingual** subfolder on CPU before accepting requests. The same model handles Korean, English, and other supported languages. `/health` reports readiness. Stop with Ctrl+C. The extension does not install Python, download weights, or launch a daemon automatically. The npm tarball also includes the server script.

[Laya](https://github.com/NandhaKishorM/laya) has a much shorter context than Jev. The bridge rejects state that exceeds the checkpoint's token budget and limits questions/choices to 20. Laya internally bounds question and option descriptions; it is not equivalent to Jev for long or ambiguous tasks. A rejected request or stopped server uses the configured generation fallback with a warning. No cloud request is made in explicit local mode. Routing decisions are heuristics, not QA results or permission to act.

## Configure

Merge `jevRouter` into **global** `~/.pi/agent/settings.json`, then `/reload`:

```json
{
  "jevRouter": {
    "options": {
      "openai-codex/gpt-5.6-luna": {
        "description": "Small fixes, tests, and routine implementation.",
        "thinking": "auto"
      },
      "openai-codex/gpt-6-astra": {
        "description": "Architecture, difficult debugging, and complex reasoning.",
        "thinking": "auto"
      }
    },
    "fallback": "openai-codex/gpt-6-astra",
    "timeoutMs": 5000,
    "monitor": true,
    "skills": false
  }
}
```

Only listed, authenticated models are eligible; `fallback` and `rateLimitFallback` must be listed and authenticated too. Unauthenticated models are dropped silently, so check the live candidates with `/jev`. Routes replace the default list; they aren't merged. `PI_CODING_AGENT_DIR` is respected; project settings cannot override routing.

Without configuration, the web-development preset below is used: Jev-first classification, Claude models with Opus at high effort and the rest at medium, Sonnet fallback, Sol usage-limit fallback, a five-second timeout, and monitoring/skill selection off. The custom example above replaces that preset with Codex routes and automatic effort.

Descriptions accept either a nonempty string or a structured rubric with `role`, `use_when`, `not_for`, and `boundary`. The role and boundary must be nonempty strings; both lists must contain nonempty strings. Structured rubrics are passed intact as each Choice option's `task`, including during monitoring. Jev chooses the model by task fit first, then the lowest sufficient effort within that model. High effort never expands a model's scope, and a lower effort label on another model is not a reason to prefer it.

### Web development with Claude, Codex, and SDLC Kit

Merge [examples/web-development.json](examples/web-development.json) into your global settings. It uses existing Pi providers, with `high` thinking for Opus and Astra and `medium` for the other routes:

| Model | Task description offered to Jev |
| --- | --- |
| `anthropic/claude-sonnet-5` | Exploration, documentation, small fixes, established tests and browser QA scenarios. |
| `anthropic/claude-fable-5-1` | Web features, UI/API integration, regression tests, and planned multi-file changes. |
| `anthropic/claude-opus-5` | Architecture, difficult debugging, security, adversarial review, and conflicting verification evidence. |
| `openai-codex/gpt-5.6-luna` | Narrow exploration, mechanical edits, and small tests. |
| `openai-codex/gpt-5.6-terra` | Planned web features, localized fixes, and regression coverage. |
| `openai-codex/gpt-5.6-sol` | Multi-component implementation, debugging, review, and interpreting QA evidence. |
| `openai-codex/gpt-6-astra` | Architecture and planning: system design, implementation plans, ambiguous requirements, and difficult debugging on the OpenAI side. |
| `zai/glm-5.3` | General development, documentation, and verification with clear requirements when zai is authenticated. |

These are editable task descriptions, not model benchmarks or guaranteed classifications. Use exact model IDs available in your Pi `/model` picker. Only authenticated models are offered. Choose another allowed fallback if you do not use Z.ai.

The preset defaults to `"provider": "anthropic"`. Change just this field to `"provider": "openai"` to select from the configured `openai-codex` models. Run `/reload`, then start a new session. Existing pins remain unchanged. Omit `provider` to let Jev choose across all configured providers, as in upstream. `/jev` shows the selected family.

If neither Jev nor the local classifier can evaluate the task, the router uses `fallback` if it belongs to the selected family; otherwise it uses the first eligible model in that family's **configured option order**. In this preset that means Sonnet for Claude and Sol for OpenAI. Models without authentication or compatible input/thinking are excluded. If the selected family has no eligible model, the request fails explicitly. The separate `rateLimitFallback` may cross provider families.

Select `/model auto/jev` to use the router. The preset disables monitoring and automatic skill loading to avoid extra evaluations. New sessions choose a model for their first task; later tasks remain on that pin. Start a new session or explicitly choose a model when changing stages.

SDLC Kit continues to own its stages, approvals, and verification evidence. The router does not run tests, declare QA successful, dispatch subagents, or approve gates. Invoke your SDLC skills normally. Subagents that select a concrete model keep their own settings; this preset does not override them.

### Usage-limit fallback (opt-in)

Set `"rateLimitFallback": "zai/glm-5.3"` inside `jevRouter`, with that model also listed in `options`. This is separate from `fallback`, which handles Jev classification failures. Without this setting, backend errors behave as before.

For a main request, a provider-reported rate or usage-limit error before any text, reasoning, or tool output triggers **one** attempt on the configured model. This includes HTTP 429 and Anthropic's `out of extra usage` error. The router uses the fallback's own authentication and supported thinking policy, and reports the switch. A successful response pins the fallback for the rest of the session, including reload/resume. A failed attempt keeps the original pin and returns the failure.

There is no fallback after partial output, on cancellation, for auxiliary requests, or for unrelated errors such as authentication failures. Unavailable models, incompatible image inputs, and unsupported thinking policies are not retried. The complete original context is forwarded without truncation; a smaller model may reject a long conversation. Provider or Pi retries remain separate from this single router fallback. Use a different provider when models share the same exhausted quota. A switch can lose prompt-cache savings.

### Thinking

| `thinking` | Behavior |
| --- | --- |
| `"auto"` | Jev chooses the lowest effort it judges sufficient. |
| `"high"` | Force a level, clamped to the model's capabilities. |
| `{"low": "Small changes", "high": "Hard problems"}` | Customize the allowed choices and their descriptions. |
| Omitted | Inherit Pi's thinking level when the pin is created. |

Levels: `off`, `minimal`, `low`, `medium`, `high`, `xhigh`, `max`. Automatic choices are filtered to supported levels. Model and effort are chosen in one evaluation: task fit determines the model first, then Jev selects the lowest sufficient allowed effort within that model. Effort labels are model-relative; another model's lower label does not make it a better fit. A configured floor can intentionally exceed what a routine task needs.

Set `jevRouter.minThinking` for a global floor, and `minThinking` inside a model's option for a stricter per-model floor. For example, global `"medium"` plus Luna `"high"` lets Jev choose medium or higher for Astra and high or higher for Luna when both use `"thinking": "auto"`. An omitted model minimum inherits the global floor. Only `openai-codex/gpt-6-astra` can override it: an explicit Astra `"minThinking": "low"` permits low effort even with global `"medium"`, for both initial routing and adaptive effort. Other models can only raise the global floor. Both fields are optional and default to no additional restriction.

Automatic and custom choices below the floor are excluded. Fixed or inherited effort below the floor is raised to the lowest supported level meeting it. Routes with no eligible level are excluded, including non-reasoning models when the floor is above `off`; fallback errors if it has no eligible choice. `/jev` shows configured minimums. Reload after editing; existing session pins keep their original effort.

### Adaptive Astra effort (opt-in)

Set `"adaptiveThinking": true` inside the `openai-codex/gpt-6-astra` option, alongside `"thinking": "auto"` or custom thinking choices. Other models and fixed/inherited effort policies do not accept this flag.

```json
"openai-codex/gpt-6-astra": {
  "description": "Architecture and difficult debugging.",
  "thinking": "auto",
  "adaptiveThinking": true
}
```

After the initial route, Jev assesses the next step before each main model request, including tool continuations. It can raise effort for unresolved failures or difficult decisions and lower it for routine work. It chooses only supported levels allowed by your choices and minimums. This is a heuristic, not a guarantee that Jev detects every stall. Changes take effect between responses, never inside a running response.

- **Keep the model and request prefix.** The original request-level effort stays fixed. Changes use Astra's append-only `configuration_update` items, replayed at their original input positions. This follows [OpenAI's cache-preserving mechanism](https://developers.openai.com/api/docs/guides/reasoning#change-reasoning-mid-conversation); normal cache requirements still apply. Do not use provider-side automatic compaction, automatic truncation, or another hook that inserts configuration updates.
- **Persist and recover.** Decisions follow the active branch across reload/resume. If local Pi compaction or edited history invalidates an update's original prefix, the current effort is re-established on the rebuilt input. Forks choose afresh. Auxiliary requests reuse effort without evaluating or saving changes.
- **Bound overhead.** At most one additional evaluation per distinct request context, bounded by `timeoutMs`, with no retries and a 28,000-byte request budget. Failure retains current effort; cancellation stops the request. `monitor: false` disables model-switch suggestions, not adaptive effort.
- **See changes.** Notifications, the status line, and `/jev` show current effort. `/jev` also shows the initial effort used at request level. Pi's thinking picker still does not control or track the router's effort.

Reload after changing the flag. Enabling it can adapt an existing Astra pin on its next request. Disabling it stops new decisions but preserves and replays prior updates; use a new session for a fresh pin.

**Additional data and cost:** effort checks send the latest user-text excerpt plus up to eight recent user, assistant, and tool-result excerpts to the selected evaluator. Each excerpt keeps up to 1,600 characters, split between its beginning and end. Tool names and error flags are included; tool-call arguments, reasoning blocks, images, and system messages are excluded. Tool-result text can contain secrets and is not redacted. These evaluations are billed separately and are not included in `/jev` routing-cost estimates.

### Automatic skill loading (opt-in)

Set `"skills": true` inside your existing global `jevRouter` configuration, then `/reload`. It defaults to `false` and works with both `auto/jev` and concrete models, independently of `monitor`.

Before generation for each new user turn, including steering messages, Jev checks Pi's discovered skill names and descriptions against recent user/assistant text. It loads up to **three** matches with a returned probability of at least **0.8**. These probabilities are heuristic relevance signals, not guarantees.

- Uses Pi's catalog, including its trust and discovery settings. Skills marked `disable-model-invocation` are never auto-loaded.
- Injects full skill instructions with their source path and reference directory. It does not execute scripts or eagerly load linked references.
- Skips skills already included as `<skill>` blocks or successfully loaded through a complete `read` call in the current context. Path aliases are canonicalized. Arbitrary shell commands or unmarked pasted instructions cannot reliably be recognized as skill loads.
- Saves selections and instructions on the active session branch. Tool continuations and `/reload` reuse them without another evaluation or file read. Skills removed by compaction or branch navigation can be selected again when needed.
- Makes at most one additional evaluation per user turn, bounded by `timeoutMs` with no retries and the same **28,000-byte** request budget. Older history is dropped first; oversized tasks/catalogs skip selection rather than using a partial task. Full injected instructions are limited to **50,000 bytes** per turn; unreadable or oversized skills are skipped with a warning.

`/jev` shows whether this feature is enabled. Failures leave ordinary skill loading available. Turning it off stops selection and reinjection; it does not erase instructions the model already read or remove saved session records.

### Long prompts

The latest task takes priority; older history is dropped before splitting it. Requests have a **28,000-byte serialized UTF-8 budget**, including route descriptions. This is a conservative proxy for Jev's [roughly 32K-token request budget](https://docs.typesafe.ai/primitives#ask-speculative-questions), not an exact token count.

Tasks that don't fit are split into at most **eight overlapping chunks**, evaluated **two at a time**, then combined in one final evaluation. The final evaluation is instructed to weigh requirements, not vote counts. This is still a heuristic: relationships across sections may be missed.

Tasks over **192,000 UTF-8 bytes**, excessive chunk plans, or incomplete evaluations use fallback (or retain the existing pin during monitoring). The coding model always receives the original input; its context limits still apply.

## Session behavior

- **Pin once.** The model and initial effort survive tool calls, compaction, `/reload`, and `/resume`. Effort remains fixed unless adaptive Astra effort is enabled. `/new`, `/fork`, and `/clone` choose afresh. Model and initial-effort configuration changes don't rewrite existing pins. A successful opt-in usage-limit fallback creates a replacement pin.
- **Suggest, never switch.** Monitoring checks new user text and may suggest a fork with another model, once per alternative per session. Use `/fork`, then `/model` and `/thinking` in the fork to follow it. No automatic forks or task-driven model switches. The opt-in usage-limit fallback is the only automatic model switch.
- **Control overhead.** Routing and model-monitor evaluation timeouts retry up to three attempts of `timeoutMs` each (1 to 60,000 ms). The entire operation shares a ceiling of **3 × `timeoutMs`**, including chunks and combination: 15 seconds by default. Set `"monitor": false` to disable model-switch advisory checks; tool continuations don't trigger those checks. Adaptive effort has its own per-request check described above.
- **Fail explicitly.** Initial routing failures use the fallback, with its fixed/inherited effort or highest supported automatic choice. If an existing pin becomes unavailable or cannot accept the input, the router errors instead of switching.

Context limits follow the pinned backend. The status and `/jev` show its current effort; Pi's thinking picker does not track automatic choices. Selecting a concrete model bypasses model routing, but not opt-in skill selection. Deferred/background generation is unsupported by `auto/jev`.

## Privacy and cost

Routing and monitoring consider up to **eight recent user/assistant text messages**, limited to **192,000 UTF-8 bytes of source text**. Evaluations send selected text, route/effort descriptions, and chunk assessments to the selected evaluator. Overlaps, excerpts, and retries can send the same text more than once. System prompts, reasoning blocks, tool-result blocks, images, and provider credentials are excluded from model-routing evaluations. Opt-in adaptive effort additionally sends tool-result excerpts as described above. **Conversation text is not redacted and may contain secrets.**

Opt-in skill selection additionally sends eligible skill names and descriptions to the selected evaluator. Skill file contents are read locally and stored in the session; automatically injected skill messages are excluded from subsequent Jev evaluations. Manually pasted or expanded skill instructions in user messages remain conversation text.

Cloud evaluations are billed separately. Local Laya incurs local compute and model storage costs, without API charges. Chunking uses at most nine evaluations before timeout retries, or 27 attempts total. `/jev` estimates sum returned usage; failed, cancelled, or timed-out calls may still be billed. Skill-selection evaluations are additional and are not included in `/jev` routing estimates. Evaluation costs are not in Pi's footer totals. Pinning favors cache reuse but guarantees neither cache hits nor savings.

<details>
<summary>Migrating from file-based configuration</summary>

Move the old `routes.json` contents under `jevRouter` and unset `JEV_ROUTES_FILE`; neither is read anymore. Sessions created before pinning was introduced select a pin on their next main request.

</details>

## Development

```sh
nub install --frozen-lockfile --ignore-scripts
nub run test
nub run docs
```

Tests mock network responses; no API keys or paid requests are needed.

## Publishing this fork

`.github/workflows/publish.yml` publishes stable GitHub releases to npm using [trusted publishing](https://docs.npmjs.com/trusted-publishers/). It checks that the release tag matches `package.json`, installs from the frozen lockfile, and runs tests before publishing. Prereleases are skipped. The publish step uses npm's native OIDC flow; installs and tests use Nub.

Publish only `pi-router-jev`. The upstream package name belongs to its maintainer. Pi's [official package catalog](https://pi.dev/packages) discovers public npm packages carrying `pi-package`; catalog indexing may lag npm publication.

```sh
npm test
npm pack --dry-run
npm login
npm publish --access public
```

The release workflow uses npm trusted publishing. Configure a trusted publisher for `cskwork/pi-jev-router`, workflow `publish.yml`, in this package's npm settings before using GitHub releases to publish. A Git push alone does not publish npm. The documentation site is served from `docs/` with GitHub Pages; its initial language follows the first Korean or English browser preference, with Korean as the fallback. The language links override detection.

## Troubleshooting

| Message | Meaning and next action |
| --- | --- |
| `Jev [runtime]` / `Cannot find module .../dist/bundle/chunks/...` | Pi cannot load a provider module, often after updating a running Pi process. Exit and restart Pi, then resume the session. If it persists, reinstall Pi. This is not an API-key or quota error. |
| `Jev [auth]` | Generation credentials or model permissions failed. Use the named provider's `/login`. No model retry occurs for authentication errors. |
| `Jev [usage-limit]` | Provider quota or rate limit. A configured eligible `rateLimitFallback` is tried once before any output; otherwise wait or choose a model. |
| `TypeSafe rejected credentials (401)` | Replace the TypeSafe key, then reload or restart depending on where it is configured. |
| Claude routes hang at 100% CPU with no output | Not the router. `pi-background-tasks` 2.6.2's `attribution` feature replaces the Anthropic provider and loops forever on the system messages Pi 0.86+ keeps in the transcript. Export `PI_BG_FEATURES=process,delegate,fusion,attested` before starting Pi. Selecting a concrete Anthropic model reproduces it without the router. |
| Local connection/timeout or HTTP 413 | Start the Laya bridge, wait for readiness, or use Jev for a longer task. The generation fallback remains available. |

`fallback` handles classifier failures; `rateLimitFallback` handles generation usage limits. Selecting a concrete model bypasses the router. Keep `/model auto/jev` selected to use its behavior.

[MIT](LICENSE). Original router by MejiasDev; this fork adds provider selection, direct TypeSafe, local Laya, and usage-limit recovery.
