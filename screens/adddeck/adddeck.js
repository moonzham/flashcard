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
  // 카드 이동 모드 초기화 (덱을 다른 걸로 옮겨 다니거나 새로 진입할 때 이전 상태 안 남게)
  _cardMoveMode = false;
  document.getElementById('card-move-bar').style.display = 'none';
  const editBtn = document.getElementById('card-edit-toggle-btn');
  editBtn.textContent = '이동 편집';
  editBtn.style.display = (deckId && state.decks.length > 1) ? 'inline-block' : 'none';
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

// ── 카드 이동 모드 ──
let _cardMoveMode = false;
// ── 카드 순서 드래그 정렬 (SortableJS) ──
let _cardSortable = null;

function renderCardInputs() {
  const container = document.getElementById('card-inputs'); container.innerHTML = '';
  state.cardInputs.forEach((card, i) => {
    const div = document.createElement('div'); div.className = 'card-item';
    const memoIcon = card.image_url ? ' 🖼️' : '';
    // 이동모드일 땐 체크박스, 평소엔 드래그 핸들 표시 (동시에 안 보이게 서로 배타적)
    const leadingIcon = _cardMoveMode
      ? (card.card_id
          ? `<input type="checkbox" ${card.checked ? 'checked' : ''} onchange="toggleCardCheck(${i})" style="width:18px;height:18px;margin-right:8px;vertical-align:middle;accent-color:var(--accent)">`
          : `<span style="font-size:11px;color:var(--muted);margin-right:8px">(저장 후 이동 가능)</span>`)
      : `<span class="drag-handle" style="cursor:grab;color:var(--muted);font-size:16px;margin-right:10px;touch-action:none;user-select:none">⠿</span>`;
    const removeBtn = (!_cardMoveMode && state.cardInputs.length > 1) ? `<button class="remove-btn" onclick="removeCardInput(${i})">✕</button>` : '';
    div.innerHTML = `<div class="card-item-header">${leadingIcon}<span class="card-item-num" style="cursor:pointer;text-decoration:underline;text-underline-offset:3px" onclick="openCardMemo(${i})">카드 ${i+1}${memoIcon}</span>${removeBtn}</div>
      <input class="form-input" style="margin-bottom:8px" placeholder="앞면 (문제/설명)" value="${escHtml(card.front)}" oninput="state.cardInputs[${i}].front=this.value">
      <input class="form-input" style="margin-bottom:8px" placeholder="뒷면 (정답)" value="${escHtml(card.back)}" oninput="state.cardInputs[${i}].back=this.value">
      <input class="form-input" style="margin-bottom:0" placeholder="힌트 (선택)" value="${escHtml(card.hint||'')}" oninput="state.cardInputs[${i}].hint=this.value">`;
    container.appendChild(div);
  });
  initCardSortable();
}

// 드래그로 카드 순서 바꾸기 (SortableJS) — 인스턴스는 한 번만 생성, 이후엔 disabled만 토글
function initCardSortable() {
  if (typeof Sortable === 'undefined') return; // 라이브러리 로드 실패 시에도 앱이 안 깨지도록 방어
  const container = document.getElementById('card-inputs');
  if (_cardSortable) { _cardSortable.option('disabled', _cardMoveMode); return; }
  _cardSortable = Sortable.create(container, {
    handle: '.drag-handle',
    animation: 150,
    disabled: _cardMoveMode, // 이동모드(체크박스 선택) 중엔 드래그 비활성화
    onEnd: (evt) => {
      if (evt.oldIndex === evt.newIndex) return;
      const [moved] = state.cardInputs.splice(evt.oldIndex, 1);
      state.cardInputs.splice(evt.newIndex, 0, moved);
      renderCardInputs(); // 순서만 배열에서 바꾸고 다시 그림 (저장은 '저장하기' 누를 때 반영)
    }
  });
}
function addCardInput() { state.cardInputs.push({id: 'card_' + Date.now() + Math.random(), front: '', back: '', hint: ''}); renderCardInputs(); }
function removeCardInput(i) { state.cardInputs.splice(i, 1); renderCardInputs(); }

