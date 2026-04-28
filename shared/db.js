// ════════════════════════════════════════════════
// Supabase REST API 래퍼
// ════════════════════════════════════════════════
// anon key는 공개되어도 안전 (RLS가 데이터 보호)
// Accept-Profile / Content-Profile 헤더로 flashcard 스키마 지정
async function sbFetch(path, options = {}) {
  // RLS 비활성화 상태 → anon key로 직접 인증
  // (추후 Supabase Auth 연동 시 user JWT로 교체 예정)
  const headers = {
    'apikey': SUPA_KEY,
    'Authorization': `Bearer ${SUPA_KEY}`,
    'Content-Type': 'application/json',
    'Accept': 'application/json',
    ...options.headers,
  };
  const res = await fetch(`${SUPA_URL}/rest/v1/${path}`, { ...options, headers });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `HTTP ${res.status}`);
  }
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

// SELECT
function sbSelect(table, query = '') {
  return sbFetch(`${table}?${query}`, { method: 'GET',
    headers: { 'Accept-Profile': SUPA_SCHEMA } });
}
// INSERT (배열 or 단일 객체, return=representation)
function sbInsert(table, body) {
  return sbFetch(`${table}`, { method: 'POST', body: JSON.stringify(body),
    headers: { 'Content-Profile': SUPA_SCHEMA, 'Accept-Profile': SUPA_SCHEMA, 'Prefer': 'return=representation' } });
}
// UPDATE
function sbUpdate(table, query, body) {
  return sbFetch(`${table}?${query}`, { method: 'PATCH', body: JSON.stringify(body),
    headers: { 'Content-Profile': SUPA_SCHEMA, 'Accept-Profile': SUPA_SCHEMA, 'Prefer': 'return=representation' } });
}
// UPSERT (중복 시 merge)
function sbUpsert(table, body, onConflict) {
  return sbFetch(`${table}`, { method: 'POST', body: JSON.stringify(body),
    headers: { 'Content-Profile': SUPA_SCHEMA, 'Accept-Profile': SUPA_SCHEMA,
      'Prefer': 'resolution=merge-duplicates,return=representation', 'on-conflict': onConflict } });
}
// DELETE
function sbDelete(table, query) {
  return sbFetch(`${table}?${query}`, { method: 'DELETE',
    headers: { 'Content-Profile': SUPA_SCHEMA, 'Accept-Profile': SUPA_SCHEMA } });
}

// ── 데이터 로드 / 저장 ──

// 앱 시작 시 덱 목록 + card_progress 로드
async function loadAllData() {
  try {
    const uid = state.user.sub;

    // 덱 목록 로드 (카드 내용 제외)
    const decks = await sbSelect('decks', `user_id=eq.${uid}&order=created_at.asc`);

    if (!decks || decks.length === 0) {
      state.decks = [];
      await createSampleDeck();
    } else {
      state.decks = decks.map(d => ({ ...d, id: d.deck_id, cards: [] }));

      // card_progress 인메모리 캐시 로드
      const progress = await sbSelect('card_progress', `user_id=eq.${uid}`);
      state.cardProgress = {};
      (progress || []).forEach(p => {
        state.cardProgress[p.card_id] = { status: p.status, starred: p.starred };
      });
    }

    renderUserHeader();
    document.getElementById('tab-bar').style.display = 'flex';
    showHome();
    showSyncDone();
  } catch(e) {
    console.error(e);
    showToast('데이터 로드 실패: ' + e.message);
  } finally {
    hideLoading();
  }
}

// 특정 덱의 카드를 DB에서 로드 (lazy load)
async function loadDeckCards(deckId) {
  const cards = await sbSelect('cards', `deck_id=eq.${deckId}&order=sort_order.asc`);
  const deck = state.decks.find(d => (d.deck_id||d.id) === deckId);
  if (deck) {
    deck.cards = (cards || []).map(c => ({ ...c, id: c.card_id }));
  }
  return deck ? deck.cards : [];
}

