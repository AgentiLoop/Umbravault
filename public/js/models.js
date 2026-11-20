// Procedural low-poly 3D monster models for Umbravault: articulated humanoids (bandits, knights, mages,
// orcs, skeletons…) and beasts (rats, spiders, wraiths), each with idle / walk / attack / hit animations.
// Models face +Z; the renderer rotates them toward the monster's facing.
import * as THREE from 'three';

const geoCache = new Map();
function geo(kind, ...a) {
  const key = kind + a.join(',');
  if (!geoCache.has(key)) {
    const G = { box: THREE.BoxGeometry, sph: THREE.SphereGeometry, cyl: THREE.CylinderGeometry, cone: THREE.ConeGeometry, tor: THREE.TorusGeometry, ico: THREE.IcosahedronGeometry }[kind];
    geoCache.set(key, new G(...a));
  }
  return geoCache.get(key);
}

// per-model material factory (per instance so hit flashes don't bleed across monsters)
function mats() {
  const list = [];
  const m = (color, o = {}) => {
    const mat = new THREE.MeshStandardMaterial({ color, roughness: o.rough ?? 0.8, metalness: o.metal ?? 0.05, flatShading: true, emissive: o.glow ?? new THREE.Color(color).multiplyScalar(0.07), emissiveIntensity: o.gi ?? 1 });
    mat.userData.baseEmissive = mat.emissive.clone(); mat.userData.baseGi = mat.emissiveIntensity;
    list.push(mat); return mat;
  };
  m.list = list;
  return m;
}
const mesh = (g, mat, x = 0, y = 0, z = 0) => { const o = new THREE.Mesh(g, mat); o.position.set(x, y, z); return o; };
const pivot = (x, y, z, ...kids) => { const g = new THREE.Group(); g.position.set(x, y, z); g.add(...kids); return g; };

// ---------- weapons (blade along +Y from the grip; the hand tilts it forward) ----------
function weapon(kind, M, o = {}) {
  const g = new THREE.Group();
  const steel = M(o.steel ?? 0xb8bcc8, { metal: 0.85, rough: 0.3 });
  const wood = M(0x5a3a1e);
  if (kind === 'sword' || kind === 'greatsword') {
    const L = kind === 'greatsword' ? 0.5 : 0.34;
    g.add(mesh(geo('box', 0.028, L, 0.008), steel, 0, L / 2 + 0.04, 0));
    g.add(mesh(geo('box', 0.1, 0.018, 0.025), M(0x8a6a2a, { metal: 0.7, rough: 0.4 }), 0, 0.04, 0));
    g.add(mesh(geo('cyl', 0.012, 0.012, 0.07, 6), wood, 0, 0, 0));
  } else if (kind === 'dagger') {
    g.add(mesh(geo('box', 0.02, 0.15, 0.006), steel, 0, 0.1, 0));
    g.add(mesh(geo('box', 0.05, 0.012, 0.02), wood, 0, 0.025, 0));
  } else if (kind === 'axe' || kind === 'greataxe') {
    const L = kind === 'greataxe' ? 0.55 : 0.36;
    g.add(mesh(geo('cyl', 0.013, 0.013, L, 6), wood, 0, L / 2 - 0.05, 0));
    const head = mesh(geo('cyl', kind === 'greataxe' ? 0.12 : 0.08, kind === 'greataxe' ? 0.12 : 0.08, 0.012, 12, 1, false, 0, Math.PI), steel, 0, L - 0.1, 0);
    head.rotation.z = Math.PI / 2; head.rotation.y = Math.PI / 2; g.add(head);
  } else if (kind === 'club') {
    g.add(mesh(geo('cyl', 0.05, 0.022, 0.42, 7), M(0x6b4a2a), 0, 0.18, 0));
    for (let i = 0; i < 4; i++) { const s = mesh(geo('cone', 0.012, 0.04, 4), steel, Math.cos(i * 1.6) * 0.045, 0.3, Math.sin(i * 1.6) * 0.045); s.rotation.z = -Math.cos(i * 1.6) * 1.5; s.rotation.x = Math.sin(i * 1.6) * 1.5; g.add(s); }
  } else if (kind === 'staff') {
    g.add(mesh(geo('cyl', 0.011, 0.014, 0.75, 6), wood, 0, 0.2, 0));
    const orb = mesh(geo('ico', 0.045, 1), M(o.orb ?? 0xff6a1a, { glow: new THREE.Color(o.orb ?? 0xff6a1a), gi: 1.6, rough: 0.2 }), 0, 0.6, 0);
    g.add(orb); g.userData.orb = orb;
  } else if (kind === 'bow') {
    const arc = mesh(geo('tor', 0.22, 0.01, 5, 16, Math.PI * 0.9), wood, 0, 0, 0);
    arc.rotation.z = Math.PI / 2 + Math.PI * 0.05; arc.rotation.y = Math.PI / 2; g.add(arc);
    const string = mesh(geo('cyl', 0.002, 0.002, 0.43, 3), M(0xdddddd), 0, 0, -0.02); g.add(string);
  } else if (kind === 'shield') {
    const sh = mesh(geo('cyl', 0.13, 0.13, 0.025, 10), M(o.color ?? 0x7a1a1a, { metal: 0.3 }), 0, 0, 0);
    sh.rotation.x = Math.PI / 2; g.add(sh);
    const boss = mesh(geo('sph', 0.035, 8, 6), steel, 0, 0, 0.015); g.add(boss);
    const rim = mesh(geo('tor', 0.13, 0.012, 4, 16), steel, 0, 0, 0); g.add(rim);
  }
  return g;
}

