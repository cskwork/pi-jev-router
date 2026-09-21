# 변경 기록 / Changelog

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
