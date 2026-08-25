"use strict";

// Stage resolution, story-night verdicts, and transition effects.
/**
 * 지정한 간섭 클래스를 재시작해 오답·침투 상황의 전 화면 효과를 재생합니다.
 */
function triggerScreenInterference(type) {
  window.clearTimeout(interferenceTimer);
  chatApp.classList.remove("interference-mosaic", "interference-color");
  void screenInterference.offsetWidth;
  chatApp.classList.add(type === "mosaic" ? "interference-mosaic" : "interference-color");
  interferenceTimer = window.setTimeout(() => {
    chatApp.classList.remove("interference-mosaic", "interference-color");
  }, type === "mosaic" ? 1200 : 1500);
}

/**
 * 무한 모드 한 스테이지를 정지하고 성공/실패 요약을 결과 카드에 채웁니다.
 */
function finishStage({ success, title, copy }) {
  if (stageReviewOpen || gameOver) return;
  stageReviewOpen = true;
  clearThreatCountdown(false);
  clearStreamApparition();
  streamSignal.textContent = "스테이지 정산 중";
  closeEmojiPanel();
  closeViewerPanel();
  syncEnginePause();

  stageCard.classList.toggle("failed", !success);
  stageResultKicker.textContent = `STAGE ${String(currentStage).padStart(2, "0")} ${success ? "CLEAR" : "FAILED"}`;
  stageResultMark.textContent = success ? "✓" : "!";
  stageResultTitle.textContent = title;
  stageResultCopy.textContent = copy;
  stageCaught.textContent = String(caughtAnomalies);
  stageMissed.textContent = String(missedAnomalies);
  stageWrong.textContent = String(wrongKicks);
  stageHealth.textContent = String(health);

  const gameEnded = health === 0;
  stageContinue.textContent = gameEnded ? "최종 결과 보기" : "다음 스테이지";
  stageOverlay.classList.add("open");
  stageOverlay.setAttribute("aria-hidden", "false");
  stageContinue.focus();
}

/**
 * 제한시간이 끝난 이상 시청자를 침투 처리하고 체력·점수·화면 간섭을 적용합니다.
 */
function expireThreat() {
  const viewer = pendingThreat;
  if (!viewer?.active || stageReviewOpen || gameOver) {
    clearThreatCountdown();
    return;
  }

  viewer.active = false;
  remainingAnomalies -= 1;
  missedAnomalies += 1;
  health = Math.max(0, health - 1);
  lastDamageReason = "missed";
  score = Math.max(0, score - 100);
  markViewerAsKicked(viewer, "이상 신호에 잠식되어 연결이 끊겼습니다.");
  updateHud();
  triggerScreenInterference("color");
  finishStage({
    success: false,
    title: "이상 신호 추적 실패",
    copy: `${viewer.name}의 이상 채팅을 제한시간 안에 처리하지 못해 체력이 1 감소했습니다.`
  });
}

/**
 * 스토리 하루 결과의 세부 판정 한 줄을 상태 클래스와 함께 추가합니다.
 */
function appendStoryResultDetail(text, className = "") {
  const item = document.createElement("li");
  item.className = className;
  item.textContent = text;
  storyResultDetails.append(item);
}

/**
 * 스토리 결과 연출 타이머와 클래스를 제거해 다음 날 사용할 초기 상태로 되돌립니다.
 */
function resetStoryNightReveal() {
  window.clearTimeout(storyRevealTimer);
  window.clearTimeout(storyScareTimer);
  storyRevealTimer = undefined;
  storyScareTimer = undefined;
  storyNightOverlay.classList.remove("open", "is-wrong", "scare-hit", "results-visible");
  storyNightOverlay.setAttribute("aria-hidden", "true");
  storyNightCard.setAttribute("aria-hidden", "true");
  storyContinue.disabled = true;
}

/**
 * 검은 화면과 불길한 형상을 먼저 보여 준 뒤 오답 여부에 따라 결과 공개 효과를 분기합니다.
 */
function beginStoryNightReveal(hasWrongAnswer) {
  resetStoryNightReveal();
  storyNightOverlay.classList.toggle("is-wrong", hasWrongAnswer);
  void storyNightOverlay.offsetWidth;
  storyNightOverlay.classList.add("open");
  storyNightOverlay.setAttribute("aria-hidden", "false");

  const revealResults = () => {
    storyNightOverlay.classList.add("results-visible");
    storyNightCard.setAttribute("aria-hidden", "false");
    storyContinue.disabled = false;
    storyContinue.focus();
  };

  if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
    revealResults();
    return;
  }

  if (hasWrongAnswer) {
    storyScareTimer = window.setTimeout(() => {
      storyNightOverlay.classList.add("scare-hit");
      playStaticScare();
    }, 1800);
  }
  storyRevealTimer = window.setTimeout(revealResults, hasWrongAnswer ? 2750 : 2350);
}

