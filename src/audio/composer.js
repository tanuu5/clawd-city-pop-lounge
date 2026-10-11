// composer.js — シードからシティポップ風の曲を 1 曲ぶん組み立てる
//
// 曲 = 構成（イントロ / Aメロ / Bメロ / サビ / 間奏 / ソロ / ラストサビ / アウトロ）
//    + セクションごとのコード進行（ターンアラウンド付き）
//    + メロディ（2 小節のモチーフを反復・変形して作る。サビは毎回同じ＝フック）
//    + 各楽器のパターン（スタイルごとの型をコードに合わせて当てはめる）
// 出力は 16 分音符を単位にしたイベントの列。音を鳴らすのは engine.js。

import { makeRng } from './rng.js';
import {
  chordScale, chordTonePcs, chordSymbol, nearestWithPc, scaleMove, scaleSteps,
  voiceChord, pcOf, isDominant, noteName,
} from './theory.js';

// ---------------------------------------------------------------- コード進行（4 小節 = 16 拍）
// [キーからの半音, 和音の種類, 拍数, ベース音（分数コードのとき）]
const PROG = {
  verse: [
    { name: 'IV–iii–ii–I', c: [[5, 'maj7', 4], [4, 'm7', 4], [2, 'm7', 4], [0, 'maj7', 4]] },
    { name: 'ii–V–I–vi', c: [[2, 'm9', 4], [7, '13', 4], [0, 'maj9', 4], [9, 'm9', 4]] },
    { name: 'I–vi–ii–V', c: [[0, 'maj7', 4], [9, 'm9', 4], [2, 'm9', 4], [7, '9sus4', 2], [7, '7', 2]] },
    { name: 'vi–ii–V–I', c: [[9, 'm9', 4], [2, 'm9', 4], [7, '9sus4', 4], [0, 'maj7', 4]] },
    { name: 'IV–V/IV–iii–vi', c: [[5, 'maj7', 4], [7, '', 4, 5], [4, 'm7', 4], [9, 'm7', 4]] },
    { name: 'I–I7–IV–ivm', c: [[0, 'maj7', 4], [0, '7', 4], [5, 'maj7', 4], [5, 'm6', 4]] },
    { name: 'ii–V ヴァンプ', c: [[2, 'm9', 4], [7, '9sus4', 4], [2, 'm9', 4], [7, '9sus4', 4]] },
    { name: '♭VI–♭VII–I', c: [[8, 'maj7', 4], [10, '9', 4], [0, 'maj9', 8]] },
  ],
  pre: [
    { name: 'ii–iii–IV–V', c: [[2, 'm7', 4], [4, 'm7', 4], [5, 'maj7', 4], [7, '7sus4', 2], [7, '7', 2]] },
    { name: 'IV–ivm–iii–VI', c: [[5, 'maj7', 4], [5, 'm6', 4], [4, 'm7', 4], [9, '7', 4]] },
    { name: 'iii–VI–ii–V', c: [[4, 'm7', 4], [9, '7', 4], [2, 'm7', 4], [7, '7sus4', 2], [7, '7', 2]] },
    { name: 'IV–III7–vi–I7', c: [[5, 'maj7', 4], [4, '7', 4], [9, 'm7', 4], [0, '7', 4]] },
  ],
  chorus: [
    { name: '丸サ進行', c: [[5, 'maj7', 4], [4, '7', 4], [9, 'm7', 4], [7, 'm7', 2], [0, '7', 2]] },
    { name: '王道進行', c: [[5, 'maj7', 4], [7, '7', 4], [4, 'm7', 4], [9, 'm7', 4]] },
    { name: 'IV–V/IV–iii–VI', c: [[5, 'maj7', 4], [7, '', 4, 5], [4, 'm7', 4], [9, '7', 4]] },
    { name: 'IV–iii–vi–ii–V', c: [[5, 'maj7', 4], [4, 'm7', 4], [9, 'm7', 4], [2, 'm7', 2], [7, '7', 2]] },
    { name: 'ii–V–iii–VI', c: [[2, 'm9', 4], [7, '13', 4], [4, 'm7', 4], [9, '7b9', 4]] },
  ],
};