// ---------- humanoid ----------
// opts: skin, cloth, pants, armor (metal color), helm, hood, horns, skull, tusks, ears, crown, cape, robe,
//       eyes (glow color), weapon, offhand, scale, bulk, hunch, armLen, wings
function humanoid(o) {
  const M = mats();
  const root = new THREE.Group();
  const body = new THREE.Group(); root.add(body);
  const bulk = o.bulk ?? 1;
  const skinM = M(o.skin ?? 0xd2a07a, { rough: 0.9 });
  const boneM = o.skull ? M(0xd8cfb8, { rough: 0.7 }) : null;
  const clothM = M(o.cloth ?? 0x5a4630);
  const pantsM = M(o.pants ?? 0x3a2e22);
  const armorM = o.armor ? M(o.armor, { metal: 0.85, rough: 0.35 }) : null;
  const eyeM = M(0x000000, { glow: new THREE.Color(o.eyes ?? 0x110000), gi: o.eyes ? 2.2 : 0.2 });
  const limbM = o.skull ? boneM : skinM;

  const hipY = 0.3, legL = 0.3;
  // legs (or robe)
  const legs = [];
  if (o.robe) {
    const robe = mesh(geo('cone', 0.2 * bulk, 0.36, 8, 1, true), clothM, 0, 0.18, 0);
    robe.material.side = THREE.DoubleSide; body.add(robe);
    for (const s of [-1, 1]) { const leg = pivot(s * 0.06, hipY, 0); leg.visible = false; legs.push(leg); body.add(leg); }
  } else {
    for (const s of [-1, 1]) {
      const thick = o.skull ? 0.022 : 0.045 * bulk;
      const leg = pivot(s * 0.075 * bulk, hipY, 0, mesh(geo('cyl', thick, thick * 0.85, legL, 6), armorM ?? (o.skull ? boneM : pantsM), 0, -legL / 2, 0));
      leg.add(mesh(geo('box', 0.07 * bulk, 0.04, 0.12), armorM ?? M(0x2a1e14), 0, -legL + 0.015, 0.025));
      legs.push(leg); body.add(leg);
    }
  }
  // torso
  const torso = new THREE.Group(); torso.position.y = hipY; body.add(torso);
  if (o.skull) {
    torso.add(mesh(geo('cyl', 0.018, 0.018, 0.28, 5), boneM, 0, 0.14, -0.02));
    for (let i = 0; i < 4; i++) torso.add(mesh(geo('tor', 0.075 - i * 0.005, 0.01, 4, 10, Math.PI * 1.6), boneM, 0, 0.12 + i * 0.045, 0)).children.at(-1).rotation.set(Math.PI / 2, 0, Math.PI * 0.7);
    torso.add(mesh(geo('box', 0.2, 0.025, 0.06), boneM, 0, 0.27, 0));
    if (o.cloth) torso.add(mesh(geo('box', 0.2, 0.12, 0.13), clothM, 0, 0.04, 0));
  } else {
    torso.add(mesh(geo('box', 0.25 * bulk, 0.3, 0.15 * bulk), armorM ?? clothM, 0, 0.15, 0));
    if (o.belly) torso.add(mesh(geo('sph', 0.15 * bulk, 8, 6), skinM, 0, 0.1, 0.05));
    torso.add(mesh(geo('box', 0.27 * bulk, 0.04, 0.16 * bulk), M(0x2a1a0e), 0, 0.02, 0)); // belt
    if (armorM) for (const s of [-1, 1]) torso.add(mesh(geo('sph', 0.065 * bulk, 7, 5, 0, Math.PI * 2, 0, Math.PI / 2), armorM, s * 0.15 * bulk, 0.29, 0));
  }
  if (o.cape) {
    const cape = mesh(geo('box', 0.24 * bulk, 0.42, 0.012), M(o.cape), 0, -0.07, -0.09 * bulk);
    cape.geometry = geo('box', 0.24 * bulk, 0.42, 0.012);
    const capeP = pivot(0, 0.3, 0, cape); capeP.rotation.x = 0.12; torso.add(capeP); root.userData.cape = capeP;
  }
  if (o.wings) {
    for (const s of [-1, 1]) {
      const shape = new THREE.Shape(); shape.moveTo(0, 0); shape.lineTo(s * 0.55, 0.3); shape.lineTo(s * 0.45, 0.05); shape.lineTo(s * 0.5, -0.12); shape.lineTo(s * 0.3, -0.05); shape.lineTo(s * 0.25, -0.2); shape.lineTo(0, -0.05);
      const wm = new THREE.Mesh(new THREE.ShapeGeometry(shape), M(o.wings, { rough: 0.6 })); wm.material.side = THREE.DoubleSide;
      const wp = pivot(s * 0.05, 0.25, -0.09, wm); wp.rotation.y = s * 0.5; torso.add(wp);
      (root.userData.wings ||= []).push(wp);
    }
  }
  // head
  const head = new THREE.Group(); head.position.set(0, 0.36 + (o.skull ? 0.02 : 0), o.hunch ? 0.07 : 0); torso.add(head);
  const hr = 0.085;
  head.add(mesh(geo('sph', hr, 9, 7), o.skull ? boneM : skinM, 0, 0.06, 0));
  if (o.skull) { head.add(mesh(geo('box', 0.09, 0.04, 0.07), boneM, 0, 0.0, 0.02)); }
  for (const s of [-1, 1]) {
    head.add(mesh(geo('sph', o.skull ? 0.022 : 0.014, 6, 4), o.skull ? M(0x050505, { glow: new THREE.Color(o.eyes ?? 0x000000), gi: 2.5 }) : eyeM, s * 0.032, 0.07, hr * 0.85));
    if (o.ears) { const e = mesh(geo('cone', 0.025, 0.12, 4), skinM, s * 0.095, 0.08, 0); e.rotation.z = -s * 1.2; head.add(e); }
    if (o.tusks) { const t = mesh(geo('cone', 0.012, 0.05, 4), M(0xf0e8d0), s * 0.03, 0.02, hr * 0.85); t.rotation.x = -0.3; head.add(t); }
    if (o.horns) { const h = mesh(geo('cone', 0.022, 0.14, 5), M(o.hornColor ?? 0x2a2018, { rough: 0.5 }), s * 0.065, 0.15, 0); h.rotation.z = -s * 0.5; h.rotation.x = -0.3; head.add(h); }
  }
  if (o.helm) {
    head.add(mesh(geo('sph', hr * 1.12, 9, 6, 0, Math.PI * 2, 0, Math.PI * 0.55), armorM ?? M(o.helm, { metal: 0.85, rough: 0.35 }), 0, 0.06, 0));
    head.add(mesh(geo('box', 0.13, 0.02, 0.02), M(0x101010), 0, 0.065, hr * 0.95)); // visor slit
    if (o.plume) { const p = mesh(geo('box', 0.02, 0.07, 0.16), M(o.plume), 0, 0.17, -0.02); head.add(p); }
  }
  if (o.hood) {
    const h = mesh(geo('sph', hr * 1.25, 9, 7, 0, Math.PI * 2, 0, Math.PI * 0.62), M(o.hood), 0, 0.07, -0.01); h.rotation.x = -0.25; head.add(h);
    const peak = mesh(geo('cone', 0.05, 0.1, 5), M(o.hood), 0, 0.17, -0.06); peak.rotation.x = -0.6; head.add(peak);
  }
  if (o.mask) head.add(mesh(geo('box', 0.15, 0.045, 0.04), M(o.mask), 0, 0.03, hr * 0.7));
  if (o.crown) {
    const gold = M(0xffc23a, { metal: 0.95, rough: 0.25, glow: new THREE.Color(0x553300) });
    head.add(mesh(geo('cyl', 0.085, 0.09, 0.04, 8, 1, true), gold, 0, 0.15, 0));
    for (let i = 0; i < 6; i++) head.add(mesh(geo('cone', 0.015, 0.06, 4), gold, Math.cos(i * 1.047) * 0.085, 0.19, Math.sin(i * 1.047) * 0.085));
  }
  // arms
  const arms = [];
  const armL = (o.armLen ?? 1) * 0.27;
  for (const s of [-1, 1]) {
    const thick = o.skull ? 0.02 : 0.038 * bulk;
    const arm = pivot(s * (0.15 * bulk + thick), 0.27, 0, mesh(geo('cyl', thick, thick * 0.8, armL, 6), armorM ?? (o.sleeves ? clothM : limbM), 0, -armL / 2, 0));
    const hand = pivot(0, -armL, 0, mesh(geo('sph', thick * 1.15, 6, 4), o.gloves ? M(o.gloves) : limbM));
    if (o.claws) for (let i = -1; i <= 1; i++) { const c = mesh(geo('cone', 0.008, 0.05, 3), M(0x1a1a10), i * 0.015, -0.03, 0.02); c.rotation.x = Math.PI; hand.add(c); }
    arm.add(hand); arm.userData.hand = hand;
    torso.add(arm); arms.push(arm);
  }
  const [armLeft, armRight] = arms;
  if (o.weapon) {
    const w = weapon(o.weapon, M, o);
    if (o.weapon === 'bow') { armLeft.userData.hand.add(w); w.rotation.y = 0; }
    else { w.rotation.x = o.weapon === 'staff' ? 0.15 : 1.15; armRight.userData.hand.add(w); }
    root.userData.weapon = w;
  }
  if (o.weapon2) { const w2 = weapon(o.weapon2, M, o); w2.rotation.x = 1.15; armLeft.userData.hand.add(w2); }
  if (o.shield) { const sh = weapon('shield', M, { color: o.shield }); sh.position.z = 0.06; sh.rotation.y = -0.3; armLeft.userData.hand.add(sh); }

  if (o.hunch) torso.rotation.x = 0.35;
  root.scale.setScalar(o.scale ?? 1);
  root.userData.mats = M.list;
  root.userData.anim = (t, s) => {
    const walk = s.move;
    const sw = Math.sin(t * 11) * 0.7 * walk;
    legs[0].rotation.x = sw; legs[1].rotation.x = -sw;
    body.position.y = Math.abs(Math.sin(t * 11)) * 0.02 * walk + Math.sin(t * 2.2) * 0.004;
    const atk = Math.sin(Math.PI * s.atk);
    const ranged = o.weapon === 'staff' || o.weapon === 'bow';
    armLeft.rotation.x = -sw * 0.8 + (o.weapon === 'bow' ? -1.4 * Math.max(atk, 0.15 + walk * 0) : 0) + (o.zombie ? -1.2 : 0);
    armRight.rotation.x = sw * 0.8 - (ranged ? 1.3 : 2.3) * atk + (o.zombie ? -1.2 : 0) - (o.weapon === 'staff' ? 0.25 : 0);
    armRight.rotation.z = -0.08 - (ranged ? 0 : 0.4 * atk);
    armLeft.rotation.z = 0.08;
    torso.rotation.y = (ranged ? 0 : 0.35) * atk;
    torso.rotation.x = (o.hunch ? 0.35 : 0) + 0.15 * atk + Math.sin(t * 2.2) * 0.015;
    head.rotation.z = Math.sin(t * 1.3) * 0.05;
    if (root.userData.cape) root.userData.cape.rotation.x = 0.12 + walk * 0.35 + Math.sin(t * 3) * 0.04;
    if (root.userData.wings) root.userData.wings.forEach((w, i) => { w.rotation.y = (i ? 1 : -1) * (0.5 + Math.sin(t * 2.5) * 0.25); });
    const orb = root.userData.weapon?.userData.orb;
    if (orb) orb.scale.setScalar(1 + 0.2 * Math.sin(t * 6) + atk * 0.8);
  };
  return root;
}

