"use strict";

// Story clock, threat timer, and stream apparition encounters.
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
 * 괴이 버튼을 숨기고 활성 상태 및 만료 타이머를 정리합니다.
 */
function hideStreamApparition() {
  window.clearTimeout(apparitionExpireTimer);
  apparitionExpireTimer = undefined;
  apparitionActive = false;
  streamApparition.hidden = true;
}

/**
 * 현재 괴이와 앞으로 예정된 출현을 모두 취소합니다.
 */
function clearStreamApparition() {
  window.clearTimeout(apparitionSpawnTimer);
  apparitionSpawnTimer = undefined;
  hideStreamApparition();
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
 * 괴이의 위치·크기·변형을 정하고 제한시간 동안 방송 화면에 노출합니다.
 */
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

/**
 * 플레이어가 제때 누르지 못한 괴이를 실패로 집계하고 체력/점수에 반영합니다.
 */
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

/**
 * 활성 괴이를 클릭했을 때 퇴치 수와 보상을 기록하고 다음 출현을 예약합니다.
 */
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

/**
 * 하루 또는 스테이지 종료 순간 남아 있던 괴이를 놓친 것으로 확정합니다.
 */
function settleActiveApparitionAsMissed() {
  if (!apparitionActive) return;
  hideStreamApparition();
  missedApparitions += 1;
  dayMissedApparitions += 1;
}
