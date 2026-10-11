// engine.js — 曲を鳴らす：ミキサー、エフェクト、先読みスケジューラ、再生リスト
//
// 曲（composer.js のイベント列）を、AudioContext の時計に合わせて少し先まで予約していく。
// 曲ごとにチャンネル（楽器ごとの GainNode）を作り直すので、曲送りのときは古いチャンネルを
// 絞るだけで、予約済みの音もまとめて消える。

import { generateSong, PLAYLIST, STYLE_KEYS } from './composer.js';
import { Instruments, makeResources } from './instruments.js';

// チャンネル：音量、定位、行き先（dry / chorus / bass）、センド量
const CHANNELS = {
  kick:  { gain: 0.72, pan: 0, to: 'dry', rev: 0.02 },
  snare: { gain: 1.05, pan: 0.04, to: 'dry', rev: 0.1, gated: 0.5 },
  hat:   { gain: 0.5, pan: 0.28, to: 'dry', rev: 0.04 },
  perc:  { gain: 0.5, pan: -0.38, to: 'dry', rev: 0.1 },
  tom:   { gain: 0.5, pan: 0, to: 'dry', rev: 0.12, gated: 0.3 },
  crash: { gain: 0.2, pan: -0.2, to: 'dry', rev: 0.12 },
  bass:  { gain: 0.27, pan: 0, to: 'bass', rev: 0 },
  ep:    { gain: 0.37, pan: 0, to: 'chorus', rev: 0.22, autopan: 0.28 },
  gtr:   { gain: 0.56, pan: 0.42, to: 'chorus', rev: 0.1, delay: 0.06, tone: true },
  pad:   { gain: 0.37, pan: 0, to: 'chorus', rev: 0.4 },
  brass: { gain: 0.85, pan: -0.18, to: 'dry', rev: 0.28 },
  lead:  { gain: 0.94, pan: 0.04, to: 'dry', rev: 0.26, delay: 0.2 },
  bell:  { gain: 0.43, pan: -0.32, to: 'dry', rev: 0.35, delay: 0.28 },
  fx:    { gain: 0.5, pan: 0, to: 'dry', rev: 0.05 },
};
export const CHANNEL_NAMES = Object.keys(CHANNELS);

// ---------------------------------------------------------------- エフェクトの部品
function makeImpulse(ctx, seconds, { decay = 2.4, pre = 0.012, gated = false } = {}) {
  const sr = ctx.sampleRate;
  const len = Math.floor(sr * seconds);
  const buf = ctx.createBuffer(2, len, sr);
  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c);
    let lp = 0;
    for (let i = 0; i < len; i++) {
      const t = i / sr;
      if (t < pre) { d[i] = 0; continue; }
      const w = Math.random() * 2 - 1;
      lp = lp * 0.6 + w * 0.4; // 少し丸めた残響
      let e;
      if (gated) e = t < seconds - 0.03 ? 0.9 : Math.max(0, (seconds - t) / 0.03); // 80 年代のゲートリバーブ
      else e = Math.pow(1 - t / seconds, decay) * Math.exp(-t * 1.2);
      const bright = gated ? w : (t < 0.4 ? w * (1 - t / 0.4) + lp * (t / 0.4) : lp);
      d[i] = bright * e * 0.5;
    }
  }
  return buf;
}

function tanhCurve(k = 1.5, n = 2048) {
  const c = new Float32Array(n);
  const norm = Math.tanh(k);
  for (let i = 0; i < n; i++) { const x = (i / (n - 1)) * 2 - 1; c[i] = Math.tanh(k * x) / norm; }
  return c;
}

