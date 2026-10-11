// clawd.js — Clawd（オレンジのカニ）の 3D モデルと動き
//
// 形は clawd-mascot スキルの SVG（150×110）をそのまま 3D にしたもの。1px = 0.007m。
//   胴体 86×66、腕 24×22（肩＝胴体側の端が回転軸）、脚 11×22 が 4 本（外側の脚の外端が胴体の側面とそろう）、目 13×13。
// 3D では「腕を上げる」の符号が SVG と逆になるので、setArm() の raise（＋で先端が上がる）だけで扱う。

import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { zTexture, sparkleTexture } from './textures.js';

const PX = 0.007;
export const CLAWD = {
  BODY_W: 86 * PX, BODY_H: 66 * PX, BODY_D: 0.4,
  ARM_W: 24 * PX, ARM_H: 22 * PX, ARM_D: 0.15,
  LEG_W: 11 * PX, LEG_H: 22 * PX, LEG_D: 0.085,
  EYE: 13 * PX,
  COLOR: 0xc67d5f,
};
const C = CLAWD;

export function createClawd() {
  const root = new THREE.Group();
  root.name = 'clawd';
  const mat = new THREE.MeshStandardMaterial({ name: 'clawdBody', color: C.COLOR, roughness: 0.6, metalness: 0 });
  const eyeMat = new THREE.MeshStandardMaterial({ name: 'clawdEye', color: 0x141414, roughness: 0.75, metalness: 0, envMapIntensity: 0 });

  const hips = new THREE.Group();
  hips.name = 'hips';
  root.add(hips);

  const body = new THREE.Mesh(new RoundedBoxGeometry(C.BODY_W, C.BODY_H, C.BODY_D, 3, 0.02), mat);
  body.name = 'body';
  body.position.y = C.BODY_H / 2;
  hips.add(body);

  // 目（SVG の y=22〜35 → 胴体の上端から 14〜27px 下）
  const eyes = new THREE.Group();
  eyes.name = 'eyes';
  eyes.position.set(0, C.BODY_H - 20.5 * PX, C.BODY_D / 2 + 0.003);
  hips.add(eyes);
  const eyeGeo = new RoundedBoxGeometry(C.EYE, C.EYE, 0.014, 2, 0.003);
  const eyeL = new THREE.Mesh(eyeGeo, eyeMat); eyeL.name = 'eyeL'; eyeL.position.x = -19 * PX;
  const eyeR = new THREE.Mesh(eyeGeo, eyeMat); eyeR.name = 'eyeR'; eyeR.position.x = 19 * PX;
  eyes.add(eyeL, eyeR);

  // 腕：回転軸は肩（SVG の x=36 / x=114、y=46）
  const armGeo = new RoundedBoxGeometry(C.ARM_W, C.ARM_H, C.ARM_D, 2, 0.014);
  const mkArm = (side) => {
    const pivot = new THREE.Group();
    pivot.name = side < 0 ? 'armL' : 'armR';
    pivot.position.set(side * 39 * PX, (74 - 46) * PX, 0);
    const m = new THREE.Mesh(armGeo, mat);
    m.name = pivot.name + 'Block';
    m.position.x = side * C.ARM_W / 2;
    pivot.add(m);
    hips.add(pivot);
    return pivot;
  };
  const armL = mkArm(-1), armR = mkArm(1);

  // 脚：上端が回転軸。x 中心は SVG の 37.5 / 58.5 / 91.5 / 112.5
  const legGeo = new RoundedBoxGeometry(C.LEG_W, C.LEG_H, C.LEG_D, 2, 0.01);
  const legs = [-37.5, -16.5, 16.5, 37.5].map((x, i) => {
    const pivot = new THREE.Group();
    pivot.name = 'leg' + i;
    pivot.position.x = x * PX;
    const m = new THREE.Mesh(legGeo, mat);
    m.name = 'leg' + i + 'Block';
    m.position.y = -C.LEG_H / 2;
    pivot.add(m);
    hips.add(pivot);
    return pivot;
  });

  // クリームソーダ（右手の先の前に持つ。位置は毎フレーム腕の先から決める）
  const glass = makeCreamSoda();
  hips.add(glass);

  // Zzz と きらきら
  const zMat = new THREE.SpriteMaterial({ map: zTexture(), transparent: true, depthWrite: false, opacity: 0 });
  const zzz = [0, 1, 2].map(() => { const s = new THREE.Sprite(zMat.clone()); s.scale.setScalar(0.1); root.add(s); return s; });
  const spMat = new THREE.SpriteMaterial({ map: sparkleTexture(), transparent: true, depthWrite: false, opacity: 0, color: new THREE.Color(2, 1.8, 1.2) });
  const sparkles = [0, 1, 2, 3].map(() => { const s = new THREE.Sprite(spMat.clone()); s.scale.setScalar(0.06); root.add(s); return s; });

  root.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return { root, hips, body, eyes, eyeL, eyeR, armL, armR, legs, glass, zzz, sparkles, mat };
}

