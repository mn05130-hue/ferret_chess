"use strict";

/*
 * 게임 앱의 공유 선언 파일입니다.
 * 이후 로드되는 app-*.js는 이 파일의 전역 lexical binding을 순서대로 참조합니다.
 */

// 랜덤 시청자 닉네임은 형용사+명사+숫자로 만들며 같은 스테이지 안에서는 중복되지 않습니다.
const NICKNAME_ADJECTIVES = [
  "금손", "즐거운", "빛나는", "신나는", "용감한", "엉뚱한",
  "행복한", "졸린", "재빠른", "유쾌한", "반짝이는", "집중한","야무진",
];
const NICKNAME_NOUNS = [
  "뉴비", "유저", "스트리머", "게이머", "시청자", "랭커",
  "챌린저", "방송인", "플레이어", "구독자", "매니저", "클립러", "족쩨비", "시바견",
];

/*
 * 시청자 외형 슬롯입니다. 배열 길이가 한 스테이지의 전체 시청자 수가 됩니다.
 * - badge: 메시지 왼쪽에 표시할 이모지
 * - badgeClass: CSS에서 동전·로봇·왕관 등의 모양을 보정할 클래스
 * - color: 닉네임 글자색
 * 이상 여부와 닉네임은 createViewers()가 시드에 따라 이 외형 위에 추가합니다.
 */
const VIEWER_STYLES = [
  { badge: "🪙", badgeClass: "coin", color: "#52a4f4" },
  { badge: "🪙", badgeClass: "coin", color: "#56b6de" },
  { badge: "🤖", badgeClass: "robot", color: "#d56ab5" },
  { badge: "💜", badgeClass: "heart", color: "#47c9e8" },
  { badge: "👑", badgeClass: "crown", color: "#d983c7" },
  { badge: "🍛", badgeClass: "dish", color: "#55c3d5" },
  { badge: "🎉", badgeClass: "party", color: "#3f9bdc" },
  { badge: "🪙", badgeClass: "coin", color: "#69d09c" },
  { badge: "💗", badgeClass: "heart", color: "#f24e74" },
  { badge: "🪙", badgeClass: "coin", color: "#a374e8" },
  { badge: "🪙", badgeClass: "coin", color: "#ef6f86" },
  { badge: "", badgeClass: "empty", color: "#75a7dc" },
  { badge: "", badgeClass: "empty", color: "#75a7dc" },
  { badge: "", badgeClass: "empty", color: "#75a7dc" },
  { badge: "", badgeClass: "empty", color: "#75a7dc" },
  { badge: "", badgeClass: "empty", color: "#75a7dc" },
  { badge: "", badgeClass: "empty", color: "#75a7dc" },
  { badge: "", badgeClass: "empty", color: "#75a7dc" },
];

/*
 * 게임 규칙 상수입니다. 시간 값의 단위는 이름이 MS로 끝나면 밀리초입니다.
 * - BASE_ANOMALIES_PER_STAGE: 1스테이지에 배치하는 기본 이상 시청자 수
 * - MAX_ANOMALIES_PER_STAGE: 난이도가 올라도 넘지 않는 이상 시청자 상한
 * - STAGES_PER_ADDITIONAL_ANOMALY: 이상 시청자가 한 명씩 늘어나는 스테이지 간격
 * - BASE/MIN_ANOMALY_GRACE_MS: 무한 모드 이상 채팅의 최초/최소 대응 시간
 * - STAGE_GRACE_STEP_MS: 스테이지마다 대응 시간에서 차감하는 값
 * - MAX_MESSAGES: DOM에 남겨 두는 채팅 메시지 최대 개수
 * - MAX_HEALTH: 새 게임 시작 체력
 */
const BASE_ANOMALIES_PER_STAGE = 6;
const MAX_ANOMALIES_PER_STAGE = 12;
const STAGES_PER_ADDITIONAL_ANOMALY = 2;
const BASE_ANOMALY_GRACE_MS = 20000;
const MIN_ANOMALY_GRACE_MS = 6000;
const STAGE_GRACE_STEP_MS = 1000;
const MAX_MESSAGES = 100;
const MAX_HEALTH = 5;

