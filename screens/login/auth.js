// ════════════════════════════════════════════════
// Google Identity Services (GIS) 초기화
// ════════════════════════════════════════════════
// google.accounts.id 단독 사용 (Drive 제거)
// id_token JWT 파싱 → user.sub을 Supabase RLS user_id로 사용

function initGIS() {
  google.accounts.id.initialize({
    client_id: CLIENT_ID,
    callback: async (credResp) => {
      const payload = JSON.parse(atob(credResp.credential.split('.')[1]));
      state.user = { name: payload.name, email: payload.email, picture: payload.picture, sub: payload.sub };
      state._supaToken = credResp.credential;
      saveUserToStorage({ ...state.user, _token: credResp.credential });
      showLoading('데이터 불러오는 중...');
      await loadAllData();
    },
    auto_select: true,
  });
  tryAutoLogin();
}

// 앱 시작 시 자동 로그인 시도
async function tryAutoLogin() {
  const saved = loadUserFromStorage();
  if (!saved) { showLoginScreen(); return; }
  state.user = { name: saved.name, email: saved.email, picture: saved.picture, sub: saved.sub };
  state._supaToken = saved._token;
  showLoading('로그인 중...');
  await loadAllData();
}

function signIn() {
  showLoading('Google 로그인 중...');
  google.accounts.id.prompt();
}

function signOut() {
  sessionStorage.removeItem('fc_user');
  Object.assign(state, { user: null, decks: [], cardProgress: {}, _supaToken: null });
  document.getElementById('tab-bar').style.display = 'none';
  showLoginScreen();
}
