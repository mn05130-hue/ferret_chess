"use strict";

// Viewer creation, nickname handling, and chat rendering.
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

function createUnknownChatText(text, viewer) {
  const seed = hashText(`${currentSeed}:${viewer?.id || "unknown"}:${viewer?.history?.length || 0}:${text}`);
  const random = createRoundRandom(seed);
  const hangul = [...String(text)].filter(character => /[ㄱ-ㅎㅏ-ㅣ가-힣]/.test(character));
  const tokenCount = Math.max(17, Math.min(32, Math.ceil(String(text).length * 1.35)));
  const lines = [];
  let currentLine = [];
  let targetLineLength = 6 + Math.floor(random() * 4);

  for (let index = 0; index < tokenCount; index += 1) {
    let token = UNKNOWN_CHAT_TOKENS[Math.floor(random() * UNKNOWN_CHAT_TOKENS.length)];
    if (hangul.length && random() < .2) {
      const syllable = hangul[Math.floor(random() * hangul.length)];
      token = random() < .5 ? `${syllable}${token}` : `${token}${syllable}`;
    }
    if (random() < .12) token += random() < .5 ? "…" : ".";
    currentLine.push(token);
    if (currentLine.length >= targetLineLength) {
      lines.push(currentLine.join(" "));
      currentLine = [];
      targetLineLength = 6 + Math.floor(random() * 4);
    }
  }
  if (currentLine.length) lines.push(currentLine.join(" "));
  return lines.slice(0, 4).join("\n");
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
  const displayedText = isCorruptedMessage ? createUnknownChatText(text, viewer) : text;
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
