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
 * 실제 경과 시간을 오후 7시부터 오전 2시까지의 게임 내 시각 문자열로 변환합니다.
 * @param {number} elapsedMs 이번 하루가 시작된 뒤 흐른 실제 밀리초
 * @returns {string} 오전/오후와 시:분으로 구성한 게임 시각
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
 * @param {object} viewer 이번 제한시간 안에 차단해야 하는 활성 시청자
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
  connectionWidget.setAttribute("aria-label", `방송 연결 상태: ${stage.label}`);
  connectionStatus.textContent = stage.label;
  reconnectButton.setAttribute("aria-label", `방송 재연결 · 현재 상태 ${stage.label}`);
}

/**
 * 연결 관련 타이머와 작은 상단 위젯을 정상 와이파이 상태로 되돌립니다.
 */
function resetConnectionWidget() {
  window.clearTimeout(apparitionWeakTimer);
  window.clearTimeout(apparitionMosaicTimer);
  window.clearTimeout(apparitionExpireTimer);
  window.clearTimeout(connectionFeedbackTimer);
  apparitionWeakTimer = undefined;
  apparitionMosaicTimer = undefined;
  apparitionExpireTimer = undefined;
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
    if (document.hidden) {
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
  if (apparitionActive || gameOver || stageReviewOpen || titleScreen.hidden === false) return false;
  window.clearTimeout(apparitionSpawnTimer);
  apparitionSpawnTimer = undefined;
  apparitionActive = true;
  apparitionExpired = false;
  window.clearTimeout(connectionFeedbackTimer);
  connectionFeedbackTimer = undefined;
  connectionWidget.classList.remove("is-false-reconnect");
  setConnectionStage(CONNECTION_STAGES.NORMAL);
  apparitionWeakTimer = window.setTimeout(
    weakenStreamConnection,
    APPARITION_LIFETIME_MS * APPARITION_WEAK_STAGE_RATIO
  );
  // 전체 제한시간의 마지막 2초에만 저해상도 모자이크를 켭니다.
  apparitionMosaicTimer = window.setTimeout(
    startConnectionMosaic,
    Math.max(0, APPARITION_LIFETIME_MS - APPARITION_MOSAIC_DURATION_MS)
  );
  apparitionExpireTimer = window.setTimeout(expireStreamApparition, APPARITION_LIFETIME_MS);
  return true;
}

/**
 * 연결 괴이 대응 시간이 설정된 비율만큼 지나면 위젯을 3단계인 약함 상태로 악화시킵니다.
 */
function weakenStreamConnection() {
  if (!apparitionActive || apparitionExpired) return;
  if (document.hidden) {
    apparitionWeakTimer = window.setTimeout(weakenStreamConnection, 500);
    return;
  }
  apparitionWeakTimer = undefined;
  setConnectionStage(CONNECTION_STAGES.WEAK);
}

/**
 * 연결이 끊기기 직전 마지막 구간에 방송 화면만 낮은 해상도처럼 깨뜨립니다.
 * 탭이 숨겨져 있으면 보이지 않는 동안 연출 시간이 소모되지 않도록 짧게 다시 확인합니다.
 */
function startConnectionMosaic() {
  if (!apparitionActive || apparitionExpired) return;
  if (document.hidden) {
    apparitionMosaicTimer = window.setTimeout(startConnectionMosaic, 500);
    return;
  }

  apparitionMosaicTimer = undefined;
  // 설정값이 바뀌어 약함 전환 시점이 늦어져도 모자이크 구간은 항상 약함으로 표시합니다.
  if (connectionWidget.dataset.connectionStage !== CONNECTION_STAGES.WEAK) {
    setConnectionStage(CONNECTION_STAGES.WEAK);
  }
  chatApp.classList.add("connection-pixelated");
}

/**
 * 제한시간 안에 재접속하지 못한 경우 한 번만 실패로 기록하고 위젯을 4단계인 끊김으로 유지합니다.
 */
function expireStreamApparition() {
  if (!apparitionActive || apparitionExpired) return;
  if (document.hidden) {
    apparitionExpireTimer = window.setTimeout(expireStreamApparition, 1000);
    return;
  }

  window.clearTimeout(apparitionWeakTimer);
  window.clearTimeout(apparitionMosaicTimer);
  window.clearTimeout(apparitionExpireTimer);
  apparitionWeakTimer = undefined;
  apparitionMosaicTimer = undefined;
  apparitionExpireTimer = undefined;
  apparitionExpired = true;
  // 끊김은 별도의 공포 연출을 사용하므로 직전 단계의 모자이크를 즉시 제거합니다.
  chatApp.classList.remove("connection-pixelated");
  chatApp.classList.add("connection-lost");
  corruptVisibleMessagesForConnectionLoss();
  setConnectionStage(CONNECTION_STAGES.DISCONNECTED);
  missedApparitions += 1;
  dayMissedApparitions += 1;
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
    connectionWidget.setAttribute("aria-label", "방송 연결 상태: 좋음, 불필요한 재연결");
    connectionStatus.textContent = "좋음 · 오판";

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
      setConnectionStage(CONNECTION_STAGES.GOOD);
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
