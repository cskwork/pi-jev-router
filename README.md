<p align="center">
  <img src="https://raw.githubusercontent.com/mejiasd3v/pi-jev-router/main/assets/logo.png" alt="Jev Router logo" width="144" height="144">
</p>
<h1 align="center">Jev Router</h1>
<p align="center">Choose once. Stay pinned.</p>
<p align="center">
  <a href="https://www.npmjs.com/package/pi-jev-router"><img src="https://img.shields.io/npm/v/pi-jev-router?style=flat-square&amp;color=67e8b4&amp;logo=npm&amp;logoColor=white" alt="npm version"></a>
  <a href="https://github.com/mejiasd3v/pi-jev-router/actions/workflows/test.yml"><img src="https://img.shields.io/github/actions/workflow/status/mejiasd3v/pi-jev-router/test.yml?branch=main&amp;style=flat-square&amp;label=tests&amp;logo=github" alt="Tests"></a>
  <a href="https://github.com/mejiasd3v/pi-jev-router/blob/main/LICENSE"><img src="https://img.shields.io/github/license/mejiasd3v/pi-jev-router?style=flat-square&amp;color=8b9cff" alt="MIT license"></a>
  <a href="https://pi.dev"><img src="https://img.shields.io/badge/Pi-0.85.1%2B-f8b86d?style=flat-square" alt="Pi 0.85.1 or later"></a>
</p>

Let [TypeSafe's Jev](https://vercel.com/ai-gateway/models/jev) choose a model and reasoning effort for [Pi](https://pi.dev), then keep both fixed for the session. Generation uses your existing Pi providers and credentials.

## Get started

Requires Pi **0.85.1+**, Node.js **22.19+**, and a **Vercel AI Gateway key**.

```sh
pi install npm:pi-jev-router
```

Git also works: `pi install git:github.com/mejiasd3v/pi-jev-router`. Keep only one installation.

1. Use `/login` for your generation provider and `/login vercel-ai-gateway` for Jev. `AI_GATEWAY_API_KEY` also works.
2. Run `/reload`, then `/model auto/jev`.
3. Start with your actual task. `/jev` shows the pin, selected effort, and fork suggestions.

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
    "monitor": true
  }
}
```

Only listed, authenticated models are eligible; `fallback` must be listed too. Routes replace the default list; they aren't merged. `PI_CODING_AGENT_DIR` is respected; project settings cannot override routing.

Without configuration, defaults are Luna/`max`, Astra/`xhigh`, Astra fallback, a five-second timeout, and monitoring on. The example above enables automatic effort.

### Thinking

| `thinking` | Behavior |
| --- | --- |
| `"auto"` | Jev chooses the lowest effort it judges sufficient. |
| `"high"` | Force a level, clamped to the model's capabilities. |
| `{"low": "Small changes", "high": "Hard problems"}` | Customize the allowed choices and their descriptions. |
| Omitted | Inherit Pi's thinking level when the pin is created. |

Levels: `off`, `minimal`, `low`, `medium`, `high`, `xhigh`, `max`. Automatic choices are filtered to supported levels. Model and effort are chosen together, not in separate evaluations.

### Long prompts

The latest task takes priority; older history is dropped before splitting it. Requests have a **28,000-byte serialized UTF-8 budget**, including route descriptions. This is a conservative proxy for Jev's [roughly 32K-token request budget](https://docs.typesafe.ai/primitives#ask-speculative-questions), not an exact token count.

Tasks that don't fit are split into at most **eight overlapping chunks**, evaluated **two at a time**, then combined in one final evaluation. The final evaluation is instructed to weigh requirements, not vote counts. This is still a heuristic: relationships across sections may be missed.

Tasks over **192,000 UTF-8 bytes**, excessive chunk plans, or incomplete evaluations use fallback (or retain the existing pin during monitoring). The coding model always receives the original input; its context limits still apply.

## Session behavior

- **Pin once.** Model and effort survive tool calls, compaction, `/reload`, and `/resume`. `/new`, `/fork`, and `/clone` choose afresh. Configuration changes don't rewrite existing pins.
- **Suggest, never switch.** Monitoring checks new user text and may suggest a fork with another model, once per alternative per session. Use `/fork`, then `/model` and `/thinking` in the fork to follow it. No automatic forks or model switches.
- **Control overhead.** Evaluation timeouts retry up to three attempts of `timeoutMs` each (1 to 60,000 ms). The entire operation shares a ceiling of **3 × `timeoutMs`**, including chunks and combination: 15 seconds by default. Set `"monitor": false` to disable advisory checks; tool continuations don't trigger them.
- **Fail explicitly.** Initial routing failures use the fallback, with its fixed/inherited effort or highest supported automatic choice. If an existing pin becomes unavailable or cannot accept the input, the router errors instead of switching.

Context limits follow the pinned backend. The status and `/jev` show its effort; Pi's thinking picker does not track automatic choices. Selecting a concrete model bypasses Jev. Deferred/background generation is unsupported.

## Privacy and cost

Routing and monitoring consider up to **eight recent user/assistant text messages**, limited to **192,000 UTF-8 bytes of source text**. Evaluations send selected text, route/effort descriptions, and chunk assessments to Vercel/TypeSafe. Overlaps, excerpts, and retries can send the same text more than once. System prompts, reasoning blocks, tool-result blocks, images, and provider credentials are excluded. **Conversation text is not redacted and may contain secrets.**

Gateway evaluations are billed separately. Chunking uses at most nine evaluations before timeout retries, or 27 attempts total. `/jev` estimates sum returned usage; failed, cancelled, or timed-out calls may still be billed. Evaluation costs are not in Pi's footer totals. Pinning favors cache reuse but guarantees neither cache hits nor savings.

<details>
<summary>Migrating from file-based configuration</summary>

Move the old `routes.json` contents under `jevRouter` and unset `JEV_ROUTES_FILE`; neither is read anymore. Sessions created before pinning was introduced select a pin on their next main request.

</details>

## Development

```sh
nub install --frozen-lockfile --ignore-scripts
nub run test
```

Tests mock network responses; no API keys or paid requests are needed.

[MIT](LICENSE).