// ---------------------------------------------------------------- スタイル（リズムの型）
// 1 文字 = 16 分音符。'.' は休み、'-' は伸ばす。
const STYLES = {
  groove: {
    label: '16ビート', bpm: [100, 112], swing: 0,
    kick: ['x.....x.x.....x.', 'x.....x...x.....', 'x..x....x.x.....', 'x.....x...x..x..'],
    snare: '....x.......x...', snareChorus: '....x.......x...', ghost: '.......g.g....g.',
    hatSoft: 'xhxhxhxhxhxhxhxh', hatOpen: 'xhxhxhxhxhxhxhoh',
    bass: ['R..R..O.R.R..OA.', 'R-.gR.O.R-.gO.RA', 'R--R--R-.RO.R.OA', 'R..R.gO.R..R.gOA'],
    ep: ['x-----x---x-----', 'x--x----x--x--x-', 'x-------..x---x-', 'x-----x---x---x-'],
    gtr: ['m.X.mmX.m.X.mmX.', '..X...X...X...X.', 'm.m.X.mmm.m.X.m.'],
    brass: ['..x.....x..x....', 'x..x..x.........', '......x...x..x..'],
    leads: ['lyricon', 'synth', 'lyricon'],
    slap: 0.35, padInVerse: false,
  },
  disco: {
    label: 'ディスコ', bpm: [112, 122], swing: 0,
    kick: ['x...x...x...x...'],
    snare: '....c.......c...', snareChorus: '....c.......c...', ghost: '................',
    hatSoft: 'h.x.h.x.h.x.h.x.', hatOpen: 'hhohhhohhhohhhoh',
    bass: ['R.O.R.O.R.O.R.O.', 'R.OgR.O.R.OgR.OA', 'R.O.R.O.R.O.F.OA'],
    ep: ['..x-..x-..x-..x-', 'x--x--x-..x-..x-'],
    gtr: ['mXmXmXmXmXmXmXmX', '.mX..mX..mX..mX.'],
    brass: ['x..x..x.........', '..x...x...x...x.'],
    leads: ['synth', 'lyricon'],
    slap: 0.6, padInVerse: true,
  },
  mellow: {
    label: 'メロウ', bpm: [80, 92], swing: 0.12,
    kick: ['x.......x.x.....', 'x......x..x.....'],
    snare: '....r.......r...', snareChorus: '....x.......x...', ghost: '..........g.....',
    hatSoft: 'x.h.x.h.x.h.x.h.', hatOpen: 'x.h.x.h.x.h.x.o.',
    bass: ['R-----R-F-----A-', 'R-----.RR-----A-', 'R-------F---R-A-'],
    ep: ['arp', 'x-------x-----x-', 'arp'],
    gtr: ['....X.......X...'],
    brass: ['x---------------'],
    leads: ['whistle', 'soft'],
    slap: 0, padInVerse: true,
  },
  shuffle: {
    label: 'シャッフル', bpm: [92, 104], swing: 0.17,
    kick: ['x.....x...x..x..', 'x..x..x...x.....'],
    snare: '....x.......x...', snareChorus: '....x.......x...', ghost: '.......g.g.....g',
    hatSoft: 'xhxhxhxhxhxhxhxh', hatOpen: 'xhxhxhxhxhxhxhoh',
    bass: ['R..R..O.R..R.OA.', 'R-.R..O.R-.RgOA.'],
    ep: ['x-----x---x-----', '..x---x---x---x-'],
    gtr: ['..X..mX...X..mX.'],
    brass: ['..x.....x..x....'],
    leads: ['soft', 'lyricon'],
    slap: 0.25, padInVerse: false,
  },
};
export const STYLE_KEYS = Object.keys(STYLES);

// ---------------------------------------------------------------- メロディのリズム（2 小節 = 32 ステップ）
const RHY = {
  A: [
    '..x-x-x---x-x---|x-------........', 'x-x-x-x---x-..x-|--x-----........',
    '....x-x-x-x-x---|--x-x-x---......', 'x--x--x-x-x-----|..x-x-x-x-------',
    '..x-x-x-x---x-x-|----x---........', 'x-x---x-x---x-x-|x-------........',
  ],
  B: [
    'x---x---x---x---|x-x-x-x-x-------', '..x-x-x-x-x-x-x-|x-------....x-x-',
    'x-x-x-x-x---x---|x---x---x-------', '..x-x-x-x---x-x-|x-x-x-----......',
  ],
  C: [
    'x--x--x-x--x--x-|--x-x-x---------', '..x-x--x--x-x-x-|--x-----..x-x-x-',
    'x-x-x--x--x---x-|--------..x-x-x-', 'x--x--x---x-x-x-|----x-x-x-------',
    '..x--x--x-x-x-x-|----x-----..x-x-', 'x-x-x-x--x--x---|x-x-x-x---------',
  ],
  S: [
    'x-xxx-x-xxxx-x-x|x---xx-xx-x-----', 'xxxx-x-x-xxx-x-x|xxxxx-x-x-x-x---',
    '..x-xxx-x-xx-xx-|x-x-xxxx--------', 'x-x-x-xxxxxxx-x-|--x-x-xx-xxx-x--',
    '....xxxxxxxx-x-x|xx-xx-x-x-------',
  ],
};
const PLANS = {
  A: [['a', 'b', 'a2', 'c'], ['a', 'a2', 'b', 'c'], ['a', 'b', 'a', 'c2']],
  B: [['a', 'a2', 'b', 'c'], ['a', 'b', 'a2', 'b2']],
  C: [['a', 'b', 'a', 'c'], ['a', 'a2', 'a', 'b'], ['a', 'b', 'a2', 'c']],
};

const KIMES = ['x..x..x...x.x...', 'x..x..x.x.......', 'x.x.x...x..x..x.', 'x..x..x..x..x...'];
const FILLS = [
  { from: 8, s: 'ssssssssssss', t: '' },
  { from: 12, s: 'ssss', t: '' },
  { from: 8, s: '', t: '11.22.33' },
  { from: 10, s: '', t: '112233' },
  { from: 8, s: 'ss.s', t: '....1233' },
];

// ---------------------------------------------------------------- 曲名
const EN_A = ['Midnight', 'Neon', 'Sunset', 'Skyline', 'Velvet', 'Moonlit', 'Silver', 'Crystal', 'Ocean', 'Summer',
  'Rainy', 'Pastel', 'Starlight', 'Cobalt', 'Lazy', 'Twilight', 'Golden', 'Electric', 'Satin', 'Glass'];
const EN_B = ['Lounge', 'Highway', 'Breeze', 'Lovers', 'Window', 'Boulevard', 'Resort', 'Drive', 'Shower', 'Romance',
  'Avenue', 'Lullaby', 'Cruise', 'Mirage', 'Weekend', 'Promenade', 'Telephone', 'Harbor', 'Dancer', 'Memories'];
const JA_A = ['摩天楼', '47階', '真夜中', '湾岸線', '水曜日', '金曜日', '夕凪', '海沿い', '雨上がり', '午前2時',
  '屋上', 'ガラス越し', '最終便', '月明かり', '首都高'];
const JA_B = ['ラウンジ', 'ララバイ', 'カクテル', 'ため息', 'シルエット', 'ネオン', 'サマータイム', 'ささやき',
  'バルコニー', 'レコード', 'フィルム', '残り香', 'ランデヴー', 'パノラマ', 'エアメール'];

/**
 * 曲名。attempt = 0 は最初に公開した 8 曲と同じ作り方。
 * 9 曲目からは attempt を 1 から増やし、前の曲と重ならない曲名を選ぶ（engine.songFor）。
 */
