"use strict";

// Viewer creation, nickname handling, and chat rendering.
/**
 * 주어진 시드로 항상 같은 순서를 내는 난수 함수를 만들어 스테이지를 재현 가능하게 합니다.
 */
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

/**
 * Fisher–Yates 방식으로 배열 사본을 섞어 원본 데이터의 순서는 보존합니다.
 */
function shuffle(items, random) {
  const output = [...items];
  for (let index = output.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [output[index], output[swapIndex]] = [output[swapIndex], output[index]];
  }
  return output;
}

/**
 * 사용 중인 이름을 피하면서 형용사·명사·숫자를 조합한 시청자 닉네임을 만듭니다.
 */
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

/**
 * 암호학 난수를 우선 사용하고 불가능하면 시간과 Math.random을 조합해 새 시드를 만듭니다.
 */
function createSeed() {
  if (fixedSeed !== null) return fixedSeed;
  if (window.crypto?.getRandomValues) {
    const values = new Uint32Array(1);
    window.crypto.getRandomValues(values);
    return values[0];
  }
  return Date.now() >>> 0;
}

/**
 * 현재 진행도에 맞춰 이번 스테이지에 등장할 이상 시청자 수를 계산합니다.
 */
function getAnomalyCountForStage(stage) {
  return Math.min(
    MAX_ANOMALIES_PER_STAGE,
    BASE_ANOMALIES_PER_STAGE + Math.floor((stage - 1) / STAGES_PER_ADDITIONAL_ANOMALY)
  );
}

/**
 * 시드에 맞춰 시청자 외형과 채팅 엔진 모델을 만들고 이상 시청자는 등장 대기 상태로 둡니다.
 */
function createViewers(seed, anomalyCount) {
  const random = createRoundRandom(seed);
  const usedNicknames = new Set(myNickname ? [myNickname] : []);
  const anomalySlots = new Set(shuffle(VIEWER_STYLES.map((_, index) => index), random).slice(0, anomalyCount));
  const createdViewers = VIEWER_STYLES.map((style, index) => ({
    id: `viewer-${index}`,
    name: createNickname(usedNicknames, random),
    anomalous: anomalySlots.has(index),
    history: [],
    active: !anomalySlots.has(index),
    pendingArrival: anomalySlots.has(index),
    kickedByPlayer: false,
    ...style
  }));
  return createdViewers;
}

/**
 * 사용자 입력의 연속 공백을 정리하고 최대 길이를 적용해 화면에 쓸 닉네임으로 정규화합니다.
 */
function normalizePlayerNickname(value) {
  return String(value || "").trim().replace(/\s+/g, " ").slice(0, 16);
}

/**
 * 닉네임 오류 문구, hidden 상태, aria-invalid를 동시에 갱신해 시각/접근성 상태를 맞춥니다.
 */
function setNicknameError(message = "") {
  const hasError = Boolean(message);
  nicknameError.textContent = message;
  nicknameError.hidden = !hasError;
  playerNicknameInput.setAttribute("aria-invalid", String(hasError));
}

/**
 * 입력값을 검증한 뒤 현재 플레이어 이름과 localStorage에 확정 저장합니다.
 */
