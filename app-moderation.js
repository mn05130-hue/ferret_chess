"use strict";

/* 게시글 상세 화면과 의심 표시, 유지, 삭제 동작을 관리합니다. */

function renderPostDetail(post) {
  const connectionLost = apparitionActive && apparitionExpired;
  postDetailTitle.textContent = getDisplayedPostTitle(post);
  postBody.textContent = getPostBody(post);
  postAuthor.textContent = formatPostMetadata(post);
  deletePostButton.disabled = connectionLost;
  postSyncWarning.hidden = !connectionLost;
  postCommentsHeading.textContent = `댓글 ${post.comments.length}`;
  renderBoardComments(postComments, post, connectionLost);

  postAuthorHistory.replaceChildren();
  const records = post.author.history.filter(record => record.postId !== post.id
    && !boardPosts.get(record.postId)?.deleted);
  postHistoryEmpty.hidden = records.length > 0;
  for (const record of records.slice(-6).reverse()) {
    const item = document.createElement("li");
    item.textContent = connectionLost
      ? createUnknownChatText(record.body, post.author) : record.body;
    postAuthorHistory.append(item);
  }
}

function renderSuspectButton(post) {
  suspectButton.setAttribute("aria-pressed", String(post.suspected));
  suspectButton.textContent = post.suspected ? "의심 해제" : "의심 표시";
}

function openPostPanel(postId, trigger) {
  if (gameOver || stageReviewOpen || tutorialOpen) return;
  const post = boardPosts.get(postId);
  if (!post || post.deleted) return;
  selectedPostId = postId;
  postPanelTrigger = trigger;
  renderPostDetail(post);
  chatEngine?.observeViewer(post.author.id);
  notifyTutorialViewerObserved(post.author);
  postDetailBackdrop.classList.add("open");
  postDetailBackdrop.setAttribute("aria-hidden", "false");
  renderSuspectButton(post);
  postDetailBackdrop.querySelector(".viewer-panel").scrollTop = 0;
  keepPostButton.hidden = gameMode !== GAME_MODES.STORY;
  keepPostButton.setAttribute("aria-pressed", String(post.kept));
  closePostButton.focus({ preventScroll: true });
}

function closePostPanel() {
  const wasOpen = selectedPostId !== null;
  selectedPostId = null;
  postDetailBackdrop.classList.remove("open");
  postDetailBackdrop.setAttribute("aria-hidden", "true");
  if (wasOpen) {
    const focusTarget = postPanelTrigger?.isConnected ? postPanelTrigger : messageList;
    focusTarget.focus({ preventScroll: true });
  }
  postPanelTrigger = null;
}

function toggleSelectedPostSuspect() {
  if (gameOver || stageReviewOpen || tutorialOpen) return;
  const post = boardPosts.get(selectedPostId);
  if (!post || post.deleted) return;
  post.suspected = !post.suspected;
  const row = messageList.querySelector(`[data-post-id="${post.id}"]`);
  if (row) updatePostRowStatus(row, post);
  renderSuspectButton(post);
}

function toggleKeepSelectedPost() {
  if (gameMode !== GAME_MODES.STORY || !updateRoundClock()) return;
  const post = boardPosts.get(selectedPostId);
  if (!post || post.deleted) return;
  post.kept = !post.kept;
  const row = messageList.querySelector(`[data-post-id="${post.id}"]`);
  if (row) updatePostRowStatus(row, post);
  keepPostButton.setAttribute("aria-pressed", String(post.kept));
  if (post.kept) closePostPanel();
}

function deleteSelectedPost() {
  if (!updateRoundClock() || (apparitionActive && apparitionExpired)) return;
  const post = boardPosts.get(selectedPostId);
  if (!post || post.deleted) return;
  post.deleted = true;
  post.kept = false;
  messageList.querySelector(`[data-post-id="${post.id}"]`)?.remove();
  closePostPanel();

  if (gameMode === GAME_MODES.STORY) {
    notifyTutorialPostDeleted(post);
    appendSystemMessage("게시글을 삭제했습니다. 판정은 오전 2시에 공개됩니다.");
    return;
  }

  const outcome = FERRET_CHAT_RULES.getViewerKickOutcome(post.anomalous);
  score = Math.max(0, score + outcome.scoreDelta);

  if (post.anomalous) {
    remainingAnomalies -= 1;
    caughtAnomalies += 1;
    recordDiscoveredAnomaly(post.author.anomalyPermission);
    updateHud();
    appendSystemMessage("이상 게시글을 삭제했습니다. 라운드 종료까지 게시판을 지켜주세요.");
    return;
  }

  health = Math.max(0, health + outcome.healthDelta);
  wrongKicks += 1;
  lastDamageReason = "wrong-kick";
  appendSystemMessage("정상 게시글을 삭제해 체력이 1 감소했습니다.", true);
  triggerScreenInterference("mosaic");
  updateHud();
  if (health === 0) {
    finishStage({
      success: false,
      title: "체력 소진",
      copy: "정상 게시글을 반복해서 삭제해 체력을 모두 잃었습니다.",
      evidence: getPostEvidenceSummary(post)
    });
  }
}