/** 共用のミキサー（曲をまたいで使う）。dest は AudioContext の出口か録音先。 */
export function buildMixer(ctx, dest, { measure = false } = {}) {
  const g = (v = 1) => { const n = ctx.createGain(); n.gain.value = v; return n; };
  const mix = g(1);
  if (measure) { // 音量の測定用：コンプ・飽和を通さず、耳の感度に近い重み（K 特性に近いもの）をかける
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 60; hp.Q.value = 0.5;
    const sh = ctx.createBiquadFilter(); sh.type = 'highshelf'; sh.frequency.value = 1500; sh.gain.value = 4;
    mix.connect(hp).connect(sh).connect(dest);
  }
  // 温かめの EQ → 軽いテープ風の飽和 → コンプ → リミッター
  const low = ctx.createBiquadFilter(); low.type = 'lowshelf'; low.frequency.value = 110; low.gain.value = 1.5;
  const mud = ctx.createBiquadFilter(); mud.type = 'peaking'; mud.frequency.value = 320; mud.Q.value = 0.9; mud.gain.value = -2;
  const high = ctx.createBiquadFilter(); high.type = 'highshelf'; high.frequency.value = 9500; high.gain.value = -2;
  const pre = g(0.7);
  const sat = ctx.createWaveShaper(); sat.curve = tanhCurve(1.1); sat.oversample = '2x';
  const comp = ctx.createDynamicsCompressor();
  // DynamicsCompressor は自動でメイクアップゲインをかける（しきい値と比率から決まる）ので、ここでは足さない
  comp.threshold.value = -14; comp.knee.value = 10; comp.ratio.value = 2; comp.attack.value = 0.02; comp.release.value = 0.25;
  const makeup = g(1);
  const lim = ctx.createDynamicsCompressor();
  lim.threshold.value = -2; lim.knee.value = 0; lim.ratio.value = 20; lim.attack.value = 0.002; lim.release.value = 0.12;
  const vol = g(0.75);
  const analyser = ctx.createAnalyser(); analyser.fftSize = 2048; analyser.smoothingTimeConstant = 0.78;
  const split = ctx.createChannelSplitter(2);
  const anL = ctx.createAnalyser(), anR = ctx.createAnalyser();
  anL.fftSize = anR.fftSize = 512;
  const sub = ctx.createBiquadFilter(); sub.type = 'highpass'; sub.frequency.value = 32; sub.Q.value = 0.6;
  mix.connect(sub).connect(low).connect(mud).connect(high).connect(pre).connect(sat).connect(comp).connect(makeup).connect(lim).connect(vol);
  vol.connect(analyser);
  if (!measure) analyser.connect(dest);
  vol.connect(split); split.connect(anL, 0); split.connect(anR, 1);

  // ホールリバーブ
  const revIn = g(1);
  const revHp = ctx.createBiquadFilter(); revHp.type = 'highpass'; revHp.frequency.value = 220;
  const reverb = ctx.createConvolver(); reverb.buffer = makeImpulse(ctx, 2.8);
  const revOut = g(0.85);
  revIn.connect(revHp).connect(reverb).connect(revOut).connect(mix);
  // ゲートリバーブ（スネア用）
  const gatedIn = g(1);
  const gated = ctx.createConvolver(); gated.buffer = makeImpulse(ctx, 0.26, { gated: true, pre: 0.004 });
  const gatedOut = g(0.5);
  gatedIn.connect(gated).connect(gatedOut).connect(mix);
  // ピンポンディレイ
  const delayIn = g(1);
  const dL = ctx.createDelay(2), dR = ctx.createDelay(2);
  const fbLR = g(0.32), fbRL = g(0.32);
  const lpL = ctx.createBiquadFilter(); lpL.type = 'lowpass'; lpL.frequency.value = 3200;
  const lpR = ctx.createBiquadFilter(); lpR.type = 'lowpass'; lpR.frequency.value = 2800;
  const panL = ctx.createStereoPanner(); panL.pan.value = -0.75;
  const panR = ctx.createStereoPanner(); panR.pan.value = 0.75;
  const delayOut = g(0.75);
  delayIn.connect(dL);
  dL.connect(lpL).connect(fbLR).connect(dR);
  dR.connect(lpR).connect(fbRL).connect(dL);
  lpL.connect(panL).connect(delayOut);
  lpR.connect(panR).connect(delayOut);
  delayOut.connect(mix);
  // コーラス（エレピ・ギター・パッド）
  const chorusIn = g(1);
  const dry = g(0.75);
  chorusIn.connect(dry).connect(mix);
  const lfos = [];
  for (const [base, rate, depth, pan] of [[0.013, 0.43, 0.0028, -0.7], [0.018, 0.61, 0.0034, 0.7]]) {
    const d = ctx.createDelay(0.05); d.delayTime.value = base;
    const lfo = ctx.createOscillator(); lfo.frequency.value = rate;
    const lg = g(depth);
    lfo.connect(lg).connect(d.delayTime);
    lfo.start();
    lfos.push(lfo);
    const p = ctx.createStereoPanner(); p.pan.value = pan;
    chorusIn.connect(d).connect(p).connect(g(0.5)).connect(mix);
  }
  // ベースのバス（少し歪ませてコンプ）
  const bassIn = g(1);
  const bassLp = ctx.createBiquadFilter(); bassLp.type = 'lowpass'; bassLp.frequency.value = 4200;
  const bassSat = ctx.createWaveShaper(); bassSat.curve = tanhCurve(1.8); bassSat.oversample = '2x';
  const bassHp = ctx.createBiquadFilter(); bassHp.type = 'highpass'; bassHp.frequency.value = 36; bassHp.Q.value = 0.7;
  const bassComp = ctx.createDynamicsCompressor();
  bassComp.threshold.value = -14; bassComp.ratio.value = 3; bassComp.attack.value = 0.006; bassComp.release.value = 0.12; bassComp.knee.value = 6;
  bassIn.connect(bassHp).connect(bassLp).connect(g(0.8)).connect(bassSat).connect(bassComp).connect(g(0.55)).connect(mix);

  return {
    mix, vol, analyser, anL, anR, lfos,
    buses: { dry: mix, chorus: chorusIn, bass: bassIn, rev: revIn, gated: gatedIn, delay: delayIn },
    setDelayTime(sec) { dL.delayTime.value = sec; dR.delayTime.value = sec; },
  };
}

