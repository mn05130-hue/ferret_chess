"use strict";

// Candidate generation, anomaly overrides, particles, and style transforms.
HorrorChatEngine = class HorrorChatEngineGeneration extends HorrorChatEngine {
  /**
   * 큐 요청을 처리해 화자와 후보 문장을 고르고 중복 필터를 통과한 최종 발화를 외부로 보냅니다.
   */
  processRequest(originalRequest, options = {}) {
    const request = { ...originalRequest };
    // 반응 타이밍을 놓친 요청은 뒷북(회상)으로 바꿉니다.
    if (this.simTime - request.scheduledAt > TUNING.requestExpiryMs
        && ["REACT", "LAUGH"].includes(request.intent)) {
      request.intent = "RECALL";
    }

    const viewer = this.chooseSpeaker(request.intent, request.forcedSpeakerId);
    if (!viewer) return;

    let utterance;
    for (let attempt = 0; attempt < TUNING.maxGenerationRetries; attempt += 1) {
      const candidate = this.generateCandidate(viewer, request);
      // bypassFilter는 모방형처럼 "복제 자체가 목적"인 라인을 위한 예외입니다.
      if (candidate.bypassFilter || options.skipFilters) {
        utterance = candidate;
        break;
      }
      const rejection = this.findRejection(candidate);
      if (!rejection) {
        utterance = candidate;
        break;
      }
      this.debug.filterRejects[rejection] += 1;
    }

    if (!utterance && request.forceAnomaly) {
      utterance = this.createAnomalyOverride(viewer);
    }

    if (!utterance) {
      this.debug.fallbackCount += 1;
      utterance = this.generateShortCandidate(viewer, request.intent, request.slotHints, true);
    }

    this.recordUtterance(viewer, request, utterance, options);
  }

  /* ---------- 내용 생성 ---------- */

  /**
   * 일반 템플릿 또는 강제 이상 대사 중 하나를 선택해 메타데이터가 포함된 문장 후보를 만듭니다.
   */
  generateCandidate(viewer, request) {
    const anomalyOverride = request.forceAnomaly
      ? this.createAnomalyOverride(viewer)
      : null;
    if (anomalyOverride) return anomalyOverride;

    const persona = PERSONAS[viewer.personaKey];
    const shortChance = Math.min(.92, persona.shortChance * (1 + this.tension * 1.5));
    if (this.random.next() < shortChance) {
      return this.generateShortCandidate(viewer, request.intent, request.slotHints);
    }

    const templates = TEMPLATES[request.intent] || TEMPLATES.CHAT;
    const [templateId, formalTemplate, chatTemplate] = this.random.pick(templates);
    const slots = {};

    const fill = source => source.replace(/\{([^}|]+)(?:\|([^}]+))?\}/g, (_, slotName, particle) => {
      const value = slots[slotName] ?? this.resolveSlot(slotName, request.slotHints, viewer);
      slots[slotName] = value;
      return particle ? this.attachParticle(value, particle) : value;
    });

    const chatFilled = fill(chatTemplate);
    const formalFilled = fill(formalTemplate);

    const text = this.transformStyle(chatFilled, viewer);

    return {
      text,
      // 유사도 필터는 반드시 변형 이전 형태로 비교해야 합니다.
      standardText: formalFilled,
      templateId,
      signature: this.signature(templateId, slots),
      slots,
      short: false
    };
  }

  /**
   * 채팅 폭주에 적합한 짧은 문장을 고르고 페르소나별 이모티콘과 fallback 변형을 적용합니다.
   */
  generateShortCandidate(viewer, intent, slotHints = {}, fallback = false) {
    const pool = SHORT_LINES[intent] || SHORT_LINES.REACT;
    const unusedPool = fallback ? pool.filter(line => !this.recentOutputs.includes(line)) : pool;
    let text = this.random.pick(unusedPool.length ? unusedPool : pool);
    const baseText = text;

    if (fallback && this.recentOutputs.includes(text)) {
      text += this.random.next() < .5 ? "!" : "?";
    }

    const style = PERSONAS[viewer.personaKey].style;
    if (!fallback && style.emote > .6 && this.random.next() < .35) {
      text += this.random.pick(style.emotePool);
    }

    return {
      text,
      standardText: baseText,
      templateId: `short:${intent}:${pool.indexOf(baseText)}`,
      signature: `short:${intent}:${baseText}`,
      slots: { ...slotHints },
      short: true
    };
  }

  /* ---------- 이상 시청자 ---------- */

  /**
   * 이상 권한과 현재 장면 컨텍스트로 공포 대사를 선택해 일반 후보를 교체합니다.
   */
  createAnomalyOverride(viewer) {
    if (!viewer.anomalous) return null;

    // --- 컨텍스트 수집 ---
    const others = this.viewers.filter(other => other.active && other.id !== viewer.id);
    const openedAt = new Date(this.externalContext.startedAt);
    const now = new Date();
    const toClock = date =>
      `${String(date.getHours()).padStart(2, "0")}시 ${String(date.getMinutes()).padStart(2, "0")}분`;
    const ctx = {
      seconds: this.futureEvent
        ? Math.max(1, Math.ceil((this.futureEvent.scheduledAt - this.simTime) / 1000))
        : null,
      omen: this.futureEvent?.omen ?? null,
      elapsed: Math.floor(this.simTime / 1000),
      clock: toClock(openedAt),
      nowClock: toClock(now),
      day: this.random.pick(SLOT_POOLS.day),
      nickname: viewer.name ?? "당신",
      otherNick: others.length ? this.random.pick(others).name : null,
      lastText: this.recentOutputs.at(-1) ?? null
    };

    // 이상 채팅의 내용 강도는 anomalyLevel과 무관합니다.
    // 어떤 이상도에서도 전담 유형 전체와 공용 붕괴 풀 전체를 사용합니다.
    const candidates = [
      ...(ANOMALY_LINES[viewer.anomalyPermission] || []),
      ...ANOMALY_LINES.GLITCH
    ].filter(entry => !entry.needs || entry.needs(ctx));

    if (!candidates.length) return null;
    const entry = this.random.pick(candidates);

    const standardText = entry.make(ctx);
    if (!standardText) return null;

    // --- 표기 모드 적용 ---
    // casual은 이상도와 무관하게 변형기를 100% 강도로 통과시킵니다.
    // 이상도 4짜리가 가장 평범한 말투로 말하는 순간을 만들기 위한 장치입니다.
    const text = entry.mode === "casual"
      ? this.transformStyle(standardText, viewer, 1)
      : standardText;

    return {
      text,
      standardText,
      templateId: `anomaly:${viewer.anomalyPermission}:${entry.id}`,
      signature: `anomaly:${entry.id}:${standardText}`,
      slots: {},
      short: false,
      anomaly: true,
      anomalyEvidence: viewer.anomalyPermission,
      anomalyMode: entry.mode,
      anomalyLineId: entry.id,
      bypassFilter: Boolean(entry.bypass)
    };
  }

  /**
   * 요청 힌트, 장면 상태, 기본 슬롯 풀 순서로 템플릿 자리표시자의 실제 값을 결정합니다.
   */
  resolveSlot(name, hints, viewer) {
    const value = hints?.[name]
      ?? viewer.memorySlots[name]
      ?? this.scene[name]
      ?? this.random.pick(SLOT_POOLS[name] || ["그거"]);
    viewer.memorySlots[name] = value;
    return value;
  }

  /**
   * 받침 유무를 검사해 은/는, 이/가 같은 한국어 조사를 올바르게 붙입니다.
   */
  attachParticle(value, pair) {
    const lastCharacter = String(value).at(-1);
    const code = lastCharacter?.charCodeAt(0) ?? 0;
    const isHangul = code >= 0xac00 && code <= 0xd7a3;
    const finalConsonant = isHangul ? (code - 0xac00) % 28 : 0;
    if (pair === "으로/로") {
      return `${value}${finalConsonant !== 0 && finalConsonant !== 8 ? "으로" : "로"}`;
    }
    const [withConsonant, withoutConsonant] = pair.split("/");
    return `${value}${finalConsonant ? withConsonant : withoutConsonant}`;
  }

  /* ---------- 표기 변형기 ---------- */

  /**
   * 축약·어미·이모티콘·오타 확률을 적용해 정중한 원문을 시청자 고유 채팅 말투로 바꿉니다.
   */
  transformStyle(input, viewer, factorOverride) {
    const style = PERSONAS[viewer.personaKey].style;
    const factor = factorOverride ?? 1;
    const roll = probability => this.random.next() < probability * factor;
    let text = input;

    // 1) 주어구 절단 — 길이를 줄이는 가장 강력한 수단
    let words = text.split(/\s+/).filter(Boolean);
    if (words.length >= 4 && roll(style.trim)) {
      words = words.slice(1);
      text = words.join(" ");
    }

    // 2) 조사 생략 — 어절마다 개별 판정
    text = text.replace(
      /([가-힣]{1,6}?)(은|는|이|가|을|를|에서|으로|에게)(?=\s|$)/g,
      (match, stem) => roll(style.particle) ? stem : match
    );

    // 3) 채팅 어미 — 문장부호를 뗀 상태로 검사, 첫 매칭 하나만
    if (roll(style.ending)) {
      const hasQuestion = /\?$/.test(text);
      let core = text.replace(/[.!?]+$/, "");
      for (const [pattern, replacement] of CHAT_ENDINGS) {
        if (pattern.test(core)) {
          core = core.replace(pattern, replacement);
          break;
        }
      }
      text = core + (hasQuestion ? "?" : "");
    }

    // 4) 초성/밈 축약 — 항목마다 개별 판정
    for (const [pattern, replacement] of ABBREVIATIONS) {
      if (pattern.test(text) && roll(style.abbrev)) text = text.replace(pattern, replacement);
    }

    // 5) 띄어쓰기 붕괴 — 띄어쓰기마다 개별 판정
    const parts = text.split(/\s+/).filter(Boolean);
    text = parts.reduce(
      (acc, word, index) => index === 0 ? word : acc + (roll(style.spacing) ? "" : " ") + word,
      ""
    );

    // 6) 문장부호 제거 — 물음표는 채팅에서도 살아남으므로 보존
    if (roll(style.punctuation)) text = text.replace(/[.!]+$/g, "");

    // 7) 이모트 — 성격별 풀에서, 앞쪽 항목이 자주 나오도록 가중
    if (roll(style.emote) && style.emotePool?.length) {
      const pool = style.emotePool;
      const skewed = Math.abs(this.random.next() - this.random.next());
      text += pool[Math.min(pool.length - 1, Math.floor(skewed * pool.length))];
    }

    // 8) 물음표 / 느낌표 늘리기
    if (/[?!]$/.test(text) && roll(style.emote * .6)) text += text.at(-1);

    // 9) 오타
    if (roll(style.typo)) {
      if (this.random.next() < .4) {
        text = spillFirstSyllable(text);
      } else {
        const [from, to] = this.random.pick(TYPO_PAIRS);
        text = text.replace(from, to);
      }
    }

    // 개발용 안전망 — 템플릿 정중형이 새어 나오면 즉시 알려줍니다.
    // casual 이상 대사(factorOverride 사용)는 검사 대상이 아닙니다.
    if (factorOverride == null && factor > 0 && /습니다|습니까|십시오/.test(text)) {
      this.debug.formalLeaks += 1;
      console.warn("[말투] 정중형 누출:", input, "→", text);
    }

    return text.trim();
  }

};