export function makeTitle(seed, attempt = 0) {
  const RT = makeRng(attempt === 0 ? seed * 31 + 7 : mixSeed(seed * 31 + 7 + attempt * 7919));
  const a = RT.pick(EN_A), b = RT.pick(EN_B), ja = RT.pick(JA_A), jb = RT.pick(JA_B);
  return { title: `${a} ${b}`, titleJa: `${ja}の${jb}`, words: [a, b, ja, jb] };
}

function mixSeed(x) { // 近いシードから似た並びが出ないよう、ビットをよく混ぜる
  x = Math.imul((x >>> 16) ^ x, 0x45d9f3b);
  x = Math.imul((x >>> 16) ^ x, 0x45d9f3b);
  return ((x >>> 16) ^ x) >>> 0;
}

// 再生リスト（固定のシード → いつ開いても同じ 8 曲）。年はシティポップの全盛期にちなむ。
export const PLAYLIST = [
  { seed: 1984, style: 'groove', key: 5 },
  { seed: 1981, style: 'mellow', key: 3 },
  { seed: 1979, style: 'disco', key: 9 },
  { seed: 1986, style: 'shuffle', key: 2 },
  { seed: 1983, style: 'groove', key: 10 },
  { seed: 1978, style: 'disco', key: 4 },
  { seed: 1982, style: 'mellow', key: 8 },
  { seed: 1985, style: 'groove', key: 0 },
];

export const SECTION_LABEL = {
  intro: 'イントロ', A: 'Aメロ', B: 'Bメロ', C: 'サビ', inter: '間奏', solo: 'ソロ', last: 'ラストサビ', outro: 'アウトロ', final: 'エンディング',
};
const ENERGY = { intro: 0.5, A: 0.6, B: 0.72, C: 1, inter: 0.75, solo: 0.9, last: 1, outro: 0.7, final: 0.6 };

