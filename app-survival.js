"use strict";

// Story clock, threat timer, and compact Wi-Fi connection encounters.
/**
 * 스토리 시계 interval을 중지하고 마지막 tick 기준값을 제거합니다.
 */
function stopStoryClock() {
  window.clearInterval(storyClockInterval);
  storyClockInterval = undefined;
}

/**
 * 실제 경과 시간을 오후 7시부터 오전 2시까지의 게임 내 시각 문자열로 변환합니다.
 */
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

/**
 * 계산된 게임 시각을 HUD에 쓰고 접근성 라벨도 함께 갱신합니다.
 */
function renderStoryClock() {
  storyClock.textContent = formatStoryTime(storyElapsedMs);
  storyClock.setAttribute("aria-label", `현재 방송 시간 ${storyClock.textContent}`);
}

/**
 * 프레임 사이 실제 경과량을 누적하고 하루 길이에 도달하면 하루 판정을 시작합니다.
 */
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
  chatEngine?.setPaused(document.hidden || gameOver || stageReviewOpen);
  storyLastTick = performance.now();
}

/**
 * 무한 모드 제한시간 interval과 대상 시청자를 해제하고 신호 문구를 복원합니다.
 */
function clearThreatCountdown(restoreSignal = true) {
  window.clearInterval(threatInterval);
  threatInterval = undefined;
  pendingThreat = null;
  threatRemainingMs = 0;
  threatTimer.hidden = true;
  if (restoreSignal) updateStreamState(chatApp.dataset.directorState || "AMBIENT");
}

/**
 * 실제 경과 시간을 제한시간에서 차감하고 0이 되면 이상 신호 침투를 처리합니다.
 */
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

/**
 * 스테이지 상승에 따라 감소하되 최소값 이하로 내려가지 않는 제한시간을 계산합니다.
 */
function getStageGraceMs() {
  return Math.max(
    MIN_ANOMALY_GRACE_MS,
    BASE_ANOMALY_GRACE_MS - (currentStage - 1) * STAGE_GRACE_STEP_MS
  );
}

/**
 * 새 이상 시청자를 제한시간 대상으로 지정하고 HUD 타이머를 시작합니다.
 */
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

/**
 * 지정된 최소·최대 범위에서 다음 괴이 출현까지의 지연을 선택합니다.
 */
function getApparitionDelay([minimum, maximum]) {
  return minimum + apparitionRandom() * (maximum - minimum);
}

/**
 * 연결 관련 타이머와 작은 상단 위젯을 정상 와이파이 상태로 되돌립니다.
 */
function resetConnectionWidget() {
  window.clearTimeout(apparitionExpireTimer);
  window.clearTimeout(connectionFeedbackTimer);
  apparitionExpireTimer = undefined;
  connectionFeedbackTimer = undefined;
  apparitionActive = false;
  apparitionExpired = false;
  connectionWidget.classList.remove("is-weak", "is-failed", "is-false-reconnect");
  connectionWidget.setAttribute("aria-label", "방송 연결 상태: 안정");
  connectionStatus.textContent = "연결 안정";
  reconnectButton.setAttribute("aria-label", "방송 재연결");
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
 */
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

/**
 * 별도 알림 메시지나 큰 화면 변화 없이 상단 와이파이 위젯만 약한 연결 상태로 전환합니다.
 */
function spawnStreamApparition() {
  if (apparitionActive || gameOver || stageReviewOpen || titleScreen.hidden === false) return false;
  window.clearTimeout(apparitionSpawnTimer);
  apparitionSpawnTimer = undefined;
  apparitionActive = true;
  apparitionExpired = false;
  window.clearTimeout(connectionFeedbackTimer);
  connectionFeedbackTimer = undefined;
  connectionWidget.classList.remove("is-failed", "is-false-reconnect");
  connectionWidget.classList.add("is-weak");
  connectionWidget.setAttribute("aria-label", "방송 연결 상태: 약함");
  connectionStatus.textContent = "연결 약함";
  reconnectButton.setAttribute("aria-label", "약해진 방송 연결 재연결");
  apparitionExpireTimer = window.setTimeout(expireStreamApparition, APPARITION_LIFETIME_MS);
  return true;
}

/**
 * 제한시간 안에 재접속하지 못한 경우 한 번만 실패로 기록하고 상단 위젯을 끊김 상태로 유지합니다.
 */
function expireStreamApparition() {
  if (!apparitionActive || apparitionExpired) return;
  if (document.hidden) {
    apparitionExpireTimer = window.setTimeout(expireStreamApparition, 1000);
    return;
  }

  window.clearTimeout(apparitionExpireTimer);
  apparitionExpireTimer = undefined;
  apparitionExpired = true;
  connectionWidget.classList.add("is-failed");
  connectionWidget.setAttribute("aria-label", "방송 연결 상태: 끊김");
  connectionStatus.textContent = "연결 끊김";
  missedApparitions += 1;
  dayMissedApparitions += 1;
  if (gameMode === GAME_MODES.STORY) return;

  health = Math.max(0, health - 1);
  score = Math.max(0, score - 75);
  lastDamageReason = "apparition";
  updateHud();
  if (health === 0) {
    finishStage({
      success: false,
      title: "연결 복구 실패",
      copy: "약해진 방송 연결에 제때 다시 접속하지 못해 체력을 모두 잃었습니다."
    });
  }
}

/**
 * 재연결 버튼은 실제 괴이 연결이면 복구하고, 정상 연결에서 누르면 오판으로 체력을 감소시킵니다.
 */
function reconnectStreamConnection() {
  if (gameOver || stageReviewOpen) return;
  if (!apparitionActive) {
    health = Math.max(0, health - 1);
    falseReconnects += 1;
    lastDamageReason = "false-reconnect";
    updateHud();
    window.clearTimeout(connectionFeedbackTimer);
    connectionWidget.classList.remove("is-false-reconnect");
    void connectionWidget.offsetWidth;
    connectionWidget.classList.add("is-false-reconnect");
    connectionWidget.setAttribute("aria-label", "방송 연결 상태: 정상, 불필요한 재연결");
    connectionStatus.textContent = "정상 연결 · 오판";

    if (health === 0) {
      if (gameMode === GAME_MODES.STORY) endGame();
      else finishStage({
        success: false,
        title: "불필요한 재연결",
        copy: "정상 연결을 반복해서 재설정해 체력을 모두 잃었습니다."
      });
      return;
    }

    connectionFeedbackTimer = window.setTimeout(() => {
      connectionWidget.classList.remove("is-false-reconnect");
      connectionWidget.setAttribute("aria-label", "방송 연결 상태: 안정");
      connectionStatus.textContent = "연결 안정";
      connectionFeedbackTimer = undefined;
    }, 1100);
    return;
  }

  const recoveredInTime = !apparitionExpired;
  resetConnectionWidget();
  if (recoveredInTime) {
    banishedApparitions += 1;
    dayBanishedApparitions += 1;
    score += 100;
    updateHud();
  }
  scheduleStreamApparition();
}

/**
 * 하루 또는 스테이지 종료 순간 복구하지 않은 연결을 중복 없이 실패로 확정합니다.
 */
function settleActiveApparitionAsMissed() {
  if (!apparitionActive) return;
  if (!apparitionExpired) {
    missedApparitions += 1;
    dayMissedApparitions += 1;
  }
  resetConnectionWidget();
}
