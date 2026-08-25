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
  { badge: "", badgeClass: "empty", color: "#75a7dc" }
];

// 난이도, 스토리 시간, 괴이 출현 주기를 조절하는 게임플레이 상수입니다.
const BASE_ANOMALIES_PER_STAGE = 5;
const MAX_ANOMALIES_PER_STAGE = 10;
const STAGES_PER_ADDITIONAL_ANOMALY = 2;
const BASE_ANOMALY_GRACE_MS = 20000;
const MIN_ANOMALY_GRACE_MS = 6000;
const STAGE_GRACE_STEP_MS = 900;
const MAX_MESSAGES = 100;
const MAX_HEALTH = 3;
const STORY_TOTAL_DAYS = 7;
const STORY_START_MINUTES = 19 * 60;
const STORY_DURATION_MINUTES = 7 * 60;
const DEFAULT_STORY_DAY_DURATION_MS = 84000;
const APPARITION_LIFETIME_MS = 4000;
const RESULT_REVEAL_DELAY_MS = 4000;
const APPARITION_INITIAL_DELAY_RANGE_MS = Object.freeze([5000, 8000]);
const APPARITION_DELAY_RANGE_MS = Object.freeze([12000, 18000]);
const GAME_MODES = Object.freeze({ ENDLESS: "endless", STORY: "story" });
const STORY_DAY_INTROS = Object.freeze([
  "첫 방송입니다. 낯선 시청자들의 기록을 확인하며 새벽 2시까지 버티세요.",
  "어제 차단된 계정과 닮은 이름들이 다시 접속하기 시작했습니다.",
  "채팅 사이에 방송에서 말하지 않은 기억이 섞여 들어옵니다.",
  "자정이 가까워질수록 모니터 바깥에서 알림음이 들립니다.",
  "시청자 수는 줄지 않는데 채팅창의 사람들은 하나씩 사라집니다.",
  "종료 버튼이 사라졌습니다. 오늘도 새벽 2시까지 송출을 유지해야 합니다.",
  "마지막 밤입니다. 이 방송에 남아 있는 이상 연결을 찾아내세요."
]);
const UNKNOWN_CHAT_TOKENS = Object.freeze([
  "ㄱ▤ɯ", "G의", "GG", "뾰", "JJG", "R▥ɯ", "JJ나는", "RRG이▤ɯ",
  "GGG▤ɯ", "R를", "Gflies", "pps▥ɯ", "G…을▤ɯ", "R라▥ɯ", "RR그",
  "Grar", "pp다▤ɯ", "JJ가▥ɯ", "GGGyard", "ᚫ", "ȣ", "҂", "∴", "ƎƎ",
  "ㅿ", "▥ɯR", "J. JJ", "G…p", "R▤ɯR", "GG그", "RRG", "j▥ɯ"
]);

