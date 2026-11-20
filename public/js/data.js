// Shared game data — imported by both the browser client and the Cloudflare Worker.
export const GAME_NAME = 'Umbravault';
export const GAME_TAGLINE = 'Crypts of the Lantern-Bound';
export const MAX_PLAYERS = 8;
export const MAP_W = 33;
export const MAP_H = 33;

// Directions: 0=N(-y) 1=E(+x) 2=S(+y) 3=W(-x)
export const DIRS = [[0, -1], [1, 0], [0, 1], [-1, 0]];

// kind: melee (cell in front), ranged (first monster in line), aoe (all monsters within radius),
// cone (front 3 cells + 2 deep), heal (party within radius), buff (self/party effect)
export const CLASSES = {
  vanguard: {
    name: 'Vanguard', icon: '🛡️', color: '#d9a441',
    desc: 'Iron-shod frontliner. Soaks blows and shatters skulls.',
    hp: 150, mp: 40, armor: 4, hpPerLvl: 18, mpPerLvl: 4,
    abilities: [
      { id: 'cleave', name: 'Cleave', icon: '⚔️', kind: 'cone', dmg: [12, 18], cd: 700, mp: 0, desc: 'Sweep the three cells before you.' },
      { id: 'bash', name: 'Shield Bash', icon: '🛡️', kind: 'melee', dmg: [16, 24], cd: 5000, mp: 10, stun: 2500, desc: 'Stun the foe ahead.' },
      { id: 'warcry', name: 'Warcry', icon: '📯', kind: 'buff', buff: 'might', dur: 10000, radius: 5, cd: 18000, mp: 20, desc: 'Allies nearby deal +40% damage.' },
    ],
  },
  arcanist: {
    name: 'Arcanist', icon: '🔮', color: '#7d6bff',
    desc: 'Scholar of the starless sky. Fragile, devastating.',
    hp: 75, mp: 140, armor: 0, hpPerLvl: 8, mpPerLvl: 14,
    abilities: [
      { id: 'bolt', name: 'Arcane Bolt', icon: '✨', kind: 'ranged', dmg: [10, 16], range: 8, cd: 650, mp: 0, fx: 'bolt', desc: 'A lance of violet force.' },
      { id: 'fireball', name: 'Fireball', icon: '🔥', kind: 'ranged', dmg: [22, 34], range: 8, splash: 1, cd: 4500, mp: 25, fx: 'fire', desc: 'Explodes on impact, burning everything nearby.' },
      { id: 'nova', name: 'Frost Nova', icon: '❄️', kind: 'aoe', dmg: [12, 18], radius: 2, stun: 3000, cd: 12000, mp: 30, fx: 'frost', desc: 'Freeze all foes around you.' },
    ],
  },
  lightwarden: {
    name: 'Lightwarden', icon: '☀️', color: '#ffe27a',
    desc: 'Bearer of the last sunrise. Mends wounds, smites the dead.',
    hp: 110, mp: 120, armor: 2, hpPerLvl: 12, mpPerLvl: 10,
    abilities: [
      { id: 'smite', name: 'Smite', icon: '🔨', kind: 'melee', dmg: [11, 17], cd: 750, mp: 0, holy: 2, desc: 'Holy hammer — double damage to undead.' },
      { id: 'mend', name: 'Mending Light', icon: '💛', kind: 'heal', heal: [30, 45], radius: 5, cd: 6000, mp: 25, desc: 'Heal every ally within 5 paces.' },
      { id: 'radiance', name: 'Radiance', icon: '🌟', kind: 'aoe', dmg: [16, 24], radius: 3, holy: 2, cd: 10000, mp: 30, fx: 'holy', desc: 'Searing light bursts from you.' },
    ],
  },
  nightblade: {
    name: 'Nightblade', icon: '🗡️', color: '#5fd38d',
    desc: 'A whisper with a knife. Strikes from the shadows.',
    hp: 95, mp: 70, armor: 1, hpPerLvl: 10, mpPerLvl: 6,
    abilities: [
      { id: 'stab', name: 'Twin Daggers', icon: '🗡️', kind: 'melee', dmg: [9, 13], cd: 420, mp: 0, desc: 'Lightning-fast stabs.' },
      { id: 'backstab', name: 'Eviscerate', icon: '💀', kind: 'melee', dmg: [30, 45], cd: 6000, mp: 20, crit: 0.5, desc: 'Brutal strike. 50% chance to crit; always crits from Shadowveil.' },
      { id: 'vanish', name: 'Shadowveil', icon: '🌑', kind: 'buff', buff: 'veil', dur: 6000, radius: 0, cd: 16000, mp: 20, desc: 'Monsters lose track of you.' },
    ],
  },
  thornwarden: {
    name: 'Thornwarden', icon: '🏹', color: '#9be15d',
    desc: 'Wild-sworn archer. Pins foes from afar.',
    hp: 100, mp: 80, armor: 1, hpPerLvl: 11, mpPerLvl: 7,
    abilities: [
      { id: 'arrow', name: 'Longshot', icon: '🏹', kind: 'ranged', dmg: [11, 16], range: 10, cd: 700, mp: 0, fx: 'arrow', desc: 'A true-flighted arrow.' },
      { id: 'volley', name: 'Piercing Volley', icon: '🎯', kind: 'ranged', dmg: [18, 26], range: 10, pierce: true, cd: 5000, mp: 20, fx: 'arrow', desc: 'Hits every foe in the line.' },
      { id: 'snare', name: 'Thornsnare', icon: '🌿', kind: 'aoe', dmg: [6, 10], radius: 3, stun: 4000, cd: 14000, mp: 25, fx: 'thorn', desc: 'Roots all nearby foes.' },
    ],
  },
};