/*
 * 스토리 시간 규칙입니다.
 * 실제 84초(DEFAULT_STORY_DAY_DURATION_MS)를 게임 속 7시간으로 환산합니다.
 * STORY_CLOCK_STEP_MINUTES는 HUD 시각이 한 번에 진행하는 게임 속 시간이며,
 * URL의 storyDayMs 값으로 테스트용 하루 길이만 바꿀 수 있습니다.
 */
const STORY_TOTAL_DAYS = 7;
const STORY_START_MINUTES = 19 * 60;
const STORY_DURATION_MINUTES = 7 * 60;
const STORY_CLOCK_STEP_MINUTES = 30;
const DEFAULT_STORY_DAY_DURATION_MS = 140000;

/*
 * 방송 화면 연결 괴이와 결과 연출 시간입니다.
 * - APPARITION_LIFETIME_MS: 보통/약함 단계에서 재연결할 수 있는 전체 시간
 * - APPARITION_WEAK_STAGE_RATIO: 전체 대응 시간 중 보통에서 약함으로 바뀌는 지점
 * - APPARITION_MOSAIC_DURATION_MS: 연결이 끊기기 직전 모자이크가 유지되는 시간
 * - RESULT_REVEAL_DELAY_MS: 검은 화면 뒤 결과 카드가 나타날 때까지의 시간
 * - *_DELAY_RANGE_MS: 첫 출현과 이후 반복 출현의 [최소, 최대] 대기 범위
 */
const APPARITION_LIFETIME_MS = 8000;
const APPARITION_WEAK_STAGE_RATIO = 0.4;
const APPARITION_MOSAIC_DURATION_MS = 2000;
const RESULT_REVEAL_DELAY_MS = 10000;
const END_REVEAL_DELAY_MS = 1000;
const APPARITION_INITIAL_DELAY_RANGE_MS = Object.freeze([6000, 8000]);
const APPARITION_DELAY_RANGE_MS = Object.freeze([15000, 18000]);

/*
 * 실제 이상 채팅이 새로 표시될 때 재생할 순간 공포 효과입니다.
 * 0.3은 이상 채팅 한 건마다 30% 확률이며, 당첨 뒤 흔들림/정전기를 다시 반반 선택합니다.
 */
const ANOMALY_CHAT_EFFECT_CHANCE = 0.3;
const ANOMALY_CHAT_EFFECT_DURATION_MS = 560;

/*
 * 게임 플레이 중 간간히 들리는 공포 효과음 규칙입니다.
 * 첫 효과음은 조금 일찍 분위기를 잡고, 이후 효과음은 더 긴 무작위 간격으로 반복합니다.
 * 음량은 게임 음량 슬라이더 값에 배율을 적용하되 100%를 넘지 않습니다.
 */
const AMBIENT_HORROR_SFX_INITIAL_DELAY_RANGE_MS = Object.freeze([9000, 16000]);
const AMBIENT_HORROR_SFX_DELAY_RANGE_MS = Object.freeze([18000, 36000]);
const AMBIENT_HORROR_SFX_VOLUME_SCALE = 1.8;

// 내부 분기와 data-game-mode 속성이 공유하는 고정 모드 식별자입니다.
const GAME_MODES = Object.freeze({ ENDLESS: "endless", STORY: "story" });

/*
 * 상단 연결 위젯의 네 단계입니다.
 * key는 CSS의 is-* 클래스와 data-connection-stage 값으로 사용하고,
 * label은 화면 문구와 aria-label을 함께 갱신할 때 사용합니다.
 */
const CONNECTION_STAGES = Object.freeze({
  GOOD: Object.freeze({ key: "good", label: "좋음" }),
  NORMAL: Object.freeze({ key: "normal", label: "보통" }),
  WEAK: Object.freeze({ key: "weak", label: "약함" }),
  DISCONNECTED: Object.freeze({ key: "disconnected", label: "끊김" })
});

