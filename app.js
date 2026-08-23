(() => {
  "use strict";

  const Engine = window.FerretChessEngine;
  const ChessAI = window.FerretChessAI;
  const Openings = window.FerretChessOpenings;
  const Cutscenes = window.FerretChessCutscenes;
  const {
    FILES,
    PIECE_NAME,
    PIECE_SYMBOL,
    VALUE,
    VARIANT,
    HILL_SQUARES,
    TACTICAL_UNITS,
    PLAYER_SKILLS,
    createGame,
    applyMove,
    canUseSkill,
    skillTargets,
    useSkill,
    legalMovesFor,
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
  const variantModal = document.querySelector("#variant-modal");
  const openVariantsButton = document.querySelector("#open-variants");
  const closeVariantsButton = document.querySelector("#close-variants");
  const hintButton = document.querySelector("#hint");
  const skillButton = document.querySelector("#skill");
  const gameActions = document.querySelector(".game-actions");
  const restartButton = document.querySelector("#restart");
  const moveList = document.querySelector("#move-list");
  const moveListScroll = document.querySelector("#move-list-scroll");
  const moveCount = document.querySelector("#move-count");
  const openingName = document.querySelector("#opening-name");
  const DIFFICULTY_DEPTH = Object.freeze({ low: 2, medium: 3, high: 3 });
  const HINT_DEPTH = 3;
  const MINIMUM_AI_DELAY_MS = 650;
  const VARIANT_META = Object.freeze({
    [VARIANT.STANDARD]: Object.freeze({ name: "표준 체스", objective: "체크메이트로 승리하세요." }),
    [VARIANT.KING_OF_THE_HILL]: Object.freeze({ name: "언덕의 왕", objective: "킹을 중앙에 도착시키거나 상대 킹을 잡으세요." }),
    [VARIANT.THREE_CHECK]: Object.freeze({ name: "3-체크", objective: "세 번째 체크를 주거나 상대 킹을 잡으세요." }),
    [VARIANT.TACTICAL]: Object.freeze({ name: "냉병기 전술", objective: "병과를 지휘해 상대 장군의 HP를 0으로 만드세요." })
  });

  let game = createGame();
  let selected = null;
  let selectedMoves = [];
  let hintSquares = [];
  let moveHistory = [];
  let moveSequence = [];
  let lastAiMove = null;
  let hintTimer = null;
  let modalReturnFocus = null;
  let variantReturnFocus = null;
  let aiDepth = DIFFICULTY_DEPTH.medium;
  let currentVariant = VARIANT.STANDARD;
  let presenting = false;
  let hintThinking = false;
  let skillTargeting = false;
  let gameSession = 0;
  let aiWorker = null;
  let workerUnavailable = false;
  let aiRequestSequence = 0;
  const pendingAiRequests = new Map();

  function selectedAiDepth() {
    const selectedDifficulty = document.querySelector('input[name="difficulty"]:checked');
    return DIFFICULTY_DEPTH[selectedDifficulty?.value] || DIFFICULTY_DEPTH.medium;
  }

  function pushMove(moves, state, from, to, extras = {}) {
  const target = state.board[to];

  // 체스에서는 킹을 직접 잡지 않고 체크메이트로 끝낸다.
  if (target?.type === "k") return;

  moves.push({
    from,
    to,
    capture: target ? { ...target } : null,
    ...extras
  });
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
      const worker = new Worker("ai-worker.js?v=7");
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
      worker.postMessage({ requestId, session, purpose, game: state, color, depth, history: moveSequence });
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
      return ChessAI.chooseMove(state, color, depth, moveSequence);
    }
  }

  function legalMovesFor(state, color) {
    return generatePseudoMoves(state, color).filter(move => {
      const simulation = cloneGame(state);
      applyMove(simulation, move);
      return !isInCheck(simulation, color);
    });
  }

  function legalMovesFrom(square) {
    return legalMovesFor(game, game.turn).filter(move => move.from === square);
  }

  function actionTarget(move) {
    return move.attackTo || move.to;
  }

  function renderSkillControls() {
    const enabled = game.variant !== VARIANT.STANDARD;
    gameActions.classList.toggle("skills-enabled", enabled);
    skillButton.hidden = !enabled;
    if (!enabled) {
      skillTargeting = false;
      return;
    }

    const used = game.skills.w.used;
    skillButton.classList.toggle("targeting", skillTargeting);
    if (used) skillButton.textContent = "수호막 사용 완료";
    else if (skillTargeting) skillButton.textContent = "스킬 선택 취소";
    else skillButton.textContent = "스킬 · 수호막";
    skillButton.title = PLAYER_SKILLS.w.description;
    skillButton.disabled = used || game.over || game.thinking || presenting || hintThinking || game.turn !== "w";
  }

  function renderMoveHistory() {
    moveList.replaceChildren();
    moveCount.textContent = `${moveHistory.length}수`;
    if (game.variant === VARIANT.KING_OF_THE_HILL) {
      openingName.textContent = "언덕의 왕 · 중앙 d4/e4/d5/e5";
    } else if (game.variant === VARIANT.THREE_CHECK) {
      openingName.textContent = `3-체크 · 쩨비 ${game.checksGiven.w} : ${game.checksGiven.b} 버찌`;
    } else if (game.variant === VARIANT.TACTICAL) {
      openingName.textContent = "냉병기 전술 · 장군 HP 0이 되면 승리";
    } else {
      openingName.textContent = Openings.identifyOpening(moveSequence);
    }

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

  function applyRecordedMove(move) {
    let notation = moveToSan(game, move);
    moveSequence.push(Openings.moveKey(move));
    const result = applyMove(game, move, game.variant === VARIANT.TACTICAL);
    if (game.variant === VARIANT.TACTICAL && result && result.damage !== null) {
      if (result.blocked) notation += " · 방어";
      else notation += ` · ${result.damage}피해${result.destroyed ? "·격파" : ""}`;
    }
    moveHistory.push(notation);
    return result;
  }

  function renderBoard() {
    const playerSkillTargets = skillTargeting ? new Set(skillTargets(game, "w")) : new Set();
    const tactical = game.variant === VARIANT.TACTICAL;
    boardElement.classList.toggle("tactical", tactical);
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

        if (game.lastMove && [game.lastMove.from, game.lastMove.to, game.lastMove.landing].includes(square)) cell.classList.add("last");
        if (game.variant === VARIANT.KING_OF_THE_HILL && HILL_SQUARES.includes(square)) cell.classList.add("hill");
        const aiMovePart = lastAiMove?.from === square
          ? "출발 칸"
          : lastAiMove?.to === square
            ? "행동 대상"
            : lastAiMove?.landing === square
              ? "돌격 도착 칸"
              : null;
        if (aiMovePart) cell.classList.add("ai-last");
        if (selected === square) cell.classList.add("selected");
        const legal = selectedMoves.find(move => actionTarget(move) === square);
        if (legal) cell.classList.add(legal.capture ? "capture" : "legal");
        if (selectedMoves.some(move => move.action === "moveAttack" && move.to === square)) cell.classList.add("charge-landing");
        if (hintSquares.includes(square)) cell.classList.add("hint");
        if (playerSkillTargets.has(square)) cell.classList.add("skill-target");
        if (game.effects.shield?.square === square) cell.classList.add("skill-protected");
        if (game.effects.freeze?.square === square) cell.classList.add("skill-frozen");

        if (piece) {
          const token = document.createElement("span");
          token.className = `piece ${piece.color === "w" ? "white" : "black"} ${piece.type === "p" ? "pawn" : "major"}${tactical ? " tactical-unit" : ""}`;
          token.textContent = tactical ? TACTICAL_UNITS[piece.type].short : PIECE_SYMBOL[piece.color][piece.type];
          token.setAttribute("aria-hidden", "true");
          cell.append(token);
          if (tactical) {
            const hpBar = document.createElement("span");
            const hpFill = document.createElement("span");
            const hpText = document.createElement("span");
            hpBar.className = "unit-hp-bar";
            hpFill.className = "unit-hp-fill";
            hpFill.style.width = `${Math.max(0, piece.hp / piece.maxHp) * 100}%`;
            hpText.className = "unit-hp-text";
            hpText.textContent = `${piece.hp}/${piece.maxHp}`;
            hpBar.append(hpFill);
            cell.append(hpBar, hpText);
          }
          const unitName = tactical ? TACTICAL_UNITS[piece.type].name : PIECE_NAME[piece.type];
          const hpLabel = tactical ? `, HP ${piece.hp}/${piece.maxHp}` : "";
          cell.setAttribute("aria-label", `${piece.color === "w" ? "백" : "흑"} ${unitName} ${square}${hpLabel}`);
        }
        if (aiMovePart) cell.setAttribute("aria-label", `${cell.getAttribute("aria-label")}, AI 직전 이동 ${aiMovePart}`);
        if (game.variant === VARIANT.KING_OF_THE_HILL && HILL_SQUARES.includes(square)) {
          cell.setAttribute("aria-label", `${cell.getAttribute("aria-label")}, 언덕 칸`);
        }
        if (game.effects.shield?.square === square) {
          cell.setAttribute("aria-label", `${cell.getAttribute("aria-label")}, 별빛 수호막 적용`);
        }
        if (game.effects.freeze?.square === square) {
          cell.setAttribute("aria-label", `${cell.getAttribute("aria-label")}, 그림자 봉인 적용`);
        }

        cell.addEventListener("click", () => handleSquare(square));
        boardElement.append(cell);
      }
    }
    renderSkillControls();
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

    if (game.variantWinner) {
      const variantName = VARIANT_META[game.variant]?.name || "변형 체스";
      const capturedKing = game.variantWinReason === "kingCapture";
      const defeatedGeneral = game.variantWinReason === "generalDefeated";
      requests.push({
        id: "variantWin",
        side: moverColor,
        title: defeatedGeneral ? "장군 격파!" : capturedKing ? "킹 포획!" : "특별 규칙 달성!",
        copy: defeatedGeneral
          ? `${moverColor === "w" ? "쩨비" : "버찌"}가 상대 장군의 HP를 모두 소진시켰습니다.`
          : capturedKing
          ? `${moverColor === "w" ? "쩨비" : "버찌"}가 상대 킹을 잡아 대국을 끝냈습니다.`
          : `${moverColor === "w" ? "쩨비" : "버찌"}가 ${variantName}의 승리 조건을 달성했습니다.`
      });
      return requests;
    }

    if (game.variant === VARIANT.TACTICAL) return requests;
    const defender = game.turn;
    const checked = isInCheck(game, defender);
    const checkmated = game.variant === VARIANT.STANDARD && checked && legalMovesFor(game, defender).length === 0;
    if (checkmated) {
      requests.push({
        id: "checkmate",
        side: moverColor,
        copy: `${moverColor === "w" ? "쩨비" : "버찌"}의 마지막 수가 승부를 결정했습니다.`
      });
    } else if (checked && !game.over) {
      requests.push({
        id: "check",
        side: moverColor,
        copy: game.variant === VARIANT.STANDARD
          ? "다음 수에는 체크를 반드시 해결해야 합니다."
          : "킹이 공격받고 있습니다. 피하지 않으면 다음 수에 잡힐 수 있습니다."
      });
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
      renderSkillControls();
      if (gameScreen.classList.contains("active")) focusScreen(gameScreen);
    }
  }

  async function playSkillCutscene(skill, color, targetSquare, session) {
    if (!skill || session !== gameSession) return;
    presenting = true;
    hintButton.disabled = true;
    skillButton.disabled = true;
    gameScreen.inert = true;
    const isPlayer = color === "w";
    try {
      await Cutscenes.play({
        id: "skill",
        side: color,
        title: `${skill.name}!`,
        copy: isPlayer
          ? `${targetSquare} 기물이 버찌의 다음 수 동안 보호됩니다.`
          : `${targetSquare} 기물이 쩨비의 다음 차례 동안 봉인됩니다.`,
        tone: isPlayer ? "mint" : "red"
      });
    } finally {
      if (session !== gameSession) return;
      presenting = false;
      gameScreen.inert = !gameScreen.classList.contains("active");
      hintButton.disabled = game.over || game.thinking || game.turn !== "w";
      renderSkillControls();
      if (gameScreen.classList.contains("active")) focusScreen(gameScreen);
    }
  }

  async function activatePlayerSkill(targetSquare) {
    const session = gameSession;
    const skill = useSkill(game, "w", targetSquare);
    if (!skill) {
      statusElement.textContent = "수호막을 씌울 자기 기물을 선택하세요.";
      return;
    }

    skillTargeting = false;
    selected = null;
    selectedMoves = [];
    renderBoard();
    renderMoveHistory();
    statusElement.textContent = `${targetSquare} 기물에 별빛 수호막!`;
    await playSkillCutscene(skill, "w", targetSquare, session);
    if (session === gameSession) updateStatus();
  }

  async function handleSquare(square) {
    if (game.over || game.thinking || presenting || hintThinking || game.turn !== "w") return;
    if (skillTargeting) {
      await activatePlayerSkill(square);
      return;
    }
    const piece = game.board[square];
    const chosenMove = selectedMoves.find(move => actionTarget(move) === square);
    hintSquares = [];

    if (selected && chosenMove) {
      const session = gameSession;
      applyRecordedMove(chosenMove);
      selected = null;
      selectedMoves = [];
      renderBoard();
      if (updateStatus()) return;
      queueAiMove();
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
    renderSkillControls();
  }

  function updateStatus() {
    if (game.variantWinner) {
      game.over = true;
      const winner = game.variantWinner === "w" ? "쩨비" : "버찌";
      const reason = game.variantWinReason === "generalDefeated"
        ? "장군 격파"
        : game.variantWinReason === "kingCapture"
        ? "킹 포획"
        : game.variant === VARIANT.KING_OF_THE_HILL ? "언덕 점령" : "세 번째 체크";
      statusElement.textContent = `${reason} · ${winner} 승리!`;
      hintButton.disabled = true;
      renderSkillControls();
      return true;
    }

    const moves = legalMovesFor(game, game.turn);
    if (!moves.length) {
      game.over = true;
      const checked = isInCheck(game, game.turn);
      if (game.variant !== VARIANT.STANDARD) statusElement.textContent = "움직일 수 있는 기물이 없음 · 무승부";
      else if (checked) statusElement.textContent = game.turn === "w" ? "체크메이트 · 버찌 승리" : "체크메이트 · 쩨비 승리!";
      else statusElement.textContent = "스테일메이트 · 무승부";
      hintButton.disabled = true;
      renderSkillControls();
      return true;
    }

    const drawReason = getDrawReason(game);
    if (drawReason) {
      finishAsDraw(drawReason);
      return true;
    }

    if (game.thinking) statusElement.textContent = "버찌가 생각 중…";
    else if (game.variant === VARIANT.TACTICAL) {
      statusElement.textContent = game.turn === "w" ? "쩨비의 행동" : "버찌의 행동";
      const combat = game.lastActionResult;
      if (combat?.blocked) statusElement.textContent += " · 수호막이 피해를 막음";
      else if (combat?.damage !== null && combat?.damage !== undefined) {
        const targetName = TACTICAL_UNITS[combat.targetType]?.name || "기물";
        statusElement.textContent += ` · ${targetName} ${combat.damage} 피해${combat.destroyed ? " · 격파" : ""}`;
      }
    } else if (game.turn === "w") statusElement.textContent = isInCheck(game, "w") ? "쩨비 체크!" : "쩨비의 차례";
    else statusElement.textContent = isInCheck(game, "b") ? "버찌 체크!" : "버찌의 차례";

    if (game.variant === VARIANT.KING_OF_THE_HILL) {
      statusElement.textContent += " · 중앙을 점령하세요";
    } else if (game.variant === VARIANT.THREE_CHECK) {
      statusElement.textContent += ` · 체크 ${game.checksGiven.w}:${game.checksGiven.b}`;
    }
    if (game.effects.shield) statusElement.textContent += ` · ${game.effects.shield.square} 수호막`;
    if (game.effects.freeze) statusElement.textContent += ` · ${game.effects.freeze.square} 봉인`;
    renderSkillControls();
    return false;
  }

  function chooseAiSkillTarget() {
    const targets = skillTargets(game, "b");
    if (!targets.length) return null;
    const movableOrigins = new Set(legalMovesFor(game, "w").map(move => move.from));
    const capturableSquares = new Set(
      legalMovesFor(game, "b").filter(move => move.capture && !move.enPassant).map(actionTarget)
    );
    const recentSquare = game.lastMove?.to;
    return targets.sort((left, right) => {
      const score = square => {
        const piece = game.board[square];
        return (square === recentSquare ? 1_000 : 0) +
          (movableOrigins.has(square) ? 180 : 0) +
          (capturableSquares.has(square) ? -2_000 : 0) +
          (game.variant === VARIANT.TACTICAL
            ? (TACTICAL_UNITS[piece?.type]?.hp || 0) * 70 + (TACTICAL_UNITS[piece?.type]?.damage || 0) * 50
            : (VALUE[piece?.type] || 0));
      };
      return score(right) - score(left);
    })[0];
  }

  async function maybeUseAiSkill(session) {
    if (!canUseSkill(game, "b")) return false;
    const urgent = game.variant !== VARIANT.TACTICAL && (isInCheck(game, "b") || game.checksGiven.w > 0);
    if (game.moveNumber < 2 && !urgent) return false;
    const targetSquare = chooseAiSkillTarget();
    if (!targetSquare) return false;
    const skill = useSkill(game, "b", targetSquare);
    if (!skill) return false;

    renderBoard();
    renderMoveHistory();
    statusElement.textContent = `버찌가 ${targetSquare} 기물에 그림자 봉인을 준비합니다.`;
    await playSkillCutscene(skill, "b", targetSquare, session);
    return session === gameSession;
  }

  async function queueAiMove() {
    const session = gameSession;
    hintButton.disabled = true;

    try {
      await maybeUseAiSkill(session);
      if (session !== gameSession) return;
      game.thinking = true;
      updateStatus();
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

      lastAiMove = { from: move.from, to: actionTarget(move), landing: move.action === "moveAttack" ? move.to : null };
      applyRecordedMove(move);
      game.thinking = false;
      hintButton.disabled = false;
      renderBoard();
      updateStatus();
    } catch (error) {
      if (error?.name !== "AbortError" && session === gameSession) {
        game.thinking = false;
        updateStatus();
      }
  }

  function resetGame() {
    gameSession += 1;
    cancelAiWork();
    window.clearTimeout(hintTimer);
    Cutscenes.cancelAll();
    presenting = false;
    hintThinking = false;
    skillTargeting = false;
    game = createGame(currentVariant);
    selected = null;
    selectedMoves = [];
    hintSquares = [];
    moveHistory = [];
    moveSequence = [];
    lastAiMove = null;
    hintButton.disabled = false;
    gameScreen.setAttribute(
      "aria-label",
      `${VARIANT_META[currentVariant].name} · ${VARIANT_META[currentVariant].objective} · 쩨비와 버찌의 체스 대국`
    );
    gameScreen.inert = !gameScreen.classList.contains("active");
    renderBoard();
    updateStatus();
  }

  function focusScreen(screen) {
    window.requestAnimationFrame(() => screen.focus({ preventScroll: true }));
  }

  function switchScreen(showGame) {
    if (!showGame) {
      gameSession += 1;
      cancelAiWork();
      window.clearTimeout(hintTimer);
      Cutscenes.cancelAll();
      presenting = false;
      hintThinking = false;
      skillTargeting = false;
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
    if (game.over || game.thinking || presenting || hintThinking || skillTargeting || game.turn !== "w") return;
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

      hintSquares = [...new Set([move.from, move.to, move.attackTo].filter(Boolean))];
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
        renderSkillControls();
      }
    }
  }

  function togglePlayerSkill() {
    if (skillTargeting) {
      skillTargeting = false;
      hintButton.disabled = false;
      renderBoard();
      updateStatus();
      return;
    }
    if (!canUseSkill(game, "w")) return;
    skillTargeting = true;
    selected = null;
    selectedMoves = [];
    hintSquares = [];
    hintButton.disabled = true;
    renderBoard();
    statusElement.textContent = "별빛 수호막을 씌울 자기 기물을 선택하세요.";
  }

  const modalContent = {
    how: {
      title: "게임 방법",
      html: "<p>쩨비는 왼쪽의 흰색 기물로 먼저 움직입니다. 기물을 누른 뒤 표시된 이동 칸 또는 빨간 공격 대상을 선택하세요.</p><p>표준 체스에서는 버찌의 킹을 체크메이트하면 승리합니다.</p><p>냉병기 전술에서는 한 턴에 병력 하나가 이동하거나 공격합니다. 병력마다 HP와 공격 방향이 다르며 공격자는 공격 후 원래 칸에 남습니다.</p><p>궁병은 전방 세 사격선으로 최대 4칸을 공격하고 다른 기물을 관통하지 못합니다. 경기병은 장기 말처럼 길목이 막히며, 이동 후 인접한 적을 공격할 수 있습니다.</p><p>상대 장군의 HP를 0으로 만들면 즉시 승리합니다. 체크와 체크메이트는 없습니다.</p><p>냉병기 전술에서는 쩨비와 버찌가 각자의 스킬을 대국당 한 번 사용할 수 있습니다.</p>"
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

  function openVariantMenu() {
    variantReturnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    variantModal.inert = false;
    variantModal.classList.add("open");
    variantModal.setAttribute("aria-hidden", "false");
    variantModal.querySelector("[data-variant]")?.focus();
  }

  function closeVariantMenu(restoreFocus = true) {
    if (!variantModal.classList.contains("open")) return;
    variantModal.classList.remove("open");
    variantModal.setAttribute("aria-hidden", "true");
    variantModal.inert = true;
    if (restoreFocus && variantReturnFocus?.isConnected) variantReturnFocus.focus({ preventScroll: true });
    variantReturnFocus = null;
  }

  document.querySelector("#start-game").addEventListener("click", () => {
    currentVariant = VARIANT.STANDARD;
    switchScreen(true);
  });
  openVariantsButton.addEventListener("click", openVariantMenu);
  closeVariantsButton.addEventListener("click", () => closeVariantMenu());
  variantModal.addEventListener("click", event => { if (event.target === variantModal) closeVariantMenu(); });
  document.querySelectorAll("[data-variant]").forEach(button => {
    button.addEventListener("click", () => {
      currentVariant = button.dataset.variant;
      closeVariantMenu(false);
      switchScreen(true);
    });
  });
  document.querySelector("#back-title").addEventListener("click", () => switchScreen(false));
  restartButton.addEventListener("click", resetGame);
  hintButton.addEventListener("click", showHint);
  skillButton.addEventListener("click", togglePlayerSkill);
  document.querySelectorAll("[data-modal]").forEach(button => {
    button.addEventListener("click", () => openModal(button.dataset.modal));
  });
  closeModalButton.addEventListener("click", closeModal);
  modal.addEventListener("click", event => { if (event.target === modal) closeModal(); });
  document.addEventListener("keydown", event => {
    if (event.key !== "Escape") return;
    if (skillTargeting) togglePlayerSkill();
    closeModal();
    closeVariantMenu();
  });

  renderBoard();
  updateStatus();
})();
