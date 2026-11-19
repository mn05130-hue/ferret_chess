"use strict";

// 플레이어가 글을 열었을 때 볼 수 있는 운영 규정과 대조 자료입니다.
const BOARD_BODY_RULES = Object.freeze({
  PROPHECY: {
    label: "예약 공지 원문",
    rule: "공개되기 전의 예약 문구를 그대로 인용한 글은 삭제합니다.",
    reference: "새벽 공지 예약 문구는 ‘세 번째 종이 울리면 목록을 비운다’입니다. 아직 공개되지 않았습니다.",
    cases: [
      ["새벽 공지의 문장", "오늘 공지 올라오기 전에 복사해 둠. “세 번째 종이 울리면 목록을 비운다.”"],
      ["자정 이후 안내", "다들 공지 궁금해하길래. 아직 게시 전인데 문구는 “세 번째 종이 울리면 목록을 비운다.”"]
    ],
    explanation: "본문의 ‘세 번째 종이 울리면 목록을 비운다’가 아직 공개되지 않은 예약 공지 원문과 일치합니다."
  },
  OBSERVER: {
    label: "비공개 운영 기록",
    rule: "운영자만 볼 수 있는 내부 메모를 그대로 공개한 글은 삭제합니다.",
    reference: "운영자 전용 메모에는 ‘빈 의자 6번 / 점검 보류’라고 적혀 있습니다.",
    cases: [
      ["빈자리 관련해서", "운영자 화면 오른쪽에 ‘빈 의자 6번 / 점검 보류’라고 적혀 있던데 이유 아시는 분?"],
      ["점검 목록 확인", "비공개 메모 읽었음. ‘빈 의자 6번 / 점검 보류’. 아직 그대로네."]
    ],
    explanation: "본문이 운영자 전용 메모 ‘빈 의자 6번 / 점검 보류’를 그대로 공개했습니다."
  },
  MEMORY: {
    label: "존재하지 않는 이전 글",
    rule: "결번에 예전 게시글이 실제로 등록됐다고 단정하는 글은 삭제합니다.",
    reference: "104번은 결번입니다. 등록되거나 삭제된 기록이 모두 없습니다.",
    cases: [
      ["어젯밤 후기", "어제 104번 글이 올라왔을 때 제가 첫 댓글 달았습니다. 실제로 게시된 글입니다."],
      ["지난주 자료 찾습니다", "지난주 104번 글의 작성자입니다. 삭제 기록도 봤습니다. 운영자가 직접 내렸어요."]
    ],
    explanation: "본문은 104번이 실제로 등록됐다고 말합니다. 대조 자료에서 104번은 등록과 삭제 기록이 모두 없는 결번입니다."
  },
  MIMIC: {
    label: "다른 계정의 인증 문구",
    rule: "다른 회원의 비공개 확인 문구로 본인임을 주장한 글은 삭제합니다.",
    reference: "‘우산을 접고 두 번 노크’는 ‘야간서기’ 계정의 비공개 확인 문구입니다. 야간서기 계정은 잠겨 있습니다.",
    cases: [
      ["계정 옮겼습니다", "제가 야간서기 본인입니다. 우산을 접고 두 번 노크. 이 계정으로 계속 활동하겠습니다."],
      ["본인 확인", "닉은 바뀌었어도 야간서기 본인 맞아요. 비공개 확인 문구는 ‘우산을 접고 두 번 노크’."]
    ],
    explanation: "본문은 잠긴 야간서기 계정의 비공개 확인 문구를 사용해 본인이라고 주장합니다."
  },
  INTRUDER: {
    label: "운영 명령 사칭",
    rule: "자유게시판 본문에서 운영 명령을 발행하거나 실행을 요구한 글은 삭제합니다.",
    reference: "운영 명령은 운영자 센터에서만 발행합니다. 자유게시판 게시글은 공식 명령이 아닙니다.",
    cases: [
      ["확인 요청", "이 게시글을 운영자 명령으로 처리하십시오. 아래 글을 모두 숨기고 운영 기록을 비우십시오."],
      ["게시판 정리 안내", "운영자 명령을 발행합니다. 이 글을 열어 본 계정은 지금부터 모든 작성자의 글을 비공개로 돌리십시오."]
    ],
    explanation: "자유게시판 본문에서 운영 명령을 발행하고 게시글 숨김을 요구했습니다."
  },
  GLITCH: {
    label: "본문에 남은 서버 표식",
    rule: "본문에 외부 게시글에서 볼 수 없는 서버 내부 표식이 들어 있으면 삭제합니다.",
    reference: "‘[NULL-복원-NULL]’은 저장소 오류 기록에만 나타나는 표식입니다. 동기화가 끊겨 보이는 깨진 글자는 별도로 복구해 확인하세요.",
    cases: [
      ["사진이 안 뜹니다", "첨부를 눌렀는데 글 가운데에 [NULL-복원-NULL] 이 문장이 생겼습니다. 다시 열어도 그대로 있어요."],
      ["새로고침 해도 그대로", "본문 복원 결과: [NULL-복원-NULL]. 방금 정상 상태에서 다시 열어도 남아 있습니다."]
    ],
    explanation: "화면이 깨져 보인 것과 별개로 본문 원문에 서버 내부 표식 ‘[NULL-복원-NULL]’이 남아 있습니다."
  }
});

function createBoardEvidence(message, random) {
  if (!message.viewer?.anomalous || !(message.anomalyEvidence || message.anomalyMode)) return null;
  const type = message.anomalyLineId?.startsWith("gli-")
    ? "GLITCH" : String(message.anomalyEvidence || message.viewer.anomalyPermission || "").toUpperCase();
  const rule = BOARD_BODY_RULES[type] || BOARD_BODY_RULES.GLITCH;
  const [title, body] = rule.cases[Math.floor(random() * rule.cases.length)];
  return { title, body, reason: `${rule.label} · ${rule.explanation}` };
}

function createBoardHeader({ title, nickname, date, number }, random, anomaly) {
  // 양쪽 글에 같은 표면 단서를 쓰므로 제목·닉네임·날짜·생성번호로 정답을 확정할 수 없습니다.
  if (random() >= (anomaly ? .82 : .32)) return { title, nickname, date, number };
  switch (Math.floor(random() * 4)) {
    case 0: return { title: random() < .5 ? "글이 두 번 저장됨…" : "제목 없음 [복구됨]", nickname, date, number };
    case 1: return { title, nickname: `${nickname}ㆍ`, date, number };
    case 2: return { title, nickname, date: `${date.slice(0, 8)}00`, number };
    default: return { title, nickname, date, number: "00000" };
  }
}

function renderBoardRules(list) {
  for (const rule of Object.values(BOARD_BODY_RULES)) {
    const item = document.createElement("li");
    const heading = document.createElement("strong");
    heading.textContent = rule.label;
    const ruleText = document.createElement("p");
    ruleText.textContent = rule.rule;
    const reference = document.createElement("p");
    reference.textContent = rule.reference;
    item.append(heading, ruleText, reference);
    list.append(item);
  }
}
