// room.js — 47 階のラウンジ（床・壁・窓・家具・オーディオ・照明）
//
// 単位はメートル。床 y=0、窓（奥の壁）z=-3.2、左の壁も途中までガラス（角部屋）。
// 動かすもの（レコード、スピーカー、VU メーター、ホログラム、ネオン）は update() でまとめて動かす。

import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import * as TX from './textures.js';

export const ROOM = { x0: -4.5, x1: 4.5, z0: -3.2, z1: 3.8, h: 3.1 };
export const SEAT = { x: 0.64, y: 0.44, z: -1.58 }; // Clawd が座る位置（右の座面）

const std = (color, rough = 0.8, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: 0, ...extra });
const rbox = (w, h, d, r = 0.02, seg = 2) => new RoundedBoxGeometry(w, h, d, seg, Math.min(r, w / 2, h / 2, d / 2));

function mesh(geo, mat, x = 0, y = 0, z = 0, parent = null, name = '') {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = true; m.receiveShadow = true;
  if (name) m.name = name;
  if (parent) parent.add(m);
  return m;
}

export function createRoom() {
  const room = new THREE.Group();
  room.name = 'room';
  const A = {}; // 動かすもの
  const { x0, x1, z0, z1, h } = ROOM;

  // ---------------------------------------------------------------- 床・壁・天井
  const floorMat = new THREE.MeshStandardMaterial({ map: TX.woodFloor(), roughness: 0.3, metalness: 0, envMapIntensity: 0.9 });
  const floor = mesh(new THREE.PlaneGeometry(x1 - x0, z1 - z0), floorMat, (x0 + x1) / 2, 0, (z0 + z1) / 2, room, 'floor');
  floor.rotation.x = -Math.PI / 2;
  floor.castShadow = false;

  const wallMat = std(0x4a4452, 0.92);
  const rightWall = mesh(new THREE.PlaneGeometry(z1 - z0, h), wallMat, x1, h / 2, (z0 + z1) / 2, room, 'wallRight');
  rightWall.rotation.y = -Math.PI / 2;
  const frontWall = mesh(new THREE.PlaneGeometry(x1 - x0, h), wallMat, 0, h / 2, z1, room, 'wallFront');
  frontWall.rotation.y = Math.PI;
  const leftWall = mesh(new THREE.PlaneGeometry(z1 - 0.6, h), wallMat, x0, h / 2, (0.6 + z1) / 2, room, 'wallLeft');
  leftWall.rotation.y = Math.PI / 2;
  const ceilMat = std(0x17151c, 0.95);
  const ceil = mesh(new THREE.PlaneGeometry(x1 - x0, z1 - z0), ceilMat, 0, h, (z0 + z1) / 2, room, 'ceiling');
  ceil.rotation.x = Math.PI / 2;
  // 幅木
  const baseMat = std(0x221f26, 0.6);
  mesh(new THREE.BoxGeometry(0.03, 0.08, z1 - z0), baseMat, x1 - 0.015, 0.04, (z0 + z1) / 2, room);
  mesh(new THREE.BoxGeometry(x1 - x0, 0.08, 0.03), baseMat, 0, 0.04, z1 - 0.015, room);

  // 天井の間接照明（下がり天井のふち）
  const coveMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6, 0.6, 1.4), toneMapped: false });
  A.coveMat = coveMat;
  const drop = new THREE.Group(); drop.name = 'cove'; room.add(drop);
  const dw = 6.6, dd = 4.6, dy = h - 0.16, dz = 0.1;
  mesh(new THREE.BoxGeometry(dw, 0.12, dd), std(0x1c1a22, 0.9), 0, dy + 0.06, dz, drop);
  for (const [w, d, x, z] of [[dw, 0.03, 0, dz - dd / 2], [dw, 0.03, 0, dz + dd / 2], [0.03, dd, -dw / 2, dz], [0.03, dd, dw / 2, dz]]) {
    const strip = new THREE.Mesh(new THREE.BoxGeometry(w, 0.02, d), coveMat);
    strip.position.set(x, dy - 0.005, z);
    drop.add(strip);
  }
  // ダウンライト
  const dlMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.4, 1.2, 0.95), toneMapped: false });
  A.downMat = dlMat;
  for (const [x, z] of [[-2.2, -0.8], [2.2, -0.8], [-2.2, 1.6], [2.2, 1.6]]) {
    const d = new THREE.Mesh(new THREE.CircleGeometry(0.06, 20), dlMat);
    d.rotation.x = Math.PI / 2; d.position.set(x, dy - 0.001, z); drop.add(d);
  }

  // ---------------------------------------------------------------- 窓（奥と左のガラス）
  const frameMat = std(0x16161b, 0.4, { metalness: 0.6 });
  const win = new THREE.Group(); win.name = 'windows'; room.add(win);
  for (let x = x0; x <= x1 + 0.01; x += 1.5) mesh(new THREE.BoxGeometry(0.07, h, 0.12), frameMat, x, h / 2, z0, win);
  mesh(new THREE.BoxGeometry(x1 - x0, 0.09, 0.16), frameMat, 0, 0.045, z0, win);
  mesh(new THREE.BoxGeometry(x1 - x0, 0.12, 0.16), frameMat, 0, h - 0.06, z0, win);
  for (let z = z0 + 1.2; z <= 0.61; z += 1.27) mesh(new THREE.BoxGeometry(0.12, h, 0.07), frameMat, x0, h / 2, z, win);
  mesh(new THREE.BoxGeometry(0.16, 0.09, 0.6 - z0), frameMat, x0, 0.045, (z0 + 0.6) / 2, win);
  mesh(new THREE.BoxGeometry(0.16, 0.12, 0.6 - z0), frameMat, x0, h - 0.06, (z0 + 0.6) / 2, win);
  const glassMat = new THREE.MeshStandardMaterial({ color: 0x9fb8d8, roughness: 0.04, metalness: 0.0, transparent: true, opacity: 0.07, depthWrite: false, envMapIntensity: 1.6 });
  A.glassMat = glassMat;
  const g1 = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, h), glassMat); g1.position.set(0, h / 2, z0 - 0.01); g1.name = 'glassBack'; win.add(g1);
  const g2 = new THREE.Mesh(new THREE.PlaneGeometry(0.6 - z0, h), glassMat); g2.position.set(x0 - 0.01, h / 2, (z0 + 0.6) / 2); g2.rotation.y = Math.PI / 2; g2.name = 'glassLeft'; win.add(g2);
  A.glassPanes = [g1, g2];

  // 外から見たときの建物の壁（上下の階・となりの部屋）。窓の外から部屋をのぞくショットで見える
  const facade = new THREE.Group(); facade.name = 'facade'; room.add(facade);
  const fz = z0 - 0.14;
  const facadePlane = (w, hh, cx, cy, cz, ry, seed) => {
    const t = TX.facadeWindows(seed);
    t.repeat.set(w / 12, hh / 10.2);
    t.offset.set(cx / 12, cy / 10.2);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, hh), new THREE.MeshBasicMaterial({ map: t, color: new THREE.Color(0.55, 0.52, 0.6) }));
    m.position.set(cx, cy, cz); m.rotation.y = ry;
    facade.add(m);
    return m;
  };
  facadePlane(60, 60, 25.5, h + 30.4, fz, Math.PI, 1);       // 上の階
  facadePlane(60, 60, 25.5, -30.3, fz, Math.PI, 2);          // 下の階
  facadePlane(50.6, h + 0.7, 29.8, h / 2, fz, Math.PI, 3);   // 右どなり
  facadePlane(60, 60, x0 - 0.14, h + 30.4, z0 + 30, -Math.PI / 2, 4);
  facadePlane(60, 60, x0 - 0.14, -30.3, z0 + 30, -Math.PI / 2, 5);
  facadePlane(60, h + 0.7, x0 - 0.14, h / 2, 0.6 + 30.05, -Math.PI / 2, 6);
  const slabMat = std(0x0c0c12, 0.6, { metalness: 0.4 });
  mesh(new THREE.BoxGeometry(x1 - x0 + 0.3, 0.3, 0.3), slabMat, 0, -0.15, z0 - 0.05, facade);
  mesh(new THREE.BoxGeometry(x1 - x0 + 0.3, 0.4, 0.3), slabMat, 0, h + 0.2, z0 - 0.05, facade);

  // ---------------------------------------------------------------- ラグ
  const rug = new THREE.Mesh(new THREE.CircleGeometry(1.45, 64), new THREE.MeshStandardMaterial({ map: TX.rug(), roughness: 0.95, transparent: true }));
  rug.rotation.x = -Math.PI / 2; rug.position.set(0.1, 0.006, -0.75); rug.receiveShadow = true; rug.name = 'rug';
  room.add(rug);

  // ---------------------------------------------------------------- ソファ（ティールのベルベット）
  const sofa = new THREE.Group(); sofa.name = 'sofa'; room.add(sofa);
  sofa.position.set(0, 0, -1.55);
  const velvet = new THREE.MeshPhysicalMaterial({ color: 0x1d5a63, roughness: 0.85, sheen: 1, sheenRoughness: 0.45, sheenColor: new THREE.Color(0x7fd3d6) });
  const woodDark = std(0x2a1a12, 0.45);
  mesh(rbox(2.5, 0.2, 0.95, 0.04), velvet, 0, 0.2, 0, sofa, 'sofaBase');
  for (const s of [-1, 1]) {
    mesh(rbox(1.18, 0.16, 0.74, 0.07, 4), velvet, s * 0.6, 0.36, 0.09, sofa, 'seat' + s);
    const back = mesh(rbox(1.18, 0.48, 0.24, 0.09, 4), velvet, s * 0.6, 0.62, -0.33, sofa, 'back' + s);
    back.rotation.x = -0.12;
    mesh(rbox(0.22, 0.56, 0.95, 0.08, 4), velvet, s * 1.32, 0.38, 0, sofa, 'arm' + s);
    for (const z of [-0.38, 0.38]) mesh(new THREE.CylinderGeometry(0.025, 0.018, 0.1, 12), woodDark, s * 1.3, 0.05, z, sofa);
  }
  mesh(rbox(2.6, 0.06, 0.2, 0.03), velvet, 0, 0.88, -0.45, sofa).rotation.x = -0.12;
  // クッション
  const pink = new THREE.MeshPhysicalMaterial({ color: 0xe9849f, roughness: 0.8, sheen: 1, sheenColor: new THREE.Color(0xffc6d6) });
  const mustard = new THREE.MeshPhysicalMaterial({ color: 0xe0a83f, roughness: 0.8, sheen: 0.8, sheenColor: new THREE.Color(0xffe2a0) });
  const c1 = mesh(rbox(0.42, 0.4, 0.14, 0.07, 4), pink, -0.85, 0.66, -0.16, sofa, 'cushionPink'); c1.rotation.set(-0.3, 0.25, 0.12);
  const c2 = mesh(rbox(0.36, 0.34, 0.13, 0.065, 4), mustard, -0.5, 0.62, -0.2, sofa, 'cushionMustard'); c2.rotation.set(-0.25, -0.15, -0.08);
  const c3 = mesh(rbox(0.3, 0.3, 0.12, 0.06, 4), pink, 1.13, 0.6, -0.12, sofa, 'cushionPink2'); c3.rotation.set(-0.2, -0.75, -0.12);

  // ---------------------------------------------------------------- コーヒーテーブル
  const table = new THREE.Group(); table.name = 'coffeeTable'; room.add(table);
  table.position.set(0.1, 0, -0.35);
  const gold = new THREE.MeshStandardMaterial({ color: 0xc9a25a, roughness: 0.28, metalness: 1 });
  const top = mesh(new THREE.CylinderGeometry(0.58, 0.58, 0.04, 56), new THREE.MeshStandardMaterial({ map: TX.marble(), roughness: 0.18 }), 0, 0.38, 0, table, 'tableTop');
  top.material.envMapIntensity = 1.2;
  mesh(new THREE.CylinderGeometry(0.07, 0.11, 0.34, 24), gold, 0, 0.19, 0, table);
  mesh(new THREE.CylinderGeometry(0.3, 0.32, 0.03, 40), gold, 0, 0.015, 0, table);
  // LP ジャケット
  const sleeve = mesh(new THREE.BoxGeometry(0.31, 0.004, 0.31), new THREE.MeshStandardMaterial({ map: TX.poolArt(1, 256), roughness: 0.6 }), -0.22, 0.402, 0.12, table, 'lpSleeve');
  sleeve.rotation.y = 0.4;
  // ホログラムの投影機
  const puck = mesh(new THREE.CylinderGeometry(0.06, 0.07, 0.03, 32), std(0x111116, 0.3, { metalness: 0.5 }), 0.24, 0.415, -0.05, table, 'holoPuck');
  const ringMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.4, 2.2, 2.6), toneMapped: false });
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.055, 0.004, 8, 40), ringMat);
  ring.rotation.x = Math.PI / 2; ring.position.y = 0.017; puck.add(ring);
  // ホログラム本体（曲名とスペクトル）
  const holoCanvas = document.createElement('canvas'); holoCanvas.width = 512; holoCanvas.height = 320;
  const holoTex = new THREE.CanvasTexture(holoCanvas); holoTex.colorSpace = THREE.SRGBColorSpace;
  const holoMat = new THREE.MeshBasicMaterial({ map: holoTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, color: new THREE.Color(1.6, 1.6, 1.6), toneMapped: false });
  const holo = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.31), holoMat);
  holo.position.set(0.34, 0.86, -0.4); holo.name = 'hologram';
  room.add(holo);
  const beamMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.2, 0.9, 1.1), transparent: true, opacity: 0.05, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.05, 0.27, 24, 1, true), beamMat);
  beam.position.set(0.34, 0.565, -0.4);
  room.add(beam);
  Object.assign(A, { holo, holoCanvas, holoTex, holoMat, beam });

  // ---------------------------------------------------------------- サイドボードとレコードプレーヤー
  const credenza = new THREE.Group(); credenza.name = 'credenza'; room.add(credenza);
  credenza.position.set(2.7, 0, -2.72);
  const walnut = std(0x5a3520, 0.5);
  mesh(rbox(1.9, 0.5, 0.46, 0.015), walnut, 0, 0.33, 0, credenza, 'credenzaBody');
  for (const x of [-0.85, 0.85]) for (const z of [-0.18, 0.18]) mesh(new THREE.CylinderGeometry(0.018, 0.012, 0.08, 10), gold, x, 0.04, z, credenza);
  // 引き戸の溝
  for (const x of [-0.47, 0, 0.47]) mesh(new THREE.BoxGeometry(0.004, 0.42, 0.002), std(0x24150c, 0.6), x, 0.33, 0.233, credenza);
  // レコードプレーヤー
  const tt = new THREE.Group(); tt.name = 'turntable'; credenza.add(tt);
  tt.position.set(-0.42, 0.58, 0.0);
  mesh(rbox(0.48, 0.09, 0.38, 0.012), std(0x1a1a1f, 0.35, { metalness: 0.2 }), 0, 0.045, 0, tt, 'ttPlinth');
  const platter = new THREE.Group(); platter.name = 'platter'; tt.add(platter);
  platter.position.set(-0.04, 0.095, 0);
  mesh(new THREE.CylinderGeometry(0.155, 0.155, 0.014, 48), new THREE.MeshStandardMaterial({ color: 0xb8bcc4, roughness: 0.25, metalness: 1 }), 0, 0, 0, platter);
  const vinylMat = new THREE.MeshStandardMaterial({ map: TX.vinyl('#f25f7a', 'CLAWD FM'), roughness: 0.35, metalness: 0.1 });
  A.vinylMat = vinylMat;
  const disc = mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.004, 64), [std(0x0c0c0e, 0.4), vinylMat, std(0x0c0c0e, 0.4)], 0, 0.009, 0, platter, 'vinyl');
  disc.material[1].map.center.set(0.5, 0.5);
  // トーンアーム
  const armPivot = new THREE.Group(); armPivot.name = 'tonearm'; tt.add(armPivot);
  armPivot.position.set(0.17, 0.12, -0.13);
  const chrome = new THREE.MeshStandardMaterial({ color: 0xd8dbe2, roughness: 0.2, metalness: 1 });
  mesh(new THREE.CylinderGeometry(0.018, 0.022, 0.05, 16), chrome, 0, -0.012, 0, armPivot);
  const armBar = mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.25, 8), chrome, 0, 0.012, 0.125, armPivot);
  armBar.rotation.x = Math.PI / 2;
  mesh(new THREE.BoxGeometry(0.022, 0.012, 0.04), std(0x222228, 0.4), 0, 0.006, 0.255, armPivot, 'headshell');
  mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.04, 14), std(0x333338, 0.5), 0, 0.012, -0.035, armPivot).rotation.x = Math.PI / 2;
  // アンプと VU メーター
  const amp = new THREE.Group(); amp.name = 'amp'; credenza.add(amp);
  amp.position.set(0.32, 0.58, 0.02);
  mesh(rbox(0.5, 0.14, 0.34, 0.01), new THREE.MeshStandardMaterial({ color: 0xbfc2c8, roughness: 0.32, metalness: 0.9 }), 0, 0.07, 0, amp, 'ampBody');
  const vuMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 1.35, 0.55), toneMapped: false });
  A.vuNeedles = [];
  for (const s of [-1, 1]) {
    const face = new THREE.Mesh(new THREE.PlaneGeometry(0.15, 0.075), vuMat);
    face.position.set(s * 0.09, 0.08, 0.171); amp.add(face);
    const needle = new THREE.Mesh(new THREE.BoxGeometry(0.0025, 0.06, 0.001), new THREE.MeshBasicMaterial({ color: 0x1a0d05 }));
    needle.geometry.translate(0, 0.03, 0);
    needle.position.set(s * 0.09, 0.048, 0.173);
    amp.add(needle);
    A.vuNeedles.push(needle);
  }
  for (let k = 0; k < 4; k++) mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.02, 16), chrome, -0.18 + k * 0.12 + (k > 1 ? 0.12 : 0), 0.035, 0.175, amp).rotation.x = Math.PI / 2;
  // きのこ型のランプ
  const mush = new THREE.Group(); mush.name = 'mushroomLamp'; credenza.add(mush);
  mush.position.set(0.78, 0.58, -0.05);
  mesh(new THREE.CylinderGeometry(0.03, 0.05, 0.2, 20), std(0xf3e6cf, 0.4), 0, 0.1, 0, mush);
  const shadeMat = new THREE.MeshStandardMaterial({ color: 0xffd8a8, emissive: 0xffa860, emissiveIntensity: 0.9, roughness: 0.5 });
  A.mushMat = shadeMat;
  const sh = mesh(new THREE.SphereGeometry(0.13, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2), shadeMat, 0, 0.19, 0, mush);
  sh.scale.y = 0.75;
  // 立てかけた LP
  for (let k = 0; k < 3; k++) {
    const lp = mesh(new THREE.BoxGeometry(0.31, 0.31, 0.006), new THREE.MeshStandardMaterial({ map: TX.poolArt(k + 2, 256), roughness: 0.6 }), -0.86 + k * 0.012, 0.74, -0.12 + k * 0.03, credenza);
    lp.rotation.set(-0.05, 0.25 - k * 0.1, 0.02 * k);
  }

  // ---------------------------------------------------------------- スピーカー
  A.cones = [];
  const mkSpeaker = (x, z, ry, name) => {
    const sp = new THREE.Group(); sp.name = name; room.add(sp);
    sp.position.set(x, 0, z); sp.rotation.y = ry;
    mesh(rbox(0.38, 1.02, 0.4, 0.015), walnut, 0, 0.53, 0, sp, name + 'Cabinet');
    mesh(new THREE.BoxGeometry(0.34, 0.96, 0.01), std(0x111114, 0.6), 0, 0.53, 0.2, sp);
    const coneMat = std(0x1b1b1f, 0.75);
    const ringM = std(0x2a2a30, 0.5);
    for (const [y, r] of [[0.32, 0.135], [0.64, 0.07], [0.86, 0.032]]) {
      const holder = new THREE.Group(); holder.position.set(0, y, 0.205); sp.add(holder);
      mesh(new THREE.TorusGeometry(r, r * 0.12, 10, 40), ringM, 0, 0, 0, holder);
      const cone = mesh(new THREE.ConeGeometry(r * 0.92, r * 0.45, 40, 1, true), coneMat, 0, 0, -r * 0.18, holder);
      cone.rotation.x = -Math.PI / 2;
      cone.material.side = THREE.DoubleSide;
      const cap = mesh(new THREE.SphereGeometry(r * 0.28, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), std(0x2c2c32, 0.4, { metalness: 0.4 }), 0, 0, -0.005, holder);
      cap.rotation.x = Math.PI / 2;
      A.cones.push({ holder, r, kind: r > 0.1 ? 'woofer' : r > 0.05 ? 'mid' : 'tweeter' });
    }
    // 小さな青い電源ランプ
    const led = new THREE.Mesh(new THREE.CircleGeometry(0.006, 12), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.5, 1.5, 3), toneMapped: false }));
    led.position.set(0.13, 0.08, 0.206); sp.add(led);
  };
  mkSpeaker(-2.25, -2.62, 0.18, 'speakerL');
  mkSpeaker(4.05, -2.5, -0.35, 'speakerR');

  // ---------------------------------------------------------------- アーチ型のフロアランプ
  const lamp = new THREE.Group(); lamp.name = 'arcLamp'; room.add(lamp);
  lamp.position.set(-2.05, 0, -0.55);
  mesh(new THREE.CylinderGeometry(0.17, 0.19, 0.06, 32), new THREE.MeshStandardMaterial({ map: TX.marble(), roughness: 0.2 }), 0, 0.03, 0, lamp);
  const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(0, 0.05, 0), new THREE.Vector3(0.05, 1.3, -0.1), new THREE.Vector3(0.45, 2.15, -0.35), new THREE.Vector3(1.05, 2.05, -0.6), new THREE.Vector3(1.3, 1.8, -0.7)]);
  mesh(new THREE.TubeGeometry(curve, 64, 0.014, 10), chrome, 0, 0, 0, lamp, 'lampArc');
  const shade = new THREE.Group(); shade.position.set(1.3, 1.78, -0.7); lamp.add(shade);
  mesh(new THREE.SphereGeometry(0.2, 32, 16, 0, Math.PI * 2, 0, Math.PI * 0.5), new THREE.MeshStandardMaterial({ color: 0xd0a24a, roughness: 0.3, metalness: 1, side: THREE.DoubleSide }), 0, 0, 0, shade, 'lampShade');
  const bulbMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 2.2, 1.3), toneMapped: false });
  A.bulbMat = bulbMat;
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.05, 16, 10), bulbMat); bulb.position.y = -0.02; shade.add(bulb);
  A.lampShadeWorld = new THREE.Vector3(-2.05 + 1.3, 1.78, -0.55 - 0.7);

  // ---------------------------------------------------------------- 植物（窓辺の椰子と、モンステラ）
  const potMat = std(0xf1ece2, 0.5);
  const mkPlant = (x, z, kind, count, height, spread, scale) => {
    const pl = new THREE.Group(); pl.name = kind; room.add(pl); pl.position.set(x, 0, z);
    // 鉢は口の開いた筒＋内側の壁＋ふち。土は口より少し下に置く（同じ高さの面が重なるとちらつく）
    mesh(new THREE.CylinderGeometry(0.24, 0.19, 0.46, 32, 1, true), potMat, 0, 0.23, 0, pl, kind + 'Pot');
    mesh(new THREE.CircleGeometry(0.19, 32), potMat, 0, 0.001, 0, pl).rotation.x = Math.PI / 2;
    mesh(new THREE.CylinderGeometry(0.222, 0.18, 0.44, 32, 1, true), std(0xd9d2c6, 0.6, { side: THREE.BackSide }), 0, 0.24, 0, pl);
    const rim = mesh(new THREE.RingGeometry(0.222, 0.24, 40), potMat, 0, 0.46, 0, pl);
    rim.rotation.x = -Math.PI / 2;
    const soil = mesh(new THREE.CircleGeometry(0.215, 32), std(0x2a1d14, 1), 0, 0.4, 0, pl, kind + 'Soil');
    soil.rotation.x = -Math.PI / 2;
    const leafMat = new THREE.MeshStandardMaterial({ map: TX.leaf(kind), alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.7 });
    const stemMat = std(0x55703c, 0.8);
    for (let k = 0; k < count; k++) {
      const a = (k / count) * Math.PI * 2 + (k % 2) * 0.4;
      const tilt = 0.25 + (k % 3) * 0.18;
      const H = height * (0.75 + (k % 4) * 0.1);
      const stem = new THREE.Group(); stem.position.y = 0.4; stem.rotation.set(0, a, 0); pl.add(stem);
      const s = mesh(new THREE.CylinderGeometry(0.008, 0.012, H, 6), stemMat, 0, H / 2, 0, stem);
      s.rotation.z = tilt * 0.6; s.position.x = -Math.sin(tilt * 0.6) * H / 2;
      const lf = new THREE.Mesh(new THREE.PlaneGeometry(spread * 0.5 * scale, spread * scale), leafMat);
      lf.position.set(-Math.sin(tilt * 0.6) * H - 0.05, H + spread * 0.25 * scale, 0);
      lf.rotation.set(0.2, Math.PI / 2, -tilt - 0.6);
      lf.castShadow = true;
      stem.add(lf);
    }
    return pl;
  };
  A.palm = mkPlant(-3.75, -2.55, 'palm', 9, 1.25, 1.1, 1);
  A.monstera = mkPlant(3.95, 0.95, 'monstera', 7, 0.55, 0.62, 1);

  // ---------------------------------------------------------------- 右の壁：レコード棚、ネオン、絵
  const shelf = new THREE.Group(); shelf.name = 'recordShelf'; room.add(shelf);
  shelf.position.set(4.28, 0, -0.75);
  shelf.rotation.y = -Math.PI / 2;
  mesh(rbox(1.7, 0.74, 0.42, 0.01), std(0xf3e6cf, 0.55), 0, 0.42, 0, shelf, 'shelfBody');
  const spineMat = new THREE.MeshStandardMaterial({ map: TX.spines(5), roughness: 0.7 });
  for (const y of [0.25, 0.6]) {
    mesh(new THREE.BoxGeometry(1.6, 0.31, 0.02), std(0x2b2733, 0.9), 0, y, -0.15, shelf);
    const recs = mesh(new THREE.BoxGeometry(1.56, 0.3, 0.3), spineMat, 0, y, 0.0, shelf);
    recs.material = [std(0x222, 0.8), std(0x222, 0.8), std(0x222, 0.8), std(0x222, 0.8), spineMat, std(0x222, 0.8)];
  }
  const neonPink = new THREE.MeshBasicMaterial({ map: TX.neonText('City Pop', '#ff4fa3'), transparent: true, depthWrite: false, color: new THREE.Color(2.4, 2.4, 2.4), toneMapped: false, blending: THREE.AdditiveBlending });
  const neon = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 0.53), neonPink);
  neon.position.set(x1 - 0.03, 1.7, -0.75); neon.rotation.y = -Math.PI / 2; neon.name = 'neonCityPop';
  room.add(neon);
  const neonCyan = new THREE.MeshBasicMaterial({ map: TX.neonText('47F', '#3fe3ff', { w: 512, h: 256, size: 150, font: '"Zen Kaku Gothic New", sans-serif' }), transparent: true, depthWrite: false, color: new THREE.Color(2, 2, 2), toneMapped: false, blending: THREE.AdditiveBlending });
  const neon2 = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.3), neonCyan);
  neon2.position.set(x1 - 0.03, 2.25, -1.45); neon2.rotation.y = -Math.PI / 2; neon2.name = 'neon47F';
  room.add(neon2);
  A.neons = [neonPink, neonCyan];
  // 絵
  const art = new THREE.Group(); art.name = 'wallArt'; room.add(art);
  art.position.set(x1 - 0.03, 1.6, 1.35); art.rotation.y = -Math.PI / 2;
  mesh(new THREE.BoxGeometry(1.28, 1.28, 0.04), std(0xf5f2ea, 0.6), 0, 0, 0, art);
  mesh(new THREE.PlaneGeometry(1.12, 1.12), new THREE.MeshStandardMaterial({ map: TX.poolArt(0, 1024), roughness: 0.75 }), 0, 0, 0.021, art, 'artCanvas');

  // ---------------------------------------------------------------- 手前の壁：小さなバーカウンター
  const bar = new THREE.Group(); bar.name = 'barCounter'; room.add(bar);
  bar.position.set(-1.6, 0, 3.45);
  mesh(rbox(2.6, 0.95, 0.55, 0.02), std(0x2b2733, 0.5), 0, 0.475, 0, bar);
  mesh(rbox(2.7, 0.04, 0.62, 0.01), new THREE.MeshStandardMaterial({ map: TX.marble(), roughness: 0.2 }), 0, 0.97, 0, bar);
  const bottleCols = [0x2e7d4f, 0x8a3b1e, 0xd9c27a, 0x3b5fa8, 0x9c2c4f];
  for (let k = 0; k < 7; k++) {
    const b = mesh(new THREE.CylinderGeometry(0.035, 0.04, 0.26 + (k % 3) * 0.05, 16), new THREE.MeshStandardMaterial({ color: bottleCols[k % 5], roughness: 0.1, transparent: true, opacity: 0.8 }), -1 + k * 0.32, 1.12 + (k % 3) * 0.025, 0.05, bar);
    b.castShadow = false;
  }
  const barNeon = new THREE.MeshBasicMaterial({ map: TX.neonText('BAR', '#ffb547', { w: 512, h: 256, size: 160 }), transparent: true, depthWrite: false, color: new THREE.Color(2, 2, 2), toneMapped: false, blending: THREE.AdditiveBlending });
  const bn = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.4), barNeon);
  bn.position.set(-1.6, 1.95, z1 - 0.03); bn.rotation.y = Math.PI; room.add(bn);
  A.neons.push(barNeon);

  // ---------------------------------------------------------------- 照明
  const lights = new THREE.Group(); lights.name = 'lights'; room.add(lights);
  const lampSpot = new THREE.SpotLight(0xffb36b, 9, 7, 0.95, 0.65, 2);
  lampSpot.position.copy(A.lampShadeWorld);
  lampSpot.target.position.set(-0.1, 0.4, -1.3);
  lampSpot.castShadow = true;
  lampSpot.shadow.mapSize.set(1024, 1024);
  lampSpot.shadow.bias = -0.0004;
  lampSpot.shadow.radius = 5;
  lights.add(lampSpot, lampSpot.target);
  const lampFill = new THREE.PointLight(0xffa860, 1.2, 5, 2);
  lampFill.position.copy(A.lampShadeWorld).add(new THREE.Vector3(0, 0.15, 0));
  lights.add(lampFill);
  const mushLight = new THREE.PointLight(0xffa860, 1.6, 3.5, 2);
  mushLight.position.set(2.7 + 0.78, 0.85, -2.72 - 0.05);
  lights.add(mushLight);
  const neonLight = new THREE.PointLight(0xff4fa3, 2.2, 4.5, 2);
  neonLight.position.set(x1 - 0.5, 1.7, -0.75);
  lights.add(neonLight);
  const holoLight = new THREE.PointLight(0x3fe3ff, 0.6, 2, 2);
  holoLight.position.set(0.34, 0.75, -0.4);
  lights.add(holoLight);
  const cove1 = new THREE.PointLight(0xb46cff, 1.5, 6, 2); cove1.position.set(-2.4, 2.75, 0.2);
  const cove2 = new THREE.PointLight(0xff6fb0, 1.5, 6, 2); cove2.position.set(2.4, 2.75, 0.2);
  lights.add(cove1, cove2);
  const barLight = new THREE.PointLight(0xffb547, 1, 3, 2); barLight.position.set(-1.6, 1.9, 3.2);
  lights.add(barLight);
  Object.assign(A, { lampSpot, lampFill, mushLight, neonLight, holoLight, cove1, cove2, barLight });

  // ---------------------------------------------------------------- 音符（サビでスピーカーから舞い上がる）
  const noteMats = [TX.noteTexture('♪', '#ff7ab8'), TX.noteTexture('♫', '#48e4ff'), TX.noteTexture('♪', '#ffc36b')]
    .map((map) => new THREE.SpriteMaterial({ map, transparent: true, depthWrite: false, opacity: 0, color: new THREE.Color(1.6, 1.6, 1.6) }));
  const notes = Array.from({ length: 14 }, (_, i) => {
    const sp = new THREE.Sprite(noteMats[i % 3].clone());
    sp.visible = false; sp.scale.setScalar(0.14); room.add(sp);
    return { sp, life: 0, v: new THREE.Vector3() };
  });
  const speakerTops = [new THREE.Vector3(-2.25, 1.1, -2.5), new THREE.Vector3(4.0, 1.1, -2.4), new THREE.Vector3(2.3, 0.75, -2.6)];
  let lastKickStep = -1, noteIdx = 0;

  // ---------------------------------------------------------------- 動かす
  let spin = 0, armAngle = 0.0, flick = 1, flickT = 0, holoT = 0;
  const update = (dt, t, music, env, camera) => {
    const playing = !!music.playing;
    // レコード（33⅓ 回転）とトーンアーム
    spin += dt * (playing ? 3.49 : 0) ;
    platter.rotation.y = -spin;
    const prog = music.song && music.duration ? Math.min(1, music.time / music.duration) : 0;
    const armTarget = playing ? 0.42 + prog * 0.32 : 0.0;
    armAngle += (armTarget - armAngle) * (1 - Math.exp(-dt * 2.5));
    armPivot.rotation.y = -armAngle;
    armPivot.rotation.x = playing ? 0 : -0.04;
    // スピーカーのコーン
    const kick = music.kick || 0;
    const lvl = Math.min(1, (music.level || 0) * 3.2);
    for (const c of A.cones) {
      const amt = c.kind === 'woofer' ? kick * 0.022 + lvl * 0.006 : c.kind === 'mid' ? lvl * 0.004 : 0;
      c.holder.position.z = 0.205 + amt;
      c.holder.scale.setScalar(1 + (c.kind === 'woofer' ? kick * 0.04 : 0));
    }
    // VU メーター
    const vu = [music.levelL || 0, music.levelR || 0];
    A.vuNeedles.forEach((n, i) => {
      const target = -0.75 + Math.min(1.5, vu[i] * 5.5);
      n.rotation.z += (-(target) - n.rotation.z) * (1 - Math.exp(-dt * 14));
    });
    // ネオン（たまに瞬く）
    flickT -= dt;
    if (flickT < 0) { flick = Math.random() < 0.5 ? 0.25 : 1; flickT = flick < 1 ? 0.06 + Math.random() * 0.08 : 3 + Math.random() * 9; }
    const nb = env.neon;
    neonPink.color.setScalar(2.4 * nb * flick);
    neonCyan.color.setScalar(2.0 * nb);
    barNeon.color.setScalar(2.0 * nb);
    neonLight.intensity = 2.2 * nb * (0.6 + 0.4 * flick);
    // ホログラム
    holoT += dt;
    holo.position.y = 0.86 + Math.sin(t * 1.3) * 0.01;
    if (camera) {
      const dx = camera.position.x - holo.position.x, dz = camera.position.z - holo.position.z;
      const want = Math.atan2(dx, dz);
      let d = want - holo.rotation.y; d = Math.atan2(Math.sin(d), Math.cos(d));
      holo.rotation.y += d * (1 - Math.exp(-dt * 2));
    }
    holoMat.opacity = 0.85 + Math.sin(t * 40) * 0.05;
    // 盛り上がっているところで、拍ごとに音符を出す
    const beatNow = Math.floor(music.beat || 0);
    if (playing && (music.energy || 0) >= 0.9 && beatNow !== lastKickStep) {
      lastKickStep = beatNow;
      if (beatNow % 2 === 0) {
        const n = notes[noteIdx++ % notes.length];
        const from = speakerTops[Math.floor(Math.random() * speakerTops.length)];
        n.sp.position.copy(from).add(new THREE.Vector3((Math.random() - 0.5) * 0.2, 0, 0.1));
        n.v.set((Math.random() - 0.5) * 0.25, 0.38 + Math.random() * 0.2, 0.12 + Math.random() * 0.1);
        n.life = 1;
        n.sp.visible = true;
      }
    }
    for (const n of notes) {
      if (!n.sp.visible) continue;
      n.life -= dt / 3.2;
      if (n.life <= 0) { n.sp.visible = false; continue; }
      n.sp.position.addScaledVector(n.v, dt);
      n.sp.position.x += Math.sin(t * 2.5 + n.life * 6) * 0.002;
      n.sp.material.opacity = Math.min(1, (1 - n.life) * 6) * Math.min(1, n.life * 2.5) * 0.9;
      n.sp.material.rotation = Math.sin(t * 3 + n.life * 4) * 0.25;
      n.sp.scale.setScalar(0.1 + (1 - n.life) * 0.06);
    }
    ring.material.color.setRGB(0.4, 2.2, 2.6).multiplyScalar(0.7 + 0.3 * Math.sin(t * 3));
  };
  return { room, A, update, glassPanes: A.glassPanes };
}

