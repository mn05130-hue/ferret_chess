(() => {
  "use strict";

  const FILES = "abcdefgh";
  const BACK_RANK = ["r", "n", "b", "q", "k", "b", "n", "r"];
  const TACTICAL_BACK_RANK = ["s", "l", "a", "h", "g", "a", "c", "s"];
  const PIECE_NAME = Object.freeze({
    p: "폰", n: "나이트", b: "비숍", r: "룩", q: "퀸", k: "킹",
    s: "창병", h: "중보병", a: "궁병", l: "경기병", c: "중기병", g: "장군"
  });
  const PIECE_SYMBOL = Object.freeze({
    w: Object.freeze({ p: "♙", n: "♘", b: "♗", r: "♖", q: "♕", k: "♔" }),
    b: Object.freeze({ p: "♟", n: "♞", b: "♝", r: "♜", q: "♛", k: "♚" })
  });
  const VALUE = Object.freeze({ p: 100, n: 320, b: 330, r: 500, q: 900, k: 20000 });
  const SAN_PIECE = Object.freeze({ n: "N", b: "B", r: "R", q: "Q", k: "K" });
  const VARIANT = Object.freeze({
    STANDARD: "standard",
    KING_OF_THE_HILL: "kingOfTheHill",
    THREE_CHECK: "threeCheck",
    TACTICAL: "tactical"
  });
  const HILL_SQUARES = Object.freeze(["d4", "e4", "d5", "e5"]);
  const TACTICAL_UNITS = Object.freeze({
    p: Object.freeze({ name: "보병", short: "보", hp: 5, damage: 2 }),
    s: Object.freeze({ name: "창병", short: "창", hp: 5, damage: 2 }),
    h: Object.freeze({ name: "중보병", short: "중", hp: 8, damage: 3 }),
    a: Object.freeze({ name: "궁병", short: "궁", hp: 4, damage: 2, range: 4 }),
    l: Object.freeze({ name: "경기병", short: "경", hp: 5, damage: 2 }),
    c: Object.freeze({ name: "중기병", short: "기", hp: 8, damage: 3 }),
    g: Object.freeze({ name: "장군", short: "장", hp: 9, damage: 3 })
  });
  const PLAYER_SKILLS = Object.freeze({
    w: Object.freeze({
      id: "guardianVeil", name: "별빛 수호막",
      description: "자기 기물 하나가 버찌의 다음 행동 동안 피해를 받지 않게 보호합니다."
    }),
    b: Object.freeze({
      id: "shadowBind", name: "그림자 봉인",
      description: "쩨비의 기물 하나가 다음 차례 동안 이동하지 못하게 합니다. 공격은 가능합니다."
    })
  });

  function createTacticalPiece(color, type) {
    const unit = TACTICAL_UNITS[type];
    return { color, type, hp: unit.hp, maxHp: unit.hp };
  }

  function createBoard(variant = VARIANT.STANDARD) {
    const board = {};
    const tactical = variant === VARIANT.TACTICAL;
    for (let index = 0; index < 8; index += 1) {
      const file = FILES[index];
      if (tactical) {
        board[`${file}1`] = createTacticalPiece("w", TACTICAL_BACK_RANK[index]);
        board[`${file}2`] = createTacticalPiece("w", "p");
        board[`${file}7`] = createTacticalPiece("b", "p");
        board[`${file}8`] = createTacticalPiece("b", TACTICAL_BACK_RANK[index]);
      } else {
        board[`${file}1`] = { color: "w", type: BACK_RANK[index] };
        board[`${file}2`] = { color: "w", type: "p" };
        board[`${file}7`] = { color: "b", type: "p" };
        board[`${file}8`] = { color: "b", type: BACK_RANK[index] };
      }
    }
    return board;
  }

  function createGame(variant = VARIANT.STANDARD) {
    const normalizedVariant = Object.values(VARIANT).includes(variant) ? variant : VARIANT.STANDARD;
    const state = {
      board: createBoard(normalizedVariant),
      turn: "w",
      castling: { wK: true, wQ: true, bK: true, bQ: true },
      enPassant: null,
      lastMove: null,
      lastActionResult: null,
      over: false,
      thinking: false,
      moveNumber: 1,
      halfmoveClock: 0,
      repetitionCounts: {},
      variant: normalizedVariant,
      checksGiven: { w: 0, b: 0 },
      variantWinner: null,
      variantWinReason: null,
      skills: {
        w: { id: PLAYER_SKILLS.w.id, used: false },
        b: { id: PLAYER_SKILLS.b.id, used: false }
      },
      effects: { shield: null, freeze: null }
    };
    recordPosition(state);
    return state;
  }

  function cloneGame(source) {
    const board = {};
    Object.entries(source.board).forEach(([square, piece]) => { board[square] = { ...piece }; });
    return {
      ...source,
      board,
      castling: { ...source.castling },
      checksGiven: { ...source.checksGiven },
      skills: { w: { ...source.skills.w }, b: { ...source.skills.b } },
      effects: {
        shield: source.effects.shield ? { ...source.effects.shield } : null,
        freeze: source.effects.freeze ? { ...source.effects.freeze } : null
      },
      lastMove: source.lastMove ? { ...source.lastMove } : null,
      lastActionResult: source.lastActionResult ? { ...source.lastActionResult } : null,
      repetitionCounts: { ...source.repetitionCounts }
    };
  }

  function coords(square) {
    return [FILES.indexOf(square[0]), Number(square[1])];
  }

  function squareAt(fileIndex, rank) {
    if (fileIndex < 0 || fileIndex > 7 || rank < 1 || rank > 8) return null;
    return `${FILES[fileIndex]}${rank}`;
  }

  function effectiveEnPassant(state) {
    if ((state.variant || VARIANT.STANDARD) !== VARIANT.STANDARD || !state.enPassant) return "-";
    const [file, rank] = coords(state.enPassant);
    const pawnRank = rank + (state.turn === "w" ? -1 : 1);
    const canCapture = [-1, 1].some(fileStep => {
      const square = squareAt(file + fileStep, pawnRank);
      const piece = square ? state.board[square] : null;
      return piece?.color === state.turn && piece.type === "p";
    });
    return canCapture ? state.enPassant : "-";
  }

  function positionKey(state) {
    const tactical = state.variant === VARIANT.TACTICAL;
    const pieces = Object.entries(state.board)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([square, piece]) => `${square}${piece.color}${piece.type}${tactical ? `:${piece.hp}` : ""}`)
      .join(",");
    const castling = ["wK", "wQ", "bK", "bQ"].filter(right => state.castling[right]).join("") || "-";
    const variant = state.variant || VARIANT.STANDARD;
    const checks = variant === VARIANT.THREE_CHECK ? `${state.checksGiven.w}${state.checksGiven.b}` : "-";
    const skills = variant === VARIANT.STANDARD ? "-" : `${Number(state.skills.w.used)}${Number(state.skills.b.used)}`;
    const effects = variant === VARIANT.STANDARD
      ? "-"
      : `${state.effects.shield?.square || "-"}:${state.effects.freeze?.square || "-"}`;
    return `${pieces}|${state.turn}|${castling}|${effectiveEnPassant(state)}|${variant}|${checks}|${skills}|${effects}`;
  }

  function recordPosition(state) {
    const key = positionKey(state);
    state.repetitionCounts[key] = (state.repetitionCounts[key] || 0) + 1;
  }

  function pushMove(moves, state, from, to, extras = {}) {
    const target = state.board[to];
    if (target?.type === "k" && (state.variant || VARIANT.STANDARD) === VARIANT.STANDARD) return;
    if (target && state.effects.shield?.square === to && state.effects.shield.targetColor === target.color) return;
    moves.push({ from, to, capture: target ? { ...target } : null, ...extras });
  }

  function pushTacticalMove(actions, state, from, to) {
    if (to && !state.board[to]) actions.push({ action: "move", from, to });
  }

  function pushTacticalAttack(actions, state, from, to, extras = {}) {
    const attacker = state.board[from];
    const target = to ? state.board[to] : null;
    if (!attacker || !target || target.color === attacker.color) return;
    actions.push({ action: "attack", from, to, capture: { ...target }, ...extras });
  }

  function addStepActions(actions, state, from, directions, frozen) {
    const [file, rank] = coords(from);
    directions.forEach(([df, dr]) => {
      const to = squareAt(file + df, rank + dr);
      if (!frozen) pushTacticalMove(actions, state, from, to);
      pushTacticalAttack(actions, state, from, to);
    });
  }

  function addRayActions(actions, state, from, directions, range, frozen, ranged = false) {
    const [file, rank] = coords(from);
    directions.forEach(([df, dr]) => {
      for (let distance = 1; distance <= range; distance += 1) {
        const to = squareAt(file + df * distance, rank + dr * distance);
        if (!to) break;
        const target = state.board[to];
        if (!target) {
          if (!frozen && !ranged) pushTacticalMove(actions, state, from, to);
          continue;
        }
        if (target.color !== state.board[from].color) {
          pushTacticalAttack(actions, state, from, to, ranged ? { ranged: true } : {});
        }
        break;
      }
    });
  }

  function generateLightCavalryActions(actions, state, from, frozen) {
    const [file, rank] = coords(from);
    const color = state.board[from].color;
    const enemy = color === "w" ? "b" : "w";
    for (let df = -1; df <= 1; df += 1) {
      for (let dr = -1; dr <= 1; dr += 1) {
        if (df || dr) pushTacticalAttack(actions, state, from, squareAt(file + df, rank + dr));
      }
    }
    if (frozen) return;

    const jumps = [
      [1, 2, 0, 1], [2, 1, 1, 0], [2, -1, 1, 0], [1, -2, 0, -1],
      [-1, -2, 0, -1], [-2, -1, -1, 0], [-2, 1, -1, 0], [-1, 2, 0, 1]
    ];
    jumps.forEach(([df, dr, legFile, legRank]) => {
      const leg = squareAt(file + legFile, rank + legRank);
      const landing = squareAt(file + df, rank + dr);
      if (!leg || state.board[leg] || !landing || state.board[landing]) return;
      actions.push({ action: "move", from, to: landing, cavalry: true });
      const [landingFile, landingRank] = coords(landing);
      for (let attackFile = -1; attackFile <= 1; attackFile += 1) {
        for (let attackRank = -1; attackRank <= 1; attackRank += 1) {
          if (!attackFile && !attackRank) continue;
          const attackTo = squareAt(landingFile + attackFile, landingRank + attackRank);
          const target = attackTo ? state.board[attackTo] : null;
          if (!target || target.color !== enemy) continue;
          actions.push({
            action: "moveAttack", from, to: landing, attackTo, cavalry: true, capture: { ...target }
          });
        }
      }
    });
  }

  function generateTacticalActions(state, color) {
    const actions = [];
    Object.entries(state.board).forEach(([from, piece]) => {
      if (piece.color !== color) return;
      const direction = color === "w" ? 1 : -1;
      const frozen = state.effects.freeze?.square === from && state.effects.freeze.targetColor === color;

      if (piece.type === "p") {
        addStepActions(actions, state, from, [[0, direction], [-1, 0], [1, 0]], frozen);
      } else if (piece.type === "s") {
        const [file, rank] = coords(from);
        if (!frozen) {
          [[0, direction], [-1, 0], [1, 0]].forEach(([df, dr]) => {
            pushTacticalMove(actions, state, from, squareAt(file + df, rank + dr));
          });
        }
        addRayActions(actions, state, from, [[0, direction]], 2, true);
      } else if (piece.type === "h") {
        addStepActions(actions, state, from, [[-1, direction], [0, direction], [1, direction]], frozen);
      } else if (piece.type === "a") {
        const [file, rank] = coords(from);
        if (!frozen) {
          [[0, direction], [-1, 0], [1, 0]].forEach(([df, dr]) => {
            pushTacticalMove(actions, state, from, squareAt(file + df, rank + dr));
          });
        }
        addRayActions(
          actions, state, from,
          [[-1, direction], [0, direction], [1, direction]],
          TACTICAL_UNITS.a.range, true, true
        );
      } else if (piece.type === "l") {
        generateLightCavalryActions(actions, state, from, frozen);
      } else if (piece.type === "c") {
        addRayActions(actions, state, from, [[-1, direction], [0, direction], [1, direction]], 2, frozen);
      } else if (piece.type === "g") {
        const [file, rank] = coords(from);
        const attackDirections = [];
        for (let df = -1; df <= 1; df += 1) {
          for (let dr = -1; dr <= 1; dr += 1) {
            if (df || dr) attackDirections.push([df, dr]);
          }
        }
        if (!frozen) {
          [[-1, 0], [1, 0], [0, -1], [0, 1]].forEach(([df, dr]) => {
            pushTacticalMove(actions, state, from, squareAt(file + df, rank + dr));
          });
        }
        addStepActions(actions, state, from, attackDirections, true);
      }
    });
    return actions;
  }

  function generatePseudoMoves(state, color) {
    const moves = [];
    Object.entries(state.board).forEach(([from, piece]) => {
      if (piece.color !== color) return;
      if (state.effects.freeze?.square === from && state.effects.freeze.targetColor === color) return;
      const [file, rank] = coords(from);

      if (piece.type === "p") {
        const attacksForward = (state.variant || VARIANT.STANDARD) !== VARIANT.STANDARD;
        const direction = color === "w" ? 1 : -1;
        const startRank = color === "w" ? 2 : 7;
        const promotionRank = color === "w" ? 8 : 1;
        const one = squareAt(file, rank + direction);
        const two = squareAt(file, rank + direction * 2);
        if (one && !state.board[one]) {
          pushMove(moves, state, from, one, rank + direction === promotionRank ? { promotion: "q" } : {});
          if (rank === startRank && two && !state.board[two]) pushMove(moves, state, from, two, { doublePawn: true });
        } else if (attacksForward && one && state.board[one]?.color !== color) {
          pushMove(moves, state, from, one, rank + direction === promotionRank ? { promotion: "q" } : {});
        }
        if (attacksForward) return;
        [-1, 1].forEach(fileStep => {
          const to = squareAt(file + fileStep, rank + direction);
          if (!to) return;
          const target = state.board[to];
          if (target && target.color !== color) {
            pushMove(moves, state, from, to, rank + direction === promotionRank ? { promotion: "q" } : {});
          } else if (to === state.enPassant) {
            const capturedSquare = squareAt(file + fileStep, rank);
            if (state.effects.shield?.square === capturedSquare) return;
            pushMove(moves, state, from, to, {
              enPassant: true, capture: { color: color === "w" ? "b" : "w", type: "p" }
            });
          }
        });
        return;
      }

      if (piece.type === "n") {
        [[1, 2], [2, 1], [2, -1], [1, -2], [-1, -2], [-2, -1], [-2, 1], [-1, 2]].forEach(([df, dr]) => {
          const to = squareAt(file + df, rank + dr);
          if (to && (!state.board[to] || state.board[to].color !== color)) pushMove(moves, state, from, to);
        });
        return;
      }

      if (["b", "r", "q"].includes(piece.type)) {
        const directions = [];
        if (["b", "q"].includes(piece.type)) directions.push([1, 1], [1, -1], [-1, 1], [-1, -1]);
        if (["r", "q"].includes(piece.type)) directions.push([1, 0], [-1, 0], [0, 1], [0, -1]);
        directions.forEach(([df, dr]) => {
          let nextFile = file + df;
          let nextRank = rank + dr;
          while (true) {
            const to = squareAt(nextFile, nextRank);
            if (!to) break;
            const target = state.board[to];
            if (!target) pushMove(moves, state, from, to);
            else {
              if (target.color !== color) pushMove(moves, state, from, to);
              break;
            }
            nextFile += df;
            nextRank += dr;
          }
        });
        return;
      }

      if (piece.type === "k") {
        if ((state.variant || VARIANT.STANDARD) !== VARIANT.STANDARD) {
          const directions = [
            [1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]
          ];
          directions.forEach(([df, dr]) => {
            let nextFile = file + df;
            let nextRank = rank + dr;
            while (true) {
              const to = squareAt(nextFile, nextRank);
              if (!to) break;
              const target = state.board[to];
              if (!target) pushMove(moves, state, from, to);
              else {
                if (target.color !== color) pushMove(moves, state, from, to);
                break;
              }
              nextFile += df;
              nextRank += dr;
            }
          });
          return;
        }

        for (let df = -1; df <= 1; df += 1) {
          for (let dr = -1; dr <= 1; dr += 1) {
            if (!df && !dr) continue;
            const to = squareAt(file + df, rank + dr);
            if (to && (!state.board[to] || state.board[to].color !== color)) pushMove(moves, state, from, to);
          }
        }
        const homeRank = color === "w" ? 1 : 8;
        const enemy = color === "w" ? "b" : "w";
        if (from === `e${homeRank}` && !isSquareAttacked(state, from, enemy)) {
          if (state.castling[`${color}K`] && state.board[`h${homeRank}`]?.type === "r" &&
              !state.board[`f${homeRank}`] && !state.board[`g${homeRank}`] &&
              !isSquareAttacked(state, `f${homeRank}`, enemy) && !isSquareAttacked(state, `g${homeRank}`, enemy)) {
            pushMove(moves, state, from, `g${homeRank}`, { castle: "K" });
          }
          if (state.castling[`${color}Q`] && state.board[`a${homeRank}`]?.type === "r" &&
              !state.board[`b${homeRank}`] && !state.board[`c${homeRank}`] && !state.board[`d${homeRank}`] &&
              !isSquareAttacked(state, `d${homeRank}`, enemy) && !isSquareAttacked(state, `c${homeRank}`, enemy)) {
            pushMove(moves, state, from, `c${homeRank}`, { castle: "Q" });
          }
        }
      }
    });
    return moves;
  }

  function isSquareAttacked(state, target, byColor) {
    if (state.variant === VARIANT.TACTICAL) return false;
    const [file, rank] = coords(target);
    const pawnRank = rank + (byColor === "w" ? -1 : 1);
    if ((state.variant || VARIANT.STANDARD) !== VARIANT.STANDARD) {
      const square = squareAt(file, pawnRank);
      if (square && state.board[square]?.color === byColor && state.board[square]?.type === "p") return true;
    } else {
      for (const df of [-1, 1]) {
        const square = squareAt(file + df, pawnRank);
        if (square && state.board[square]?.color === byColor && state.board[square]?.type === "p") return true;
      }
    }
    for (const [df, dr] of [[1, 2], [2, 1], [2, -1], [1, -2], [-1, -2], [-2, -1], [-2, 1], [-1, 2]]) {
      const square = squareAt(file + df, rank + dr);
      if (square && state.board[square]?.color === byColor && state.board[square]?.type === "n") return true;
    }
    const variantKing = (state.variant || VARIANT.STANDARD) === VARIANT.STANDARD ? [] : ["k"];
    for (const [df, dr, validTypes] of [
      [1, 0, ["r", "q", ...variantKing]], [-1, 0, ["r", "q", ...variantKing]],
      [0, 1, ["r", "q", ...variantKing]], [0, -1, ["r", "q", ...variantKing]],
      [1, 1, ["b", "q", ...variantKing]], [1, -1, ["b", "q", ...variantKing]],
      [-1, 1, ["b", "q", ...variantKing]], [-1, -1, ["b", "q", ...variantKing]]
    ]) {
      let nextFile = file + df;
      let nextRank = rank + dr;
      while (true) {
        const square = squareAt(nextFile, nextRank);
        if (!square) break;
        const piece = state.board[square];
        if (piece) {
          if (piece.color === byColor && validTypes.includes(piece.type)) return true;
          break;
        }
        nextFile += df;
        nextRank += dr;
      }
    }
    if ((state.variant || VARIANT.STANDARD) === VARIANT.STANDARD) {
      for (let df = -1; df <= 1; df += 1) {
        for (let dr = -1; dr <= 1; dr += 1) {
          if (!df && !dr) continue;
          const square = squareAt(file + df, rank + dr);
          if (square && state.board[square]?.color === byColor && state.board[square]?.type === "k") return true;
        }
      }
    }
    return false;
  }

  function isInCheck(state, color) {
    if (state.variant === VARIANT.TACTICAL) return false;
    const kingSquare = Object.keys(state.board).find(square => {
      const piece = state.board[square];
      return piece.color === color && piece.type === "k";
    });
    if (!kingSquare) return true;
    return isSquareAttacked(state, kingSquare, color === "w" ? "b" : "w");
  }

  function disableRookCastling(state, color, square) {
    const rank = color === "w" ? 1 : 8;
    if (square === `a${rank}`) state.castling[`${color}Q`] = false;
    if (square === `h${rank}`) state.castling[`${color}K`] = false;
  }

  function expireEffects(state) {
    if (state.effects.shield?.owner === state.turn) state.effects.shield = null;
    if (state.effects.freeze?.owner === state.turn) state.effects.freeze = null;
  }

  function applyTacticalAction(state, action, randomizeDamage) {
    const piece = state.board[action.from];
    if (!piece) return null;
    const result = {
      action: action.action || "move", from: action.from, to: action.to,
      attackTo: action.attackTo || null, damage: null, blocked: false, destroyed: false,
      targetType: null, targetColor: null
    };
    if (action.action === "move" || action.action === "moveAttack") {
      delete state.board[action.from];
      state.board[action.to] = piece;
      if (state.effects.shield?.square === action.from && state.effects.shield.targetColor === piece.color) {
        state.effects.shield.square = action.to;
      }
      if (state.effects.freeze?.square === action.from && state.effects.freeze.targetColor === piece.color) {
        state.effects.freeze.square = action.to;
      }
    }

    const attackSquare = action.action === "moveAttack" ? action.attackTo : action.action === "attack" ? action.to : null;
    if (attackSquare) {
      const target = state.board[attackSquare];
      if (target && target.color !== piece.color) {
        result.targetType = target.type;
        result.targetColor = target.color;
        const shielded = state.effects.shield?.square === attackSquare &&
          state.effects.shield.targetColor === target.color;
        if (shielded) {
          result.damage = 0;
          result.blocked = true;
        } else {
          const baseDamage = TACTICAL_UNITS[piece.type].damage;
          const variation = randomizeDamage ? Math.floor(Math.random() * 3) - 1 : 0;
          result.damage = Math.max(1, baseDamage + variation);
          target.hp -= result.damage;
          if (target.hp <= 0) {
            result.destroyed = true;
            delete state.board[attackSquare];
            if (state.effects.freeze?.square === attackSquare) state.effects.freeze = null;
            if (state.effects.shield?.square === attackSquare) state.effects.shield = null;
            if (target.type === "g") {
              state.variantWinner = piece.color;
              state.variantWinReason = "generalDefeated";
            }
          }
        }
      }
    }

    state.halfmoveClock = 0;
    state.enPassant = null;
    state.lastMove = {
      from: action.from,
      to: attackSquare || action.to,
      landing: action.action === "moveAttack" ? action.to : null,
      action: action.action || "move"
    };
    state.lastActionResult = result;
    if (piece.color === "b") state.moveNumber += 1;
    state.turn = piece.color === "w" ? "b" : "w";
    expireEffects(state);
    recordPosition(state);
    return result;
  }

  function applyMove(state, move, randomizeDamage = false) {
    if (state.variant === VARIANT.TACTICAL) return applyTacticalAction(state, move, randomizeDamage);
    const piece = state.board[move.from];
    const captured = state.board[move.to];
    if (!piece) return null;
    if (state.effects.shield?.square === move.from && state.effects.shield.targetColor === piece.color) {
      state.effects.shield.square = move.to;
    }
    if (captured && state.effects.freeze?.square === move.to) state.effects.freeze = null;
    state.halfmoveClock = piece.type === "p" || captured || move.enPassant ? 0 : state.halfmoveClock + 1;
    delete state.board[move.from];
    if (move.enPassant) {
      const [targetFile, targetRank] = coords(move.to);
      delete state.board[squareAt(targetFile, targetRank + (piece.color === "w" ? -1 : 1))];
    }
    state.board[move.to] = { color: piece.color, type: move.promotion || piece.type };
    if (move.castle) {
      const rank = piece.color === "w" ? 1 : 8;
      const rookFrom = move.castle === "K" ? `h${rank}` : `a${rank}`;
      const rookTo = move.castle === "K" ? `f${rank}` : `d${rank}`;
      state.board[rookTo] = state.board[rookFrom];
      delete state.board[rookFrom];
    }
    if (piece.type === "k") {
      state.castling[`${piece.color}K`] = false;
      state.castling[`${piece.color}Q`] = false;
    }
    if (piece.type === "r") disableRookCastling(state, piece.color, move.from);
    if (captured?.type === "r") disableRookCastling(state, captured.color, move.to);
    state.enPassant = null;
    if ((state.variant || VARIANT.STANDARD) === VARIANT.STANDARD && piece.type === "p" && move.doublePawn) {
      const [file, rank] = coords(move.from);
      state.enPassant = squareAt(file, rank + (piece.color === "w" ? 1 : -1));
    }
    state.lastMove = { from: move.from, to: move.to };
    state.lastActionResult = null;
    if (piece.color === "b") state.moveNumber += 1;
    state.turn = piece.color === "w" ? "b" : "w";
    expireEffects(state);
    if ((state.variant || VARIANT.STANDARD) !== VARIANT.STANDARD && captured?.type === "k") {
      state.variantWinner = piece.color;
      state.variantWinReason = "kingCapture";
    }
    if (!state.variantWinner && state.variant === VARIANT.KING_OF_THE_HILL && piece.type === "k" && HILL_SQUARES.includes(move.to)) {
      state.variantWinner = piece.color;
      state.variantWinReason = "hill";
    }
    if (!state.variantWinner && state.variant === VARIANT.THREE_CHECK && isInCheck(state, state.turn)) {
      state.checksGiven[piece.color] += 1;
      if (state.checksGiven[piece.color] >= 3) {
        state.variantWinner = piece.color;
        state.variantWinReason = "threeCheck";
      }
    }
    recordPosition(state);
    return null;
  }

  function canUseSkill(state, color) {
    return state.variant !== VARIANT.STANDARD && state.turn === color && !state.over && !state.variantWinner &&
      Boolean(state.skills?.[color]) && !state.skills[color].used;
  }

  function skillTargets(state, color) {
    if (!canUseSkill(state, color)) return [];
    return Object.entries(state.board)
      .filter(([, piece]) => piece.color === "w" && !["k", "g"].includes(piece.type))
      .map(([square]) => square);
  }

  function useSkill(state, color, targetSquare) {
    if (!skillTargets(state, color).includes(targetSquare)) return null;
    state.skills[color].used = true;
    if (color === "w") state.effects.shield = { owner: "w", targetColor: "w", square: targetSquare };
    else state.effects.freeze = { owner: "b", targetColor: "w", square: targetSquare };
    recordPosition(state);
    return { ...PLAYER_SKILLS[color], color, target: targetSquare };
  }

  function legalMovesFor(state, color) {
    if (state.variant === VARIANT.TACTICAL) return generateTacticalActions(state, color);
    const moves = generatePseudoMoves(state, color);
    if ((state.variant || VARIANT.STANDARD) !== VARIANT.STANDARD) return moves;
    return moves.filter(move => {
      const simulation = cloneGame(state);
      applyMove(simulation, move);
      return !isInCheck(simulation, color);
    });
  }

  function moveToSan(state, move) {
    const piece = state.board[move.from];
    if (!piece) return `${move.from}-${move.attackTo || move.to}`;
    if (state.variant === VARIANT.TACTICAL) {
      const unit = TACTICAL_UNITS[piece.type]?.short || piece.type.toUpperCase();
      if (move.action === "attack") return `${unit}${move.from}×${move.to}`;
      if (move.action === "moveAttack") return `${unit}${move.from}→${move.to}×${move.attackTo}`;
      return `${unit}${move.from}-${move.to}`;
    }
    let notation;
    if (move.castle) {
      notation = move.castle === "K" ? "O-O" : "O-O-O";
    } else {
      const capture = Boolean(move.capture || move.enPassant || state.board[move.to]);
      let prefix = piece.type === "p" ? (capture ? move.from[0] : "") : SAN_PIECE[piece.type];
      if (piece.type !== "p") {
        const alternatives = legalMovesFor(state, piece.color).filter(candidate => {
          const candidatePiece = state.board[candidate.from];
          return candidate.from !== move.from && candidate.to === move.to && candidatePiece?.type === piece.type;
        });
        if (alternatives.length) {
          const sameFile = alternatives.some(candidate => candidate.from[0] === move.from[0]);
          const sameRank = alternatives.some(candidate => candidate.from[1] === move.from[1]);
          if (!sameFile) prefix += move.from[0];
          else if (!sameRank) prefix += move.from[1];
          else prefix += move.from;
        }
      }
      notation = `${prefix}${capture ? "x" : ""}${move.to}`;
      if (move.promotion) notation += `=${SAN_PIECE[move.promotion] || move.promotion.toUpperCase()}`;
    }
    const simulation = cloneGame(state);
    applyMove(simulation, move);
    if (simulation.variantWinReason === "kingCapture") return `${notation}#`;
    const defender = simulation.turn;
    if (isInCheck(simulation, defender)) notation += legalMovesFor(simulation, defender).length ? "+" : "#";
    return notation;
  }

  function isInsufficientMaterial(state) {
    const nonKings = Object.entries(state.board).filter(([, piece]) => piece.type !== "k");
    if (nonKings.some(([, piece]) => ["p", "r", "q"].includes(piece.type))) return false;
    if (nonKings.length === 0) return true;
    if (nonKings.length === 1) return ["b", "n"].includes(nonKings[0][1].type);
    if (nonKings.every(([, piece]) => piece.type === "b")) {
      const bishopSquareColors = new Set(nonKings.map(([square]) => {
        const [file, rank] = coords(square);
        return (file + rank) % 2;
      }));
      return bishopSquareColors.size === 1;
    }
    return false;
  }

  function getDrawReason(state) {
    if (state.variant === VARIANT.TACTICAL) return null;
    if (state.halfmoveClock >= 100) return "fiftyMove";
    if ((state.repetitionCounts[positionKey(state)] || 0) >= 3) return "threefold";
    if (state.variant === VARIANT.STANDARD && isInsufficientMaterial(state)) return "insufficientMaterial";
    return null;
  }

  globalThis.FerretChessEngine = Object.freeze({
    FILES, PIECE_NAME, PIECE_SYMBOL, VALUE, VARIANT, HILL_SQUARES, TACTICAL_UNITS, PLAYER_SKILLS,
    createGame, cloneGame, coords, applyMove, canUseSkill, skillTargets, useSkill, legalMovesFor,
    moveToSan, isInCheck, getDrawReason
  });
})();
