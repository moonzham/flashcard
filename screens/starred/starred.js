// ════════════════════════════════════════════════
// 별표 화면
// ════════════════════════════════════════════════
function showStarred() { renderStarred(); showScreen('starred'); }

function renderStarred() {
  const list = document.getElementById('starred-list'); list.innerHTML = ''; let found = false;
  state.decks.forEach(deck => {
    const starred = deck.cards.filter(c => (state.cardProgress[c.card_id||c.id]||{}).starred);
    if (!starred.length) return; found = true;
    const h = document.createElement('div'); h.className = 'section-title'; h.textContent = deck.emoji + ' ' + deck.name; list.appendChild(h);
    starred.forEach(card => {
      const div = document.createElement('div'); div.className = 'starred-card'; div.style.cursor = 'pointer';
      div.innerHTML = `<span style="font-size:18px">⭐</span><div><div style="font-weight:700;font-size:14px">${card.front}</div><div style="font-size:12px;color:var(--muted);margin-top:2px">${card.back}</div></div>`;
      div.onclick = () => startStarredStudyFrom(deck, card);
      list.appendChild(div);
    });
  });
  if (!found) list.innerHTML = '<div style="color:var(--muted);text-align:center;padding:40px 0;font-size:14px">별표 카드가 없어요</div>';
}

function startStarredStudy() {
  const allStarred = [];
  state.decks.forEach(deck => {
    deck.cards.filter(c => (state.cardProgress[c.card_id||c.id]||{}).starred)
      .forEach(c => allStarred.push({...c, id: c.card_id||c.id, _deckId: deck.deck_id||deck.id}));
  });
  if (!allStarred.length) { showToast('별표 카드가 없어요'); return; }
  _launchStarredSession(allStarred, 0);
}

function startStarredStudyFrom(deck, startCard) {
  const starred = deck.cards.filter(c => (state.cardProgress[c.card_id||c.id]||{}).starred)
    .map(c => ({...c, id: c.card_id||c.id, _deckId: deck.deck_id||deck.id}));
  const idx = starred.findIndex(c => c.id === (startCard.card_id||startCard.id));
  _launchStarredSession(starred, idx < 0 ? 0 : idx);
}

function _launchStarredSession(cards, startIdx) {
  state.studyDeck = { id: '__starred__', name: '별표 카드' };
  state.studyQueue = cards;
  state.studyIdx = startIdx;
  state.studyResults = {know:0, maybe:0, dont:0};
  state._starredMode = true;
  document.getElementById('study-deck-name').textContent = '⭐ 별표 카드';
  showScreen('study'); renderStudyCard();
}
