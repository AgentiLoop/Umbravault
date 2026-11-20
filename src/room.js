// GameRoom Durable Object — one authoritative dungeon instance for up to 8 players.
import { CLASSES, MONSTERS, DIRS, MAX_PLAYERS, XP_PER_LEVEL, generateDungeon, isWalkable, rollGear, gearScore, RARITY } from '../public/js/data.js';

const TICK_MS = 100;
const MOVE_CD = 140;
const RESPAWN_MS = 8000;
const GRACE_MS = 60000; // a disconnected player's character is kept this long for reconnects
const rint = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
const cheb = (a, b) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));

export class GameRoom {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.code = null;
    this.isPublic = false;
    this.players = new Map();
    this.monsters = [];
    this.items = [];
    this.events = [];
    this.nextId = 1;
    this.seed = Math.floor(Math.random() * 1e9);
    this.timer = null;
    this.startLevel(1);
  }

  // ---------- level setup ----------
  startLevel(depth) {
    this.depth = depth;
    this.map = generateDungeon(this.seed, depth);
    this.grid = this.map.cells.map((r) => r.split(''));
    this.monsters = [];
    this.items = [];
    const n = Math.max(1, this.players.size);
    const hpScale = 1 + 0.18 * (depth - 1) + 0.12 * (n - 1);
    const maxTier = Math.min(3, Math.floor((depth - 1) / 2) + 1);
    const pool = Object.entries(MONSTERS).filter(([, m]) => !m.boss);
    for (const room of this.map.rooms) {
      if (room === this.map.startRoom) continue;
      const count = rint(1, 2) + Math.floor(n / 3) + (depth > 3 ? 1 : 0);
      for (let i = 0; i < count; i++) {
        const tier = Math.max(0, maxTier - rint(0, 2));
        const choices = pool.filter(([, m]) => m.tier === tier || m.tier === tier - 1);
        const [type] = choices[rint(0, choices.length - 1)] || pool[0];
        const spot = this.freeCellIn(room);
        if (spot) this.spawnMonster(type, spot.x, spot.y, hpScale);
      }
      if (Math.random() < 0.35) { const s = this.freeCellIn(room); if (s) this.items.push({ id: this.nextId++, x: s.x, y: s.y, k: Math.random() < 0.5 ? 'potion' : 'gold', a: rint(10, 25) * depth }); }
      if (Math.random() < 0.2) { const s = this.freeCellIn(room); if (s) this.dropGear(s.x, s.y, 0); }
    }
    if (depth % 3 === 0) {
      const r = this.map.endRoom;
      const s = this.freeCellIn(r) || { x: r.cx, y: r.cy - 1 };
      this.spawnMonster('boss', s.x, s.y, 1 + 0.25 * (depth / 3 - 1) + 0.35 * (n - 1));
    }
    for (const p of this.players.values()) this.placeAtStart(p, false);
    for (const p of this.players.values()) p.vote = false;
  }

  freeCellIn(room) {
    for (let t = 0; t < 30; t++) {
      const x = rint(room.x, room.x + room.w - 1), y = rint(room.y, room.y + room.h - 1);
      if (this.grid[y][x] === '.' && !this.monsterAt(x, y)) return { x, y };
    }
    return null;
  }

  spawnMonster(type, x, y, hpScale) {
    const def = MONSTERS[type];
    const hp = Math.round(def.hp * hpScale);
    this.monsters.push({ id: this.nextId++, type, x, y, hp, mhp: hp, f: 2, stun: 0, nextMove: 0, nextAtk: 0, aggro: false });
  }

  placeAtStart(p, full) {
    const s = this.map.start;
    const spots = [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]];
    const used = [...this.players.values()].filter((o) => o !== p).length;
    const [dx, dy] = spots[used % spots.length];
    p.x = s.x + dx; p.y = s.y + dy; p.f = 1;
    if (!isWalkable(this.grid[p.y]?.[p.x])) { p.x = s.x; p.y = s.y; }
    if (full) { p.hp = p.mhp; p.mp = p.mmp; }
  }

  // ---------- connections ----------
  async fetch(req) {
    const url = new URL(req.url);
    this.code = url.searchParams.get('code');
    if (this.players.size === 0 && url.searchParams.get('public') === '1') this.isPublic = true;
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    server.accept();
    let player = null;
    server.addEventListener('message', (e) => {
      let m;
      try { m = JSON.parse(e.data); } catch { return; }
      if (!player) {
        if (m.t === 'join') {
          const token = String(m.token || '').slice(0, 64);
          const prev = token && [...this.players.values()].find((p) => p.token === token);
          if (prev) { player = this.resumePlayer(prev, server); return; }
          if (this.players.size >= MAX_PLAYERS) { this.send(server, { t: 'error', msg: 'Room is full (8/8).' }); server.close(1000); return; }
          player = this.addPlayer(server, m, token);
        }
        return;
      }
      this.handle(player, m);
    });
    const leave = () => {
      if (!player || !this.players.has(player.id) || player.ws !== server) return;
      player.ws = null; player.goneAt = Date.now(); player.vote = false;
      this.log(`${player.name} lost their lantern-link… (60s to return)`, 'death');
    };
    server.addEventListener('close', leave);
    server.addEventListener('error', leave);
    return new Response(null, { status: 101, webSocket: client });
  }

  resumePlayer(p, ws) {
    if (p.ws) try { p.ws.close(1000, 'replaced'); } catch {}
    p.ws = ws; p.goneAt = 0;
    this.send(ws, { t: 'welcome', id: p.id, code: this.code, public: this.isPublic, map: this.mapPayload(), resumed: true });
    this.log(`${p.name} returns to the party.`, 'join');
    return p;
  }
  dropExpired(now) {
    let changed = false;
    for (const p of [...this.players.values()]) if (p.goneAt && now - p.goneAt > GRACE_MS) {
      this.players.delete(p.id); changed = true;
      this.log(`${p.name} has left the vault.`);
    }
    if (changed) this.reportToLobby();
    if (this.players.size === 0 && this.timer) { clearInterval(this.timer); this.timer = null; }
  }
  addPlayer(ws, m, token) {
    const cls = CLASSES[m.cls] ? m.cls : 'vanguard';
    const def = CLASSES[cls];
    let name = String(m.name || '').replace(/[^\w \-']/g, '').trim().slice(0, 16) || 'Wanderer';
    if ([...this.players.values()].some((p) => p.name === name)) name = `${name.slice(0, 13)}#${rint(10, 99)}`;
    const p = {
      id: this.nextId++, ws, token, goneAt: 0, name, cls, x: 0, y: 0, f: 1,
      hp: def.hp, mhp: def.hp, mp: def.mp, mmp: def.mp, armor: def.armor,
      lvl: 1, xp: 0, gold: 0, potions: 2, kills: 0, gear: { weapon: null, armor: null, charm: null },
      cds: [0, 0, 0], might: 0, veil: 0, dead: false, respawnAt: 0, lastMove: 0, lastPotion: 0, vote: false,
    };
    this.players.set(p.id, p);
    this.placeAtStart(p, true);
    this.send(ws, { t: 'welcome', id: p.id, code: this.code, public: this.isPublic, map: this.mapPayload() });
    this.log(`${p.name} the ${def.name} enters the vault.`, 'join');
    if (!this.timer) this.timer = setInterval(() => this.tick(), TICK_MS);
    this.reportToLobby();
    return p;
  }

  mapPayload() { return { w: this.map.w, h: this.map.h, depth: this.depth, cells: this.map.cells, start: this.map.start, stairs: this.map.stairs }; }

  reportToLobby() {
    if (!this.isPublic || !this.env.LOBBY) return;
    const stub = this.env.LOBBY.get(this.env.LOBBY.idFromName('global'));
    this.state.waitUntil?.(stub.fetch('https://lobby/update', { method: 'POST', body: JSON.stringify({ code: this.code, count: this.players.size, depth: this.depth }) }).catch(() => {}));
  }

  send(ws, o) { try { ws.send(JSON.stringify(o)); } catch {} }
  log(text, kind = 'info') { this.events.push({ e: 'log', text, kind }); }
  fx(o) { this.events.push({ e: 'fx', ...o }); }

  // ---------- input ----------
  handle(p, m) {
    const now = Date.now();
    switch (m.t) {
      case 'face':
        if (Number.isInteger(m.f) && m.f >= 0 && m.f < 4) p.f = m.f;
        break;
      case 'move': {
        if (p.dead || now - p.lastMove < MOVE_CD || !Number.isInteger(m.d) || m.d < 0 || m.d > 3) break;
        if (Number.isInteger(m.f) && m.f >= 0 && m.f < 4) p.f = m.f;
        const [dx, dy] = DIRS[m.d];
        const nx = p.x + dx, ny = p.y + dy;
        if (!isWalkable(this.grid[ny]?.[nx]) || this.monsterAt(nx, ny)) { this.send(p.ws, { t: 'bump', x: p.x, y: p.y }); break; }
        p.x = nx; p.y = ny; p.lastMove = now;
        this.pickup(p);
        break;
      }
      case 'act': this.useAbility(p, m.i | 0, now); break;
      case 'potion':
        if (p.dead || p.potions <= 0 || now - p.lastPotion < 1000 || p.hp >= p.mhp) break;
        p.potions--; p.lastPotion = now;
        this.healPlayer(p, Math.round(p.mhp * 0.5));
        this.fx({ k: 'heal', x: p.x, y: p.y });
        break;
      case 'descend': this.voteDescend(p); break;
      case 'chat': {
        const text = String(m.text || '').slice(0, 140).trim();
        if (text) this.events.push({ e: 'chat', from: p.name, cls: p.cls, text });
        break;
      }
    }
  }

  dropGear(x, y, minRarity) {
    const g = rollGear(this.depth, Math.random, minRarity);
    this.items.push({ id: this.nextId++, x, y, k: 'gear', g });
  }
  // auto-equip upgrades; anything weaker is salvaged into gold
  takeGear(p, g) {
    const cur = p.gear[g.slot];
    const r = RARITY[g.rarity].name;
    if (gearScore(g) > gearScore(cur)) {
      if (cur) { p.mhp -= cur.hp; p.mmp -= cur.mp; p.armor -= cur.arm; }
      p.mhp += g.hp; p.mmp += g.mp; p.armor += g.arm;
      p.hp = Math.min(p.mhp, p.hp + g.hp); p.mp = Math.min(p.mmp, p.mp + g.mp);
      p.gear[g.slot] = g;
      const salvage = cur ? Math.round(gearScore(cur) * 2) : 0;
      p.gold += salvage;
      this.log(`${p.name} equips the ${r} ${g.name}!${salvage ? ` (old gear salvaged for ${salvage} gold)` : ''}`, `r${g.rarity}`);
      this.fx({ k: 'equip', x: p.x, y: p.y, pid: p.id, r: g.rarity });
    } else {
      const gold = Math.max(1, Math.round(gearScore(g) * 2));
      p.gold += gold;
      this.log(`${p.name} salvages a ${r} ${g.name} for ${gold} gold.`, 'loot');
    }
  }
  pickup(p) {
    for (const it of this.items.filter((i) => i.x === p.x && i.y === p.y)) {
      if (it.k === 'gold') { p.gold += it.a; this.log(`${p.name} pockets ${it.a} gold.`, 'loot'); }
      else if (it.k === 'gear') this.takeGear(p, it.g);
      else { p.potions++; this.log(`${p.name} finds a Crimson Draught.`, 'loot'); }
      this.fx({ k: 'pickup', x: it.x, y: it.y });
      this.items = this.items.filter((i) => i !== it);
    }
  }

  voteDescend(p) {
    if (p.dead) return;
    if (this.grid[p.y][p.x] !== '>') { this.send(p.ws, { t: 'toast', text: 'Find the glowing stairway to descend.' }); return; }
    if (this.monsters.some((m) => MONSTERS[m.type].boss)) { this.send(p.ws, { t: 'toast', text: 'The Hollow King\'s ward seals the stairway!' }); return; }
    p.vote = true;
    const need = Math.ceil([...this.players.values()].filter((o) => !o.goneAt).length / 2);
    const have = [...this.players.values()].filter((o) => o.vote).length;
    this.log(`${p.name} is ready to descend (${have}/${need}).`, 'vote');
    if (have >= need) {
      this.log(`The party descends to depth ${this.depth + 1}...`, 'level');
      this.startLevel(this.depth + 1);
      for (const o of this.players.values()) { o.hp = Math.min(o.mhp, o.hp + Math.round(o.mhp * 0.3)); o.mp = o.mmp; }
      this.broadcast({ t: 'level', map: this.mapPayload() });
      this.reportToLobby();
    }
  }

  // ---------- combat ----------
  useAbility(p, i, now) {
    if (p.dead) return;
    const ab = CLASSES[p.cls].abilities[i];
    if (!ab || now < p.cds[i] || p.mp < ab.mp) return;
    p.cds[i] = now + ab.cd;
    p.mp -= ab.mp;
    const [fx, fy] = DIRS[p.f];
    const hit = [];
    if (ab.kind === 'melee' || ab.kind === 'cone') {
      const cells = [[p.x + fx, p.y + fy]];
      if (ab.kind === 'cone') cells.push([p.x + fx - fy, p.y + fy + fx], [p.x + fx + fy, p.y + fy - fx]);
      for (const [x, y] of cells) { const mo = this.monsterAt(x, y); if (mo) hit.push(mo); }
      this.fx({ k: 'swing', x: p.x, y: p.y, f: p.f, pid: p.id, ab: ab.id });
    } else if (ab.kind === 'ranged') {
      let x = p.x, y = p.y, tx = x, ty = y;
      for (let s = 0; s < ab.range; s++) {
        const nx = x + fx, ny = y + fy;
        if (!isWalkable(this.grid[ny]?.[nx])) break;
        x = nx; y = ny; tx = x; ty = y;
        const mo = this.monsterAt(x, y);
        if (mo) { hit.push(mo); if (!ab.pierce) break; }
      }
      if (ab.splash && hit.length) for (const mo of this.monsters) if (!hit.includes(mo) && cheb(mo, hit[0]) <= ab.splash) hit.push(mo);
      this.fx({ k: ab.fx || 'bolt', x: p.x, y: p.y, tx, ty, pid: p.id });
    } else if (ab.kind === 'aoe') {
      for (const mo of this.monsters) if (cheb(mo, p) <= ab.radius) hit.push(mo);
      this.fx({ k: ab.fx || 'nova', x: p.x, y: p.y, r: ab.radius });
    } else if (ab.kind === 'heal') {
      for (const o of this.players.values()) if (!o.dead && cheb(o, p) <= ab.radius) { this.healPlayer(o, rint(...ab.heal) + p.lvl * 3); this.fx({ k: 'heal', x: o.x, y: o.y }); }
      this.log(`${p.name} calls down Mending Light.`, 'heal');
    } else if (ab.kind === 'buff') {
      if (ab.buff === 'veil') { p.veil = now + ab.dur; for (const mo of this.monsters) mo.aggro = false; this.fx({ k: 'veil', x: p.x, y: p.y }); }
      else for (const o of this.players.values()) if (!o.dead && cheb(o, p) <= ab.radius) { o.might = now + ab.dur; this.fx({ k: 'might', x: o.x, y: o.y }); }
      this.log(`${p.name} uses ${ab.name}!`, 'ability');
    }
    if (!ab.dmg) return;
    const wasVeiled = p.veil > now;
    for (const mo of hit) {
      const def = MONSTERS[mo.type];
      let dmg = rint(...ab.dmg) * (1 + 0.12 * (p.lvl - 1)) * (1 + this.gearPow(p) / 100);
      if (p.might > now) dmg *= 1.4;
      if (ab.holy && def.undead) dmg *= ab.holy;
      const crit = (ab.crit && wasVeiled) || Math.random() < (ab.crit || 0.1);
      if (crit) dmg *= 1.75;
      dmg = Math.round(dmg);
      mo.hp -= dmg;
      mo.aggro = true;
      if (ab.stun) mo.stun = now + ab.stun;
      this.fx({ k: 'dmg', x: mo.x, y: mo.y, v: dmg, crit, mid: mo.id });
      if (mo.hp <= 0) this.killMonster(mo, p);
    }
    if (hit.length) p.veil = 0;
  }

  gearPow(p) { return Object.values(p.gear).reduce((s, g) => s + (g ? g.pow : 0), 0); }

  healPlayer(p, amt) {
    const before = p.hp;
    p.hp = Math.min(p.mhp, p.hp + amt);
    if (p.hp > before) this.fx({ k: 'num', x: p.x, y: p.y, v: p.hp - before, heal: true });
  }

  killMonster(mo, killer) {
    const def = MONSTERS[mo.type];
    this.monsters = this.monsters.filter((m) => m !== mo);
    killer.kills++;
    this.fx({ k: 'death', x: mo.x, y: mo.y, mid: mo.id });
    this.log(`${killer.name} slays the ${def.name}!`, def.boss ? 'boss' : 'kill');
    const xp = Math.round(def.xp * (1 + 0.1 * (this.depth - 1)));
    for (const p of this.players.values()) this.gainXp(p, xp);
    const r = Math.random();
    if (def.boss) {
      this.items.push({ id: this.nextId++, x: mo.x, y: mo.y, k: 'gold', a: 300 * this.depth });
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1]]) if (isWalkable(this.grid[mo.y + dy]?.[mo.x + dx])) this.dropGear(mo.x + dx, mo.y + dy, 2);
      this.log('The Hollow King crumbles. The stairway ward is broken!', 'boss');
    } else if (r < 0.35) this.items.push({ id: this.nextId++, x: mo.x, y: mo.y, k: 'gold', a: rint(4, 12) * this.depth });
    else if (r < 0.5) this.items.push({ id: this.nextId++, x: mo.x, y: mo.y, k: 'potion', a: 1 });
    else if (r < 0.62 + def.tier * 0.04) this.dropGear(mo.x, mo.y, 0);
  }

  gainXp(p, xp) {
    p.xp += xp;
    while (p.xp >= XP_PER_LEVEL(p.lvl)) {
      p.xp -= XP_PER_LEVEL(p.lvl);
      p.lvl++;
      const def = CLASSES[p.cls];
      p.mhp += def.hpPerLvl; p.mmp += def.mpPerLvl;
      p.hp = p.mhp; p.mp = p.mmp;
      this.log(`${p.name} reaches level ${p.lvl}!`, 'levelup');
      this.fx({ k: 'levelup', x: p.x, y: p.y, pid: p.id });
    }
  }

  monsterAt(x, y) { return this.monsters.find((m) => m.x === x && m.y === y); }

  lineClear(a, b) {
    let x0 = a.x, y0 = a.y;
    const dx = Math.abs(b.x - x0), dy = -Math.abs(b.y - y0), sx = x0 < b.x ? 1 : -1, sy = y0 < b.y ? 1 : -1;
    let err = dx + dy;
    while (!(x0 === b.x && y0 === b.y)) {
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x0 += sx; }
      if (e2 <= dx) { err += dx; y0 += sy; }
      if (x0 === b.x && y0 === b.y) break;
      const c = this.grid[y0]?.[x0];
      if (c === '#' || c === 'P') return false;
    }
    return true;
  }

  // multi-source BFS distance from every visible, living player
  distanceField(targets) {
    const { w, h } = this.map;
    const dist = new Int16Array(w * h).fill(-1);
    const q = [];
    for (const p of targets) { dist[p.y * w + p.x] = 0; q.push(p.y * w + p.x); }
    for (let qi = 0; qi < q.length; qi++) {
      const c = q[qi], cx = c % w, cy = (c / w) | 0, d = dist[c];
      if (d > 20) continue;
      for (const [dx, dy] of DIRS) {
        const nx = cx + dx, ny = cy + dy, ni = ny * w + nx;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h || dist[ni] !== -1 || !isWalkable(this.grid[ny][nx])) continue;
        dist[ni] = d + 1; q.push(ni);
      }
    }
    return dist;
  }

  tick() {
    const now = Date.now();
    this.dropExpired(now);
    const players = [...this.players.values()];
    // regen + respawn
    if (!this.lastRegen || now - this.lastRegen > 1000) {
      this.lastRegen = now;
      for (const p of players) if (!p.dead) { p.mp = Math.min(p.mmp, p.mp + 2 + Math.floor(p.mmp / 50)); if (p.hp < p.mhp) p.hp = Math.min(p.mhp, p.hp + 1); }
    }
    for (const p of players) if (p.dead && now >= p.respawnAt) {
      p.dead = false; this.placeAtStart(p, false); p.hp = Math.round(p.mhp * 0.6); p.mp = Math.round(p.mmp * 0.5);
      this.log(`${p.name} is drawn back from the Veil.`, 'respawn');
    }
    // monster AI
    const targets = players.filter((p) => !p.dead && !p.goneAt && p.veil <= now);
    const dist = targets.length ? this.distanceField(targets) : null;
    const w = this.map.w;
    for (const mo of this.monsters) {
      if (!dist || mo.stun > now) continue;
      const def = MONSTERS[mo.type];
      let nearest = null, nd = 1e9;
      for (const p of targets) { const d = Math.abs(p.x - mo.x) + Math.abs(p.y - mo.y); if (d < nd) { nd = d; nearest = p; } }
      if (!nearest) continue;
      if (!mo.aggro && nd <= 7 && this.lineClear(mo, nearest)) { mo.aggro = true; if (def.boss) this.log('The Hollow King rises from his throne!', 'boss'); }
      if (!mo.aggro) continue;
      if (nd > 18) { mo.aggro = false; continue; }
      const adjacent = nd === 1;
      const inRange = def.range && (mo.x === nearest.x || mo.y === nearest.y) && nd <= def.range && this.lineClear(mo, nearest);
      if ((adjacent || inRange) && now >= mo.nextAtk) {
        mo.nextAtk = now + def.atkCd;
        mo.f = DIRS.findIndex(([dx, dy]) => dx === Math.sign(nearest.x - mo.x) && dy === Math.sign(nearest.y - mo.y));
        const dmg = Math.max(1, Math.round(rint(...def.dmg) * (1 + 0.1 * (this.depth - 1))) - nearest.armor);
        nearest.hp -= dmg;
        this.fx({ k: adjacent ? 'claw' : 'mbolt', x: mo.x, y: mo.y, tx: nearest.x, ty: nearest.y, mid: mo.id });
        this.fx({ k: 'num', x: nearest.x, y: nearest.y, v: dmg, pid: nearest.id });
        if (nearest.hp <= 0) {
          nearest.hp = 0; nearest.dead = true; nearest.respawnAt = now + RESPAWN_MS; nearest.vote = false;
          const lost = Math.floor(nearest.gold * 0.1); nearest.gold -= lost;
          this.log(`${nearest.name} was slain by a ${def.name}!${lost ? ` (${lost} gold lost)` : ''}`, 'death');
          this.fx({ k: 'pdeath', x: nearest.x, y: nearest.y, pid: nearest.id });
        }
        continue;
      }
      if (adjacent || now < mo.nextMove) continue;
      mo.nextMove = now + def.speed;
      const here = dist[mo.y * w + mo.x];
      let best = null, bestD = here === -1 ? 1e9 : here;
      for (let d = 0; d < 4; d++) {
        const [dx, dy] = DIRS[d];
        const nx = mo.x + dx, ny = mo.y + dy, nd2 = dist[ny * w + nx];
        if (nd2 < 0 || nd2 >= bestD || nd2 === 0 || this.monsterAt(nx, ny)) continue;
        bestD = nd2; best = d;
      }
      if (best !== null) { mo.x += DIRS[best][0]; mo.y += DIRS[best][1]; mo.f = best; }
    }
    this.broadcastState(now);
  }

  broadcastState(now) {
    const msg = {
      t: 's', depth: this.depth,
      p: [...this.players.values()].map((p) => ({
        id: p.id, n: p.name, c: p.cls, x: p.x, y: p.y, f: p.f, hp: p.hp, mhp: p.mhp, mp: p.mp, mmp: p.mmp,
        l: p.lvl, xp: p.xp, nx: XP_PER_LEVEL(p.lvl), g: p.gold, po: p.potions, k: p.kills, ar: p.armor, ge: [p.gear.weapon, p.gear.armor, p.gear.charm], d: p.dead ? Math.max(0, p.respawnAt - now) : 0,
        mi: Math.max(0, p.might - now), ve: Math.max(0, p.veil - now), cd: p.cds.map((c) => Math.max(0, c - now)), v: p.vote, o: p.goneAt ? 1 : 0,
      })),
      m: this.monsters.map((m) => ({ id: m.id, t: m.type, x: m.x, y: m.y, f: m.f, hp: m.hp, mhp: m.mhp, s: m.stun > now ? 1 : 0, a: m.aggro ? 1 : 0 })),
      i: this.items.map((i) => ({ id: i.id, x: i.x, y: i.y, k: i.k, ...(i.g ? { r: i.g.rarity, s: i.g.slot } : {}) })),
      ev: this.events,
    };
    this.events = [];
    this.broadcast(msg);
  }

  broadcast(o) {
    const s = JSON.stringify(o);
    for (const p of this.players.values()) { try { p.ws?.send(s); } catch {} }
  }
}