/**
 * 오전 2시에 강퇴·미처리·괴이 결과를 일괄 계산해 체력과 다음 진행을 결정합니다.
 */
function finishStoryDay() {
  if (gameMode !== GAME_MODES.STORY || stageReviewOpen || gameOver) return;
  stageReviewOpen = true;
  stopStoryClock();
  clearThreatCountdown(false);
  settleActiveApparitionAsMissed();
  clearStreamApparition();
  chatEngine?.stop();
  closeEmojiPanel();
  closeViewerPanel();
  streamSignal.textContent = "방송 종료 · 판정 중";

  const kickedViewers = viewers.filter(viewer => viewer.kickedByPlayer);
  const caughtToday = kickedViewers.filter(viewer => viewer.anomalous);
  const wrongToday = kickedViewers.filter(viewer => !viewer.anomalous);
  const missedToday = viewers.filter(viewer => viewer.anomalous && !viewer.kickedByPlayer);
  const damage = wrongToday.length + missedToday.length + dayMissedApparitions;
  const appliedDamage = Math.min(health, damage);

  caughtAnomalies += caughtToday.length;
  missedAnomalies += missedToday.length;
  wrongKicks += wrongToday.length;
  remainingAnomalies = 0;
  health = Math.max(0, health - appliedDamage);
  score = Math.max(0, score + caughtToday.length * 150
    - missedToday.length * 100
    - wrongToday.length * 75
    - dayMissedApparitions * 75);
  if (damage > 0) {
    lastDamageReason = dayMissedApparitions > 0
      ? "apparition"
      : missedToday.length > 0 ? "missed" : "wrong-kick";
  }
  updateHud();

  storyResultKicker.textContent = `DAY ${String(currentStage).padStart(2, "0")} · BROADCAST CLOSED`;
  storyResultTitle.textContent = `${currentStage}일차 방송 결과`;
  if (damage === 0) {
    storyResultCopy.textContent = "오늘의 판단은 정확했습니다. 체력을 잃지 않고 방송을 종료했습니다.";
  } else {
    const reasons = [];
    if (missedToday.length) reasons.push(`이상 시청자 ${missedToday.length}명 놓침`);
    if (wrongToday.length) reasons.push(`정상 시청자 ${wrongToday.length}명 오판`);
    if (dayMissedApparitions) reasons.push(`연결 복구 ${dayMissedApparitions}회 실패`);
    storyResultCopy.textContent = `${reasons.join(", ")}으로 체력이 ${appliedDamage} 감소했습니다.`;
  }

  storyCaught.textContent = String(caughtToday.length);
  storyMissed.textContent = String(missedToday.length);
  storyWrong.textContent = String(wrongToday.length);
  storyApparitionMissed.textContent = String(dayMissedApparitions);
  storyHealth.textContent = String(health);
  storyResultDetails.replaceChildren();
  caughtToday.forEach(viewer => appendStoryResultDetail(`이상 연결 차단 성공 · ${viewer.name}`, "correct"));
  missedToday.forEach(viewer => appendStoryResultDetail(`놓친 이상 시청자 · ${viewer.name}`, "danger"));
  wrongToday.forEach(viewer => appendStoryResultDetail(`정상 시청자 오판 · ${viewer.name}`, "danger"));
  if (dayBanishedApparitions) appendStoryResultDetail(`방송 연결 복구 성공 · ${dayBanishedApparitions}회`, "correct");
  if (dayMissedApparitions) appendStoryResultDetail(`방송 연결 복구 실패 · ${dayMissedApparitions}회`, "danger");
  if (!storyResultDetails.childElementCount) appendStoryResultDetail("오늘 기록에는 판정할 연결이 없습니다.");

  if (health === 0) storyContinue.textContent = "최종 결과 보기";
  else if (currentStage === STORY_TOTAL_DAYS) storyContinue.textContent = "7일 생존 결과 보기";
  else storyContinue.textContent = `${currentStage + 1}일차 시작`;

  beginStoryNightReveal(damage > 0);
}

/**
 * 하루 결과 뒤 게임 종료, 최종 승리, 다음 날 시작 중 알맞은 흐름으로 이동합니다.
 */
function continueFromStoryResult() {
  resetStoryNightReveal();

  if (health === 0) {
    stageReviewOpen = false;
    endGame();
    return;
  }

  if (currentStage === STORY_TOTAL_DAYS) {
    storyVictory = true;
    stageReviewOpen = false;
    endGame();
    return;
  }

  currentStage += 1;
  stageReviewOpen = false;
  startStage();
}

/**
 * 무한 모드 결과 뒤 체력이 남으면 다음 스테이지를 시작하고 아니면 최종 결과를 엽니다.
 */
function continueFromStageResult() {
  stageOverlay.classList.remove("open");
  stageOverlay.setAttribute("aria-hidden", "true");

  if (health === 0) {
    stageReviewOpen = false;
    endGame();
    return;
  }

  currentStage += 1;
  stageReviewOpen = false;
  startStage();
}
