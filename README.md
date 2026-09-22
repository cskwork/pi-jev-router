# Pi router Jev

한국어 · [English](README.en.md) · [브라우저 언어에 맞춘 문서](https://cskwork.github.io/pi-jev-router/)

Pi에서 작업에 맞는 모델과 추론 수준을 선택하는 확장입니다. 기본 분류기는 TypeSafe Jev이며, API 키가 없거나 사용자가 선택하면 로컬 Laya multilingual을 사용합니다. 실제 답변과 도구 실행은 기존 Pi 제공자와 인증으로 처리합니다.

[mejiasd3v/pi-jev-router](https://github.com/mejiasd3v/pi-jev-router)를 기반으로 만든 포크입니다. 이 포크의 npm 이름은 `pi-router-jev`이며, 원본의 `pi-jev-router`와 구분됩니다.

## 설치

Pi 0.85.1 이상과 Node.js 22.19 이상이 필요합니다.

```sh
pi install npm:pi-router-jev
```

Git으로도 설치할 수 있습니다. 두 경로 중 하나만 설치하세요.

```sh
pi install git:github.com/cskwork/pi-jev-router
```

1. Pi의 `/login`으로 사용할 모델 제공자를 인증합니다.
2. 기본 웹 개발 설정을 그대로 사용하거나 아래 설정을 전역 `~/.pi/agent/settings.json`에 합칩니다.
3. `/reload` 후 `/model auto/jev`를 선택합니다. `/jev`로 설정과 선택 결과를 확인합니다.
4. 새 세션마다 라우터로 시작하려면 전역 설정에 `"defaultProvider": "auto"`, `"defaultModel": "jev"`를 넣거나 `/model`에서 `auto/jev`를 고른 뒤 Ctrl+S로 저장합니다.

기존 Git 설치는 `pi update git:github.com/cskwork/pi-jev-router`로 갱신할 수 있습니다. 실행 중 Pi 자체를 업데이트했다면 프로세스를 완전히 종료하고 다시 시작하세요.

## Jev API 키

기본 설정은 `"classifier": "jev"`입니다. 다음 순서로 인증을 선택합니다.

1. 환경 변수 `TYPESAFE_API_KEY`
2. AI SDK가 사용하는 별칭 `TYPESAFE_AI_API_KEY`
3. 전역 설정의 `jevRouter.typesafeApiKey`
4. Pi에 저장한 Vercel AI Gateway 인증 또는 `AI_GATEWAY_API_KEY`
5. 클라우드 키가 하나도 없으면 로컬 Laya

```sh
export TYPESAFE_API_KEY='your-key'
pi
```

설정 파일을 선호하면 `jevRouter` 안에 `"typesafeApiKey": "your-key"`를 추가하고 `/reload`하세요. 키는 비공개 설정에만 저장하고 Git에 커밋하지 마세요. 환경 변수를 변경했다면 해당 터미널에서 Pi를 다시 시작해야 합니다.

직접 호출은 [공식 AI SDK TypeSafe 제공자](https://ai-sdk.dev/providers/ai-sdk-providers/typesafe-ai)의 `jev-latest`를 사용합니다. [TypeSafe API](https://docs.typesafe.ai/api) 키는 모델 생성 제공자, `/jev` 출력, 세션의 라우팅 기록에 전달하지 않습니다. 잘못된 키가 설정되어 있으면 오류를 알리고 생성용 기본 모델을 사용합니다. 인증 오류를 숨기며 다른 분류기로 재시도하지 않습니다.

## Claude / OpenAI 선택

[전체 웹 개발 설정](examples/web-development.json)을 전역 설정에 합치세요. 예시는 Claude를 기본 계열로 선택하고, Opus와 Astra는 `high`, 나머지 모델은 `medium`으로 추론 수준을 고정합니다.

```json
{
  "jevRouter": {
    "classifier": "jev",
    "provider": "anthropic",
    "options": {
      "anthropic/claude-sonnet-5": {
        "description": "Exploration, documentation, small fixes, and established QA scenarios.",
        "thinking": "medium"
      },
      "anthropic/claude-opus-5": {
        "description": "Architecture, difficult debugging, security, and conflicting verification evidence.",
        "thinking": "medium"
      },
      "openai-codex/gpt-5.6-sol": {
        "description": "Multi-component implementation, debugging, code review, and verification.",
        "thinking": "medium"
      }
    },
    "fallback": "anthropic/claude-sonnet-5",
    "rateLimitFallback": "openai-codex/gpt-5.6-sol",
    "monitor": false,
    "skills": false
  }
}
```

`"provider": "openai"`로 한 줄만 바꾸면 `openai-codex` 모델 중에서 선택합니다. `/reload` 후 새 세션을 시작하세요. 진행 중인 세션의 고정 모델은 바꾸지 않습니다. `provider`를 생략하면 등록한 모든 제공자를 후보로 사용합니다.

| 전체 설정에 포함된 모델 | 분류기에 전달하는 작업 설명 |
| --- | --- |
| Sonnet 5 | 탐색, 문서, 작은 수정, 정해진 테스트와 브라우저 QA |
| Fable 5.1 | 계획된 웹 기능, UI/API 연결, 회귀 테스트 |
| Opus 5 | 설계, 어려운 디버깅, 보안, 반대 관점의 리뷰, 검증 결과 해석 |
| Luna 5.6 | 범위가 좁은 탐색, 기계적인 수정, 작은 테스트 |
| Terra 5.6 | 기존 패턴에 따른 웹 개발, 국소 버그 수정 |
| Sol 5.6 | 여러 구성 요소의 구현, 디버깅, 리뷰, 검증 |
| Astra 6 | OpenAI 계열의 설계와 계획, 모호한 요구사항, 어려운 디버깅 |
| GLM 5.3 | zai 인증이 있을 때 명확한 요구사항의 일반 개발, 문서, 검증 |

작업 설명은 수정할 수 있으며 성능 순위를 보장하지 않습니다. Pi에 등록되고 인증된 정확한 모델 ID를 사용하세요. `options`는 기본 목록을 통째로 대체합니다. `fallback`과 `rateLimitFallback`도 `options`에 등록해야 하며 Pi에 인증된 모델이어야 합니다. 인증되지 않은 모델은 오류 없이 후보에서 빠지므로 `/jev`로 실제 후보를 확인하세요.

작업 설명은 문자열 대신 `role`, `use_when`, `not_for`, `boundary`로 이루어진 구조화된 기준으로도 쓸 수 있습니다. `role`과 `boundary`는 비어 있지 않은 문자열, 두 목록은 비어 있지 않은 문자열 배열이어야 합니다. 구조화된 기준은 모니터링을 포함해 분류기에 그대로 전달됩니다. 분류기는 작업 적합성으로 모델을 먼저 고른 뒤 그 모델 안에서 충분한 최저 추론 수준을 고릅니다. 높은 추론 수준이 모델의 역할 범위를 넓히지는 않으며, 다른 모델의 낮은 수준 표시가 그 모델을 선호할 이유가 되지 않습니다.

분류가 실패하면 선택한 계열의 `fallback`을 사용합니다. `fallback`이 다른 계열에 속하면 설정 파일의 순서상 첫 번째 사용 가능한 모델을 선택합니다. 전체 예시에서는 Claude의 기본 모델이 Sonnet, OpenAI의 기본 모델이 Sol입니다. 후보가 없으면 명시적으로 실패합니다.

## 로컬 Laya multilingual

클라우드 키가 없으면 로컬 분류를 시도합니다. 키가 있어도 `"classifier": "local"`을 설정하면 로컬만 사용합니다. 기본 주소는 `http://127.0.0.1:8765/v1`이며 `localUrl`로 변경할 수 있습니다. 루프백 HTTP 주소만 허용하고 리다이렉트는 거부합니다.

이 저장소를 내려받은 폴더에서 실행하세요.

```sh
python3 -m venv .venv-laya
.venv-laya/bin/pip install 'laya==0.3.5'
.venv-laya/bin/python scripts/laya-server.py
```

이 터미널을 켜 둔 상태에서 Pi를 사용합니다. 첫 실행은 Hugging Face에서 모델을 내려받습니다. 준비 완료 메시지가 나온 뒤 요청을 받습니다. npm 패키지에도 같은 서버 스크립트가 포함됩니다.

`convaiinnovations/laya`의 **multilingual** 체크포인트 하나를 CPU에 올려 한국어·영어 등 지원 언어를 처리합니다. 영어 전용 모델로 바꾸지 않습니다. 서버는 `127.0.0.1:8765`에만 바인딩하며 `/health`에서 준비 상태를 확인할 수 있습니다. Ctrl+C로 종료합니다. 플러그인이 Python이나 모델을 자동 설치하거나 상시 프로세스를 만들지는 않습니다.

[Laya 공식 설명](https://github.com/NandhaKishorM/laya)처럼 로컬 모델은 Jev보다 문맥이 짧고 작업에 따라 정확도가 달라집니다. 브리지는 상태가 모델의 토큰 예산을 넘으면 거절하며 질문과 선택지를 각각 20개로 제한합니다. 질문과 선택지 설명은 Laya 내부에서도 길이가 제한됩니다. 길거나 복잡한 작업에는 Jev를 권장합니다. 로컬 서버가 꺼져 있거나 입력을 처리하지 못하면 경고 후 생성용 기본 모델을 사용합니다.

## 사용량 제한과 오류

`fallback`은 **분류 실패**에, `rateLimitFallback`은 **답변 생성 중 사용량 제한**에 사용합니다.

- HTTP 429나 Anthropic의 `out of extra usage`처럼 사용량 제한이 확인되면, 출력이 시작되기 전에만 대체 모델로 한 번 시도합니다.
- 대체 모델이 성공하면 해당 모델을 세션에 고정하고 재시작 후에도 유지합니다. 실패하면 원래 고정을 유지하고 오류를 반환합니다.
- 텍스트·추론·도구 호출이 이미 시작되었거나 요청이 취소된 경우에는 다시 실행하지 않습니다.
- 인증 실패, 실행 파일 누락, 다른 서버 오류, 보조 요청은 자동 전환 대상이 아닙니다. 인증·이미지·추론 정책에 맞지 않는 후보도 제외합니다.
- 원문 문맥은 잘라내지 않고 전달합니다. 문맥이 작은 대체 모델은 긴 대화를 거절할 수 있습니다. Pi나 제공자 자체의 재시도는 별도로 적용됩니다.

| 표시 | 의미와 조치 |
| --- | --- |
| `Jev [runtime]` | Pi 제공자의 실행 파일을 불러오지 못했습니다. Pi를 완전히 종료하고 재시작하세요. 계속되면 Pi 설치를 복구하세요. 인증이나 사용량 제한 오류가 아닙니다. |
| `Jev [auth]` | 생성 모델의 인증이나 접근 권한 문제입니다. 안내된 제공자로 `/login`하세요. |
| `Jev [usage-limit]` | 요청량 또는 사용량 한도입니다. 기다리거나 `/model`로 다른 모델을 선택하세요. |
| `TypeSafe rejected credentials (401)` | TypeSafe 키를 갱신하세요. 설정 파일을 변경했다면 `/reload`, 환경 변수를 변경했다면 Pi를 재시작하세요. |
| 로컬 연결 실패·시간 초과·HTTP 413 | Laya 서버의 준비 상태를 확인하거나 긴 작업에 Jev를 사용하세요. |
| Claude 경로에서 출력 없이 CPU 100%로 멈춤 | 라우터 문제가 아닙니다. `pi-background-tasks` 2.6.2의 `attribution` 기능이 Anthropic 제공자를 대체하며 Pi 0.86+의 시스템 메시지에서 무한 루프에 빠집니다. Pi 실행 전 `PI_BG_FEATURES=process,delegate,fusion,attested`를 내보내세요. 구체적인 Anthropic 모델을 직접 골라도 같은 증상이면 이 원인입니다. |

## SDLC Kit와 세션

SDLC Kit가 단계, 승인, QA·검증 근거를 관리합니다. 라우터는 테스트 성공이나 승인 여부를 판단하지 않으며 서브에이전트를 실행하지 않습니다. 기존 SDLC 스킬을 그대로 사용하세요. 구체적인 모델을 지정한 서브에이전트의 설정도 유지됩니다.

모델과 초기 추론 수준은 세션에 한 번 고정합니다. 도구 호출, 압축, `/reload`, `/resume`에서 유지하며 `/new`, `/fork`, `/clone`에서는 새로 선택합니다. 다른 단계로 넘어갈 때 새 세션이나 명시적 모델 선택을 사용할 수 있습니다. 구체적인 모델을 선택하면 라우팅을 우회합니다.

`monitor: true`는 새 사용자 요청을 검토해 다른 모델의 포크를 제안합니다. 제안만으로 자동 전환하지 않습니다. 전체 예시는 추가 평가 비용을 줄이기 위해 `monitor`와 `skills`를 끕니다.

## 고급 설정

| 설정 | 동작 |
| --- | --- |
| `thinking: "medium"` | 모델이 지원하는 범위 안에서 고정합니다. |
| `thinking: "auto"` | 분류기가 모델과 필요한 추론 수준을 함께 선택합니다. |
| `thinking: {"low": "설명", "high": "설명"}` | 허용 수준과 의미를 직접 정합니다. |
| `thinking` 생략 | 처음 고정할 때 Pi의 추론 수준을 상속합니다. |
| `minThinking` | 전역 또는 모델별 최소 수준입니다. 지원하지 않는 후보는 제외합니다. |
| `timeoutMs` | 평가 시간 제한입니다. 기본 5,000ms, 1~60,000ms 범위입니다. |
| `skills: true` | 발견된 스킬 중 관련성이 높은 최대 3개를 자동 로드합니다. 기본은 꺼짐입니다. |
| Astra의 `adaptiveThinking: true` | `openai-codex/gpt-6-astra`에서 자동 추론 선택과 함께 쓸 수 있습니다. 다른 모델은 허용하지 않습니다. |

수준은 `off`, `minimal`, `low`, `medium`, `high`, `xhigh`, `max`입니다. Astra의 명시적 모델 최소값만 전역 최소값보다 낮출 수 있습니다. 자동 스킬은 확률 0.8 이상인 후보를 고르며, 명시적 호출 전용 스킬은 제외합니다. 도구 연속 실행에서는 같은 선택을 다시 평가하지 않습니다. 고급 기능의 캐시·압축·분기 처리 조건은 [영문 상세 문서](README.en.md)를 참고하세요.

## 입력·개인정보·비용

모델 선택에는 최근 사용자·어시스턴트 텍스트 최대 8개를 사용합니다. 시스템 프롬프트, 추론 내용, 이미지, 도구 결과는 기본 모델 선택 평가에 보내지 않습니다. 다만 일반 대화에 포함된 민감한 텍스트는 자동으로 가리지 않습니다.

Astra의 선택적 적응형 추론은 도구 결과 발췌를 포함할 수 있습니다. 자동 스킬 선택은 스킬 이름과 설명을 평가기에 보내고 본문은 로컬에서 읽습니다. 명시적 로컬 모드에서는 평가 내용을 클라우드로 보내지 않지만, 이후 답변 생성에는 선택한 Pi 제공자를 사용합니다.

평가 요청은 직렬화한 UTF-8 기준 28,000바이트로 제한합니다. 최신 작업이 길면 최대 8개 겹치는 조각으로 나누고 한 번 결합합니다. 192,000바이트를 넘거나 평가가 완성되지 않으면 기본 모델을 사용합니다. 최초 라우팅과 모니터링의 시간 초과 재시도는 최대 3회이며 전체 시간도 `3 × timeoutMs`로 제한합니다. 적응형 추론과 스킬 선택은 각각 별도 평가이며 재시도하지 않습니다.

Jev 평가는 별도 과금됩니다. `/jev`의 Gateway 비용은 추정치이며 Pi 생성 비용 합계에 포함되지 않습니다. 직접 TypeSafe와 로컬 평가에는 토큰 수만 표시합니다. Laya에는 API 요금이 없지만 로컬 연산과 모델 저장 공간이 필요합니다. 모델 고정은 캐시 재사용에 도움이 되지만 캐시 적중이나 비용 절감을 보장하지 않습니다.

## 개발·게시

```sh
nub install --frozen-lockfile --ignore-scripts
nub run test
nub run docs
```

테스트는 네트워크 응답을 모의 처리하며 API 키가 필요하지 않습니다. 로컬 서버 검증은 `python3 -m unittest discover -s scripts -p '*_test.py'`로 실행합니다.

공개 npm 이름은 `pi-router-jev`입니다. `pi-package` 키워드와 `pi.extensions`가 있으므로 [Pi 공식 패키지 목록](https://pi.dev/packages)의 수집 대상입니다. 게시 후 npm 버전과 실제 목록을 확인하세요. 검색 반영에는 시간이 걸릴 수 있습니다.

```sh
npm test
npm pack --dry-run
npm login
npm publish --access public
```

GitHub의 자동 npm 게시는 패키지 설정에 `cskwork/pi-jev-router`와 `publish.yml`을 trusted publisher로 연결한 뒤 사용할 수 있습니다. Git 푸시만으로 npm에 게시되지는 않습니다.

문서 사이트는 `docs/`에서 GitHub Pages로 제공합니다. 브라우저가 선호하는 한국어 또는 영어를 선택하며 둘 다 없으면 한국어를 표시합니다. 페이지의 언어 링크로 변경할 수 있습니다. GitHub README 자체는 브라우저 언어에 따라 자동 전환되지 않으므로 이 파일을 기본으로 두고 영어판을 연결합니다.

[MIT 라이선스](LICENSE). 원본 작성자는 MejiasDev이며 이 포크에서 제공자 선택, TypeSafe 직접 호출, 로컬 Laya, 사용량 제한 복구를 추가했습니다.