// 배열 인덱스 0~6이 각각 1~7일차 시작 시스템 메시지에 대응합니다.
const STORY_DAY_INTROS = Object.freeze([
  "첫 방송입니다. 낯선 시청자들의 기록을 확인하며 새벽 2시까지 버티세요.",
  "어제 차단된 계정과 닮은 이름들이 다시 접속하기 시작했습니다.",
  "채팅 사이에 방송에서 말하지 않은 기억이 섞여 들어옵니다.",
  "자정이 가까워질수록 모니터 바깥에서 알림음이 들립니다.",
  "시청자 수는 줄지 않는데 채팅창의 사람들은 하나씩 사라집니다.",
  "종료 버튼이 사라졌습니다. 오늘도 새벽 2시까지 송출을 유지해야 합니다.",
  "마지막 밤입니다. 이 방송에 남아 있는 이상 연결을 찾아내세요."
]);
/*
 * GLITCH 괴이 또는 연결 끊김 상태의 문장을 만드는 토큰 재료입니다.
 * 이 배열은 화면 표시만 바꾸며 viewer.anomalous 판정이나 원본 엔진 기록은 변경하지 않습니다.
 */
const UNKNOWN_CHAT_TOKENS = Object.freeze([
  "ㄱ▤ɯ", "踰꾩컡諛⑹", "踰꾩컡", "ì¶”ì²", "ƒ ë“œë ¤ìš”", "R▥ɯ", "4444444", "RG이▤ɯ",
  "GGG▤ɯ", "방̶̢̨̛̝̩̭͚̻̦̟͇͕̝̼̺̭̩̥͙̭̥̺̪͓̗̟̝͈͈̻̦͔̞̹́̑̓͂̉͌́̔̄̽̾̋̓̐͊̈́̉̓̄̕̕͘͜͝ͅ송̶̧͙͔͇̝͎̯̋̚을̴̧̧̨̧͕͎̙̖̰̙̖͇͔̬͉̥̜͇̱̦̗̱̳̹̯̮̲͓̻̝͎̖̳̰͉̓̊̈́̒͜͝봐̶̛̬̗̂̃̍̍̎̔̐̐̆̏̐̍̓̏͂͋̀͆͊̿͆͌̿̎̕͝͝주̶̡̛̞̠̖͓̝̩̟̥̬̬͎͇̊̄세̸̡̧̡̛̭͙̲͙̺͈͚͍͖̲͓̺̣̟̤̟̞͈͚̣̘͕͈͉̌̇͊̿͊̐͋̏̽͛̓̀͂͗̋̋͐̐͊͐̈́̾̎̂̃̔̐̊̄ͅͅ요̴̡͖̎̏̎́̅͒͆̅̓̑͒̎̀̎͜", "ㅼ슂", "pps▥ɯ", "G…을▤ɯ", "R라▥ɯ", "RR그",
  "버̵̨̡̢̢̲͖̰̙̣͙͉͔̫̥̙̹͚̠͔͍̗͈͔̦͓̟̽̃͂͊̄̀͊̈́̃͋̈́̅̈́̉̽͗̌͘͘͜͜͝ͅ찌̶̡̪͖̼̯̯͓͓̼̻͉͖̠̪̻̙͈͇̖̱̼̬̫͇̫̺̝̰̮͕̃̾͊̏̏͌̓͑̉͛̋̏̓̚͘̚͝͝ͅͅ", "pp다▤ɯ", "JJ가▥ɯ", "버̶̡̼̹͇̦͇̼͉̣̫̰̲̦̟̰̟̬̟͕̙̤̘̖͖͔͕̫̻̬͕͂̄̀́̚͠ͅ찌̸̨͈͔̞̲̓̎͂̓̈́̈̄̒̅͋̿̌͋̎͛̀̈͊́̃̍́̃̍̉̑̇͘͜͝바̷̡̧̡̛̦̭̯͙̱͙͙̘̞̞͓͈̻̰̗̘̳͍̟͈̦̙̰̠͖̼̋͗̐͐́̎͒̇̈̂́̽͛̊́̑̾͜͜͠͝보̷̡̧̨̢̠̳͓̪̖̣̝͖̞̭̹̪̝̟̻̯̱̯̺̳͎̦̱̣̺̗̻͉̑̾̋͗̅̓̊͂͒͒͑͒͆͐͑̇̽̋̂͘͜͝͠͝͝", "ᚫ", "ȣ", "҂", "∴", "ƎƎ",
  "ㅿ", "▥ɯR", "J. JJ", "G…p", "R▤ɯR", "텛泥쒕", "ì°Œë°©ì†", "j▥ɯ"
]);

