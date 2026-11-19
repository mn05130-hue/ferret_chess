"use strict";

/*
 * 판정과 결과 화면 전환을 담당합니다.
 * 무한 모드는 이상 채팅을 처리하는 즉시 한 스테이지 결과를 공개하지만, 스토리 모드는
 * 오전 2시까지 선택을 숨긴 뒤 정상 오판·이상 미처리·연결 실패를 한꺼번에 집계합니다.
 * 결과 카드는 검은 화면 대기 후 공개되며 오답일 때만 정전기 공포 연출을 추가합니다.
 */
/**
 * 일반 스테이지/최종 결과의 예약 공개를 취소하고 대기 클래스를 제거합니다.
 */
function clearStandardResultReveal() {
  window.clearTimeout(resultRevealTimer);
  resultRevealTimer = undefined;
  stageOverlay.classList.remove("results-visible");
  gameOverlay.classList.remove("results-visible");
}

/**
 * 어두운 결과 배경을 먼저 연 뒤 지나면 카드와 조작 버튼을 공개합니다.
 * @param {HTMLElement} overlay open/results-visible 상태를 받을 오버레이
 * @param {HTMLElement} card 지연 공개 중 접근성 트리에서도 숨길 결과 카드
 * @param {HTMLButtonElement[]} controls 공개 전까지 비활성화할 조작 버튼
 * @param {HTMLElement} focusTarget 공개 완료 후 키보드 초점을 옮길 요소
 */
function beginStandardResultReveal(overlay, card, controls, focusTarget) {
  clearStandardResultReveal();
  card.setAttribute("aria-hidden", "true");
  controls.forEach(control => { control.disabled = true; });
  resultRevealTimer = window.setTimeout(() => {
    overlay.classList.add("results-visible");
    card.setAttribute("aria-hidden", "false");
    controls.forEach(control => { control.disabled = false; });
    focusTarget.focus();
    resultRevealTimer = undefined;
  }, END_REVEAL_DELAY_MS);
}

/**
 * 지정한 간섭 클래스를 재시작해 오답·침투 상황의 전 화면 효과를 재생합니다.
 * @param {"mosaic"|"color"} type 정상 시청자 오판 또는 이상 신호 침투 효과 종류
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
 * @param {{success: boolean, title: string, copy: string, evidence?: string}} result 카드에 표시할 판정
 */
function finishStage({ success, title, copy, evidence = "" }) {
  if (stageReviewOpen || gameOver) return;
  stageReviewOpen = true;
  clearAnomalyChatEffect();
  clearThreatCountdown(false);
  clearStreamApparition();
  streamSignal.textContent = "스테이지 정산 중";
  closeViewerPanel();
  syncEnginePause();
  prepareResultMusic(success ? "endlessClear" : "endlessFailed");

  stageCard.classList.toggle("failed", !success);
  stageResultKicker.textContent = `STAGE ${String(currentStage).padStart(2, "0")} ${success ? "CLEAR" : "FAILED"}`;
  stageResultMark.textContent = success ? "✓" : "!";
  stageResultTitle.textContent = title;
  stageResultCopy.textContent = copy;
  stageResultEvidence.textContent = evidence;
  stageCaught.textContent = String(caughtAnomalies);
  stageMissed.textContent = String(missedAnomalies);
  stageWrong.textContent = String(wrongKicks);
  stageHealth.textContent = String(health);
  recordEndlessProgress(score, currentStage);

  const gameEnded = health === 0;
  stageContinue.textContent = gameEnded ? "최종 결과 보기" : "다음 스테이지";
  stageOverlay.classList.add("open");
  stageOverlay.setAttribute("aria-hidden", "false");
  beginStandardResultReveal(stageOverlay, stageCard, [stageContinue], stageContinue);
}

/**
 * 제한시간이 끝난 이상 시청자를 침투 처리하고 체력·점수·화면 간섭을 적용합니다.
 */
function expireThreat() {
  const post = boardPosts.get(pendingThreatPostId);
  if (!post || post.deleted || stageReviewOpen || gameOver) {
    clearThreatCountdown();
    return;
  }

  remainingAnomalies -= 1;
  missedAnomalies += 1;
  const outcome = FERRET_CHAT_RULES.getMissedAnomalyOutcome();
  health = Math.max(0, health + outcome.healthDelta);
  lastDamageReason = "missed";
  score = Math.max(0, score + outcome.scoreDelta);
  updateHud();
  triggerScreenInterference("color");
  finishStage({
    success: false,
    title: "이상 게시글 삭제 실패",
    copy: `${post.author.name}의 이상 게시글을 제한시간 안에 삭제하지 못해 체력이 1 감소했습니다.`,
    evidence: getPostEvidenceSummary(post)
  });
}