// ---------------------------------------------------------------- 本体
export function generateSong(seed, hint = {}) {
  const R = makeRng(seed * 7919 + 13);
  const styleKey = hint.style || R.pick(STYLE_KEYS);
  const st = STYLES[styleKey];
  const bpm = R.int(st.bpm[0], st.bpm[1]);
  const keyPc = hint.key ?? R.pick([0, 2, 3, 4, 5, 7, 8, 9, 10]);
  const tonic = keyPc <= 5 ? 60 + keyPc : 48 + keyPc; // 54..65
  const progs = { A: R.pick(PROG.verse), B: R.pick(PROG.pre), C: R.pick(PROG.chorus) };
  const introProg = R.chance(0.25) ? PROG.verse[7] : progs.C;
  const soloProg = R.chance(0.6) ? progs.C : progs.A;
  const modUp = R.chance(0.65) ? R.pick([1, 2, 2]) : 0;
  const ending = R.chance(0.55) ? 'end' : 'fade';
  const leadPatch = R.pick(st.leads);
  const shortForm = styleKey === 'mellow' || R.chance(0.25);

  // 構成
  const plan = shortForm
    ? [['intro', 4], ['A', 8], ['B', 8], ['C', 8], ['inter', 4], ['A', 8], ['C', 8], ['solo', 8], ['last', 8], ['outro', ending === 'end' ? 4 : 8]]
    : [['intro', 4], ['A', 8], ['B', 8], ['C', 8], ['inter', 4], ['A', 8], ['B', 8], ['C', 8], ['solo', 8], ['last', 8], ['outro', ending === 'end' ? 4 : 8]];
  if (ending === 'end') plan.push(['final', 2]);

  const progOf = { intro: introProg, A: progs.A, B: progs.B, C: progs.C, inter: progs.C, solo: soloProg, last: progs.C, outro: progs.C };
  const sections = [];
  let bar = 0;
  for (const [type, bars] of plan) {
    const transpose = (type === 'last' || type === 'outro' || type === 'final') ? modUp : 0;
    sections.push({ type, bars, startBar: bar, transpose, keyPc: pcOf(keyPc + transpose), label: SECTION_LABEL[type] + (type === 'last' && modUp ? '（転調）' : ''), energy: ENERGY[type] });
    bar += bars;
  }
  // コード：各セクションの最初の和音を先に決め、前のセクションの終わりをそこへ導く
  for (const sec of sections) {
    sec.list = sec.type === 'final'
      ? [{ root: sec.keyPc, q: 'maj9', bass: sec.keyPc, beats: sec.bars * 4 }]
      : fillProg(progOf[sec.type], sec.bars, sec.keyPc);
  }
  for (let i = 0; i < sections.length - 1; i++) {
    const cur = sections[i], nxt = sections[i + 1];
    if (cur.type === 'outro' && nxt.type === 'final') { approach(cur.list, nxt.list[0].root, R, true); continue; }
    approach(cur.list, nxt.list[0].root, R);
  }
  if (ending === 'fade') { /* フェードアウトはそのまま回す */ }
  for (const sec of sections) sec.barChords = toBars(sec.list, sec.bars);

  // メロディ（最初に出てくるセクションの和音で作り、繰り返しでは当てはめ直す）
  const first = (t) => sections.find((s) => s.type === t);
  const mel = {};
  const secA = first('A'), secB = first('B'), secC = first('C');
  mel.A = genMelody(R, secA, { pool: RHY.A, plan: R.pick(PLANS.A), center: tonic + R.int(5, 7), lo: tonic - 3, hi: tonic + 16, tension: 0.3, resolve: false });
  if (secB) mel.B = genMelody(R, secB, { pool: RHY.B, plan: R.pick(PLANS.B), center: tonic + 9, lo: tonic, hi: tonic + 17, tension: 0.35, rising: true });
  mel.C = genMelody(R, secC, { pool: RHY.C, plan: R.pick(PLANS.C), center: tonic + 12, lo: tonic + 2, hi: tonic + 19, tension: 0.45, resolve: true });

  // イベント
  const events = [];
  const meta = { kimes: [], kicks: [] };
  const state = { epPrev: null, gtrPrev: null, padPrev: null, brassPrev: null, tie: false };
  for (let si = 0; si < sections.length; si++) {
    const sec = sections[si];
    const next = sections[si + 1];
    const base = sec.startBar * 16;
    const add = (ev) => { ev.s += base; events.push(ev); };
    const kimeBar = (sec.type === 'B' && R.chance(0.6)) || (sec.type === 'solo' && R.chance(0.4)) ? sec.bars - 1 : -1;
    sec.kimePat = kimeBar >= 0 ? R.pick(KIMES) : null;

    // メロディ
    let notes = [];
    if (sec.type === 'A') notes = refit(mel.A, sec, 0);
    else if (sec.type === 'B') notes = refit(mel.B, sec, 0);
    else if (sec.type === 'C' || sec.type === 'last') notes = refit(mel.C, sec, sec.transpose);
    else if (sec.type === 'intro') notes = refit(mel.C.filter((n) => n.s < 32).map((n) => ({ ...n, s: n.s + 32 })), sec, 0); // 後半 2 小節でサビのフックを予告
    else if (sec.type === 'inter') notes = refit(mel.C, sec, 0);
    else if (sec.type === 'solo') notes = genSolo(R, sec, tonic);
    else if (sec.type === 'outro') notes = ending === 'fade' ? refit(mel.C, sec, sec.transpose) : refit(mel.C.filter((n) => n.s >= 64).map((n) => ({ ...n, s: n.s - 64 })), sec, sec.transpose);
    else if (sec.type === 'final') notes = [{ s: 0, d: 28, m: nearestWithPc(tonic + 12 + sec.transpose, [pcOf(sec.keyPc + 4), sec.keyPc]), v: 0.8 }];
    const patch = sec.type === 'A' ? (leadPatch === 'synth' ? 'lyricon' : leadPatch) : leadPatch;
    let prevNote = null;
    for (const n of notes) {
      if (sec.kimePat && n.s >= kimeBar * 16 && n.s < kimeBar * 16 + 16 && n.d < 4) continue;
      const legato = prevNote && prevNote.s + prevNote.d >= n.s && n.s - prevNote.s <= 3;
      add({ s: n.s, i: 'lead', m: n.m, d: n.d, v: n.v * (sec.type === 'A' ? 0.85 : 1), patch, glide: legato ? prevNote.m : null });
      if ((sec.type === 'C' || sec.type === 'last') && n.d >= 2) add({ s: n.s, i: 'bell', m: n.m + 12, d: n.d, v: n.v * 0.55 });
      prevNote = n;
    }

    // 伴奏（小節ごと）
    const kickPat = R.pick(st.kick);
    const kickAlt = R.pick(st.kick);
    const bassPat = R.pick(st.bass);
    const epPat = R.pick(st.ep);
    const gtrPat = R.pick(st.gtr);
    const brassPat = R.pick(st.brass);
    for (let b = 0; b < sec.bars; b++) {
      const chords = sec.barChords[b];
      const nextFirst = b + 1 < sec.bars ? sec.barChords[b + 1][0].chord : next ? next.barChords[0][0].chord : chords[chords.length - 1].chord;
      const at = (s) => chordAtBar(chords, s);
      const bs = b * 16;
      const isLastBar = b === sec.bars - 1;
      const kime = b === kimeBar ? sec.kimePat : null;
      const sparse = sec.type === 'intro' && b < 2;
      const fill = !kime && sec.type !== 'final' && ((isLastBar && next) || (b % 4 === 3 && R.chance(0.35))) ? (isLastBar ? R.pick(FILLS) : FILLS[1]) : null;

      if (sec.type === 'final') {
        const ch = chords[0].chord;
        add({ s: bs, i: 'crash', v: 0.9 }); add({ s: bs, i: 'kick', v: 1 });
        meta.kicks.push(base + bs);
        add({ s: bs, i: 'bass', m: bassMidi(ch.root), d: 30, v: 1, art: 'finger' });
        const v = voiceChord(ch, state.epPrev, { lo: 52, hi: 77 });
        add({ s: bs, i: 'ep', notes: v, d: 30, v: 0.9 });
        add({ s: bs, i: 'pad', notes: voiceChord(ch, state.padPrev, { lo: 55, hi: 76 }), d: 30, v: 0.8 });
        add({ s: bs, i: 'brass', notes: voiceChord(ch, null, { lo: 62, hi: 82, size: 3 }), d: 6, v: 0.85 });
        const arp = voiceChord(ch, null, { lo: 72, hi: 90, size: 4 });
        arp.forEach((m, k) => add({ s: bs + 2 + k * 2, i: 'bell', m, d: 24, v: 0.45 }));
        break;
      }

      // ---- ドラム
      if (kime) {
        let first = true;
        for (let s = 0; s < 16; s++) if (kime[s] === 'x') {
          add({ s: bs + s, i: 'kick', v: 1 }); meta.kicks.push(base + bs + s);
          add({ s: bs + s, i: first ? 'crash' : 'snare', v: first ? 0.8 : 0.9, kind: 'snare' });
          meta.kimes.push(base + bs + s);
          first = false;
        }
      } else {
        const kp = b % 2 === 1 ? kickAlt : kickPat;
        const chorusish = ['C', 'last', 'solo', 'inter', 'outro'].includes(sec.type);
        const hatPat = chorusish ? st.hatOpen : st.hatSoft;
        const snPat = chorusish ? st.snareChorus : st.snare;
        const fillFrom = fill ? fill.from : 16;
        for (let s = 0; s < 16; s++) {
          if (!sparse && kp[s] === 'x' && !(s >= fillFrom && s % 4 !== 0)) { add({ s: bs + s, i: 'kick', v: s % 8 === 0 ? 1 : 0.85 }); meta.kicks.push(base + bs + s); }
          if (sparse && s === 0) { add({ s: bs, i: 'kick', v: 0.8 }); meta.kicks.push(base + bs); }
          if (s < fillFrom) {
            const sc = snPat[s];
            if (!sparse && sc !== '.') add({ s: bs + s, i: 'snare', v: 0.85 + R.float(-0.05, 0.05), kind: sc === 'r' ? 'rim' : sc === 'c' ? 'clap' : 'snare' });
            if (!sparse && st.ghost[s] === 'g' && sec.type !== 'intro' && R.chance(0.8)) add({ s: bs + s, i: 'snare', v: 0.22, kind: 'ghost' });
            const hc = hatPat[s];
            if (hc !== '.' && !(sparse && s % 2)) add({ s: bs + s, i: 'hat', v: (hc === 'x' ? 0.75 : hc === 'o' ? 0.7 : 0.45) * (sec.type === 'A' ? 0.85 : 1) + R.float(-0.06, 0.06), open: hc === 'o' });
          }
          if ((sec.type === 'B' || (styleKey === 'disco' && chorusish)) && s % 2 === 0 && s < fillFrom) add({ s: bs + s, i: 'perc', v: s % 4 === 2 ? 0.7 : 0.4, kind: sec.type === 'B' ? 'tamb' : 'shaker' });
        }
        if (fill) {
          const n = Math.max(fill.s.length, fill.t.length);
          for (let k = 0; k < n; k++) {
            const s = fill.from + k;
            if (s > 15) break;
            const v = 0.55 + 0.45 * (k / Math.max(1, n - 1));
            if (fill.s[k] === 's') add({ s: bs + s, i: 'snare', v, kind: 'snare' });
            const tc = fill.t[k];
            if (tc && tc !== '.') add({ s: bs + s, i: 'tom', v, n: +tc - 1 });
          }
        }
        if (b === 0 && (['C', 'last', 'solo', 'inter'].includes(sec.type) || (sec.type === 'A' && sections[si - 1]?.type === 'intro'))) add({ s: bs, i: 'crash', v: 0.75 });
      }

      // ---- ベース
      if (kime) {
        for (let s = 0; s < 16; s++) if (kime[s] === 'x') add({ s: bs + s, i: 'bass', m: bassMidi(rootOf(at(s))), d: 2, v: 1, art: 'finger' });
      } else if (!(sparse && b === 0)) {
        for (const n of bassBar(R, sparse ? 'R-------R-------' : bassPat, chords, nextFirst, st.slap)) add({ ...n, s: bs + n.s, i: 'bass' });
      }

      // ---- エレピ
      if (kime) {
        for (let s = 0; s < 16; s++) if (kime[s] === 'x') { state.epPrev = voiceChord(at(s), state.epPrev); add({ s: bs + s, i: 'ep', notes: state.epPrev, d: 2, v: 0.9 }); }
        state.tie = false;
      } else if (epPat === 'arp') {
        for (const c of chords) {
          state.epPrev = voiceChord(c.chord, state.epPrev);
          const v = state.epPrev;
          const order = [0, 1, 2, 3, 2, 1, 2, 3];
          for (let k = 0; k * 2 < c.len; k++) add({ s: bs + c.s + k * 2, i: 'ep', notes: [v[order[k % order.length]]], d: c.len - k * 2, v: 0.62 + (k === 0 ? 0.15 : 0) });
          add({ s: bs + c.s, i: 'ep', notes: [v[0] - 12 >= 45 ? v[0] - 12 : v[0]], d: c.len, v: 0.5 });
        }
      } else {
        const hits = alignHits(parseHits(epPat), chords);
        for (const h of hits) {
          if (h.s === 0 && state.tie) continue; // 前の小節から食って伸ばしている
          let ch = at(h.s);
          let tie = false;
          if (h.s >= 14 && nextFirst !== chords[chords.length - 1].chord) { ch = nextFirst; tie = true; }
          state.epPrev = voiceChord(ch, state.epPrev);
          add({ s: bs + h.s, i: 'ep', notes: state.epPrev, d: tie ? h.d + 6 : h.d, v: (h.s % 4 === 0 ? 0.8 : 0.7) + R.float(-0.05, 0.05) });
          state.tie = tie;
        }
        if (!hits.some((h) => h.s >= 14)) state.tie = false;
      }

      // ---- ギター（カッティング）
      const gtrOn = !sparse && (sec.type !== 'intro') && !(styleKey === 'mellow' && sec.type === 'A');
      if (gtrOn) {
        for (let s = 0; s < 16; s++) {
          const c = kime ? (kime[s] === 'x' ? 'X' : '.') : gtrPat[s];
          if (c === '.' || (fill && s >= fill.from && c === 'm')) continue;
          state.gtrPrev = voiceChord(at(s), state.gtrPrev, { lo: 60, hi: 77, size: 3 });
          add({ s: bs + s, i: 'gtr', notes: state.gtrPrev, d: c === 'm' ? 0.5 : kime ? 2 : 1, v: c === 'X' ? 0.9 : c === 'x' ? 0.7 : 0.5, mute: c === 'm', dir: s % 2 ? 'up' : 'down' });
        }
      }

      // ---- パッド（ストリングス）
      const padOn = !kime && (['B', 'C', 'last', 'solo', 'outro'].includes(sec.type) || (st.padInVerse && sec.type === 'A'));
      if (padOn) for (const c of chords) { state.padPrev = voiceChord(c.chord, state.padPrev, { lo: 55, hi: 76 }); add({ s: bs + c.s, i: 'pad', notes: state.padPrev, d: c.len, v: sec.type === 'A' ? 0.6 : 0.85 }); }

      // ---- ブラス
      const brassOn = ['C', 'last', 'inter', 'outro'].includes(sec.type) || kime;
      if (brassOn) {
        const pat = kime || brassPat;
        const swell = pat === 'x---------------';
        if (kime || swell || b % 2 === 1 || styleKey === 'disco') {
          const hits = swell ? alignHits([{ s: 0, d: 14 }], chords) : parseHits(pat).map((h) => ({ s: h.s, d: 2 }));
          for (const h of hits) {
            state.brassPrev = voiceChord(at(h.s), state.brassPrev, { lo: 62, hi: 82, size: 3 });
            add({ s: bs + h.s, i: 'brass', notes: state.brassPrev, d: h.d, v: swell ? 0.55 : 0.85, swell });
          }
        }
      }

      // ---- ベルのアルペジオ（キラキラ）
      if ((sec.type === 'intro' || sec.type === 'B' || sec.type === 'inter') && b % 2 === 0 && !kime) {
        const ch = at(0);
        const v = voiceChord(ch, null, { lo: 72, hi: 90, size: 4 });
        const order = R.pick([[0, 1, 2, 3, 2, 1, 0, 1], [0, 2, 1, 3, 2, 0, 1, 3], [3, 2, 1, 0, 1, 2, 3, 2]]);
        for (let k = 0; k < 8; k++) add({ s: bs + k * 2, i: 'bell', m: v[order[k]], d: 3, v: 0.35 + (k % 4 === 0 ? 0.12 : 0) });
      }
    }
  }
  events.sort((a, b) => a.s - b.s);
  meta.kicks.sort((a, b) => a - b);
  fixClashes(events);

  // 表示用：小節ごとのコード名
  const keyName = noteName(keyPc, keyPc);
  const bars = [];
  for (const sec of sections) for (let b = 0; b < sec.bars; b++) {
    bars.push({ section: sections.indexOf(sec), chords: sec.barChords[b].map((c) => ({ s: c.s, len: c.len, sym: chordSymbol(c.chord, sec.keyPc) })) });
  }
  const totalBars = bar;
  const lengthSteps = totalBars * 16;
  const { title, titleJa, words } = makeTitle(seed, 0);
  const outro = sections.find((s) => s.type === 'outro');

  return {
    seed, style: styleKey, styleLabel: st.label, bpm, keyPc, keyName: keyName + ' メジャー', swing: st.swing,
    title, titleJa, words, leadPatch, modUp, ending,
    progNames: { A: progs.A.name, B: progs.B.name, C: progs.C.name },
    sections: sections.map((s) => ({ type: s.type, label: s.label, startBar: s.startBar, bars: s.bars, energy: s.energy })),
    bars, events, kicks: meta.kicks, kimes: meta.kimes, lengthSteps,
    fade: ending === 'fade' ? { from: (outro.startBar + 2) * 16, to: (outro.startBar + outro.bars) * 16 } : null,
  };
}

