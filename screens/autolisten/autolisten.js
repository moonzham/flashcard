// ════════════════════════════════════════════════
// 자동 듣기 모드 (스텝 기반 연속 재생 엔진)
// ════════════════════════════════════════════════
// 카드마다 '재생 스텝 배열'을 만들어 순서대로 재생한다.
//   예) 뜻→외국어 3회  →  ['back','front','front','front']
//       뜻·외국어·뜻   →  ['back','front','back']
// mp3는 ensureCardAudio()로 lazy 생성/재사용, 다음 카드는 재생 중 미리 생성(prefetch)

const AL_GAP_MS = { short: 350, normal: 800, long: 1600 };

const _al = {
  deck: null,
  queue: [],
  idx: 0,
  steps: ['front', 'back'], // 현재 카드의 재생 스텝 배열
  stepIdx: 0,
  playing: false,
  audio: null,      // 현재 재생 중인 Audio 객체
  timer: null,      // 간격(setTimeout) 핸들
  loop: true,       // 덱 끝나면 처음부터 반복
  preset: 'normal', // 'normal' | 'focus' | 'flow' | 'custom'
  order: 'ftob',    // 'ftob'(외국어→뜻) | 'btof'(뜻→외국어) | 'fonly'(외국어만) | 'wrap'(뜻·외국어·뜻)
  repeat: 1,        // 외국어 반복 횟수
  gap: 'normal',    // 'short' | 'normal' | 'long'
  rate: 1,          // 재생 속도
  seq: 0,           // 재생 세대 (정지 후 이전 콜백 무시용)
};

// 프리셋 정의 (외국어 덱 전용)
const AL_PRESETS = {
  normal: { order: 'ftob', repeat: 1, gap: 'normal', rate: 1, desc: '문제 → 답 순서로 한 번씩 읽어줍니다' },
  focus:  { order: 'btof', repeat: 3, gap: 'normal', rate: 1, desc: '뜻 → 외국어를 3회 반복하며 집중 암기합니다' },
  flow:   { order: 'ftob', repeat: 1, gap: 'short',  rate: 1, desc: '짧은 간격으로 가볍게 흘려듣습니다' },
};

// ── 진입 (study.js의 startAutoListen에서 호출) ──
function openAutoListen(deck, cards) {
  _al.deck = deck;
  _al.queue = cards;
  _al.idx = 0;
  _al.stepIdx = 0;
  _al.playing = false;
  _al.loop = true;

  document.getElementById('al-deck-info').textContent = `${deck.name} · ${cards.length}장`;

  // 덱 종류에 따라 옵션 UI 구성
  const isForeign = alIsForeign();
  document.getElementById('al-preset-section').style.display = isForeign ? 'block' : 'none';
  document.getElementById('al-simple-section').style.display = 'block';
  if (isForeign) {
    alSetPreset('normal', true); // 기본 프리셋
  } else {
    // 일반 덱: 낭독 순서/반복 없음 (문제→답 1회 고정), 간격/속도/반복만 조절
    _al.preset = 'normal'; _al.order = 'ftob'; _al.repeat = 1;
    _al.gap = 'normal'; _al.rate = 1;
    document.getElementById('al-custom-section').style.display = 'none';
  }
  alUpdateOptionUI();

  showScreen('autolisten');
  alRenderCard();
  alPlay(); // 진입하자마자 재생 시작
}

function alIsForeign() {
  const dt = (_al.deck && _al.deck.deck_type) || 'auto';
  return dt === 'en' || dt === 'jp';
}

// ── 재생 스텝 배열 생성 ──
// 일반 덱은 항상 [front, back]. 외국어 덱은 낭독순서 + 반복횟수 적용.
function alBuildSteps() {
  if (!alIsForeign()) return ['front', 'back'];
  const rep = Math.max(1, _al.repeat);
  const F = Array(rep).fill('front');
  switch (_al.order) {
    case 'btof':  return ['back', ...F];
    case 'fonly': return F;
    case 'wrap':  return ['back', ...F, 'back'];
    case 'ftob':
    default:      return [...F, 'back'];
  }
}

// ── 화면 표시 ──
function alRenderCard() {
  const card = _al.queue[_al.idx]; if (!card) return;
  document.getElementById('al-progress').textContent = `${_al.idx + 1} / ${_al.queue.length}`;
  document.getElementById('al-front').textContent = card.front;
  document.getElementById('al-back').textContent = card.back;
  document.getElementById('al-hint').textContent = card.hint ? '🔊 ' + card.hint : '';
  alUpdateMediaSession(card);
}

