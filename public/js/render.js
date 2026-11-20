// Three.js renderer for Umbravault: grid dungeon, lantern lighting, billboard sprites, spell effects.
import * as THREE from 'three';
import { CLASSES, MONSTERS, RARITY, SLOTS, AFFIXES, themeForDepth } from './data.js';

const WALL_H = 1.15;
const EYE = 0.52;

// ---------- procedural textures ----------
function canvasTex(size, draw, repeat = 1) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  draw(c.getContext('2d'), size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  t.anisotropy = 8;
  return t;
}
function noise(ctx, s, alpha, light = false) {
  const img = ctx.getImageData(0, 0, s, s);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (Math.random() - 0.5) * alpha * (light ? 1 : 1);
    img.data[i] += n; img.data[i + 1] += n; img.data[i + 2] += n;
  }
  ctx.putImageData(img, 0, 0);
}
const stoneTex = () => canvasTex(256, (ctx, s) => {
  ctx.fillStyle = '#2a2622'; ctx.fillRect(0, 0, s, s);
  const rows = 6, bh = s / rows;
  for (let r = 0; r < rows; r++) {
    const off = r % 2 ? s / 6 : 0;
    for (let x = -1; x < 4; x++) {
      const bw = s / 3, bx = x * bw + off;
      const v = 70 + Math.random() * 40;
      ctx.fillStyle = `rgb(${v + 8},${v},${v - 10})`;
      ctx.fillRect(bx + 3, r * bh + 3, bw - 6, bh - 6);
      ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(bx + 3, r * bh + bh - 9, bw - 6, 6);
      ctx.fillStyle = 'rgba(255,240,210,0.08)'; ctx.fillRect(bx + 3, r * bh + 3, bw - 6, 4);
      if (Math.random() < 0.3) { ctx.fillStyle = 'rgba(60,90,40,0.35)'; ctx.beginPath(); ctx.arc(bx + Math.random() * bw, r * bh + bh - 6, 6 + Math.random() * 10, 0, 7); ctx.fill(); }
    }
  }
  noise(ctx, s, 28);
});
const floorTex = () => canvasTex(256, (ctx, s) => {
  ctx.fillStyle = '#1b1916'; ctx.fillRect(0, 0, s, s);
  const n = 4, t = s / n;
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const v = 48 + Math.random() * 26;
    ctx.fillStyle = `rgb(${v},${v - 3},${v - 8})`;
    ctx.fillRect(x * t + 2, y * t + 2, t - 4, t - 4);
    ctx.strokeStyle = 'rgba(0,0,0,0.4)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x * t + Math.random() * t, y * t + 2); ctx.lineTo(x * t + Math.random() * t, y * t + t - 2); ctx.stroke();
  }
  noise(ctx, s, 22);
});
const ceilTex = () => canvasTex(128, (ctx, s) => {
  ctx.fillStyle = '#121010'; ctx.fillRect(0, 0, s, s);
  for (let i = 0; i < 40; i++) { ctx.fillStyle = `rgba(80,70,60,${Math.random() * 0.25})`; ctx.fillRect(Math.random() * s, Math.random() * s, 10 + Math.random() * 30, 4 + Math.random() * 6); }
  noise(ctx, s, 16);
});

