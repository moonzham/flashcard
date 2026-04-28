// ════════════════════════════════════════════════
// 학습 세션
// ════════════════════════════════════════════════
async function tryStartStudy(deckId) {
  const deck = state.decks.find(d => (d.deck_id||d.id) === deckId);
  state.pendingDeckId = deckId;
  if (!deck.cards || deck.cards.length === 0) {
    showLoading('카드 불러오는 중...');
    try { await loadDeckCards(deckId); } catch(e) { showToast('카드 로드 실패'); hideLoading(); return; }
    hideLoading();
  }
  if (deck && deck.pending_session) {
    const p = deck.pending_session, done = p.results.know + p.results.maybe + p.results.dont, total = done + p.remainingIds.length;
    document.getElementById('resume-modal-sub').textContent = `${p.date}에 시작한 학습이 있어요\n${done} / ${total} 완료된 상태예요`;
    document.getElementById('resume-modal').style.display = 'flex';
  } else {
    const hasHistory = deck && deck.cards.some(c => (state.cardProgress[c.card_id||c.id]||{}).status);
    if (hasHistory) { openFilterModal(deckId); } else { startFresh(deckId); }
  }
}

// ── 필터 모달 ──
let _currentFilterDeck = null;
function toggleFilterOpt(key) {
  const cb = document.getElementById('filter-' + key);
  cb.checked = !cb.checked;
  document.getElementById('filter-opt-' + key).classList.toggle('checked', cb.checked);
  updateFilterTotal(_currentFilterDeck);
}
function _setFilterCheck(key, val) {
  document.getElementById('filter-' + key).checked = val;
  document.getElementById('filter-opt-' + key).classList.toggle('checked', val);
}
function openFilterModal(deckId) {
  const deck = state.decks.find(d => (d.deck_id||d.id) === deckId); if (!deck) return;
  _currentFilterDeck = deck;
  const counts = {know:0, maybe:0, dont:0, none:0};
  deck.cards.forEach(c => {
    const s = (state.cardProgress[c.card_id||c.id]||{}).status;
    if (s === 'know') counts.know++; else if (s === 'maybe') counts.maybe++;
    else if (s === 'dont') counts.dont++; else counts.none++;
  });
  document.getElementById('filter-know-count').textContent  = counts.know  + '장';
  document.getElementById('filter-maybe-count').textContent = counts.maybe + '장';
  document.getElementById('filter-dont-count').textContent  = counts.dont  + '장';
  document.getElementById('filter-none-count').textContent  = counts.none  + '장';
  _setFilterCheck('know', counts.know > 0); _setFilterCheck('maybe', counts.maybe > 0);
  _setFilterCheck('dont', counts.dont > 0); _setFilterCheck('none', counts.none > 0);
  updateFilterTotal(deck);
  document.getElementById('filter-modal').style.display = 'flex';
}
function updateFilterTotal(deck) {
  const d = deck || _currentFilterDeck; if (!d) return;
  const selected = getSelectedStatuses();
  const count = d.cards.filter(c => { const s = (state.cardProgress[c.card_id||c.id]||{}).status || null; return selected.includes(s); }).length;
  document.getElementById('filter-total-info').textContent = '총 ' + count + '장 공부';
}
function getSelectedStatuses() {
  const list = [];
  if (document.getElementById('filter-know').checked)  list.push('know');
  if (document.getElementById('filter-maybe').checked) list.push('maybe');
  if (document.getElementById('filter-dont').checked)  list.push('dont');
  if (document.getElementById('filter-none').checked)  list.push(null);
  return list;
}
function closeFilterModal() { document.getElementById('filter-modal').style.display = 'none'; }
function startWithFilter() {
  const deckId = state.pendingDeckId;
  const deck = state.decks.find(d => (d.deck_id||d.id) === deckId); if (!deck) return;
  const selected = getSelectedStatuses();
  if (!selected.length) { showToast('최소 하나는 선택해주세요'); return; }
  const filtered = deck.cards.filter(c => { const s = (state.cardProgress[c.card_id||c.id]||{}).status || null; return selected.includes(s); }).map(c => ({...c, id: c.card_id||c.id}));
  if (!filtered.length) { showToast('해당하는 카드가 없어요'); return; }
  closeFilterModal();
  deck.pending_session = null; saveDeckMeta(deck.deck_id||deck.id, {pending_session: null});
  state.studyDeck = deck;
  const cards = [...filtered];
  state.studyQueue = (deck.total_sessions >= 1) ? cards.sort(() => Math.random() - .5) : cards;
  state.studyIdx = 0; state.studyResults = {know:0, maybe:0, dont:0}; state.sessionAnswers = {};
  document.getElementById('study-deck-name').textContent = deck.name;
  showScreen('study'); renderStudyCard();
}
function startFresh(deckId) {
  document.getElementById('resume-modal').style.display = 'none';
  const id = deckId || state.pendingDeckId;
  const deck = state.decks.find(d => (d.deck_id||d.id) === id); if (!deck) return;
  deck.pending_session = null;
  const cards = [...deck.cards].map(c => ({...c, id: c.card_id||c.id}));
  state.studyDeck = deck;
  state.studyQueue = (deck.total_sessions >= 1) ? cards.sort(() => Math.random() - .5) : cards;
  state.studyIdx = 0; state.studyResults = {know:0, maybe:0, dont:0}; state.sessionAnswers = {};
  document.getElementById('study-deck-name').textContent = deck.name;
  showScreen('study'); renderStudyCard();
}
function resumeFromFresh() {
  document.getElementById('resume-modal').style.display = 'none';
  const deckId = state.pendingDeckId;
  const deck = state.decks.find(d => (d.deck_id||d.id) === deckId);
  if (deck) { deck.pending_session = null; saveDeckMeta(deckId, {pending_session: null}); }
  openFilterModal(deckId);
}
function resumeStudy() {
  document.getElementById('resume-modal').style.display = 'none';
  const deck = state.decks.find(d => (d.deck_id||d.id) === state.pendingDeckId); if (!deck) return;
  const p = deck.pending_session; state.studyDeck = deck;
  state.studyQueue = p.remainingIds.map(id => deck.cards.find(c => (c.card_id||c.id) === id)).filter(Boolean).map(c => ({...c, id: c.card_id||c.id}));
  state.studyIdx = 0; state.studyResults = {...p.results}; state.sessionAnswers = {...p.sessionAnswers||{}};
  document.getElementById('study-deck-name').textContent = deck.name;
  showScreen('study'); renderStudyCard();
}
function exitStudy() {
  if (!state._starredMode && state.studyDeck && state.studyIdx < state.studyQueue.length) {
    const today = new Date().toISOString().split('T')[0];
    const pending = { date: today, remainingIds: state.studyQueue.slice(state.studyIdx).map(c => c.id), results: {...state.studyResults}, sessionAnswers: {...state.sessionAnswers} };
    saveDeckMeta(state.studyDeck.deck_id || state.studyDeck.id, { pending_session: pending, last_studied: today });
  }
  state._starredMode = false;
  showHome();
}