/*
 * HTML의 주요 조작 지점을 한 번만 조회해 모든 기능 모듈이 같은 요소를 공유합니다.
 * 로드 시점에 index.html 본문이 이미 파싱되어 있으므로 각 값은 HTMLElement이며,
 * id를 변경할 때는 이 선택자와 해당 요소를 쓰는 기능 파일도 함께 수정해야 합니다.
 */
// 앱 루트 및 세 화면: 진입 화면 → 타이틀 → 실제 게임 순서로 표시 상태를 전환합니다.
const chatApp = document.querySelector(".chat-app");
const entryScreen = document.querySelector("#entry-screen");
const entryForm = document.querySelector("#entry-form");
const entryGate = document.querySelector("#entry-gate");
const titleScreen = document.querySelector("#title-screen");
const gameScreen = document.querySelector("#game-screen");
const gameStart = document.querySelector("#game-start");
const storyStart = document.querySelector("#story-start");

// assetconfig.js의 경로를 받을 첫 화면 로고와 방송 캐릭터 이미지입니다.
const entryLogo = document.querySelector(".entry-logo");
const streamCharacter = document.querySelector(".stream-character");

// 진입 화면의 플레이어 닉네임 입력·오류 표시 요소입니다.
const playerNicknameInput = document.querySelector("#player-nickname");
const nicknameError = document.querySelector("#nickname-error");
const nicknameEasterEgg = document.querySelector("#nickname-easter-egg");

// 타이틀/게임 음악의 audio, 재생 버튼, 음량 입력, 퍼센트 출력입니다.
const titleMusic = document.querySelector("#title-music");
const titleMusicButton = document.querySelector("#title-music-button");
const titleMusicLabel = document.querySelector("#title-music-label");
const titleVolume = document.querySelector("#title-volume");
const titleVolumeValue = document.querySelector("#title-volume-value");
const gameMusic = document.querySelector("#game-music");
const gameMusicButton = document.querySelector("#game-music-button");
const gameVolume = document.querySelector("#game-volume");
const gameVolumeValue = document.querySelector("#game-volume-value");

// 실시간 채팅 목록과 입력기, 이모지·보상·새 메시지 조작 요소입니다.
const messageList = document.querySelector("#message-list");
const messageForm = document.querySelector("#message-form");
const messageInput = document.querySelector("#message-input");
const emojiButton = document.querySelector("#emoji-button");
const emojiPanel = document.querySelector("#emoji-panel");
const rewardButton = document.querySelector("#reward-button");
const rewardLabel = document.querySelector("#reward-label");
const newMessageButton = document.querySelector("#new-message-button");

// 가상 주소창과 접기 버튼입니다.
const browserBar = document.querySelector(".browser-bar");
const collapseButton = document.querySelector(".collapse-button");

// 게임 HUD: 이상 수, 점수, 진행도, 체력, 게임 시각과 도움말을 표시합니다.
const anomalyDisplay = document.querySelector("#anomaly-display");
const anomalyLabel = document.querySelector("#anomaly-label");
const scoreDisplay = document.querySelector("#score-display");
const stageDisplay = document.querySelector("#stage-display");
const progressLabel = document.querySelector("#progress-label");
const healthDisplay = document.querySelector("#health-display");
const timeStatLabel = document.querySelector("#time-stat-label");
const storyClock = document.querySelector("#story-clock");
const helpButton = document.querySelector("#help-button");

// 닉네임 클릭으로 여는 시청자 기록 및 강퇴 모달입니다.
const viewerBackdrop = document.querySelector("#viewer-backdrop");
const viewerName = document.querySelector("#viewer-name");
const viewerHistory = document.querySelector("#viewer-history");
const panelClose = document.querySelector("#panel-close");
const kickButton = document.querySelector("#kick-button");

// 체력 소진 또는 7일 생존 뒤 표시하는 최종 결과 모달입니다.
const gameOverlay = document.querySelector("#game-overlay");
const resultCard = document.querySelector(".result-card");
const resultKicker = document.querySelector("#result-kicker");
const resultTitle = document.querySelector("#result-title");
const resultCopy = document.querySelector("#result-copy");
const finalScore = document.querySelector("#final-score");
const finalStage = document.querySelector("#final-stage");
const finalProgressLabel = document.querySelector("#final-progress-label");
const gameRetry = document.querySelector("#game-retry");
const gameRestart = document.querySelector("#game-restart");