function commitPlayerNickname() {
  const nickname = normalizePlayerNickname(playerNicknameInput.value);
  if (!nickname) {
    setNicknameError("타이틀로 이동하려면 닉네임을 입력하세요.");
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

/**
 * 저장된 닉네임을 안전하게 복원하며 저장소 접근이 막힌 환경도 오류 없이 처리합니다.
 */
function initializePlayerNickname() {
  try {
    const savedNickname = normalizePlayerNickname(window.localStorage.getItem(PLAYER_NICKNAME_STORAGE_KEY));
    if (savedNickname) playerNicknameInput.value = savedNickname;
  } catch {
    // 저장소를 사용할 수 없는 환경에서는 빈 입력란으로 시작합니다.
  }
  setNicknameError();
}

/**
 * 문자열을 32비트 해시로 바꿔 같은 이상 채팅이 같은 시각 효과를 갖도록 합니다.
 */
function hashText(value) {
  let hash = 2166136261;
  for (const character of String(value)) {
    hash ^= character.codePointAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/**
 * 이상 대사의 원문을 한글·라틴 문자·기호가 섞인 여러 줄의 불명확한 문장으로 변환합니다.
 */
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

/**
 * 엔진 메타데이터를 화면용 이상 유형으로 정리합니다. GLITCH 계열만 난독화 문장을 사용합니다.
 */
function getAnomalyPresentation(message) {
  const isActualAnomaly = Boolean(
    message.viewer?.anomalous && (message.anomalyEvidence || message.anomalyMode)
  );
  if (!isActualAnomaly) {
    return { isActualAnomaly: false, type: null, usesCipherText: false };
  }

  const isGlitch = String(message.anomalyLineId || "").startsWith("gli-");
  return {
    isActualAnomaly: true,
    type: isGlitch ? "glitch" : String(message.anomalyEvidence || "unknown").toLowerCase(),
    usesCipherText: isGlitch
  };
}

/**
 * 이상 채팅 도착 순간 메시지 영역의 짧은 흔들림 애니메이션을 다시 시작합니다.
 */
function triggerCorruptedChatPulse() {
  window.clearTimeout(corruptedChatTimer);
  chatApp.classList.remove("corrupted-chat-hit");
  void messageList.offsetWidth;
  chatApp.classList.add("corrupted-chat-hit");
  corruptedChatTimer = window.setTimeout(() => chatApp.classList.remove("corrupted-chat-hit"), 480);
}

/**
 * 연결이 완전히 끊긴 순간 현재 화면에 보이는 일반 채팅도 판정값 변경 없이 깨진 문자로 바꿉니다.
 */
function corruptVisibleMessagesForConnectionLoss() {
  messageList.querySelectorAll(".message:not(.system-message):not(.blinded-message)").forEach((item, index) => {
    if (item.classList.contains("ciphered-message")) return;
    const messageText = item.querySelector(".message-text");
    if (!messageText) return;
    const viewer = viewers.find(candidate => candidate.id === item.dataset.viewerId)
      || { id: `connection-${index}`, history: [] };
    const displayedText = createUnknownChatText(messageText.textContent, viewer);
    messageText.textContent = displayedText;
    messageText.dataset.echo = displayedText.replace(/\s+/g, " ");
    item.classList.add("corrupted-message", "ciphered-message");
  });
  triggerCorruptedChatPulse();
}

/**
 * 시청자 배지·닉네임·본문과 판정 메타데이터를 포함하는 안전한 li DOM 요소를 생성합니다.
 */
function createMessage(viewer, text, ownMessage = false, metadata = {}) {
  const item = document.createElement("li");
  item.className = "message";
  if (metadata.corrupted) item.classList.add("corrupted-message");
  if (metadata.ciphered) item.classList.add("ciphered-message");
  if (metadata.anomalyType) {
    const anomalyType = String(metadata.anomalyType).replace(/[^a-z-]/g, "") || "unknown";
    item.classList.add("anomaly-message", `anomaly-${anomalyType}`);
    item.dataset.anomalyType = anomalyType;
  }
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
  if (metadata.ciphered) messageText.dataset.echo = text.replace(/\s+/g, " ");

  copy.append(username, messageText);
  item.append(badge, copy);
  return item;
}

/**
 * 게임 규칙이나 판정 안내를 일반 발화와 구분되는 시스템 메시지 요소로 만듭니다.
 */
function createSystemMessage(text, danger = false) {
  const item = document.createElement("li");
  item.className = `message system-message${danger ? " danger" : ""}`;
  item.textContent = `[시스템] ${text}`;
  return item;
}

/**
 * 현재 스크롤이 채팅 맨 아래에서 허용 오차 이내인지 계산합니다.
 */
function isNearLatest() {
  return messageList.scrollHeight - messageList.scrollTop - messageList.clientHeight < 54;
}

/**
 * 채팅을 최신 위치로 이동시키고 더 이상 필요 없는 새 메시지 버튼을 숨깁니다.
 */
function scrollToLatest(behavior = "auto") {
  messageList.scrollTo({ top: messageList.scrollHeight, behavior });
  newMessageButton.hidden = true;
}

/**
 * 메시지를 추가하고 최대 개수를 유지하면서 사용자의 기존 스크롤 위치를 보존합니다.
 */
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

/**
 * 엔진 발화를 기록·렌더링하고 이상 대사 변환 및 무한 모드 제한시간을 연결합니다.
 */
function handleEngineMessage(message) {
  const { viewer, text, historyOnly, behavior } = message;
  const anomalyPresentation = getAnomalyPresentation(message);
  const { isActualAnomaly } = anomalyPresentation;
  // 연결 없음 상태에서는 실제 판정값을 건드리지 않고 정상 채팅도 화면에서만 오염시킵니다.
  const isConnectionCorruption = !historyOnly && apparitionActive && apparitionExpired;
  const isCorruptedMessage = isActualAnomaly || isConnectionCorruption;
  const usesCipherText = anomalyPresentation.usesCipherText || isConnectionCorruption;
  const displayedText = usesCipherText ? createUnknownChatText(text, viewer) : text;
  viewer.history.push(displayedText);
  if (viewer.history.length > 10) viewer.history.shift();
  if (historyOnly) return;
  appendElement(createMessage(viewer, displayedText, false, {
    ...message,
    corrupted: isCorruptedMessage,
    ciphered: usesCipherText,
    anomalyType: anomalyPresentation.type
  }), behavior);
  if (isCorruptedMessage) triggerCorruptedChatPulse();

  if (isActualAnomaly && gameMode === GAME_MODES.ENDLESS) startThreatCountdown(viewer);
}

/**
 * 시스템 메시지를 생성해 공통 메시지 추가 흐름으로 전달합니다.
 */
function appendSystemMessage(text, danger = false) {
  appendElement(createSystemMessage(text, danger));
}

/**
 * 현재 모드와 게임 상태를 HUD 숫자, 라벨, 접근성 텍스트에 반영합니다.
 */
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

/**
 * 기존 토스트 타이머를 교체해 짧은 안내 문구가 지정 시간 동안 한 번만 표시되게 합니다.
 */
function showToast(message) {
  window.clearTimeout(toastTimer);
  toast.textContent = message;
  toast.classList.add("show");
  toastTimer = window.setTimeout(() => toast.classList.remove("show"), 2300);
}

/**
 * 채팅 디렉터의 내부 상태 코드를 방송 화면의 연결 상태 문구로 변환합니다.
 */
function updateStreamState(state) {
  streamSignal.textContent = STREAM_STATE_LABELS[state] || STREAM_STATE_LABELS.AMBIENT;
}