const iconCache = new Map();
function iconTexture(icon, glow = '#000') {
  const key = icon + glow;
  if (iconCache.has(key)) return iconCache.get(key);
  const t = canvasTex(256, (ctx, s) => {
    ctx.clearRect(0, 0, s, s);
    const g = ctx.createRadialGradient(s / 2, s / 2, 10, s / 2, s / 2, s / 2);
    g.addColorStop(0, glow + '88'); g.addColorStop(1, glow + '00');
    ctx.fillStyle = g; ctx.fillRect(0, 0, s, s);
    ctx.font = `${s * 0.66}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.shadowColor = 'rgba(0,0,0,0.8)'; ctx.shadowBlur = 16;
    ctx.fillText(icon, s / 2, s / 2 + 10);
  });
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  iconCache.set(key, t);
  return t;
}
function textSprite(text, color = '#fff', size = 40, scale = 0.6) {
  const c = document.createElement('canvas');
  const ctx = c.getContext('2d');
  ctx.font = `bold ${size}px Cinzel, Georgia, serif`;
  const w = Math.ceil(ctx.measureText(text).width) + 20;
  c.width = w; c.height = size + 20;
  ctx.font = `bold ${size}px Cinzel, Georgia, serif`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.lineWidth = 6; ctx.strokeStyle = 'rgba(0,0,0,0.85)'; ctx.strokeText(text, w / 2, c.height / 2);
  ctx.fillStyle = color; ctx.fillText(text, w / 2, c.height / 2);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthWrite: false, transparent: true }));
  sp.scale.set(scale * w / c.height * 0.5, scale * 0.5, 1);
  return sp;
}

function hpBar() {
  const c = document.createElement('canvas'); c.width = 128; c.height = 16;
  const t = new THREE.CanvasTexture(c);
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthWrite: false, transparent: true }));
  sp.scale.set(0.55, 0.07, 1);
  sp.userData.set = (frac, color = '#e33') => {
    const ctx = c.getContext('2d');
    ctx.clearRect(0, 0, 128, 16);
    ctx.fillStyle = 'rgba(0,0,0,0.75)'; ctx.fillRect(0, 0, 128, 16);
    ctx.fillStyle = color; ctx.fillRect(2, 2, Math.max(0, 124 * frac), 12);
    ctx.fillStyle = 'rgba(255,255,255,0.25)'; ctx.fillRect(2, 2, Math.max(0, 124 * frac), 4);
    t.needsUpdate = true;
  };
  return sp;
}

export class Renderer {
  constructor(canvas) {
    this.r = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.r.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.r.toneMapping = THREE.ACESFilmicToneMapping;
    this.r.toneMappingExposure = 1.25;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x050307);
    this.scene.fog = new THREE.FogExp2(0x050307, 0.11);
    this.camera = new THREE.PerspectiveCamera(72, 1, 0.05, 60);
    this.scene.add(this.camera);
    this.lantern = new THREE.PointLight(0xffb366, 7, 10, 1.1);
    this.lantern.position.set(0.15, 0.05, 0);
    this.camera.add(this.lantern);
    this.ambient = new THREE.AmbientLight(0x3a3050, 1.6); this.scene.add(this.ambient);
    this.hemi = new THREE.HemisphereLight(0x4a4080, 0x201010, 1.0); this.scene.add(this.hemi);
    this.tex = { stone: stoneTex(), floor: floorTex(), ceil: ceilTex() };
    this.level = new THREE.Group(); this.scene.add(this.level);
    this.entities = new THREE.Group(); this.scene.add(this.entities);
    this.fxGroup = new THREE.Group(); this.scene.add(this.fxGroup);
    this.monsterObjs = new Map(); this.playerObjs = new Map(); this.itemObjs = new Map();
    this.fxList = [];
    this.torches = [];
    this.cam = { x: 0, y: 0, yaw: 0, tx: 0, ty: 0, tyaw: 0, bob: 0, shake: 0 };
    this.clock = new THREE.Clock();
    this.makeDust();
    addEventListener('resize', () => this.resize());
    this.resize();
  }

  resize() {
    const w = innerWidth, h = innerHeight;
    this.r.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  makeDust() {
    const n = 400, pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { pos[i * 3] = (Math.random() - 0.5) * 12; pos[i * 3 + 1] = Math.random() * WALL_H; pos[i * 3 + 2] = (Math.random() - 0.5) * 12; }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.dust = new THREE.Points(g, new THREE.PointsMaterial({ color: 0xffd9a0, size: 0.012, transparent: true, opacity: 0.6, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.scene.add(this.dust);
  }

  buildLevel(map) {
    this.map = map;
    const th = this.theme = themeForDepth(map.depth);
    this.scene.background.setHex(th.fog); this.scene.fog.color.setHex(th.fog); this.scene.fog.density = th.fogD;
    this.ambient.color.setHex(th.amb); this.hemi.color.setHex(th.hemi);
    this.dust.material.color.setHex(th.dust);
    for (const o of [...this.level.children]) { this.level.remove(o); o.geometry?.dispose?.(); }
    for (const t of this.torches) this.scene.remove(t.light);
    this.torches = [];
    for (const m of [this.monsterObjs, this.playerObjs, this.itemObjs]) { for (const o of m.values()) this.entities.remove(o); m.clear(); }
    const { w, h, cells } = map;
    const at = (x, y) => (x < 0 || y < 0 || x >= w || y >= h ? '#' : cells[y][x]);
    const open = (c) => c !== '#';
    // walls: only those touching open space
    const wallCells = [];
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (at(x, y) !== '#') continue;
      if ([[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]].some(([dx, dy]) => open(at(x + dx, y + dy)))) wallCells.push([x, y]);
    }
    const wallMat = new THREE.MeshStandardMaterial({ map: this.tex.stone, color: th.wall, roughness: 0.92, metalness: 0.02 });
    const walls = new THREE.InstancedMesh(new THREE.BoxGeometry(1, WALL_H, 1), wallMat, wallCells.length);
    const m4 = new THREE.Matrix4();
    wallCells.forEach(([x, y], i) => { m4.makeTranslation(x, WALL_H / 2, y); walls.setMatrixAt(i, m4); });
    this.level.add(walls);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: this.tex.floor, color: th.floor, roughness: 0.85 }));
    this.tex.floor.repeat.set(w, h);
    floor.rotation.x = -Math.PI / 2; floor.position.set(w / 2 - 0.5, 0, h / 2 - 0.5);
    this.level.add(floor);
    const ceil = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: this.tex.ceil, roughness: 1 }));
    this.tex.ceil.repeat.set(w / 2, h / 2);
    ceil.rotation.x = Math.PI / 2; ceil.position.set(w / 2 - 0.5, WALL_H, h / 2 - 0.5);
    this.level.add(ceil);
    // pillars
    const pillarGeo = new THREE.CylinderGeometry(0.22, 0.28, WALL_H, 12);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (at(x, y) === 'P') {
      const p = new THREE.Mesh(pillarGeo, wallMat); p.position.set(x, WALL_H / 2, y); this.level.add(p);
    }
    // doors and visible (sprung/disarmed) traps
    this.doorObjs = new Map(); this.trapObjs = new Map();
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) this.setCell(x, y, at(x, y), true);
    // stairway portal
    const s = map.stairs;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.035, 12, 48), new THREE.MeshBasicMaterial({ color: 0x66e0ff }));
    ring.rotation.x = -Math.PI / 2; ring.position.set(s.x, 0.03, s.y);
    const hole = new THREE.Mesh(new THREE.CircleGeometry(0.32, 40), new THREE.MeshBasicMaterial({ color: 0x02040a }));
    hole.rotation.x = -Math.PI / 2; hole.position.set(s.x, 0.02, s.y);
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.34, WALL_H, 24, 1, true), new THREE.MeshBasicMaterial({ color: 0x55ccff, transparent: true, opacity: 0.18, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false }));
    beam.position.set(s.x, WALL_H / 2, s.y);
    this.level.add(ring, hole, beam);
    this.portal = { ring, beam };
    // the spectral Lantern Merchant hovers over the entry hall
    if (map.start) {
      const mer = new THREE.Group();
      const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: iconTexture('🧙', '#ffb02e'), transparent: true, opacity: 0.85, depthWrite: false }));
      spr.scale.set(0.55, 0.55, 1); spr.position.y = 0.62;
      const lamp = new THREE.Sprite(new THREE.SpriteMaterial({ map: iconTexture('🏮', '#ff8a2a'), transparent: true, depthWrite: false }));
      lamp.scale.set(0.22, 0.22, 1); lamp.position.set(0.22, 0.5, 0);
      const label = textSprite('Lantern Merchant (B)', '#ffcf6a', 34, 0.45); label.position.y = 1.0;
      const ml = new THREE.PointLight(0xffa040, 2.5, 4, 1.4); ml.position.y = 0.6;
      mer.add(spr, lamp, label, ml);
      mer.position.set(map.start.x, 0, map.start.y);
      this.level.add(mer);
      this.merchant = mer;
    } else this.merchant = null;
    const pl = new THREE.PointLight(0x55ccff, 2.2, 5, 1.5); pl.position.set(s.x, 0.4, s.y);
    this.level.add(pl);
    // wall torches on walls facing open floor (deterministic-ish spacing)
    let placed = 0;
    for (const [x, y] of wallCells) {
      if (placed >= 14 || (x * 7 + y * 13) % 11 !== 0) continue;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        if (at(x + dx, y + dy) !== '.') continue;
        const px = x + dx * 0.56, py = y + dy * 0.56;
        const flame = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 8), new THREE.MeshBasicMaterial({ color: th.flame }));
        flame.position.set(px, 0.78, py);
        const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.02, 0.18, 6), new THREE.MeshStandardMaterial({ color: 0x3a2a1a }));
        stick.position.set(px, 0.68, py);
        const light = new THREE.PointLight(th.torch, 4, 5, 1.3); light.position.set(x + dx * 0.7, 0.8, y + dy * 0.7);
        this.level.add(flame, stick); this.scene.add(light);
        this.torches.push({ light, flame, seed: Math.random() * 100 });
        placed++;
        break;
      }
    }
  }

  setCell(x, y, c, instant = false) {
    const key = y * this.map.w + x;
    if (c === '+' || c === '/') {
      let d = this.doorObjs.get(key);
      if (!d) {
        const cells = this.map.cells;
        const spanX = cells[y]?.[x - 1] === '#' && cells[y]?.[x + 1] === '#';
        if (!this.doorMat) {
          this.doorMat = new THREE.MeshStandardMaterial({ map: canvasTex(128, (ctx, s) => {
            ctx.fillStyle = '#3b2412'; ctx.fillRect(0, 0, s, s);
            for (let i = 0; i < 5; i++) { const v = 50 + Math.random() * 25; ctx.fillStyle = `rgb(${v + 20},${v},${v - 20})`; ctx.fillRect(i * s / 5 + 2, 0, s / 5 - 4, s); }
            ctx.fillStyle = '#2a2a30'; for (const yy of [0.18, 0.78]) ctx.fillRect(0, yy * s, s, 10);
            ctx.fillStyle = '#8a8a90'; for (const yy of [0.18, 0.78]) for (let i = 0; i < 6; i++) ctx.fillRect(8 + i * 22, yy * s + 3, 4, 4);
          }), roughness: 0.8, metalness: 0.15 });
        }
        d = new THREE.Mesh(new THREE.BoxGeometry(spanX ? 1 : 0.12, WALL_H, spanX ? 0.12 : 1), this.doorMat);
        d.position.set(x, WALL_H / 2, y);
        d.userData = { open: 0, target: 0 };
        this.level.add(d); this.doorObjs.set(key, d);
      }
      d.userData.target = c === '/' ? 1 : 0;
      if (instant) d.userData.open = d.userData.target;
    } else if (c === 'x' && !this.trapObjs.has(key)) {
      const g = new THREE.Group();
      const plate = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.02, 0.8), new THREE.MeshStandardMaterial({ color: 0x3a3330, metalness: 0.6, roughness: 0.5 }));
      plate.position.y = 0.01; g.add(plate);
      const spikeMat = new THREE.MeshStandardMaterial({ color: 0x9a9aa6, metalness: 0.9, roughness: 0.3, emissive: 0x220000 });
      for (let i = 0; i < 9; i++) {
        const sp = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.22, 6), spikeMat);
        sp.position.set(((i % 3) - 1) * 0.24, 0.11, (Math.floor(i / 3) - 1) * 0.24); g.add(sp);
      }
      g.position.set(x, instant ? 0 : -0.2, y);
      g.userData = { rise: instant ? 1 : 0 };
      this.level.add(g); this.trapObjs.set(key, g);
    }
  }
  setCamera(x, y, f, snap = false) {
    this.cam.tx = x; this.cam.ty = y;
    // continuous yaw target so turns animate the short way round
    const target = -f * Math.PI / 2;
    let d = target - this.cam.tyaw;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    this.cam.tyaw += d;
    if (snap) { this.cam.x = x; this.cam.y = y; this.cam.yaw = this.cam.tyaw; }
  }

  shake(a = 0.06) { this.cam.shake = Math.max(this.cam.shake, a); }

  // ---------- entities ----------
  syncMonsters(list) {
    const seen = new Set();
    for (const m of list) {
      seen.add(m.id);
      let o = this.monsterObjs.get(m.id);
      const def = MONSTERS[m.t];
      if (!o) {
        o = new THREE.Group();
        const aff = m.e ? AFFIXES[m.e] : null;
        const scale = def.boss ? 1.2 : aff ? 0.88 : 0.72;
        const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: iconTexture(def.icon, def.boss ? '#ff2244' : aff ? aff.color : '#aa2200'), transparent: true }));
        spr.scale.set(scale, scale, 1); spr.position.y = def.boss ? 0.6 : 0.38;
        const bar = hpBar(); bar.position.y = def.boss ? 1.25 : 0.82;
        const shadow = new THREE.Mesh(new THREE.CircleGeometry(0.25, 16), new THREE.MeshBasicMaterial({ color: 0, transparent: true, opacity: 0.45, depthWrite: false }));
        shadow.rotation.x = -Math.PI / 2; shadow.position.y = 0.01;
        o.add(spr, bar, shadow);
        if (aff) {
          const label = textSprite(`${aff.icon} ${aff.name}`, aff.color, 36, 0.5); label.position.y = 1.0; o.add(label);
          const glow = new THREE.PointLight(new THREE.Color(aff.color), 1.6, 2.5, 1.5); glow.position.y = 0.4; o.add(glow);
          const ring = new THREE.Mesh(new THREE.RingGeometry(0.26, 0.33, 32), new THREE.MeshBasicMaterial({ color: aff.color, transparent: true, opacity: 0.8, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false }));
          ring.rotation.x = -Math.PI / 2; ring.position.y = 0.02; o.add(ring);
        }
        o.userData = { spr, bar, lastHp: -1, flash: 0, x: m.x, y: m.y, baseY: spr.position.y, boss: def.boss };
        o.position.set(m.x, 0, m.y);
        this.entities.add(o); this.monsterObjs.set(m.id, o);
      }
      const u = o.userData;
      u.x = m.x; u.y = m.y; u.stun = m.s;
      if (u.lastHp !== m.hp) { if (u.lastHp > m.hp) u.flash = 1; u.lastHp = m.hp; u.bar.userData.set(m.hp / m.mhp, def.boss ? '#ff2a6a' : m.e ? AFFIXES[m.e].color : '#e33'); }
    }
    for (const [id, o] of this.monsterObjs) if (!seen.has(id)) { this.entities.remove(o); this.monsterObjs.delete(id); }
  }

  syncPlayers(list, selfId) {
    const seen = new Set();
    for (const p of list) {
      if (p.id === selfId) continue;
      seen.add(p.id);
      let o = this.playerObjs.get(p.id);
      const def = CLASSES[p.c];
      if (!o) {
        o = new THREE.Group();
        const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: iconTexture(def.icon, def.color), transparent: true }));
        spr.scale.set(0.6, 0.6, 1); spr.position.y = 0.36;
        const label = textSprite(p.n, def.color); label.position.y = 0.88;
        const bar = hpBar(); bar.position.y = 0.76;
        const ring = new THREE.Mesh(new THREE.RingGeometry(0.22, 0.28, 32), new THREE.MeshBasicMaterial({ color: def.color, transparent: true, opacity: 0.8, side: THREE.DoubleSide }));
        ring.rotation.x = -Math.PI / 2; ring.position.y = 0.015;
        const light = new THREE.PointLight(new THREE.Color(def.color), 0.8, 3, 1.5); light.position.y = 0.5;
        o.add(spr, label, bar, ring, light);
        o.userData = { spr, bar, lastHp: -1, x: p.x, y: p.y, bubble: null };
        o.position.set(p.x, 0, p.y);
        this.entities.add(o); this.playerObjs.set(p.id, o);
      }
      const u = o.userData;
      u.x = p.x; u.y = p.y; u.dead = p.d > 0 || p.o === 1;
      if (u.lastHp !== p.hp) { u.lastHp = p.hp; u.bar.userData.set(p.hp / p.mhp, '#3c3'); }
    }
    for (const [id, o] of this.playerObjs) if (!seen.has(id)) { this.entities.remove(o); this.playerObjs.delete(id); }
  }

  // speech bubble over another hero's head for a few seconds
  say(pid, text) {
    const o = this.playerObjs.get(pid);
    if (!o) return;
    const u = o.userData;
    if (u.bubble) { o.remove(u.bubble); u.bubble.material.map.dispose(); }
    const short = text.length > 42 ? text.slice(0, 40) + '…' : text;
    const sp = textSprite(short, '#fff6dc', 34, 0.5);
    sp.position.y = 1.08;
    sp.userData.until = this.clock.elapsedTime + 4.5;
    o.add(sp); u.bubble = sp;
  }
  syncItems(list) {
    const seen = new Set();
    for (const it of list) {
      seen.add(it.id);
      if (this.itemObjs.has(it.id)) continue;
      let o;
      if (it.k === 'gold') {
        o = new THREE.Group();
        const coinMat = new THREE.MeshStandardMaterial({ color: 0xffcc33, metalness: 0.9, roughness: 0.25, emissive: 0x442200 });
        for (let i = 0; i < 4; i++) { const c = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.015, 16), coinMat); c.position.set((Math.random() - 0.5) * 0.15, 0.02 + i * 0.016, (Math.random() - 0.5) * 0.15); o.add(c); }
      } else if (it.k === 'gear') {
        o = new THREE.Group();
        const col = RARITY[it.r].color;
        const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: iconTexture(SLOTS[it.s].icon, col), transparent: true, depthWrite: false }));
        spr.scale.set(0.4, 0.4, 1); spr.position.y = 0.25;
        const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.12, 1.0, 12, 1, true), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.12 + it.r * 0.06, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
        beam.position.y = 0.5;
        o.add(spr, beam);
        if (it.r >= 1) { const l = new THREE.PointLight(new THREE.Color(col), 1 + it.r, 2.5, 1.5); l.position.y = 0.3; o.add(l); }
      } else {
        o = new THREE.Group();
        const bottle = new THREE.Mesh(new THREE.SphereGeometry(0.07, 16, 12), new THREE.MeshStandardMaterial({ color: 0xff2244, emissive: 0x660011, roughness: 0.15, metalness: 0.1, transparent: true, opacity: 0.9 }));
        bottle.position.y = 0.12;
        const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.025, 0.07, 8), new THREE.MeshStandardMaterial({ color: 0xccddee, roughness: 0.2 }));
        neck.position.y = 0.21;
        o.add(bottle, neck);
      }
      o.position.set(it.x, 0, it.y);
      o.userData = { spin: true };
      this.entities.add(o); this.itemObjs.set(it.id, o);
    }
    for (const [id, o] of this.itemObjs) if (!seen.has(id)) { this.entities.remove(o); this.itemObjs.delete(id); }
  }

  // ---------- effects ----------
  addFx(obj, life, update) { this.fxGroup.add(obj); this.fxList.push({ obj, life, t: 0, update }); }

  projectile(from, to, color, size = 0.06) {
    const g = new THREE.Group();
    const core = new THREE.Mesh(new THREE.SphereGeometry(size, 12, 12), new THREE.MeshBasicMaterial({ color }));
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: iconTexture('', '#ffffff'), color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    halo.scale.set(size * 8, size * 8, 1);
    const light = new THREE.PointLight(color, 2, 3);
    g.add(core, halo, light);
    const dist = Math.hypot(to.x - from.x, to.y - from.y);
    const life = Math.max(0.12, dist * 0.045);
    this.addFx(g, life, (k) => g.position.set(from.x + (to.x - from.x) * k, 0.45, from.y + (to.y - from.y) * k));
  }

  burst(x, y, color, radius = 0.6, life = 0.5) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 16), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false }));
    m.position.set(x, 0.4, y);
    const light = new THREE.PointLight(color, 4, radius * 4); light.position.set(x, 0.5, y);
    this.fxGroup.add(light);
    this.addFx(m, life, (k) => { m.scale.setScalar(0.05 + radius * k); m.material.opacity = 0.6 * (1 - k); light.intensity = 4 * (1 - k); if (k >= 1) this.fxGroup.remove(light); });
  }

  ringWave(x, y, color, radius, life = 0.6) {
    const m = new THREE.Mesh(new THREE.RingGeometry(0.85, 1, 48), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false }));
    m.rotation.x = -Math.PI / 2; m.position.set(x, 0.05, y);
    this.addFx(m, life, (k) => { m.scale.setScalar(0.1 + (radius + 0.5) * k); m.material.opacity = 0.9 * (1 - k); });
  }

  floatText(x, y, text, color, big = false) {
    const sp = textSprite(text, color, big ? 56 : 44, big ? 0.9 : 0.6);
    const ox = (Math.random() - 0.5) * 0.3;
    this.addFx(sp, 1.0, (k) => { sp.position.set(x + ox, 0.75 + k * 0.5, y); sp.material.opacity = 1 - k * k; });
  }

  sparkle(x, y, color, n = 24, life = 0.9) {
    const pos = new Float32Array(n * 3), vel = [];
    for (let i = 0; i < n; i++) { pos.set([x, 0.3, y], i * 3); vel.push([(Math.random() - 0.5) * 1.2, Math.random() * 1.6, (Math.random() - 0.5) * 1.2]); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const pts = new THREE.Points(g, new THREE.PointsMaterial({ color, size: 0.05, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.addFx(pts, life, (k, dt) => {
      const a = g.attributes.position.array;
      for (let i = 0; i < n; i++) { a[i * 3] += vel[i][0] * dt; a[i * 3 + 1] += (vel[i][1] - k * 2) * dt; a[i * 3 + 2] += vel[i][2] * dt; }
      g.attributes.position.needsUpdate = true; pts.material.opacity = 1 - k;
    });
  }

  playFx(ev, selfId) {
    const C = { bolt: 0xb38cff, fire: 0xff6a1a, arrow: 0xd8ffb0, mbolt: 0xff3355 };
    switch (ev.k) {
      case 'bolt': case 'arrow': case 'mbolt': this.projectile({ x: ev.x, y: ev.y }, { x: ev.tx, y: ev.ty }, C[ev.k], ev.k === 'arrow' ? 0.035 : 0.06); break;
      case 'fire': this.projectile({ x: ev.x, y: ev.y }, { x: ev.tx, y: ev.ty }, C.fire, 0.09); setTimeout(() => { this.burst(ev.tx, ev.ty, 0xff5511, 1.4, 0.6); this.sparkle(ev.tx, ev.ty, 0xffaa33, 40); }, 200); break;
      case 'frost': this.ringWave(ev.x, ev.y, 0x88ddff, ev.r); this.sparkle(ev.x, ev.y, 0xcff4ff, 50); break;
      case 'holy': this.ringWave(ev.x, ev.y, 0xfff0a0, ev.r); this.burst(ev.x, ev.y, 0xffee88, 1.2); break;
      case 'thorn': this.ringWave(ev.x, ev.y, 0x66dd44, ev.r); this.sparkle(ev.x, ev.y, 0x88ff55, 40); break;
      case 'nova': this.ringWave(ev.x, ev.y, 0xffffff, ev.r); break;
      case 'heal': this.sparkle(ev.x, ev.y, 0x66ff88, 30); break;
      case 'might': this.sparkle(ev.x, ev.y, 0xff9933, 30); break;
      case 'veil': this.sparkle(ev.x, ev.y, 0x6644aa, 40); break;
      case 'levelup': this.ringWave(ev.x, ev.y, 0xffd700, 1.5, 1); this.sparkle(ev.x, ev.y, 0xffd700, 60, 1.4); break;
      case 'pickup': this.sparkle(ev.x, ev.y, 0xffdd55, 16, 0.6); break;
      case 'equip': this.ringWave(ev.x, ev.y, new THREE.Color(RARITY[ev.r].color), 0.8, 0.7); this.sparkle(ev.x, ev.y, new THREE.Color(RARITY[ev.r].color), 30 + ev.r * 15); break;
      case 'death': this.burst(ev.x, ev.y, 0x880000, 0.5, 0.5); this.sparkle(ev.x, ev.y, 0x551111, 30); break;
      case 'revive': this.ringWave(ev.x, ev.y, 0xfff4b0, 1.2, 0.9); this.burst(ev.x, ev.y, 0xffffcc, 0.9, 0.7); this.sparkle(ev.x, ev.y, 0xffeeaa, 60, 1.3); break;
      case 'pdeath': this.burst(ev.x, ev.y, 0x6600aa, 0.8, 0.8); break;
      case 'swing': if (ev.pid === selfId) this.swingFlash(); break;
      case 'trap': this.burst(ev.x, ev.y, 0xaa0000, 0.4, 0.35); this.sparkle(ev.x, ev.y, 0xff3333, 30, 0.7); if (Math.abs(ev.x - this.cam.tx) + Math.abs(ev.y - this.cam.ty) < 0.5) this.shake(0.12); break;
      case 'disarm': this.sparkle(ev.x, ev.y, 0x5fd38d, 24, 0.8); break;
      case 'warn': this.ringWave(ev.x, ev.y, 0xff3300, ev.r, 1.5); this.sparkle(ev.x, ev.y, 0xff6600, 40, 1.5); break;
      case 'bossnova': this.ringWave(ev.x, ev.y, 0xff7a1a, ev.r, 0.7); this.burst(ev.x, ev.y, 0xff5500, ev.r + 0.6, 0.7); this.sparkle(ev.x, ev.y, 0xffbb33, 80, 1.1); this.shake(0.1); break;
      case 'summon': this.burst(ev.x, ev.y, 0x6a2aff, 0.45, 0.5); this.sparkle(ev.x, ev.y, 0xaa77ff, 24, 0.8); break;
      case 'claw': this.burst(ev.tx, ev.ty, 0xff2222, 0.25, 0.25); break;
      case 'dmg': {
        this.floatText(ev.x, ev.y, ev.crit ? `${ev.v}!` : `${ev.v}`, ev.crit ? '#ffd23f' : '#ffffff', ev.crit);
        const o = this.monsterObjs.get(ev.mid); if (o) o.userData.flash = 1;
        break;
      }
      case 'num':
        if (ev.heal) this.floatText(ev.x, ev.y, `+${ev.v}`, '#66ff88');
        else { this.floatText(ev.x, ev.y, `-${ev.v}`, '#ff4444'); if (ev.pid === selfId) this.shake(0.08); }
        break;
    }
  }

  swingFlash() { this.cam.swing = 1; }

  // ---------- frame ----------
  render() {
    const dt = Math.min(0.05, this.clock.getDelta());
    const t = this.clock.elapsedTime;
    const c = this.cam;
    const lerp = 1 - Math.pow(0.0005, dt);
    const moving = Math.hypot(c.tx - c.x, c.ty - c.y) > 0.01;
    c.x += (c.tx - c.x) * lerp; c.y += (c.ty - c.y) * lerp; c.yaw += (c.tyaw - c.yaw) * lerp;
    if (moving) c.bob += dt * 12;
    c.shake *= Math.pow(0.02, dt);
    c.swing = (c.swing || 0) * Math.pow(0.001, dt);
    const sx = (Math.random() - 0.5) * c.shake, sy = (Math.random() - 0.5) * c.shake;
    this.camera.position.set(c.x + sx, EYE + Math.sin(c.bob) * 0.02 + sy, c.y);
    this.camera.rotation.set(-0.02 + c.swing * 0.05, c.yaw + c.swing * 0.08, 0, 'YXZ');
    this.lantern.intensity = 7 + Math.sin(t * 9) * 0.15 + Math.sin(t * 23) * 0.1;
    for (const tr of this.torches) { const f = Math.sin(t * 11 + tr.seed) * 0.25 + Math.sin(t * 27 + tr.seed * 2) * 0.15; tr.light.intensity = 4 + f * 2; tr.flame.scale.setScalar(1 + f * 0.4); }
    for (const d of this.doorObjs.values()) {
      const u = d.userData;
      u.open += Math.sign(u.target - u.open) * Math.min(Math.abs(u.target - u.open), dt * 1.8);
      d.position.y = WALL_H / 2 + u.open * (WALL_H - 0.08);
    }
    for (const g of this.trapObjs.values()) if (g.userData.rise < 1) { g.userData.rise = Math.min(1, g.userData.rise + dt * 8); g.position.y = -0.2 + 0.2 * g.userData.rise; }
    if (this.portal) { this.portal.ring.rotation.z = t; this.portal.beam.material.opacity = 0.14 + Math.sin(t * 3) * 0.06; }
    this.dust.position.set(c.x, 0, c.y);
    this.dust.rotation.y = t * 0.02;
    const k = 1 - Math.pow(0.0001, dt);
    for (const o of this.monsterObjs.values()) {
      const u = o.userData;
      o.position.x += (u.x - o.position.x) * k; o.position.z += (u.y - o.position.z) * k;
      u.spr.position.y = u.baseY + Math.sin(t * 3 + o.id) * 0.03;
      u.flash = Math.max(0, u.flash - dt * 4);
      u.spr.material.color.setRGB(1, 1 - u.flash * 0.7, 1 - u.flash * 0.7);
      if (u.stun) u.spr.material.color.setRGB(0.6, 0.85, 1);
    }
    for (const o of this.playerObjs.values()) {
      const u = o.userData;
      o.position.x += (u.x - o.position.x) * k; o.position.z += (u.y - o.position.z) * k;
      u.spr.material.opacity = u.dead ? 0.25 : 1;
      u.spr.position.y = 0.36 + Math.sin(t * 2 + o.id) * 0.02;
      if (u.bubble) {
        const left = u.bubble.userData.until - t;
        u.bubble.material.opacity = Math.min(1, left);
        if (left <= 0) { o.remove(u.bubble); u.bubble.material.map.dispose(); u.bubble = null; }
      }
    }
    if (this.merchant) this.merchant.position.y = Math.sin(t * 1.3) * 0.04;
    for (const o of this.itemObjs.values()) { o.rotation.y = t * 1.5; o.position.y = Math.sin(t * 2 + o.id) * 0.02 + 0.02; }
    for (let i = this.fxList.length - 1; i >= 0; i--) {
      const f = this.fxList[i];
      f.t += dt;
      const kk = Math.min(1, f.t / f.life);
      f.update(kk, dt);
      if (kk >= 1) { this.fxGroup.remove(f.obj); this.fxList.splice(i, 1); }
    }
    this.r.render(this.scene, this.camera);
  }
}
