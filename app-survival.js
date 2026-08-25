"use strict";

// Story clock, threat timer, and stream apparition encounters.
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