CLASSES.hexweaver = {
  name: 'Hexweaver', icon: '🕯️', color: '#e0508a',
  desc: 'Pact-bound warlock. Steals life, curses crowds, wards the party.',
  hp: 90, mp: 110, armor: 1, hpPerLvl: 10, mpPerLvl: 11,
  abilities: [
    { id: 'drain', name: 'Soul Drain', icon: '🩸', kind: 'ranged', dmg: [9, 14], range: 7, drain: 0.5, cd: 750, mp: 0, fx: 'drain', desc: 'Siphon a foe — heals you for half the damage.' },
    { id: 'hex', name: 'Withering Hex', icon: '🕸️', kind: 'aoe', dmg: [14, 22], radius: 3, stun: 1500, cd: 9000, mp: 30, fx: 'hex', desc: 'Curse every foe within 3 paces, staggering them.' },
    { id: 'ward', name: 'Bone Ward', icon: '🦴', kind: 'buff', buff: 'ward', dur: 8000, radius: 5, cd: 20000, mp: 25, desc: 'Allies nearby take 35% less damage.' },
  ],
};
export const MONSTERS = {
  rat: { name: 'Gloom Rat', icon: '🐀', hp: 22, dmg: [3, 6], xp: 8, speed: 450, atkCd: 900, tier: 0 },
  goblin: { name: 'Mire Goblin', icon: '👺', hp: 34, dmg: [5, 9], xp: 14, speed: 550, atkCd: 1100, tier: 0 },
  skeleton: { name: 'Bone Rattler', icon: '💀', hp: 45, dmg: [6, 11], xp: 20, speed: 700, atkCd: 1200, undead: true, tier: 1 },
  spider: { name: 'Vault Spider', icon: '🕷️', hp: 38, dmg: [7, 12], xp: 22, speed: 400, atkCd: 1000, tier: 1 },
  cultist: { name: 'Ember Cultist', icon: '🧙', hp: 40, dmg: [8, 13], xp: 26, speed: 750, atkCd: 1800, range: 5, tier: 1 },
  ghoul: { name: 'Crypt Ghoul', icon: '🧟', hp: 70, dmg: [9, 15], xp: 32, speed: 800, atkCd: 1300, undead: true, tier: 2 },
  wraith: { name: 'Pale Wraith', icon: '👻', hp: 60, dmg: [11, 17], xp: 40, speed: 500, atkCd: 1400, undead: true, range: 4, tier: 2 },
  ogre: { name: 'Cavern Ogre', icon: '👹', hp: 130, dmg: [15, 24], xp: 60, speed: 950, atkCd: 1700, tier: 3 },
  boss: { name: 'The Hollow King', icon: '☠️', hp: 600, dmg: [18, 30], xp: 400, speed: 700, atkCd: 1500, undead: true, range: 3, boss: true, tier: 9, power: 'raise', powerCd: 9000, title: 'raises the dead' },
  matriarch: { name: 'The Brood Matriarch', icon: '🦂', hp: 720, dmg: [20, 32], xp: 520, speed: 600, atkCd: 1300, boss: true, tier: 9, power: 'brood', powerCd: 8000, title: 'births a swarm' },
  tyrant: { name: 'The Ember Tyrant', icon: '🐉', hp: 900, dmg: [22, 34], xp: 700, speed: 800, atkCd: 1600, range: 4, boss: true, tier: 9, power: 'nova', powerCd: 6500, title: 'gathers a firestorm' },
};