function makeCreamSoda() {
  const g = new THREE.Group();
  g.name = 'creamSoda';
  const h = 0.15, r = 0.034;
  const glassMat = new THREE.MeshStandardMaterial({ color: 0xdff6ff, roughness: 0.08, metalness: 0, transparent: true, opacity: 0.28, depthWrite: false });
  const cup = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 0.82, h, 24, 1, true), glassMat);
  cup.position.y = h / 2;
  cup.renderOrder = 2;
  const soda = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.93, r * 0.78, h * 0.78, 24),
    new THREE.MeshStandardMaterial({ color: 0x35d067, emissive: 0x1e8c3a, emissiveIntensity: 0.55, roughness: 0.2, transparent: true, opacity: 0.88 }));
  soda.position.y = h * 0.41;
  const cream = new THREE.Mesh(new THREE.SphereGeometry(r * 1.02, 20, 14), new THREE.MeshStandardMaterial({ color: 0xfff7e8, roughness: 0.7 }));
  cream.scale.y = 0.75;
  cream.position.y = h * 0.84;
  const cherry = new THREE.Mesh(new THREE.SphereGeometry(0.012, 14, 10), new THREE.MeshStandardMaterial({ color: 0xd1123b, roughness: 0.25, emissive: 0x400010 }));
  cherry.position.set(0.008, h * 0.84 + r * 0.78, 0);
  // ストロー：長さ 1 の筒を、毎フレーム「グラスの中の点 → 先端」に合わせて伸ばす（曲がるストロー）
  const strawMat = new THREE.MeshStandardMaterial({ color: 0xff5f8f, roughness: 0.4 });
  const straw = new THREE.Mesh(new THREE.CylinderGeometry(0.0045, 0.0045, 1, 8).translate(0, 0.5, 0), strawMat);
  straw.name = 'straw';
  const bend = new THREE.Mesh(new THREE.SphereGeometry(0.0046, 8, 6), strawMat); // 曲がり目
  bend.name = 'strawBend';
  const stub = new THREE.Mesh(new THREE.CylinderGeometry(0.0045, 0.0045, 1, 8).translate(0, 0.5, 0), strawMat);
  stub.name = 'strawStub';
  g.add(soda, cup, cream, cherry, straw, bend, stub);
  g.userData.straw = { straw, bend, stub, base: new THREE.Vector3(-0.012, h * 0.55, 0.004), top: h + 0.012 };
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return g;
}

/** raise：＋で腕の先が上がる。fwd：＋で腕が体の前へ回る。 */
function setArm(pivot, side, raise, fwd) {
  pivot.rotation.set(0, -side * fwd, side * raise, 'YZX');
}

const smooth = (cur, target, rate, dt) => cur + (target - cur) * (1 - Math.exp(-rate * dt));
const bump = (ph, center = 0.08, w = 0.012) => {
  let d = ph - center; d -= Math.round(d);
  return Math.exp(-(d * d) / w);
};