// ── 카드 렌더링 ──
function renderStudyCard() {
  const q = state.studyQueue, i = state.studyIdx;
  if (i >= q.length) { showDone(); return; }
  const card = q[i];
  const cardId = card.card_id || card.id;
  const cp = getCardProgress(null, cardId);
  state.studyFlipped = false; state.studyShowHint = false;
  const done = state.studyResults.know + state.studyResults.maybe + state.studyResults.dont;
  const total = state.studyQueue.length;
  document.getElementById('study-progress-text').textContent = `${done+1} / ${total}`;
  document.getElementById('study-progress-fill').style.width = `${(done/total)*100}%`;
  document.getElementById('card-front-face').style.display = 'flex';
  document.getElementById('card-back-face').style.display = 'none';
  const ft = document.getElementById('card-front-text'); ft.textContent = card.front; setFontSize(ft, card.front);
  const bt = document.getElementById('card-back-text');  bt.textContent = card.back;  setFontSize(bt, card.back);
  const bq = document.getElementById('card-back-question'); bq.textContent = card.front; setFontSize(bq, card.front);
  document.getElementById('card-hint-back').textContent = card.hint ? '💡 ' + card.hint : '';
  document.getElementById('star-btn').classList.toggle('starred', !!cp.starred);
  const statusEl = document.getElementById('card-status');
  const statusMap = { know: ['status-know','알았어요'], maybe: ['status-maybe','애매해요'], dont: ['status-dont','몰랐어요'] };
  const [cls, label] = statusMap[cp.status] || ['status-none','미평가'];
  statusEl.className = 'card-status ' + cls;
  statusEl.querySelector('.card-status-label').textContent = label;
  const hb = document.getElementById('hint-btn');
  if (card.hint) { hb.style.display = 'block'; hb.textContent = '💡 힌트 보기'; } else { hb.style.display = 'none'; }
  document.getElementById('answer-btns').style.display = 'none';
  document.getElementById('memo-area').style.display = 'none';
  document.getElementById('btn-prev').disabled = (i === 0);
  document.getElementById('btn-next').disabled = (i >= q.length - 1);
}
function flipCard() {
  state.studyFlipped = !state.studyFlipped;
  document.getElementById('card-front-face').style.display = state.studyFlipped ? 'none' : 'flex';
  document.getElementById('card-back-face').style.display  = state.studyFlipped ? 'flex' : 'none';
  document.getElementById('answer-btns').style.display     = state.studyFlipped ? 'flex' : 'none';
  document.getElementById('hint-btn').style.display = 'none';
  if (state.studyFlipped) renderMemoArea();
  else document.getElementById('memo-area').style.display = 'none';
}
function prevCard() { if (state.studyIdx > 0) { state.studyIdx--; renderStudyCard(); } }
function nextCard() { if (state.studyIdx < state.studyQueue.length - 1) { state.studyIdx++; renderStudyCard(); } }
function toggleHint() {
  const card = state.studyQueue[state.studyIdx]; if (!card?.hint) return;
  state.studyShowHint = !state.studyShowHint;
  document.getElementById('hint-btn').textContent = state.studyShowHint ? `💡 ${card.hint}` : '💡 힌트 보기';
}
function toggleStar(e) {
  e.stopPropagation();
  const card = state.studyQueue[state.studyIdx]; if (!card) return;
  const cardId = card.card_id || card.id;
  const deckId = state._starredMode ? card._deckId : (state.studyDeck.deck_id||state.studyDeck.id);
  const cp = getCardProgress(null, cardId); cp.starred = !cp.starred;
  document.getElementById('star-btn').classList.toggle('starred', cp.starred);
  saveCardProgress(cardId, deckId, cp.status, cp.starred).catch(e => console.error('star save fail', e));
}
function answer(type) {
  const card = state.studyQueue[state.studyIdx]; if (!card) return;
  const cardId = card.card_id || card.id;
  const deckId = state._starredMode ? card._deckId : (state.studyDeck.deck_id||state.studyDeck.id);
  getCardProgress(null, cardId).status = type;
  saveCardProgress(cardId, deckId, type, (state.cardProgress[cardId]||{}).starred||false).catch(e => console.error('progress save fail', e));
  const prev = state.sessionAnswers[cardId];
  if (prev) state.studyResults[prev] = Math.max(0, state.studyResults[prev] - 1);
  state.sessionAnswers[cardId] = type;
  state.studyResults[type]++; state.studyIdx++;
  if (!state._starredMode) {
    const today = new Date().toISOString().split('T')[0];
    if (state.studyIdx < state.studyQueue.length) {
      const pending = { date: today, remainingIds: state.studyQueue.slice(state.studyIdx).map(c => c.card_id||c.id), results: {...state.studyResults}, sessionAnswers: {...state.sessionAnswers} };
      saveDeckMeta(deckId, { pending_session: pending, last_studied: today }).catch(() => {});
    } else {
      saveDeckMeta(deckId, { pending_session: null, last_studied: today }).catch(() => {});
    }
  }
  renderStudyCard();
}
function showDone() {
  if (!state._starredMode) {
    const today = new Date().toISOString().split('T')[0];
    const deckId = state.studyDeck.deck_id || state.studyDeck.id;
    const newTotal = (state.studyDeck.total_sessions||0) + 1;
    saveDeckMeta(deckId, { last_studied: today, total_sessions: newTotal, pending_session: null }).catch(() => {});
    saveSession(deckId, state.studyResults.know, state.studyResults.maybe, state.studyResults.dont, true).catch(() => {});
    state.studyDeck.total_sessions = newTotal; state.studyDeck.last_studied = today; state.studyDeck.pending_session = null;
  }
  state._starredMode = false;
  showScreen('done');
  document.getElementById('done-sub').textContent = state.studyDeck.name + ' 전체를 다 봤어요';
  document.getElementById('res-know').textContent  = state.studyResults.know;
  document.getElementById('res-maybe').textContent = state.studyResults.maybe;
  document.getElementById('res-dont').textContent  = state.studyResults.dont;
}