// Elite monsters: tougher variants with one affix, more XP and a guaranteed Runed+ gear drop.
export const AFFIXES = {
  swift: { name: 'Swift', icon: '💨', color: '#7fe0ff', desc: 'moves and attacks faster' },
  vampiric: { name: 'Vampiric', icon: '🩸', color: '#ff3355', desc: 'heals from the damage it deals' },
  stoneskin: { name: 'Stoneskin', icon: '🪨', color: '#c8b89a', desc: 'takes 35% less damage' },
  frenzied: { name: 'Frenzied', icon: '💢', color: '#ff8a2a', desc: 'hits 40% harder' },
  molten: { name: 'Molten', icon: '🌋', color: '#ff5a00', desc: 'explodes when slain' },
};
export const eliteName = (m, def) => (m.e ? `${AFFIXES[m.e].name} ${def.name}` : def.name);
// The Lantern Merchant haunts each floor's entry hall. Prices scale with depth.
export const SHOP = [
  { id: 'potion', icon: '🧪', name: 'Crimson Draught', desc: '+1 healing potion (max 9)', price: (d) => 25 + 10 * d },
  { id: 'elixir', icon: '✨', name: 'Lantern Elixir', desc: 'Fully restore HP and MP', price: (d) => 15 + 8 * d },
  { id: 'runed', icon: '🔷', name: 'Runed Cache', desc: 'Random gear, Runed or better', price: (d) => 90 + 40 * d },
  { id: 'mythic', icon: '🔮', name: 'Mythic Cache', desc: 'Random gear, Mythic or better', price: (d) => 260 + 110 * d },
];
export const MERCHANT_RANGE = 2;
// bosses guard every 3rd depth, in this rotation
export const BOSS_ORDER = ['boss', 'matriarch', 'tyrant'];
export const bossForDepth = (d) => BOSS_ORDER[(Math.floor(d / 3) - 1) % BOSS_ORDER.length];

// quick emotes (keys 5-9): shown as a bubble over the hero and pinged on the minimap
export const EMOTES = [
  { icon: '👋', text: 'Hail, friends!' },
  { icon: '🆘', text: 'Help me!' },
  { icon: '⚠️', text: 'Danger ahead!' },
  { icon: '➡️', text: 'Follow me!' },
  { icon: '🎉', text: 'Victory!' },
];
// visual themes cycle with depth: tints for walls/floor, fog, ambient light, torch flame and drifting motes
export const THEMES = [
  { name: 'Sunken Crypt', wall: 0xffffff, floor: 0xffffff, fog: 0x050307, fogD: 0.11, amb: 0x3a3050, hemi: 0x4a4080, torch: 0xff8a2a, flame: 0xffaa33, dust: 0xffd9a0 },
  { name: 'Mosswood Grotto', wall: 0x9fd28a, floor: 0xa8c890, fog: 0x03100a, fogD: 0.13, amb: 0x1e4030, hemi: 0x3a8050, torch: 0x7dff6a, flame: 0xb8ff7a, dust: 0x9dff8a },
  { name: 'Rimefrost Halls', wall: 0xb8d8ff, floor: 0xcfe4ff, fog: 0x060c18, fogD: 0.09, amb: 0x304868, hemi: 0x6090d0, torch: 0x66ccff, flame: 0xbfeaff, dust: 0xffffff },
  { name: 'Ember Forge', wall: 0xff9a70, floor: 0xd08060, fog: 0x140402, fogD: 0.12, amb: 0x502018, hemi: 0xa04020, torch: 0xff5a1a, flame: 0xffd040, dust: 0xff8a3a },
  { name: 'Abyssal Sanctum', wall: 0xb090ff, floor: 0x9a80d0, fog: 0x08030f, fogD: 0.12, amb: 0x34205a, hemi: 0x7040c0, torch: 0xc070ff, flame: 0xf0b0ff, dust: 0xd8a0ff },
];
export const themeForDepth = (d) => THEMES[((d || 1) - 1) % THEMES.length];
export const XP_PER_LEVEL = (lvl) => 60 + lvl * 50;

