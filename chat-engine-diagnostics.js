"use strict";

// Duplicate filtering, utterance history, bootstrap, observation, and debug state.
HorrorChatEngine = class HorrorChatEngineDiagnostics extends HorrorChatEngine {
  findRejection(candidate) {
    if (this.recentOutputs.includes(candidate.text)) return "exact";
    if (this.recentTemplates.slice(-8).includes(candidate.templateId)) return "template";
    if (this.recentSignatures.slice(-25).includes(candidate.signature)) return "signature";
    // 변형 이전 형태끼리 비교해야 표기만 다른 같은 문장을 잡을 수 있습니다.
    const normalized = this.normalizeForSimilarity(candidate.standardText);
    const isSimilar = this.recentSemanticMessages
      .slice(-15)
      .some(previous => this.jaccardBigrams(normalized, previous) > TUNING.similarityThreshold);
    if (isSimilar) return "similarity";
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

  /* ---------- 기록 및 출력 ---------- */

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
      this.debug.totalWords += utterance.text.split(/\s+/).filter(Boolean).length;
      if (utterance.short) this.debug.shortCount += 1;
      if (utterance.anomaly) this.debug.anomalyCount += 1;
    }

    // 발화가 누적될수록 anomalyLevel이 올라가고, 다음 이상 채팅의 출현 빈도만 증가합니다.
    const anomalySpeechStep = Math.max(1, Math.round(TUNING.anomalySpeechStep / this.difficulty));
    if (viewer.anomalous && !options.historyOnly && this.state !== "BURST"
        && viewer.engineSpeechCount % anomalySpeechStep === 0) {
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
      anomalyMode: utterance.anomalyMode || null,
      anomalyLineId: utterance.anomalyLineId || null,
      historyOnly: Boolean(options.historyOnly),
      behavior: options.behavior || "smooth"
    });
  }

  bootstrapMessages() {
    // 채팅창을 켰을 때 이미 굴러가고 있던 것처럼 보이게 하는 초기 로그
    this.viewers.forEach(viewer => {
      if (viewer.anomalous) {
        for (let index = 0; index < 3; index += 1) {
          const anomalyHistory = this.createAnomalyOverride(viewer, true);
          if (!anomalyHistory) continue;
          this.recordUtterance(
            viewer,
            { intent: "CHAT", scheduledAt: this.simTime, source: "anomaly-history" },
            anomalyHistory,
            { historyOnly: true, behavior: "auto" }
          );
        }
        return;
      }
      this.processRequest(
        { intent: "GREET", scheduledAt: this.simTime, forcedSpeakerId: viewer.id, slotHints: {}, source: "bootstrap" },
        { historyOnly: true, skipFilters: true, behavior: "auto" }
      );
    });
    this.random.shuffle(this.viewers).forEach(viewer => {
      this.processRequest(
        { intent: this.chooseIntent("AMBIENT"), scheduledAt: this.simTime, forcedSpeakerId: viewer.id, slotHints: {}, source: "bootstrap" },
        { behavior: "auto" }
      );
    });
    this.random.shuffle(this.viewers.filter(viewer => viewer.anomalous)).slice(0, 2).forEach(viewer => {
      this.processRequest(
        { intent: "CHAT", scheduledAt: this.simTime, forcedSpeakerId: viewer.id, slotHints: {}, source: "bootstrap" },
        { behavior: "auto" }
      );
    });
  }

  observeViewer(viewerId) {
    const viewer = this.viewers.find(candidate => candidate.id === viewerId && candidate.active);
    if (!viewer?.anomalous || this.state === "BURST" || this.paused) return;
    if (this.simTime - viewer.lastObservedAt < 5000) return;
    viewer.lastObservedAt = this.simTime;
    viewer.anomalyLevel = Math.min(TUNING.maxAnomalyLevel, viewer.anomalyLevel + 1);
  }

  /* ---------- 디버그 ---------- */

  getDebugSnapshot() {
    const outputs = this.debug.outputCount || 1;
    return {
      seed: this.seed,
      difficulty: Number(this.difficulty.toFixed(2)),
      simTime: this.simTime,
      tension: Number(this.tension.toFixed(4)),
      state: this.state,
      queueLength: this.queue.length,
      style: {
        averageWords: Number((this.debug.totalWords / outputs).toFixed(2)),
        shortRatio: Number((this.debug.shortCount / outputs).toFixed(2)),
        anomalyRatio: Number((this.debug.anomalyCount / outputs).toFixed(2)),
        fallbackRatio: Number((this.debug.fallbackCount / outputs).toFixed(2)),
        formalLeaks: this.debug.formalLeaks
      },
      nextFutureEvent: this.futureEvent
        ? {
            type: this.futureEvent.type,
            scheduledAt: this.futureEvent.scheduledAt,
            omen: this.futureEvent.omen,
            slots: { ...this.futureEvent.slots }
          }
        : null,
      viewers: this.viewers.map(viewer => ({
        id: viewer.id,
        name: viewer.name,
        persona: viewer.personaKey,
        label: PERSONAS[viewer.personaKey].label,
        active: viewer.active,
        anomalous: viewer.anomalous,
        anomalyPermission: viewer.anomalyPermission,
        anomalyLevel: viewer.anomalyLevel,
        speechCount: viewer.engineSpeechCount
      })),
      debug: JSON.parse(JSON.stringify(this.debug))
    };
  }
};