function truncateEvidenceText(text, maximum = 54) {
  const normalized = String(text || "").replace(/\s+/g, " ").trim();
  return normalized.length > maximum ? `${normalized.slice(0, maximum - 1)}…` : normalized;
}

function getPostEvidenceSummary(post) {
  const quote = truncateEvidenceText(post.originalBody);
  const result = post.anomalous
    ? `“${quote}” · ${post.bodyEvidence}`
    : `정상 게시글 · “${quote}”`;
  return post.corruptedDuringPlay
    ? `${result} (동기화 오류로 깨진 화면은 판정에서 제외)` : result;
}

let storyReviewPosts = [];
let storyReviewIndex = 0;
let storyReviewErrorsOnly = false;

function isStoryPostMistake(post) {
  return post.anomalous !== post.deleted;
}

function prepareStoryReview(posts) {
  storyReviewPosts = [
    ...posts.filter(isStoryPostMistake),
    ...posts.filter(post => !isStoryPostMistake(post))
  ];
  storyReviewIndex = 0;
  storyReviewErrorsOnly = false;
  renderStoryReview();
}

function getStoryReviewPosts() {
  return storyReviewErrorsOnly ? storyReviewPosts.filter(isStoryPostMistake) : storyReviewPosts;
}

function renderStoryReview() {
  const posts = getStoryReviewPosts();
  const post = posts[storyReviewIndex];
  storyReviewFilter.setAttribute("aria-pressed", String(storyReviewErrorsOnly));
  storyReviewFilter.hidden = storyReviewPosts.length === 0;
  storyReviewEmpty.hidden = Boolean(post);
  storyReviewPost.hidden = !post;
  storyReviewPrev.disabled = !post || storyReviewIndex === 0;
  storyReviewNext.disabled = !post || storyReviewIndex === posts.length - 1;
  if (!post) {
    storyReviewEmpty.textContent = storyReviewErrorsOnly ? "오늘은 오답이 없습니다." : "오늘 올라온 글이 없습니다.";
    return;
  }

  const mistake = isStoryPostMistake(post);
  storyReviewProgress.textContent = `${storyReviewErrorsOnly ? "오답" : "전체 · 오답 먼저"} ${storyReviewIndex + 1} / ${posts.length}`;
  storyReviewPostTitle.textContent = post.header.title;
  storyReviewAuthor.textContent = formatPostMetadata(post);
  storyReviewBody.textContent = post.originalBody;
  storyReviewDiscussion.open = false;
  storyReviewCommentsHeading.textContent = `댓글 ${post.comments.length}개 보기`;
  renderBoardComments(storyReviewComments, post);
  storyReviewAction.textContent = post.deleted ? "삭제" : post.kept ? "유지" : "처리 안 함";
  storyReviewAnswer.textContent = post.anomalous ? "삭제" : "유지";
  storyReviewVerdict.textContent = mistake
    ? (post.anomalous ? "놓친 이상 글" : "정상 글 오삭제")
    : (post.anomalous ? "이상 글 삭제 성공" : "정상 글 유지");
  storyReviewVerdict.classList.toggle("is-mistake", mistake);
  storyReviewReason.textContent = post.bodyEvidence
    || "본문에서 삭제 규정에 해당하는 근거를 찾을 수 없습니다. 제목·닉네임·날짜·생성번호의 이상만으로는 삭제하지 않습니다.";
  storyReviewSync.hidden = !post.corruptedDuringPlay;
}

function toggleStoryReviewFilter() {
  storyReviewErrorsOnly = !storyReviewErrorsOnly;
  storyReviewIndex = 0;
  renderStoryReview();
}

function moveStoryReview(step) {
  const index = storyReviewIndex + step;
  if (index < 0 || index >= getStoryReviewPosts().length) return;
  storyReviewIndex = index;
  renderStoryReview();
  if (document.activeElement?.disabled) {
    const availableButton = step > 0 ? storyReviewPrev : storyReviewNext;
    availableButton.focus({ preventScroll: true });
  }
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
  storyReviewBackground.forEach(element => { element.inert = false; });
}

/**
 * 검은 화면과 불길한 형상을 먼저 보여 준 뒤 오답 여부에 따라 결과 공개 효과를 분기합니다.
 * @param {boolean} hasWrongAnswer 체력 피해를 일으킨 오답 또는 미처리가 있었는지 여부
 */