// stand：1 で座面の上に立つ（脚を下ろす）。dz：前後のずれ。turn：π で窓のほうを向く
const POSES = {
  sleep:  { lean: -0.17, turn: 0, armL: -0.42, armR: -0.32, fwdL: 0.1, fwdR: 0.35, eye: 0.1, sink: 0.01, stand: 0, dz: 0 },
  idle:   { lean: -0.09, turn: 0, armL: -0.28, armR: -0.12, fwdL: 0.12, fwdR: 0.55, eye: 1, sink: 0, stand: 0, dz: 0 },
  listen: { lean: -0.08, turn: 0, armL: -0.25, armR: -0.1, fwdL: 0.15, fwdR: 0.55, eye: 1, sink: 0, stand: 0, dz: 0 },
  wake:   { lean: -0.02, turn: 0, armL: 1.15, armR: 1.1, fwdL: 0.05, fwdR: 0.2, eye: 0.55, sink: -0.02, stand: 0, dz: 0 },
  sip:    { lean: 0.07, turn: 0.1, armL: -0.3, armR: -0.28, fwdL: 0.1, fwdR: 1.35, eye: 0.3, sink: 0, stand: 0, dz: 0 },
  joy:    { lean: 0, turn: 0, armL: 1.05, armR: 1.0, fwdL: 0, fwdR: 0.15, eye: 0.35, sink: 0, stand: 0, dz: 0 },
  gaze:   { lean: -0.06, turn: -0.5, armL: -0.25, armR: -0.1, fwdL: 0.15, fwdR: 0.55, eye: 1, sink: 0, stand: 0, dz: 0 },
  // 振り返って、ソファの背に手をかけて夜景を眺める
  window: { lean: 0.1, turn: Math.PI, armL: 0.3, armR: 0.28, fwdL: 1.15, fwdR: 1.15, eye: 1, sink: -0.07, stand: 1, dz: 0.13 },
};

export class ClawdAnimator {
  constructor(parts) {
    this.p = parts;
    this.state = 'sleep';
    this.timer = 0;
    this.t = 0;
    this.idleTime = 99;
    this.sipCooldown = 9;
    this.gazeCooldown = 18;
    this.blinkT = 2;
    this.blink = 0;
    this.energy = 0.4;
    this.look = new THREE.Vector2();
    this.lookTarget = new THREE.Vector2();
    this.lookHold = 0;
    this.cur = { ...POSES.sleep };
    this.jump = 0;
    this.sitting = 1;
    this.tmp = new THREE.Vector3();
    this.inv = new THREE.Matrix4();
  }

  start(state, dur = 0) { this.state = state; this.timer = dur; }

  /** クリックされたとき */
  poke() { if (this.state === 'window') return; this.start('joy', 1.6); this.jump = 1; }

  /** その状態のポーズへ、なめらかにではなく一気に移る（録画の途中から始めるとき） */
  snap(state) { this.state = state; this.cur = { ...POSES[state] }; this.amt = 1; this.idleTime = 0; }

  /** 振り返って窓の外を眺める（sec 秒） */
  lookOutside(sec = 9) { if (this.state === 'sleep') return; this.start('window', sec); this.jump = 0.6; }