/** 曲ごとのチャンネル。out.* を絞れば、その曲の音（予約済みも含め）が全部消える。 */
export function makeChannels(ctx, mixer, { solo = null, startAt = 0 } = {}) {
  const out = {};
  for (const k of ['dry', 'chorus', 'bass', 'rev', 'gated', 'delay']) {
    out[k] = ctx.createGain();
    out[k].connect(mixer.buses[k]);
  }
  const inputs = {};
  const extras = [];
  for (const [name, c] of Object.entries(CHANNELS)) {
    const input = ctx.createGain();
    input.gain.value = solo && !solo.includes(name) ? 0 : c.gain;
    let node = input;
    if (c.tone) { // ギターの音色
      const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 280;
      const pk = ctx.createBiquadFilter(); pk.type = 'peaking'; pk.frequency.value = 2600; pk.gain.value = 3; pk.Q.value = 0.8;
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 6500;
      node.connect(hp).connect(pk).connect(lp);
      node = lp;
    }
    const pan = ctx.createStereoPanner();
    pan.pan.value = c.pan;
    if (c.autopan) { // スーツケース型エレピのトレモロ風
      const lfo = ctx.createOscillator(); lfo.frequency.value = 3.2;
      const lg = ctx.createGain(); lg.gain.value = c.autopan;
      lfo.connect(lg).connect(pan.pan);
      lfo.start(startAt);
      extras.push(lfo);
    }
    node.connect(pan);
    pan.connect(out[c.to]);
    for (const s of ['rev', 'gated', 'delay']) {
      if (!c[s]) continue;
      const sg = ctx.createGain(); sg.gain.value = c[s];
      pan.connect(sg).connect(out[s]);
    }
    inputs[name] = input;
  }
  return {
    inputs, out, extras,
    fade(t0, t1, from = 1, to = 0) {
      for (const g of Object.values(out)) { g.gain.setValueAtTime(from, t0); g.gain.linearRampToValueAtTime(to, t1); }
    },
    release(when) {
      for (const g of Object.values(out)) { g.gain.cancelScheduledValues(when); g.gain.setTargetAtTime(0, when, 0.06); }
      setTimeout(() => {
        for (const g of Object.values(out)) g.disconnect();
        for (const o of extras) { try { o.stop(); } catch { /* 止まっている */ } }
      }, 1500);
    },
  };
}

/** 曲のステップ（16 分音符）を秒に。奇数ステップはスウィングで少し遅らせる。 */
export function stepTime(song, s) {
  const sd = 60 / song.bpm / 4;
  const whole = Math.floor(s);
  return s * sd + (whole % 2 === 1 ? song.swing * sd : 0);
}