// ---------------------------------------------------------------- コード進行の道具
function fillProg(prog, bars, keyPc) {
  const out = [];
  let beats = 0;
  while (beats < bars * 4) {
    for (const [deg, q, len, bassDeg] of prog.c) {
      if (beats >= bars * 4) break;
      const l = Math.min(len, bars * 4 - beats);
      out.push({ root: pcOf(keyPc + deg), q, bass: pcOf(keyPc + (bassDeg ?? deg)), beats: l });
      beats += l;
    }
  }
  return out;
}

/** 最後の和音を、次のセクションの頭の和音へ導く属和音（V7 か裏コード）に差し替える。 */
function approach(list, target, R, strong = false) {
  const last = list[list.length - 1];
  const leads = isDominant(last.q) && (pcOf(last.root - 7) === target || pcOf(last.root - 1) === target);
  if (leads && !strong) return;
  const tritone = R.chance(0.25);
  const dom = tritone
    ? { root: pcOf(target + 1), q: R.pick(['7', '9']) }
    : { root: pcOf(target + 7), q: R.pick(['7', '13', '7sus4', '7b9']) };
  dom.bass = dom.root;
  if (strong) { // エンディングの前は ii–V でしっかり
    let need = 4;
    while (need > 0 && list.length) {
      const l = list[list.length - 1];
      if (l.beats <= need) { need -= l.beats; list.pop(); } else { l.beats -= need; need = 0; }
    }
    list.push({ root: pcOf(target + 2), q: 'm9', bass: pcOf(target + 2), beats: 2 });
    list.push({ ...dom, root: pcOf(target + 7), bass: pcOf(target + 7), q: '13', beats: 2 });
    return;
  }
  if (last.beats >= 4) { last.beats -= 2; list.push({ ...dom, beats: 2 }); }
  else Object.assign(last, dom);
}

