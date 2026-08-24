(() => {
  "use strict";

  const TUNING = Object.freeze({
    tickMs: 100,
    tensionHalfLifeMs: 12000,
    tenseThreshold: 0.4,
    burstDurationMs: 3000,
    aftermathDurationMs: 8000,
    lullAfterMs: 30000,
    requestExpiryMs: 2000,
    maxAnomalyLevel: 4,
    anomalySpeechStep: 3,
    maxGenerationRetries: 3,
    similarityThreshold: 0.7,
    intentCooldownMs: 4200,
    intervals: {
      AMBIENT: [2000, 4300],
      TENSE: [750, 1600],
      BURST: [260, 680],
      AFTERMATH: [900, 2100],
      LULL: [2400, 4800]
    },
    stateIntents: {
      AMBIENT: { CHAT: 40, ADVICE: 25, QUESTION: 20, EXCLAIM: 15 },
      TENSE: { WARNING: 45, OBSERVE: 30, ADVICE: 20, CHAT: 5 },
      BURST: { SCREAM: 50, EXCLAIM: 30, WARNING: 20 },
      AFTERMATH: { HINDSIGHT: 35, TEASE: 30, REVIEW: 25, ADVICE: 10 },
      LULL: { CHAT: 50, STREAM_QUESTION: 25, OFF_TOPIC: 25 }
    }
  });

  const PERSONAS = Object.freeze({
    COWARD: {
      label: "겁쟁이",
      desire: 1.1,
      cooldownMs: 2600,
      shortChance: 0.52,
      tensionResponse: 1.55,
      fit: { WARNING: 3, SCREAM: 3, QUESTION: .8, OBSERVE: .6, ADVICE: .25, TEASE: .15 },
      style: { casual: .94, particle: .55, ending: .48, spacing: .38, punctuation: .12, abbreviation: .2, repeat: .72, typo: .14 }
    },
    COACH: {
      label: "훈수꾼",
      desire: 1.15,
      cooldownMs: 2300,
      shortChance: 0.35,
      tensionResponse: 1.15,
      fit: { ADVICE: 3, REVIEW: 2.2, HINDSIGHT: 2, OBSERVE: 1.1, QUESTION: .35, TEASE: .45 },
      style: { casual: .96, particle: .85, ending: .78, spacing: .48, punctuation: .72, abbreviation: .28, repeat: .12, typo: .04 }
    },
    JOKER: {
      label: "장난꾼",
      desire: 1.05,
      cooldownMs: 2100,
      shortChance: 0.58,
      tensionResponse: 1.35,
      fit: { TEASE: 3, EXCLAIM: 1.7, CHAT: 1.2, OFF_TOPIC: 1.3, WARNING: .3, ADVICE: .4 },
      style: { casual: .98, particle: .68, ending: .55, spacing: .45, punctuation: .45, abbreviation: .42, repeat: .82, typo: .08 }
    },
    IMMERSIVE: {
      label: "몰입형",
      desire: .95,
      cooldownMs: 3000,
      shortChance: 0.26,
      tensionResponse: 1.25,
      fit: { OBSERVE: 3, QUESTION: 1.6, WARNING: 1.3, REVIEW: 1.4, ADVICE: .65, TEASE: .25 },
      style: { casual: .86, particle: .38, ending: .3, spacing: .22, punctuation: .16, abbreviation: .12, repeat: .16, typo: .03 }
    },
    SKEPTIC: {
      label: "의심꾼",
      desire: .92,
      cooldownMs: 3400,
      shortChance: 0.32,
      tensionResponse: 1.05,
      fit: { SUSPICION: 3, QUESTION: 1.5, OBSERVE: 1.2, REVIEW: 1.1, WARNING: .65, TEASE: .55 },
      style: { casual: .9, particle: .52, ending: .44, spacing: .3, punctuation: .25, abbreviation: .18, repeat: .22, typo: .04 }
    }
  });

  const TEMPLATES = Object.freeze({
    CHAT: [
      ["chat-room", "{location|은/는} 분위기가 정말 무섭습니다."],
      ["chat-sound", "이 게임은 소리를 들을수록 더 무섭습니다."],
      ["chat-progress", "오늘은 엔딩까지 볼 수 있을 것 같습니다."],
      ["chat-silence", "갑자기 조용해져서 더 불안합니다."]
    ],
    ADVICE: [
      ["advice-direction", "{direction|을/를} 먼저 확인해야 합니다."],
      ["advice-item", "{item|을/를} 아껴 사용하는 것이 좋겠습니다."],
      ["advice-save", "{location}에 들어가기 전에 저장해야 합니다."],
      ["advice-door", "지나온 문을 닫고 이동하는 것이 좋겠습니다."]
    ],
    QUESTION: [
      ["question-target", "{target|은/는} 아까도 {location}에 있었습니까?"],
      ["question-sound", "방금 {direction}에서 소리가 들리지 않았습니까?"],
      ["question-item", "{item|은/는} 이미 사용한 것입니까?"],
      ["question-path", "이 길로 가는 것이 맞습니까?"]
    ],
    EXCLAIM: [
      ["exclaim-target", "{target|이/가} 갑자기 나타나서 정말 놀랐습니다!"],
      ["exclaim-close", "방금은 정말 위험했습니다!"],
      ["exclaim-sound", "소리가 너무 커서 깜짝 놀랐습니다!"],
      ["exclaim-scene", "이 장면은 분위기가 정말 무섭습니다!"]
    ],
    WARNING: [
      ["warning-approach", "{direction}에서 {target|이/가} 다가오고 있습니다!"],
      ["warning-distance", "지금은 {target}에게서 떨어지는 것이 좋겠습니다!"],
      ["warning-location", "지금 {location|으로/로} 들어가면 안 됩니다!"],
      ["warning-behind", "뒤를 확인하고 바로 도망쳐야 합니다!"]
    ],
    OBSERVE: [
      ["observe-motion", "{direction}에서 {target|이/가} 움직인 것 같습니다."],
      ["observe-position", "{target|은/는} 아까 {location}에 있지 않았습니까?"],
      ["observe-change", "방금 {location}의 모습이 달라진 것 같습니다."],
      ["observe-sound", "{direction}에서 발소리가 들리는 것 같습니다."]
    ],
    SCREAM: [
      ["scream-run", "지금 바로 도망쳐야 합니다!"],
      ["scream-behind", "바로 뒤에 무언가가 있습니다!"],
      ["scream-no", "그쪽으로 가면 안 됩니다!"],
      ["scream-shock", "정말 깜짝 놀랐습니다!"]
    ],
    HINDSIGHT: [
      ["hindsight-run", "아까 바로 도망쳤어야 했습니다."],
      ["hindsight-seen", "조금 전에 {direction|을/를} 확인했어야 했습니다."],
      ["hindsight-door", "그 문을 열지 않는 것이 좋았습니다."],
      ["hindsight-item", "아까 {item|을/를} 챙겼어야 했습니다."]
    ],
    TEASE: [
      ["tease-shock", "방금 놀라는 모습이 정말 재미있었습니다."],
      ["tease-return", "또 같은 장소로 돌아온 것 같습니다."],
      ["tease-brave", "이번에는 도망치지 않을 수 있습니까?"],
      ["tease-monster", "{target}도 방송을 보러 온 것 같습니다."]
    ],
    REVIEW: [
      ["review-cause", "방금은 {direction|을/를} 늦게 확인해서 위험했습니다."],
      ["review-route", "다음에는 {location|으로/로} 바로 가지 않는 것이 좋겠습니다."],
      ["review-item", "{item|을/를} 먼저 사용했다면 피할 수 있었습니다."],
      ["review-close", "조금만 늦었으면 잡혔을 것 같습니다."]
    ],
    STREAM_QUESTION: [
      ["stream-end", "오늘 이 게임의 엔딩까지 볼 예정입니까?"],
      ["stream-next", "다음 방송에서도 공포 게임을 할 예정입니까?"],
      ["stream-light", "화면 밝기를 조금 올려 줄 수 있습니까?"],
      ["stream-headset", "이어폰을 끼고 플레이하고 있습니까?"]
    ],
    OFF_TOPIC: [
      ["off-snack", "이 방송을 보면서 야식을 먹고 있습니다."],
      ["off-time", "시간이 벌써 이렇게 늦은 줄 몰랐습니다."],
      ["off-sleep", "이 방송을 보고 나면 잠들기 어려울 것 같습니다."],
      ["off-chat", "오늘 채팅창도 평소보다 조용한 것 같습니다."]
    ],
    SUSPICION: [
      ["suspicion-target", "{target|이/가} 일부러 플레이어를 기다리는 것 같습니다."],
      ["suspicion-repeat", "방금 같은 장면을 이미 본 것 같습니다."],
      ["suspicion-chat", "채팅에 조금 이상한 사람이 있는 것 같습니다."],
      ["suspicion-room", "이 방의 구조가 계속 바뀌는 것 같습니다."]
    ]
  });

  const SHORT_LINES = Object.freeze({
    CHAT: ["무섭네", "분위기 뭐임", "오늘 재밌다", "ㄷㄷ"],
    ADVICE: ["왼쪽 봐", "문 닫아", "일단 저장", "배터리 아껴"],
    QUESTION: ["방금 봄?", "저거 뭐야", "길 맞아?", "있었나?"],
    EXCLAIM: ["와", "미쳤다", "ㄷㄷㄷ", "헉"],
    WARNING: ["뒤 뒤", "도망쳐", "오지 마", "문 닫아"],
    OBSERVE: ["뭐 지나감", "움직였어", "방금 소리", "저기 봐"],
    SCREAM: ["아아악", "뛰어", "안돼", "뒤에!!"],
    HINDSIGHT: ["아깝다", "늦었음", "그럴 줄", "아까 뛰지"],
    TEASE: ["ㅋㅋㅋㅋ", "또 속음", "겁먹었네", "귀신도 웃겠다"],
    REVIEW: ["판단 늦음", "길 잘못 감", "거의 잡힘", "다시 해보자"],
    STREAM_QUESTION: ["오늘 엔딩 봄?", "다음 겜 뭐임", "밝기 가능?", "안 무서움?"],
    OFF_TOPIC: ["배고프다", "벌써 이 시간", "잠 다 잤다", "채팅 조용하네"],
    SUSPICION: ["뭔가 이상함", "또 반복됨", "쟤 뭐임", "방 구조 바뀜"]
  });

  const SLOT_POOLS = Object.freeze({
    direction: ["왼쪽", "오른쪽", "뒤쪽", "복도 끝"],
    target: ["그림자", "인형", "괴물", "문"],
    location: ["복도", "지하실", "계단", "어두운 방"],
    item: ["손전등", "열쇠", "배터리", "회복 아이템"]
  });

  const SYNTHETIC_EVENTS = Object.freeze([
    { type: "SHADOW_MOVED", intensity: .45, slots: { direction: "왼쪽", target: "그림자", location: "복도" } },
    { type: "DOOR_OPENED", intensity: .58, slots: { direction: "뒤쪽", target: "문", location: "어두운 방" } },
    { type: "LOUD_NOISE", intensity: .72, slots: { direction: "오른쪽", target: "무언가", location: "계단" } },
    { type: "LIGHTS_OUT", intensity: .82, slots: { direction: "복도 끝", target: "그림자", location: "지하실" } },
    { type: "MONSTER_APPEARED", intensity: .95, slots: { direction: "뒤쪽", target: "괴물", location: "복도" } }
  ]);

  class SeededRandom {
    constructor(seed) {
      this.state = (Number(seed) >>> 0) || 0x6d2b79f5;
    }

    next() {
      this.state += 0x6d2b79f5;
      let value = this.state;
      value = Math.imul(value ^ (value >>> 15), value | 1);
      value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
      return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
    }

    range(min, max) {
      return min + this.next() * (max - min);
    }

    pick(items) {
      return items[Math.floor(this.next() * items.length)];
    }

    shuffle(items) {
      const output = [...items];
      for (let index = output.length - 1; index > 0; index -= 1) {
        const swapIndex = Math.floor(this.next() * (index + 1));
        [output[index], output[swapIndex]] = [output[swapIndex], output[index]];
      }
      return output;
    }

    weighted(entries) {
      const total = entries.reduce((sum, entry) => sum + Math.max(0, entry.weight), 0);
      if (!total) return entries[0]?.value;
      let cursor = this.range(0, total);
      for (const entry of entries) {
        cursor -= Math.max(0, entry.weight);
        if (cursor <= 0) return entry.value;
      }
      return entries.at(-1)?.value;
    }
  }

  class HorrorChatEngine {
    constructor(options) {
      this.viewers = options.viewers;
      this.onMessage = options.onMessage;
      this.onStateChange = options.onStateChange || (() => {});
      this.seed = Number(options.seed) >>> 0;
      this.random = new SeededRandom(this.seed);
      this.syntheticEvents = options.syntheticEvents !== false;
      this.externalContext = options.externalContext || {
        startedAt: Date.now(),
        initiallyFocused: typeof document === "undefined" ? true : document.hasFocus()
      };

      this.simTime = 0;
      this.tension = 0;
      this.state = "AMBIENT";
      this.lastEventAt = 0;
      this.burstUntil = 0;
      this.aftermathUntil = 0;
      this.queue = [];
      this.ambientQueued = false;
      this.futureEvent = null;
      this.timer = null;
      this.paused = false;
      this.running = false;
      this.lastSpeakerId = null;
      this.intentLastAt = new Map();
      this.recentOutputs = [];
      this.recentTemplates = [];
      this.recentSignatures = [];
      this.recentSemanticMessages = [];
      this.scene = { direction: "왼쪽", target: "문", location: "복도", item: "손전등" };
      this.debug = {
        speakerSelections: [],
        filterRejects: { exact: 0, template: 0, signature: 0, similarity: 0 },
        fallbackCount: 0,
        outputCount: 0,
        stateTransitions: [{ at: 0, state: "AMBIENT" }]
      };

      this.assignViewerModels();
    }

    assignViewerModels() {
      const personaKeys = this.random.shuffle(Object.keys(PERSONAS));
      const anomalyPermissions = this.random.shuffle(["PROPHECY", "OBSERVER", "PROPHECY"]);
      let anomalyIndex = 0;
      this.viewers.forEach((viewer, index) => {
        viewer.personaKey = personaKeys[index % personaKeys.length];
        viewer.memorySlots = {};
        viewer.lastSpokeAt = -60000 - index * 1000;
        viewer.lastObservedAt = -60000;
        viewer.engineSpeechCount = 0;
        viewer.anomalyLevel = viewer.anomalous ? 1 : 0;
        viewer.anomalyPermission = viewer.anomalous ? anomalyPermissions[anomalyIndex++] : null;
      });
    }

    start() {
      if (this.running) return;
      this.running = true;
      this.planFutureEvent();
      this.bootstrapMessages();
      this.enqueueAmbient(900);
      this.timer = window.setInterval(() => this.tick(), TUNING.tickMs);
    }

    stop() {
      this.running = false;
      window.clearInterval(this.timer);
      this.timer = null;
      this.queue.length = 0;
    }

    setPaused(paused) {
      this.paused = Boolean(paused);
    }

    tick() {
      if (!this.running || this.paused) return;
      this.simTime += TUNING.tickMs;
      const decayRate = Math.log(2) / TUNING.tensionHalfLifeMs;
      this.tension *= Math.exp(-decayRate * TUNING.tickMs);

      if (this.futureEvent && this.futureEvent.scheduledAt <= this.simTime) {
        const event = this.futureEvent;
        this.futureEvent = null;
        this.emitEvent(event.type, event.slots, event.intensity);
        this.planFutureEvent();
      }

      this.updateDirectorState();
      const due = [];
      while (this.queue.length && this.queue[0].scheduledAt <= this.simTime) due.push(this.queue.shift());
      due.sort((left, right) => right.priority - left.priority || left.scheduledAt - right.scheduledAt);
      due.forEach(request => {
        if (request.source === "ambient") this.ambientQueued = false;
        this.processRequest(request);
      });
      if (!this.ambientQueued) this.enqueueAmbient();
    }

    updateDirectorState() {
      let nextState = "AMBIENT";
      if (this.simTime < this.burstUntil) nextState = "BURST";
      else if (this.simTime < this.aftermathUntil) nextState = "AFTERMATH";
      else if (this.simTime - this.lastEventAt > TUNING.lullAfterMs) nextState = "LULL";
      else if (this.tension > TUNING.tenseThreshold) nextState = "TENSE";

      if (nextState !== this.state) {
        this.state = nextState;
        this.debug.stateTransitions.push({ at: this.simTime, state: nextState });
        this.debug.stateTransitions = this.debug.stateTransitions.slice(-30);
        this.onStateChange({ state: nextState, tension: this.tension });
      }
    }

    enqueue(request) {
      this.queue.push({ priority: 1, threadId: null, ...request });
      this.queue.sort((left, right) => left.scheduledAt - right.scheduledAt || right.priority - left.priority);
    }

    enqueueAmbient(delay) {
      if (this.ambientQueued) return;
      const interval = TUNING.intervals[this.state];
      const wait = delay ?? this.random.range(interval[0], interval[1]);
      this.enqueue({
        intent: this.chooseIntent(this.state),
        scheduledAt: this.simTime + wait,
        source: "ambient",
        priority: 1,
        slotHints: {}
      });
      this.ambientQueued = true;
    }

    chooseIntent(state) {
      const weights = TUNING.stateIntents[state];
      const entries = Object.entries(weights).map(([intent, weight]) => {
        const elapsed = this.simTime - (this.intentLastAt.get(intent) ?? -60000);
        const cooldownFactor = Math.min(1, Math.max(.18, elapsed / TUNING.intentCooldownMs));
        return { value: intent, weight: weight * cooldownFactor };
      });
      return this.random.weighted(entries);
    }

    emitEvent(type, slots = {}, intensityOverride) {
      const preset = SYNTHETIC_EVENTS.find(event => event.type === type);
      const intensity = Math.min(1, Math.max(0, intensityOverride ?? preset?.intensity ?? .5));
      const mergedSlots = { ...(preset?.slots || {}), ...slots };
      this.scene = { ...this.scene, ...mergedSlots };
      this.lastEventAt = this.simTime;
      this.tension = Math.min(1, this.tension + intensity);

      if (intensity >= .7) {
        this.burstUntil = Math.max(this.burstUntil, this.simTime + TUNING.burstDurationMs);
        this.aftermathUntil = this.burstUntil + TUNING.aftermathDurationMs;
      }

      const count = 2 + Math.ceil(intensity * 3);
      for (let index = 0; index < count; index += 1) {
        const intent = intensity >= .7
          ? this.random.weighted([{ value: "SCREAM", weight: 5 }, { value: "EXCLAIM", weight: 3 }, { value: "WARNING", weight: 2 }])
          : this.random.weighted([{ value: "OBSERVE", weight: 4 }, { value: "WARNING", weight: 3 }, { value: "QUESTION", weight: 2 }]);
        this.enqueue({
          intent,
          eventRef: { type, happenedAt: this.simTime },
          slotHints: mergedSlots,
          scheduledAt: this.simTime + this.random.range(80, 1150),
          source: "event",
          priority: intensity >= .7 ? 3 : 2
        });
      }
      this.updateDirectorState();
    }

    planFutureEvent() {
      if (!this.syntheticEvents || this.futureEvent) return;
      const event = this.random.pick(SYNTHETIC_EVENTS);
      this.futureEvent = {
        ...event,
        slots: { ...event.slots },
        scheduledAt: this.simTime + this.random.range(8500, 14500)
      };
    }

    chooseSpeaker(intent, forcedSpeakerId) {
      if (forcedSpeakerId) return this.viewers.find(viewer => viewer.id === forcedSpeakerId && viewer.active);
      const active = this.viewers.filter(viewer => viewer.active);
      const alternatives = active.filter(viewer => viewer.id !== this.lastSpeakerId);
      const candidates = alternatives.length ? alternatives : active;
      const scored = candidates.map(viewer => {
        const persona = PERSONAS[viewer.personaKey];
        const elapsed = Math.max(0, this.simTime - viewer.lastSpokeAt);
        const fit = persona.fit[intent] ?? 1;
        const cooldown = Math.min(1, elapsed / persona.cooldownMs);
        const silence = Math.min(2.25, 1 + elapsed / 60000);
        const tension = 1 + this.tension * (persona.tensionResponse - 1);
        const weight = persona.desire * fit * Math.max(.04, cooldown) * silence * tension;
        return { viewer, weight, factors: { desire: persona.desire, fit, cooldown, silence, tension } };
      });
      const selected = this.random.weighted(scored.map(entry => ({ value: entry.viewer, weight: entry.weight })));
      this.debug.speakerSelections.push({
        at: this.simTime,
        intent,
        selected: selected?.id,
        candidates: scored.map(entry => ({ id: entry.viewer.id, weight: Number(entry.weight.toFixed(3)), ...entry.factors }))
      });
      this.debug.speakerSelections = this.debug.speakerSelections.slice(-20);
      return selected;
    }

    processRequest(originalRequest, options = {}) {
      const request = { ...originalRequest };
      if (this.simTime - request.scheduledAt > TUNING.requestExpiryMs && ["WARNING", "SCREAM"].includes(request.intent)) {
        request.intent = "HINDSIGHT";
      }

      const viewer = this.chooseSpeaker(request.intent, request.forcedSpeakerId);
      if (!viewer) return;
      let utterance;
      for (let attempt = 0; attempt < TUNING.maxGenerationRetries; attempt += 1) {
        const candidate = this.generateCandidate(viewer, request);
        const rejection = this.findRejection(candidate);
        if (!rejection || options.skipFilters) {
          utterance = candidate;
          break;
        }
        this.debug.filterRejects[rejection] += 1;
      }

      if (!utterance) {
        this.debug.fallbackCount += 1;
        utterance = this.generateShortCandidate(viewer, request.intent, request.slotHints, true);
      }

      this.recordUtterance(viewer, request, utterance, options);
    }

    generateCandidate(viewer, request) {
      const anomalyOverride = this.createAnomalyOverride(viewer, request);
      if (anomalyOverride) return anomalyOverride;

      const persona = PERSONAS[viewer.personaKey];
      const anomalyFactor = viewer.anomalous ? 1 - viewer.anomalyLevel / TUNING.maxAnomalyLevel : 1;
      const shortChance = Math.min(.9, persona.shortChance * (1 + this.tension * 1.5) * (viewer.anomalous ? anomalyFactor : 1));
      if (this.random.next() < shortChance) return this.generateShortCandidate(viewer, request.intent, request.slotHints);

      const templates = TEMPLATES[request.intent] || TEMPLATES.CHAT;
      const [templateId, template] = this.random.pick(templates);
      const slots = {};
      const standardText = template.replace(/\{([^}|]+)(?:\|([^}]+))?\}/g, (_, slotName, particle) => {
        const value = this.resolveSlot(slotName, request.slotHints, viewer);
        slots[slotName] = value;
        return particle ? this.attachParticle(value, particle) : value;
      });
      const text = this.transformStyle(standardText, viewer);
      return { text, standardText, templateId, signature: this.signature(templateId, slots), slots, short: false };
    }

    generateShortCandidate(viewer, intent, slotHints = {}, fallback = false) {
      const pool = SHORT_LINES[intent] || SHORT_LINES.EXCLAIM;
      const unusedPool = fallback ? pool.filter(line => !this.recentOutputs.includes(line)) : pool;
      let text = this.random.pick(unusedPool.length ? unusedPool : pool);
      if (fallback && this.recentOutputs.includes(text)) text += this.random.next() < .5 ? "!" : "?";
      if (!fallback && !viewer.anomalous && PERSONAS[viewer.personaKey].style.repeat > .6 && this.random.next() < .35) {
        text += this.random.next() < .5 ? "ㅋㅋ" : "!!";
      }
      return {
        text,
        standardText: text,
        templateId: `short:${intent}:${pool.indexOf(text)}`,
        signature: `short:${intent}:${text}`,
        slots: { ...slotHints },
        short: true
      };
    }

    createAnomalyOverride(viewer, request) {
      if (!viewer.anomalous || viewer.anomalyLevel < 2) return null;
      const chance = { 2: .22, 3: .5, 4: .78 }[viewer.anomalyLevel];
      if (this.random.next() >= chance) return null;

      if (viewer.anomalyPermission === "PROPHECY" && this.futureEvent) {
        const target = this.futureEvent.slots.target || "무언가";
        const direction = this.futureEvent.slots.direction || "뒤쪽";
        const seconds = Math.max(1, Math.ceil((this.futureEvent.scheduledAt - this.simTime) / 1000));
        const standardText = `${seconds}초 뒤에 ${direction}에서 ${this.attachParticle(target, "이/가")} 나타날 것입니다.`;
        return {
          text: this.transformStyle(standardText, viewer),
          standardText,
          templateId: "anomaly:prophecy",
          signature: `anomaly:prophecy:${target}:${direction}:${seconds}`,
          slots: { target, direction },
          short: false,
          anomalyEvidence: "PROPHECY"
        };
      }

      if (viewer.anomalyPermission === "OBSERVER") {
        const elapsedSeconds = Math.floor(this.simTime / 1000);
        const startedAt = new Date(this.externalContext.startedAt);
        const time = `${String(startedAt.getHours()).padStart(2, "0")}시 ${String(startedAt.getMinutes()).padStart(2, "0")}분`;
        const standardText = this.random.next() < .5
          ? `방송을 시작한 지 정확히 ${elapsedSeconds}초가 지났습니다.`
          : `당신이 이 창을 연 시각은 ${time}입니다.`;
        return {
          text: this.transformStyle(standardText, viewer),
          standardText,
          templateId: "anomaly:observer",
          signature: `anomaly:observer:${Math.floor(elapsedSeconds / 5)}`,
          slots: {},
          short: false,
          anomalyEvidence: "OBSERVER"
        };
      }
      return null;
    }

    resolveSlot(name, hints, viewer) {
      const value = hints?.[name] ?? viewer.memorySlots[name] ?? this.scene[name] ?? this.random.pick(SLOT_POOLS[name] || ["무언가"]);
      viewer.memorySlots[name] = value;
      return value;
    }

    attachParticle(value, pair) {
      const lastCharacter = String(value).at(-1);
      const code = lastCharacter?.charCodeAt(0) ?? 0;
      const isHangul = code >= 0xac00 && code <= 0xd7a3;
      const finalConsonant = isHangul ? (code - 0xac00) % 28 : 0;
      if (pair === "으로/로") return `${value}${finalConsonant !== 0 && finalConsonant !== 8 ? "으로" : "로"}`;
      const [withConsonant, withoutConsonant] = pair.split("/");
      return `${value}${finalConsonant ? withConsonant : withoutConsonant}`;
    }

    transformStyle(input, viewer) {
      const persona = PERSONAS[viewer.personaKey];
      const factor = viewer.anomalous ? Math.max(0, 1 - viewer.anomalyLevel / TUNING.maxAnomalyLevel) : 1;
      const fires = key => this.random.next() < persona.style[key] * factor;
      let text = input;

      if (fires("casual")) text = this.casualize(text);
      if (fires("particle")) {
        text = text.replace(/(\S+?)(은|는|이|가|을|를|에서|으로|도)(?=\s)/g, (match, stem) => this.random.next() < .62 ? stem : match);
      }
      if (fires("ending")) {
        text = text
          .replace(/거 같아\./g, "거 같음.")
          .replace(/해야 해\./g, "해야 됨.")
          .replace(/좋겠어\./g, "좋을 듯.")
          .replace(/있어\?/g, "있음?")
          .replace(/했어\./g, "했음.")
          .replace(/보여\./g, "보임.");
      }
      if (fires("spacing")) {
        text = text.split(" ").reduce((result, word) => result + (result && this.random.next() < .38 ? "" : " ") + word, "").trim();
      }
      if (fires("punctuation")) text = text.replace(/[.!]+$/g, "");
      if (fires("abbreviation")) {
        text = text
          .replace(/정말/g, "ㄹㅇ")
          .replace(/괜찮아/g, "ㄱㅊ")
          .replace(/그렇지/g, "ㅇㅇ")
          .replace(/깜짝 놀랐/g, "놀랐");
      }
      if (fires("repeat")) {
        if (text.endsWith("?")) text += "?";
        else if (viewer.personaKey === "COWARD") text += "ㅠㅠ";
        else text += viewer.personaKey === "JOKER" ? "ㅋㅋㅋ" : "!!";
      }
      if (fires("typo")) {
        const typos = [["지금", "지굼"], ["왼쪽", "왼쪾"], ["무서", "무셔"], ["문", "뮨"], ["뒤", "듸"]];
        const [from, to] = this.random.pick(typos);
        text = text.replace(from, to);
      }
      return text.trim();
    }

    casualize(text) {
      return text
        .replace(/무섭습니다/g, "무서워")
        .replace(/불안합니다/g, "불안해")
        .replace(/하지 않았습니까\?/g, "하지 않았어?")
        .replace(/있지 않았습니까\?/g, "있지 않았어?")
        .replace(/들리지 않았습니까\?/g, "들리지 않았어?")
        .replace(/있습니까\?/g, "있어?")
        .replace(/것입니까\?/g, "거야?")
        .replace(/예정입니까\?/g, "예정이야?")
        .replace(/수 있습니까\?/g, "수 있어?")
        .replace(/것 같습니다\./g, "거 같아.")
        .replace(/해야 합니다\./g, "해야 해.")
        .replace(/하는 것이 좋겠습니다\./g, "하는 게 좋겠어.")
        .replace(/보입니다\./g, "보여.")
        .replace(/있었습니다\./g, "있었어.")
        .replace(/했습니다\./g, "했어.")
        .replace(/됩니다\./g, "돼.")
        .replace(/입니다\./g, "이야.")
        .replace(/있습니다!/g, "있어!")
        .replace(/했습니다!/g, "했어!")
        .replace(/됩니다!/g, "돼!")
        .replace(/입니다!/g, "이야!")
        .replace(/습니다!/g, "어!")
        .replace(/습니다\./g, "어.");
    }

    findRejection(candidate) {
      if (this.recentOutputs.includes(candidate.text)) return "exact";
      if (this.recentTemplates.slice(-8).includes(candidate.templateId)) return "template";
      if (this.recentSignatures.slice(-25).includes(candidate.signature)) return "signature";
      const normalized = this.normalizeForSimilarity(candidate.text);
      if (this.recentSemanticMessages.slice(-15).some(previous => this.jaccardBigrams(normalized, previous) > TUNING.similarityThreshold)) return "similarity";
      return null;
    }

    normalizeForSimilarity(text) {
      return text.normalize("NFKD").replace(/[\s\p{P}\p{S}]/gu, "").toLowerCase();
    }

    jaccardBigrams(left, right) {
      const toBigrams = value => {
        const set = new Set();
        for (let index = 0; index < value.length - 1; index += 1) set.add(value.slice(index, index + 2));
        return set;
      };
      const leftSet = toBigrams(left);
      const rightSet = toBigrams(right);
      if (!leftSet.size && !rightSet.size) return 1;
      let intersection = 0;
      leftSet.forEach(value => { if (rightSet.has(value)) intersection += 1; });
      return intersection / (leftSet.size + rightSet.size - intersection || 1);
    }

    signature(templateId, slots) {
      return `${templateId}:${Object.entries(slots).map(([key, value]) => `${key}=${value}`).join("|")}`;
    }

    recordUtterance(viewer, request, utterance, options) {
      viewer.lastSpokeAt = this.simTime;
      viewer.engineSpeechCount += 1;
      if (!options.historyOnly) {
        this.lastSpeakerId = viewer.id;
        this.intentLastAt.set(request.intent, this.simTime);
        this.recentOutputs.push(utterance.text);
        this.recentTemplates.push(utterance.templateId);
        this.recentSignatures.push(utterance.signature);
        this.recentSemanticMessages.push(this.normalizeForSimilarity(utterance.standardText));
        this.recentOutputs = this.recentOutputs.slice(-40);
        this.recentTemplates = this.recentTemplates.slice(-12);
        this.recentSignatures = this.recentSignatures.slice(-25);
        this.recentSemanticMessages = this.recentSemanticMessages.slice(-15);
        this.debug.outputCount += 1;
      }

      if (viewer.anomalous && !options.historyOnly && this.state !== "BURST" && viewer.engineSpeechCount % TUNING.anomalySpeechStep === 0) {
        viewer.anomalyLevel = Math.min(TUNING.maxAnomalyLevel, viewer.anomalyLevel + 1);
      }

      this.onMessage({
        viewer,
        text: utterance.text,
        standardText: utterance.standardText,
        intent: request.intent,
        state: this.state,
        tension: this.tension,
        anomalyEvidence: utterance.anomalyEvidence || null,
        historyOnly: Boolean(options.historyOnly),
        behavior: options.behavior || "smooth"
      });
    }

    bootstrapMessages() {
      this.viewers.forEach(viewer => {
        this.processRequest({ intent: "CHAT", scheduledAt: this.simTime, forcedSpeakerId: viewer.id, slotHints: {}, source: "bootstrap" }, { historyOnly: true, skipFilters: true, behavior: "auto" });
      });
      this.random.shuffle(this.viewers).forEach(viewer => {
        this.processRequest({ intent: this.chooseIntent("AMBIENT"), scheduledAt: this.simTime, forcedSpeakerId: viewer.id, slotHints: {}, source: "bootstrap" }, { behavior: "auto" });
      });
      this.random.shuffle(this.viewers.filter(viewer => viewer.anomalous)).slice(0, 2).forEach(viewer => {
        this.processRequest({ intent: "OBSERVE", scheduledAt: this.simTime, forcedSpeakerId: viewer.id, slotHints: {}, source: "bootstrap" }, { behavior: "auto" });
      });
    }

    observeViewer(viewerId) {
      const viewer = this.viewers.find(candidate => candidate.id === viewerId && candidate.active);
      if (!viewer?.anomalous || this.state === "BURST" || this.paused || this.simTime - viewer.lastObservedAt < 5000) return;
      viewer.lastObservedAt = this.simTime;
      viewer.anomalyLevel = Math.min(TUNING.maxAnomalyLevel, viewer.anomalyLevel + 1);
    }

    getDebugSnapshot() {
      return {
        seed: this.seed,
        simTime: this.simTime,
        tension: Number(this.tension.toFixed(4)),
        state: this.state,
        queueLength: this.queue.length,
        nextFutureEvent: this.futureEvent ? { type: this.futureEvent.type, scheduledAt: this.futureEvent.scheduledAt, slots: { ...this.futureEvent.slots } } : null,
        viewers: this.viewers.map(viewer => ({
          id: viewer.id,
          name: viewer.name,
          persona: viewer.personaKey,
          active: viewer.active,
          anomalous: viewer.anomalous,
          anomalyPermission: viewer.anomalyPermission,
          anomalyLevel: viewer.anomalyLevel,
          speechCount: viewer.engineSpeechCount
        })),
        debug: JSON.parse(JSON.stringify(this.debug))
      };
    }
  }

  window.HorrorChatEngine = HorrorChatEngine;
  window.HORROR_CHAT_TUNING = TUNING;
})();