/** イベント 1 つを鳴らす。 */
export function playEvent(inst, song, ev, t) {
  const sd = 60 / song.bpm / 4;
  const hum = ev.i === 'kick' || ev.i === 'snare' ? 0 : (Math.random() - 0.5) * 0.006;
  const tt = t + hum;
  switch (ev.i) {
    case 'kick': inst.kick(tt, ev.v); break;
    case 'snare': inst.snare(tt, ev.v, ev.kind); break;
    case 'hat': inst.hat(tt, ev.v, ev.open); break;
    case 'crash': inst.crash(tt, ev.v); break;
    case 'tom': inst.tom(tt, ev.v, ev.n); break;
    case 'perc': inst.perc(tt, ev.v, ev.kind); break;
    case 'bass': inst.bass(tt, ev.m, ev.d * sd * 0.95, ev.v, ev.art); break;
    case 'ep': inst.ep(tt, ev.notes, ev.d * sd * 0.97, ev.v); break;
    case 'gtr': inst.gtr(tt, ev.notes, ev.d * sd, ev.v, ev.mute, ev.dir); break;
    case 'pad': inst.pad(tt, ev.notes, ev.d * sd, ev.v); break;
    case 'brass': inst.brass(tt, ev.notes, ev.d * sd * 0.9, ev.v, ev.swell); break;
    case 'lead': inst.lead(tt, ev.m, ev.d * sd * (ev.d >= 2 ? 0.94 : 0.8), ev.v, ev.patch, ev.glide); break;
    case 'bell': inst.bell(tt, ev.m, ev.d * sd, ev.v); break;
  }
}

export function trackAt(i) {
  if (i < PLAYLIST.length) return { ...PLAYLIST[i], no: i + 1 };
  return { seed: 30011 + i * 977, style: STYLE_KEYS[i % STYLE_KEYS.length], no: i + 1 };
}

// ---------------------------------------------------------------- 再生エンジン
export class MusicEngine {
  constructor() {
    this.ctx = null;
    this.state = 'idle'; // idle | playing | paused
    this.trackIndex = 0;
    this.song = null;
    this.volume = 0.75;
    this.rain = false;
    this.crackle = true;
    this.listeners = new Set();
    this.songCache = new Map();
  }

  on(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  emit(type) { for (const fn of this.listeners) fn(type, this); }

  songFor(i) {
    if (!this.songCache.has(i)) {
      const t = trackAt(i);
      const s = generateSong(t.seed, t);
      s.no = t.no;
      this.songCache.set(i, s);
    }
    return this.songCache.get(i);
  }

  ensure() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    const ctx = this.ctx = new AC({ latencyHint: 'playback' });
    this.res = makeResources(ctx);
    this.mixer = buildMixer(ctx, ctx.destination);
    this.mixer.vol.gain.value = this.volume;
    this.ambience = this.buildAmbience(ctx);
    this.timer = setInterval(() => this.tick(), 25);
    document.addEventListener('visibilitychange', () => this.tick());
    this.spec = new Uint8Array(this.mixer.analyser.frequencyBinCount);
    this.wave = new Float32Array(this.mixer.anL.fftSize);
  }

  buildAmbience(ctx) {
    const sr = ctx.sampleRate;
    const out = ctx.createGain();
    out.gain.value = this.volume;
    out.connect(ctx.destination);
    // 雨の音：ノイズを帯域で削り、ぱらぱらした粒を足す
    const rainBuf = ctx.createBuffer(2, sr * 4, sr);
    for (let c = 0; c < 2; c++) {
      const d = rainBuf.getChannelData(c);
      let lp = 0;
      for (let i = 0; i < d.length; i++) {
        lp = lp * 0.85 + (Math.random() * 2 - 1) * 0.15;
        d[i] = lp * 0.9 + (Math.random() < 0.0009 ? (Math.random() * 2 - 1) * 0.8 : 0);
      }
    }
    const rainSrc = ctx.createBufferSource(); rainSrc.buffer = rainBuf; rainSrc.loop = true;
    const rainHp = ctx.createBiquadFilter(); rainHp.type = 'highpass'; rainHp.frequency.value = 250;
    const rainLp = ctx.createBiquadFilter(); rainLp.type = 'lowpass'; rainLp.frequency.value = 3800;
    const rainGain = ctx.createGain(); rainGain.gain.value = 0;
    rainSrc.connect(rainHp).connect(rainLp).connect(rainGain).connect(out);
    rainSrc.start();
    // レコードのパチパチ
    const crBuf = ctx.createBuffer(1, sr * 5, sr);
    const cd = crBuf.getChannelData(0);
    for (let i = 0; i < cd.length; i++) {
      cd[i] = (Math.random() * 2 - 1) * 0.012;
      if (Math.random() < 7 / sr) { const a = Math.pow(Math.random(), 3) * 0.9 * (Math.random() < 0.5 ? -1 : 1); cd[i] += a; if (i + 1 < cd.length) cd[i + 1] -= a * 0.5; }
    }
    const crSrc = ctx.createBufferSource(); crSrc.buffer = crBuf; crSrc.loop = true;
    const crHp = ctx.createBiquadFilter(); crHp.type = 'highpass'; crHp.frequency.value = 900;
    const crGain = ctx.createGain(); crGain.gain.value = 0;
    crSrc.connect(crHp).connect(crGain).connect(out);
    crSrc.start();
    return { out, rainGain, crGain };
  }