// ---------- beasts ----------
function rat(o = {}) {
  const M = mats(); const root = new THREE.Group();
  const fur = M(o.fur ?? 0x4a3c34, { rough: 1 });
  const body = new THREE.Group(); root.add(body);
  const torso = mesh(geo('sph', 0.1, 9, 7), fur, 0, 0.1, 0); torso.scale.set(1, 0.85, 1.7); body.add(torso);
  const head = new THREE.Group(); head.position.set(0, 0.12, 0.17); body.add(head);
  const snout = mesh(geo('cone', 0.06, 0.13, 7), fur, 0, 0, 0.05); snout.rotation.x = Math.PI / 2; head.add(snout);
  head.add(mesh(geo('sph', 0.012, 5, 4), M(0xffaaaa), 0, 0, 0.115));
  for (const s of [-1, 1]) {
    head.add(mesh(geo('sph', 0.013, 5, 4), M(0, { glow: new THREE.Color(0xff2a1a), gi: 2.5 }), s * 0.032, 0.025, 0.04));
    const ear = mesh(geo('cyl', 0.03, 0.03, 0.008, 8), M(0xc08a8a), s * 0.04, 0.055, -0.02); ear.rotation.x = Math.PI / 2; head.add(ear);
  }
  const tail = []; let parent = body; let px = 0, py = 0.09, pz = -0.16;
  for (let i = 0; i < 5; i++) { const seg = pivot(px, py, pz, mesh(geo('cyl', 0.012 - i * 0.002, 0.014 - i * 0.002, 0.07, 4), M(0xc89a9a), 0, 0, -0.035)); seg.children[0].rotation.x = Math.PI / 2; parent.add(seg); tail.push(seg); parent = seg; px = 0; py = 0; pz = -0.07; }
  const legs = [];
  for (const [x, z] of [[-0.06, 0.09], [0.06, 0.09], [-0.06, -0.08], [0.06, -0.08]]) { const l = pivot(x, 0.06, z, mesh(geo('cyl', 0.012, 0.01, 0.06, 4), fur, 0, -0.03, 0)); body.add(l); legs.push(l); }
  root.scale.setScalar(o.scale ?? 1.3);
  root.userData.mats = M.list;
  root.userData.anim = (t, s) => {
    legs.forEach((l, i) => { l.rotation.x = Math.sin(t * 22 + (i % 2 ? Math.PI : 0) + (i > 1 ? Math.PI / 2 : 0)) * 0.8 * s.move; });
    tail.forEach((sg, i) => { sg.rotation.y = Math.sin(t * 5 - i * 0.7) * 0.35; sg.rotation.x = 0.15; });
    body.position.y = Math.abs(Math.sin(t * 22)) * 0.012 * s.move;
    head.rotation.x = -0.5 * Math.sin(Math.PI * s.atk) + Math.sin(t * 9) * 0.05;
    head.position.z = 0.17 + 0.06 * Math.sin(Math.PI * s.atk);
  };
  return root;
}

