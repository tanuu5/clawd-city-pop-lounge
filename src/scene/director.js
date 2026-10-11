// director.js — カメラ：オート（曲のセクションの変わり目でカットを切り替える）と、自由（ドラッグで見回す）
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { ROOM } from './room.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);

// from → to へゆっくり動くショット。[カメラ位置, 注視点]
export const SHOTS = {
  wide:      { a: [V(3.15, 1.45, 2.55), V(0.15, 0.85, -1.75)], b: [V(2.45, 1.32, 2.95), V(0.3, 0.85, -1.75)], fov: 42 },
  clawd:     { a: [V(1.42, 0.98, -0.28), V(0.6, 0.72, -1.6)], b: [V(1.12, 0.9, -0.5), V(0.6, 0.74, -1.6)], fov: 36 },
  window:    { a: [V(-1.45, 1.18, 0.35), V(0.4, 0.55, -4.5)], b: [V(-0.95, 1.12, 0.15), V(0.65, 0.55, -4.5)], fov: 50 },
  turntable: { a: [V(2.0, 1.02, -1.72), V(2.32, 0.64, -2.74)], b: [V(2.32, 0.98, -1.82), V(2.25, 0.64, -2.72)], fov: 40 },
  low:       { a: [V(1.9, 0.34, 0.7), V(0.45, 0.88, -1.9)], b: [V(1.4, 0.3, 0.85), V(0.35, 0.88, -1.9)], fov: 46 },
  high:      { a: [V(3.95, 2.78, 3.35), V(-0.2, 0.35, -1.5)], b: [V(3.5, 2.72, 3.5), V(-0.4, 0.35, -1.5)], fov: 44 },
  side:      { a: [V(-3.15, 1.0, -0.85), V(0.45, 0.8, -1.8)], b: [V(-3.1, 1.06, -0.2), V(0.45, 0.8, -1.8)], fov: 40 },
  drone:     { a: [V(1.05, 1.9, -4.75), V(0.66, 0.92, -1.75)], b: [V(0.3, 1.82, -4.35), V(0.66, 0.94, -1.75)], fov: 30 },
};
const ORDER = ['wide', 'clawd', 'window', 'turntable', 'wide', 'low', 'clawd', 'side', 'high'];

const ease = (k) => k * k * (3 - 2 * k);

export class Director {
  constructor(camera, dom) {
    this.camera = camera;
    this.mode = 'auto';
    this.controls = new OrbitControls(camera, dom);
    this.controls.enabled = false;
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.minDistance = 0.6;
    this.controls.maxDistance = 5.5;
    this.controls.maxPolarAngle = Math.PI * 0.53;
    this.controls.target.set(0.6, 0.75, -1.6);
    this.controls.rotateSpeed = 0.6;
    this.shot = 'wide';
    this.elapsed = 0;
    this.dur = 16;
    this.order = 0;
    this.lastSection = -1;
    this.target = new THREE.Vector3();
    this.fixed = null; // 撮影用：ショットを固定する
    this.reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.onCut = null;
  }

  setMode(mode) {
    if (mode === this.mode) return;
    this.mode = mode;
    if (mode === 'free') {
      this.controls.enabled = true;
      this.controls.target.copy(this.target);
      this.controls.update();
    } else {
      this.controls.enabled = false;
      this.cut(this.nextShot());
    }
  }

  nextShot() {
    this.order = (this.order + 1) % ORDER.length;
    return ORDER[this.order];
  }

  cut(name, at = 0) {
    this.shot = name;
    this.elapsed = at;
    this.onCut?.(name);
  }

  update(dt, t, music) {
    if (this.mode === 'free') {
      this.controls.update();
      const p = this.camera.position;
      p.x = THREE.MathUtils.clamp(p.x, ROOM.x0 + 0.25, ROOM.x1 - 0.25);
      p.y = THREE.MathUtils.clamp(p.y, 0.15, ROOM.h - 0.15);
      p.z = THREE.MathUtils.clamp(p.z, ROOM.z0 + 0.25, ROOM.z1 - 0.25);
      this.target.copy(this.controls.target);
      return;
    }
    this.elapsed += dt;
    if (!this.fixed && !this.reduced) {
      const sec = music.playing ? music.sectionIndex : -1;
      const sectionChanged = sec !== this.lastSection;
      this.lastSection = sec;
      if ((sectionChanged && music.playing && this.elapsed > 5) || this.elapsed > (music.playing ? 17 : 22)) this.cut(this.nextShot());
    }
    const S = SHOTS[this.fixed || this.shot];
    const k = ease(Math.min(1, this.elapsed / (this.reduced ? 60 : this.dur)));
    this.camera.position.lerpVectors(S.a[0], S.b[0], k);
    this.target.lerpVectors(S.a[1], S.b[1], k);
    // 縦長の画面では少し広く撮り、下の再生カードに隠れないよう被写体を上に寄せる
    const aspect = this.camera.aspect;
    const narrow = aspect < 1 ? Math.min(1, (1 - aspect) / 0.55) : 0;
    const fov = narrow ? Math.min(78, S.fov / Math.pow(Math.max(aspect, 0.3), 0.6)) : S.fov;
    if (narrow) {
      const d = this.camera.position.distanceTo(this.target);
      this.target.y -= Math.min(0.45, d * 0.12) * narrow;
    }
    // 手持ちのような、ごく小さな揺れ
    this.camera.position.x += Math.sin(t * 0.63) * 0.008;
    this.camera.position.y += Math.sin(t * 0.47 + 1) * 0.006;
    if (this.camera.fov !== fov) { this.camera.fov = fov; this.camera.updateProjectionMatrix(); }
    this.camera.lookAt(this.target);
  }
}
