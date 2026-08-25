(() => {
  "use strict";

  const NICKNAME_ADJECTIVES = [
    "금손", "즐거운", "빛나는", "신나는", "용감한", "엉뚱한",
    "행복한", "졸린", "재빠른", "유쾌한", "반짝이는", "집중한"
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
  const MAX_TRUST = 3;
  const WEEK_TOTAL_DAYS = 7;
  const WEEK_DAY_DURATION_MS = 64000;
  const WEEK_START_MINUTES = 17 * 60;
  const WEEK_BROADCAST_MINUTES = 8 * 60;

  const chatApp = document.querySelector(".chat-app");
  const titleScreen = document.querySelector("#title-screen");
  const gameScreen = document.querySelector("#game-screen");
  const gameStart = document.querySelector("#game-start");
  const weekGameStart = document.querySelector("#week-game-start");
  const titleMusic = document.querySelector("#title-music");
  const titleMusicButton = document.querySelector("#title-music-button");
  const titleMusicLabel = document.querySelector("#title-music-label");
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
  const trustDisplay = document.querySelector("#trust-display");
  const anomalyDisplay = document.querySelector("#anomaly-display");
  const scoreDisplay = document.querySelector("#score-display");
  const stageLabel = document.querySelector("#stage-label");
  const stageDisplay = document.querySelector("#stage-display");
  const healthDisplay = document.querySelector("#health-display");
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
  const finalProgressLabel = document.querySelector("#final-progress-label");
  const finalStage = document.querySelector("#final-stage");
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
  const stageHealth = document.querySelector("#stage-health");
  const stageTrust = document.querySelector("#stage-trust");
  const stageContinue = document.querySelector("#stage-continue");
  const toast = document.querySelector("#toast");
  const streamViewerCount = document.querySelector("#stream-viewer-count");
  const streamSignal = document.querySelector("#stream-signal");
  const threatTimer = document.querySelector("#threat-timer");
  const threatSeconds = document.querySelector("#threat-seconds");
  const broadcastClock = document.querySelector("#broadcast-clock");
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

  const seedParameter = new URLSearchParams(window.location.search).get("seed");
  const fixedSeed = seedParameter !== null && /^\d+$/.test(seedParameter) ? Number(seedParameter) >>> 0 : null;

  let viewers = [];
  let myNickname = "";
  let trust = MAX_TRUST;
  let health = MAX_HEALTH;
  let remainingAnomalies = ANOMALIES_PER_STAGE;
  let score = 0;
  let currentStage = 1;
  let caughtAnomalies = 0;
  let missedAnomalies = 0;
  let selectedViewerId = null;
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
  let selectedGameMode = "infinite";
  let broadcastElapsedMs = 0;
  let broadcastLastTick = 0;
  let broadcastInterval;
  let currentDayFailed = false;

  function isWeekMode() {
    return selectedGameMode === "week";
  }

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
    const usedNicknames = new Set();
    const anomalySlots = new Set(shuffle(VIEWER_STYLES.map((_, index) => index), random).slice(0, ANOMALIES_PER_STAGE));
    const createdViewers = VIEWER_STYLES.map((style, index) => ({
      id: `viewer-${index}`,
      name: createNickname(usedNicknames, random),
      anomalous: anomalySlots.has(index),
      history: [],
      active: true,
      ...style
    }));
    myNickname = createNickname(usedNicknames, random);
    return createdViewers;
  }

  function createMessage(viewer, text, ownMessage = false, metadata = {}) {
    const item = document.createElement("li");
    item.className = "message";
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
    viewer.history.push(text);
    if (viewer.history.length > 10) viewer.history.shift();
    if (historyOnly) return;
    appendElement(createMessage(viewer, text, false, message), behavior);

    const isAnomalousLine = viewer.anomalous && Boolean(message.anomalyEvidence);
    if (isAnomalousLine) startThreatCountdown(viewer);
  }

  function appendSystemMessage(text, danger = false) {
    appendElement(createSystemMessage(text, danger));
  }

  function updateHud() {
    trustDisplay.textContent = `${"♥".repeat(trust)}${"♡".repeat(MAX_TRUST - trust)}`;
    trustDisplay.setAttribute("aria-label", `신뢰도 ${trust}`);
    anomalyDisplay.textContent = String(remainingAnomalies);
    scoreDisplay.textContent = String(score).padStart(4, "0");
    stageLabel.textContent = isWeekMode() ? "날짜" : "스테이지";
    stageDisplay.textContent = isWeekMode() ? `${currentStage}/${WEEK_TOTAL_DAYS}` : String(currentStage);
    healthDisplay.textContent = String(health);
    healthDisplay.setAttribute("aria-label", `체력 ${health}`);
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

  function chooseTitleTrack() {
    let randomValue;
    if (window.crypto?.getRandomValues) {
      const values = new Uint32Array(1);
      window.crypto.getRandomValues(values);
      randomValue = values[0] / 4294967296;
    } else {
      randomValue = Math.random();
    }
    return TITLE_MUSIC_TRACKS[Math.floor(randomValue * TITLE_MUSIC_TRACKS.length)];
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
    titleMusic.src = chooseTitleTrack();
    titleMusic.volume = .45;
    titleMusic.load();
    playTitleMusic();
  }

  function syncEnginePause() {
    chatEngine?.setPaused(document.hidden || gameOver || stageReviewOpen);
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

  function formatBroadcastClock(elapsedMs = broadcastElapsedMs) {
    const ratio = Math.min(1, Math.max(0, elapsedMs / WEEK_DAY_DURATION_MS));
    let totalMinutes = WEEK_START_MINUTES + Math.floor(WEEK_BROADCAST_MINUTES * ratio);
    totalMinutes %= 24 * 60;
    const hours = String(Math.floor(totalMinutes / 60)).padStart(2, "0");
    const minutes = String(totalMinutes % 60).padStart(2, "0");
    return `${hours}:${minutes}`;
  }

  function renderBroadcastClock() {
    broadcastClock.textContent = `DAY ${currentStage} · ${formatBroadcastClock()}`;
  }

  function clearBroadcastClock(hide = false) {
    window.clearInterval(broadcastInterval);
    broadcastInterval = undefined;
    if (hide) broadcastClock.hidden = true;
  }

  function updateBroadcastClock() {
    const now = performance.now();
    if (document.hidden || gameOver || stageReviewOpen) {
      broadcastLastTick = now;
      return;
    }

    broadcastElapsedMs += Math.max(0, now - broadcastLastTick);
    broadcastLastTick = now;
    renderBroadcastClock();
    if (broadcastElapsedMs >= WEEK_DAY_DURATION_MS) finishBroadcastDay();
  }

  function startBroadcastClock() {
    clearBroadcastClock();
    broadcastElapsedMs = 0;
    broadcastLastTick = performance.now();
    broadcastClock.hidden = false;
    renderBroadcastClock();
    broadcastInterval = window.setInterval(updateBroadcastClock, 100);
  }

  function startThreatCountdown(viewer) {
    if (pendingThreat || gameOver || stageReviewOpen || !viewer.active) return;
    const graceMs = getStageGraceMs();
    pendingThreat = viewer;
    threatRemainingMs = graceMs;
    threatLastTick = performance.now();
    threatSeconds.textContent = (graceMs / 1000).toFixed(1);
    threatTimer.hidden = false;
    streamSignal.textContent = "이상 신호 추적 중";
    threatInterval = window.setInterval(updateThreatCountdown, 100);
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
    clearBroadcastClock();
    clearThreatCountdown(false);
    streamSignal.textContent = isWeekMode() ? "일일 방송 정산 중" : "스테이지 정산 중";
    closeEmojiPanel();
    closeViewerPanel();
    syncEnginePause();

    stageCard.classList.toggle("failed", !success);
    const progressName = isWeekMode() ? "DAY" : "STAGE";
    stageResultKicker.textContent = `${progressName} ${String(currentStage).padStart(2, "0")} ${success ? "CLEAR" : "FAILED"}`;
    stageResultMark.textContent = success ? "✓" : "!";
    stageResultTitle.textContent = title;
    stageResultCopy.textContent = copy;
    stageCaught.textContent = String(caughtAnomalies);
    stageMissed.textContent = String(missedAnomalies);
    stageHealth.textContent = String(health);
    stageTrust.textContent = String(trust);

    const gameEnded = health === 0 || trust === 0 || (isWeekMode() && currentStage >= WEEK_TOTAL_DAYS);
    stageContinue.textContent = gameEnded
      ? "최종 결과 보기"
      : isWeekMode() ? "다음 날 방송" : "다음 스테이지";
    stageOverlay.classList.add("open");
    stageOverlay.setAttribute("aria-hidden", "false");
    stageContinue.focus();
  }

  function finishBroadcastDay() {
    if (!isWeekMode() || stageReviewOpen || gameOver) return;
    broadcastElapsedMs = WEEK_DAY_DURATION_MS;
    renderBroadcastClock();
    clearBroadcastClock();

    const unresolved = viewers.filter(viewer => viewer.active && viewer.anomalous);
    if (unresolved.length) {
      unresolved.forEach(viewer => {
        viewer.active = false;
        markViewerAsKicked(viewer, "방송 종료와 함께 사라진 시청자입니다.");
      });
      remainingAnomalies = 0;
      missedAnomalies += unresolved.length;
      health = Math.max(0, health - unresolved.length);
      score = Math.max(0, score - 100 * unresolved.length);
      appendSystemMessage(`01:00까지 ${unresolved.length}명의 이상 시청자를 처리하지 못했습니다.`, true);
      updateHud();
      triggerScreenInterference("color");
      finishStage({
        success: false,
        title: `${currentStage}일차 이상 신호 미처리`,
        copy: "방송 종료 시각까지 남아 있던 이상 신호가 침투해 체력이 감소했습니다."
      });
      return;
    }

    if (currentDayFailed) {
      finishStage({
        success: false,
        title: `${currentStage}일차 이상 신호 침투`,
        copy: "이상 채팅을 제때 처리하지 못했지만 01:00까지 방송은 유지했습니다."
      });
      return;
    }

    score += 200;
    updateHud();
    finishStage({
      success: true,
      title: `${currentStage}일차 방송 완료`,
      copy: "17:00부터 01:00까지 방송을 유지하고 이상 신호를 모두 차단했습니다. +200점"
    });
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
    currentDayFailed = true;
    health = Math.max(0, health - 1);
    score = Math.max(0, score - 100);
    markViewerAsKicked(viewer, "이상 신호에 잠식되어 연결이 끊겼습니다.");
    appendSystemMessage(`${viewer.name}의 이상 신호가 방송에 침투했습니다.`, true);
    updateHud();
    triggerScreenInterference("color");
    clearThreatCountdown();
    if (isWeekMode() && health > 0) {
      streamSignal.textContent = "방송 유지 중";
      showToast("이상 신호가 침투했습니다. 01:00까지 버티세요.");
      return;
    }
    finishStage({
      success: false,
      title: "이상 신호 추적 실패",
      copy: `${viewer.name}의 이상 채팅을 제한시간 안에 처리하지 못해 체력이 1 감소했습니다.`
    });
  }

  function continueFromStageResult() {
    stageOverlay.classList.remove("open");
    stageOverlay.setAttribute("aria-hidden", "true");

    if (health === 0 || trust === 0) {
      stageReviewOpen = false;
      endGame();
      return;
    }

    if (isWeekMode() && currentStage >= WEEK_TOTAL_DAYS) {
      stageReviewOpen = false;
      endGame("campaign-complete");
      return;
    }

    currentStage += 1;
    stageReviewOpen = false;
    startStage();
  }

  function showTitle(shouldFocus = true) {
    window.clearTimeout(interferenceTimer);
    interferenceTimer = undefined;
    gameOver = true;
    stageReviewOpen = false;
    clearBroadcastClock(true);
    clearThreatCountdown();
    chatEngine?.stop();
    chatEngine = null;
    chatApp.classList.remove("interference-mosaic", "interference-color", "wrong-kick");
    closeEmojiPanel();
    closeViewerPanel();
    stageOverlay.classList.remove("open");
    stageOverlay.setAttribute("aria-hidden", "true");
    gameOverlay.classList.remove("open");
    gameOverlay.classList.remove("victory");
    gameOverlay.setAttribute("aria-hidden", "true");
    gameScreen.inert = true;
    gameScreen.setAttribute("aria-hidden", "true");
    titleScreen.hidden = false;
    titleScreen.setAttribute("aria-hidden", "false");
    prepareTitleMusic();
    if (shouldFocus) requestAnimationFrame(() => gameStart.focus());
  }

  function enterGame(mode = "infinite") {
    selectedGameMode = mode;
    stopTitleMusic();
    titleScreen.hidden = true;
    titleScreen.setAttribute("aria-hidden", "true");
    gameScreen.inert = false;
    gameScreen.setAttribute("aria-hidden", "false");
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
      message.removeAttribute("data-viewer-id");

      const messageText = message.querySelector(".message-text");
      if (messageText) messageText.textContent = replacementText;

      const username = message.querySelector(".username");
      if (username) {
        username.disabled = true;
        username.removeAttribute("data-viewer-id");
      }
    });
  }

  function endGame(reason = "failed") {
    const completedCampaign = reason === "campaign-complete";
    gameOver = true;
    stageReviewOpen = false;
    clearBroadcastClock(false);
    clearThreatCountdown(false);
    chatEngine?.stop();
    closeViewerPanel();
    stageOverlay.classList.remove("open");
    stageOverlay.setAttribute("aria-hidden", "true");
    gameOverlay.classList.toggle("victory", completedCampaign);
    if (completedCampaign) {
      resultKicker.textContent = "SEVEN DAYS COMPLETE";
      resultTitle.textContent = "7일 방송을 완주했습니다";
      resultCopy.textContent = `매일 17:00부터 01:00까지 방송을 지켜냈습니다. 이상 시청자 ${caughtAnomalies}명을 차단했습니다.`;
    } else {
      resultKicker.textContent = health === 0 ? "SIGNAL DESTROYED" : "TRUST LOST";
      resultTitle.textContent = health === 0 ? "방송이 잠식되었습니다" : "방송 신뢰도가 무너졌습니다";
      resultCopy.textContent = health === 0
        ? `${missedAnomalies}개의 이상 신호가 방송에 침투해 더 이상 송출을 유지할 수 없습니다.`
        : "정상 시청자를 반복해서 차단해 더 이상 방송을 유지할 수 없습니다.";
    }
    finalScore.textContent = `${String(score).padStart(4, "0")}점`;
    finalProgressLabel.textContent = isWeekMode()
      ? completedCampaign ? "완료한 날짜" : "도달 날짜"
      : "도달 스테이지";
    finalStage.textContent = isWeekMode() ? `${currentStage} / ${WEEK_TOTAL_DAYS}` : String(currentStage);
    gameOverlay.classList.add("open");
    gameOverlay.setAttribute("aria-hidden", "false");
    gameRestart.focus();
  }

  function kickSelectedViewer() {
    const viewer = viewers.find(candidate => candidate.id === selectedViewerId && candidate.active);
    if (!viewer) return;
    viewer.active = false;
    markViewerAsKicked(viewer);
    closeViewerPanel();

    if (viewer.anomalous) {
      remainingAnomalies -= 1;
      caughtAnomalies += 1;
      score += 150;
      appendSystemMessage(`${viewer.name}의 비정상 연결을 차단했습니다.`);
      showToast("이상 신호를 발견했습니다. +150점");
      updateHud();
      if (isWeekMode()) {
        if (pendingThreat?.id === viewer.id) clearThreatCountdown();
        streamSignal.textContent = "01:00까지 방송 유지";
        appendSystemMessage(`이상 신호를 차단했습니다. ${formatBroadcastClock()} · 방송을 계속하세요.`);
        return;
      }
      finishStage({
        success: true,
        title: "이상 시청자 차단",
        copy: `${viewer.name}의 채팅 기록에서 이상 징후를 찾아 연결을 성공적으로 차단했습니다.`
      });
    } else {
      trust -= 1;
      score = Math.max(0, score - 75);
      appendSystemMessage(`${viewer.name}은 정상 시청자였습니다. 신뢰도가 감소합니다.`, true);
      showToast("정상 시청자를 잘못 퇴장시켰습니다.");
      triggerScreenInterference("mosaic");
      chatApp.classList.remove("wrong-kick");
      requestAnimationFrame(() => chatApp.classList.add("wrong-kick"));
      window.setTimeout(() => chatApp.classList.remove("wrong-kick"), 300);
      updateHud();
      if (trust === 0) {
        finishStage({
          success: false,
          title: "방송 신뢰도 붕괴",
          copy: "정상 시청자를 세 번 잘못 차단해 더 이상 방송을 유지할 수 없습니다."
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
    clearBroadcastClock(false);
    clearThreatCountdown(false);
    chatEngine?.stop();
    currentSeed = createStageSeed();
    viewers = createViewers(currentSeed);
    remainingAnomalies = ANOMALIES_PER_STAGE;
    currentDayFailed = false;
    selectedViewerId = null;
    gameOver = false;
    stageReviewOpen = false;
    messageList.replaceChildren();
    stageOverlay.classList.remove("open");
    stageOverlay.setAttribute("aria-hidden", "true");
    closeViewerPanel();
    updateHud();
    chatApp.dataset.directorState = "AMBIENT";
    updateStreamState("AMBIENT");
    streamViewerCount.textContent = (1200 + currentSeed % 401).toLocaleString("ko-KR");

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

    const graceSeconds = (getStageGraceMs() / 1000).toFixed(1).replace(".0", "");
    if (isWeekMode()) {
      startBroadcastClock();
      appendSystemMessage(`${currentStage}일차 방송 시작 · 17:00 → 01:00. 이상 채팅은 ${graceSeconds}초 안에 처리하세요.`);
    } else {
      broadcastClock.hidden = true;
      appendSystemMessage(`스테이지 ${currentStage} 시작. 이상 채팅은 ${graceSeconds}초 안에 처리하세요.`);
    }
    requestAnimationFrame(() => scrollToLatest());
    exposeDebugApi();
  }

  function startGame() {
    window.clearTimeout(interferenceTimer);
    interferenceTimer = undefined;
    gameOver = true;
    stageReviewOpen = false;
    clearBroadcastClock(false);
    clearThreatCountdown(false);
    chatEngine?.stop();
    trust = MAX_TRUST;
    health = MAX_HEALTH;
    score = 0;
    currentStage = 1;
    caughtAnomalies = 0;
    missedAnomalies = 0;
    chatApp.classList.remove("interference-mosaic", "interference-color", "wrong-kick");
    rewardButton.classList.remove("claimed");
    rewardButton.disabled = false;
    rewardLabel.textContent = "100 받기";
    gameOverlay.classList.remove("open");
    gameOverlay.setAttribute("aria-hidden", "true");
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
  titleMusicButton.addEventListener("click", () => {
    if (titleMusic.paused) playTitleMusic();
    else stopTitleMusic(false);
  });
  gameStart.addEventListener("click", () => enterGame("infinite"));
  weekGameStart.addEventListener("click", () => enterGame("week"));
  gameRetry.addEventListener("click", startGame);
  gameRestart.addEventListener("click", () => showTitle());
  stageContinue.addEventListener("click", continueFromStageResult);

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
  helpButton.addEventListener("click", () => showToast(isWeekMode()
    ? "매일 17:00부터 01:00까지 방송하며 이상 시청자를 찾아 차단하세요."
    : "이상 채팅을 제한시간 안에 처리하세요. 스테이지가 오를수록 시간이 짧아집니다."));

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

showTitle(false);
})();
