// ════════════════════════════════════════════════
// 덱 추가 / 편집
// ════════════════════════════════════════════════
function showAddDeck(deckId) {
  state.editingDeckId = deckId || null; state.selectedEmoji = '📚'; state.cardInputs = [];
  document.getElementById('adddeck-title').textContent = deckId ? '덱 편집' : '새 덱 만들기';
  document.getElementById('delete-deck-btn').style.display = deckId ? 'block' : 'none';
  document.getElementById('csv-download-btn').style.display = deckId ? 'block' : 'none';
  document.getElementById('csv-text').textContent = '파일 선택 (CSV 또는 TXT)';
  document.getElementById('csv-text').style.color = 'var(--muted)';
  document.getElementById('csv-input').value = '';
  const emojiRow = document.getElementById('emoji-row'); emojiRow.innerHTML = '';
  EMOJIS.forEach(e => {
    const btn = document.createElement('button');
    btn.className = 'emoji-btn' + (e === state.selectedEmoji ? ' selected' : '');
    btn.textContent = e;
    btn.onclick = () => { state.selectedEmoji = e; document.querySelectorAll('.emoji-btn').forEach(b => b.classList.remove('selected')); btn.classList.add('selected'); };
    emojiRow.appendChild(btn);
  });
  if (deckId) {
    const deck = state.decks.find(d => (d.deck_id||d.id) === deckId);
    document.getElementById('deck-name-input').value = deck.name;
    state.selectedEmoji = deck.emoji;
    document.querySelectorAll('.emoji-btn').forEach(b => b.classList.toggle('selected', b.textContent === deck.emoji));
    if (!deck.cards || deck.cards.length === 0) {
      showLoading('카드 불러오는 중...');
      loadDeckCards(deckId).then(() => {
        state.cardInputs = deck.cards.map(c => ({...c, id: c.card_id||c.id}));
        renderCardInputs(); hideLoading();
      }).catch(() => { showToast('카드 로드 실패'); hideLoading(); });
    } else {
      state.cardInputs = deck.cards.map(c => ({...c, id: c.card_id||c.id}));
    }
  } else {
    document.getElementById('deck-name-input').value = '';
    state.cardInputs = [{id: 'card_' + Date.now(), front: '', back: '', hint: ''}];
  }
  renderCardInputs(); showScreen('adddeck');
}

function editDeck(id) { showAddDeck(id); }

function renderCardInputs() {
  const container = document.getElementById('card-inputs'); container.innerHTML = '';
  state.cardInputs.forEach((card, i) => {
    const div = document.createElement('div'); div.className = 'card-item';
    div.innerHTML = `<div class="card-item-header"><span class="card-item-num">카드 ${i+1}</span>${state.cardInputs.length > 1 ? `<button class="remove-btn" onclick="removeCardInput(${i})">✕</button>` : ''}</div>
      <input class="form-input" style="margin-bottom:8px" placeholder="앞면 (문제/설명)" value="${escHtml(card.front)}" oninput="state.cardInputs[${i}].front=this.value">
      <input class="form-input" style="margin-bottom:8px" placeholder="뒷면 (정답)" value="${escHtml(card.back)}" oninput="state.cardInputs[${i}].back=this.value">
      <input class="form-input" style="margin-bottom:0" placeholder="힌트 (선택)" value="${escHtml(card.hint||'')}" oninput="state.cardInputs[${i}].hint=this.value">`;
    container.appendChild(div);
  });
}
function addCardInput() { state.cardInputs.push({id: 'card_' + Date.now() + Math.random(), front: '', back: '', hint: ''}); renderCardInputs(); }
function removeCardInput(i) { state.cardInputs.splice(i, 1); renderCardInputs(); }