function spider(o = {}) {
  const M = mats(); const root = new THREE.Group();
  const shell = M(o.shell ?? 0x1e1a22, { rough: 0.45, metal: 0.2 });
  const body = new THREE.Group(); root.add(body);
  const abd = mesh(geo('sph', 0.13, 10, 8), shell, 0, 0.16, -0.13); abd.scale.set(1, 0.85, 1.15); body.add(abd);
  if (o.mark) { const mk = mesh(geo('sph', 0.04, 6, 4), M(o.mark, { glow: new THREE.Color(o.mark), gi: 1.2 }), 0, 0.27, -0.13); mk.scale.set(1, 0.3, 1.6); body.add(mk); }
  body.add(mesh(geo('sph', 0.075, 9, 7), shell, 0, 0.13, 0.04));
  for (let i = 0; i < 6; i++) body.add(mesh(geo('sph', 0.012, 4, 3), M(0, { glow: new THREE.Color(o.eyes ?? 0xff2244), gi: 2.5 }), (i % 3 - 1) * 0.025, 0.16 + Math.floor(i / 3) * 0.02, 0.105));
  for (const s of [-1, 1]) { const f = mesh(geo('cone', 0.012, 0.06, 4), M(0x0a0a0a), s * 0.025, 0.1, 0.11); f.rotation.x = 2.6; body.add(f); }
  const legs = [];
  for (let i = 0; i < 8; i++) {
    const s = i < 4 ? -1 : 1, k = i % 4;
    const hip = pivot(s * 0.05, 0.14, 0.07 - k * 0.04);
    hip.rotation.y = s * (-0.9 + k * 0.55) + (s < 0 ? Math.PI : 0);
    const upper = pivot(0, 0, 0, mesh(geo('cyl', 0.012, 0.01, 0.17, 4), shell, 0, 0, 0.085)); upper.children[0].rotation.x = Math.PI / 2; upper.rotation.x = -0.75;
    const lower = pivot(0, 0, 0.17, mesh(geo('cyl', 0.01, 0.005, 0.22, 4), shell, 0, 0, 0.11)); lower.children[0].rotation.x = Math.PI / 2; lower.rotation.x = 1.55;
    upper.add(lower); hip.add(upper); body.add(hip); legs.push(upper);
  }
  let stinger = null;
  if (o.tail) {
    let parent = body, z = -0.26, y = 0.2; const segs = [];
    for (let i = 0; i < 5; i++) { const sg = pivot(0, y, z, mesh(geo('sph', 0.045 - i * 0.004, 7, 5), shell, 0, 0, -0.045)); sg.rotation.x = -0.55; parent.add(sg); segs.push(sg); parent = sg; y = 0; z = -0.08; }
    stinger = mesh(geo('cone', 0.025, 0.09, 5), M(0xff3a1a, { glow: new THREE.Color(0xaa1100), gi: 1.5 }), 0, 0, -0.06); stinger.rotation.x = -Math.PI / 2; parent.add(stinger);
    root.userData.tail = segs;
  }
  root.scale.setScalar(o.scale ?? 1.2);
  root.userData.mats = M.list;
  root.userData.anim = (t, s) => {
    legs.forEach((l, i) => { l.rotation.x = -0.75 + Math.sin(t * 16 + i * 1.7) * 0.3 * (s.move + 0.08); });
    body.position.y = Math.sin(t * 16) * 0.008 * s.move;
    body.rotation.x = -0.35 * Math.sin(Math.PI * s.atk);
    if (root.userData.tail) root.userData.tail.forEach((sg, i) => { sg.rotation.x = -0.55 - Math.sin(Math.PI * s.atk) * 0.35 + Math.sin(t * 2 + i) * 0.05; });
  };
  return root;
}