// 무한 모드에서 한 번의 탐지 성공/실패 뒤 표시하는 스테이지 결과입니다.
const stageOverlay = document.querySelector("#stage-overlay");
const stageCard = document.querySelector(".stage-card");
const stageResultKicker = document.querySelector("#stage-result-kicker");
const stageResultMark = document.querySelector("#stage-result-mark");
const stageResultTitle = document.querySelector("#stage-result-title");
const stageResultCopy = document.querySelector("#stage-result-copy");
const stageCaught = document.querySelector("#stage-caught");
const stageMissed = document.querySelector("#stage-missed");
const stageWrong = document.querySelector("#stage-wrong");
const stageHealth = document.querySelector("#stage-health");
const stageContinue = document.querySelector("#stage-continue");

// 스토리 모드 오전 2시 판정의 공포 연출, 요약, 상세 결과입니다.
const storyNightOverlay = document.querySelector("#story-night-overlay");
const storyNightCard = document.querySelector(".story-night-card");
const storyResultKicker = document.querySelector("#story-result-kicker");
const storyResultTitle = document.querySelector("#story-result-title");
const storyResultCopy = document.querySelector("#story-result-copy");
const storyCaught = document.querySelector("#story-caught");
const storyMissed = document.querySelector("#story-missed");
const storyWrong = document.querySelector("#story-wrong");
const storyApparitionMissed = document.querySelector("#story-apparition-missed");
const storyHealth = document.querySelector("#story-health");
const storyResultDetails = document.querySelector("#story-result-details");
const storyContinue = document.querySelector("#story-continue");

// 일시 안내, 방송 상태, 무한 모드 제한시간, 연결 괴이 위젯입니다.
const toast = document.querySelector("#toast");
const streamViewerCount = document.querySelector("#stream-viewer-count");
const streamSignal = document.querySelector("#stream-signal");
const threatTimer = document.querySelector("#threat-timer");
const threatSeconds = document.querySelector("#threat-seconds");
const connectionWidget = document.querySelector("#connection-widget");
const connectionStatus = document.querySelector("#connection-status");
const reconnectButton = document.querySelector("#reconnect-button");
const screenInterference = document.querySelector("#screen-interference");

/*
 * 채팅 디렉터 내부 상태를 플레이어에게 보여 줄 한국어 신호 문구로 변환합니다.
 * 키는 TUNING.intervals/stateIntents와 같고 값은 방송 하단의 stream-signal에 표시합니다.
 */
const STREAM_STATE_LABELS = {
  AMBIENT: " ",
  TENSE: "",
  BURST: "",
  AFTERMATH: "",
  LULL: "미약한 신호"
};

/*
 * 음량 종류별 저장 규칙입니다.
 * storageKey는 localStorage 키이고 defaultVolume은 저장값이 없을 때의 0~100 값입니다.
 * 타이틀 음악 재생 여부는 저장하지 않으며, 타이틀 진입 시 prepareTitleMusic()이 재생을 시도합니다.
 */
const AUDIO_SETTINGS = Object.freeze({
  title: { storageKey: "ferret-chess-title-volume", defaultVolume: 15 },
  game: { storageKey: "ferret-chess-game-volume", defaultVolume: 10 }
});

/*
 * 첫 진입 화면의 닉네임 이스터 에그 목록입니다.
 * 왼쪽 키는 감지할 닉네임, 오른쪽 값은 입력란 아래에 나타낼 특수 문구입니다.
 * 닉네임은 앞뒤 공백과 영문 대소문자를 무시해 비교하며, 새 항목은 같은 형식으로 추가할 수 있습니다.
 */
const NICKNAME_EASTER_EGGS = Object.freeze({
  "버찌": "그 이름은 이미 방송 안에 있습니다.",
  "너나비": "왕큰왕왕큰.",
  "치쿠사마": "선샌니",
  "모나": "뱀파이어가 입장했습니다.",
  "시네진": "이마 큰 미소녀",

});

// 플레이어 닉네임을 다음 방문에도 복원하기 위한 localStorage 키입니다.
const PLAYER_NICKNAME_STORAGE_KEY = "ferret-chess-player-nickname";