// HTML의 주요 조작 지점을 한 번만 조회해 모든 기능 모듈이 같은 요소를 공유합니다.
const chatApp = document.querySelector(".chat-app");
const entryScreen = document.querySelector("#entry-screen");
const entryForm = document.querySelector("#entry-form");
const entryGate = document.querySelector("#entry-gate");
const titleScreen = document.querySelector("#title-screen");
const gameScreen = document.querySelector("#game-screen");
const gameStart = document.querySelector("#game-start");
const storyStart = document.querySelector("#story-start");
const playerNicknameInput = document.querySelector("#player-nickname");
const nicknameError = document.querySelector("#nickname-error");
const titleMusic = document.querySelector("#title-music");
const titleMusicButton = document.querySelector("#title-music-button");
const titleMusicLabel = document.querySelector("#title-music-label");
const titleVolume = document.querySelector("#title-volume");
const titleVolumeValue = document.querySelector("#title-volume-value");
const gameMusic = document.querySelector("#game-music");
const gameMusicButton = document.querySelector("#game-music-button");
const gameVolume = document.querySelector("#game-volume");
const gameVolumeValue = document.querySelector("#game-volume-value");
const messageList = document.querySelector("#message-list");
const messageForm = document.querySelector("#message-form");
const messageInput = document.querySelector("#message-input");
const emojiButton = document.querySelector("#emoji-button");
const emojiPanel = document.querySelector("#emoji-panel");
const rewardButton = document.querySelector("#reward-button");
const rewardLabel = document.querySelector("#reward-label");
const newMessageButton = document.querySelector("#new-message-button");
const browserBar = document.querySelector(".browser-bar");
const collapseButton = document.querySelector(".collapse-button");
const anomalyDisplay = document.querySelector("#anomaly-display");
const anomalyLabel = document.querySelector("#anomaly-label");
const scoreDisplay = document.querySelector("#score-display");
const stageDisplay = document.querySelector("#stage-display");
const progressLabel = document.querySelector("#progress-label");
const healthDisplay = document.querySelector("#health-display");
const timeStatLabel = document.querySelector("#time-stat-label");
const storyClock = document.querySelector("#story-clock");
const helpButton = document.querySelector("#help-button");
const viewerBackdrop = document.querySelector("#viewer-backdrop");
const viewerName = document.querySelector("#viewer-name");
const viewerHistory = document.querySelector("#viewer-history");
const panelClose = document.querySelector("#panel-close");
const kickButton = document.querySelector("#kick-button");
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
const toast = document.querySelector("#toast");
const streamViewerCount = document.querySelector("#stream-viewer-count");
const streamSignal = document.querySelector("#stream-signal");
const threatTimer = document.querySelector("#threat-timer");
const threatSeconds = document.querySelector("#threat-seconds");
const connectionWidget = document.querySelector("#connection-widget");
const connectionStatus = document.querySelector("#connection-status");
const reconnectButton = document.querySelector("#reconnect-button");
const screenInterference = document.querySelector("#screen-interference");

// 채팅 디렉터 내부 상태를 플레이어에게 보여 줄 한국어 신호 문구로 변환합니다.
const STREAM_STATE_LABELS = {
  AMBIENT: "연결 안정",
  TENSE: "신호 흔들림",
  BURST: "§§§ 감지",
  AFTERMATH: "?????",
  LULL: "미약한 신호"
};
const TITLE_MUSIC_TRACKS = Object.freeze([
  "assets/title-1.mp3",
  "assets/title-2.mp3"
]);
const GAME_MUSIC_TRACKS = Object.freeze([
  "assets/gameplay-1.mp3",
  "assets/gameplay-2.mp3"
]);
const AUDIO_SETTINGS = Object.freeze({
  title: { storageKey: "ferret-chess-title-volume", defaultVolume: 15 },
  game: { storageKey: "ferret-chess-game-volume", defaultVolume: 10 }
});
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

// 점수, 모드, 스테이지, 판정 결과처럼 한 게임 전체에서 유지되는 핵심 상태입니다.
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
// 무한 모드의 이상 채팅 제한시간과 채팅 엔진 인스턴스 상태입니다.
let pendingThreat = null;
let threatRemainingMs = 0;
let chatEngine = null;
let toastTimer;
let threatInterval;
let threatLastTick = 0;
let interferenceTimer;
let currentSeed = 0;
// 스토리 모드의 오후 7시~오전 2시 가상 시계를 실제 경과 시간에 매핑합니다.
let storyClockInterval;
let storyElapsedMs = 0;
let storyLastTick = 0;
let storyVictory = false;
let lastDamageReason = "missed";
// 상단 연결 괴이의 난수, 출현/만료/오판 타이머와 누적 복구 결과입니다.
let apparitionRandom = Math.random;
let apparitionSpawnTimer;
let apparitionExpireTimer;
let connectionFeedbackTimer;
let apparitionActive = false;
let apparitionExpired = false;
let falseReconnects = 0;
let banishedApparitions = 0;
let missedApparitions = 0;
let dayBanishedApparitions = 0;
let dayMissedApparitions = 0;
// 하루 결과 공포 연출, 오답 효과음, 이상 채팅 흔들림에 사용하는 일회성 자원입니다.
let entryTransitionTimer;
let storyRevealTimer;
let storyScareTimer;
let resultRevealTimer;
let scareAudioContext;
let corruptedChatTimer;
