"use strict";

/*
 * 두 모드에 공통 라운드 시계를 사용하고, 스토리에서는 게임 내 시각도 갱신합니다.
 * 연결 괴이는 별도 타이머로 좋음→보통→약함→끊김 상태를 갱신합니다.
 */
function stopRoundClock() {
  window.clearInterval(roundClockInterval);
  roundClockInterval = undefined;
}

function getRoundDurationMs() {
  return gameMode === GAME_MODES.STORY ? storyDayDurationMs : ROUND_DURATION_MS;
}

function getRoundRemainingMs() {
  return Math.max(0, getRoundDurationMs() - roundElapsedMs);
}

/**
 * 라운드의 경과 시간을 오후 7시부터 오전 2시까지 30분 단위로 환산합니다.
 */
function getStoryClockMinutes(elapsedMs) {
  const progress = Math.min(1, Math.max(0, elapsedMs / storyDayDurationMs));
  const rawElapsedMinutes = progress * STORY_DURATION_MINUTES;
  const elapsedMinutes = Math.min(
    STORY_DURATION_MINUTES,
    Math.floor(rawElapsedMinutes / STORY_CLOCK_STEP_MINUTES) * STORY_CLOCK_STEP_MINUTES
  );
  return STORY_START_MINUTES + elapsedMinutes;
}

function formatStoryTime(elapsedMs) {
  const totalMinutes = getStoryClockMinutes(elapsedMs);
  const hour24 = Math.floor(totalMinutes / 60) % 24;
  const minute = totalMinutes % 60;
  const period = hour24 < 12 ? "오전" : "오후";
  const hour12 = hour24 % 12 || 12;
  return `${period} ${hour12}:${String(minute).padStart(2, "0")}`;
}

function renderRoundClock() {
  const seconds = Math.ceil(getRoundRemainingMs() / 1000);
  const minutes = String(Math.floor(seconds / 60)).padStart(2, "0");
  const remainder = String(seconds % 60).padStart(2, "0");
  const display = `${minutes}:${remainder}`;
  if (roundSeconds.textContent !== display) roundSeconds.textContent = display;
  roundTimer.classList.toggle("is-low", seconds <= 10);

  if (gameMode !== GAME_MODES.STORY) return;
  const storyTime = formatStoryTime(roundElapsedMs);
  if (storyClock.textContent === storyTime) return;
  storyClock.textContent = storyTime;
  storyClock.setAttribute("aria-label", `현재 순찰 시간 ${storyTime}`);
}

function shouldPauseRound() {
  return document.hidden || gameOver || stageReviewOpen || tutorialOpen;
}

/** 경과 시간을 반영하고 이번 라운드에서 입력을 처리할 수 있는지 반환합니다. */
function updateRoundClock() {
  const now = performance.now();
  const elapsed = Math.max(0, now - roundLastTick);
  roundLastTick = now;
  if (shouldPauseRound()) return false;

  const duration = getRoundDurationMs();
  roundElapsedMs = Math.min(duration, roundElapsedMs + elapsed);
  renderRoundClock();
  if (roundElapsedMs === duration) {
    if (gameMode === GAME_MODES.STORY) finishStoryDay();
    else finishEndlessRound();
    return false;
  }
  return true;
}

function startRoundClock() {
  roundLastTick = performance.now();
  renderRoundClock();
  roundClockInterval = window.setInterval(updateRoundClock, 100);
}

/**
 * 문서 표시 여부와 도움말 상태를 기준으로 엔진과 타이머의 진행을 맞춥니다.
 */
function syncEnginePause() {
  chatEngine?.setPaused(shouldPauseRound());
  syncAmbientHorrorSfx();
  const now = performance.now();
  roundLastTick = now;
  apparitionLastTick = now;
}

/**
 * 지정된 최소·최대 범위에서 다음 괴이 출현까지의 지연을 선택합니다.
 * @param {[number, number]} range 밀리초 단위의 최소·최대값
 * @returns {number} 현재 스테이지 난수로 선택한 대기 시간
 */
function getApparitionDelay([minimum, maximum]) {
  return minimum + apparitionRandom() * (maximum - minimum);
}

/**
 * 연결 위젯에서 기존 단계 클래스를 제거하고 새 단계의 색상·문구·접근성 상태를 동기화합니다.
 * @param {{key: string, label: string}} stage CONNECTION_STAGES에 정의된 대상 단계
 */
function setConnectionStage(stage) {
  connectionWidget.classList.remove("is-good", "is-normal", "is-weak", "is-disconnected");
  connectionWidget.classList.add(`is-${stage.key}`);
  connectionWidget.dataset.connectionStage = stage.key;
  connectionWidget.setAttribute("aria-label", `게시판 동기화 상태: ${stage.label}`);
  connectionStatus.textContent = stage.label;
  reconnectButton.setAttribute("aria-label", `게시판 복구 · 현재 상태 ${stage.label}`);
}

/**
 * 연결 관련 타이머와 작은 상단 위젯을 정상 와이파이 상태로 되돌립니다.
 */
function resetConnectionWidget() {
  window.clearInterval(apparitionInterval);
  window.clearTimeout(connectionFeedbackTimer);
  apparitionInterval = undefined;
  connectionFeedbackTimer = undefined;
  apparitionActive = false;
  apparitionExpired = false;
  chatApp.classList.remove("connection-pixelated");
  chatApp.classList.remove("connection-lost");
  connectionWidget.classList.remove("is-false-reconnect");
  setConnectionStage(CONNECTION_STAGES.GOOD);
}

/**
 * 현재 괴이와 앞으로 예정된 출현을 모두 취소합니다.
 */
