// ui.js — 画面の UI（再生カード、時間帯、カメラ、曲リスト、スタート画面）
import { trackAt } from './audio/engine.js';
import { PRESETS } from './scene/env.js';

const $ = (id) => document.getElementById(id);
const fmt = (s) => { s = Math.max(0, Math.floor(s)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

export function createUI({ music, env, director, onEnv, onStart, store }) {
  const playBtn = $('btnPlay');
  let toastT = 0;
  const toast = (msg) => {
    const el = $('toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toastT);
    toastT = setTimeout(() => el.classList.remove('show'), 1800);
  };

  const setEnvButtons = () => document.querySelectorAll('[data-env]').forEach((b) => b.classList.toggle('on', b.dataset.env === env.key));
  const setCamButtons = () => document.querySelectorAll('[data-cam]').forEach((b) => b.classList.toggle('on', b.dataset.cam === director.mode));
  setEnvButtons();
  setCamButtons();

  const pickEnv = (key) => { onEnv(key); setEnvButtons(); toast(PRESETS[key].label); };
  const pickCam = (mode) => { director.setMode(mode); setCamButtons(); store.set('cam', mode); toast(mode === 'auto' ? 'カメラ：オート' : 'カメラ：自由（ドラッグで見回す）'); };
  document.querySelectorAll('[data-env]').forEach((b) => b.addEventListener('click', () => pickEnv(b.dataset.env)));
  document.querySelectorAll('[data-cam]').forEach((b) => b.addEventListener('click', () => pickCam(b.dataset.cam)));

  const start = async () => {
    $('start').classList.add('hide');
    await onStart();
  };
  $('btnStart').addEventListener('click', start);
  playBtn.addEventListener('click', () => (music.state === 'idle' ? start() : music.toggle()));
  $('btnNext').addEventListener('click', () => { if (music.state === 'idle') $('start').classList.add('hide'); music.next(); });
  $('btnPrev').addEventListener('click', () => { if (music.state === 'idle') $('start').classList.add('hide'); music.prev(); });
  const vol = $('vol');
  vol.value = store.get('vol', 0.75);
  music.setVolume(+vol.value);
  vol.addEventListener('input', () => { music.setVolume(+vol.value); store.set('vol', +vol.value); });
  const crackle = $('crackle');
  crackle.checked = store.get('crackle', true);
  music.setCrackle(crackle.checked);
  crackle.addEventListener('change', () => { music.setCrackle(crackle.checked); store.set('crackle', crackle.checked); });

  const hide = () => { document.body.classList.toggle('ui-hidden'); };
  $('btnHide').addEventListener('click', hide);
  $('btnFull').addEventListener('click', () => {
    if (document.fullscreenElement) document.exitFullscreen?.();
    else document.documentElement.requestFullscreen?.().catch(() => {});
  });
  // UI を隠しているときは、画面をタップすると戻す
  document.addEventListener('pointerup', (e) => {
    if (document.body.classList.contains('ui-hidden') && e.target.tagName === 'CANVAS' && director.mode !== 'free') document.body.classList.remove('ui-hidden');
  });

  // 曲リスト（Side A の 8 曲）
  const list = $('trackList');
  for (let i = 0; i < 8; i++) {
    const s = music.songFor(i);
    const li = document.createElement('li');
    li.innerHTML = `<span class="no">${String(i + 1).padStart(2, '0')}</span><span>${s.title}</span><span class="ja">${s.titleJa}</span>`;
    li.addEventListener('click', () => { $('start').classList.add('hide'); music.load(i); if (music.state !== 'playing') music.play(); });
    list.appendChild(li);
  }
  $('btnList').addEventListener('click', () => {
    list.hidden = !list.hidden;
    $('btnList').setAttribute('aria-expanded', String(!list.hidden));
    $('btnList').textContent = list.hidden ? '曲リスト ▾' : '曲リスト ▴';
  });

  // キー操作（ボタンにフォーカスがあるときの Space は、ボタンを押したことにしない）
  addEventListener('keyup', (e) => { if (e.code === 'Space' && e.target.tagName === 'BUTTON') e.preventDefault(); });
  addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' && e.target.type !== 'range' && e.target.type !== 'checkbox') return;
    switch (e.code) {
      case 'Space': e.preventDefault(); music.state === 'idle' ? start() : music.toggle(); break;
      case 'ArrowRight': music.next(); $('start').classList.add('hide'); break;
      case 'ArrowLeft': music.prev(); $('start').classList.add('hide'); break;
      case 'Digit1': pickEnv('sunset'); break;
      case 'Digit2': pickEnv('night'); break;
      case 'Digit3': pickEnv('rain'); break;
      case 'Digit4': pickEnv('dawn'); break;
      case 'KeyC': pickCam(director.mode === 'auto' ? 'free' : 'auto'); break;
      case 'KeyH': hide(); break;
      case 'KeyM': vol.value = +vol.value > 0 ? 0 : store.get('vol', 0.75) || 0.75; music.setVolume(+vol.value); break;
    }
  });

  const showTrack = (s, index) => {
    $('npTitle').textContent = `${String(s.no).padStart(2, '0')}. ${s.title}`;
    $('npSub').textContent = `${s.titleJa} — The Skyline Pincers`;
    $('npMeta').textContent = `${s.styleLabel} · ${s.bpm} BPM · ${s.keyName}`;
    [...list.children].forEach((li, i) => li.classList.toggle('on', i === index));
  };
  { const s0 = music.songFor(music.trackIndex); s0.no = s0.no || 1; showTrack(s0, music.trackIndex); }

  music.on((type) => {
    if (type === 'track') {
      const s = music.song;
      showTrack(s, music.trackIndex);
      if (music.state === 'playing') toast(`♪ ${s.title}`);
    }
    if (type === 'state' || type === 'track') {
      const playing = music.state === 'playing';
      $('icoPlay').toggleAttribute('hidden', playing); // SVG 要素には .hidden プロパティがないので属性で切り替える
      $('icoPause').toggleAttribute('hidden', !playing);
      playBtn.setAttribute('aria-label', playing ? '一時停止' : '再生');
    }
  });

  let last = 0;
  return {
    toast,
    update(info, now) {
      if (now - last < 0.1) return;
      last = now;
      const d = new Date();
      $('clock').textContent = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
      if (!info.song) return;
      $('npSection').textContent = info.section ? info.section.label : '—';
      $('npChord').textContent = info.playing ? info.chord : '—';
      const dur = info.duration || 1;
      $('npFill').style.width = `${Math.min(100, (info.time / dur) * 100)}%`;
      $('npTime').textContent = `${fmt(info.time)} / ${fmt(dur)}`;
    },
  };
}

export { trackAt };
