// ════════════════════════════════════════════════
// 자동 듣기 모드 (연속 재생 엔진)
// ════════════════════════════════════════════════
// 흐름: 카드 front mp3 재생 → 간격 → back mp3 재생 → 간격 → 다음 카드 ...
// mp3는 ensureCardAudio()로 lazy 생성/재사용, 다음 카드는 재생 중 미리 생성(prefetch)

const _al = {
  deck: null,
  queue: [],
  idx: 0,
  phase: 'front',   // 'front' | 'back'
  playing: false,
  audio: null,      // 현재 재생 중인 Audio 객체
  timer: null,      // 간격(setTimeout) 핸들
  loop: true,       // 덱 끝나면 처음부터 반복
  preset: 'normal', // 5-B-1은 normal(일반 듣기)만 동작
  gapMs: 800,       // 발화 사이 간격
  seq: 0,           // 재생 세대 (정지 후 이전 콜백 무시용)
};

// ── 진입 (study.js의 startAutoListen에서 호출) ──
function openAutoListen(deck, cards) {
  _al.deck = deck;
  _al.queue = cards;
  _al.idx = 0;
  _al.phase = 'front';
  _al.playing = false;
  _al.preset = 'normal';
  _al.loop = true;

  document.getElementById('al-deck-info').textContent = `${deck.name} · ${cards.length}장`;

  // 덱 종류에 따라 옵션 UI 구성
  const dt = deck.deck_type || 'auto';
  const isForeign = (dt === 'en' || dt === 'jp');
  document.getElementById('al-preset-section').style.display = isForeign ? 'block' : 'none';
  document.getElementById('al-simple-section').style.display = 'block';
  if (isForeign) alSetPreset('normal', true);
  alUpdateLoopUI();

  showScreen('autolisten');
  alRenderCard();
  alPlay(); // 진입하자마자 재생 시작
}

// ── 화면 표시 ──
function alRenderCard() {
  const card = _al.queue[_al.idx]; if (!card) return;
  document.getElementById('al-progress').textContent = `${_al.idx + 1} / ${_al.queue.length}`;
  document.getElementById('al-front').textContent = card.front;
  document.getElementById('al-back').textContent = card.back;
  document.getElementById('al-hint').textContent = card.hint ? '🔊 ' + card.hint : '';
}

// ── 언어/텍스트 결정 ──
function alLang(side) {
  const d = _al.deck || {};
  return (side === 'front' ? d.front_lang : d.back_lang) || 'ko-KR';
}
function alTtsText(card, side) {
  if (side === 'back') return card.back;
  // front: 일본어 덱 + 한자 포함 + 힌트에 가나 → 요미가나(힌트)로 발음
  const dt = (_al.deck && _al.deck.deck_type) || 'auto';
  if (dt === 'jp' && /[\u4e00-\u9faf]/.test(card.front || '') && /[ぁ-んァ-ヶ]/.test(card.hint || '')) {
    return card.hint.trim();
  }
  return card.front;
}

// ── 재생 엔진 ──
async function alPlayPhase() {
  const mySeq = _al.seq;
  const card = _al.queue[_al.idx];
  if (!card || !_al.playing) return;
  alSetStatus(_al.phase === 'front' ? '앞면 재생 중...' : '정답 재생 중...');
  try {
    const url = await ensureCardAudio(card, _al.phase, alLang(_al.phase), false, alTtsText(card, _al.phase));
    if (mySeq !== _al.seq || !_al.playing) return; // 정지/변경됐으면 무시
    if (!url) { alAfterPhase(); return; } // 텍스트 없으면 스킵
    _al.audio = new Audio(url);
    _al.audio.onended = () => { if (mySeq === _al.seq) alAfterPhase(); };
    _al.audio.onerror = () => { if (mySeq === _al.seq) alAfterPhase(); };
    _al.audio.play().catch(() => { if (mySeq === _al.seq) alAfterPhase(); });
    alPrefetchNext(); // 재생하는 동안 다음 카드 mp3 미리 준비
  } catch (e) {
    console.error('자동듣기 재생 실패', e);
    if (mySeq === _al.seq) alAfterPhase(); // 실패해도 다음으로 진행
  }
}