// 이동 편집 모드 토글
function toggleCardMoveMode() {
  _cardMoveMode = !_cardMoveMode;
  document.getElementById('card-edit-toggle-btn').textContent = _cardMoveMode ? '✕ 취소' : '이동 편집';
  document.getElementById('card-move-bar').style.display = _cardMoveMode ? 'block' : 'none';
  if (_cardMoveMode) populateMoveTargetSelect();
  state.cardInputs.forEach(c => c.checked = false);
  renderCardInputs();
  updateMoveSelectedCount();
}

// 이동 대상 덱 셀렉트박스 채우기 (현재 편집 중인 덱 자신은 제외)
function populateMoveTargetSelect() {
  const sel = document.getElementById('move-target-deck'); sel.innerHTML = '';
  state.decks.filter(d => (d.deck_id||d.id) !== state.editingDeckId).forEach(d => {
    const opt = document.createElement('option');
    opt.value = d.deck_id||d.id;
    opt.textContent = `${d.emoji} ${d.name}`;
    sel.appendChild(opt);
  });
}

function toggleCardCheck(i) { state.cardInputs[i].checked = !state.cardInputs[i].checked; updateMoveSelectedCount(); }
function updateMoveSelectedCount() {
  const el = document.getElementById('move-selected-count');
  if (el) el.textContent = state.cardInputs.filter(c => c.checked).length;
}

// 이동 버튼 클릭 → 재확인 후 실제 이동 실행
function requestMoveCards() {
  const selected = state.cardInputs.filter(c => c.checked && c.card_id);
  if (!selected.length) { alert('이동할 카드를 선택해주세요'); return; }
  const targetId = document.getElementById('move-target-deck').value;
  const targetDeck = state.decks.find(d => (d.deck_id||d.id) === targetId);
  if (!targetDeck) { alert('이동할 덱을 선택해주세요'); return; }
  if (!confirm(`${selected.length}개의 카드를 "${targetDeck.name}" 덱으로 이동할까요?`)) return;
  moveCardsToDeck(selected, targetId);
}

// 실제 카드 이동: cards.deck_id / card_progress.deck_id 갱신, sort_order 재배치, 로컬 state 동기화
async function moveCardsToDeck(selectedCards, targetDeckId) {
  showLoading('카드 이동 중...');
  try {
    const sourceDeckId = state.editingDeckId;
    const targetDeck = state.decks.find(d => (d.deck_id||d.id) === targetDeckId);
    const startOrder = (targetDeck.cards || []).length;

    await Promise.all(selectedCards.map((c, idx) =>
      sbUpdate('cards', `card_id=eq.${c.card_id}`, { deck_id: targetDeckId, sort_order: startOrder + idx })
    ));
    const cardIds = selectedCards.map(c => c.card_id);
    await sbUpdate('card_progress', `card_id=in.(${cardIds.join(',')})`, { deck_id: targetDeckId }).catch(() => {});

    // 로컬 state 갱신 — 원래 덱에서 제거, 새 덱에 추가
    const sourceDeck = state.decks.find(d => (d.deck_id||d.id) === sourceDeckId);
    if (sourceDeck) sourceDeck.cards = (sourceDeck.cards||[]).filter(c => !cardIds.includes(c.card_id||c.id));
    targetDeck.cards = targetDeck.cards || [];
    selectedCards.forEach((c, idx) => {
      const { checked, ...clean } = c;
      targetDeck.cards.push({ ...clean, deck_id: targetDeckId, sort_order: startOrder + idx, id: c.card_id });
    });
    state.cardInputs = state.cardInputs.filter(c => !cardIds.includes(c.card_id));

    showSyncDone(); showToast(`${selectedCards.length}개 카드 이동 완료!`);
    toggleCardMoveMode(); // 이동 모드 종료 + 화면 갱신
  } catch(e) {
    showToast('이동 실패: ' + e.message);
  } finally { hideLoading(); }
}

