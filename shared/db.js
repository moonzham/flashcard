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
  return sbFetch(`${table}?on_conflict=${onConflict}`, { method: 'POST', body: JSON.stringify(body),
    headers: { 'Content-Profile': SUPA_SCHEMA, 'Accept-Profile': SUPA_SCHEMA,
      'Prefer': 'resolution=merge-duplicates,return=representation' } });
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

      // 카드 전체 로드 (홈 카드 수 표시용)
      const allCards = await sbSelect('cards', `deck_id=in.(${state.decks.map(d => d.deck_id).join(',')})&order=sort_order.asc`);
      (allCards || []).forEach(c => {
        const deck = state.decks.find(d => d.deck_id === c.deck_id);
        if (deck) deck.cards.push({ ...c, id: c.card_id });
      });

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

// 덱 편집 후 삭제된 카드의 progress 정리 (로컬 + DB)
// validIds : 편집 후 살아남은 card_id 배열
// deckId 소속 카드만 대상으로 정리 (다른 덱 progress 건드리지 않음)
// ════════════════════════════════════════════════
// 카드별 날짜 히스토리 (card_progress_daily)
// ════════════════════════════════════════════════
// 같은 날짜에 여러 번 평가해도 upsert로 그날 최종 답변만 남음 (user_id,card_id,date 유니크)
async function saveDailyProgress(cardId, status) {
  const uid = state.user.sub;
  const today = new Date().toISOString().split('T')[0];
  await sbUpsert('card_progress_daily', {
    user_id: uid, card_id: cardId, date: today, status
  }, 'user_id,card_id,date');
}

// 특정 카드의 날짜별 히스토리 전체 조회 (최신 날짜순)
async function getCardHistory(cardId) {
  const uid = state.user.sub;
  const rows = await sbSelect('card_progress_daily', `user_id=eq.${uid}&card_id=eq.${cardId}&order=date.desc`);
  return rows || [];
}

async function cleanOrphanProgress(deckId, validIds) {
  const deck = state.decks.find(d => (d.deck_id||d.id) === deckId);
  if (!deck) return;

  // 이 덱에 속했던 카드 중 validIds에 없는 것 = 삭제된 카드
  const allDeckCardIds = (deck.cards || []).map(c => c.card_id||c.id);
  const orphanIds = allDeckCardIds.filter(cid => !validIds.includes(cid));

  // 로컬 캐시 정리
  orphanIds.forEach(cid => delete state.cardProgress[cid]);

  // DB 정리
  if (orphanIds.length > 0) {
    await sbDelete('card_progress', `card_id=in.(${orphanIds.join(',')})`).catch(() => {});
  }
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

// ════════════════════════════════════════════════
// TTS 오디오 (Edge Function으로 mp3 생성 + Storage 관리)
// ════════════════════════════════════════════════
const AUDIO_BUCKET = 'flashcard-audio';
const TTS_FUNC_URL = `${SUPA_URL}/functions/v1/tts-generate`;

// 카드의 한 면(front/back)에 대한 mp3를 생성 (이미 있으면 그대로 반환)
// side: 'front' | 'back', lang: 예 'en-US', 반환: audio_url
// force=true면 기존 URL 무시하고 강제 재생성 (텍스트 수정 후 등)
async function ensureCardAudio(card, side, lang, force = false) {
  const cardId = card.card_id || card.id;
  const existing = side === 'front' ? card.front_audio_url : card.back_audio_url;
  if (existing && !force) return existing; // 이미 있으면 재사용 (비용 절감)
  const text = (side === 'front' ? card.front : card.back || '').trim();
  if (!text) return null;
  const path = `${cardId}_${side}.mp3`;
  const res = await fetch(TTS_FUNC_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${SUPA_KEY}` },
    body: JSON.stringify({ text, lang: lang || 'ko-KR', path }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `TTS 생성 실패: HTTP ${res.status}`);
  }
  const data = await res.json();
  const url = data.audio_url;
  // DB의 cards 테이블에 URL 저장
  const col = side === 'front' ? 'front_audio_url' : 'back_audio_url';
  await sbUpdate('cards', `card_id=eq.${cardId}`, { [col]: url }).catch(() => {});
  // 전달받은 카드 객체에 반영
  if (side === 'front') card.front_audio_url = url; else card.back_audio_url = url;
  // state.decks의 원본 카드에도 반영 (화면 재진입 시 studyQueue 재생성돼도 URL 유지)
  for (const deck of state.decks) {
    const orig = (deck.cards || []).find(c => (c.card_id||c.id) === cardId);
    if (orig) { if (side === 'front') orig.front_audio_url = url; else orig.back_audio_url = url; break; }
  }
  return url;
}

// 카드의 오디오 파일(front/back) 삭제 (텍스트 수정/카드 삭제 시)
// URL이 있으면 Storage에서 지우고, DB 컬럼도 비움
async function deleteCardAudio(card) {
  const cardId = card.card_id || card.id;
  const urls = [card.front_audio_url, card.back_audio_url].filter(Boolean);
  await Promise.allSettled(urls.map(url => {
    const marker = `/object/public/${AUDIO_BUCKET}/`;
    const idx = url.indexOf(marker);
    if (idx === -1) return Promise.resolve();
    const path = url.slice(idx + marker.length);
    return fetch(`${SUPA_URL}/storage/v1/object/${AUDIO_BUCKET}/${path}`, {
      method: 'DELETE',
      headers: { 'apikey': SUPA_KEY, 'Authorization': `Bearer ${SUPA_KEY}` },
    });
  }));
}