  updateAmbience() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.ambience.out.gain.setTargetAtTime(this.volume, t, 0.05);
    this.ambience.rainGain.gain.setTargetAtTime(this.rain ? 0.22 : 0, t, 0.8);
    this.ambience.crGain.gain.setTargetAtTime(this.crackle && this.state === 'playing' ? 0.18 : 0, t, 0.3);
  }

  async play() {
    this.ensure();
    if (this.ctx.state !== 'running') await this.ctx.resume();
    if (!this.song) this.load(this.trackIndex);
    this.state = 'playing';
    this.updateAmbience();
    this.emit('state');
  }

  async pause() {
    if (!this.ctx || this.state !== 'playing') return;
    this.state = 'paused';
    this.updateAmbience();
    this.emit('state');
    await new Promise((r) => setTimeout(r, 120)); // パチパチを先に絞る
    if (this.state === 'paused') await this.ctx.suspend();
  }

  toggle() { return this.state === 'playing' ? this.pause() : this.play(); }

  /** i 曲目を読み込む。offset 秒から始めることもできる（確認用）。 */
  load(i, offset = 0) {
    this.ensure();
    const ctx = this.ctx;
    if (this.chans) this.chans.release(ctx.currentTime);
    this.trackIndex = Math.max(0, i);
    const song = this.song = this.songFor(this.trackIndex);
    this.start = ctx.currentTime + 0.45 - offset;
    this.ptr = 0;
    while (offset > 0 && this.ptr < song.events.length && stepTime(song, song.events[this.ptr].s) < offset) this.ptr++;
    this.chans = makeChannels(ctx, this.mixer, { startAt: Math.max(ctx.currentTime, this.start) });
    this.inst = new Instruments(ctx, this.res, this.chans.inputs);
    this.mixer.setDelayTime((60 / song.bpm) * 0.75);
    if (!offset) this.inst.needle(this.start - 0.3);
    if (song.fade) this.chans.fade(Math.max(ctx.currentTime, this.start + stepTime(song, song.fade.from)), Math.max(ctx.currentTime + 0.1, this.start + stepTime(song, song.fade.to)));
    const tail = song.ending === 'end' ? 3.2 : 0.4;
    this.end = this.start + stepTime(song, song.lengthSteps) + tail;
    this.emit('track');
  }

  next() { this.load(this.trackIndex + 1); if (this.state !== 'playing') this.play(); }
  prev() {
    const pos = this.ctx ? this.ctx.currentTime - this.start : 0;
    this.load(pos > 4 || this.trackIndex === 0 ? this.trackIndex : this.trackIndex - 1);
    if (this.state !== 'playing') this.play();
  }

  /** 録画用：出力（曲＋環境音）を MediaStream で取り出す。 */
  recordStream() {
    this.ensure();
    if (!this.recDest) {
      this.recDest = this.ctx.createMediaStreamDestination();
      this.mixer.vol.connect(this.recDest);
      this.ambience.out.connect(this.recDest);
    }
    return this.recDest.stream;
  }

  /** 止める（動画の終わり）。予約済みの音は絞って消す。 */
  stop() {
    if (!this.ctx) return;
    if (this.chans) this.chans.release(this.ctx.currentTime);
    this.song = null;
    this.state = 'idle';
    this.updateAmbience();
    this.emit('state');
  }

  /** Clawd をつついたときの小さな音。 */
  blip() {
    if (!this.ctx || !this.inst || this.ctx.state !== 'running') return;
    const t = this.ctx.currentTime + 0.01;
    [84, 88, 91, 96].forEach((m, i) => this.inst.bell(t + i * 0.06, m, 0.25, 0.55));
  }

  setVolume(v) {
    this.volume = v;
    if (this.ctx) { this.mixer.vol.gain.setTargetAtTime(v, this.ctx.currentTime, 0.04); this.updateAmbience(); }
  }
  setRain(on) { this.rain = on; this.updateAmbience(); }
  setCrackle(on) { this.crackle = on; this.updateAmbience(); }

  tick() {
    if (!this.ctx || !this.song || this.state !== 'playing') return;
    const now = this.ctx.currentTime;
    const ahead = document.hidden ? 1.6 : 0.3;
    const ev = this.song.events;
    while (this.ptr < ev.length) {
      const e = ev[this.ptr];
      const t = this.start + stepTime(this.song, e.s);
      if (t > now + ahead) break;
      if (t >= now - 0.02) playEvent(this.inst, this.song, e, t);
      this.ptr++;
    }
    if (now > this.end) {
      if (this.onSongEnd && this.onSongEnd(this.trackIndex) === false) { this.stop(); return; }
      this.load(this.trackIndex + 1);
    }
  }

  /** 画面側が毎フレーム読む情報（拍・セクション・コード・キック・音量）。 */
  info() {
    const song = this.song;
    if (!this.ctx || !song) return { state: this.state, playing: false, step: 0, beat: 0, bar: 0, energy: 0.4, kick: 0, level: 0, song };
    const lat = (this.ctx.outputLatency || this.ctx.baseLatency || 0);
    const now = this.ctx.currentTime - lat;
    const sd = 60 / song.bpm / 4;
    const step = (now - this.start) / sd;
    const inSong = step >= 0 && step < song.lengthSteps;
    const bar = Math.max(0, Math.min(song.bars.length - 1, Math.floor(step / 16)));
    const barInfo = song.bars[bar];
    const sec = song.sections[barInfo.section];
    const sInBar = step - bar * 16;
    let chord = barInfo.chords[0];
    for (const c of barInfo.chords) if (c.s <= sInBar) chord = c;
    const k = lastBefore(song.kicks, step);
    const kick = k == null || !inSong ? 0 : Math.exp(-(step - k) * sd * 9);
    const km = lastBefore(song.kimes, step);
    const kimeAge = km == null ? 99 : (step - km) * sd;
    // 出力レベル（VU メーター用）
    this.mixer.anL.getFloatTimeDomainData(this.wave);
    let l = 0; for (const x of this.wave) l += x * x;
    const levelL = Math.sqrt(l / this.wave.length);
    this.mixer.anR.getFloatTimeDomainData(this.wave);
    let r = 0; for (const x of this.wave) r += x * x;
    const levelR = Math.sqrt(r / this.wave.length);
    return {
      state: this.state, playing: this.state === 'playing' && inSong, song,
      step, beat: step / 4, bar, section: sec, sectionIndex: barInfo.section, chord: chord.sym,
      energy: inSong ? sec.energy : 0.3, kick, kimeAge, levelL, levelR, level: (levelL + levelR) / 2,
      time: Math.max(0, now - this.start), duration: this.end - this.start,
    };
  }

  spectrum() {
    if (!this.ctx) return null;
    this.mixer.analyser.getByteFrequencyData(this.spec);
    return this.spec;
  }
}

function lastBefore(arr, x) {
  let lo = 0, hi = arr.length - 1, ans = null;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (arr[mid] <= x) { ans = arr[mid]; lo = mid + 1; } else hi = mid - 1;
  }
  return ans;
}

/** 確認用：曲の一部を OfflineAudioContext で書き出す（画面には鳴らさない）。 */
export async function renderOffline(song, { from = 0, seconds = 20, solo = null, sampleRate = 44100, measure = false } = {}) {
  const ctx = new OfflineAudioContext(2, Math.floor(sampleRate * seconds), sampleRate);
  const res = makeResources(ctx);
  const mixer = buildMixer(ctx, ctx.destination, { measure });
  const chans = makeChannels(ctx, mixer, { solo });
  const inst = new Instruments(ctx, res, chans.inputs);
  mixer.setDelayTime((60 / song.bpm) * 0.75);
  const t0 = stepTime(song, from) - 0.05;
  for (const e of song.events) {
    if (e.s < from) continue;
    const t = stepTime(song, e.s) - t0;
    if (t > seconds) break;
    playEvent(inst, song, e, t);
  }
  return ctx.startRendering();
}
