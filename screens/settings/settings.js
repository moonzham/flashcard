// ════════════════════════════════════════════════
// 설정 화면
// ════════════════════════════════════════════════
function showSettings() {
  const t = localStorage.getItem('fc_theme') || 'system';
  document.querySelectorAll('.theme-btn').forEach(b => b.classList.remove('active'));
  const el = document.getElementById('theme-btn-' + t); if (el) el.classList.add('active');
  showScreen('settings');
}