/** 和音の列を小節ごとの [{ s, len, chord }] に分ける（16 分音符単位）。 */
function toBars(list, bars) {
  const out = Array.from({ length: bars }, () => []);
  let step = 0;
  for (const c of list) {
    let len = c.beats * 4;
    while (len > 0) {
      const b = Math.floor(step / 16), s = step % 16;
      if (b >= bars) break;
      const l = Math.min(len, 16 - s);
      out[b].push({ s, len: l, chord: c });
      step += l; len -= l;
    }
  }
  return out;
}

function chordAtBar(chords, s) {
  let c = chords[0];
  for (const x of chords) if (x.s <= s) c = x;
  return c.chord;
}

const rootOf = (ch) => ch.bass ?? ch.root;
const bassMidi = (pc) => 28 + pcOf(pc - 4); // E1..D♯2

/** セクションの中での位置 s の和音（全体の 16 分音符位置）。 */
function chordAtSec(sec, s) {
  const b = Math.min(sec.bars - 1, Math.max(0, Math.floor(s / 16)));
  return chordAtBar(sec.barChords[b], s - b * 16);
}

/** s から始まる音が食っている（直後で和音が変わり、音がそこをまたぐ）なら次の和音を返す。 */
function chordForNote(sec, s, d) {
  const now = chordAtSec(sec, s);
  for (let k = 1; k <= 2; k++) {
    if (k >= d) break;
    const c = chordAtSec(sec, s + k);
    if (c !== now && s + k < sec.bars * 16) return c;
  }
  return now;
}

function parseRhythm(str) {
  const t = str.replace('|', '');
  const out = [];
  for (let i = 0; i < t.length; i++) {
    if (t[i] !== 'x') continue;
    let d = 1;
    while (i + d < t.length && t[i + d] === '-') d++;
    out.push({ s: i, d });
  }
  return out;
}