// 카드 번호 클릭 → 해당 카드로 이동해서 메모(이미지) 추가/확인
// 저장 안 된 변경사항이 있으면 막지 않고, 저장할지 확인 후 저장까지 마치고 이동
function openCardMemo(i) {
  const card = state.cardInputs[i];
  if (!card.front.trim() || !card.back.trim()) { alert('앞면과 뒷면을 먼저 입력해주세요'); return; }

  if (hasUnsavedDeckChanges()) {
    const wantSave = confirm('저장되지 않은 변경사항이 있어요.\n저장한 후 이 카드로 이동할까요?');
    if (!wantSave) return;

    // 저장 후에도 이 카드를 다시 찾을 수 있도록, 저장 시 부여될 sort_order(=valid 배열 내 순서) 기록
    const validBeforeSave = state.cardInputs.filter(c => c.front.trim() && c.back.trim());
    const targetSortOrder = validBeforeSave.indexOf(card);

    saveDeck(() => {
      const deck = state.decks.find(d => (d.deck_id||d.id) === state.editingDeckId);
      const savedCard = deck && deck.cards.find(c => (c.sort_order||0) === targetSortOrder);
      if (savedCard) { goToCardMemo(savedCard); }
      else { showToast('카드를 찾지 못했어요'); showAddDeck(state.editingDeckId); }
    });
    return;
  }

  goToCardMemo(card);
}

// 현재 입력 내용이 DB에 저장된 상태와 다른지 검사 (덱 이름/이모지/카드 목록 전체 비교)
function hasUnsavedDeckChanges() {
  if (!state.editingDeckId) return true; // 아직 생성 전인 새 덱
  const deck = state.decks.find(d => (d.deck_id||d.id) === state.editingDeckId);
  if (!deck) return true;
  const name = document.getElementById('deck-name-input').value.trim();
  if (name !== deck.name) return true;
  if (state.selectedEmoji !== deck.emoji) return true;
  const savedCards = deck.cards || [];
  if (state.cardInputs.length !== savedCards.length) return true;
  for (const c of state.cardInputs) {
    if (!c.card_id) return true;
    const orig = savedCards.find(o => (o.card_id||o.id) === c.card_id);
    if (!orig) return true;
    if (c.front !== orig.front || c.back !== orig.back || (c.hint||'') !== (orig.hint||'')) return true;
  }
  return false;
}

// 저장 완료된 카드 객체를 받아 학습화면(메모 전용 모드)으로 이동
function goToCardMemo(liveCard) {
  const deckId = state.editingDeckId;
  const deck = state.decks.find(d => (d.deck_id||d.id) === deckId);
  if (!deck) return;
  state.studyDeck = deck;
  state.studyQueue = [{ ...liveCard, id: liveCard.card_id||liveCard.id }];
  state.studyIdx = 0;
  state.studyResults = {know:0, maybe:0, dont:0};
  state.sessionAnswers = {};
  state._memoOnlyMode = true;       // 메모 전용 모드 (학습 통계/이어하기에 영향 안 주도록 방어)
  state._returnToAddDeck = deckId;  // 뒤로가기 시 편집화면으로 복귀
  document.getElementById('study-deck-name').textContent = deck.name;
  showScreen('study');
  renderStudyCard();
  flipCard();  // 바로 뒷면(정답+메모 영역) 오픈
}

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

