# Buzzi Live Chat 코드 동작 가이드

이 문서는 프로젝트가 브라우저에 로드된 뒤 어떤 파일과 함수가 어떤 순서로 실행되는지 설명합니다. 코드 수정 시에는 먼저 이 문서의 **스크립트 로딩 순서**, **게임 시작 순서**, **모드별 판정 흐름**을 확인하는 것이 좋습니다.

## 목차

1. [프로젝트의 기본 구조](#1-프로젝트의-기본-구조)
2. [전체 로딩 순서](#2-전체-로딩-순서)
3. [HTML 화면 구조](#3-html-화면-구조)
4. [CSS가 작동하는 방식](#4-css가-작동하는-방식)
5. [앱 초기 실행 순서](#5-앱-초기-실행-순서)
6. [타이틀에서 게임으로 들어가는 순서](#6-타이틀에서-게임으로-들어가는-순서)
7. [새 게임과 스테이지 시작](#7-새-게임과-스테이지-시작)
8. [채팅 엔진 파일별 역할](#8-채팅-엔진-파일별-역할)
9. [채팅 한 줄이 만들어지는 순서](#9-채팅-한-줄이-만들어지는-순서)
10. [사용자 채팅 순서](#10-사용자-채팅-순서)
11. [시청자 기록과 강퇴](#11-시청자-기록과-강퇴)
12. [무한 모드 흐름](#12-무한-모드-흐름)
13. [스토리 모드 흐름](#13-스토리-모드-흐름)
14. [방송 연결 괴이](#14-방송-연결-괴이)
15. [결과 공개 지연](#15-결과-공개-지연)
16. [오디오 흐름](#16-오디오-흐름)
17. [앱 파일별 함수 목록](#17-앱-파일별-함수-목록)
18. [저장값과 URL 테스트 옵션](#18-저장값과-url-테스트-옵션)
19. [개발용 디버그 API](#19-개발용-디버그-api)
20. [자주 수정하는 위치](#20-자주-수정하는-위치)
21. [수정할 때 지켜야 할 사항](#21-수정할-때-지켜야-할-사항)
22. [빠른 실행 확인 순서](#22-빠른-실행-확인-순서)

## 1. 프로젝트의 기본 구조

이 프로젝트는 별도의 빌드 도구나 프레임워크가 없는 정적 웹 게임입니다.

- `index.html`: 화면에 필요한 모든 DOM 요소와 스크립트 로딩 순서를 정의합니다.
- `styles/*.css`: 공통 토큰, 진입·타이틀·방송·채팅·결과 화면, 애니메이션, 반응형 레이아웃을 기능별로 담당합니다.
- `chat-engine-*.js`: 자동 시청자 채팅의 데이터와 생성 엔진입니다.
- `assetconfig.js`: 첫 화면 로고·타이틀 배경·방송 배경·캐릭터 이미지 경로를 정의합니다.
- `bgmconfig.js`: 타이틀·모드·스토리 일차·결과·괴이 상황별 배경음악 경로를 정의합니다.
- `app-assets.js`: `assetconfig.js`의 경로를 실제 이미지 요소와 CSS 변수에 적용합니다.
- `app-*.js`: 게임 상태, 화면, 오디오, 판정, 이벤트를 담당합니다.
- `assets/`: 방송 배경(`gameScrenn.png`), 캐릭터 이미지, 첫 진입 로고(`splash-logo.png`), 배경음악 파일을 보관합니다.
- `.vscode/launch.json`: Firefox에서 파일 또는 localhost 방식으로 실행하는 디버그 설정입니다.

JavaScript 파일은 ES module이 아닌 일반 `<script>`입니다. 따라서 `file://`로 `index.html`을 직접 열어도 동작하지만, 각 파일의 최상위 `const`, `let`, `class`, `function`이 같은 전역 lexical 환경을 공유합니다. **`index.html`의 스크립트 순서를 바꾸면 아직 선언되지 않은 값을 참조해 실행이 중단될 수 있습니다.**

## 2. 전체 로딩 순서

브라우저는 HTML을 위에서 아래로 읽고, 문서 하단에서 다음 순서로 JavaScript를 실행합니다.

```text
index.html + styles/*.css
        │
        ├─ 채팅 엔진 데이터
        │   1. chat-engine-config.js
        │   2. chat-engine-dialogue.js
        │   3. chat-engine-anomalies.js
        │   4. chat-engine-utils.js
        │
        ├─ 채팅 엔진 클래스 계층
        │   5. chat-engine-core.js
        │   6. chat-engine-generation.js
        │   7. chat-engine-diagnostics.js
        │   8. chat-engine.js
        │
        └─ 게임 앱
            9.  assetconfig.js
            10. bgmconfig.js
            11. app-config.js
            12. app-assets.js
            13. app-chat.js
            14. app-audio.js
            15. app-survival.js
            16. app-results.js
            17. app-game.js
            18. app.js
```

`chat-engine.js`는 완성된 `HorrorChatEngine` 클래스를 `window.HorrorChatEngine`으로 공개합니다. `app-game.js`의 `startStage()`는 이 공개 클래스로 실제 채팅 엔진 인스턴스를 만듭니다.

## 3. HTML 화면 구조

`index.html`의 주요 화면은 다음 순서로 배치됩니다.

| 영역 | 주요 ID/클래스 | 역할 |
|---|---|---|
| 전체 앱 | `.chat-app` | 화면 크기와 디렉터 상태의 기준 요소 |
| 첫 진입 화면 | `#entry-screen`, `#entry-form`, `#player-nickname` | 닉네임을 검증·저장하고 제출 제스처로 오디오 권한을 얻은 뒤 타이틀로 전환 |
| 타이틀 | `#title-screen` | 모드 선택과 타이틀 음악 설정 |
| 실제 게임 | `#game-screen` | 방송, HUD, 채팅, 조작부를 포함 |
| 연결 상태 | `#connection-widget`, `#reconnect-button` | 화면 상단의 작은 와이파이 상태와 수동 재연결 버튼 |
| 가상 주소창 | `.browser-bar` | 접기 가능한 방송 페이지 상단 바 |
| 방송 화면 | `.stream-stage` | `ASSET_CONFIG.stream.background` 배경 위에 캐릭터, 괴이, 음악, 제한시간 표시 |
| 상태 HUD | `.game-hud` | 스테이지/일차, 체력, 시각, 이상 시청자, 점수 |
| 메시지 목록 | `#message-list` | 엔진 채팅, 시스템 메시지, 사용자 채팅 |
| 채팅 입력 | `#message-form` | 사용자 메시지와 이모지 입력 |
| 시청자 기록 | `#viewer-backdrop` | 닉네임 클릭 후 기록 확인 및 강퇴 |
| 무한 모드 결과 | `#stage-overlay` | 스테이지 성공/실패 결과 |
| 스토리 결과 | `#story-night-overlay` | 오전 2시 공포 전환과 하루 판정 |
| 최종 결과 | `#game-overlay` | 게임오버 또는 7일 완주 결과 |
| 보조 효과 | `#toast`, `#screen-interference` | 안내 메시지와 화면 간섭 |

타이틀을 표시할 때 `#game-screen`에는 `inert`가 적용됩니다. 이 속성은 화면을 숨기는 것뿐 아니라 내부 버튼과 입력창에 키보드 초점이 들어가는 것도 막습니다. 게임 진입 시 `inert`가 해제됩니다.

## 4. CSS가 작동하는 방식

CSS는 `styles/` 아래에서 기능별 파일로 나뉘며, `index.html`의 `<link>` 순서대로 하나의 cascade를 이룹니다.

| 파일 | 역할 |
|---|---|
| `base.css` | `:root` 색상·안전 영역 변수, 기본 요소 초기화, 앱 프레임 |
| `entry.css` | 닉네임 입력과 첫 진입 화면 |
| `title.css` | 타이틀, 모드 선택, 타이틀 음량 |
| `stream.css` | 주소창, 방송 무대, 연결 위젯, HUD |
| `chat.css` | 메시지, 입력기, 하단 메뉴 |
| `overlays.css` | 시청자 기록, 결과 오버레이, 화면 간섭 |
| `animations.css` | 여러 화면이 공유하는 키프레임 |
| `viewport.css` | 화면 너비에 따른 1차 레이아웃 보정 |
| `story-results.css` | 스토리 야간 결과와 공포 연출 |
| `responsive.css` | 낮은 화면 보정과 `prefers-reduced-motion` 대응 |

이 순서는 기존 선택자 우선순위와 반응형 덮어쓰기를 보존하므로 임의로 바꾸지 않습니다. JavaScript가 상태 클래스, `hidden`, `aria-hidden`, `inert`, `data-*` 값을 변경하면 각 CSS 파일이 해당 상태를 시각화합니다.

### 주요 상태 클래스와 속성

| 상태 | 추가 위치 | 결과 |
|---|---|---|
| `.open` | 모달/오버레이 | 숨겨진 모달을 표시 |
| `.is-leaving` | 첫 진입 화면 | 닉네임 제출 뒤 로고와 접속 패널을 페이드아웃 |
| `.is-playing` | 음악 버튼 | 재생 중 색상과 파형 표시 |
| `.has-text` | `.composer` | 전송 버튼 활성 모양 표시 |
| `.claimed` | 보상 버튼 | 수령 완료 상태 표시 |
| `.blinded-message` | 강퇴된 메시지 | 닉네임과 본문을 비활성화 |
| `.corrupted-message` | 모든 이상 채팅 | 일반 채팅과 같은 모양을 유지하는 판별용 클래스 |
| `.ciphered-message` | 붕괴형/연결 끊김 채팅 | 별도 글꼴·굵기 효과가 없는 판별용 클래스 |
| `.anomaly-prophecy` 등 | 이상 채팅 | 시각 강조 없이 이상 유형을 구분하는 메타데이터 클래스 |
| `.anomaly-chat-shake` | `.chat-app` | 이상 채팅 순간 확률 효과로 게임 화면을 짧게 흔듦 |
| `.anomaly-chat-static` | `.chat-app` | 이상 채팅 순간 확률 효과로 정전기 화면과 소리를 재생 |
| `.corrupted-chat-hit` | `.chat-app` | 연결 끊김으로 채팅이 오염되는 순간 메시지 영역 흔들림 |
| `.is-good` | 연결 위젯 | 1단계 좋음: 초록색 정상 연결 |
| `.is-normal` | 연결 위젯 | 2단계 보통: 괴이 발생 직후 노란색 연결 |
| `.is-weak` | 연결 위젯 | 3단계 약함: 대응 시간 후반의 빨간색 경고 |
| `.is-disconnected` | 연결 위젯 | 4단계 끊김: 제한시간 초과 뒤 검은색 단절 상태 |
| `.connection-pixelated` | `.chat-app` | 끊김 직전 마지막 2초 동안 방송 화면에만 모자이크 적용 |
| `.is-false-reconnect` | 연결 위젯 | 정상 연결을 잘못 재연결했을 때 짧은 오판 흔들림 표시 |
| `.interference-mosaic` | `.chat-app` | 모자이크 간섭 효과 |
| `.interference-color` | `.chat-app` | 색 분리 간섭 효과 |
| `.wrong-kick` | `.chat-app` | 오답 화면 흔들림 |
| `.is-wrong` | 스토리 결과 | 오답 전용 공포 연출 |
| `.scare-hit` | 스토리 결과 | 형상 접근과 정전기 폭발 |
| `.results-visible` | 스토리 결과 | 공포 전환 뒤 결과 카드 공개 |
| `data-director-state` | `.chat-app` | 채팅 분위기에 맞춰 방송 노이즈 변경 |
| `data-game-mode` | `.chat-app` | 무한/스토리 모드별 화면 구분 |

CSS는 게임 규칙을 직접 계산하지 않습니다. JavaScript가 상태 클래스, `hidden`, `aria-hidden`, `inert`, `data-*` 값을 변경하면 CSS가 그 상태를 시각화합니다.

## 5. 앱 초기 실행 순서

마지막에 로드되는 `app.js`가 모든 DOM 이벤트를 연결한 뒤 다음 네 함수를 순서대로 호출합니다.

```text
applyVisualAssets()
        ↓
initializePlayerNickname()
        ↓
initializeAudioVolumes()
        ↓
showEntryScreen()
```

### `applyVisualAssets()`

1. `assetconfig.js`의 `ASSET_CONFIG`를 읽습니다.
2. `entry.logo`와 `stream.character`를 각각 첫 화면과 방송 캐릭터의 `<img>`에 적용합니다.
3. `title.background`와 `stream.background`를 CSS 변수 `--asset-title-background`, `--asset-stream-background`에 적용합니다.
4. `results.stage`, `results.storyDay`, `results.final`의 대기·공개 배경을 각 결과 오버레이의 CSS 변수에 적용합니다.
5. 빈 경로의 `<img>`는 깨진 이미지 아이콘 대신 숨기고, 빈 배경 경로는 `none`으로 처리해 기존 연출을 유지합니다.

결과 화면의 각 그룹에는 두 경로가 있습니다.

| 설정 키 | 표시 시점 |
|---|---|
| `waitingBackground` | 오버레이가 열린 뒤 판정을 숨기고 기다리는 동안 |
| `revealedBackground` | `results-visible`이 붙어 결과 카드가 공개된 뒤 |

`results.stage`는 무한 모드 스테이지 결과, `results.storyDay`는 스토리 일일 결과, `results.final`은 게임오버·7일 생존 최종 결과에 대응합니다.

### `initializePlayerNickname()`

1. `localStorage`의 `ferret-chess-player-nickname`을 읽습니다.
2. 값이 있으면 공백과 길이를 정규화합니다.
3. 닉네임 입력창에 복원합니다.
4. 저장소 접근이 차단되어도 빈 입력창으로 계속 실행합니다.

### `initializeAudioVolumes()`

1. `AUDIO_SETTINGS.title`과 `AUDIO_SETTINGS.game`을 읽습니다.
2. 각 저장 키에서 이전 음량을 복원합니다.
3. 값이 없거나 잘못되면 `defaultVolume`을 사용합니다.
4. `<audio>`, `<input type="range">`, `<output>`을 같은 값으로 맞춥니다.

### `showEntryScreen()`

1. 타이틀과 게임 화면을 비활성화합니다.
2. `ASSET_CONFIG.entry.logo`의 로고, 경고문, 설명, 닉네임 폼을 표시합니다.
3. `#player-nickname`에 키보드 초점을 둡니다.
4. 타이틀과 게임 음악은 아직 재생하지 않습니다.

사용자가 닉네임을 입력하면 `updateNicknameEasterEgg()`가 `NICKNAME_EASTER_EGGS`의 이름과 비교해 일치하는 특수 문구를 즉시 표시합니다. 폼 버튼을 클릭하거나 Enter를 누르면 `enterTitleFromEntry()`가 실행됩니다. 먼저 `commitPlayerNickname()`이 공백과 길이를 정리하고 빈 값을 차단한 뒤 닉네임을 저장합니다. 유효한 경우에만 같은 제출 제스처 안에서 `showTitle(false)`와 `prepareTitleMusic()`을 호출하므로 브라우저가 타이틀 BGM 재생을 허용할 수 있습니다. 진입 화면은 720ms 동안 페이드아웃되고 그 아래에 준비된 타이틀 화면이 자동으로 나타납니다.

자동 타이머만으로 화면을 넘기면 사용자 제스처가 없어 자동 재생 제한을 해결할 수 없습니다. 따라서 **닉네임 입력 후 폼을 한 번 제출해야 하며, 제출 뒤의 타이틀 전환은 자동**입니다.

## 6. 타이틀에서 게임으로 들어가는 순서

첫 진입 화면을 통과한 뒤 스토리 버튼과 무한 버튼은 각각 다음 함수를 호출합니다.

```text
#story-start 클릭  ──→ enterGame(GAME_MODES.STORY)
#game-start 클릭   ──→ enterGame(GAME_MODES.ENDLESS)
```

`enterGame(mode)`의 처리 순서는 다음과 같습니다.

1. `commitPlayerNickname()`으로 첫 화면에서 확정한 닉네임을 한 번 더 안전하게 검증합니다.
2. `gameMode`와 `.chat-app.dataset.gameMode`를 갱신합니다.
3. 두 모드 모두 이상 채팅과 결과 화면의 정전기 효과음용 `AudioContext`를 준비합니다.
4. 타이틀 음악을 중지합니다.
5. 타이틀을 숨기고 게임 화면의 `inert`를 해제합니다.
6. 게임 음악을 준비합니다.
7. `startGame()`을 호출합니다.

## 7. 새 게임과 스테이지 시작

### `startGame()`

새 게임 전체에서 한 번 초기화해야 하는 값을 재설정합니다.

- 체력: `MAX_HEALTH`
- 점수와 현재 스테이지/일차
- 정답, 놓침, 오답 누계
- 괴이 퇴치/실패 누계
- 스토리 승리 상태
- 보상 버튼
- 최종 결과 모달과 공포 결과 연출

초기화가 끝나면 `startStage()`를 호출합니다.

### `startStage()`

각 무한 모드 스테이지 또는 스토리 하루가 시작될 때 실행됩니다.

```text
기존 타이머/엔진 정리
        ↓
createStageSeed()
        ↓
getAnomalyCountForStage(currentStage)
        ↓
createViewers(currentSeed, remainingAnomalies)
        ↓
HUD·메시지·모달 초기화
        ↓
new window.HorrorChatEngine(...)
        ↓
chatEngine.start()
        ↓
모드별 안내 및 시계/제한시간 준비
        ↓
scheduleStreamApparition(true)
```

고정 `seed`가 없으면 새 난수를 만듭니다. 고정 시드가 있으면 현재 스테이지 번호를 혼합해 같은 URL에서 스테이지별 결과도 재현할 수 있습니다.

`createViewers()`는 다음 작업을 합니다.

1. `VIEWER_STYLES` 수만큼 시청자를 만듭니다.
2. 중복되지 않는 랜덤 닉네임을 부여합니다.
3. `getAnomalyCountForStage()`가 계산한 수만큼 이상 시청자를 무작위 지정합니다.
4. 이상 시청자는 `active = false`, `pendingArrival = true`인 등장 대기 상태로 둡니다.
5. 기록과 강퇴 여부를 초기화합니다.

## 8. 채팅 엔진 파일별 역할

### `chat-engine-config.js`

- `TUNING`: tick 간격, 상태 임계값, 중복 검사 기준, 일반·이상 채팅 간격을 정의합니다.
- `PERSONAS`: 시청자별 발화 욕구, 의도 적합도, 쿨다운, 축약/오타/이모티콘 확률을 정의합니다.

### `chat-engine-dialogue.js`

- `TEMPLATES`: 의도별 일반 대사 템플릿입니다.
- `SHORT_LINES`: 채팅 폭주 때 사용하는 짧은 반응입니다.
- `SLOT_POOLS`: `{topic}`, `{food}`, `{thing}` 등에 들어갈 기본값입니다.
- `SYNTHETIC_EVENTS`: 실제 스트리머 행동 없이도 채팅 반응을 일으키는 가상 사건입니다.

### `chat-engine-anomalies.js`

- `ANOMALY_LINES`: 이상 시청자만 사용할 수 있는 공포 대사입니다.
- `ANOMALY_PERMISSIONS`: `PROPHECY`, `OBSERVER`, `MEMORY`, `MIMIC`, `INTRUDER` 유형입니다.
- `CHAT_ENDINGS`, `ABBREVIATIONS`, `TYPO_PAIRS`: 일반 문장을 실제 인터넷 채팅 말투로 변형하는 재료입니다.
- `CHOSEONG`, `JUNGSEONG`: 첫 음절을 자모로 흘리는 오타를 만들 때 사용합니다.

### `chat-engine-utils.js`

- `spillFirstSyllable()`: 첫 한글 음절을 자모 형태로 바꿉니다.
- `SeededRandom`: 같은 시드에서 같은 발화 순서가 나오도록 하는 난수 클래스입니다.
- `next()`, `range()`, `pick()`, `shuffle()`, `weighted()`가 모든 확률 선택을 담당합니다.

### `chat-engine-core.js`

기본 `HorrorChatEngine` 클래스를 선언합니다.

- `constructor()`: 큐, 시간, 긴장도, 최근 기록, 디버그 통계를 만듭니다.
- `assignViewerModels()`: 시청자에게 페르소나와 이상 권한을 배정합니다.
- `start()` / `stop()` / `setPaused()`: 엔진 수명 주기를 관리합니다.
- `tick()`: 100ms 단위로 가상 시간을 전진시킵니다.
- `updateDirectorState()`: `AMBIENT`, `TENSE`, `BURST`, `AFTERMATH`, `LULL`을 결정합니다.
- `enqueue()` / `enqueueAmbient()` / `enqueueAnomalyArrival()` / `enqueueAnomaly()`: 일반 채팅, 새 이상 시청자 등장, 추가 이상 채팅 요청을 시간순 큐에 넣습니다.
- `chooseIntent()`: 현재 상태와 쿨다운으로 다음 발화 의도를 정합니다.
- `emitEvent()` / `planFutureEvent()`: 방송 사건과 여러 반응을 예약합니다.
- `chooseSpeaker()`: 일반 요청에서는 정상 시청자만, 이상 예약에서는 지정된 이상 시청자를 화자로 고릅니다.

### `chat-engine-generation.js`

기본 엔진을 상속해 문장 생성 기능을 추가합니다.

- `processRequest()`: 큐 요청 하나를 실제 채팅으로 처리합니다.
- `generateCandidate()`: 일반 템플릿 또는 전용 예약된 이상 대사 후보를 만듭니다.
- `generateShortCandidate()`: 짧은 반응 후보를 만듭니다.
- `createAnomalyOverride()`: 이상 채팅 예약이나 기록 생성 요청에 맞춰 공포 대사를 만듭니다.
- `resolveSlot()`: 템플릿 슬롯 값을 선택합니다.
- `attachParticle()`: 받침에 맞는 한국어 조사를 붙입니다.
- `transformStyle()`: 축약, 어미, 이모티콘, 오타를 적용합니다.

### `chat-engine-diagnostics.js`

생성 엔진을 다시 상속해 품질 검사와 기록 기능을 추가합니다.

- `findRejection()`: 동일 문장, 템플릿, 시그니처, 유사도를 검사합니다.
- `normalizeForSimilarity()` / `jaccardBigrams()`: 문장 유사도를 계산합니다.
- `signature()`: 템플릿과 슬롯의 의미 조합 키를 만듭니다.
- `recordUtterance()`: 승인된 발화를 기록하고 앱의 `onMessage`를 호출합니다.
- `bootstrapMessages()`: 시작 직후 정상 시청자의 초기 채팅과 이상 시청자의 비공개 기록만 준비합니다.
- `observeViewer()`: 플레이어가 시청자 기록을 열었다는 정보를 남깁니다.
- `getDebugSnapshot()`: 엔진 내부 상태를 진단용 사본으로 반환합니다.

### `chat-engine.js`

최종 상속 클래스와 주요 데이터 일부를 `window`에 공개합니다.

```js
window.HorrorChatEngine
window.HORROR_CHAT_TUNING
window.HORROR_CHAT_PERSONAS
window.HORROR_CHAT_EVENTS
window.HORROR_CHAT_ANOMALY_LINES
```

## 9. 채팅 한 줄이 만들어지는 순서

```text
HorrorChatEngine.tick()
        ↓
큐에서 실행 시간이 된 요청 선택
        ↓
processRequest(request)
        ↓
chooseSpeaker(intent)
        ↓
일반 요청: generateCandidate()
이상 예약: createAnomalyOverride()
        ↓
transformStyle()
        ↓
findRejection()
        ├─ 중복이면 재생성
        └─ 통과하면 recordUtterance()
                         ↓
                 app의 handleEngineMessage()
                         ↓
            createMessage() → appendElement()
```

### 이상 채팅일 때 추가되는 과정

1. `enqueueAnomalyArrival()`가 대기 중인 이상 시청자 한 명의 첫 등장을 `anomalyArrivalIntervalMs` 범위 뒤로 예약합니다.
2. 예약 시점이 되면 해당 시청자를 활성화하고 첫 이상 채팅을 생성합니다.
3. 다음 대기 시청자도 같은 설정 범위 뒤에 예약하므로 서로 다른 이상 시청자가 차례로 나타납니다.
4. 모든 예정 시청자가 등장하면 `enqueueAnomaly()`가 활성 이상 시청자의 추가 발화를 예약합니다.
5. 추가 발화는 `anomalyIntervalMs`를 기본으로 하며, 일차 난이도와 `anomalyLevel`이 올라갈수록 간격이 줄어듭니다.
6. 이상 시청자는 일반 발화 큐에서 제외되므로 예약된 이상 채팅이 채팅창의 첫 등장입니다.
7. 엔진이 `anomalyEvidence`, `anomalyMode`, `anomalyLineId` 메타데이터를 전달합니다.
8. `getAnomalyPresentation()`이 `gli-*` 붕괴형과 나머지 전용 유형을 구분합니다.
9. 예언·관찰·기억·모방·침입형은 원문을 유지하고, 붕괴형만 `createUnknownChatText()`로 난독화합니다.
10. `handleEngineMessage()`가 유형별 판별 클래스를 적용하고 실제 이상 채팅마다 30% 확률로 흔들림 또는 정전기 효과를 재생합니다.
11. 무한 모드이면 `startThreatCountdown(viewer)`가 즉시 시작됩니다.
12. 스토리 모드이면 즉시 제한시간을 만들지 않고 오전 2시에 판정합니다.

이 과정에서는 이상 채팅 자체 외에 별도의 시스템 메시지나 토스트를 추가하지 않습니다. 플레이어는 깨진 채팅 모양과 무한 모드의 기존 제한시간 UI만 보고 판단합니다.

연결 괴이를 8초 동안 복구하지 않아 `끊김`이 된 경우에는 실제 이상 여부와 관계없이 이후 자동 채팅이 같은 깨진 문자로 표시됩니다. 이때 `viewer.anomalous` 값은 바뀌지 않으므로 정상 시청자를 차단하면 오판으로 처리됩니다. 이상 메시지 스타일은 배지와 닉네임의 원래 색을 유지하고 채팅 본문에만 글리치 효과를 적용합니다.

### 메시지 목록 관리

`appendElement()`는 메시지를 `#message-list`에 추가합니다.

- 사용자가 최신 메시지 근처에 있으면 자동으로 아래로 이동합니다.
- 위쪽 기록을 읽고 있으면 위치를 유지하고 `새 메시지 보기` 버튼을 표시합니다.
- `MAX_MESSAGES`를 초과하면 가장 오래된 메시지부터 제거합니다.

## 10. 사용자 채팅 순서

`#message-form` 제출 이벤트는 다음 순서로 처리됩니다.

1. 빈 문자열, 게임 종료, 결과 모달 상태를 검사합니다.
2. 입력한 닉네임으로 사용자 전용 viewer 객체를 만듭니다.
3. `createMessage(..., true)`로 `data-own-message="true"` 메시지를 만듭니다.
4. 메시지를 추가하고 입력창을 비웁니다.
5. 전송 버튼 상태와 이모지 패널을 초기화합니다.

사용자 메시지는 자동 채팅 엔진으로 다시 전달되지 않으며 점수와 판정에도 영향을 주지 않습니다. 다만 연결 끊김 상태에서는 다른 채팅과 마찬가지로 화면에서만 깨진 문자로 변환됩니다.

## 11. 시청자 기록과 강퇴

채팅 닉네임 버튼을 누르면 다음 순서가 실행됩니다.

```text
messageList click
        ↓
openViewerPanel(viewerId)
        ↓
최근 viewer.history 렌더링
        ↓
chatEngine.observeViewer(viewerId)
        ↓
강제 퇴장 버튼
        ↓
kickSelectedViewer()
```

`markViewerAsKicked()`는 과거 메시지를 삭제하지 않습니다. 대신 `.blinded-message`를 추가하고 본문을 블라인드 문구로 바꿔 플레이어가 이미 처리한 대상을 다시 선택하지 못하게 합니다.

### 무한 모드 강퇴

- 이상 시청자이면 점수와 정답 수를 올리고 스테이지 성공 여부를 검사합니다.
- 정상 시청자이면 체력과 점수를 깎고 오답 간섭 효과를 재생합니다.
- 판정 결과가 즉시 공개됩니다.

### 스토리 모드 강퇴

- 시청자는 즉시 비활성화되지만 정답 여부는 알려 주지 않습니다.
- 강퇴 결과는 `kickedByPlayer`에만 기록합니다.
- 오전 2시에 `finishStoryDay()`가 모든 강퇴를 한꺼번에 판정합니다.

## 12. 무한 모드 흐름

이상 채팅이 나타나면 `startThreatCountdown()`이 호출됩니다.

1. `getStageGraceMs()`가 현재 스테이지 제한시간을 계산합니다.
2. `#threat-timer`가 표시됩니다.
3. `updateThreatCountdown()`이 실제 경과 시간을 차감합니다.
4. 제한시간 안에 해당 시청자를 강퇴하면 정답 처리됩니다.
5. 시간이 0이 되면 `expireThreat()`가 실행됩니다.
6. 체력이 남으면 계속 진행하고, 0이면 `endGame()`으로 이동합니다.
7. 모든 이상 시청자를 처리하면 `finishStage()`가 결과 배경을 열고 현재 설정인 10초 뒤 결과 카드를 공개합니다.
8. 계속 버튼을 누르면 `continueFromStageResult()`가 다음 스테이지를 시작합니다.

스테이지가 올라갈수록 제한시간은 `STAGE_GRACE_STEP_MS`만큼 줄어들지만 `MIN_ANOMALY_GRACE_MS`보다 짧아지지 않습니다.

## 13. 스토리 모드 흐름

한 날은 실제 기본값 `DEFAULT_STORY_DAY_DURATION_MS` 동안 진행되며 게임 내 시간은 오후 7시부터 오전 2시까지 흐릅니다. HUD 시각은 `STORY_CLOCK_STEP_MINUTES`에 따라 30분 단위로만 바뀝니다.

```text
startStoryClock()
        ↓
updateStoryClock()
        ↓
formatStoryTime()
        ↓
오전 2시 도달
        ↓
finishStoryDay()
        ↓
beginStoryNightReveal()
        ↓
검은 화면/형상/오답 효과
        ↓
하루 결과 카드 공개
```

`finishStoryDay()`는 다음 항목을 계산합니다.

- 강퇴한 이상 시청자 수
- 강퇴한 정상 시청자 수
- 처리하지 못한 이상 시청자 수
- 실패한 방송 연결 복구 수(기록 전용, 체력 피해 없음)
- 이상 시청자 미처리와 정상 시청자 오판으로 감소할 체력

결과 계속 버튼은 `continueFromStoryResult()`를 호출합니다.

- 체력이 0이면 최종 게임오버
- 7일차를 완료하면 `storyVictory = true`로 최종 승리
- 그 외에는 `currentStage`를 하루 증가시키고 `startStage()` 실행

## 14. 방송 연결 괴이

`scheduleStreamApparition()`은 현재 게임과 모달 상태를 확인한 뒤 다음 출현을 예약합니다.

### 출현

`spawnStreamApparition()`은 시스템 메시지나 토스트를 만들지 않고 다음 상태를 적용합니다.

- 화면 전체를 바꾸거나 게임 조작을 막지 않습니다.
- 항상 상단에 있는 `#connection-widget`을 초록색 `좋음`에서 노란색 `보통`으로 바꿉니다.
- 전체 대응 시간의 40%인 3.2초가 지나면 `weakenStreamConnection()`이 빨간색 `약함`으로 바꿉니다.
- 제한시간의 마지막 2초가 시작되면 `startConnectionMosaic()`이 방송 화면에만 `.connection-pixelated`를 적용합니다.
- 모자이크는 큰 픽셀 블록이 불규칙하게 이동해 낮은 해상도의 영상처럼 보이며, 위젯과 채팅에는 적용되지 않습니다.
- 플레이어의 현재 초점을 강제로 이동하지 않습니다.
- `APPARITION_LIFETIME_MS`인 8초 동안 제한시간 측정

### 성공

재연결 버튼을 누르면 `reconnectStreamConnection()`이 실행됩니다.

- 작은 와이파이 위젯을 초록색 `좋음` 상태로 복구
- 제한시간 안이면 복구 성공 수와 점수 증가
- 다음 출현 예약

### 정상 연결에서 누른 경우

괴이가 없어 초록색 `좋음`인 상태에서도 재연결 버튼은 계속 누를 수 있습니다. 이때는 오판으로 처리합니다.

- 체력 1 감소
- `falseReconnects` 누계 증가
- 위젯에 `.is-false-reconnect`를 적용하고 `좋음 · 오판`을 잠시 표시
- 체력이 0이면 현재 모드의 게임오버 흐름으로 이동

### 실패

시간 안에 연결을 누르지 않으면 `expireStreamApparition()`이 실행됩니다.

- 실패는 한 번만 기록되고 위젯에 `.is-disconnected`와 검은색 `끊김`이 표시됩니다.
- `끊김`으로 바뀌는 순간 `.connection-pixelated`를 제거하므로 직전 2초의 모자이크는 즉시 사라집니다.
- 체력과 점수는 감소하지 않습니다.
- 이후 자동 채팅은 실제 판정값과 관계없이 화면에서 이상 채팅처럼 깨져 보입니다.
- 정상 시청자의 실제 판정값은 유지되므로 이 상태에서 강퇴하면 오판입니다.
- 실패 후에도 위젯은 자동 복구되지 않으며 반드시 `재연결` 버튼을 눌러야 `좋음`으로 돌아갑니다.

## 15. 결과 공개 지연

무한 스테이지 결과와 최종 결과는 `beginStandardResultReveal()`이 배경과 `SIGNAL ANALYSIS` 문구를 먼저 표시하고 `RESULT_REVEAL_DELAY_MS`인 10초 뒤 카드를 공개합니다. 스토리 결과도 `beginStoryNightReveal()`의 공포 연출을 10초 동안 보여 준 뒤 일일 판정 카드를 공개합니다. 대기 중에는 결과 버튼을 비활성화하고 카드에 `aria-hidden="true"`를 적용합니다.

## 16. 오디오 흐름

### 설정 위치

`bgmconfig.js`의 `BGM_CONFIG`가 상황별 음악 경로를 정의하고, `app-config.js`의 `AUDIO_SETTINGS`가 저장 키와 기본 음량을 정의합니다.

`BGM_CONFIG`의 각 값은 한 곡짜리 배열 또는 여러 곡 배열입니다. 여러 경로를 넣으면 해당 상황에 들어갈 때 한 곡을 무작위 선택합니다. 빈 배열은 현재 재생 중인 곡을 그대로 유지합니다.

```js
const BGM_CONFIG = Object.freeze({
  title: Object.freeze(["assets/title.mp3"]),
  endless: Object.freeze(["assets/endless.mp3"]),
  storyDays: Object.freeze({
    1: Object.freeze(["assets/day-1.mp3"]),
    // 2일차부터 7일차까지 같은 형식으로 지정
  }),
  results: Object.freeze({
    endlessClear: Object.freeze(["assets/clear.mp3"]),
    endlessFailed: Object.freeze(["assets/failed.mp3"]),
    storyCorrect: Object.freeze(["assets/story-correct.mp3"]),
    storyWrong: Object.freeze(["assets/story-wrong.mp3"]),
    victory: Object.freeze(["assets/victory.mp3"]),
    gameOver: Object.freeze(["assets/game-over.mp3"])
  }),
  anomalies: Object.freeze({
    detected: Object.freeze(["assets/anomaly.mp3"]),
    disconnected: Object.freeze(["assets/disconnected.mp3"])
  })
});
```

```js
const AUDIO_SETTINGS = Object.freeze({
  title: { storageKey: "ferret-chess-title-volume", defaultVolume: 15 },
  game: { storageKey: "ferret-chess-game-volume", defaultVolume: 10 }
});
```

### 타이틀 음악

```text
첫 진입 닉네임 폼 제출
    ↓
enterTitleFromEntry()
    ↓
showTitle(false)
    ↓
prepareTitleMusic()
    ↓
stopTitleMusic(false)
    ↓
트랙 선택 및 load()
    ↓
playTitleMusic()
```

첫 진입 화면의 버튼 클릭 또는 Enter 제출이 사용자 활성화 권한을 제공하므로 타이틀 음악이 정상적으로 시작될 가능성이 높습니다. 기본 재생 시도를 끄려면 `prepareTitleMusic()` 마지막의 `playTitleMusic()` 호출을 제거하면 됩니다.

### 게임 음악

`enterGame()`이 새 게임의 1일차 또는 무한 모드 상황을 확정한 뒤 `prepareGameMusic()`을 호출합니다. 이후 `startStage()`가 일차마다 `prepareGameplayMusicForCurrentStage()`를 실행합니다. 결과 화면은 `prepareResultMusic()`, 연결 괴이는 `prepareAnomalyMusic()`으로 전환하며 재연결에 성공하면 현재 일차의 기본 음악으로 돌아옵니다. 사용자가 게임 BGM을 꺼 둔 경우에는 상황이 바뀌어도 꺼진 상태를 유지합니다. 타이틀로 돌아갈 때 `showTitle()`이 `stopGameMusic()`을 호출합니다.

### 음량 저장

range 입력 → `applyVolume()` → `<audio>.volume`과 `<output>` 갱신 → `localStorage` 저장 순서입니다.

### 공포 효과음

게임 진입 시 `primeScareAudio()`가 `AudioContext`를 준비합니다. 이상 채팅 정전기 효과는 `playChatStaticNoise()`가 짧고 작은 노이즈를 만들고, 오답 결과에서는 `playStaticScare()`가 더 길고 큰 노이즈를 재생합니다.

## 17. 앱 파일별 함수 목록

### `app-assets.js`

- 경로 정리: `normalizeVisualAssetPath`
- 이미지 적용: `applyImageAsset`
- CSS 배경 변환: `createCssAssetUrl`
- 전체 초기화: `applyVisualAssets`

### `app-config.js`

함수는 없으며 모든 앱 모듈이 사용하는 상수, DOM 참조, 런타임 상태를 선언합니다.

### `app-chat.js`

- 난수/시청자: `createRoundRandom`, `shuffle`, `createNickname`, `createSeed`, `createViewers`
- 닉네임: `normalizePlayerNickname`, `setNicknameError`, `updateNicknameEasterEgg`, `commitPlayerNickname`, `initializePlayerNickname`
- 이상 문장: `hashText`, `createUnknownChatText`, `getAnomalyPresentation`, `triggerCorruptedChatPulse`
- 메시지 DOM: `createMessage`, `createSystemMessage`, `appendElement`
- 스크롤: `isNearLatest`, `scrollToLatest`
- 엔진 연결: `handleEngineMessage`, `appendSystemMessage`
- 화면 정보: `updateHud`, `showToast`, `updateStreamState`

### `app-audio.js`

- UI 상태: `setTitleMusicUi`, `setGameMusicUi`
- 공통 설정: `normalizeMusicTracks`, `chooseMusicTrack`, `readStoredVolume`, `applyVolume`, `initializeAudioVolumes`
- 타이틀 음악: `playTitleMusic`, `stopTitleMusic`, `prepareTitleMusic`
- 게임 음악: `playGameMusic`, `stopGameMusic`, `switchGameMusicScene`, `getGameplayMusicScene`, `prepareGameplayMusicForCurrentStage`, `prepareGameMusic`, `prepareResultMusic`, `prepareAnomalyMusic`
- 공포 소리: `primeScareAudio`, `emitStaticNoise`, `playChatStaticNoise`, `playStaticScare`

### `app-survival.js`

- 스토리 시계: `stopStoryClock`, `formatStoryTime`, `renderStoryClock`, `updateStoryClock`, `startStoryClock`
- 일시정지: `syncEnginePause`
- 이상 채팅 제한시간: `clearThreatCountdown`, `updateThreatCountdown`, `getStageGraceMs`, `startThreatCountdown`
- 연결 괴이: `getApparitionDelay`, `resetConnectionWidget`, `clearStreamApparition`, `scheduleStreamApparition`, `spawnStreamApparition`, `weakenStreamConnection`, `startConnectionMosaic`, `expireStreamApparition`, `reconnectStreamConnection`, `settleActiveApparitionAsMissed`

### `app-results.js`

- 결과 지연: `clearStandardResultReveal`, `beginStandardResultReveal`
- 화면 간섭: `triggerScreenInterference`
- 무한 모드: `finishStage`, `expireThreat`, `continueFromStageResult`
- 스토리 모드: `appendStoryResultDetail`, `resetStoryNightReveal`, `beginStoryNightReveal`, `finishStoryDay`, `continueFromStoryResult`

### `app-game.js`

- 첫 진입: `showEntryScreen`, `enterTitleFromEntry`
- 화면 전환: `showTitle`, `enterGame`
- 시청자 판정: `openViewerPanel`, `closeViewerPanel`, `markViewerAsKicked`, `kickSelectedViewer`
- 게임 종료: `endGame`
- 입력 보조: `updateComposerState`, `insertAtCursor`, `closeEmojiPanel`
- 개발 API: `exposeDebugApi`
- 게임 시작: `createStageSeed`, `startStage`, `startGame`

### `app.js`

함수 선언보다 DOM 이벤트 연결이 중심입니다.

- 메시지 목록 클릭 → 시청자 패널
- 첫 진입 닉네임 폼 제출 → 닉네임 확정 및 오디오 권한 획득 후 타이틀 전환
- 채팅 form 제출 → 사용자 메시지 추가
- 음악 버튼/음량 range → 오디오 함수
- 타이틀 모드 버튼 → `enterGame`
- 재연결 버튼 → 괴이 연결 복구 또는 정상 연결 오판 처리
- 결과 버튼 → 다음 스테이지/하루 또는 타이틀
- 이모지/보상/주소창/도움말 → 해당 UI 동작
- `visibilitychange` → 엔진 일시정지 동기화
- 마지막에 저장된 닉네임과 음량을 복원하고 첫 진입 화면 표시

## 18. 저장값과 URL 테스트 옵션

### localStorage

| 키 | 내용 |
|---|---|
| `ferret-chess-player-nickname` | 플레이어 닉네임 |
| `ferret-chess-title-volume` | 타이틀 음악 음량 0~100 |
| `ferret-chess-game-volume` | 게임 음악 음량 0~100 |

### URL 파라미터

| 파라미터 | 예시 | 용도 |
|---|---|---|
| `seed` | `index.html?seed=1234` | 같은 시청자와 채팅 흐름 재현 |
| `storyDayMs` | `index.html?storyDayMs=3000` | 스토리 하루를 테스트용 3초로 단축 |

두 값을 같이 쓰려면 `index.html?seed=1234&storyDayMs=3000` 형식으로 지정합니다. `storyDayMs`의 최소값은 1000ms입니다.

## 19. 개발용 디버그 API

게임이 시작되면 `window.horrorChatGame`이 만들어집니다.

| 호출 | 역할 |
|---|---|
| `horrorChatGame.debug()` | 엔진 상태와 시청자 정보를 조회 |
| `horrorChatGame.emitEvent(type, slots, intensity)` | 방송 사건을 강제로 발생 |
| `horrorChatGame.pause()` | 채팅 엔진 일시정지 |
| `horrorChatGame.resume()` | 채팅 엔진 재개 |
| `horrorChatGame.finishDay()` | 스토리 하루를 즉시 종료 |
| `horrorChatGame.spawnApparition()` | 괴이를 즉시 출현 |
| `horrorChatGame.missApparition()` | 현재 괴이를 놓친 것으로 처리 |
| `horrorChatGame.apparition()` | 괴이 성공/실패 통계 조회 |
| `horrorChatGame.restart()` | 현재 모드 새 게임 시작 |

브라우저 개발자 도구 Console에서 사용할 수 있습니다. 타이틀 화면에서는 아직 게임 엔진이 없으므로 `window.horrorChatGame`도 생성되지 않습니다.

## 20. 자주 수정하는 위치

| 바꾸려는 항목 | 파일과 상수/함수 |
|---|---|
| 기본 체력 | `app-config.js`의 `MAX_HEALTH` |
| 스테이지 이상 시청자 수 | `BASE_ANOMALIES_PER_STAGE`, `MAX_ANOMALIES_PER_STAGE`, `STAGES_PER_ADDITIONAL_ANOMALY` |
| 이상 채팅 제한시간 | `BASE_ANOMALY_GRACE_MS`, `MIN_ANOMALY_GRACE_MS`, `STAGE_GRACE_STEP_MS` |
| 스토리 총 일수 | `STORY_TOTAL_DAYS`, `STORY_DAY_INTROS` |
| 스토리 하루 실제 길이 | `DEFAULT_STORY_DAY_DURATION_MS` |
| 스토리 시계 표시 간격 | `STORY_CLOCK_STEP_MINUTES` |
| 닉네임 이스터 에그 | `NICKNAME_EASTER_EGGS` |
| 연결 복구 제한시간 | `APPARITION_LIFETIME_MS` |
| 끊김 직전 모자이크 시간 | `APPARITION_MOSAIC_DURATION_MS` |
| 화면 로고·배경·캐릭터 경로 | `assetconfig.js`의 `ASSET_CONFIG` |
| 스테이지·일일·최종 결과 배경 | `ASSET_CONFIG.results`의 `waitingBackground`, `revealedBackground` |
| 결과 공개 지연 | `RESULT_REVEAL_DELAY_MS` |
| 괴이 등장 간격 | `APPARITION_INITIAL_DELAY_RANGE_MS`, `APPARITION_DELAY_RANGE_MS` |
| 상황별 배경음악 파일 | `bgmconfig.js`의 `BGM_CONFIG` |
| 기본 음량 | `AUDIO_SETTINGS` |
| 타이틀 자동 재생 | `app-audio.js`의 `prepareTitleMusic()` |
| 일반 채팅 문장 | `chat-engine-dialogue.js` |
| 이상 시청자 문장 | `chat-engine-anomalies.js` |
| 새 이상 시청자 등장 주기 | `chat-engine-config.js`의 `anomalyArrivalIntervalMs` |
| 등장 후 이상 채팅 주기 | `chat-engine-config.js`의 `anomalyIntervalMs`, `anomalyLevelFrequencyStep`, `minimumAnomalyIntervalMs` |
| 이상 채팅의 GLITCH 비율 | `chat-engine-config.js`의 `glitchChance` (`0`은 없음, `1`은 항상 GLITCH) |
| 이상 채팅 표시 유형 | `app-chat.js`의 `getAnomalyPresentation()` 및 `createMessage()`의 판별용 `.anomaly-*`, `.ciphered-message` 클래스 |
| 이상 채팅 순간 효과 확률 | `app-config.js`의 `ANOMALY_CHAT_EFFECT_CHANCE` |
| 깨진 문자 재료 | `app-config.js`의 `UNKNOWN_CHAT_TOKENS` |
| 채팅 속도/중복 기준 | `chat-engine-config.js`의 `TUNING` |
| 화면 색상과 크기 | `styles/base.css`의 `:root` 및 `styles/`의 해당 기능 파일 |

## 21. 수정할 때 지켜야 할 사항

1. `index.html`의 JavaScript 로딩 순서를 바꾸지 않습니다.
2. HTML의 `id`를 바꾸면 `app-config.js`의 `querySelector`도 함께 바꿉니다.
3. 모달을 열고 닫을 때 `.open`뿐 아니라 `aria-hidden`도 같이 갱신합니다.
4. 타이틀과 게임 전환 시 `hidden`, `inert`, `aria-hidden`을 함께 관리합니다.
5. 새 타이머를 추가하면 `showTitle()`, `startGame()`, `startStage()` 중 알맞은 정리 위치에도 해제 코드를 추가합니다.
6. 새 채팅 템플릿 ID는 기존 ID와 겹치지 않게 합니다.
7. 이상 대사는 정상 대사 파일이 아니라 `chat-engine-anomalies.js`에 추가합니다.
8. 새 상태 클래스를 추가하면 JavaScript의 추가/제거 위치와 CSS 효과를 함께 문서화합니다.
9. 오디오 재생은 브라우저 정책상 실패할 수 있으므로 항상 `play()` Promise 실패를 처리합니다.
10. 변경 후 무한 모드, 스토리 모드, 강퇴, 괴이, 타이틀 복귀를 각각 확인합니다.

## 22. 빠른 실행 확인 순서

1. `index.html`을 브라우저에서 엽니다.
2. 빈 닉네임으로 제출해 오류가 표시되고 첫 화면에 머무는지 확인합니다.
3. 닉네임을 입력해 타이틀 BGM과 타이틀 전환을 확인한 뒤 무한 모드를 시작합니다.
4. 자동 시청자 채팅이 표시되는지 확인합니다.
5. 사용자 채팅을 입력해 자신의 닉네임으로 표시되는지 확인합니다.
6. 시청자 닉네임을 눌러 기록 모달과 강퇴 버튼을 확인합니다.
7. 정상 상태에서 `재연결`을 눌러 체력이 1 감소하고 오판 상태가 잠시 표시되는지 확인합니다.
8. `horrorChatGame.spawnApparition()`으로 괴이를 발생시켜 위젯이 `보통`에서 `약함`, `끊김`으로 변하는지 확인합니다.
9. `재연결` 버튼을 눌러 위젯이 안정 상태로 복구되고 점수가 증가하는지 확인합니다.
10. 타이틀로 돌아가 스토리 모드를 시작합니다.
11. 개발자 도구에서 `horrorChatGame.finishDay()`를 호출합니다.
12. 검은 화면 연출 뒤 하루 결과가 표시되는지 확인합니다.
13. 음악 버튼, 음량 저장, 화면 크기별 레이아웃을 확인합니다.
