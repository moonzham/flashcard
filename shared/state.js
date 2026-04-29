// ════════════════════════════════════════════════
// 상수
// ════════════════════════════════════════════════
const CLIENT_ID = '603081180385-5dmfebn8mm239lod4solqkig2molj886.apps.googleusercontent.com';
const APP_VERSION = 'ver.260429.01';
const EMOJIS = ['📚','🇺🇸','🇯🇵','🇨🇳','🔢','🧪','🎵','💼','📝','🌏','⚙️','🏥'];

// ── Supabase 연결 정보 ──
// anon key는 공개되어도 안전 (RLS가 데이터 보호)
const SUPA_URL = 'https://wyujirkoyzhyetrpyyhx.supabase.co';
const SUPA_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind5dWppcmtveXpoeWV0cnB5eWh4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY3NDE1NTgsImV4cCI6MjA5MjMxNzU1OH0.9deK6cqyhPh3eUk53pO9dATSLxEQoEAGQCMsbn40dKU';
const SUPA_SCHEMA = 'flashcard'; // 스키마 분리 (다른 앱과 테이블 충돌 방지)

// ════════════════════════════════════════════════
// 전역 상태 (앱 런타임 상태 전체를 여기서 관리)
// ════════════════════════════════════════════════
let state = {
  // ── 인증 ──
  user: null,  // { name, email, picture, sub } — GIS id_token JWT에서 파싱
               // sub = Google 고유 사용자 ID → Supabase RLS의 user_id로 사용

  // ── 데이터 ──
  // deck 구조: { deck_id, user_id, name, emoji, last_studied, total_sessions,
  //              pending_session, created_at, cards: [{card_id, deck_id, front, back, hint, image_url, sort_order}] }
  decks: [],

  // card_progress 인메모리 캐시: { [card_id]: { status, starred } }
  // 매번 DB 조회 대신 로드 시 한 번에 가져와서 메모리에 유지
  cardProgress: {},

  // ── 덱 편집 ──
  editingDeckId: null,  // 현재 편집 중인 덱 ID (null이면 신규 생성)
  pendingDeckId: null,  // 학습 시작 대기 중인 덱 ID (필터/이어하기 모달에서 사용)

  // ── 학습 세션 ──
  studyDeck: null,      // 현재 학습 중인 덱 객체
  studyQueue: [],       // 이번 세션에서 풀 카드 배열 (필터/이어하기 적용 후)
  studyIdx: 0,          // studyQueue에서 현재 카드 인덱스
  studyFlipped: false,  // 카드가 뒤집혀 있는지 (문제→정답)
  studyShowHint: false, // 힌트가 펼쳐져 있는지

  // ── 세션 결과 집계 ──
  studyResults: {know:0, maybe:0, dont:0}, // 이번 세션 누적 평가 카운트
  sessionAnswers: {},   // { [card_id]: 'know'|'maybe'|'dont' } — 중복 답변 보정용

  // ── 덱 추가/편집 화면 ──
  selectedEmoji: '📚',
  cardInputs: [],       // 카드 직접입력 목록 (렌더링용 임시 배열)
};

// ── sessionStorage 헬퍼 ──
// 페이지 새로고침 후 자동 로그인에 사용
function saveUserToStorage(user) {
  if (user) sessionStorage.setItem('fc_user', JSON.stringify(user));
}
function loadUserFromStorage() {
  try { return JSON.parse(sessionStorage.getItem('fc_user')); } catch { return null; }
}