function handleCSV(e) {
  const file = e.target.files[0]; if (!file) return;
  const nameInput = document.getElementById('deck-name-input');
  if (!nameInput.value.trim()) { nameInput.value = file.name.replace(/\.[^/.]+$/, ''); }
  const reader = new FileReader();
  reader.onload = ev => {
    const lines = ev.target.result.split(/\r?\n/).filter(l => l.trim());
    const cards = lines.map((line, idx) => { const p = parseCSVLine(line); return {id: 'card_' + Date.now() + idx, front: p[0]||'', back: p[1]||'', hint: p[2]||''}; }).filter(c => c.front && c.back);
    if (!cards.length) { alert('유효한 카드가 없어요'); return; }
    state.cardInputs = cards; renderCardInputs();
    const txt = document.getElementById('csv-text'); txt.textContent = `✅ ${cards.length}개 카드 불러옴`; txt.style.color = '#16a34a';
  };
  reader.readAsText(file, 'UTF-8');
}

async function saveDeck() {
  const name = document.getElementById('deck-name-input').value.trim();
  if (!name) { alert('덱 이름을 입력해주세요'); return; }
  const valid = state.cardInputs.filter(c => c.front.trim() && c.back.trim());
  if (!valid.length) { alert('카드를 최소 1개 입력해주세요'); return; }
  showLoading('저장 중...');
  try {
    const uid = state.user.sub;
    if (state.editingDeckId) {
      await sbUpdate('decks', `deck_id=eq.${state.editingDeckId}`, { name, emoji: state.selectedEmoji });
      await sbDelete('cards', `deck_id=eq.${state.editingDeckId}`);
      const cardRows = valid.map((c, i) => ({ deck_id: state.editingDeckId, front: c.front, back: c.back, hint: c.hint||null, sort_order: i }));
      const newCards = await sbInsert('cards', cardRows);
      const idx = state.decks.findIndex(d => (d.deck_id||d.id) === state.editingDeckId);
      if (idx !== -1) {
        const updatedCards = (newCards||[]).map(c => ({...c, id: c.card_id}));
        state.decks[idx] = { ...state.decks[idx], name, emoji: state.selectedEmoji, cards: updatedCards };
        cleanOrphanProgress(state.editingDeckId, updatedCards.map(c => c.card_id));
      }
    } else {
      const [newDeck] = await sbInsert('decks', { user_id: uid, name, emoji: state.selectedEmoji });
      const cardRows = valid.map((c, i) => ({ deck_id: newDeck.deck_id, front: c.front, back: c.back, hint: c.hint||null, sort_order: i }));
      const newCards = await sbInsert('cards', cardRows);
      state.decks.push({ ...newDeck, id: newDeck.deck_id, cards: (newCards||[]).map(c => ({...c, id: c.card_id})) });
    }
    showSyncDone(); showToast('저장 완료!'); showHome();
  } catch(e) { showToast('저장 실패: ' + e.message); } finally { hideLoading(); }
}

async function deleteDeck() {
  if (!confirm('이 덱을 삭제할까요?')) return;
  showLoading('삭제 중...');
  try {
    // 카드에 첨부된 이미지 스토리지에서 삭제
    const deck = state.decks.find(d => (d.deck_id||d.id) === state.editingDeckId);
    if (deck && deck.cards && deck.cards.length > 0) {
      const imageUrls = deck.cards.map(c => c.image_url).filter(Boolean);
      await Promise.allSettled(imageUrls.map(url => sbDeleteImage(url)));
    }
    await sbDelete('decks', `deck_id=eq.${state.editingDeckId}`);
    state.decks = state.decks.filter(d => (d.deck_id||d.id) !== state.editingDeckId);
    showToast('삭제 완료!'); showHome();
  } catch(e) { showToast('삭제 실패: ' + e.message); } finally { hideLoading(); }
}

// UTF-8 BOM 포함 CSV 다운로드 — Windows Excel / 갤럭시 한글 깨짐 방지
function downloadCSV() {
  const deck = state.decks.find(d => (d.deck_id||d.id) === state.editingDeckId); if (!deck) return;
  const rows = deck.cards.map(c => {
    const esc = s => `"${String(s).replace(/"/g, '""')}"`;
    return [esc(c.front), esc(c.back), esc(c.hint||'')].join(',');
  });
  const csv = rows.join('\r\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `${deck.name}.csv`;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 3000);
}