/** 小節の途中で和音が変わるなら、そこで音を切って弾き直す。 */
function alignHits(hits, chords) {
  const changes = chords.map((c) => c.s).filter((s) => s > 0);
  if (!changes.length) return hits;
  const out = [];
  for (const h of hits) {
    let { s, d } = h;
    for (const c of changes) if (c > s && c < s + d) d = c - s;
    out.push({ s, d });
  }
  for (const c of changes) {
    if (out.some((h) => h.s === c)) continue;
    const nextOn = out.filter((h) => h.s > c).map((h) => h.s)[0] ?? 16;
    out.push({ s: c, d: Math.min(nextOn, 16) - c });
  }
  return out.sort((a, b) => a.s - b.s);
}

function parseHits(pat) {
  const out = [];
  for (let i = 0; i < pat.length; i++) {
    if (pat[i] !== 'x') continue;
    let d = 1;
    while (i + d < pat.length && pat[i + d] === '-') d++;
    out.push({ s: i, d });
  }
  return out;
}

// ---------------------------------------------------------------- メロディ
function snapChordTone(m, ch, dir, tension, R) {
  const pcs = chordTonePcs(ch, R.chance(tension));
  return nearestWithPc(m, pcs, dir);
}

function isStrong(sec, s, d, i, n) {
  if (s % 8 === 0 || d >= 4 || i === n - 1) return true;
  return chordForNote(sec, s, d) !== chordAtSec(sec, s);
}

function shapeDir(shape, x, R) {
  let d;
  if (shape === 'arch') d = x < 0.55 ? 1 : -1;
  else if (shape === 'down') d = -1;
  else if (shape === 'up') d = x < 0.8 ? 1 : -1;
  else d = Math.sin(x * Math.PI * 3) >= 0 ? 1 : -1;
  return R.chance(0.2) ? -d : d;
}

function keepInRange(m, lo, hi, pcs) {
  while (m > hi) m = nearestWithPc(m - 12, pcs);
  while (m < lo) m = nearestWithPc(m + 12, pcs);
  return m;
}

function genMelody(R, sec, opt) {
  const nPhr = Math.floor(sec.bars / 2);
  const motifs = {};
  const notes = [];
  let cur = opt.center;
  for (let p = 0; p < nPhr; p++) {
    const tag = opt.plan[p % opt.plan.length];
    const letter = tag[0];
    const variant = tag.length > 1;
    const start = p * 32;
    const isLast = p === nPhr - 1;
    const center = opt.center + (opt.rising ? p * 1.5 : 0);
    let rhythm, pitches = [];
    const mot = motifs[letter];
    if (!mot) {
      rhythm = parseRhythm(R.pick(opt.pool));
      const shape = R.pick(['arch', 'down', 'up', 'wave', 'arch']);
      for (let i = 0; i < rhythm.length; i++) {
        const { s, d } = rhythm[i];
        const ch = chordForNote(sec, start + s, d);
        const sc = chordScale(sec.keyPc, ch);
        const strong = isStrong(sec, start + s, d, i, rhythm.length);
        let m;
        if (i === 0) m = nearestWithPc(Math.round((cur + center) / 2) + R.int(-2, 2), chordTonePcs(ch, R.chance(opt.tension)), 1);
        else {
          const dir = shapeDir(shape, i / Math.max(1, rhythm.length - 1), R);
          const size = R.weighted([[1, 50], [2, 22], [0, 10], [3, 12], [4, 6]]);
          m = size === 0 ? nearestWithPc(cur, sc) : scaleMove(cur, dir * size, sc);
          if (strong) m = snapChordTone(m, ch, dir, opt.tension, R);
        }
        m = keepInRange(m, opt.lo, opt.hi, sc);
        pitches.push(m);
        cur = m;
      }
      // 音階上の動きとして覚えておく（くり返しで形を保つ）
      const keyScale = chordScale(sec.keyPc, { root: sec.keyPc, q: 'maj7' });
      motifs[letter] = { rhythm, first: pitches[0], steps: pitches.map((m, i) => (i ? scaleSteps(pitches[i - 1], m, keyScale) : 0)) };
    } else {
      rhythm = mot.rhythm;
      const keep = variant ? Math.ceil(rhythm.length * 0.6) : rhythm.length;
      const shape = R.pick(['arch', 'down', 'wave']);
      for (let i = 0; i < rhythm.length; i++) {
        const { s, d } = rhythm[i];
        const ch = chordForNote(sec, start + s, d);
        const sc = chordScale(sec.keyPc, ch);
        const strong = isStrong(sec, start + s, d, i, rhythm.length);
        let m;
        if (i === 0) m = nearestWithPc(mot.first, chordTonePcs(ch, true), 1);
        else if (i < keep) m = mot.steps[i] === 0 ? nearestWithPc(cur, sc) : scaleMove(cur, mot.steps[i], sc);
        else {
          const dir = shapeDir(shape, i / Math.max(1, rhythm.length - 1), R);
          m = scaleMove(cur, dir * R.weighted([[1, 60], [2, 25], [3, 15]]), sc);
        }
        if (strong) m = snapChordTone(m, ch, Math.sign(m - cur) || 1, opt.tension, R);
        m = keepInRange(m, opt.lo, opt.hi, sc);
        pitches.push(m);
        cur = m;
      }
    }
    rhythm.forEach((r, i) => {
      let d = r.d;
      const strong = r.s % 8 === 0;
      if (isLast && i === rhythm.length - 1) {
        d = Math.max(d, Math.min(32 - r.s - 2, 12));
        if (opt.resolve) { const ch = chordAtSec(sec, start + r.s); pitches[i] = nearestWithPc(pitches[i], [ch.root, pcOf(ch.root + (ch.q.startsWith('m') ? 3 : 4))]); }
      }
      notes.push({ s: start + r.s, d, m: pitches[i], v: 0.72 + (strong ? 0.12 : 0) + (i === 0 ? 0.06 : 0) + R.float(-0.05, 0.05) });
    });
  }
  // 重なりを切る
  for (let i = 0; i < notes.length - 1; i++) notes[i].d = Math.min(notes[i].d, notes[i + 1].s - notes[i].s);
  return notes;
}