async function saveDeck(afterSave) {
  const name = document.getElementById('deck-name-input').value.trim();
  if (!name) { alert('덱 이름을 입력해주세요'); return; }
  const valid = state.cardInputs.filter(c => c.front.trim() && c.back.trim());
  if (!valid.length) { alert('카드를 최소 1개 입력해주세요'); return; }
  showLoading('저장 중...');
  try {
    const uid = state.user.sub;
    if (state.editingDeckId) {
      await sbUpdate('decks', `deck_id=eq.${state.editingDeckId}`, { name, emoji: state.selectedEmoji });

      // 기존 카드(card_id 있음) vs 새 카드(card_id 없음) 분리
      const existingCards = valid.filter(c => c.card_id || (c.id && !String(c.id).startsWith('card_')));
      const newInputCards  = valid.filter(c => !c.card_id && (!c.id || String(c.id).startsWith('card_')));

      // 기존 카드 UPDATE (card_id 유지 → progress 보존)
      await Promise.all(existingCards.map(c => {
        const cardId = c.card_id || c.id;
        return sbUpdate('cards', `card_id=eq.${cardId}`, { front: c.front, back: c.back, hint: c.hint||null, sort_order: valid.indexOf(c) });
      }));

      // 새 카드 INSERT
      let inserted = [];
      if (newInputCards.length > 0) {
        const cardRows = newInputCards.map(c => ({ deck_id: state.editingDeckId, front: c.front, back: c.back, hint: c.hint||null, sort_order: valid.indexOf(c) }));
        inserted = await sbInsert('cards', cardRows) || [];
      }

      // 삭제된 카드 처리 (편집 전 카드 중 valid에 없는 것)
      const deck = state.decks.find(d => (d.deck_id||d.id) === state.editingDeckId);
      const prevCardIds = (deck?.cards || []).map(c => c.card_id||c.id);
      const keptCardIds = existingCards.map(c => c.card_id||c.id);
      const deletedCardIds = prevCardIds.filter(id => !keptCardIds.includes(id));
      if (deletedCardIds.length > 0) {
        await sbDelete('cards', `card_id=in.(${deletedCardIds.join(',')})`);
        await sbDelete('card_progress', `card_id=in.(${deletedCardIds.join(',')})`).catch(() => {});
        deletedCardIds.forEach(cid => delete state.cardProgress[cid]);
      }

      // 로컬 state 업데이트 — valid 배열의 '지금 순서' 그대로 재구성 (옛 sort_order로 재정렬하지 않음)
      const idx = state.decks.findIndex(d => (d.deck_id||d.id) === state.editingDeckId);
      if (idx !== -1) {
        const insertedBySortOrder = {};
        inserted.forEach(row => { insertedBySortOrder[row.sort_order] = row; });
        const updatedCards = valid.map((c, i) => {
          const isExisting = c.card_id || (c.id && !String(c.id).startsWith('card_'));
          if (isExisting) return { ...c, card_id: c.card_id||c.id, id: c.card_id||c.id, sort_order: i };
          const row = insertedBySortOrder[i];
          return row ? { ...row, id: row.card_id } : { ...c, sort_order: i };
        });
        state.decks[idx] = { ...state.decks[idx], name, emoji: state.selectedEmoji, cards: updatedCards };
      }
    } else {
      const [newDeck] = await sbInsert('decks', { user_id: uid, name, emoji: state.selectedEmoji });
      const cardRows = valid.map((c, i) => ({ deck_id: newDeck.deck_id, front: c.front, back: c.back, hint: c.hint||null, sort_order: i }));
      const newCards = await sbInsert('cards', cardRows);
      state.decks.push({ ...newDeck, id: newDeck.deck_id, cards: (newCards||[]).map(c => ({...c, id: c.card_id})) });
      state.editingDeckId = newDeck.deck_id; // 후속 작업(메모 이동 등)을 위해 편집 대상으로 전환
    }
    showSyncDone(); showToast('저장 완료!');
    if (typeof afterSave === 'function') { afterSave(); } else { showHome(); }
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
    // 카드 progress DB 삭제
    if (deck && deck.cards && deck.cards.length > 0) {
      const cardIds = deck.cards.map(c => c.card_id||c.id).filter(Boolean);
      if (cardIds.length > 0) {
        await sbDelete('card_progress', `card_id=in.(${cardIds.join(',')})`).catch(() => {});
      }
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