// ── Media Session (잠금화면/알림 미디어 컨트롤) ──
// 제목=외국어(앞면), 아티스트=뜻(뒷면), 커버=고양이 이미지
let _alMediaReady = false;
function alUpdateMediaSession(card) {
  if (!('mediaSession' in navigator)) return;
  try {
    // 현재 페이지 기준 절대 URL (GitHub Pages 서브경로에서도 정확히 해석되도록)
    const artUrl = new URL('screens/autolisten/cat.png', document.baseURI).href;
    navigator.mediaSession.metadata = new MediaMetadata({
      title: card.front || '',
      artist: card.back || '',
      album: (_al.deck && _al.deck.name) || '암기카드',
      artwork: [
        { src: artUrl, sizes: '512x512', type: 'image/png' },
      ],
    });
    // 핸들러는 최초 한 번만 등록
    if (!_alMediaReady) {
      navigator.mediaSession.setActionHandler('play', () => { if (!_al.playing) alPlay(); });
      navigator.mediaSession.setActionHandler('pause', () => { if (_al.playing) alStop(); });
      navigator.mediaSession.setActionHandler('previoustrack', () => alPrev());
      navigator.mediaSession.setActionHandler('nexttrack', () => alNext());
      _alMediaReady = true;
    }
  } catch (e) { /* 미지원 환경 무시 */ }
}
function alSetMediaPlaybackState(state) {
  if ('mediaSession' in navigator) {
    try { navigator.mediaSession.playbackState = state; } catch (e) {}
  }
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
// 현재 재생 중인 오디오/타이머를 확실히 정지 (겹침·좀비 콜백 방지)
function alKillAudio() {
  if (_al.audio) {
    _al.audio.pause();
    _al.audio.onended = null;
    _al.audio.onerror = null;
    _al.audio = null;
  }
  if (_al.timer) { clearTimeout(_al.timer); _al.timer = null; }
}

async function alPlayStep() {
  alKillAudio(); // 이전 재생 잔재 제거
  const mySeq = _al.seq;
  const card = _al.queue[_al.idx];
  if (!card || !_al.playing) return;
  const side = _al.steps[_al.stepIdx] || 'front';
  const label = (side === 'front')
    ? (alIsForeign() ? '외국어 재생 중...' : '문제 재생 중...')
    : (alIsForeign() ? '뜻 재생 중...' : '정답 재생 중...');
  const repInfo = (_al.steps.length > 2) ? ` (${_al.stepIdx + 1}/${_al.steps.length})` : '';
  alSetStatus(label + repInfo);
  try {
    const url = await ensureCardAudio(card, side, alLang(side), false, alTtsText(card, side));
    if (mySeq !== _al.seq || !_al.playing) return; // 정지/변경됐으면 무시
    if (!url) { alAfterStep(); return; } // 텍스트 없으면 스킵
    _al.audio = new Audio(url);
    _al.audio.playbackRate = _al.rate;
    _al.audio.onended = () => { if (mySeq === _al.seq) alAfterStep(); };
    _al.audio.onerror = () => { if (mySeq === _al.seq) alAfterStep(); };
    _al.audio.play().catch(() => { if (mySeq === _al.seq) alAfterStep(); });
    alPrefetchNext(); // 재생하는 동안 다음 카드 mp3 미리 준비
  } catch (e) {
    console.error('자동듣기 재생 실패', e);
    if (mySeq === _al.seq) alAfterStep(); // 실패해도 다음으로 진행
  }
}

// 현재 스텝 재생이 끝난 뒤 → 간격 두고 다음 스텝/카드로
function alAfterStep() {
  if (!_al.playing) return;
  const mySeq = _al.seq;
  _al.timer = setTimeout(() => {
    if (mySeq !== _al.seq || !_al.playing) return;
    if (_al.stepIdx < _al.steps.length - 1) {
      _al.stepIdx++;      // 같은 카드의 다음 스텝
      alPlayStep();
      return;
    }
    // 카드 완료 → 다음 카드로
    if (_al.idx < _al.queue.length - 1) {
      _al.idx++;
    } else if (_al.loop) {
      _al.idx = 0;
    } else {
      alStop('완료! 처음부터 들으려면 재생을 눌러주세요');
      _al.idx = 0; _al.stepIdx = 0; _al.steps = alBuildSteps();
      alRenderCard();
      return;
    }
    _al.stepIdx = 0;
    _al.steps = alBuildSteps();
    alRenderCard();
    alPlayStep();
  }, AL_GAP_MS[_al.gap] || 800);
}

// 다음 카드의 front/back mp3를 백그라운드로 미리 생성 (끊김 방지)
function alPrefetchNext() {
  const nextIdx = (_al.idx < _al.queue.length - 1) ? _al.idx + 1 : (_al.loop ? 0 : -1);
  if (nextIdx < 0) return;
  const next = _al.queue[nextIdx]; if (!next) return;
  const sides = [...new Set(alBuildSteps())]; // 실제 쓰일 면만 미리 생성
  sides.forEach(side => {
    ensureCardAudio(next, side, alLang(side), false, alTtsText(next, side)).catch(() => {});
  });
}

// ── 컨트롤 ──
function alPlay() {
  _al.playing = true;
  _al.seq++;
  if (!_al.steps || !_al.steps.length) _al.steps = alBuildSteps();
  alUpdatePlayIcon();
  alSetMediaPlaybackState('playing');
  alPlayStep();
}
function alStop(statusText) {
  _al.playing = false;
  _al.seq++; // 이전 재생 세대 콜백 전부 무효화
  alKillAudio();
  alUpdatePlayIcon();
  alSetMediaPlaybackState('paused');
  alSetStatus(statusText || '일시정지');
}
function alTogglePlay() {
  if (_al.playing) alStop(); else alPlay();
}
function alPrev() {
  if (_al.idx > 0) _al.idx--;
  _al.stepIdx = 0; _al.steps = alBuildSteps();
  alRenderCard();
  if (_al.playing) { _al.seq++; alPlayStep(); }
}
function alNext() {
  if (_al.idx < _al.queue.length - 1) _al.idx++;
  else if (_al.loop) _al.idx = 0;
  _al.stepIdx = 0; _al.steps = alBuildSteps();
  alRenderCard();
  if (_al.playing) { _al.seq++; alPlayStep(); }
}

// 옵션이 바뀌면 현재 카드부터 새 설정으로 다시 재생
function alApplyOptionChange() {
  _al.stepIdx = 0;
  _al.steps = alBuildSteps();
  if (_al.playing) { _al.seq++; alPlayStep(); }
}

// ── 옵션 UI ──
function alSetPreset(p, silent) {
  _al.preset = p;
  if (p !== 'custom') {
    const cfg = AL_PRESETS[p] || AL_PRESETS.normal;
    _al.order = cfg.order; _al.repeat = cfg.repeat; _al.gap = cfg.gap; _al.rate = cfg.rate;
    document.getElementById('al-preset-desc').textContent = cfg.desc;
    document.getElementById('al-custom-section').style.display = 'none';
  } else {
    document.getElementById('al-preset-desc').textContent = '세부 옵션을 직접 설정하세요';
    document.getElementById('al-custom-section').style.display = 'block';
  }
  alUpdateOptionUI();
  if (!silent) alApplyOptionChange();
}
function alSetOrder(o) { _al.order = o; _al.preset = 'custom'; alUpdateOptionUI(); alApplyOptionChange(); }
function alSetRepeat(n) { _al.repeat = n; _al.preset = 'custom'; alUpdateOptionUI(); alApplyOptionChange(); }
function alSetGap(g) { _al.gap = g; alUpdateOptionUI(); } // 간격은 다음 전환부터 자연 반영
function alSetRate(r) {
  _al.rate = r;
  if (_al.audio) _al.audio.playbackRate = r; // 재생 중이면 즉시 반영
  alUpdateOptionUI();
}
function alSetLoop(on) { _al.loop = on; alUpdateOptionUI(); }

// 버튼 하이라이트 일괄 갱신
function alUpdateOptionUI() {
  const mark = (id, on) => {
    const el = document.getElementById(id); if (!el) return;
    el.style.borderColor = on ? 'var(--accent)' : 'var(--border)';
    el.style.color = on ? 'var(--accent)' : 'var(--muted)';
    el.style.background = on ? 'var(--accent-subtle)' : 'var(--bg)';
  };
  ['normal','focus','flow','custom'].forEach(k => mark('al-preset-' + k, _al.preset === k));
  ['ftob','btof','fonly','wrap'].forEach(k => mark('al-order-' + k, _al.order === k));
  [1,2,3,5].forEach(n => mark('al-rep-' + n, _al.repeat === n));
  ['short','normal','long'].forEach(g => mark('al-gap-' + g, _al.gap === g));
  mark('al-rate-075', _al.rate === 0.75);
  mark('al-rate-100', _al.rate === 1);
  mark('al-rate-125', _al.rate === 1.25);
  mark('al-loop-on', _al.loop);
  mark('al-loop-off', !_al.loop);
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
  if ('mediaSession' in navigator) {
    try { navigator.mediaSession.metadata = null; navigator.mediaSession.playbackState = 'none'; } catch (e) {}
  }
  showHome();
}

// 브라우저 뒤로가기 등으로 화면을 벗어나도 재생이 남지 않도록 방어
window.addEventListener('popstate', () => { if (_al.playing) alStop(); });