function wraith(o = {}) {
  const M = mats(); const root = new THREE.Group();
  const shroud = M(o.cloth ?? 0x9ab0c8, { glow: new THREE.Color(o.glow ?? 0x2a4060), gi: 1 });
  shroud.transparent = true; shroud.opacity = 0.72; shroud.side = THREE.DoubleSide;
  const body = new THREE.Group(); root.add(body);
  const robe = mesh(geo('cone', 0.17, 0.55, 9, 3, true), shroud, 0, 0.38, 0); robe.rotation.x = Math.PI; body.add(robe);
  const hood = mesh(geo('sph', 0.1, 9, 7, 0, Math.PI * 2, 0, Math.PI * 0.7), shroud, 0, 0.68, 0); body.add(hood);
  body.add(mesh(geo('sph', 0.07, 8, 6), M(0x020206), 0, 0.66, 0.035));
  for (const s of [-1, 1]) body.add(mesh(geo('sph', 0.014, 5, 4), M(0, { glow: new THREE.Color(o.eyes ?? 0x8af0ff), gi: 3 }), s * 0.03, 0.67, 0.09));
  const arms = [];
  for (const s of [-1, 1]) {
    const a = pivot(s * 0.12, 0.58, 0, mesh(geo('cone', 0.05, 0.3, 6, 1, true), shroud, 0, -0.15, 0));
    const claw = mesh(geo('cone', 0.02, 0.08, 4), M(0xc8d8e8), 0, -0.32, 0); claw.rotation.x = Math.PI; a.add(claw);
    body.add(a); arms.push(a);
  }
  root.scale.setScalar(o.scale ?? 1);
  root.userData.mats = M.list;
  root.userData.anim = (t, s) => {
    body.position.y = 0.08 + Math.sin(t * 2.4) * 0.04;
    robe.rotation.y = t * 0.6; robe.scale.set(1 + Math.sin(t * 4) * 0.05, 1, 1 + Math.cos(t * 4) * 0.05);
    const atk = Math.sin(Math.PI * s.atk);
    arms.forEach((a, i) => { a.rotation.x = -0.4 - atk * 1.6 + Math.sin(t * 3 + i) * 0.15; a.rotation.z = (i ? 1 : -1) * (0.3 + atk * 0.3); });
  };
  return root;
}