export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Procedural dungeon: rooms + corridors on an odd grid. Returns {w,h,cells:string[], rooms, start, stairs}
export function generateDungeon(seed, depth) {
  const rnd = mulberry32(seed * 7919 + depth * 104729);
  const w = MAP_W, h = MAP_H;
  const g = Array.from({ length: h }, () => Array(w).fill('#'));
  const rooms = [];
  const ri = (a, b) => a + Math.floor(rnd() * (b - a + 1));
  for (let tries = 0; tries < 200 && rooms.length < 10 + Math.min(depth, 4); tries++) {
    const rw = ri(2, 4) * 2 + 1, rh = ri(2, 4) * 2 + 1;
    const x = ri(0, (w - rw - 1) / 2) * 2 + 1, y = ri(0, (h - rh - 1) / 2) * 2 + 1;
    if (x + rw >= w || y + rh >= h) continue;
    if (rooms.some((r) => x <= r.x + r.w + 1 && x + rw + 1 >= r.x && y <= r.y + r.h + 1 && y + rh + 1 >= r.y)) continue;
    rooms.push({ x, y, w: rw, h: rh, cx: x + (rw >> 1), cy: y + (rh >> 1) });
    for (let yy = y; yy < y + rh; yy++) for (let xx = x; xx < x + rw; xx++) g[yy][xx] = '.';
  }
  // connect rooms in order of x, plus a few extra loops
  const sorted = [...rooms].sort((a, b) => a.cx - b.cx);
  const carve = (a, b) => {
    let x = a.cx, y = a.cy;
    const horizFirst = rnd() < 0.5;
    const stepX = () => { while (x !== b.cx) { x += Math.sign(b.cx - x); g[y][x] = '.'; } };
    const stepY = () => { while (y !== b.cy) { y += Math.sign(b.cy - y); g[y][x] = '.'; } };
    if (horizFirst) { stepX(); stepY(); } else { stepY(); stepX(); }
  };
  for (let i = 1; i < sorted.length; i++) carve(sorted[i - 1], sorted[i]);
  for (let i = 0; i < 3 && rooms.length > 3; i++) carve(rooms[ri(0, rooms.length - 1)], rooms[ri(0, rooms.length - 1)]);
  const start = sorted[0];
  const end = sorted[sorted.length - 1];
  g[end.cy][end.cx] = '>';
  // decorative pillars in big rooms
  for (const r of rooms) {
    if (r !== start && r !== end && r.w >= 7 && r.h >= 7 && rnd() < 0.6) {
      for (const [px, py] of [[r.x + 1, r.y + 1], [r.x + r.w - 2, r.y + 1], [r.x + 1, r.y + r.h - 2], [r.x + r.w - 2, r.y + r.h - 2]]) g[py][px] = 'P';
    }
  }
  // doors: corridor cells just outside a room, framed by walls on both sides
  const isRoomCell = (x, y) => rooms.some((r) => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h);
  for (const r of rooms) {
    const edge = [];
    for (let x = r.x; x < r.x + r.w; x++) edge.push([x, r.y - 1, 1], [x, r.y + r.h, 1]);
    for (let y = r.y; y < r.y + r.h; y++) edge.push([r.x - 1, y, 0], [r.x + r.w, y, 0]);
    for (const [x, y, horiz] of edge) {
      if (g[y]?.[x] !== '.' || isRoomCell(x, y)) continue;
      const framed = horiz ? g[y][x - 1] === '#' && g[y][x + 1] === '#' : g[y - 1]?.[x] === '#' && g[y + 1]?.[x] === '#';
      if (framed && rnd() < 0.55) g[y][x] = '+';
    }
  }
  // hidden spike traps, never in the start room or on the stairs
  const nearStart = (x, y) => x >= start.x - 1 && x <= start.x + start.w && y >= start.y - 1 && y <= start.y + start.h;
  for (let n = 0, tries = 0; n < 3 + depth && tries < 400; tries++) {
    const x = ri(1, w - 2), y = ri(1, h - 2);
    if (g[y][x] !== '.' || nearStart(x, y)) continue;
    g[y][x] = '^'; n++;
  }
  return { w, h, depth, cells: g.map((row) => row.join('')), rooms, start: { x: start.cx, y: start.cy }, stairs: { x: end.cx, y: end.cy }, startRoom: start, endRoom: end };
}

