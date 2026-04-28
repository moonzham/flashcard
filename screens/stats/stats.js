// ════════════════════════════════════════════════
// 통계 화면
// ════════════════════════════════════════════════
function showStats() { renderStats(); showScreen('stats'); }

async function renderStats() {
  const list = document.getElementById('stats-list'); list.innerHTML = '';
  if (!state.decks.length) { list.innerHTML = '<div style="color:var(--muted);text-align:center;padding:40px 0;font-size:14px">덱이 없어요</div>'; return; }

  const uid = state.user.sub;
  const deckIds = state.decks.map(d => d.deck_id||d.id).join(',');
  const sessions = await sbSelect('study_sessions', `user_id=eq.${uid}&deck_id=in.(${deckIds})&order=studied_at.desc&limit=50`).catch(() => []);

  state.decks.forEach(deck => {
    const did = deck.deck_id||deck.id;
    const total = deck.cards.length;
    const know  = deck.cards.filter(c => (state.cardProgress[c.card_id||c.id]||{}).status === 'know').length;
    const maybe = deck.cards.filter(c => (state.cardProgress[c.card_id||c.id]||{}).status === 'maybe').length;
    const dont  = deck.cards.filter(c => (state.cardProgress[c.card_id||c.id]||{}).status === 'dont').length;
    const deckSessions = (sessions||[]).filter(s => s.deck_id === did).slice(0, 5);
    const sessHtml = deckSessions.length
      ? `<div class="section-title" style="margin-top:12px">최근 학습 기록</div>${deckSessions.map(s =>
          `<div class="session-item"><span class="session-date">${s.studied_at}${!s.completed?' (미완료)':''}</span><div class="session-scores"><span style="color:#16a34a">✅${s.know_count}</span><span style="color:#d97706">💭${s.maybe_count}</span><span style="color:#e53e3e">😅${s.dont_count}</span></div></div>`
        ).join('')}` : '';
    const div = document.createElement('div'); div.className = 'stats-card';
    div.innerHTML = `<div class="stats-title">${deck.emoji} ${deck.name}</div>
      <div class="stats-row"><span class="stats-label">총 카드</span><span class="stats-val">${total}개</span></div>
      <div class="stats-row"><span class="stats-label">✅ 알았어요</span><span class="stats-val" style="color:#16a34a">${know}개</span></div>
      <div class="stats-row"><span class="stats-label">💭 애매해요</span><span class="stats-val" style="color:#d97706">${maybe}개</span></div>
      <div class="stats-row"><span class="stats-label">😅 몰랐어요</span><span class="stats-val" style="color:#e53e3e">${dont}개</span></div>
      <div class="stats-row"><span class="stats-label">총 학습 횟수</span><span class="stats-val">${deck.total_sessions||0}회</span></div>
      <div class="stats-row"><span class="stats-label">마지막 학습</span><span class="stats-val">${deck.last_studied||'-'}</span></div>${sessHtml}`;
    list.appendChild(div);
  });
}
