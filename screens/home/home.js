// ════════════════════════════════════════════════
// 홈 화면
// ════════════════════════════════════════════════
function showHome() { renderHome(); showScreen('home'); }

function renderHome() {
  const list = document.getElementById('deck-list'); list.innerHTML = '';
  state.decks.forEach(deck => {
    const total = deck.cards.length;
    const learned = deck.cards.filter(c => (state.cardProgress[c.card_id||c.id]||{}).status === 'know').length;
    const pct = total ? Math.round(learned / total * 100) : 0;
    const last = deck.last_studied ? `마지막: ${deck.last_studied}` : '아직 학습 안 함';
    const hasPending = !!deck.pending_session;
    const div = document.createElement('div'); div.className = 'deck-card';
    div.innerHTML = `<span class="deck-emoji">${deck.emoji}</span>
      <div class="deck-info">
        <div class="deck-name">${deck.name}${hasPending ? '<span class="resume-badge">이어하기</span>' : ''}</div>
        <div class="deck-meta">${total}개 카드 · ${learned}/${total} 완료<br><span style="color:var(--muted);font-size:11px">${last}</span></div>
        <div class="progress-bar"><div class="progress-fill" style="width:${pct}%"></div></div>
      </div>
      <div style="display:flex;flex-direction:column;align-items:flex-end;gap:8px">
        <div class="deck-pct">${pct}%</div>
        <button onclick="event.stopPropagation();editDeck('${deck.deck_id||deck.id}')" style="background:none;border:1px solid var(--border);border-radius:8px;color:var(--muted);font-size:12px;cursor:pointer;padding:4px 10px;font-family:inherit">편집</button>
      </div>`;
    div.onclick = () => tryStartStudy(deck.deck_id||deck.id);
    list.appendChild(div);
  });
}