// ── 카드 편집 모달 ──
function openEditCardModal() {
  const card = state.studyQueue[state.studyIdx]; if (!card) return;
  document.getElementById('edit-card-front').value = card.front;
  document.getElementById('edit-card-back').value  = card.back;
  document.getElementById('edit-card-hint').value  = card.hint || '';
  document.getElementById('edit-card-modal').style.display = 'flex';
}
function closeEditCardModal() { document.getElementById('edit-card-modal').style.display = 'none'; }
async function saveEditCard() {
  const card = state.studyQueue[state.studyIdx]; if (!card) return;
  const front = document.getElementById('edit-card-front').value.trim();
  const back  = document.getElementById('edit-card-back').value.trim();
  const hint  = document.getElementById('edit-card-hint').value.trim();
  if (!front || !back) { showToast('앞면과 뒷면을 입력해주세요'); return; }
  const cardId = card.card_id || card.id;
  const deckId = state._starredMode ? card._deckId : (state.studyDeck.deck_id||state.studyDeck.id);
  const deck = state.decks.find(d => (d.deck_id||d.id) === deckId);
  if (deck) { const idx = deck.cards.findIndex(c => (c.card_id||c.id) === cardId); if (idx !== -1) { deck.cards[idx] = { ...deck.cards[idx], front, back, hint }; } }
  state.studyQueue[state.studyIdx] = { ...card, front, back, hint };
  closeEditCardModal(); renderStudyCard();
  showLoading('저장 중...');
  try { await sbUpdate('cards', `card_id=eq.${cardId}`, { front, back, hint: hint||null }); showToast('저장 완료!'); }
  catch(e) { showToast('저장 실패: ' + e.message); } finally { hideLoading(); }
}

