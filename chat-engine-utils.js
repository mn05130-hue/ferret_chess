"use strict";

// Deterministic text helpers and seeded random number generation.
// "아" → "ㅇㅏ"처럼 첫 글자를 자모로 흘리는 오타를 만듭니다.
function spillFirstSyllable(text) {
  if (!text) return text;
  const code = text.charCodeAt(0) - 0xac00;
  if (code < 0 || code > 11171) return text;
  if (code % 28 !== 0) return text;              // 받침 있으면 건드리지 않음
  const cho = Math.floor(code / 588);
  const jung = Math.floor((code % 588) / 28);
  return CHOSEONG[cho] + JUNGSEONG[jung] + text.slice(1);
}

/* ==========================================================================
 * 8. 시드 난수
 * ======================================================================== */
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