/** ホログラムに曲名とスペクトルを描く（10〜15fps で十分）。 */
export function drawHologram(A, music, spectrum, t) {
  const c = A.holoCanvas, g = c.getContext('2d');
  g.clearRect(0, 0, c.width, c.height);
  const cyan = 'rgba(90,240,255,';
  g.fillStyle = 'rgba(30,140,190,0.16)';
  g.fillRect(6, 6, c.width - 12, c.height - 12);
  g.strokeStyle = cyan + '0.6)'; g.lineWidth = 2;
  g.strokeRect(6, 6, c.width - 12, c.height - 12);
  g.fillStyle = cyan + '0.9)';
  g.font = `700 26px ${TX.JP_FONT}`;
  g.textAlign = 'left';
  const song = music.song;
  g.fillText(song ? `♪ No.${String(song.no).padStart(2, '0')}  ${song.title}` : '♪ FM CLAWD 47.0', 22, 40);
  g.font = `500 18px ${TX.JP_FONT}`;
  g.fillStyle = cyan + '0.7)';
  if (song) g.fillText(`${song.titleJa}  /  ${song.bpm} BPM  ${song.keyName}`, 22, 68);
  if (music.section) {
    g.font = `700 20px ${TX.JP_FONT}`; g.fillStyle = 'rgba(255,140,200,0.95)';
    g.fillText(music.section.label, 22, 100);
    g.fillStyle = cyan + '0.95)';
    g.fillText(music.chord || '', 180, 100);
  }
  // スペクトル
  const n = 40, x0 = 22, w = c.width - 44, base = c.height - 26, hmax = 170;
  for (let i = 0; i < n; i++) {
    let v = 0;
    if (spectrum) {
      const a = Math.floor(Math.pow(i / n, 2.1) * 380) + 2, b = Math.floor(Math.pow((i + 1) / n, 2.1) * 380) + 3;
      for (let k = a; k < b; k++) v = Math.max(v, spectrum[k] || 0);
      v /= 255;
    }
    const bh = Math.max(2, v * v * hmax);
    const x = x0 + (i * w) / n;
    const grd = g.createLinearGradient(0, base - bh, 0, base);
    grd.addColorStop(0, 'rgba(255,120,200,0.95)'); grd.addColorStop(1, cyan + '0.8)');
    g.fillStyle = grd;
    g.fillRect(x, base - bh, w / n - 3, bh);
  }
  // 走査線
  g.fillStyle = 'rgba(0,0,0,0.25)';
  for (let y = (t * 30) % 4; y < c.height; y += 4) g.fillRect(0, y, c.width, 1);
  A.holoTex.needsUpdate = true;
}