// ════════════════════════════════════════════════
// 메모 영역
// ════════════════════════════════════════════════
function renderMemoArea() {
  const card = state.studyQueue[state.studyIdx]; if (!card) return;
  const imageUrl = card.image_url || null;
  document.getElementById('memo-area').style.display = 'block';
  document.getElementById('memo-panel').style.display = 'none';
  closeMemoPanel();

  // 모바일 감지 → 클립보드 행 숨김
  const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
  const pasteRow = document.getElementById('memo-paste-row');
  if (pasteRow) pasteRow.style.display = isMobile ? 'none' : 'flex';

  if (imageUrl) {
    document.getElementById('memo-empty').style.display = 'none';
    document.getElementById('memo-filled').style.display = 'block';
    document.getElementById('memo-img').src = imageUrl;
  } else {
    document.getElementById('memo-empty').style.display = 'block';
    document.getElementById('memo-filled').style.display = 'none';
  }
}

function openMemoPanel() {
  document.getElementById('memo-panel').style.display = 'block';
}
function closeMemoPanel() {
  document.getElementById('memo-panel').style.display = 'none';
}

// ── 파일 첨부 ──
function handleMemoFile(e) {
  const file = e.target.files[0]; if (!file) return;
  closeMemoPanel();
  uploadMemoImage(file);
  e.target.value = '';
}

// ── 클립보드 붙여넣기 ──
async function handleMemoPaste() {
  closeMemoPanel();
  try {
    const items = await navigator.clipboard.read();
    for (const item of items) {
      const imgType = item.types.find(t => t.startsWith('image/'));
      if (imgType) {
        const blob = await item.getType(imgType);
        const file = new File([blob], 'paste_' + Date.now() + '.png', { type: imgType });
        uploadMemoImage(file);
        return;
      }
    }
    showToast('클립보드에 이미지가 없어요');
  } catch(e) {
    showToast('클립보드 접근 실패 (권한 확인)');
  }
}

// ── Ctrl+V 전역 리스너 (PC) ──
document.addEventListener('paste', (e) => {
  // 학습화면 뒷면이고, 그림판 모달이 닫혀있을 때만 동작
  if (!state.studyFlipped) return;
  if (document.getElementById('draw-modal').style.display !== 'none') return;
  const items = e.clipboardData?.items;
  if (!items) return;
  for (const item of items) {
    if (item.type.startsWith('image/')) {
      const file = item.getAsFile();
      if (file) { closeMemoPanel(); uploadMemoImage(file); }
      return;
    }
  }
});

