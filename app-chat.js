"use strict";

/*
 * 시청자·닉네임·채팅 표시 기능입니다.
 * 스테이지 seed로 시청자 목록을 만들고, 플레이어 이름을 검증·저장하며,
 * 엔진의 발화를 안전한 DOM 노드로 변환해 채팅창과 시청자 기록에 반영합니다.
 * 이상 여부 자체와 화면용 난독화 여부는 분리해 게임 판정이 시각 효과에 흔들리지 않습니다.
 */
/**
 * 주어진 시드로 항상 같은 순서를 내는 난수 함수를 만들어 스테이지를 재현 가능하게 합니다.
 * @param {number} seed 난수 상태를 초기화할 32비트 정수
 * @returns {() => number} 호출할 때마다 0 이상 1 미만 값을 내는 난수 함수
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
 * @param {Array} items 섞을 원본 배열
 * @param {() => number} random 0 이상 1 미만의 값을 반환하는 난수 함수
 * @returns {Array} 같은 항목을 무작위 순서로 담은 새 배열
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
 * @param {Set<string>} usedNicknames 이번 스테이지에서 이미 사용 중인 이름
 * @param {() => number} random 스테이지에 고정된 난수 함수
 * @returns {string} 중복되지 않는 새 닉네임
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
 * URL에 seed가 있으면 새 값을 만들지 않고 해당 고정 시드를 반환합니다.
 * @returns {number} 이번 게임 또는 스테이지를 재현할 32비트 정수
 */
function createSeed() {
  if (activeSeedOverride !== null) return activeSeedOverride;
  if (window.crypto?.getRandomValues) {
    const values = new Uint32Array(1);
    window.crypto.getRandomValues(values);
    return values[0];
  }
  return Date.now() >>> 0;
}

/**
 * 현재 진행도에 맞춰 이번 스테이지에 등장할 이상 시청자 수를 계산합니다.
 * @param {number} stage 1부터 시작하는 무한 모드 스테이지 또는 스토리 일차
 * @returns {number} 상한을 적용한 이상 시청자 수
 */
function getAnomalyCountForStage(stage) {
  return FERRET_CHAT_RULES.getAnomalyCount(gameMode, stage);
}

/**
 * 시드에 맞춰 시청자 외형과 채팅 엔진 모델을 만들고 이상 시청자는 등장 대기 상태로 둡니다.
 * @param {number} seed 외형·닉네임·이상 위치를 결정하는 시드
 * @param {number} anomalyCount 이상 시청자로 지정할 인원수
 * @returns {Array<object>} 채팅 엔진과 화면이 함께 사용하는 시청자 객체 배열
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
    evidenceHistory: [],
    connectionHistoryCorrupted: false,
    suspected: false,
    active: !anomalySlots.has(index),
    pendingArrival: anomalySlots.has(index),
    kickedByPlayer: false,
    ...style
  }));
  return createdViewers;
}

/**
 * 사용자 입력의 연속 공백을 정리하고 최대 길이를 적용해 화면에 쓸 닉네임으로 정규화합니다.
 * @param {unknown} value 입력란 또는 저장소에서 읽은 원본 값
 * @returns {string} 앞뒤 공백을 제거하고 16자로 자른 닉네임
 */
function normalizePlayerNickname(value) {
  return String(value || "").trim().replace(/\s+/g, " ").slice(0, 16);
}

/**
 * 닉네임 오류 문구, hidden 상태, aria-invalid를 동시에 갱신해 시각/접근성 상태를 맞춥니다.
 * @param {string} message 빈 문자열이면 오류를 숨기고, 값이 있으면 표시할 안내문
 */
function setNicknameError(message = "") {
  const hasError = Boolean(message);
  nicknameError.textContent = message;
  nicknameError.hidden = !hasError;
  playerNicknameInput.setAttribute("aria-invalid", String(hasError));
}

/**
 * 현재 입력한 닉네임이 설정 목록과 일치하면 첫 화면에 이스터 에그 문구를 표시합니다.
 * trim·공백 정리 후 영문 대소문자를 무시하지만, 부분 문자열은 일치로 취급하지 않습니다.
 * @param {unknown} value 입력란 또는 저장소에서 가져온 닉네임
 * @returns {string} 표시한 이스터 에그 문구. 일치하는 항목이 없으면 빈 문자열
 */
function updateNicknameEasterEgg(value = playerNicknameInput.value) {
  const normalizedNickname = normalizePlayerNickname(value).toLocaleLowerCase("ko-KR");
  const matchedEntry = Object.entries(NICKNAME_EASTER_EGGS).find(([nickname]) => (
    normalizePlayerNickname(nickname).toLocaleLowerCase("ko-KR") === normalizedNickname
  ));
  const message = matchedEntry?.[1] || "";
  nicknameEasterEgg.textContent = message;
  nicknameEasterEgg.hidden = !message;
  return message;
}

