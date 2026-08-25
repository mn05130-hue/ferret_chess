(() => {
  "use strict";

  const NICKNAME_ADJECTIVES = [
    "금손", "즐거운", "빛나는", "신나는", "용감한", "엉뚱한",
    "행복한", "졸린", "재빠른", "유쾌한", "반짝이는", "집중한","족쩨비"
  ];
  const NICKNAME_NOUNS = [
    "뉴비", "유저", "스트리머", "게이머", "시청자", "랭커",
    "챌린저", "방송인", "플레이어", "구독자", "매니저", "클립러"
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

  const ANOMALIES_PER_STAGE = 1;
  const BASE_ANOMALY_GRACE_MS = 20000;
  const MIN_ANOMALY_GRACE_MS = 6000;
  const STAGE_GRACE_STEP_MS = 900;
  const MAX_MESSAGES = 100;
  const MAX_HEALTH = 3;
  const STORY_TOTAL_DAYS = 7;
  const STORY_START_MINUTES = 19 * 60;
  const STORY_DURATION_MINUTES = 7 * 60;
  const DEFAULT_STORY_DAY_DURATION_MS = 84000;
  const APPARITION_LIFETIME_MS = 4500;
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
  const DISORDERED_CHAT_PATTERNS = Object.freeze([
    // 단어의 분해·합성, 신어 조작
    "문 밖을 봤는데 밖문이 먼저 나를 봤어\n창문을 닫아도 눈창문은 아직 열려 있어",
    "방송을 끄면 끝방송이 시작돼\n끝난 뒤에도 보는 사람은 남시청자라고 불러",
    "복도 끝과 방 안이 붙어서 복방도가 됐어\n거기서 네 발소리가 먼저 걸어오고 있어",
    "오늘밤은 밤오늘이라서 아직 어제가 안 끝났어\n{player}도 어제 쪽에 그대로 앉아 있잖아",

    // 빠른 비약과 기이한 인과
    "빨간 불은 녹화고 녹화는 기억이고\n기억은 어제고 어제는 네 뒤에 서 있었어",
    "시청자는 숫자고 숫자는 세는 거고\n하나를 더 세면 네 방에는 지금 둘이야",
    "방송은 전파로 오고 전파는 벽을 지나가고\n벽 안은 비어 있으니까 누군가 들어가기 좋겠네",
    "네 목소리가 스피커에서 나오면 스피커도 너고\n방금 꺼진 스피커 안의 너는 아직 말하고 있어",

    // 사고 지연과 갑작스러운 단절
    "아까 네 뒤에... 아니...\n그게 아직 이름을... ...이제 고개를 들었어",
    "창문에 뭐가 비쳐서... 잠깐만...\n내가 왜 네 방 이야기를 하고 있었지",
    "{source} 그 말 다음에는...\n........................\n이번 주말에는 문을 열지 마",
    "지금 화면 오른쪽에...\n아니야 잊어버렸어\n그런데 왜 그게 조금 더 가까워졌지",

    // 빙빙 도는 설명과 논점 이탈
    "처음에는 시계가 느린 줄 알았어 시계는 두 시에 멈추고\n두 시는 문이 닫히는 시간이고 문은 안에서 잠갔는데\n아무튼 네 뒤에서 계속 두드리고 있어",
    "오늘 방송 재밌다 방송은 원래 여러 사람이 같이 보지\n여러 사람은 방이 좁으면 붙어 앉아야 하고\n그래서 네 옆자리도 비어 있으면 안 돼",
    "소리가 작다고 했지 작은 건 가까이 가야 들리고\n가까이 가면 화면에 얼굴이 커지고\n그 얼굴은 네 얼굴이 아니야",
    "{source}라는 말은 끝났고 끝난 말은 처음으로 돌아가니까\n처음부터 나는 그 말을 한 적이 없어\n그런데 네가 왜 대답했어",

    // 지리멸렬, 말비빔, 동문서답
    "네가 모르는 얼굴을 아는 사람이 다시 기억하면\n처음 얼굴이 나중 얼굴을 보고 안 닮았다는 게 맞는 거야?",
    "문은 닫힌 쪽이 열려 있고 열린 쪽은 방이 아니라서\n나가려면 계속 안으로 들어오면 돼",
    "복도, 손톱, 시청자, 두 번째 의자, 새벽 두 시.\n복도, 손톱, 시청자, 두 번째 의자, 새벽 두 시.",
    "카메라, 젖은 머리카락, 비밀번호, 천장, {player}.\n천장, {player}, 카메라, 아직 방송 중.",
    "왜 여기 있냐고 물었지?\n지금 비는 오지 않는데 네 창문은 젖어 있어",
    "누가 채팅을 썼냐고?\n오늘은 목요일이고 냉장고 문이 세 번 열렸어"
  ]);

  const chatApp = document.querySelector(".chat-app");
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
  const streamApparition = document.querySelector("#stream-apparition");
  const screenInterference = document.querySelector("#screen-interference");

  const STREAM_STATE_LABELS = {
    AMBIENT: "연결 안정",
    TENSE: "신호 흔들림",
    BURST: "간섭 감지",
    AFTERMATH: "신호 복구 중",
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
    title: { storageKey: "ferret-chess-title-volume", defaultVolume: 45 },
    game: { storageKey: "ferret-chess-game-volume", defaultVolume: 35 }
  });
  const PLAYER_NICKNAME_STORAGE_KEY = "ferret-chess-player-nickname";

  const seedParameter = new URLSearchParams(window.location.search).get("seed");
  const fixedSeed = seedParameter !== null && /^\d+$/.test(seedParameter) ? Number(seedParameter) >>> 0 : null;
  const storyDayDurationParameter = new URLSearchParams(window.location.search).get("storyDayMs");
  const parsedStoryDayDuration = Number(storyDayDurationParameter);
  const storyDayDurationMs = storyDayDurationParameter !== null
    && /^\d+$/.test(storyDayDurationParameter)
    && Number.isFinite(parsedStoryDayDuration)
    ? Math.max(1000, parsedStoryDayDuration)
    : DEFAULT_STORY_DAY_DURATION_MS;

  let viewers = [];
  let myNickname = "";
  let health = MAX_HEALTH;
  let remainingAnomalies = ANOMALIES_PER_STAGE;
  let score = 0;
  let currentStage = 1;
  let caughtAnomalies = 0;
  let missedAnomalies = 0;
  let wrongKicks = 0;
  let selectedViewerId = null;
  let gameMode = GAME_MODES.ENDLESS;
  let gameOver = false;
  let stageReviewOpen = false;
  let pendingThreat = null;
  let threatRemainingMs = 0;
  let chatEngine = null;
  let toastTimer;
  let threatInterval;
  let threatLastTick = 0;
  let interferenceTimer;
  let currentSeed = 0;
  let storyClockInterval;
  let storyElapsedMs = 0;
  let storyLastTick = 0;
  let storyVictory = false;
  let lastDamageReason = "missed";
  let apparitionRandom = Math.random;
  let apparitionSpawnTimer;
  let apparitionExpireTimer;
  let apparitionActive = false;
  let banishedApparitions = 0;
  let missedApparitions = 0;
  let dayBanishedApparitions = 0;
  let dayMissedApparitions = 0;
  let storyRevealTimer;
  let storyScareTimer;
  let scareAudioContext;
  let corruptedChatTimer;

  function createRoundRandom(seed) {
    let state = (Number(seed) >>> 0) || 0x6d2b79f5;
    return () => {
      state += 0x6d2b79f5;
      let value = state;
      value = Math.imul(value ^ (value >>> 15), value | 1);
      value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
      return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
    };
  }

  function shuffle(items, random) {
    const output = [...items];
    for (let index = output.length - 1; index > 0; index -= 1) {
      const swapIndex = Math.floor(random() * (index + 1));
      [output[index], output[swapIndex]] = [output[swapIndex], output[index]];
    }
    return output;
  }

  function createNickname(usedNicknames, random) {
    let nickname;
    do {
      const adjective = NICKNAME_ADJECTIVES[Math.floor(random() * NICKNAME_ADJECTIVES.length)];
      const noun = NICKNAME_NOUNS[Math.floor(random() * NICKNAME_NOUNS.length)];
      const number = Math.floor(1000 + random() * 9000);
      nickname = `${adjective} ${noun} ${number}`;
    } while (usedNicknames.has(nickname));
    usedNicknames.add(nickname);
    return nickname;
  }

  function createSeed() {
    if (fixedSeed !== null) return fixedSeed;
    if (window.crypto?.getRandomValues) {
      const values = new Uint32Array(1);
      window.crypto.getRandomValues(values);
      return values[0];
    }
    return Date.now() >>> 0;
  }

  function createViewers(seed) {
    const random = createRoundRandom(seed);
    const usedNicknames = new Set(myNickname ? [myNickname] : []);
    const anomalySlots = new Set(shuffle(VIEWER_STYLES.map((_, index) => index), random).slice(0, ANOMALIES_PER_STAGE));
    const createdViewers = VIEWER_STYLES.map((style, index) => ({
      id: `viewer-${index}`,
      name: createNickname(usedNicknames, random),
      anomalous: anomalySlots.has(index),
      history: [],
      active: true,
      kickedByPlayer: false,
      ...style
    }));
    return createdViewers;
  }

  function normalizePlayerNickname(value) {
    return String(value || "").trim().replace(/\s+/g, " ").slice(0, 16);
  }

  function setNicknameError(message = "") {
    const hasError = Boolean(message);
    nicknameError.textContent = message;
    nicknameError.hidden = !hasError;
    playerNicknameInput.setAttribute("aria-invalid", String(hasError));
  }

  function commitPlayerNickname() {
    const nickname = normalizePlayerNickname(playerNicknameInput.value);
    if (!nickname) {
      setNicknameError("게임을 시작하려면 닉네임을 입력하세요.");
      playerNicknameInput.focus();
      return false;
    }

    myNickname = nickname;
    playerNicknameInput.value = nickname;
    setNicknameError();
    try {
      window.localStorage.setItem(PLAYER_NICKNAME_STORAGE_KEY, nickname);
    } catch {
      // 저장소가 차단되어도 현재 게임에서는 입력한 닉네임을 사용합니다.
    }
    return true;
  }

  function initializePlayerNickname() {
    try {
      const savedNickname = normalizePlayerNickname(window.localStorage.getItem(PLAYER_NICKNAME_STORAGE_KEY));
      if (savedNickname) playerNicknameInput.value = savedNickname;
    } catch {
      // 저장소를 사용할 수 없는 환경에서는 빈 입력란으로 시작합니다.
    }
    setNicknameError();
  }

  function hashText(value) {
    let hash = 2166136261;
    for (const character of String(value)) {
      hash ^= character.codePointAt(0);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }

  function createDisorderedChatText(text, viewer) {
    const seed = hashText(`${currentSeed}:${viewer?.id || "unknown"}:${viewer?.history?.length || 0}:${text}`);
    const random = createRoundRandom(seed);
    const source = String(text).replace(/\s+/g, " ").trim();
    const shortenedSource = source.length > 24 ? `${source.slice(0, 23)}…` : source;
    const startIndex = Math.floor(random() * DISORDERED_CHAT_PATTERNS.length);
    const formatPattern = pattern => pattern
      .replaceAll("{player}", () => myNickname)
      .replaceAll("{viewer}", () => viewer?.name || "그 사람")
      .replaceAll("{source}", () => shortenedSource || "방금 그 말");

    for (let offset = 0; offset < DISORDERED_CHAT_PATTERNS.length; offset += 1) {
      const pattern = DISORDERED_CHAT_PATTERNS[(startIndex + offset) % DISORDERED_CHAT_PATTERNS.length];
      const candidate = formatPattern(pattern);
      if (!viewer?.history?.includes(candidate)) return candidate;
    }

    return formatPattern(DISORDERED_CHAT_PATTERNS[startIndex]);
  }

  function triggerCorruptedChatPulse() {
    window.clearTimeout(corruptedChatTimer);
    chatApp.classList.remove("corrupted-chat-hit");
    void messageList.offsetWidth;
    chatApp.classList.add("corrupted-chat-hit");
    corruptedChatTimer = window.setTimeout(() => chatApp.classList.remove("corrupted-chat-hit"), 480);
  }

  function createMessage(viewer, text, ownMessage = false, metadata = {}) {
    const item = document.createElement("li");
    item.className = "message";
    if (metadata.corrupted) item.classList.add("corrupted-message");
    if (ownMessage) item.dataset.ownMessage = "true";
    if (viewer?.id) item.dataset.viewerId = viewer.id;
    if (metadata.intent) item.dataset.intent = metadata.intent;
    if (metadata.state) item.dataset.directorState = metadata.state;

    const badge = document.createElement("span");
    badge.className = `badge ${viewer?.badgeClass || ""}`;
    badge.setAttribute("aria-hidden", "true");
    badge.textContent = viewer?.badge || "";

    const copy = document.createElement("span");
    copy.className = "message-copy";

    const username = document.createElement("button");
    username.type = "button";
    username.className = "username";
    username.style.color = viewer?.color || "#66d5b2";
    username.textContent = viewer?.name || myNickname;
    if (viewer?.id && !ownMessage) username.dataset.viewerId = viewer.id;
    else username.disabled = true;

    const messageText = document.createElement("span");
    messageText.className = "message-text";
    messageText.textContent = text;
    if (metadata.corrupted) messageText.dataset.echo = text.replace(/\s+/g, " ");

    copy.append(username, messageText);
    item.append(badge, copy);
    return item;
  }

  function createSystemMessage(text, danger = false) {
    const item = document.createElement("li");
    item.className = `message system-message${danger ? " danger" : ""}`;
    item.textContent = `[시스템] ${text}`;
    return item;
  }

  function isNearLatest() {
    return messageList.scrollHeight - messageList.scrollTop - messageList.clientHeight < 54;
  }

  function scrollToLatest(behavior = "auto") {
    messageList.scrollTo({ top: messageList.scrollHeight, behavior });
    newMessageButton.hidden = true;
  }

  function appendElement(element, behavior = "smooth") {
    const wasNearLatest = isNearLatest();
    messageList.append(element);

    while (messageList.childElementCount > MAX_MESSAGES) {
      const firstMessage = messageList.firstElementChild;
      const removedHeight = firstMessage.getBoundingClientRect().height;
      firstMessage.remove();
      if (!wasNearLatest) messageList.scrollTop = Math.max(0, messageList.scrollTop - removedHeight);
    }

    if (wasNearLatest) scrollToLatest(behavior);
    else newMessageButton.hidden = false;
  }

  function handleEngineMessage(message) {
    const { viewer, text, historyOnly, behavior } = message;
    const isCorruptedMessage = viewer.anomalous && Boolean(message.anomalyEvidence || message.anomalyMode);
    const displayedText = isCorruptedMessage ? createDisorderedChatText(text, viewer) : text;
    viewer.history.push(displayedText);
    if (viewer.history.length > 10) viewer.history.shift();
    if (historyOnly) return;
    appendElement(createMessage(viewer, displayedText, false, { ...message, corrupted: isCorruptedMessage }), behavior);
    if (isCorruptedMessage) triggerCorruptedChatPulse();

    const isAnomalousLine = viewer.anomalous
      && (message.anomalyEvidence || viewer.anomalyLevel >= 3);
    if (isAnomalousLine && gameMode === GAME_MODES.ENDLESS) startThreatCountdown(viewer);
  }

  function appendSystemMessage(text, danger = false) {
    appendElement(createSystemMessage(text, danger));
  }

  function updateHud() {
    const storyMode = gameMode === GAME_MODES.STORY;
    progressLabel.textContent = storyMode ? "일차" : "스테이지";
    timeStatLabel.textContent = storyMode ? "방송 시간" : "모드";
    anomalyLabel.textContent = storyMode ? "판정" : "남은 이상 시청자";
    anomalyDisplay.textContent = storyMode ? "?" : String(remainingAnomalies);
    scoreDisplay.textContent = String(score).padStart(4, "0");
    stageDisplay.textContent = String(currentStage);
    healthDisplay.textContent = String(health);
    healthDisplay.setAttribute("aria-label", `체력 ${health}`);
    if (!storyMode) storyClock.textContent = "∞";
  }

  function showToast(message) {
    window.clearTimeout(toastTimer);
    toast.textContent = message;
    toast.classList.add("show");
    toastTimer = window.setTimeout(() => toast.classList.remove("show"), 2300);
  }

  function updateStreamState(state) {
    streamSignal.textContent = STREAM_STATE_LABELS[state] || STREAM_STATE_LABELS.AMBIENT;
  }

  function setTitleMusicUi(playing) {
    titleMusicButton.classList.toggle("is-playing", playing);
    titleMusicButton.setAttribute("aria-pressed", String(playing));
    titleMusicButton.setAttribute("aria-label", playing ? "타이틀 배경음악 정지" : "타이틀 배경음악 재생");
    titleMusicLabel.textContent = playing ? "BGM 끄기" : "BGM 켜기";
  }

  function setGameMusicUi(playing) {
    gameMusicButton.classList.toggle("is-playing", playing);
    gameMusicButton.setAttribute("aria-pressed", String(playing));
    gameMusicButton.setAttribute("aria-label", playing ? "게임 배경음악 정지" : "게임 배경음악 재생");
  }

  function chooseMusicTrack(tracks) {
    let randomValue;
    if (window.crypto?.getRandomValues) {
      const values = new Uint32Array(1);
      window.crypto.getRandomValues(values);
      randomValue = values[0] / 4294967296;
    } else {
      randomValue = Math.random();
    }
    return tracks[Math.floor(randomValue * tracks.length)];
  }

  function readStoredVolume({ storageKey, defaultVolume }) {
    try {
      const storedValue = window.localStorage.getItem(storageKey);
      const storedVolume = Number(storedValue);
      if (storedValue !== null && Number.isFinite(storedVolume) && storedVolume >= 0 && storedVolume <= 100) {
        return storedVolume;
      }
    } catch {
      // 저장소를 사용할 수 없는 환경에서는 기본 음량을 사용합니다.
    }
    return defaultVolume;
  }

  function applyVolume(audio, input, output, settings, value, persist = true) {
    const volume = Math.min(100, Math.max(0, Number(value)));
    audio.volume = volume / 100;
    input.value = String(volume);
    output.value = `${Math.round(volume)}%`;
    output.textContent = output.value;
    if (!persist) return;
    try {
      window.localStorage.setItem(settings.storageKey, String(volume));
    } catch {
      // 저장소가 차단되어도 현재 세션의 음량 조절은 유지합니다.
    }
  }

  function initializeAudioVolumes() {
    applyVolume(titleMusic, titleVolume, titleVolumeValue, AUDIO_SETTINGS.title, readStoredVolume(AUDIO_SETTINGS.title), false);
    applyVolume(gameMusic, gameVolume, gameVolumeValue, AUDIO_SETTINGS.game, readStoredVolume(AUDIO_SETTINGS.game), false);
  }

  async function playTitleMusic() {
    try {
      await titleMusic.play();
      if (titleScreen.hidden) {
        titleMusic.pause();
        return;
      }
      setTitleMusicUi(true);
    } catch {
      setTitleMusicUi(false);
    }
  }

  function stopTitleMusic(reset = true) {
    titleMusic.pause();
    if (reset) titleMusic.currentTime = 0;
    setTitleMusicUi(false);
  }

  function prepareTitleMusic() {
    stopTitleMusic();
    titleMusic.src = chooseMusicTrack(TITLE_MUSIC_TRACKS);
    titleMusic.load();
    playTitleMusic();
  }

  async function playGameMusic() {
    try {
      await gameMusic.play();
      if (!titleScreen.hidden) {
        gameMusic.pause();
        return;
      }
      setGameMusicUi(true);
    } catch {
      setGameMusicUi(false);
    }
  }

  function stopGameMusic(reset = true) {
    gameMusic.pause();
    if (reset) gameMusic.currentTime = 0;
    setGameMusicUi(false);
  }

  function prepareGameMusic() {
    stopGameMusic();
    gameMusic.src = chooseMusicTrack(GAME_MUSIC_TRACKS);
    gameMusic.load();
    playGameMusic();
  }

  function primeScareAudio() {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;
    try {
      scareAudioContext ||= new AudioContextClass();
      if (scareAudioContext.state === "suspended") scareAudioContext.resume().catch(() => {});
    } catch {
      scareAudioContext = null;
    }
  }

  function emitStaticNoise() {
    if (!scareAudioContext || scareAudioContext.state !== "running") return;
    try {
      const duration = .72;
      const frameCount = Math.floor(scareAudioContext.sampleRate * duration);
      const buffer = scareAudioContext.createBuffer(1, frameCount, scareAudioContext.sampleRate);
      const samples = buffer.getChannelData(0);
      for (let index = 0; index < frameCount; index += 1) {
        const envelope = 1 - index / frameCount * .55;
        samples[index] = (Math.random() * 2 - 1) * envelope;
      }

      const source = scareAudioContext.createBufferSource();
      const filter = scareAudioContext.createBiquadFilter();
      const gain = scareAudioContext.createGain();
      const now = scareAudioContext.currentTime;
      const peak = .24 * gameMusic.volume;
      filter.type = "bandpass";
      filter.frequency.value = 1750;
      filter.Q.value = .65;
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(peak, now + .015);
      gain.gain.setValueAtTime(peak * .35, now + .17);
      gain.gain.setValueAtTime(peak, now + .29);
      gain.gain.setValueAtTime(peak * .25, now + .48);
      gain.gain.linearRampToValueAtTime(0, now + duration);
      source.buffer = buffer;
      source.connect(filter).connect(gain).connect(scareAudioContext.destination);
      source.start(now);
    } catch {
      // 오디오 API를 사용할 수 없어도 시각 연출은 그대로 진행합니다.
    }
  }

  function playStaticScare() {
    if (!scareAudioContext) return;
    if (scareAudioContext.state === "suspended") {
      scareAudioContext.resume().then(emitStaticNoise).catch(() => {});
      return;
    }
    emitStaticNoise();
  }

  function stopStoryClock() {
    window.clearInterval(storyClockInterval);
    storyClockInterval = undefined;
  }

  function formatStoryTime(elapsedMs) {
    const progress = Math.min(1, Math.max(0, elapsedMs / storyDayDurationMs));
    const elapsedMinutes = Math.floor(progress * STORY_DURATION_MINUTES);
    const totalMinutes = STORY_START_MINUTES + elapsedMinutes;
    const hour24 = Math.floor(totalMinutes / 60) % 24;
    const minute = totalMinutes % 60;
    const period = hour24 < 12 ? "오전" : "오후";
    const hour12 = hour24 % 12 || 12;
    return `${period} ${hour12}:${String(minute).padStart(2, "0")}`;
  }

  function renderStoryClock() {
    storyClock.textContent = formatStoryTime(storyElapsedMs);
    storyClock.setAttribute("aria-label", `현재 방송 시간 ${storyClock.textContent}`);
  }

  function updateStoryClock() {
    const now = performance.now();
    if (document.hidden || gameOver || stageReviewOpen || gameMode !== GAME_MODES.STORY) {
      storyLastTick = now;
      return;
    }

    storyElapsedMs += Math.max(0, now - storyLastTick);
    storyLastTick = now;
    if (storyElapsedMs >= storyDayDurationMs) {
      storyElapsedMs = storyDayDurationMs;
      renderStoryClock();
      stopStoryClock();
      finishStoryDay();
      return;
    }
    renderStoryClock();
  }

  function startStoryClock() {
    stopStoryClock();
    storyElapsedMs = 0;
    storyLastTick = performance.now();
    renderStoryClock();
    storyClockInterval = window.setInterval(updateStoryClock, 200);
  }

  function syncEnginePause() {
    chatEngine?.setPaused(document.hidden || gameOver || stageReviewOpen);
    storyLastTick = performance.now();
  }

  function clearThreatCountdown(restoreSignal = true) {
    window.clearInterval(threatInterval);
    threatInterval = undefined;
    pendingThreat = null;
    threatRemainingMs = 0;
    threatTimer.hidden = true;
    if (restoreSignal) updateStreamState(chatApp.dataset.directorState || "AMBIENT");
  }

  function updateThreatCountdown() {
    const now = performance.now();
    if (document.hidden || gameOver || stageReviewOpen) {
      threatLastTick = now;
      return;
    }

    threatRemainingMs -= Math.max(0, now - threatLastTick);
    threatLastTick = now;
    threatSeconds.textContent = (Math.max(0, threatRemainingMs) / 1000).toFixed(1);
    if (threatRemainingMs <= 0) expireThreat();
  }

  function getStageGraceMs() {
    return Math.max(
      MIN_ANOMALY_GRACE_MS,
      BASE_ANOMALY_GRACE_MS - (currentStage - 1) * STAGE_GRACE_STEP_MS
    );
  }

  function startThreatCountdown(viewer) {
    if (gameMode === GAME_MODES.STORY || pendingThreat || gameOver || stageReviewOpen || !viewer.active) return;
    const graceMs = getStageGraceMs();
    pendingThreat = viewer;
    threatRemainingMs = graceMs;
    threatLastTick = performance.now();
    threatSeconds.textContent = (graceMs / 1000).toFixed(1);
    threatTimer.hidden = false;
    streamSignal.textContent = "이상 신호 추적 중";
    threatInterval = window.setInterval(updateThreatCountdown, 100);
  }

  function getApparitionDelay([minimum, maximum]) {
    return minimum + apparitionRandom() * (maximum - minimum);
  }

  function hideStreamApparition() {
    window.clearTimeout(apparitionExpireTimer);
    apparitionExpireTimer = undefined;
    apparitionActive = false;
    streamApparition.hidden = true;
  }

  function clearStreamApparition() {
    window.clearTimeout(apparitionSpawnTimer);
    apparitionSpawnTimer = undefined;
    hideStreamApparition();
  }

  function scheduleStreamApparition(initial = false) {
    window.clearTimeout(apparitionSpawnTimer);
    if (gameOver || stageReviewOpen) return;
    const range = initial ? APPARITION_INITIAL_DELAY_RANGE_MS : APPARITION_DELAY_RANGE_MS;
    apparitionSpawnTimer = window.setTimeout(() => {
      apparitionSpawnTimer = undefined;
      if (document.hidden) {
        scheduleStreamApparition(true);
        return;
      }
      spawnStreamApparition();
    }, getApparitionDelay(range));
  }

  function spawnStreamApparition() {
    if (apparitionActive || gameOver || stageReviewOpen || titleScreen.hidden === false) return false;
    window.clearTimeout(apparitionSpawnTimer);
    apparitionSpawnTimer = undefined;
    apparitionActive = true;
    streamApparition.dataset.variant = String(1 + Math.floor(apparitionRandom() * 3));
    streamApparition.style.setProperty("--apparition-x", `${16 + apparitionRandom() * 68}%`);
    streamApparition.style.setProperty("--apparition-y", `${36 + apparitionRandom() * 28}%`);
    streamApparition.hidden = false;
    showToast("방송 화면에 괴이가 나타났습니다. 클릭해서 퇴치하세요!");
    apparitionExpireTimer = window.setTimeout(expireStreamApparition, APPARITION_LIFETIME_MS);
    return true;
  }

  function expireStreamApparition() {
    if (!apparitionActive) return;
    if (document.hidden) {
      apparitionExpireTimer = window.setTimeout(expireStreamApparition, 1000);
      return;
    }

    hideStreamApparition();
    missedApparitions += 1;
    dayMissedApparitions += 1;
    if (gameMode === GAME_MODES.STORY) {
      showToast("괴이가 화면 안쪽으로 숨어들었습니다.");
      scheduleStreamApparition();
      return;
    }

    health = Math.max(0, health - 1);
    score = Math.max(0, score - 75);
    lastDamageReason = "apparition";
    updateHud();
    triggerScreenInterference("color");
    if (health === 0) {
      finishStage({
        success: false,
        title: "화면 괴이 침투",
        copy: "방송 화면의 괴이를 제때 퇴치하지 못해 체력을 모두 잃었습니다."
      });
      return;
    }
    showToast("괴이를 놓쳐 체력이 1 감소했습니다.");
    scheduleStreamApparition();
  }

  function banishStreamApparition() {
    if (!apparitionActive || gameOver || stageReviewOpen) return;
    hideStreamApparition();
    banishedApparitions += 1;
    dayBanishedApparitions += 1;
    score += 100;
    updateHud();
    showToast("화면 괴이를 퇴치했습니다. +100점");
    scheduleStreamApparition();
  }

  function settleActiveApparitionAsMissed() {
    if (!apparitionActive) return;
    hideStreamApparition();
    missedApparitions += 1;
    dayMissedApparitions += 1;
  }

  function triggerScreenInterference(type) {
    window.clearTimeout(interferenceTimer);
    chatApp.classList.remove("interference-mosaic", "interference-color");
    void screenInterference.offsetWidth;
    chatApp.classList.add(type === "mosaic" ? "interference-mosaic" : "interference-color");
    interferenceTimer = window.setTimeout(() => {
      chatApp.classList.remove("interference-mosaic", "interference-color");
    }, type === "mosaic" ? 1200 : 1500);
  }

  function finishStage({ success, title, copy }) {
    if (stageReviewOpen || gameOver) return;
    stageReviewOpen = true;
    clearThreatCountdown(false);
    clearStreamApparition();
    streamSignal.textContent = "스테이지 정산 중";
    closeEmojiPanel();
    closeViewerPanel();
    syncEnginePause();

    stageCard.classList.toggle("failed", !success);
    stageResultKicker.textContent = `STAGE ${String(currentStage).padStart(2, "0")} ${success ? "CLEAR" : "FAILED"}`;
    stageResultMark.textContent = success ? "✓" : "!";
    stageResultTitle.textContent = title;
    stageResultCopy.textContent = copy;
    stageCaught.textContent = String(caughtAnomalies);
    stageMissed.textContent = String(missedAnomalies);
    stageWrong.textContent = String(wrongKicks);
    stageHealth.textContent = String(health);

    const gameEnded = health === 0;
    stageContinue.textContent = gameEnded ? "최종 결과 보기" : "다음 스테이지";
    stageOverlay.classList.add("open");
    stageOverlay.setAttribute("aria-hidden", "false");
    stageContinue.focus();
  }

  function expireThreat() {
    const viewer = pendingThreat;
    if (!viewer?.active || stageReviewOpen || gameOver) {
      clearThreatCountdown();
      return;
    }

    viewer.active = false;
    remainingAnomalies -= 1;
    missedAnomalies += 1;
    health = Math.max(0, health - 1);
    lastDamageReason = "missed";
    score = Math.max(0, score - 100);
    markViewerAsKicked(viewer, "이상 신호에 잠식되어 연결이 끊겼습니다.");
    appendSystemMessage(`${viewer.name}의 이상 신호가 방송에 침투했습니다.`, true);
    updateHud();
    triggerScreenInterference("color");
    finishStage({
      success: false,
      title: "이상 신호 추적 실패",
      copy: `${viewer.name}의 이상 채팅을 제한시간 안에 처리하지 못해 체력이 1 감소했습니다.`
    });
  }

  function appendStoryResultDetail(text, className = "") {
    const item = document.createElement("li");
    item.className = className;
    item.textContent = text;
    storyResultDetails.append(item);
  }

  function resetStoryNightReveal() {
    window.clearTimeout(storyRevealTimer);
    window.clearTimeout(storyScareTimer);
    storyRevealTimer = undefined;
    storyScareTimer = undefined;
    storyNightOverlay.classList.remove("open", "is-wrong", "scare-hit", "results-visible");
    storyNightOverlay.setAttribute("aria-hidden", "true");
    storyNightCard.setAttribute("aria-hidden", "true");
    storyContinue.disabled = true;
  }

  function beginStoryNightReveal(hasWrongAnswer) {
    resetStoryNightReveal();
    storyNightOverlay.classList.toggle("is-wrong", hasWrongAnswer);
    void storyNightOverlay.offsetWidth;
    storyNightOverlay.classList.add("open");
    storyNightOverlay.setAttribute("aria-hidden", "false");

    const revealResults = () => {
      storyNightOverlay.classList.add("results-visible");
      storyNightCard.setAttribute("aria-hidden", "false");
      storyContinue.disabled = false;
      storyContinue.focus();
    };

    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      revealResults();
      return;
    }

    if (hasWrongAnswer) {
      storyScareTimer = window.setTimeout(() => {
        storyNightOverlay.classList.add("scare-hit");
        playStaticScare();
      }, 1800);
    }
    storyRevealTimer = window.setTimeout(revealResults, hasWrongAnswer ? 2750 : 2350);
  }

  function finishStoryDay() {
    if (gameMode !== GAME_MODES.STORY || stageReviewOpen || gameOver) return;
    stageReviewOpen = true;
    stopStoryClock();
    clearThreatCountdown(false);
    settleActiveApparitionAsMissed();
    clearStreamApparition();
    chatEngine?.stop();
    closeEmojiPanel();
    closeViewerPanel();
    streamSignal.textContent = "방송 종료 · 판정 중";

    const kickedViewers = viewers.filter(viewer => viewer.kickedByPlayer);
    const caughtToday = kickedViewers.filter(viewer => viewer.anomalous);
    const wrongToday = kickedViewers.filter(viewer => !viewer.anomalous);
    const missedToday = viewers.filter(viewer => viewer.anomalous && !viewer.kickedByPlayer);
    const damage = wrongToday.length + missedToday.length + dayMissedApparitions;
    const appliedDamage = Math.min(health, damage);

    caughtAnomalies += caughtToday.length;
    missedAnomalies += missedToday.length;
    wrongKicks += wrongToday.length;
    remainingAnomalies = 0;
    health = Math.max(0, health - appliedDamage);
    score = Math.max(0, score + caughtToday.length * 150
      - missedToday.length * 100
      - wrongToday.length * 75
      - dayMissedApparitions * 75);
    if (damage > 0) {
      lastDamageReason = dayMissedApparitions > 0
        ? "apparition"
        : missedToday.length > 0 ? "missed" : "wrong-kick";
    }
    updateHud();

    storyResultKicker.textContent = `DAY ${String(currentStage).padStart(2, "0")} · BROADCAST CLOSED`;
    storyResultTitle.textContent = `${currentStage}일차 방송 결과`;
    if (damage === 0) {
      storyResultCopy.textContent = "오늘의 판단은 정확했습니다. 체력을 잃지 않고 방송을 종료했습니다.";
    } else {
      const reasons = [];
      if (missedToday.length) reasons.push(`이상 시청자 ${missedToday.length}명 놓침`);
      if (wrongToday.length) reasons.push(`정상 시청자 ${wrongToday.length}명 오판`);
      if (dayMissedApparitions) reasons.push(`화면 괴이 ${dayMissedApparitions}회 놓침`);
      storyResultCopy.textContent = `${reasons.join(", ")}으로 체력이 ${appliedDamage} 감소했습니다.`;
    }

    storyCaught.textContent = String(caughtToday.length);
    storyMissed.textContent = String(missedToday.length);
    storyWrong.textContent = String(wrongToday.length);
    storyApparitionMissed.textContent = String(dayMissedApparitions);
    storyHealth.textContent = String(health);
    storyResultDetails.replaceChildren();
    caughtToday.forEach(viewer => appendStoryResultDetail(`이상 연결 차단 성공 · ${viewer.name}`, "correct"));
    missedToday.forEach(viewer => appendStoryResultDetail(`놓친 이상 시청자 · ${viewer.name}`, "danger"));
    wrongToday.forEach(viewer => appendStoryResultDetail(`정상 시청자 오판 · ${viewer.name}`, "danger"));
    if (dayBanishedApparitions) appendStoryResultDetail(`방송 화면 괴이 퇴치 · ${dayBanishedApparitions}회`, "correct");
    if (dayMissedApparitions) appendStoryResultDetail(`방송 화면 괴이 놓침 · ${dayMissedApparitions}회`, "danger");
    if (!storyResultDetails.childElementCount) appendStoryResultDetail("오늘 기록에는 판정할 연결이 없습니다.");

    if (health === 0) storyContinue.textContent = "최종 결과 보기";
    else if (currentStage === STORY_TOTAL_DAYS) storyContinue.textContent = "7일 생존 결과 보기";
    else storyContinue.textContent = `${currentStage + 1}일차 시작`;

    beginStoryNightReveal(damage > 0);
  }

  function continueFromStoryResult() {
    resetStoryNightReveal();

    if (health === 0) {
      stageReviewOpen = false;
      endGame();
      return;
    }

    if (currentStage === STORY_TOTAL_DAYS) {
      storyVictory = true;
      stageReviewOpen = false;
      endGame();
      return;
    }

    currentStage += 1;
    stageReviewOpen = false;
    startStage();
  }

  function continueFromStageResult() {
    stageOverlay.classList.remove("open");
    stageOverlay.setAttribute("aria-hidden", "true");

    if (health === 0) {
      stageReviewOpen = false;
      endGame();
      return;
    }

    currentStage += 1;
    stageReviewOpen = false;
    startStage();
  }

  function showTitle(shouldFocus = true) {
    window.clearTimeout(interferenceTimer);
    window.clearTimeout(corruptedChatTimer);
    interferenceTimer = undefined;
    corruptedChatTimer = undefined;
    gameOver = true;
    stageReviewOpen = false;
    clearThreatCountdown();
    clearStreamApparition();
    stopStoryClock();
    chatEngine?.stop();
    chatEngine = null;
    chatApp.classList.remove("interference-mosaic", "interference-color", "wrong-kick", "corrupted-chat-hit");
    closeEmojiPanel();
    closeViewerPanel();
    stageOverlay.classList.remove("open");
    stageOverlay.setAttribute("aria-hidden", "true");
    resetStoryNightReveal();
    gameOverlay.classList.remove("open");
    gameOverlay.setAttribute("aria-hidden", "true");
    gameScreen.inert = true;
    gameScreen.setAttribute("aria-hidden", "true");
    titleScreen.hidden = false;
    titleScreen.setAttribute("aria-hidden", "false");
    stopGameMusic();
    prepareTitleMusic();
    if (shouldFocus) requestAnimationFrame(() => storyStart.focus());
  }

  function enterGame(mode = GAME_MODES.ENDLESS) {
    if (!commitPlayerNickname()) return;
    gameMode = mode;
    chatApp.dataset.gameMode = gameMode;
    if (gameMode === GAME_MODES.STORY) primeScareAudio();
    stopTitleMusic();
    titleScreen.hidden = true;
    titleScreen.setAttribute("aria-hidden", "true");
    gameScreen.inert = false;
    gameScreen.setAttribute("aria-hidden", "false");
    prepareGameMusic();
    startGame();
  }

  function openViewerPanel(viewerId) {
    if (gameOver || stageReviewOpen) return;
    const viewer = viewers.find(candidate => candidate.id === viewerId && candidate.active);
    if (!viewer) return;
    selectedViewerId = viewerId;
    viewerName.textContent = viewer.name;
    viewerName.style.color = viewer.color;
    viewerHistory.replaceChildren();
    viewer.history.slice(-6).forEach(text => {
      const item = document.createElement("li");
      item.textContent = text;
      viewerHistory.append(item);
    });
    chatEngine?.observeViewer(viewerId);
    viewerBackdrop.classList.add("open");
    viewerBackdrop.setAttribute("aria-hidden", "false");
    kickButton.focus();
  }

  function closeViewerPanel() {
    selectedViewerId = null;
    viewerBackdrop.classList.remove("open");
    viewerBackdrop.setAttribute("aria-hidden", "true");
  }

  function markViewerAsKicked(viewer, replacementText = "블라인드 처리 된 시청자입니다.") {
    document.querySelectorAll(`.message[data-viewer-id="${viewer.id}"]`).forEach(message => {
      message.classList.add("blinded-message");
      message.classList.remove("corrupted-message");
      message.removeAttribute("data-viewer-id");

      const messageText = message.querySelector(".message-text");
      if (messageText) {
        messageText.textContent = replacementText;
        messageText.removeAttribute("data-echo");
      }

      const username = message.querySelector(".username");
      if (username) {
        username.disabled = true;
        username.removeAttribute("data-viewer-id");
      }
    });
  }

  function endGame() {
    gameOver = true;
    stageReviewOpen = false;
    clearThreatCountdown(false);
    clearStreamApparition();
    stopStoryClock();
    chatEngine?.stop();
    closeViewerPanel();
    stageOverlay.classList.remove("open");
    stageOverlay.setAttribute("aria-hidden", "true");
    resetStoryNightReveal();

    const storyMode = gameMode === GAME_MODES.STORY;
    if (storyMode && storyVictory) {
      resultKicker.textContent = "SEVEN NIGHTS SURVIVED";
      resultTitle.textContent = "7일을 버텨냈습니다";
      resultCopy.textContent = `매일 새벽 2시까지 방송을 지켜냈습니다. 이상 연결 ${caughtAnomalies}개를 차단했습니다.`;
    } else {
      resultKicker.textContent = storyMode ? "BROADCAST LOST BEFORE DAWN" : "SIGNAL DESTROYED";
      resultTitle.textContent = "방송을 유지하지 못했습니다";
      if (lastDamageReason === "wrong-kick") {
        resultCopy.textContent = `정상 시청자를 반복해서 오판해 체력을 모두 잃었습니다. 총 오판 ${wrongKicks}회.`;
      } else if (lastDamageReason === "apparition") {
        resultCopy.textContent = `방송 화면의 괴이를 놓쳐 체력을 모두 잃었습니다. 총 ${missedApparitions}회 놓쳤습니다.`;
      } else {
        resultCopy.textContent = `${missedAnomalies}개의 이상 신호를 놓쳐 체력을 모두 잃었습니다.`;
      }
    }
    finalScore.textContent = `${String(score).padStart(4, "0")}점`;
    finalStage.textContent = String(currentStage);
    finalProgressLabel.textContent = storyMode ? "생존 일차" : "도달 스테이지";
    gameOverlay.classList.add("open");
    gameOverlay.setAttribute("aria-hidden", "false");
    gameRestart.focus();
  }

  function kickSelectedViewer() {
    const viewer = viewers.find(candidate => candidate.id === selectedViewerId && candidate.active);
    if (!viewer) return;
    viewer.active = false;
    viewer.kickedByPlayer = true;
    markViewerAsKicked(viewer);
    closeViewerPanel();

    if (gameMode === GAME_MODES.STORY) {
      appendSystemMessage(`${viewer.name}의 연결을 차단했습니다. 판정은 오전 2시에 공개됩니다.`);
      showToast("차단을 기록했습니다. 결과는 방송 종료 후 공개됩니다.");
      return;
    }

    if (viewer.anomalous) {
      remainingAnomalies -= 1;
      caughtAnomalies += 1;
      score += 150;
      appendSystemMessage(`${viewer.name}의 비정상 연결을 차단했습니다.`);
      showToast("이상 신호를 발견했습니다. +150점");
      updateHud();
      finishStage({
        success: true,
        title: "이상 시청자 차단",
        copy: `${viewer.name}의 채팅 기록에서 이상 징후를 찾아 연결을 성공적으로 차단했습니다.`
      });
    } else {
      health = Math.max(0, health - 1);
      wrongKicks += 1;
      lastDamageReason = "wrong-kick";
      score = Math.max(0, score - 75);
      appendSystemMessage(`${viewer.name}은 정상 시청자였습니다. 체력이 감소합니다.`, true);
      showToast("정상 시청자를 잘못 퇴장시켜 체력이 1 감소했습니다.");
      triggerScreenInterference("mosaic");
      chatApp.classList.remove("wrong-kick");
      requestAnimationFrame(() => chatApp.classList.add("wrong-kick"));
      window.setTimeout(() => chatApp.classList.remove("wrong-kick"), 300);
      updateHud();
      if (health === 0) {
        finishStage({
          success: false,
          title: "체력 소진",
          copy: "정상 시청자를 반복해서 잘못 차단해 체력을 모두 잃었습니다."
        });
      }
    }
  }

  function updateComposerState() {
    messageForm.classList.toggle("has-text", messageInput.value.trim().length > 0);
  }

  function insertAtCursor(value) {
    const start = messageInput.selectionStart ?? messageInput.value.length;
    const end = messageInput.selectionEnd ?? start;
    messageInput.setRangeText(value, start, end, "end");
    messageInput.focus();
    updateComposerState();
  }

  function closeEmojiPanel() {
    emojiPanel.hidden = true;
    emojiButton.setAttribute("aria-expanded", "false");
  }

  function exposeDebugApi() {
    window.horrorChatGame = {
      seed: currentSeed,
      mode: gameMode,
      emitEvent(type, slots = {}, intensity) {
        chatEngine?.emitEvent(type, slots, intensity);
      },
      pause() {
        chatEngine?.setPaused(true);
      },
      resume() {
        chatEngine?.setPaused(false);
      },
      debug() {
        return chatEngine?.getDebugSnapshot();
      },
      finishDay() {
        if (gameMode === GAME_MODES.STORY) finishStoryDay();
      },
      spawnApparition: spawnStreamApparition,
      missApparition: expireStreamApparition,
      apparition() {
        return {
          active: apparitionActive,
          banished: banishedApparitions,
          missed: missedApparitions,
          dayBanished: dayBanishedApparitions,
          dayMissed: dayMissedApparitions
        };
      },
      restart: startGame
    };
  }

  function createStageSeed() {
    if (fixedSeed !== null) {
      return (fixedSeed + Math.imul(currentStage, 0x9e3779b9)) >>> 0;
    }
    return createSeed();
  }

  function startStage() {
    window.clearTimeout(corruptedChatTimer);
    corruptedChatTimer = undefined;
    chatApp.classList.remove("corrupted-chat-hit");
    clearThreatCountdown(false);
    clearStreamApparition();
    stopStoryClock();
    chatEngine?.stop();
    currentSeed = createStageSeed();
    viewers = createViewers(currentSeed);
    remainingAnomalies = ANOMALIES_PER_STAGE;
    dayBanishedApparitions = 0;
    dayMissedApparitions = 0;
    selectedViewerId = null;
    gameOver = false;
    stageReviewOpen = false;
    messageList.replaceChildren();
    stageOverlay.classList.remove("open");
    stageOverlay.setAttribute("aria-hidden", "true");
    resetStoryNightReveal();
    closeViewerPanel();
    updateHud();
    chatApp.dataset.directorState = "AMBIENT";
    updateStreamState("AMBIENT");
    streamViewerCount.textContent = (1200 + currentSeed % 401).toLocaleString("ko-KR");
    apparitionRandom = createRoundRandom((currentSeed ^ 0xa5317e29) >>> 0);

    const deterministicEpoch = fixedSeed === null
      ? Date.now()
      : Date.UTC(2026, 0, 1) + (currentSeed % 86400) * 1000;
    const difficulty = Math.min(2.8, 1 + (currentStage - 1) * .12);

    chatEngine = new window.HorrorChatEngine({
      viewers,
      seed: currentSeed,
      difficulty,
      syntheticEvents: true,
      externalContext: { startedAt: deterministicEpoch, initiallyFocused: document.hasFocus() },
      onMessage: handleEngineMessage,
      onStateChange({ state, tension }) {
        chatApp.dataset.directorState = state;
        chatApp.style.setProperty("--chat-tension", tension.toFixed(3));
        updateStreamState(state);
      }
    });
    viewers.filter(viewer => viewer.anomalous).forEach(viewer => {
      viewer.anomalyLevel = Math.min(4, 2 + Math.floor((currentStage - 1) / 4));
    });
    chatEngine.start();

    if (gameMode === GAME_MODES.STORY) {
      appendSystemMessage(`${currentStage}일차 · 오후 7:00. ${STORY_DAY_INTROS[currentStage - 1]}`);
      appendSystemMessage("차단 결과는 숨겨지며 오전 2시에 한꺼번에 공개됩니다.");
      startStoryClock();
    } else {
      const graceSeconds = (getStageGraceMs() / 1000).toFixed(1).replace(".0", "");
      appendSystemMessage(`스테이지 ${currentStage} 시작. 이상 채팅은 ${graceSeconds}초 안에 처리하세요.`);
    }
    requestAnimationFrame(() => scrollToLatest());
    exposeDebugApi();
    scheduleStreamApparition(true);
  }

  function startGame() {
    window.clearTimeout(interferenceTimer);
    interferenceTimer = undefined;
    gameOver = true;
    stageReviewOpen = false;
    clearThreatCountdown(false);
    clearStreamApparition();
    stopStoryClock();
    chatEngine?.stop();
    health = MAX_HEALTH;
    score = 0;
    currentStage = 1;
    caughtAnomalies = 0;
    missedAnomalies = 0;
    wrongKicks = 0;
    banishedApparitions = 0;
    missedApparitions = 0;
    dayBanishedApparitions = 0;
    dayMissedApparitions = 0;
    storyVictory = false;
    lastDamageReason = "missed";
    chatApp.dataset.gameMode = gameMode;
    chatApp.classList.remove("interference-mosaic", "interference-color", "wrong-kick");
    rewardButton.classList.remove("claimed");
    rewardButton.disabled = false;
    rewardLabel.textContent = "100 받기";
    gameOverlay.classList.remove("open");
    gameOverlay.setAttribute("aria-hidden", "true");
    resetStoryNightReveal();
    startStage();
  }

  messageList.addEventListener("click", event => {
    const username = event.target.closest(".username[data-viewer-id]");
    if (username) openViewerPanel(username.dataset.viewerId);
  });

  messageForm.addEventListener("submit", event => {
    event.preventDefault();
    const text = messageInput.value.trim();
    if (!text || gameOver || stageReviewOpen) return;
    const myViewer = { name: myNickname, badge: "🐹", badgeClass: "robot", color: "#66d5b2" };
    appendElement(createMessage(myViewer, text, true));
    messageInput.value = "";
    updateComposerState();
    closeEmojiPanel();
  });

  messageInput.addEventListener("input", updateComposerState);
  newMessageButton.addEventListener("click", () => scrollToLatest("smooth"));
  panelClose.addEventListener("click", closeViewerPanel);
  kickButton.addEventListener("click", kickSelectedViewer);
  streamApparition.addEventListener("click", banishStreamApparition);
  titleMusicButton.addEventListener("click", () => {
    if (titleMusic.paused) playTitleMusic();
    else stopTitleMusic(false);
  });
  gameMusicButton.addEventListener("click", () => {
    if (gameMusic.paused) playGameMusic();
    else stopGameMusic(false);
  });
  titleVolume.addEventListener("input", () => {
    applyVolume(titleMusic, titleVolume, titleVolumeValue, AUDIO_SETTINGS.title, titleVolume.value);
  });
  gameVolume.addEventListener("input", () => {
    applyVolume(gameMusic, gameVolume, gameVolumeValue, AUDIO_SETTINGS.game, gameVolume.value);
  });
  playerNicknameInput.addEventListener("input", () => setNicknameError());
  gameStart.addEventListener("click", () => enterGame(GAME_MODES.ENDLESS));
  storyStart.addEventListener("click", () => enterGame(GAME_MODES.STORY));
  gameRetry.addEventListener("click", startGame);
  gameRestart.addEventListener("click", () => showTitle());
  stageContinue.addEventListener("click", continueFromStageResult);
  storyContinue.addEventListener("click", continueFromStoryResult);

  viewerBackdrop.addEventListener("click", event => {
    if (event.target === viewerBackdrop) closeViewerPanel();
  });

  emojiButton.addEventListener("click", () => {
    const willOpen = emojiPanel.hidden;
    emojiPanel.hidden = !willOpen;
    emojiButton.setAttribute("aria-expanded", String(willOpen));
    if (willOpen) emojiPanel.querySelector("button")?.focus();
  });

  emojiPanel.addEventListener("click", event => {
    const button = event.target.closest("button");
    if (!button) return;
    insertAtCursor(button.textContent);
    closeEmojiPanel();
  });

  rewardButton.addEventListener("click", () => {
    if (rewardButton.classList.contains("claimed")) return;
    rewardButton.classList.add("claimed");
    rewardButton.disabled = true;
    rewardLabel.textContent = "받기 완료";
    showToast("통나무 파워 100개를 받았습니다.");
  });

  messageList.addEventListener("scroll", () => {
    if (isNearLatest()) newMessageButton.hidden = true;
  }, { passive: true });

  collapseButton.addEventListener("click", () => {
    browserBar.classList.toggle("collapsed");
    collapseButton.setAttribute("aria-label", browserBar.classList.contains("collapsed") ? "상단 바 펼치기" : "상단 바 접기");
    requestAnimationFrame(() => scrollToLatest());
  });

  document.querySelector(".address-menu").addEventListener("click", () => showToast(`채팅 시드: ${currentSeed}`));
  document.querySelector("#support-button").addEventListener("click", () => showToast("지금은 후원할 수 없습니다."));
  document.querySelector("#voice-button").addEventListener("click", () => showToast("알 수 없는 잡음이 들립니다…"));
  document.querySelector("#chat-tab").addEventListener("click", () => scrollToLatest("smooth"));
  helpButton.addEventListener("click", () => {
    showToast(gameMode === GAME_MODES.STORY
      ? "오후 7시부터 오전 2시까지 조사하세요. 모든 판정은 하루가 끝날 때 공개됩니다."
      : "이상 채팅을 제한시간 안에 처리하세요. 스테이지가 오를수록 시간이 짧아집니다.");
  });

  document.addEventListener("pointerdown", event => {
    if (!emojiPanel.hidden && !emojiPanel.contains(event.target) && !emojiButton.contains(event.target)) closeEmojiPanel();
  });

  document.addEventListener("keydown", event => {
    if (event.key === "Escape") {
      closeEmojiPanel();
      closeViewerPanel();
    }
  });

  document.addEventListener("visibilitychange", syncEnginePause);

  initializePlayerNickname();
  initializeAudioVolumes();
  showTitle(false);
})();