// ── 이미지 업로드 공통 처리 ──
async function uploadMemoImage(file) {
  const card = state.studyQueue[state.studyIdx]; if (!card) return;
  const cardId = card.card_id || card.id;
  showLoading('메모 저장 중...');
  try {
    // 기존 이미지 있으면 Storage에서 삭제
    if (card.image_url) {
      await sbDeleteImage(card.image_url).catch(() => {});
    }
    // 이미지 리사이즈 후 업로드
    const resized = await resizeImage(file, 1200);
    const path = `${state.user.sub}/${cardId}_${Date.now()}.jpg`;
    const url = await sbUploadImage(path, resized);
    // cards 테이블 업데이트
    await sbUpdate('cards', `card_id=eq.${cardId}`, { image_url: url });
    // 로컬 state 업데이트
    card.image_url = url;
    const deckId = state._starredMode ? card._deckId : (state.studyDeck.deck_id||state.studyDeck.id);
    const deck = state.decks.find(d => (d.deck_id||d.id) === deckId);
    if (deck) { const idx = deck.cards.findIndex(c => (c.card_id||c.id) === cardId); if (idx !== -1) deck.cards[idx].image_url = url; }
    showToast('메모 저장 완료!');
    renderMemoArea();
  } catch(e) { showToast('저장 실패: ' + e.message); } finally { hideLoading(); }
}

// ── 메모 삭제 ──
async function deleteMemo() {
  const card = state.studyQueue[state.studyIdx]; if (!card?.image_url) return;
  if (!confirm('메모를 삭제할까요?')) return;
  const cardId = card.card_id || card.id;
  showLoading('삭제 중...');
  try {
    await sbDeleteImage(card.image_url).catch(() => {});
    await sbUpdate('cards', `card_id=eq.${cardId}`, { image_url: null });
    card.image_url = null;
    const deckId = state._starredMode ? card._deckId : (state.studyDeck.deck_id||state.studyDeck.id);
    const deck = state.decks.find(d => (d.deck_id||d.id) === deckId);
    if (deck) { const idx = deck.cards.findIndex(c => (c.card_id||c.id) === cardId); if (idx !== -1) deck.cards[idx].image_url = null; }
    showToast('삭제 완료!');
    renderMemoArea();
  } catch(e) { showToast('삭제 실패: ' + e.message); } finally { hideLoading(); }
}

// ── 전체보기 모달 ──
function openMemoFull() {
  const card = state.studyQueue[state.studyIdx]; if (!card?.image_url) return;
  document.getElementById('memo-full-img').src = card.image_url;
  document.getElementById('memo-full-modal').style.display = 'flex';
}
function closeMemoFull() { document.getElementById('memo-full-modal').style.display = 'none'; }

// ── 이미지 리사이즈 (canvas) ──
function resizeImage(file, maxWidth) {
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const ratio = Math.min(1, maxWidth / img.width);
      const w = Math.round(img.width * ratio);
      const h = Math.round(img.height * ratio);
      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      canvas.getContext('2d').drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(url);
      canvas.toBlob(blob => resolve(blob), 'image/jpeg', 0.85);
    };
    img.src = url;
  });
}

// ════════════════════════════════════════════════
// 그림판
// ════════════════════════════════════════════════
let _draw = {
  ctx: null, painting: false,
  color: '#111111', size: 4, eraser: false,
  history: [], lastX: 0, lastY: 0
};

function openDrawModal() {
  closeMemoPanel();
  document.getElementById('draw-modal').style.display = 'flex';
  const canvas = document.getElementById('draw-canvas');
  // 캔버스 실제 픽셀 크기 설정
  const w = canvas.offsetWidth || 360;
  canvas.width = w * window.devicePixelRatio;
  canvas.height = Math.round(w * 0.65) * window.devicePixelRatio;
  canvas.style.height = Math.round(w * 0.65) + 'px';
  _draw.ctx = canvas.getContext('2d');
  _draw.ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
  _draw.ctx.fillStyle = '#ffffff';
  _draw.ctx.fillRect(0, 0, w, w * 0.65);
  _draw.ctx.lineCap = 'round';
  _draw.ctx.lineJoin = 'round';
  _draw.history = [];
  _draw.eraser = false;
  _draw.color = '#111111';
  _draw.size = 4;
  document.getElementById('draw-size-slider').value = 4;
  document.getElementById('draw-size-label').textContent = '4';
  document.getElementById('draw-eraser-btn').style.background = '';
  document.querySelectorAll('.draw-color-btn').forEach(b => b.style.border = '2px solid transparent');
  document.querySelector('.draw-color-btn[data-color="#111111"]').style.border = '2px solid var(--accent)';

  // 이벤트 등록
  canvas.onpointerdown = drawStart;
  canvas.onpointermove = drawMove;
  canvas.onpointerup   = drawEnd;
  canvas.onpointercancel = drawEnd;
  canvas.onpointerleave  = drawEnd;
}
function closeDrawModal() { document.getElementById('draw-modal').style.display = 'none'; }