function clearStreamApparition() {
  window.clearTimeout(apparitionSpawnTimer);
  apparitionSpawnTimer = undefined;
  resetConnectionWidget();
}

function clearRoundTimers() {
  stopRoundClock();
  clearStreamApparition();
  clearAnomalyChatEffect();
}

/**
 * 게임 진행 상태를 확인한 뒤 초기/반복 범위에 맞춰 다음 괴이 출현을 예약합니다.
 * @param {boolean} initial true이면 게임 시작 직후의 짧은 출현 범위를 사용함
 */
function scheduleStreamApparition(initial = false) {
  window.clearTimeout(apparitionSpawnTimer);
  if (gameOver || stageReviewOpen) return;
  const range = initial ? APPARITION_INITIAL_DELAY_RANGE_MS : APPARITION_DELAY_RANGE_MS;
  apparitionSpawnTimer = window.setTimeout(() => {
    apparitionSpawnTimer = undefined;
    if (document.hidden || tutorialOpen) {
      scheduleStreamApparition(true);
      return;
    }
    spawnStreamApparition();
  }, getApparitionDelay(range));
}

/**
 * 별도 알림 메시지나 큰 화면 변화 없이 상단 위젯을 2단계인 보통 상태로 전환합니다.
 * @returns {boolean} 새 괴이를 실제로 시작했으면 true, 진행 불가 상태면 false
 */
function spawnStreamApparition() {
  if (apparitionActive || gameOver || stageReviewOpen || tutorialOpen || titleScreen.hidden === false) return false;
  window.clearTimeout(apparitionSpawnTimer);
  apparitionSpawnTimer = undefined;
  apparitionActive = true;
  apparitionExpired = false;
  window.clearTimeout(connectionFeedbackTimer);
  connectionFeedbackTimer = undefined;
  connectionWidget.classList.remove("is-false-reconnect");
  setConnectionStage(CONNECTION_STAGES.NORMAL);
  prepareAnomalyMusic("detected");
  apparitionElapsedMs = 0;
  apparitionLastTick = performance.now();
  apparitionInterval = window.setInterval(updateApparitionClock, 100);
  return true;
}

function updateApparitionClock() {
  const now = performance.now();
  if (!document.hidden && !tutorialOpen) {
    apparitionElapsedMs += Math.max(0, now - apparitionLastTick);
  }
  apparitionLastTick = now;

  if (apparitionElapsedMs >= APPARITION_LIFETIME_MS) {
    expireStreamApparition();
  } else if (apparitionElapsedMs >= APPARITION_LIFETIME_MS * APPARITION_WEAK_STAGE_RATIO) {
    if (connectionWidget.dataset.connectionStage !== CONNECTION_STAGES.WEAK.key) {
      setConnectionStage(CONNECTION_STAGES.WEAK);
    }
    if (apparitionElapsedMs >= APPARITION_LIFETIME_MS - APPARITION_MOSAIC_DURATION_MS) {
      chatApp.classList.add("connection-pixelated");
    }
  }
}

/**
 * 대응 시간을 넘긴 괴이를 한 번만 실패로 기록합니다.
 */
function expireStreamApparition() {
  if (!apparitionActive || apparitionExpired || document.hidden || tutorialOpen) return;
  window.clearInterval(apparitionInterval);
  apparitionInterval = undefined;
  apparitionExpired = true;
  // 끊김은 별도의 공포 연출을 사용하므로 직전 단계의 모자이크를 즉시 제거합니다.
  chatApp.classList.remove("connection-pixelated");
  chatApp.classList.add("connection-lost");
  refreshPostPresentation();
  triggerCorruptedChatPulse();
  setConnectionStage(CONNECTION_STAGES.DISCONNECTED);
  prepareAnomalyMusic("disconnected");
  missedApparitions += 1;
  dayMissedApparitions += 1;
}

/**
 * 재연결 버튼은 실제 괴이 연결이면 복구하고, 정상 연결에서 누르면 오판으로 체력을 감소시킵니다.
 */
function reconnectStreamConnection() {
  if (!updateRoundClock()) return;
  if (!apparitionActive) {
    const outcome = FERRET_CHAT_RULES.getFalseReconnectOutcome();
    health = Math.max(0, health + outcome.healthDelta);
    falseReconnects += 1;
    lastDamageReason = "false-reconnect";
    updateHud();
    window.clearTimeout(connectionFeedbackTimer);
    connectionWidget.classList.remove("is-false-reconnect");
    void connectionWidget.offsetWidth;
    connectionWidget.classList.add("is-false-reconnect");
    connectionWidget.setAttribute("aria-label", "게시판 동기화 상태: 좋음, 불필요한 복구");
    connectionStatus.textContent = "좋음 · 오판";

    if (health === 0) {
      if (gameMode === GAME_MODES.STORY) finishStoryDay();
      else finishStage({
        success: false,
        title: "불필요한 복구",
        copy: "정상 상태에서 반복해서 복구를 눌러 체력을 모두 잃었습니다."
      });
      return;
    }

    connectionFeedbackTimer = window.setTimeout(() => {
      connectionWidget.classList.remove("is-false-reconnect");
      setConnectionStage(CONNECTION_STAGES.GOOD);
      connectionFeedbackTimer = undefined;
    }, 1100);
    return;
  }

  const recoveredInTime = !apparitionExpired;
  resetConnectionWidget();
  refreshPostPresentation();
  prepareGameplayMusicForCurrentStage();
  if (recoveredInTime) {
    banishedApparitions += 1;
    dayBanishedApparitions += 1;
    score += FERRET_CHAT_RULES.SCORE.connectionRecovered;
    updateHud();
    notifyTutorialConnectionRecovered();
  }
  scheduleStreamApparition();
}