function beginStoryNightReveal(hasWrongAnswer) {
  resetStoryNightReveal();
  storyReviewBackground.forEach(element => { element.inert = true; });
  storyNightOverlay.classList.toggle("is-wrong", hasWrongAnswer);
  void storyNightOverlay.offsetWidth;
  storyNightOverlay.classList.add("open");
  storyNightOverlay.setAttribute("aria-hidden", "false");

  const revealResults = () => {
    storyNightCard.scrollTop = 0;
    storyNightOverlay.classList.add("results-visible");
    storyNightCard.setAttribute("aria-hidden", "false");
    storyContinue.disabled = false;
    storyReviewTitle.focus();
  };

  const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  if (hasWrongAnswer && !reducedMotion) {
    storyScareTimer = window.setTimeout(() => {
      storyNightOverlay.classList.add("scare-hit");
      playStaticScare();
    }, 1800);
  }
  if (reducedMotion) revealResults();
  else storyRevealTimer = window.setTimeout(revealResults, RESULT_REVEAL_DELAY_MS);
}

/**
 * 오전 2시에 강퇴·미처리·괴이 결과를 일괄 계산해 체력과 다음 진행을 결정합니다.
 */
function finishStoryDay() {
  if (gameMode !== GAME_MODES.STORY || stageReviewOpen || gameOver) return;
  const endedEarly = health === 0;
  stageReviewOpen = true;
  stopGuidedTutorialPractice();
  clearAnomalyChatEffect();
  stopStoryClock();
  clearThreatCountdown(false);
  clearStreamApparition();
  chatEngine?.stop();
  stopAmbientHorrorSfx();
  closeViewerPanel();
  streamSignal.textContent = "순찰 종료 · 판정 중";

  const posts = [...boardPosts.values()];
  const caughtToday = posts.filter(post => post.anomalous && post.deleted);
  const wrongToday = posts.filter(post => !post.anomalous && post.deleted);
  const missedToday = posts.filter(post => post.anomalous && !post.deleted);
  const outcome = FERRET_CHAT_RULES.calculateStoryDayOutcome({
    caught: caughtToday.length,
    missed: missedToday.length,
    wrong: wrongToday.length,
    health,
    score
  });
  const { damage, appliedDamage } = outcome;

  caughtAnomalies += caughtToday.length;
  missedAnomalies += missedToday.length;
  wrongKicks += wrongToday.length;
  remainingAnomalies = 0;
  health = outcome.health;
  score = outcome.score;
  if (damage > 0 && !endedEarly) {
    lastDamageReason = missedToday.length > 0 ? "missed" : "wrong-kick";
  }
  updateHud();

  storyResultKicker.textContent = `DAY ${String(currentStage).padStart(2, "0")} · MODERATION LOG`;
  storyResultTitle.textContent = `${currentStage}일차 운영 결과`;
  if (endedEarly) {
    storyResultCopy.textContent = "정상 상태에서 복구를 눌러 순찰이 일찍 끝났습니다. 지금까지 올라온 글을 한 건씩 확인할 수 있습니다.";
  } else if (damage === 0 && dayMissedApparitions > 0) {
    storyResultCopy.textContent = "동기화 오류가 있었지만 게시글 삭제로 잃은 체력은 없습니다.";
  } else if (damage === 0) {
    storyResultCopy.textContent = "오늘의 판단은 정확했습니다. 체력을 잃지 않고 순찰을 마쳤습니다.";
  } else {
    const reasons = [];
    if (missedToday.length) reasons.push(`이상 글 ${missedToday.length}건 놓침`);
    if (wrongToday.length) reasons.push(`정상 글 ${wrongToday.length}건 오삭제`);
    storyResultCopy.textContent = `${reasons.join(", ")}으로 체력이 ${appliedDamage} 감소했습니다.`;
  }

  storyCaught.textContent = String(caughtToday.length);
  storyMissed.textContent = String(missedToday.length);
  storyWrong.textContent = String(wrongToday.length);
  storyApparitionMissed.textContent = String(dayMissedApparitions);
  storyHealth.textContent = String(health);
  caughtToday.forEach(post => recordDiscoveredAnomaly(post.author.anomalyPermission));
  prepareStoryReview(posts);

  if (health === 0) storyContinue.textContent = "최종 결과 보기";
  else if (currentStage === STORY_TOTAL_DAYS) storyContinue.textContent = "7일 생존 결과 보기";
  else storyContinue.textContent = `${currentStage + 1}일차 시작`;

  prepareResultMusic(damage > 0 ? "storyWrong" : "storyCorrect");
  beginStoryNightReveal(damage > 0 || endedEarly);
}

/**
 * 하루 결과 뒤 게임 종료, 최종 승리, 다음 날 시작 중 알맞은 흐름으로 이동합니다.
 */
function continueFromStoryResult() {
  if (!stageReviewOpen || storyContinue.disabled) return;
  resetStoryNightReveal();
  storyReviewPosts = [];

  if (health === 0) {
    stageReviewOpen = false;
    endGame();
    return;
  }

  if (currentStage === STORY_TOTAL_DAYS) {
    storyVictory = true;
    recordStoryClear();
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