// 샘플 덱 생성 (첫 로그인 시)
async function createSampleDeck() {
  const uid = state.user.sub;
  const sampleCards = [
    { front: '서로 관련된 객체들의 패밀리를 생성하기 위해 인터페이스를 제공하는 생성 패턴', back: 'Abstract Factory', hint: '구체 클래스 명시 없이 생성' },
    { front: '객체의 인스턴스가 오직 하나만 생성되도록 보장하는 생성 패턴', back: 'Singleton', hint: '전역 단일 인스턴스' },
    { front: '호환되지 않는 인터페이스를 변환해주는 구조 패턴', back: 'Adapter', hint: '인터페이스 변환기' },
  ];
  const [newDeck] = await sbInsert('decks', { user_id: uid, name: '샘플 덱', emoji: '📚' });
  const cardRows = sampleCards.map((c, i) => ({ deck_id: newDeck.deck_id, ...c, sort_order: i }));
  const newCards = await sbInsert('cards', cardRows);
  state.decks = [{ ...newDeck, id: newDeck.deck_id, cards: (newCards || []).map(c => ({ ...c, id: c.card_id })) }];
}

// 카드 진행 데이터 반환 (인메모리 캐시)
function getCardProgress(deckId, cardId) {
  if (!state.cardProgress[cardId]) state.cardProgress[cardId] = { status: null, starred: false };
  return state.cardProgress[cardId];
}

// 덱 메타 반환
function getDeckMeta(deckId) {
  return state.decks.find(d => d.deck_id === deckId || d.id === deckId) || {};
}

// 카드 progress DB 저장 (upsert)
async function saveCardProgress(cardId, deckId, status, starred) {
  const uid = state.user.sub;
  await sbUpsert('card_progress', {
    user_id: uid, card_id: cardId, deck_id: deckId, status, starred,
    updated_at: new Date().toISOString()
  }, 'user_id,card_id');
}

// 덱 메타(last_studied, total_sessions, pending_session) 저장
async function saveDeckMeta(deckId, fields) {
  await sbUpdate('decks', `deck_id=eq.${deckId}`, fields);
  const deck = state.decks.find(d => d.deck_id === deckId || d.id === deckId);
  if (deck) Object.assign(deck, fields);
}

// 세션 기록 저장
async function saveSession(deckId, know, maybe, dont, completed) {
  const uid = state.user.sub;
  await sbInsert('study_sessions', {
    user_id: uid, deck_id: deckId,
    studied_at: new Date().toISOString().split('T')[0],
    know_count: know, maybe_count: maybe, dont_count: dont, completed
  });
}

// 덱 편집 후 삭제된 카드의 progress 캐시 정리
function cleanOrphanProgress(deckId, validIds) {
  Object.keys(state.cardProgress).forEach(cid => {
    if (!validIds.includes(cid)) delete state.cardProgress[cid];
  });
}

// ════════════════════════════════════════════════
// Supabase Storage (이미지 업로드/삭제)
// ════════════════════════════════════════════════
const SUPA_BUCKET = 'flashcard-images';

// 이미지 업로드 → public URL 반환
async function sbUploadImage(path, blob) {
  const res = await fetch(`${SUPA_URL}/storage/v1/object/${SUPA_BUCKET}/${path}`, {
    method: 'POST',
    headers: {
      'apikey': SUPA_KEY,
      'Authorization': `Bearer ${SUPA_KEY}`,
      'Content-Type': blob.type || 'image/jpeg',
      'x-upsert': 'true',
    },
    body: blob,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `Upload failed: HTTP ${res.status}`);
  }
  return `${SUPA_URL}/storage/v1/object/public/${SUPA_BUCKET}/${path}`;
}

// 이미지 삭제 (URL에서 path 추출)
async function sbDeleteImage(url) {
  const marker = `/object/public/${SUPA_BUCKET}/`;
  const idx = url.indexOf(marker);
  if (idx === -1) return;
  const path = url.slice(idx + marker.length);
  await fetch(`${SUPA_URL}/storage/v1/object/${SUPA_BUCKET}/${path}`, {
    method: 'DELETE',
    headers: { 'apikey': SUPA_KEY, 'Authorization': `Bearer ${SUPA_KEY}` },
  });
}
