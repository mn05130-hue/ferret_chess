"use strict";

/*
 * 채팅 엔진의 공개 진입점입니다.
 * 앞선 script들이 일반 전역 lexical binding으로 조립한 최종 클래스와 읽기 전용 설정을
 * window에 연결해 게임 앱 및 브라우저 개발자 도구에서 접근할 수 있게 합니다.
 * 이 파일은 엔진 파일 중 반드시 마지막에 로드해야 합니다.
 */
// 실제 게임에서 new window.HorrorChatEngine(options)으로 생성하는 최종 엔진 클래스입니다.
window.HorrorChatEngine = HorrorChatEngine;
// 밸런스 조정과 진단에 사용하는 시간·확률·상태별 가중치입니다.
window.HORROR_CHAT_TUNING = TUNING;
// 정상 시청자 성격별 발화 성향과 표기 변형 확률입니다.
window.HORROR_CHAT_PERSONAS = PERSONAS;
// 외부 사건이 없을 때 엔진이 자체 생성할 방송 사건 목록입니다.
window.HORROR_CHAT_EVENTS = SYNTHETIC_EVENTS;
// 괴이 유형별 공포 대사 원본이며 게임 화면은 메타데이터를 받아 시각화합니다.
window.HORROR_CHAT_ANOMALY_LINES = ANOMALY_LINES;