// 현재 phase 재생이 끝난 뒤 → 간격 두고 다음 phase/카드로
function alAfterPhase() {
  if (!_al.playing) return;
  const mySeq = _al.seq;
  _al.timer = setTimeout(() => {
    if (mySeq !== _al.seq || !_al.playing) return;
    if (_al.phase === 'front') {
      _al.phase = 'back';
      alPlayPhase();
    } else {
      // 다음 카드로
      if (_al.idx < _al.queue.length - 1) {
        _al.idx++;
      } else if (_al.loop) {
        _al.idx = 0;
      } else {
        alStop('완료! 처음부터 들으려면 재생을 눌러주세요');
        _al.idx = 0; _al.phase = 'front';
        alRenderCard();
        return;
      }
      _al.phase = 'front';
      alRenderCard();
      alPlayPhase();
    }
  }, _al.gapMs);
}

// 다음 카드의 front/back mp3를 백그라운드로 미리 생성 (끊김 방지)
function alPrefetchNext() {
  const nextIdx = (_al.idx < _al.queue.length - 1) ? _al.idx + 1 : (_al.loop ? 0 : -1);
  if (nextIdx < 0) return;
  const next = _al.queue[nextIdx]; if (!next) return;
  ensureCardAudio(next, 'front', alLang('front'), false, alTtsText(next, 'front')).catch(() => {});
  ensureCardAudio(next, 'back', alLang('back'), false, alTtsText(next, 'back')).catch(() => {});
}

// ── 컨트롤 ──
function alPlay() {
  _al.playing = true;
  _al.seq++;
  alUpdatePlayIcon();
  alPlayPhase();
}
function alStop(statusText) {
  _al.playing = false;
  _al.seq++; // 이전 재생 세대 콜백 전부 무효화
  if (_al.audio) { _al.audio.pause(); _al.audio = null; }
  if (_al.timer) { clearTimeout(_al.timer); _al.timer = null; }
  alUpdatePlayIcon();
  alSetStatus(statusText || '일시정지');
}
function alTogglePlay() {
  if (_al.playing) alStop(); else alPlay();
}
function alPrev() {
  if (_al.idx > 0) _al.idx--;
  _al.phase = 'front';
  alRenderCard();
  if (_al.playing) { _al.seq++; alPlayPhase(); }
}
function alNext() {
  if (_al.idx < _al.queue.length - 1) _al.idx++;
  else if (_al.loop) _al.idx = 0;
  _al.phase = 'front';
  alRenderCard();
  if (_al.playing) { _al.seq++; alPlayPhase(); }
}

// ── 옵션 UI ──
const AL_PRESET_DESC = {
  normal: '문제 → 답 순서로 한 번씩 읽어줍니다',
  focus: '(준비 중) 뜻 → 외국어 반복 집중 암기',
  flow: '(준비 중) 가볍게 흘려들으며 무한 반복',
  custom: '(준비 중) 세부 옵션 직접 설정',
};
function alSetPreset(p, silent) {
  // 5-B-1: normal만 동작, 나머지는 안내 후 normal 유지
  if (p !== 'normal' && !silent) { showToast('이 방식은 곧 추가됩니다!'); return; }
  _al.preset = 'normal';
  ['normal','focus','flow','custom'].forEach(k => {
    const el = document.getElementById('al-preset-' + k); if (!el) return;
    const on = (k === p && p === 'normal');
    el.style.borderColor = on ? 'var(--accent)' : 'var(--border)';
    el.style.color = on ? 'var(--accent)' : 'var(--muted)';
    el.style.background = on ? 'var(--accent-subtle)' : 'var(--bg)';
  });
  document.getElementById('al-preset-desc').textContent = AL_PRESET_DESC[p] || '';
}
function alSetLoop(on) {
  _al.loop = on;
  alUpdateLoopUI();
}
function alUpdateLoopUI() {
  const a = document.getElementById('al-loop-on'), b = document.getElementById('al-loop-off');
  if (!a || !b) return;
  const set = (el, on) => {
    el.style.borderColor = on ? 'var(--accent)' : 'var(--border)';
    el.style.color = on ? 'var(--accent)' : 'var(--muted)';
    el.style.background = on ? 'var(--accent-subtle)' : 'var(--bg)';
  };
  set(a, _al.loop); set(b, !_al.loop);
}
function alUpdatePlayIcon() {
  const p = document.getElementById('al-icon-play'), s = document.getElementById('al-icon-pause');
  if (!p || !s) return;
  p.style.display = _al.playing ? 'none' : 'block';
  s.style.display = _al.playing ? 'block' : 'none';
}
function alSetStatus(t) {
  const el = document.getElementById('al-status-text');
  if (el) el.textContent = t || '';
}

// ── 나가기 ──
function exitAutoListen() {
  alStop();
  showHome();
}

// 브라우저 뒤로가기 등으로 화면을 벗어나도 재생이 남지 않도록 방어
window.addEventListener('popstate', () => { if (_al.playing) alStop(); });
