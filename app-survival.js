"use strict";

/*
 * 플레이 중 시간 제한을 담당합니다.
 * 스토리 모드에서는 실제 경과 시간을 오후 7시~오전 2시로 환산하고, 무한 모드에서는
 * 이상 채팅별 대응 시간을 셉니다. 별도의 방송 화면 괴이는 작은 와이파이 위젯으로만
 * 알리며, 좋음→보통→약함→끊김 네 단계와 실제 출현/만료 여부로 성공·오판을 판정합니다.
 */
/**
 * 스토리 시계 interval을 중지하고 마지막 tick 기준값을 제거합니다.
 */
function stopStoryClock() {
  window.clearInterval(storyClockInterval);
  storyClockInterval = undefined;
}

/**
 * 실제 경과 시간을 오후 7시부터 오전 2시까지 30분 단위의 게임 내 시각으로 변환합니다.
 * @param {number} elapsedMs 이번 하루가 시작된 뒤 흐른 실제 밀리초
 * @returns {string} 오전/오후와 시:분으로 구성한 게임 시각
 */
function formatStoryTime(elapsedMs) {
  const progress = Math.min(1, Math.max(0, elapsedMs / storyDayDurationMs));
  const rawElapsedMinutes = progress * STORY_DURATION_MINUTES;
  const elapsedMinutes = Math.min(
    STORY_DURATION_MINUTES,
    Math.floor(rawElapsedMinutes / STORY_CLOCK_STEP_MINUTES) * STORY_CLOCK_STEP_MINUTES
  );
  const totalMinutes = STORY_START_MINUTES + elapsedMinutes;
  const hour24 = Math.floor(totalMinutes / 60) % 24;
  const minute = totalMinutes % 60;
  const period = hour24 < 12 ? "오전" : "오후";
  const hour12 = hour24 % 12 || 12;
  return `${period} ${hour12}:${String(minute).padStart(2, "0")}`;
}

/**
 * 계산된 게임 시각이 이전 30분 구간과 달라졌을 때만 HUD와 접근성 라벨을 갱신합니다.
 */
function renderStoryClock() {
  const nextTime = formatStoryTime(storyElapsedMs);
  if (storyClock.textContent === nextTime) return;
  storyClock.textContent = nextTime;
  storyClock.setAttribute("aria-label", `현재 순찰 시간 ${nextTime}`);
}

/**
 * 프레임 사이 실제 경과량을 누적하고 하루 길이에 도달하면 하루 판정을 시작합니다.
 */
function updateStoryClock() {
  const now = performance.now();
  if (document.hidden || gameOver || stageReviewOpen || tutorialOpen || gameMode !== GAME_MODES.STORY) {
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

/**
 * 스토리 하루의 시간을 초기화하고 일정 간격으로 시각 갱신을 예약합니다.
 */
function startStoryClock() {
  stopStoryClock();
  storyElapsedMs = 0;
  storyLastTick = performance.now();
  renderStoryClock();
  storyClockInterval = window.setInterval(updateStoryClock, 200);
}

/**
 * 문서 표시 여부와 모달 상태를 기준으로 채팅 엔진과 스토리 시계의 진행을 맞춥니다.
 */
function syncEnginePause() {
  chatEngine?.setPaused(document.hidden || gameOver || stageReviewOpen || tutorialOpen);
  syncAmbientHorrorSfx();
  const now = performance.now();
  storyLastTick = now;
  threatLastTick = now;
  apparitionLastTick = now;
}

/**
 * 무한 모드 제한시간 interval과 대상 시청자를 해제하고 신호 문구를 복원합니다.
 */
function clearThreatCountdown(restoreSignal = true) {
  window.clearInterval(threatInterval);
  threatInterval = undefined;
  pendingThreatPostId = null;
  threatRemainingMs = 0;
  threatTimer.hidden = true;
  postThreat.hidden = true;
  if (restoreSignal) updateStreamState(chatApp.dataset.directorState || "AMBIENT");
}

/**
 * 실제 경과 시간을 제한시간에서 차감하고 0이 되면 이상 신호 침투를 처리합니다.
 */
function updateThreatCountdown() {
  const now = performance.now();
  if (document.hidden || gameOver || stageReviewOpen || tutorialOpen) {
    threatLastTick = now;
    return;
  }

  threatRemainingMs -= Math.max(0, now - threatLastTick);
  threatLastTick = now;
  renderThreatTime();
  if (threatRemainingMs <= 0) expireThreat();
}

function renderThreatTime() {
  const seconds = (Math.max(0, threatRemainingMs) / 1000).toFixed(1);
  threatSeconds.textContent = seconds;
  postThreatSeconds.textContent = `${seconds}초`;
}

/**
 * 스테이지 상승에 따라 감소하되 최소값 이하로 내려가지 않는 제한시간을 계산합니다.
 * @returns {number} 현재 스테이지에서 허용하는 대응 시간(밀리초)
 */
function getStageGraceMs() {
  return Math.max(
    MIN_ANOMALY_GRACE_MS,
    BASE_ANOMALY_GRACE_MS - (currentStage - 1) * STAGE_GRACE_STEP_MS
  );
}

/**
 * 새 이상 시청자를 제한시간 대상으로 지정하고 HUD 타이머를 시작합니다.
 * @param {string} postId 제한시간 안에 삭제해야 하는 게시글 ID
 */
function startThreatCountdown(postId) {
  if (gameMode === GAME_MODES.STORY || pendingThreatPostId || gameOver || stageReviewOpen) return;
  const graceMs = getStageGraceMs();
  pendingThreatPostId = postId;
  threatRemainingMs = graceMs;
  threatLastTick = performance.now();
  renderThreatTime();
  postThreat.hidden = false;
  threatTimer.hidden = false;
  streamSignal.textContent = "게시글 삭제 제한 시간";
  threatInterval = window.setInterval(updateThreatCountdown, 100);
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
  if (gameOver || stageReviewOpen || tutorialOpen) return;
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
