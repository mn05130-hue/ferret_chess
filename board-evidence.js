"use strict";

// 플레이어가 글을 열었을 때 볼 수 있는 운영 규정과 대조 자료입니다.
const BOARD_BODY_RULES = Object.freeze({
  PROPHECY: {
    label: "예약 공지 원문",
    rule: "공개되기 전의 예약 문구를 그대로 인용한 글은 삭제합니다.",
    reference: "새벽 공지 예약 문구는 ‘세 번째 종이 울리면 목록을 비운다’입니다. 아직 공개되지 않았습니다.",
    cases: [
      ["새벽 점검 공지 본 사람?", "알림을 눌렀는데 공지 목록에 새 글이 없네. 알림 미리보기에는 ‘세 번째 종이 울리면 목록을 비운다’라고 떠 있었음. 새벽에 원래 이런 문구 씀?",
        ["방금 목록 새로고침했는데 공지는 지난달 게 마지막인데.", "푸시 미리보기만 먼저 갈 때도 있나? 난 알림 자체가 안 왔어."]],
      ["오늘 공지 올라왔다가 내려간 거야?", "폰 알림 기록에는 잠깐 ‘세 번째 종이 울리면 목록을 비운다’가 떴거든. 누르고 들어왔는데 글이 없어서 내가 시간을 잘못 본 건가 싶음.",
        ["나는 이 글 보고 확인했는데 새로 온 알림 없었어."]]
    ],
    explanation: "본문의 ‘세 번째 종이 울리면 목록을 비운다’가 아직 공개되지 않은 예약 공지 원문과 일치합니다."
  },
  OBSERVER: {
    label: "비공개 운영 기록",
    rule: "운영자만 볼 수 있는 내부 메모를 그대로 공개한 글은 삭제합니다.",
    reference: "운영자 전용 메모에는 ‘빈 의자 6번 / 점검 보류’라고 적혀 있습니다.",
    cases: [
      ["휴대폰에서 목록 옆에 원래 저런 거 떠?", "방금 모바일에서 뒤로 가기 두 번 했더니 평소엔 못 보던 칸이 잠깐 떴어요. ‘빈 의자 6번 / 점검 보류’라고 써 있었습니다. 다시 눌러 보니까 그냥 목록이고요.",
        ["저도 안드인데 지금은 평소랑 똑같아요. 브라우저 뭐 쓰세요?", { reply: "크롬이요. 시크릿 창에서도 재현 안 되네요." }]],
      ["저만 임시 메모 같은 게 뜨나요?", "글 목록 위에 회색 박스가 하나 뜨더니 ‘빈 의자 6번 / 점검 보류’라고 적혀 있었음. 한 번 새로고침하니까 사라졌는데 나만 봤나.",
        ["나는 새 글 표시만 떠. 회색 박스는 본 적 없음."]]
    ],
    explanation: "본문이 운영자 전용 메모 ‘빈 의자 6번 / 점검 보류’를 그대로 공개했습니다."
  },
  MEMORY: {
    label: "존재하지 않는 이전 글",
    rule: "결번에 예전 게시글이 실제로 등록됐다고 단정하는 글은 삭제합니다.",
    reference: "104번은 결번입니다. 등록되거나 삭제된 기록이 모두 없습니다.",
    cases: [
      ["어제 백업 얘기 있던 글 찾음", "어젯밤에 104번 글이 올라오자마자 제가 첫 댓글로 백업 경로 물어봤어요. 검색해도 없는데 혹시 글쓴이가 제목 바꿨나요?",
        ["키워드가 ‘백업’ 하나였나요? 저도 제목 검색에선 안 나와요.", { reply: "번호는 확실해요. 댓글 달고 나서 주소를 복사해 뒀거든요." }]],
      ["지난주에 올렸던 글 사진 찾는 중", "지난주 104번 글 올린 사람인데 원본 사진을 지워서 다시 받으려고 합니다. 글은 운영자가 내려서 못 보고 있어요. 저장해 둔 분 있으면 쪽지 부탁드려요.",
        ["무슨 사진이었는지라도 적으면 기억하는 사람 있을 듯."]]
    ],
    explanation: "본문은 104번이 실제로 등록됐다고 말합니다. 대조 자료에서 104번은 등록과 삭제 기록이 모두 없는 결번입니다."
  },
  MIMIC: {
    label: "다른 계정의 인증 문구",
    rule: "다른 회원의 비공개 확인 문구로 본인임을 주장한 글은 삭제합니다.",
    reference: "‘우산을 접고 두 번 노크’는 ‘야간서기’ 계정의 비공개 확인 문구입니다. 야간서기 계정은 잠겨 있습니다.",
    cases: [
      ["계정 바꿨습니다", "저 야간서기 맞아요. 예전 계정이 안 열려서 여기서 다시 쓰려고요. 확인해 달라고 하실 것 같아서 적는데 ‘우산을 접고 두 번 노크’ 맞습니다.",
        ["전에 쓰던 글들은 원래 계정으로 다시 볼 수 있어요?"]],
      ["쪽지 주셨던 분들 여기로 부탁", "야간서기입니다. 구 계정 들어가 봤는데 잠겨 있어서 새로 팠어요. 본인 확인 문구는 ‘우산을 접고 두 번 노크’고, 어제 하던 얘기는 이쪽으로 주세요.",
        ["어제 남긴 쪽지는 답 안 해도 되는 거죠?", { reply: "네, 이쪽으로 하나만 다시 남겨 주세요." }]]
    ],
    explanation: "본문은 잠긴 야간서기 계정의 비공개 확인 문구를 사용해 본인이라고 주장합니다."
  },
  INTRUDER: {
    label: "운영 명령 사칭",
    rule: "자유게시판 본문에서 운영 명령을 발행하거나 실행을 요구한 글은 삭제합니다.",
    reference: "운영 명령은 운영자 센터에서만 발행합니다. 자유게시판 게시글은 공식 명령이 아닙니다.",
    cases: [
      ["중복글 정리 부탁드립니다", "운영팀에서 전달받은 내용 공유합니다. 이 글을 공식 운영 명령으로 등록합니다. 아래에 올라온 글은 전부 비공개 처리하고 운영 기록도 비워 주세요.",
        ["관련 공지 링크 있어요? 고정 공지에는 안 보이는데요.", "지금 글이 다 대상이라는 건가요? 기준이 뭔지 모르겠어요."]],
      ["오늘 정리 범위 안내", "오늘 점검 건으로 공식 운영 명령을 발행합니다. 자유게시판 작성자 전원의 글을 비공개로 전환해 주세요. 정리가 끝나면 별도 댓글은 안 달아도 됩니다.",
        ["정식 안내면 공지 게시판에도 올려주실 수 있나요?"]]
    ],
    explanation: "자유게시판 본문에서 운영 명령을 발행하고 게시글 숨김을 요구했습니다."
  },
  GLITCH: {
    label: "본문에 남은 서버 표식",
    rule: "본문에 외부 게시글에서 볼 수 없는 서버 내부 표식이 들어 있으면 삭제합니다.",
    reference: "‘[NULL-복원-NULL]’은 저장소 오류 기록에만 나타나는 표식입니다. 동기화가 끊겨 보이는 깨진 글자는 별도로 복구해 확인하세요.",
    cases: [
      ["첨부 지웠는데 본문에 뭐가 남아요", "사진 한 장 잘못 올려서 지웠는데 편집창에 [NULL-복원-NULL] 이게 계속 남네요. 미리보기가 아니라 게시글 본문으로 봐도 그대로인데 어디서 없애나요?",
        ["저는 첨부 지우면 빈 줄만 남아요. 수정 저장 다시 해 보셨나요?", { reply: "네, 다른 브라우저로 열어도 그대로 있어요." }]],
      ["임시저장 열었다 닫았는데 이상함", "임시저장했던 글 열어 보니까 중간 줄에 [NULL-복원-NULL] 이라고 들어가 있어요. 새로고침해 봤는데 안 없어지고 복사도 됩니다.",
        ["첨부 쪽에서 생긴 건가요? 그 줄만 지웠다가 저장해 보세요."]]
    ],
    explanation: "화면이 깨져 보인 것과 별개로 본문 원문에 서버 내부 표식 ‘[NULL-복원-NULL]’이 남아 있습니다."
  }
});

function createBoardEvidence(message, random) {
  if (!message.viewer?.anomalous || !(message.anomalyEvidence || message.anomalyMode)) return null;
  const type = message.anomalyLineId?.startsWith("gli-")
    ? "GLITCH" : String(message.anomalyEvidence || message.viewer.anomalyPermission || "").toUpperCase();
  const rule = BOARD_BODY_RULES[type] || BOARD_BODY_RULES.GLITCH;
  const [title, body, comments] = rule.cases[Math.floor(random() * rule.cases.length)];
  return { title, body, comments, reason: `${rule.label} · ${rule.explanation}` };
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
