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

  const ANOMALY_COUNT = 3;
  const MAX_MESSAGES = 100;
  const MAX_TRUST = 3;

  const chatApp = document.querySelector(".chat-app");
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
  const gameRestart = document.querySelector("#game-restart");
  const toast = document.querySelector("#toast");

  const seedParameter = new URLSearchParams(window.location.search).get("seed");
  const fixedSeed = seedParameter !== null && /^\d+$/.test(seedParameter) ? Number(seedParameter) >>> 0 : null;

  let viewers = [];
  let myNickname = "";
  let trust = MAX_TRUST;
  let remainingAnomalies = ANOMALY_COUNT;
  let score = 0;
  let selectedViewerId = null;
  let gameOver = false;
  let chatEngine = null;
  let toastTimer;
  let currentSeed = 0;

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
    const anomalySlots = new Set(shuffle(VIEWER_STYLES.map((_, index) => index), random).slice(0, ANOMALY_COUNT));
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
  }

  function appendSystemMessage(text, danger = false) {
    appendElement(createSystemMessage(text, danger));
  }

  function updateHud() {
    trustDisplay.textContent = `${"♥".repeat(trust)}${"♡".repeat(MAX_TRUST - trust)}`;
    trustDisplay.setAttribute("aria-label", `신뢰도 ${trust}`);
    anomalyDisplay.textContent = String(remainingAnomalies);
    scoreDisplay.textContent = String(score).padStart(4, "0");
  }

  function showToast(message) {
    window.clearTimeout(toastTimer);
    toast.textContent = message;
    toast.classList.add("show");
    toastTimer = window.setTimeout(() => toast.classList.remove("show"), 2300);
  }

  function openViewerPanel(viewerId) {
    if (gameOver) return;
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

  function markViewerAsKicked(viewer) {
    document.querySelectorAll(`.message[data-viewer-id="${viewer.id}"]`).forEach(message => {
      message.classList.add("blinded-message");
      message.removeAttribute("data-viewer-id");

      const messageText = message.querySelector(".message-text");
      if (messageText) messageText.textContent = "블라인드 처리 된 시청자입니다.";

      const username = message.querySelector(".username");
      if (username) {
        username.disabled = true;
        username.removeAttribute("data-viewer-id");
      }
    });
  }

  function endGame(won) {
    gameOver = true;
    chatEngine?.stop();
    closeViewerPanel();
    resultKicker.textContent = won ? "SIGNAL CLEARED" : "CONNECTION LOST";
    resultTitle.textContent = won ? "방송을 지켜냈습니다" : "채팅이 잠식되었습니다";
    resultCopy.textContent = won
      ? "모든 이상 시청자를 찾아 강제 퇴장시켰습니다."
      : "정상 시청자를 너무 많이 내보내 신뢰를 잃었습니다.";
    finalScore.textContent = `${String(score).padStart(4, "0")}점`;
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
      score += 150;
      appendSystemMessage(`${viewer.name}의 비정상 연결을 차단했습니다.`);
      showToast("이상 신호를 발견했습니다. +150점");
    } else {
      trust -= 1;
      score = Math.max(0, score - 75);
      appendSystemMessage(`${viewer.name}은 정상 시청자였습니다. 신뢰도가 감소합니다.`, true);
      showToast("정상 시청자를 잘못 퇴장시켰습니다.");
      chatApp.classList.remove("wrong-kick");
      requestAnimationFrame(() => chatApp.classList.add("wrong-kick"));
      window.setTimeout(() => chatApp.classList.remove("wrong-kick"), 300);
    }

    updateHud();
    if (remainingAnomalies === 0) window.setTimeout(() => endGame(true), 500);
    else if (trust === 0) window.setTimeout(() => endGame(false), 500);
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

  function startGame() {
    chatEngine?.stop();
    currentSeed = createSeed();
    viewers = createViewers(currentSeed);
    trust = MAX_TRUST;
    remainingAnomalies = ANOMALY_COUNT;
    score = 0;
    selectedViewerId = null;
    gameOver = false;
    messageList.replaceChildren();
    gameOverlay.classList.remove("open");
    gameOverlay.setAttribute("aria-hidden", "true");
    closeViewerPanel();
    updateHud();

    const deterministicEpoch = fixedSeed === null
      ? Date.now()
      : Date.UTC(2026, 0, 1) + (currentSeed % 86400) * 1000;

    chatEngine = new window.HorrorChatEngine({
      viewers,
      seed: currentSeed,
      syntheticEvents: true,
      externalContext: { startedAt: deterministicEpoch, initiallyFocused: document.hasFocus() },
      onMessage: handleEngineMessage,
      onStateChange({ state, tension }) {
        chatApp.dataset.directorState = state;
        chatApp.style.setProperty("--chat-tension", tension.toFixed(3));
      }
    });
    chatEngine.start();
    appendSystemMessage("닉네임을 눌러 기록을 확인하고 수상한 시청자를 강제 퇴장시키세요.");
    requestAnimationFrame(() => scrollToLatest());
    exposeDebugApi();
  }

  messageList.addEventListener("click", event => {
    const username = event.target.closest(".username[data-viewer-id]");
    if (username) openViewerPanel(username.dataset.viewerId);
  });

  messageForm.addEventListener("submit", event => {
    event.preventDefault();
    const text = messageInput.value.trim();
    if (!text || gameOver) return;
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
  gameRestart.addEventListener("click", startGame);

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
  helpButton.addEventListener("click", () => showToast("말투가 지나치게 정확하거나 게임 밖 정보를 아는 시청자를 찾으세요."));

  document.addEventListener("pointerdown", event => {
    if (!emojiPanel.hidden && !emojiPanel.contains(event.target) && !emojiButton.contains(event.target)) closeEmojiPanel();
  });

  document.addEventListener("keydown", event => {
    if (event.key === "Escape") {
      closeEmojiPanel();
      closeViewerPanel();
    }
  });

  document.addEventListener("visibilitychange", () => chatEngine?.setPaused(document.hidden));

  startGame();
})();