  update(dt, { music, camera }) {
    const p = this.p;
    this.t += dt;
    const playing = !!music.playing;
    this.idleTime = playing ? 0 : this.idleTime + dt;
    this.energy = smooth(this.energy, playing ? music.energy : 0.3, 1.5, dt);
    const groove = THREE.MathUtils.smoothstep(this.energy, 0.82, 0.98);

    // 状態の切り替え
    if (this.timer > 0) this.timer -= dt;
    if (this.state === 'sleep' && playing) this.start('wake', 2.2);
    else if (!playing && this.idleTime > 30 && this.state !== 'sleep') this.start('sleep');
    else if (['wake', 'sip', 'joy', 'gaze', 'window'].includes(this.state) && this.timer <= 0) { this.state = playing ? 'listen' : 'idle'; if (this.cur.stand > 0.5) this.jump = 0.6; }
    else if (this.state === 'listen' && !playing) this.state = 'idle';
    else if (this.state === 'idle' && playing) this.state = 'listen';
    if (this.state === 'listen' || this.state === 'idle') {
      this.sipCooldown -= dt;
      this.gazeCooldown -= dt;
      if (this.sipCooldown < 0 && groove < 0.3) { this.start('sip', 2.1); this.sipCooldown = 16 + Math.random() * 14; }
      else if (this.gazeCooldown < 0 && groove < 0.3) { this.start('gaze', 3.5); this.gazeCooldown = 22 + Math.random() * 18; }
    }

    // ポーズへなめらかに寄せる
    const target = POSES[this.state];
    const rate = this.state === 'joy' || this.state === 'wake' ? 9 : 5;
    for (const k in target) this.cur[k] = smooth(this.cur[k], target[k], k === 'turn' || k === 'stand' ? 4 : rate, dt);
    const c = this.cur;
    this.sitting = 1 - c.stand;

    // 拍に合わせた動き（足し算）
    const beat = music.beat || 0;
    const ph = ((beat % 1) + 1) % 1;
    const active = playing && this.state !== 'sleep';
    const amt = active ? 1 : 0;
    this.amt = smooth(this.amt ?? 0, amt, 3, dt);
    const nod = bump(ph) * this.amt;
    const nodAmp = 0.045 + 0.05 * groove;
    const sway = Math.sin((beat / 4) * Math.PI * 2) * (0.025 + 0.06 * groove) * this.amt;
    const bob = Math.sin(beat * Math.PI) ** 2;
    const kime = music.kimeAge < 0.4 ? Math.exp(-music.kimeAge * 9) : 0;
    const breathe = Math.sin(this.t * (this.state === 'sleep' ? 1.3 : 2.1)) * (this.state === 'sleep' ? 0.014 : 0.006);

    // ジャンプ（クリック）
    this.jump = Math.max(0, this.jump - dt * 1.4);
    const jumpY = this.jump > 0 ? Math.sin((1 - this.jump) * Math.PI * 2.2) ** 2 * 0.09 * this.jump : 0;

    p.hips.position.y = -c.sink - nod * 0.007 + jumpY + Math.max(0, kime) * 0.02 + c.stand * C.LEG_H;
    p.hips.position.z = c.dz;
    p.hips.rotation.set(c.lean + nod * nodAmp, c.turn, sway, 'YXZ');
    p.body.scale.set(1 - breathe * 0.4, 1 + breathe, 1);

    let raiseL = c.armL, raiseR = c.armR;
    if (active && this.state !== 'window') {
      const s = Math.sin(beat * Math.PI);
      raiseL += groove * 0.5 * Math.max(0, s) + 0.06 * bob * (1 - groove);
      if (this.state !== 'sip') raiseR += groove * 0.5 * Math.max(0, -s);
      raiseL += kime * 0.9;
      if (this.state !== 'sip') raiseR += kime * 0.7;
    }
    setArm(p.armL, -1, raiseL, c.fwdL);
    setArm(p.armR, 1, raiseR, c.fwdR);

    // グラス：右腕の先の少し前。飲むときは低めに持ち、曲がるストローを「口」（目の下の真ん中）へ伸ばす
    const sipK = this.state === 'sip' ? Math.min(1, (2.1 - this.timer) / 0.6) * Math.min(1, this.timer / 0.5) : 0;
    this.sipK = smooth(this.sipK ?? 0, sipK, 10, dt);
    p.armR.updateMatrix();
    this.tmp.set(C.ARM_W - 0.025, -0.02, 0).applyMatrix4(p.armR.matrix);
    p.glass.position.set(this.tmp.x - 0.03 * this.sipK, this.tmp.y - 0.03 - 0.045 * this.sipK, this.tmp.z + C.ARM_D / 2 + 0.035 + 0.075 * this.sipK);
    p.glass.rotation.set(0, 0, 0);
    this.aimStraw(this.sipK);

    // 脚：座っているときは前に投げ出し、拍で交互に上げる
    const tapA = active ? bump(ph, 0.06, 0.02) * (Math.floor(beat) % 2 === 0 ? 1 : 0) : 0;
    const tapB = active ? bump(ph, 0.06, 0.02) * (Math.floor(beat) % 2 === 1 ? 1 : 0) : 0;
    const kick = 0.18 + 0.22 * groove;
    p.legs.forEach((leg, i) => {
      const tap = i % 2 === 0 ? tapA : tapB;
      const sleepy = this.state === 'sleep' ? 0.05 : 0;
      leg.rotation.x = -Math.PI / 2 * this.sitting - tap * kick - sleepy + (this.state === 'joy' ? Math.sin(this.t * 18 + i) * 0.2 : 0);
      leg.position.y = (C.LEG_D / 2) * this.sitting;
      leg.position.z = (C.BODY_D / 2 - C.LEG_D / 2 - 0.01) * this.sitting;
    });

    // まばたきと目線
    this.blinkT -= dt;
    if (this.blinkT < 0) { this.blink = 1; this.blinkT = 2.5 + Math.random() * 4; }
    this.blink = Math.max(0, this.blink - dt * 9);
    const blinkClose = this.blink > 0 ? Math.sin(this.blink * Math.PI) : 0;
    const open = Math.max(0.08, c.eye * (1 - blinkClose * 0.9));
    this.lookHold -= dt;
    if (this.lookHold < 0) {
      this.lookHold = 1.2 + Math.random() * 2.5;
      if (camera && Math.random() < 0.65) {
        p.eyes.updateWorldMatrix(true, false);
        this.tmp.copy(camera.position);
        this.inv.copy(p.eyes.matrixWorld).invert();
        this.tmp.applyMatrix4(this.inv);
        if (this.tmp.z > 0.2) this.lookTarget.set(THREE.MathUtils.clamp(this.tmp.x / this.tmp.z, -1, 1), THREE.MathUtils.clamp(this.tmp.y / this.tmp.z, -1, 1));
        else this.lookTarget.set(0, 0);
      } else this.lookTarget.set((Math.random() - 0.5) * 1.6, (Math.random() - 0.4) * 0.8);
    }
    if (this.state === 'gaze') this.lookTarget.set(-1, 0.2);
    if (this.state === 'window') this.lookTarget.set(Math.sin(this.t * 0.4) * 0.8, 0.1);
    this.look.x = smooth(this.look.x, this.lookTarget.x, 10, dt);
    this.look.y = smooth(this.look.y, this.lookTarget.y, 10, dt);
    const lx = this.look.x * 0.016, ly = this.look.y * 0.011;
    p.eyeL.position.set(-19 * PX + lx, ly, 0);
    p.eyeR.position.set(19 * PX + lx, ly, 0);
    p.eyeL.scale.y = p.eyeR.scale.y = open;

    // Zzz
    const sleeping = this.state === 'sleep';
    p.zzz.forEach((s, i) => {
      const f = (this.t * 0.32 + i / 3) % 1;
      s.position.set(0.24 + f * 0.14 + Math.sin(f * 6 + i) * 0.02, 0.62 + f * 0.36, 0.05);
      s.material.opacity = smooth(s.material.opacity, sleeping ? Math.sin(f * Math.PI) * 0.95 : 0, 4, dt);
      s.scale.setScalar(0.06 + f * 0.07);
      s.visible = s.material.opacity > 0.01;
    });
    // きらきら
    const joyful = this.state === 'joy' || (kime > 0.3);
    p.sparkles.forEach((s, i) => {
      const a = i * 1.7 + this.t * 0.8;
      s.position.set(Math.cos(a) * 0.36, 0.72 + Math.sin(this.t * 3 + i * 2) * 0.05 + (i % 2) * 0.08, 0.05 + Math.sin(a) * 0.12);
      s.material.opacity = smooth(s.material.opacity, joyful ? 0.5 + 0.5 * Math.sin(this.t * 10 + i * 1.3) : 0, 8, dt);
      s.material.rotation = this.t * 1.5 + i;
      s.visible = s.material.opacity > 0.01;
    });
  }

