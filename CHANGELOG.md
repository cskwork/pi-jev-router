# 변경 기록 / Changelog

## 0.7.1 · 2026-09-22

- Vercel AI Gateway가 HTTP 403을 돌려주면 "결제 수단 없음 또는 키 권한 없음"이라는 조치 가능한 이유를 표시합니다. 응답 본문은 여전히 노출하지 않습니다.

Actionable reason for Vercel AI Gateway HTTP 403 (no payment method or no
gateway access) without exposing the response body.

## 0.7.0 · 2026-09-22

- 분류기 지시문을 절반 길이로 줄였습니다. 규칙은 같습니다: 작업 적합성으로 모델을 먼저 고르고, 그 모델 안에서 충분한 최저 추론 수준을 고르며, 추론 수준 표시는 모델 선택 이유가 되지 않습니다.
- README에 라우터를 시작 기본 모델로 두는 방법(`defaultProvider`/`defaultModel` 또는 `/model`에서 Ctrl+S)을 적었습니다.
- Claude 경로가 출력 없이 멈추는 `pi-background-tasks` 2.6.2 `attribution` 충돌과 우회 방법을 문제 해결 표에 추가했습니다.
- Pi 0.87.0에서 테스트와 실제 실행(`pi -p --model auto/jev`)을 확인했습니다.

Shorter classifier instructions with the same rules, README guidance for making
the router the startup default, a troubleshooting entry for the
pi-background-tasks 2.6.2 attribution hang on Claude routes, and verification
against Pi 0.87.0.

## 0.6.0 · 2026-09-22

- 업스트림 v0.5.0의 작업 적합성 라우팅을 통합했습니다. 분류기가 모델을 먼저 고른 뒤 그 모델 안에서 추론 수준을 고르며, 높은 추론 수준이 모델의 역할 범위를 넓히지 않습니다.
- 작업 설명에 `role`, `use_when`, `not_for`, `boundary` 구조화 기준을 쓸 수 있습니다.
- 웹 개발 프리셋에 Codex Astra를 설계·계획 역할로 추가했습니다.
- 프리셋의 Opus와 Astra 추론 수준을 `high`로 올렸습니다.
- 프리셋의 `rateLimitFallback`을 zai 인증이 없어도 동작하도록 `openai-codex/gpt-5.6-sol`로 바꿨습니다.
- 프리셋의 모든 모델 ID가 Pi 레지스트리에 존재하는지 테스트로 검증합니다.

Integrates upstream v0.5.0 task-fit routing and structured rubrics, adds a Codex
Astra architecture/planning route to the preset, raises Opus and Astra to high
effort, switches the preset usage-limit fallback to Sol, and verifies preset
model IDs against Pi's registry.

## 0.5.0 · 2026-09-22

- `pi-router-jev` 이름으로 배포하는 `mejiasd3v/pi-jev-router` 포크입니다.
- 기본 분류기는 Jev, 기본 생성 계열은 Claude입니다. `provider`로 Claude/OpenAI를 선택합니다.
- Opus 5, Fable 5.1, Sonnet 5, Codex Luna/Terra/Sol, GLM 5.3 설정을 제공합니다.
- TypeSafe 직접 API 키와 기존 Vercel AI Gateway를 지원합니다.
- 키가 없거나 명시적 로컬 모드이면 Laya multilingual을 사용합니다. Python 브리지는 별도 실행합니다.
- 사용량 제한이 발생하고 출력이 시작되지 않았을 때 대체 모델로 한 번 시도할 수 있습니다.
- 실행 파일 누락, 인증 실패, 사용량 제한 오류를 구분해 복구 방법을 안내합니다.
- 한국어 기본 README, 영어 README, 브라우저 언어에 따라 전환되는 문서 페이지를 제공합니다.

This fork adds Jev-first routing, a Claude/OpenAI selector, direct TypeSafe keys,
an optional local multilingual Laya bridge, one usage-limit fallback before
output, actionable error categories, and Korean/English documentation.

SDLC Kit remains responsible for approvals, QA, and verification. The router does
not change delegated-agent settings or the separate THE-SYSTEM-PROMPT project.
