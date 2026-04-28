// ════════════════════════════════════════════════
// 테마
// ════════════════════════════════════════════════
// fc_theme: 'light' | 'dark' | 'system' — localStorage에 영구 저장
// 절대 키 이름 변경 금지 (변경 시 사용자 설정 초기화됨)
function applyTheme(t) {
  const pref = t === 'system' ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : t;
  document.documentElement.setAttribute('data-theme', pref);
  document.querySelectorAll('.theme-btn').forEach(b => b.classList.remove('active'));
  const el = document.getElementById('theme-btn-' + t);
  if (el) el.classList.add('active');
}
function setTheme(t) { localStorage.setItem('fc_theme', t); applyTheme(t); }
function loadTheme() { applyTheme(localStorage.getItem('fc_theme') || 'system'); }
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
  if ((localStorage.getItem('fc_theme') || 'system') === 'system') applyTheme('system');
});

// ════════════════════════════════════════════════
// 로딩 / 토스트 / 동기화 표시
// ════════════════════════════════════════════════
function showLoading(txt) {
  document.getElementById('loading-text').textContent = txt || '처리 중...';
  document.getElementById('loading-overlay').style.display = 'flex';
}
function hideLoading() {
  document.getElementById('loading-overlay').style.display = 'none';
}
function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2500);
}
function showSyncDone() {
  const el = document.getElementById('sync-indicator');
  el.style.display = 'inline';
  setTimeout(() => el.style.display = 'none', 2000);
}

// ════════════════════════════════════════════════
// 화면 전환
// ════════════════════════════════════════════════
function showLoginScreen() {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById('screen-login').style.display = 'flex';
}
// 화면 전환 + 탭바 활성화 + 브라우저 히스토리 push (뒤로가기 지원)
function showScreen(id) {
  document.getElementById('screen-login').style.display = 'none';
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById('screen-' + id).classList.add('active');
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  const map = { home: 'tab-home', starred: 'tab-starred', stats: 'tab-stats' };
  if (map[id]) document.getElementById(map[id]).classList.add('active');
  document.getElementById('tab-bar').style.display = ['home','starred','stats'].includes(id) ? 'flex' : 'none';
  history.pushState({ screen: id }, '', '');
}
window.addEventListener('popstate', (e) => {
  const id = e.state?.screen;
  if (!id) { showHome(); return; }
  if (id === 'study') { exitStudy(); return; }
  if (id === 'settings') { showHome(); return; }
  if (id === 'adddeck') { showHome(); return; }
  if (id === 'home') { showHome(); return; }
  if (id === 'starred') { showStarred(); return; }
  if (id === 'stats') { showStats(); return; }
  showHome();
});

// 유저 헤더 렌더링
function renderUserHeader() {
  const wrap = document.getElementById('user-avatar-wrap');
  const nameEl = document.getElementById('user-name-text');
  if (!state.user) return;
  wrap.innerHTML = state.user.picture
    ? `<img class="user-avatar" src="${state.user.picture}" referrerpolicy="no-referrer">`
    : `<div class="user-avatar-ph">${(state.user.name||'?')[0].toUpperCase()}</div>`;
  nameEl.textContent = state.user.name || state.user.email || '';
}

// ════════════════════════════════════════════════
// 유틸
// ════════════════════════════════════════════════
// 텍스트 길이에 따라 카드 글자 크기 자동 조정
function setFontSize(el, text) {
  const len = text.length;
  if (len <= 20) el.style.fontSize = '22px';
  else if (len <= 40) el.style.fontSize = '18px';
  else if (len <= 70) el.style.fontSize = '15px';
  else el.style.fontSize = '13px';
}
// CSV 한 줄 파싱 (따옴표 안의 쉼표/개행 처리 포함)
function parseCSVLine(line) {
  const fields = []; let cur = '', inQuote = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') { if (inQuote && line[i+1] === '"') { cur += '"'; i++; } else { inQuote = !inQuote; } }
    else if (ch === ',' && !inQuote) { fields.push(cur.trim()); cur = ''; }
    else { cur += ch; }
  }
  fields.push(cur.trim()); return fields;
}
// HTML 특수문자 이스케이프 (XSS 방지)
function escHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
