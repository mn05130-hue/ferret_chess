(() => {
  "use strict";

  const layer = document.querySelector("#cutscene-layer");
  const eyebrow = document.querySelector("#cutscene-eyebrow");
  const title = document.querySelector("#cutscene-title");
  const copy = document.querySelector("#cutscene-copy");
  const actor = document.querySelector("#cutscene-actor");
  const skipButton = document.querySelector("#cutscene-skip");

  const scenes = new Map(Object.entries({
    castle: {
      eyebrow: "SPECIAL MOVE",
      title: "캐슬링!",
      copy: "킹과 룩이 한 번에 무대를 바꿉니다.",
      tone: "gold",
      sound: "castle",
      duration: 1650
    },
    promotion: {
      eyebrow: "PROMOTION",
      title: "새로운 주역의 등장!",
      copy: "폰이 마지막 칸에 도착해 퀸으로 승격했습니다.",
      tone: "mint",
      sound: "promotion",
      duration: 1900
    },
    check: {
      eyebrow: "CHECK",
      title: "킹이 위험해!",
      copy: "다음 수에는 체크를 반드시 해결해야 합니다.",
      tone: "red",
      sound: "check",
      duration: 1350
    },
    checkmate: {
      eyebrow: "FINALE",
      title: "체크메이트!",
      copy: "마지막 수가 무대의 승부를 결정했습니다.",
      tone: "red",
      sound: "checkmate",
      duration: 2400
    },
    variantWin: {
      eyebrow: "VARIANT FINALE",
      title: "특별 규칙 달성!",
      copy: "변형 체스의 승리 조건을 먼저 달성했습니다.",
      tone: "gold",
      sound: "checkmate",
      duration: 2400
    },
    skill: {
      eyebrow: "SPECIAL SKILL",
      title: "스킬 발동!",
      copy: "변형 체스의 특별한 힘이 체스판에 펼쳐집니다.",
      tone: "mint",
      sound: "skill",
      duration: 1800
    }
  }));

  let activeScene = null;
  let activeTimer = null;
  let sequenceVersion = 0;

  function registerScene(id, config) {
    scenes.set(id, { ...config });
  }

  function sceneFrom(request) {
    const normalized = typeof request === "string" ? { id: request } : request;
    const base = scenes.get(normalized?.id);
    return base ? { ...base, ...normalized } : null;
  }

  function finishScene(cancelled = false) {
    if (!activeScene) return;
    window.clearTimeout(activeTimer);
    layer.classList.remove("open");
    const finished = activeScene;
    activeScene = null;

    document.dispatchEvent(new CustomEvent("ferret:cutscene-end", {
      detail: { ...finished.scene, cancelled }
    }));

    window.setTimeout(() => {
      layer.setAttribute("aria-hidden", "true");
      layer.inert = true;
      finished.resolve();
    }, 220);
  }

  function play(request) {
    const scene = sceneFrom(request);
    if (!scene) return Promise.resolve();
    if (activeScene) finishScene(true);

    return new Promise(resolve => {
      activeScene = { scene, resolve };
      eyebrow.textContent = scene.eyebrow;
      title.textContent = scene.title;
      copy.textContent = scene.copy;
      actor.dataset.side = scene.side || "w";
      layer.dataset.side = scene.side || "w";
      layer.dataset.tone = scene.tone || "gold";
      layer.inert = false;
      layer.setAttribute("aria-hidden", "false");

      document.dispatchEvent(new CustomEvent("ferret:cutscene-start", {
        detail: { ...scene }
      }));

      window.requestAnimationFrame(() => {
        layer.classList.add("open");
        skipButton.focus({ preventScroll: true });
      });

      const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      activeTimer = window.setTimeout(finishScene, reducedMotion ? 650 : scene.duration);
    });
  }

  async function playSequence(requests) {
    const version = ++sequenceVersion;
    for (const request of requests) {
      if (version !== sequenceVersion) break;
      await play(request);
    }
  }

  function cancelAll() {
    sequenceVersion += 1;
    finishScene(true);
  }

  skipButton.addEventListener("click", () => finishScene(false));
  document.addEventListener("keydown", event => {
    if (event.key === "Escape" && activeScene) finishScene(false);
  });

  window.FerretChessCutscenes = Object.freeze({
    play,
    playSequence,
    cancelAll,
    registerScene
  });
})();
