(() => {
  "use strict";

  const Engine = window.FerretChessEngine;
  const ChessAI = window.FerretChessAI;
  const Cutscenes = window.FerretChessCutscenes;
  const {
    FILES,
    PIECE_NAME,
    PIECE_SYMBOL,
    createGame,
    applyMove,
    legalMovesFor,
    moveToSan,
    isInCheck,
    getDrawReason
  } = Engine;

  const theatre = document.querySelector("#theatre");
  const titleScreen = document.querySelector("#title-screen");
  const gameScreen = document.querySelector("#game-screen");
  const boardElement = document.querySelector("#chessboard");
  const statusElement = document.querySelector("#game-status");
  const modal = document.querySelector("#modal");
  const modalTitle = document.querySelector("#modal-title");
  const modalCopy = document.querySelector("#modal-copy");
  const closeModalButton = document.querySelector("#close-modal");
  const hintButton = document.querySelector("#hint");
  const restartButton = document.querySelector("#restart");
  const moveList = document.querySelector("#move-list");
  const moveListScroll = document.querySelector("#move-list-scroll");
  const moveCount = document.querySelector("#move-count");
  const DIFFICULTY_DEPTH = Object.freeze({ low: 2, medium: 3, high: 3 });
  const HINT_DEPTH = 3;
  const MINIMUM_AI_DELAY_MS = 650;

  let game = createGame();
  let selected = null;
  let selectedMoves = [];
  let hintSquares = [];
  let moveHistory = [];
  let hintTimer = null;
  let modalReturnFocus = null;
  let aiDepth = DIFFICULTY_DEPTH.medium;
  let presenting = false;
  let hintThinking = false;
  let gameSession = 0;
  let aiWorker = null;
  let workerUnavailable = false;
  let aiRequestSequence = 0;
  const pendingAiRequests = new Map();

  function selectedAiDepth() {
    const selectedDifficulty = document.querySelector('input[name="difficulty"]:checked');
    return DIFFICULTY_DEPTH[selectedDifficulty?.value] || DIFFICULTY_DEPTH.medium;
  }

  function abortError() {
    return new DOMException("AI request was cancelled", "AbortError");
  }

  function rejectPendingAiRequests(error) {
    pendingAiRequests.forEach(({ reject }) => reject(error));
    pendingAiRequests.clear();
  }

  function handleWorkerMessage(event) {
    const { requestId, move, error } = event.data || {};
    const pending = pendingAiRequests.get(requestId);
    if (!pending) return;
    pendingAiRequests.delete(requestId);
    if (error) pending.reject(new Error(error));
    else pending.resolve(move || null);
  }

  function handleWorkerError(worker, event) {
    if (worker !== aiWorker) return;
    event.preventDefault();
    worker.terminate();
    aiWorker = null;
    workerUnavailable = true;
    rejectPendingAiRequests(new Error(event.message || "AI Worker를 불러오지 못했습니다."));
  }

  function ensureAiWorker() {
    if (aiWorker) return aiWorker;
    if (workerUnavailable || !("Worker" in window)) return null;

    try {
      const worker = new Worker("ai-worker.js?v=2");
      worker.addEventListener("message", handleWorkerMessage);
      worker.addEventListener("error", event => handleWorkerError(worker, event));
      aiWorker = worker;
      return worker;
    } catch (error) {
      workerUnavailable = true;
      return null;
    }
  }

  function cancelAiWork() {
    if (aiWorker) aiWorker.terminate();
    aiWorker = null;
    rejectPendingAiRequests(abortError());
  }

  function requestWorkerMove(state, color, depth, session, purpose) {
    const worker = ensureAiWorker();
    if (!worker) return Promise.reject(new Error("AI Worker를 사용할 수 없습니다."));

    const requestId = ++aiRequestSequence;
    return new Promise((resolve, reject) => {
      pendingAiRequests.set(requestId, { resolve, reject });
      worker.postMessage({ requestId, session, purpose, game: state, color, depth });
    });
  }

  async function requestAiMove(state, color, depth, session, purpose) {
    try {
      return await requestWorkerMove(state, color, depth, session, purpose);
    } catch (error) {
      if (error?.name === "AbortError" || session !== gameSession) throw error;

      // file://처럼 Worker가 막히는 환경에서도 같은 탐색 깊이를 유지한다.
      workerUnavailable = true;
      await new Promise(resolve => window.setTimeout(resolve, 0));
      if (session !== gameSession) throw abortError();
      return ChessAI.chooseMove(state, color, depth);
    }
  }

  function minimumAiDelay() {
    return new Promise(resolve => window.setTimeout(resolve, MINIMUM_AI_DELAY_MS));
  }

  function legalMovesFrom(square) {
    return legalMovesFor(game, game.turn).filter(move => move.from === square);
  }

  function renderMoveHistory() {
    moveList.replaceChildren();
    moveCount.textContent = `${moveHistory.length}수`;

    if (!moveHistory.length) {
      const emptyRow = document.createElement("tr");
      emptyRow.className = "move-empty";
      const emptyCell = document.createElement("td");
      emptyCell.colSpan = 3;
      emptyCell.textContent = "아직 둔 수가 없습니다.";
      emptyRow.append(emptyCell);
      moveList.append(emptyRow);
      return;
    }

    for (let index = 0; index < moveHistory.length; index += 2) {
      const row = document.createElement("tr");
      const numberCell = document.createElement("th");
      const whiteCell = document.createElement("td");
      const blackCell = document.createElement("td");
      numberCell.scope = "row";
      numberCell.textContent = `${Math.floor(index / 2) + 1}.`;
      whiteCell.textContent = moveHistory[index] || "";
      blackCell.textContent = moveHistory[index + 1] || "";
      if (index + 1 >= moveHistory.length) whiteCell.classList.add("latest-move");
      else if (index + 2 >= moveHistory.length) blackCell.classList.add("latest-move");
      row.append(numberCell, whiteCell, blackCell);
      moveList.append(row);
    }

    window.requestAnimationFrame(() => {
      moveListScroll.scrollTop = moveListScroll.scrollHeight;
    });
  }

  function recordMove(move) {
    moveHistory.push(moveToSan(game, move));
  }

  function renderBoard() {
    boardElement.replaceChildren();
    for (let displayRow = 0; displayRow < 8; displayRow += 1) {
      for (let displayColumn = 0; displayColumn < 8; displayColumn += 1) {
        // 캐릭터가 서로 마주 보는 좌우 진행 방향을 의도적으로 유지한다.
        const square = `${FILES[displayRow]}${displayColumn + 1}`;
        const piece = game.board[square];
        const cell = document.createElement("button");
        cell.type = "button";
        cell.className = `square ${(displayRow + displayColumn) % 2 ? "dark" : "light"}`;
        cell.dataset.square = square;
        cell.setAttribute("role", "gridcell");
        cell.setAttribute("aria-label", square);

        if (game.lastMove && (game.lastMove.from === square || game.lastMove.to === square)) cell.classList.add("last");
        if (selected === square) cell.classList.add("selected");
        const legal = selectedMoves.find(move => move.to === square);
        if (legal) cell.classList.add(legal.capture ? "capture" : "legal");
        if (hintSquares.includes(square)) cell.classList.add("hint");

        if (piece) {
          const token = document.createElement("span");
          token.className = `piece ${piece.color === "w" ? "white" : "black"} ${piece.type === "p" ? "pawn" : "major"}`;
          token.textContent = PIECE_SYMBOL[piece.color][piece.type];
          token.setAttribute("aria-hidden", "true");
          cell.append(token);
          cell.setAttribute("aria-label", `${piece.color === "w" ? "백" : "흑"} ${PIECE_NAME[piece.type]} ${square}`);
        }

        cell.addEventListener("click", () => handleSquare(square));
        boardElement.append(cell);
      }
    }
  }

  function cutsceneRequestsFor(move, moverColor) {
    const requests = [];
    if (move.castle) {
      requests.push({
        id: "castle",
        side: moverColor,
        copy: `${move.castle === "K" ? "킹사이드" : "퀸사이드"} 캐슬링으로 킹과 룩이 함께 이동했습니다.`
      });
    }
    if (move.promotion) requests.push({ id: "promotion", side: moverColor });

    const defender = game.turn;
    const checked = isInCheck(game, defender);
    const checkmated = checked && legalMovesFor(game, defender).length === 0;
    if (checkmated) {
      requests.push({
        id: "checkmate",
        side: moverColor,
        copy: `${moverColor === "w" ? "쩨비" : "버찌"}의 마지막 수가 승부를 결정했습니다.`
      });
    } else if (checked && !game.over) {
      requests.push({ id: "check", side: moverColor });
    }
    return requests;
  }

  function focusScreen(screen) {
    window.requestAnimationFrame(() => screen.focus({ preventScroll: true }));
  }

  async function playMoveCutscenes(move, moverColor, session) {
    const requests = cutsceneRequestsFor(move, moverColor);
    if (!requests.length || session !== gameSession) return;

    presenting = true;
    hintButton.disabled = true;
    gameScreen.inert = true;
    try {
      await Cutscenes.playSequence(requests);
    } finally {
      if (session !== gameSession) return;
      presenting = false;
      gameScreen.inert = !gameScreen.classList.contains("active");
      hintButton.disabled = game.over || game.thinking || game.turn !== "w";
      if (gameScreen.classList.contains("active")) focusScreen(gameScreen);
    }
  }

  async function handleSquare(square) {
    if (game.over || game.thinking || presenting || hintThinking || game.turn !== "w") return;
    const piece = game.board[square];
    const chosenMove = selectedMoves.find(move => move.to === square);
    hintSquares = [];

    if (selected && chosenMove) {
      const session = gameSession;
      recordMove(chosenMove);
      applyMove(game, chosenMove);
      selected = null;
      selectedMoves = [];
      renderBoard();
      renderMoveHistory();
      const ended = updateStatus();
      await playMoveCutscenes(chosenMove, "w", session);
      if (session === gameSession && !ended) queueAiMove();
      return;
    }

    if (piece?.color === "w") {
      selected = square;
      selectedMoves = legalMovesFrom(square);
    } else {
      selected = null;
      selectedMoves = [];
    }
    renderBoard();
  }

  function finishAsDraw(reason) {
    const labels = {
      fiftyMove: "50수 규칙 · 무승부",
      threefold: "같은 포지션 3회 반복 · 무승부",
      insufficientMaterial: "체크메이트 불가능 · 기물 부족 무승부"
    };
    game.over = true;
    hintButton.disabled = true;
    statusElement.textContent = labels[reason];
  }

  function updateStatus() {
    const moves = legalMovesFor(game, game.turn);
    if (!moves.length) {
      game.over = true;
      const checked = isInCheck(game, game.turn);
      if (checked) statusElement.textContent = game.turn === "w" ? "체크메이트 · 버찌 승리" : "체크메이트 · 쩨비 승리!";
      else statusElement.textContent = "스테일메이트 · 무승부";
      hintButton.disabled = true;
      return true;
    }

    const drawReason = getDrawReason(game);
    if (drawReason) {
      finishAsDraw(drawReason);
      return true;
    }

    if (game.thinking) statusElement.textContent = "버찌가 생각 중…";
    else if (game.turn === "w") statusElement.textContent = isInCheck(game, "w") ? "쩨비 체크!" : "쩨비의 차례";
    else statusElement.textContent = isInCheck(game, "b") ? "버찌 체크!" : "버찌의 차례";
    return false;
  }

  async function queueAiMove() {
    const session = gameSession;
    game.thinking = true;
    hintButton.disabled = true;
    updateStatus();

    try {
      const [move] = await Promise.all([
        requestAiMove(game, "b", aiDepth, session, "move"),
        minimumAiDelay()
      ]);
      if (session !== gameSession) return;
      if (!move) {
        game.thinking = false;
        updateStatus();
        return;
      }

      recordMove(move);
      applyMove(game, move);
      game.thinking = false;
      hintButton.disabled = true;
      renderBoard();
      renderMoveHistory();
      const ended = updateStatus();
      await playMoveCutscenes(move, "b", session);
      if (session === gameSession && !ended) hintButton.disabled = false;
    } catch (error) {
      if (error?.name === "AbortError" || session !== gameSession) return;
      game.thinking = false;
      statusElement.textContent = "버찌가 수를 찾지 못했어요 · 다시 시작해 주세요";
    }
  }

  function resetGame() {
    gameSession += 1;
    cancelAiWork();
    window.clearTimeout(hintTimer);
    Cutscenes.cancelAll();
    presenting = false;
    hintThinking = false;
    game = createGame();
    selected = null;
    selectedMoves = [];
    hintSquares = [];
    moveHistory = [];
    hintButton.disabled = false;
    gameScreen.inert = !gameScreen.classList.contains("active");
    renderBoard();
    renderMoveHistory();
    updateStatus();
  }

  function switchScreen(showGame) {
    if (!showGame) {
      gameSession += 1;
      cancelAiWork();
      window.clearTimeout(hintTimer);
      Cutscenes.cancelAll();
      presenting = false;
      hintThinking = false;
    }

    theatre.classList.add("curtain-call");
    window.setTimeout(() => {
      titleScreen.classList.toggle("active", !showGame);
      gameScreen.classList.toggle("active", showGame);
      titleScreen.setAttribute("aria-hidden", String(showGame));
      gameScreen.setAttribute("aria-hidden", String(!showGame));
      titleScreen.inert = showGame;
      gameScreen.inert = !showGame;
      if (showGame) {
        aiDepth = selectedAiDepth();
        resetGame();
      }
      focusScreen(showGame ? gameScreen : titleScreen);
      window.setTimeout(() => theatre.classList.remove("curtain-call"), 80);
    }, 520);
  }

  async function showHint() {
    if (game.over || game.thinking || presenting || hintThinking || game.turn !== "w") return;
    const session = gameSession;
    hintThinking = true;
    hintButton.disabled = true;
    statusElement.textContent = "힌트를 생각 중…";
    window.clearTimeout(hintTimer);

    try {
      const move = await requestAiMove(game, "w", HINT_DEPTH, session, "hint");
      if (session !== gameSession) return;
      if (!move) {
        updateStatus();
        return;
      }

      hintSquares = [move.from, move.to];
      renderBoard();
      statusElement.textContent = "초록색 두 칸을 살펴봐!";
      hintTimer = window.setTimeout(() => {
        if (session !== gameSession) return;
        hintSquares = [];
        renderBoard();
        updateStatus();
      }, 2200);
    } catch (error) {
      if (error?.name !== "AbortError" && session === gameSession) updateStatus();
    } finally {
      if (session === gameSession) {
        hintThinking = false;
        hintButton.disabled = game.over || game.thinking || presenting || game.turn !== "w";
      }
    }
  }

  const modalContent = {
    how: {
      title: "게임 방법",
      html: "<p>쩨비는 왼쪽의 흰색 기물로 먼저 움직입니다. 말을 누른 뒤 초록색으로 표시된 칸을 선택하세요.</p><p>버찌의 킹을 체크메이트하면 공연의 주인공이 됩니다.</p><p>스테일메이트, 같은 포지션 3회 반복, 기물 부족 또는 폰 이동과 잡기 없이 양쪽이 각각 50번 움직이면 무승부입니다.</p>"
    },
    credits: {
      title: "크레딧 · 팬게임 표기",
      html: "<p>《버찌 체스》는 버찌를 테마로 만든 비공식 팬게임입니다.</p><p>캐릭터와 원작의 권리는 각 권리자에게 있습니다.</p>"
    }
  };

  function openModal(kind) {
    const content = modalContent[kind];
    if (!content) return;
    modalReturnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    modalTitle.textContent = content.title;
    modalCopy.innerHTML = content.html;
    modal.inert = false;
    modal.classList.add("open");
    modal.setAttribute("aria-hidden", "false");
    closeModalButton.focus();
  }

  function closeModal() {
    if (!modal.classList.contains("open")) return;
    modal.classList.remove("open");
    modal.setAttribute("aria-hidden", "true");
    modal.inert = true;
    if (modalReturnFocus?.isConnected && !modalReturnFocus.closest("[inert]")) {
      modalReturnFocus.focus({ preventScroll: true });
    }
    modalReturnFocus = null;
  }

  document.querySelector("#start-game").addEventListener("click", () => switchScreen(true));
  document.querySelector("#back-title").addEventListener("click", () => switchScreen(false));
  restartButton.addEventListener("click", resetGame);
  hintButton.addEventListener("click", showHint);
  document.querySelectorAll("[data-modal]").forEach(button => {
    button.addEventListener("click", () => openModal(button.dataset.modal));
  });
  closeModalButton.addEventListener("click", closeModal);
  modal.addEventListener("click", event => { if (event.target === modal) closeModal(); });
  document.addEventListener("keydown", event => { if (event.key === "Escape") closeModal(); });

  renderBoard();
  renderMoveHistory();
  updateStatus();
})();