/**
 * 입력값을 검증한 뒤 현재 플레이어 이름과 localStorage에 확정 저장합니다.
 * @returns {boolean} 이름이 유효해 저장했으면 true, 입력이 비어 있으면 false
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
  updateNicknameEasterEgg(nickname);
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
  updateNicknameEasterEgg();
}

/**
 * 문자열을 32비트 해시로 바꿔 같은 이상 채팅이 같은 시각 효과를 갖도록 합니다.
 * @param {unknown} value 해시 입력으로 사용할 값
 * @returns {number} FNV-1a 방식으로 계산한 부호 없는 32비트 값
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
 * @param {string} text 난독화의 길이와 일부 한글 재료로 사용할 원문
 * @param {object} viewer 같은 발화에 같은 결과를 만들기 위한 시청자 문맥
 * @returns {string} 최대 네 줄로 구성한 화면용 난독화 문자열
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
 * @param {object} message HorrorChatEngine의 onMessage 콜백 데이터
 * @returns {{isActualAnomaly: boolean, type: string|null, usesCipherText: boolean}} 표시 규칙
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
 * 연결이 끊겨 채팅 화면이 오염되는 순간에만 짧은 흔들림 애니메이션을 다시 시작합니다.
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
    viewer.connectionHistoryCorrupted = true;
    const displayedText = createUnknownChatText(messageText.textContent, viewer);
    messageText.textContent = displayedText;
    item.classList.add("corrupted-message", "ciphered-message");
  });
  triggerCorruptedChatPulse();
}

/**
 * 시청자 배지·닉네임·본문과 판정 메타데이터를 포함하는 안전한 li DOM 요소를 생성합니다.
 * textContent만 사용하므로 채팅 문자열은 HTML로 실행되지 않습니다.
 * @param {object} viewer 배지·색·닉네임·식별자를 가진 화자
 * @param {string} text 화면에 쓸 채팅 본문
 * @param {boolean} ownMessage 플레이어 본인의 메시지인지 여부
 * @param {object} metadata 이상 유형, 오염, 의도, 디렉터 상태 등의 표시 정보
 * @returns {HTMLLIElement} 아직 DOM에 추가하지 않은 메시지 요소
 */
function createMessage(viewer, text, ownMessage = false, metadata = {}) {
  const item = document.createElement("li");
  item.className = "message";
  if (viewer?.suspected) item.classList.add("suspected-message");
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
  copy.append(username, messageText);
  item.append(badge, copy);
  return item;
}

/**
 * 게임 규칙이나 판정 안내를 일반 발화와 구분되는 시스템 메시지 요소로 만듭니다.
 * @param {string} text 시스템 접두어 뒤에 표시할 안내문
 * @param {boolean} danger 위험 색상을 적용할지 여부
 * @returns {HTMLLIElement} 아직 DOM에 추가하지 않은 시스템 메시지
 */
function createSystemMessage(text, danger = false) {
  const item = document.createElement("li");
  item.className = `message system-message${danger ? " danger" : ""}`;
  item.textContent = `[시스템] ${text}`;
  return item;
}

/**
 * 현재 스크롤이 채팅 맨 아래에서 허용 오차 이내인지 계산합니다.
 * @returns {boolean} 최신 메시지를 자동으로 따라가도 되는 위치이면 true
 */
function isNearLatest() {
  return messageList.scrollHeight - messageList.scrollTop - messageList.clientHeight < 54;
}

/**
 * 채팅을 최신 위치로 이동시키고 더 이상 필요 없는 새 메시지 버튼을 숨깁니다.
 * @param {ScrollBehavior} behavior 즉시 이동(auto) 또는 부드러운 이동(smooth)
 */
function scrollToLatest(behavior = "auto") {
  messageList.scrollTo({ top: messageList.scrollHeight, behavior });
  newMessageButton.hidden = true;
}

/**
 * 메시지를 추가하고 최대 개수를 유지하면서 사용자의 기존 스크롤 위치를 보존합니다.
 * @param {HTMLElement} element 목록에 추가할 메시지 요소
 * @param {ScrollBehavior} behavior 최신 위치로 이동할 때의 스크롤 방식
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
 * 진행 중인 이상 채팅 순간 효과를 중단하고 화면을 기본 상태로 되돌립니다.
 */