// ---------- catalogue ----------
const BUILDERS = {
  rat: () => rat(),
  spider: () => spider({ mark: 0xaa1a2a }),
  goblin: () => humanoid({ skin: 0x6a9a3a, cloth: 0x5a4024, pants: 0x3a2a18, ears: true, eyes: 0xffd21a, weapon: 'dagger', scale: 0.72, hunch: true }),
  bandit: () => humanoid({ skin: 0xc8946a, cloth: 0x4a3626, pants: 0x2a221a, hood: 0x2e2a26, mask: 0x1a1a1a, weapon: 'dagger', weapon2: 'dagger', gloves: 0x2a1e14, sleeves: true }),
  archer: () => humanoid({ skin: 0xd2a07a, cloth: 0x2e4a26, pants: 0x3a2e22, hood: 0x24401e, weapon: 'bow', cape: 0x1e3018, sleeves: true }),
  orc: () => humanoid({ skin: 0x5a7a48, cloth: 0x4a3020, pants: 0x2e2216, tusks: true, eyes: 0xff4a1a, weapon: 'greataxe', bulk: 1.25, scale: 1.08, armor: null }),
  skeleton: () => humanoid({ skull: true, eyes: 0x4ac8ff, weapon: 'sword', shield: 0x3a2a1a, cloth: 0x3a2a3a }),
  cultist: () => humanoid({ skin: 0xc8946a, cloth: 0x8a1a12, hood: 0x6a120c, robe: true, eyes: 0xff7a1a, weapon: 'staff', orb: 0xff6a1a, sleeves: true }),
  mage: () => humanoid({ skin: 0xd8b090, cloth: 0x22306a, hood: 0x1a2450, robe: true, eyes: 0x6ab8ff, weapon: 'staff', orb: 0x4aa8ff, sleeves: true, cape: 0x3a1a5a }),
  ghoul: () => humanoid({ skin: 0x7a8a6a, cloth: 0x3a3a2a, pants: 0x2a2a20, eyes: 0xd8ff4a, claws: true, armLen: 1.4, hunch: true, zombie: false }),
  knight: () => humanoid({ armor: 0x4a4e58, helm: 0x4a4e58, plume: 0x9a1a1a, weapon: 'sword', shield: 0x6a1414, cape: 0x5a0e0e, eyes: 0xff3a2a, scale: 1.05 }),
  wraith: () => wraith(),
  blackguard: () => humanoid({ armor: 0x1e1a22, helm: 0x1e1a22, horns: true, hornColor: 0x8a0a0a, weapon: 'greatsword', steel: 0x6a6a7a, cape: 0x2a0606, eyes: 0xff2a1a, scale: 1.18, bulk: 1.1 }),
  ogre: () => humanoid({ skin: 0x8a8a6a, cloth: 0x5a4024, pants: 0x4a3420, belly: true, tusks: true, eyes: 0xffaa22, weapon: 'club', bulk: 1.5, scale: 1.4, hunch: true }),
  boss: () => humanoid({ skull: true, crown: true, eyes: 0x6af0ff, weapon: 'greatsword', steel: 0x8ab8d8, cape: 0x3a0a4a, cloth: 0x2a0a3a, scale: 1.65 }),
  matriarch: () => spider({ scale: 2.6, shell: 0x2a1a10, mark: 0xff5a1a, eyes: 0xffaa22, tail: true }),
  warlord: () => humanoid({ skin: 0xc08a64, armor: 0x8a7a5a, helm: 0x8a7a5a, crown: true, plume: 0xd8b020, weapon: 'greataxe', steel: 0xc8ccd8, shield: 0x2a3a6a, cape: 0x1a2a6a, eyes: 0x111111, bulk: 1.2, scale: 1.6 }),
  tyrant: () => humanoid({ skin: 0x8a1e12, cloth: 0x2a0a06, pants: 0x1a0804, horns: true, hornColor: 0x1a1210, eyes: 0xffd21a, weapon: 'greataxe', steel: 0x3a3030, wings: 0x5a120a, bulk: 1.3, scale: 1.7, tusks: true }),
};

export function buildMonsterModel(type) {
  const m = (BUILDERS[type] || BUILDERS.goblin)();
  m.userData.height = m.userData.height ?? 0.8 * m.scale.y;
  return m;
}

// hit flash / stun tint / fade helpers driven by the renderer every frame
export function tintModel(model, flash, stun, fade = 1) {
  for (const mat of model.userData.mats) {
    if (flash > 0.01) { mat.emissive.setRGB(flash, flash * 0.1, flash * 0.1); mat.emissiveIntensity = 1.5; }
    else if (stun) { mat.emissive.setRGB(0.15, 0.35, 0.6); mat.emissiveIntensity = 1; }
    else { mat.emissive.copy(mat.userData.baseEmissive); mat.emissiveIntensity = mat.userData.baseGi; }
    if (fade < 1) { mat.transparent = true; mat.opacity = Math.min(mat.opacity, fade); }
  }
}