// '+' closed door, '/' open door, '^' hidden armed trap (sent to clients as '.'), 'x' sprung/disarmed trap
export const isWalkable = (ch) => ch === '.' || ch === '>' || ch === '/' || ch === '^' || ch === 'x';
// ---------- gear ----------
export const RARITY = [
  { name: 'Worn', color: '#c8c8c8', mult: 1 },
  { name: 'Runed', color: '#4aa8ff', mult: 1.6 },
  { name: 'Mythic', color: '#c070ff', mult: 2.4 },
  { name: 'Lantern-Forged', color: '#ffb02e', mult: 3.4 },
];
export const SLOTS = {
  weapon: { icon: '⚔️', label: 'Weapon', bases: ['Blade', 'Maul', 'Staff', 'Bow', 'Dirk', 'Scepter'] },
  armor: { icon: '🛡️', label: 'Armor', bases: ['Mail', 'Brigandine', 'Robes', 'Plate', 'Leathers', 'Cuirass'] },
  charm: { icon: '💍', label: 'Charm', bases: ['Ring', 'Amulet', 'Sigil', 'Talisman', 'Locket', 'Idol'] },
};
const PREFIX = ['Ashen', 'Gloomwrought', 'Moonlit', 'Ember', 'Hollow', 'Starless', 'Thorned', 'Gilded', 'Wailing', 'Duskforged'];
const SUFFIX = ['of the Vault', 'of Embers', 'of the Deep', 'of Whispers', 'of the Lantern', 'of Ruin', 'of Dawn', 'of the Wyrm'];
// rnd: () => [0,1). minRarity lets bosses guarantee good loot.
export function rollGear(depth, rnd = Math.random, minRarity = 0) {
  const slotKeys = Object.keys(SLOTS);
  const slot = slotKeys[Math.floor(rnd() * slotKeys.length)];
  const roll = rnd() + depth * 0.03;
  const rarity = Math.max(minRarity, roll > 1.02 ? 3 : roll > 0.9 ? 2 : roll > 0.62 ? 1 : 0);
  const m = RARITY[rarity].mult * (1 + 0.25 * (depth - 1));
  const pick = (a) => a[Math.floor(rnd() * a.length)];
  const g = { slot, rarity, pow: 0, arm: 0, hp: 0, mp: 0 };
  if (slot === 'weapon') { g.pow = Math.round(6 * m + rnd() * 4 * m); if (rarity >= 2) g.hp = Math.round(5 * m); }
  else if (slot === 'armor') { g.arm = Math.max(1, Math.round(1 * m)); g.hp = Math.round(10 * m + rnd() * 6 * m); }
  else { g.mp = Math.round(10 * m + rnd() * 6 * m); g.pow = Math.round(2 * m); if (rarity >= 1) g.hp = Math.round(4 * m); }
  g.name = `${pick(PREFIX)} ${pick(SLOTS[slot].bases)}${rarity >= 2 ? ' ' + pick(SUFFIX) : ''}`;
  return g;
}
export const gearScore = (g) => (g ? g.pow * 2 + g.arm * 6 + g.hp * 0.5 + g.mp * 0.4 : -1);
export const gearDesc = (g) => [g.pow && `+${g.pow}% dmg`, g.arm && `+${g.arm} armor`, g.hp && `+${g.hp} HP`, g.mp && `+${g.mp} MP`].filter(Boolean).join(' · ');
