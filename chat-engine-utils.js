"use strict";

// Deterministic text helpers and seeded random number generation.
// "아" → "ㅇㅏ"처럼 첫 글자를 자모로 흘리는 오타를 만듭니다.
/**
 * 받침 없는 첫 한글 음절을 초성·중성으로 풀어 실제 채팅에서 보이는 자모 오타를 만듭니다.
 */
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
  /**
   * 0도 유효한 입력으로 받아 내부 32비트 난수 상태를 초기화합니다.
   */
  constructor(seed) {
    this.state = (Number(seed) >>> 0) || 0x6d2b79f5;
  }

  /**
   * Mulberry32 계열 연산으로 0 이상 1 미만의 다음 결정론적 난수를 반환합니다.
   */
  next() {
    this.state += 0x6d2b79f5;
    let value = this.state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  }

  /**
   * 두 경계 사이의 실수 난수를 반환해 시간 간격과 확률 선택에 사용합니다.
   */
  range(min, max) {
    return min + this.next() * (max - min);
  }

  /**
   * 배열에서 난수 위치의 항목 하나를 반환합니다.
   */
  pick(items) {
    return items[Math.floor(this.next() * items.length)];
  }

  /**
   * 입력 배열을 수정하지 않고 결정론적인 순서로 섞은 사본을 반환합니다.
   */
  shuffle(items) {
    const output = [...items];
    for (let index = output.length - 1; index > 0; index -= 1) {
      const swapIndex = Math.floor(this.next() * (index + 1));
      [output[index], output[swapIndex]] = [output[swapIndex], output[index]];
    }
    return output;
  }

  /**
   * 가중치 합에서 난수 커서를 차감해 확률에 비례하는 항목을 선택합니다.
   */
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