function clearAnomalyChatEffect() {
  window.clearTimeout(anomalyChatEffectTimer);
  anomalyChatEffectTimer = undefined;
  chatApp.classList.remove("anomaly-chat-shake", "anomaly-chat-static");
}

/**
 * 실제 이상 채팅마다 설정 확률을 판정해 화면 흔들림 또는 짧은 정전기 효과를 재생합니다.
 * 두 효과는 당첨된 30% 안에서 각각 절반 확률이며, 선택된 효과 이름을 테스트용으로 반환합니다.
 * @param {() => number} random 0 이상 1 미만 값을 반환하는 확률 함수
 * @returns {"shake"|"static"|null} 실행한 효과 또는 확률에서 벗어나면 null
 */
function maybeTriggerAnomalyChatEffect(random = Math.random) {
  if (random() >= ANOMALY_CHAT_EFFECT_CHANCE) return null;

  clearAnomalyChatEffect();
  const effect = random() < .5 ? "shake" : "static";
  const className = effect === "shake" ? "anomaly-chat-shake" : "anomaly-chat-static";
  // 같은 효과가 연속 당첨되어도 애니메이션이 처음부터 다시 시작되게 레이아웃을 갱신합니다.
  void screenInterference.offsetWidth;
  chatApp.classList.add(className);
  if (effect === "static") playChatStaticNoise();

  anomalyChatEffectTimer = window.setTimeout(() => {
    chatApp.classList.remove(className);
    anomalyChatEffectTimer = undefined;
  }, ANOMALY_CHAT_EFFECT_DURATION_MS);
  return effect;
}

/**
 * 엔진 발화를 기록·렌더링하고 이상 대사 변환 및 무한 모드 제한시간을 연결합니다.
 * @param {object} message 엔진이 전달한 화자·본문·상태·괴이 메타데이터
 */
function handleEngineMessage(message) {
  const { viewer, text, historyOnly, behavior } = message;
  const anomalyPresentation = getAnomalyPresentation(message);
  const { isActualAnomaly } = anomalyPresentation;
  // 연결 끊김 상태에서는 실제 판정값을 건드리지 않고 정상 채팅도 화면에서만 오염시킵니다.
  const isConnectionCorruption = !historyOnly && apparitionActive && apparitionExpired;
  const isCorruptedMessage = isActualAnomaly || isConnectionCorruption;
  const usesCipherText = anomalyPresentation.usesCipherText || isConnectionCorruption;
  const displayedText = usesCipherText ? createUnknownChatText(text, viewer) : text;
  viewer.history.push(displayedText);
  if (viewer.history.length > 10) viewer.history.shift();
  viewer.evidenceHistory ??= [];
  viewer.evidenceHistory.push({
    text: displayedText,
    originalText: text,
    actualAnomaly: isActualAnomaly,
    connectionCorrupted: isConnectionCorruption,
    anomalyType: anomalyPresentation.type || viewer.anomalyPermission || ""
  });
  if (viewer.evidenceHistory.length > 10) viewer.evidenceHistory.shift();
  if (historyOnly) return;
  appendElement(createMessage(viewer, displayedText, false, {
    ...message,
    corrupted: isCorruptedMessage,
    ciphered: usesCipherText,
    anomalyType: anomalyPresentation.type
  }), behavior);
  if (isConnectionCorruption) triggerCorruptedChatPulse();

  if (isActualAnomaly) {
    maybeTriggerAnomalyChatEffect();
    if (gameMode === GAME_MODES.ENDLESS) startThreatCountdown(viewer);
  }
}

/**
 * 시스템 메시지를 생성해 공통 메시지 추가 흐름으로 전달합니다.
 * @param {string} text 시스템 메시지 본문
 * @param {boolean} danger 위험 강조 여부
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
  if (!storyMode) storyClock.textContent = dailyChallengeActive ? "오늘" : "∞";
}

/**
 * 기존 토스트 타이머를 교체해 짧은 안내 문구가 지정 시간 동안 한 번만 표시되게 합니다.
 * @param {string} message 토스트에 표시할 문장
 */
function showToast(message) {
  window.clearTimeout(toastTimer);
  toast.textContent = message;
  toast.classList.add("show");
  toastTimer = window.setTimeout(() => toast.classList.remove("show"), 2300);
}

/**
 * 채팅 디렉터의 내부 상태 코드를 방송 화면의 연결 상태 문구로 변환합니다.
 * @param {string} state AMBIENT, TENSE, BURST, AFTERMATH, LULL 중 현재 상태
 */
function updateStreamState(state) {
  streamSignal.textContent = STREAM_STATE_LABELS[state] || STREAM_STATE_LABELS.AMBIENT;
}