/** 別のセクション（和音が少し違う／転調）に当てはめ直す。 */
function refit(notes, sec, transpose = 0) {
  const len = sec.bars * 16;
  return notes.filter((n) => n.s < len).map((n, i, arr) => {
    const d = Math.min(n.d, len - n.s);
    let m = n.m + transpose;
    const ch = chordForNote(sec, n.s, d);
    const sc = chordScale(sec.keyPc, ch);
    if (!sc.includes(pcOf(m))) m = nearestWithPc(m, sc);
    const strong = n.s % 8 === 0 || d >= 4 || i === arr.length - 1;
    if (strong && !chordTonePcs(ch, true).includes(pcOf(m))) m = nearestWithPc(m, chordTonePcs(ch, true));
    return { ...n, m, d };
  });
}

function genSolo(R, sec, tonic) {
  const notes = [];
  let cur = tonic + 9;
  const nPhr = Math.floor(sec.bars / 2);
  for (let p = 0; p < nPhr; p++) {
    const rhythm = parseRhythm(R.pick(RHY.S));
    const start = p * 32;
    const lift = p * 2;
    let dir = R.chance(0.5) ? 1 : -1;
    rhythm.forEach((r, i) => {
      const ch = chordForNote(sec, start + r.s, r.d);
      const sc = chordScale(sec.keyPc, ch);
      if (R.chance(0.25)) dir = -dir;
      let m = scaleMove(cur, dir * R.weighted([[1, 55], [2, 25], [3, 12], [4, 8]]), sc);
      if (r.s % 4 === 0 || r.d >= 3) m = nearestWithPc(m, chordTonePcs(ch, true), dir);
      if (m > tonic + 21 + lift / 2) { m = scaleMove(m, -3, sc); dir = -1; }
      if (m < tonic + 2) { m = scaleMove(m, 3, sc); dir = 1; }
      notes.push({ s: start + r.s, d: r.d, m, v: 0.7 + (r.s % 4 === 0 ? 0.12 : 0) + R.float(-0.06, 0.06) });
      cur = m;
    });
  }
  // 弱拍に半音下からのアプローチを少し混ぜる
  for (let i = 0; i < notes.length - 1; i++) {
    const a = notes[i], b = notes[i + 1];
    if (a.s % 2 === 1 && b.s - a.s === 1 && R.chance(0.3)) a.m = b.m - 1;
  }
  for (let i = 0; i < notes.length - 1; i++) notes[i].d = Math.min(notes[i].d, notes[i + 1].s - notes[i].s);
  return notes;
}

/** 長い音・強拍のメロディが、伴奏の和音の音の半音上に重なって濁るなら、和音の音へ寄せる。 */
function fixClashes(events) {
  const harm = events.filter((e) => e.i === 'pad' || (e.i === 'ep' && e.notes.length >= 3));
  const bells = new Map(events.filter((e) => e.i === 'bell').map((e) => [e.s + ':' + e.m, e]));
  let k = 0, cur = null;
  for (const e of events) {
    if (e.i !== 'lead') continue;
    while (k < harm.length && harm[k].s <= e.s) cur = harm[k++];
    if (!cur || !(e.d >= 3 || e.s % 8 === 0)) continue;
    const pcs = cur.notes.map(pcOf);
    const p = pcOf(e.m);
    if (pcs.includes(p) || !pcs.some((c) => pcOf(p - c) === 1)) continue;
    const m = nearestWithPc(e.m, pcs, 1);
    const b = bells.get(e.s + ':' + (e.m + 12));
    if (b) b.m = m + 12;
    e.m = m;
  }
}

// ---------------------------------------------------------------- ベース
function bassBar(R, pat, chords, nextChord, slap) {
  const out = [];
  const at = (s) => chordAtBar(chords, s);
  const changes = new Set(chords.map((c) => c.s));
  let prev = null;
  for (let s = 0; s < 16; s++) {
    let tok = pat[s];
    if (changes.has(s) && s > 0 && !'ROFAtS'.includes(tok)) tok = 'R'; // 和音が変わったら弾き直す
    if (!'ROFAtSg'.includes(tok)) continue;
    const ch = at(s);
    const root = bassMidi(rootOf(ch));
    const iv = ch.q;
    let m = root, art = 'finger', v = s % 4 === 0 ? 1 : 0.8;
    if (tok === 'O') { m = root + 12; art = R.chance(slap) ? 'pop' : 'finger'; }
    else if (tok === 'F') m = root + (iv === 'm7b5' || iv === 'dim7' ? 6 : 7);
    else if (tok === 't') m = root + (iv.startsWith('m') || iv === 'dim7' ? 3 : 4);
    else if (tok === 'S') m = root + (iv.includes('maj') ? 11 : 10);
    else if (tok === 'A') {
      const nextCh = s + 1 < 16 && changes.has(s + 1) ? at(s + 1) : nextChord;
      const target = bassMidi(rootOf(nextCh));
      if (target === root) m = root + 7;
      else m = target + (R.chance(0.6) ? -1 : 1);
      v = 0.75;
    } else if (tok === 'g') { m = prev ?? root; art = 'ghost'; v = 0.35; }
    if (tok === 'R' && s % 4 === 0 && slap > 0 && R.chance(slap)) art = 'thumb';
    let d = 1;
    while (s + d < 16 && pat[s + d] === '-' && !changes.has(s + d)) d++;
    out.push({ s, m, d: tok === 'g' ? 0.5 : d === 1 && pat[s + 1] === '.' ? 0.8 : d, v, art });
    prev = m;
  }
  return out;
}