// URL 파라미터는 재현 가능한 테스트(seed)와 빠른 스토리 테스트(storyDayMs)를 지원합니다.
const seedParameter = new URLSearchParams(window.location.search).get("seed");
const fixedSeed = seedParameter !== null && /^\d+$/.test(seedParameter) ? Number(seedParameter) >>> 0 : null;
const storyDayDurationParameter = new URLSearchParams(window.location.search).get("storyDayMs");
const parsedStoryDayDuration = Number(storyDayDurationParameter);
const storyDayDurationMs = storyDayDurationParameter !== null
  && /^\d+$/.test(storyDayDurationParameter)
  && Number.isFinite(parsedStoryDayDuration)
  ? Math.max(1000, parsedStoryDayDuration)
  : DEFAULT_STORY_DAY_DURATION_MS;


// 하루의 90% 안에 모든 이상 시청자가 등장하도록 여유를 둡니다.
const anomalyArrivalMaxMs = Math.floor(
  storyDayDurationMs * 0.9 / MAX_ANOMALIES_PER_STAGE
);

TUNING.anomalyArrivalIntervalMs[0] = Math.min(
  TUNING.anomalyArrivalIntervalMs[0],
  Math.floor(anomalyArrivalMaxMs * 0.6)
);
TUNING.anomalyArrivalIntervalMs[1] = Math.min(
  TUNING.anomalyArrivalIntervalMs[1],
  anomalyArrivalMaxMs
);

/*
 * 한 게임 전체에서 유지되는 핵심 상태입니다.
 * - viewers/myNickname: 현재 스테이지 시청자 목록과 플레이어 이름
 * - health/score/currentStage: 체력, 누적 점수, 현재 스테이지 또는 일차
 * - caught/missed/wrong: 최종 결과에 표시할 누적 판정 통계
 * - selectedViewerId: 기록 모달에서 현재 선택한 강퇴 후보
 * - gameMode/gameOver/stageReviewOpen: 화면 입력과 타이머를 막는 진행 상태
 */
let viewers = [];
let myNickname = "";
let health = MAX_HEALTH;
let remainingAnomalies = BASE_ANOMALIES_PER_STAGE;
let score = 0;
let currentStage = 1;
let caughtAnomalies = 0;
let missedAnomalies = 0;
let wrongKicks = 0;
let selectedViewerId = null;
let gameMode = GAME_MODES.ENDLESS;
let gameOver = false;
let stageReviewOpen = false;
/*
 * 무한 모드 제한시간 및 공통 실행 자원입니다.
 * pendingThreat는 현재 추적 중인 시청자이고, 나머지 Timer/Interval 값은
 * 화면을 바꾸거나 게임을 재시작할 때 반드시 해제해야 하는 브라우저 예약 ID입니다.
 */
let pendingThreat = null;
let threatRemainingMs = 0;
let chatEngine = null;
let toastTimer;
let threatInterval;
let threatLastTick = 0;
let interferenceTimer;
let currentSeed = 0;
// 스토리 시계의 interval, 누적 실제 시간, 직전 tick, 7일 생존 여부입니다.
let storyClockInterval;
let storyElapsedMs = 0;
let storyLastTick = 0;
let storyVictory = false;
let lastDamageReason = "missed";
/*
 * 상단 연결 괴이 상태입니다.
 * active는 연결 괴이가 출현했음을, expired는 복구 시간이 지나 끊김이 됐음을 뜻합니다.
 * day 접두 통계는 하루 결과용이며 접두어가 없는 통계는 최종 결과까지 누적합니다.
 */
let apparitionRandom = Math.random;
let apparitionSpawnTimer;
let apparitionWeakTimer;
let apparitionMosaicTimer;
let apparitionExpireTimer;
let connectionFeedbackTimer;
let apparitionActive = false;
let apparitionExpired = false;
let falseReconnects = 0;
let banishedApparitions = 0;
let missedApparitions = 0;
let dayBanishedApparitions = 0;
let dayMissedApparitions = 0;
// 화면 전환·결과 공개·공포 효과음·채팅 흔들림이 중복 실행되지 않게 보관하는 자원입니다.
let entryTransitionTimer;
let storyRevealTimer;
let storyScareTimer;
let resultRevealTimer;
let scareAudioContext;
let corruptedChatTimer;
let anomalyChatEffectTimer;
let ambientHorrorSfxTimer;
let ambientHorrorSfxPlayers = [];
let ambientHorrorSfxQueue = [];
let lastAmbientHorrorSfxPath = "";