function _getPos(e) {
  const canvas = document.getElementById('draw-canvas');
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.offsetWidth  ? 1 : 1;
  const scaleY = canvas.offsetHeight ? 1 : 1;
  const src = e.touches ? e.touches[0] : e;
  return { x: (src.clientX - rect.left) * scaleX, y: (src.clientY - rect.top) * scaleY };
}
function drawStart(e) {
  e.preventDefault();
  _draw.painting = true;
  const pos = _getPos(e);
  _draw.lastX = pos.x; _draw.lastY = pos.y;
  // 획 시작 전 스냅샷 저장 (되돌리기용, 최대 30개)
  const canvas = document.getElementById('draw-canvas');
  const w = canvas.offsetWidth, h = canvas.offsetHeight;
  _draw.history.push(_draw.ctx.getImageData(0, 0, canvas.width, canvas.height));
  if (_draw.history.length > 30) _draw.history.shift();
}
function drawMove(e) {
  e.preventDefault();
  if (!_draw.painting) return;
  const pos = _getPos(e);
  const pressure = (e.pressure && e.pressure > 0) ? e.pressure : 0.5;
  const size = _draw.eraser ? _draw.size * 4 : _draw.size * (0.5 + pressure);
  _draw.ctx.beginPath();
  _draw.ctx.moveTo(_draw.lastX, _draw.lastY);
  _draw.ctx.lineTo(pos.x, pos.y);
  _draw.ctx.strokeStyle = _draw.eraser ? '#ffffff' : _draw.color;
  _draw.ctx.lineWidth = size;
  _draw.ctx.stroke();
  _draw.lastX = pos.x; _draw.lastY = pos.y;
}
function drawEnd(e) { _draw.painting = false; }

function setDrawColor(btn) {
  _draw.color = btn.dataset.color; _draw.eraser = false;
  document.querySelectorAll('.draw-color-btn').forEach(b => b.style.border = '2px solid transparent');
  btn.style.border = '2px solid var(--accent)';
  document.getElementById('draw-eraser-btn').style.background = '';
}
function setDrawSize(v) {
  _draw.size = parseInt(v);
  document.getElementById('draw-size-label').textContent = v;
}
function toggleDrawEraser() {
  _draw.eraser = !_draw.eraser;
  document.getElementById('draw-eraser-btn').style.background = _draw.eraser ? 'var(--accent-subtle2)' : '';
}
function undoDraw() {
  if (!_draw.history.length) return;
  const canvas = document.getElementById('draw-canvas');
  _draw.ctx.putImageData(_draw.history.pop(), 0, 0);
}
function clearDraw() {
  const canvas = document.getElementById('draw-canvas');
  _draw.history.push(_draw.ctx.getImageData(0, 0, canvas.width, canvas.height));
  _draw.ctx.fillStyle = '#ffffff';
  _draw.ctx.fillRect(0, 0, canvas.offsetWidth, canvas.offsetHeight);
}
function saveDrawing() {
  const canvas = document.getElementById('draw-canvas');
  canvas.toBlob(blob => {
    if (!blob) { showToast('저장 실패'); return; }
    const file = new File([blob], 'drawing_' + Date.now() + '.jpg', { type: 'image/jpeg' });
    closeDrawModal();
    uploadMemoImage(file);
  }, 'image/jpeg', 0.85);
}

// Ctrl+Z 단축키 (그림판 열려있을 때)
document.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
    if (document.getElementById('draw-modal').style.display !== 'none') {
      e.preventDefault(); undoDraw();
    }
  }
});
