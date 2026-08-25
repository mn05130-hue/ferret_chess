"use strict";

// Scheduling, director state, speaker selection, and event intake.
class HorrorChatEngine {
  constructor(options) {
    this.viewers = options.viewers;
    this.onMessage = options.onMessage;
    this.onStateChange = options.onStateChange || (() => {});
    this.seed = Number(options.seed) >>> 0;
    this.random = new SeededRandom(this.seed);
    this.difficulty = Math.min(3, Math.max(1, Number(options.difficulty) || 1));
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
    this.scene = { topic: "어제 얘기", food: "치킨", thing: "마이크", day: "어제" };
    this.debug = {
      speakerSelections: [],
      filterRejects: { exact: 0, template: 0, signature: 0, similarity: 0 },
      fallbackCount: 0,
      outputCount: 0,
      shortCount: 0,
      anomalyCount: 0,
      totalWords: 0,
      formalLeaks: 0,
      stateTransitions: [{ at: 0, state: "AMBIENT" }]
    };

    this.assignViewerModels();
  }

  assignViewerModels() {
    const personaKeys = this.random.shuffle(Object.keys(PERSONAS));
    const permissions = this.random.shuffle([...ANOMALY_PERMISSIONS]);
    let anomalyIndex = 0;
    this.viewers.forEach((viewer, index) => {
      viewer.personaKey = personaKeys[index % personaKeys.length];
      viewer.memorySlots = {};
      viewer.lastSpokeAt = -60000 - index * 1000;
      viewer.lastObservedAt = -60000;
      viewer.engineSpeechCount = 0;
      viewer.anomalyLevel = viewer.anomalous ? 1 : 0;
      viewer.anomalyPermission = viewer.anomalous
        ? permissions[anomalyIndex++ % permissions.length]
        : null;
    });
  }

  /* ---------- 수명 주기 ---------- */

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

  /* ---------- 큐 ---------- */

  enqueue(request) {
    this.queue.push({ priority: 1, threadId: null, ...request });
    this.queue.sort((left, right) => left.scheduledAt - right.scheduledAt || right.priority - left.priority);
  }

  enqueueAmbient(delay) {
    if (this.ambientQueued) return;
    const interval = TUNING.intervals[this.state];
    const wait = (delay ?? this.random.range(interval[0], interval[1])) / this.difficulty;
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
        ? this.random.weighted([
            { value: "LAUGH", weight: 5 },
            { value: "REACT", weight: 3 },
            { value: "TEASE", weight: 2 }
          ])
        : this.random.weighted([
            { value: "REACT", weight: 4 },
            { value: "AGREE", weight: 3 },
            { value: "QUESTION", weight: 2 }
          ]);
      this.enqueue({
        intent,
        eventRef: { type, happenedAt: this.simTime },
        slotHints: mergedSlots,
        scheduledAt: this.simTime + this.random.range(80, 1150) / Math.sqrt(this.difficulty),
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
      scheduledAt: this.simTime + this.random.range(8500, 15000) / this.difficulty
    };
  }

  /* ---------- 화자 선택 ---------- */

  chooseSpeaker(intent, forcedSpeakerId) {
    if (forcedSpeakerId) return this.viewers.find(viewer => viewer.id === forcedSpeakerId && viewer.active);
    const active = this.viewers.filter(viewer => viewer.active);
    if (!active.length) return null;
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
      candidates: scored.map(entry => ({
        id: entry.viewer.id,
        weight: Number(entry.weight.toFixed(3)),
        ...entry.factors
      }))
    });
    this.debug.speakerSelections = this.debug.speakerSelections.slice(-20);
    return selected;
  }

}