  /** ストローの向き。k=0 でふつう（上に斜め）、k=1 で口の位置まで伸びる。 */
  aimStraw(k) {
    const g = this.p.glass;
    const S = g.userData.straw;
    this._a ??= new THREE.Vector3(); this._b ??= new THREE.Vector3(); this._c ??= new THREE.Vector3(); this._m ??= new THREE.Vector3(); this._inv ??= new THREE.Matrix4();
    const A = this._a.set(S.base.x, S.top, S.base.z);                  // クリームの上に出たところ
    const up = this._b.set(-0.045, 0.085, 0).add(A);                    // ふだんの先端
    g.updateMatrix();
    this._inv.copy(g.matrix).invert();
    const mouth = this._m.set(0.0, 0.205, C.BODY_D / 2 + 0.006).applyMatrix4(this._inv); // 胴体の正面、目の下の真ん中
    const rise = this._c.copy(A).setY(Math.max(A.y + 0.02, mouth.y + 0.004));        // 少し立ち上がってから曲がる
    const bendAt = rise.clone().lerp(up, 1 - k);
    const tip = up.clone().lerp(mouth, k);
    const seg = (mesh, from, to) => {
      const d = to.clone().sub(from);
      const len = Math.max(1e-4, d.length());
      mesh.position.copy(from);
      mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.divideScalar(len));
      mesh.scale.set(1, len, 1);
    };
    seg(S.stub, S.base, k > 0.01 ? bendAt : A);
    seg(S.straw, k > 0.01 ? bendAt : A, tip);
    S.bend.position.copy(k > 0.01 ? bendAt : A);
  }

  state_() { return { state: this.state, energy: +this.energy.toFixed(2) }; }
}
