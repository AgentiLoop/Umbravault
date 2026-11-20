// Umbravault client: title screen, matchmaking, networking, input, HUD.
import { CLASSES, MONSTERS, DIRS, isWalkable, RARITY, SLOTS, gearDesc, AFFIXES, eliteName, SHOP, MERCHANT_RANGE, EMOTES, themeForDepth, bossForDepth } from './data.js';
import { Renderer } from './render.js';
import { Sound } from './audio.js';

const $ = (s) => document.querySelector(s);
const wsBase = `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}`;
const COMPASS = ['N', 'E', 'S', 'W'];
// per-tab identity so a dropped connection or page reload resumes the same character
const TOKEN = sessionStorage.getItem('uv.token') || (crypto.randomUUID?.() || String(Math.random()).slice(2) + Date.now());
sessionStorage.setItem('uv.token', TOKEN);
// persistent hero key (per browser) — saved characters are stored server-side under this key, one per class
const HERO = localStorage.getItem('uv.hero') || (crypto.randomUUID?.() || `${Date.now()}-${String(Math.random()).slice(2)}`);
localStorage.setItem('uv.hero', HERO);
let heroes = {};
fetch(`/api/heroes?key=${encodeURIComponent(HERO)}`).then((r) => r.json()).then((h) => { heroes = h || {}; drawClasses(); }).catch(() => {});

const S = {
  name: localStorage.getItem('uv.name') || '',
  cls: localStorage.getItem('uv.cls') || 'vanguard',
  ws: null, qws: null, id: null, code: null, map: null,
  me: { x: 0, y: 0, f: 1 }, players: [], monsters: [], items: [],
  lastLocalMove: 0, explored: null, lastHp: null, pings: [],
};
const renderer = new Renderer($('#view'));
const sfx = new Sound();
for (const ev of ['pointerdown', 'keydown']) addEventListener(ev, () => sfx.unlock(), { capture: true });
const muteLabel = () => ($('#mute').textContent = sfx.muted ? '🔇' : '🔊');

// ---------- title screen ----------
$('#name').value = S.name;
function drawClasses() {
  $('#classes').innerHTML = Object.entries(CLASSES).map(([k, c]) => `
    <div class="cls ${k === S.cls ? 'sel' : ''}" data-k="${k}" style="--c:${c.color}">
      <div class="ic">${c.icon}</div><div class="nm">${c.name}</div>
      <div class="st">❤️ ${c.hp} · 🔷 ${c.mp}</div>
      ${heroes[k] ? `<div class="saved">⭐ Lv ${heroes[k].lvl} · 💰 ${heroes[k].gold}</div>` : ''}
    </div>`).join('');
  const c = CLASSES[S.cls];
  $('#class-detail').innerHTML = `<b style="color:${c.color}">${c.name}</b> — ${c.desc}<br>` +
    c.abilities.map((a, i) => `<span class="ab" title="${a.desc}">${a.icon} <b>${a.name}</b> <small>[${i === 0 ? 'Space' : i}] ${a.mp ? a.mp + ' MP' : ''}</small> — ${a.desc}</span>`).join('');
  document.querySelectorAll('.cls').forEach((el) => el.onclick = () => { S.cls = el.dataset.k; localStorage.setItem('uv.cls', S.cls); drawClasses(); });
}
drawClasses();

function readName() {
  S.name = $('#name').value.trim().slice(0, 16) || `Wanderer${Math.floor(Math.random() * 90 + 10)}`;
  localStorage.setItem('uv.name', S.name);
}

async function refreshRooms() {
  if (!$('#title').classList.contains('hidden')) {
    try {
      const r = await (await fetch('/api/rooms')).json();
      $('#open-rooms').innerHTML = (r.rooms.length ? '<div class="label" style="margin:0">Open expeditions</div>' : '') +
        r.rooms.map((x) => `<span class="room" data-code="${x.code}">🏰 <b>${x.code}</b> · ${x.count}/8 · depth ${x.depth}</span>`).join('') +
        (r.waiting ? `<div style="margin-top:6px;opacity:.7">${r.waiting} wanderer(s) in the quick-match queue</div>` : '');
      document.querySelectorAll('.open-rooms .room').forEach((el) => el.onclick = () => { readName(); connectRoom(el.dataset.code, true); });
    } catch {}
  }
  setTimeout(refreshRooms, 5000);
}
refreshRooms();

const urlRoom = new URLSearchParams(location.search).get('room');
if (urlRoom) $('#code').value = urlRoom.toUpperCase();
// reload while in a room → rejoin it with the same character
if (urlRoom && sessionStorage.getItem('uv.room') === urlRoom.toUpperCase() && S.name) connectRoom(urlRoom.toUpperCase(), sessionStorage.getItem('uv.pub') === '1');

$('#btn-quick').onclick = () => { readName(); quickMatch(); };
$('#btn-create').onclick = async () => {
  readName();
  const { code } = await (await fetch('/api/create')).json();
  connectRoom(code, false);
};
$('#btn-join').onclick = () => { readName(); const c = $('#code').value.trim().toUpperCase(); if (c.length >= 4) connectRoom(c, false); };
$('#code').onkeydown = (e) => { if (e.key === 'Enter') $('#btn-join').click(); };
$('#btn-cancel').onclick = () => { S.qws?.close(); showScreen('title'); };
function leaveRoom() { const ws = S.ws; S.ws = null; sessionStorage.removeItem('uv.room'); ws?.close(); S.map = null; S.demo = false; showScreen('title'); history.replaceState(null, '', '/'); }

function showScreen(which) {
  $('#title').classList.toggle('hidden', which !== 'title');
  $('#matching').classList.toggle('hidden', which !== 'matching');
  $('#hud').classList.toggle('hidden', which !== 'game');
}

function quickMatch() {
  showScreen('matching');
  $('#match-status').textContent = 'Joining the queue…';
  $('#match-names').textContent = '';
  const ws = new WebSocket(`${wsBase}/api/quickmatch`);
  S.qws = ws;
  ws.onopen = () => ws.send(JSON.stringify({ t: 'hello', name: S.name, cls: S.cls }));
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.t === 'queue') {
      $('#match-status').textContent = `${m.waiting} wanderer${m.waiting === 1 ? '' : 's'} waiting at the gate`;
      $('#match-names').textContent = m.names.join(' · ');
    } else if (m.t === 'matched') {
      S.qws = null;
      connectRoom(m.code, true);
    }
  };
  ws.onerror = () => { $('#match-status').textContent = 'Could not reach the matchmaker.'; };
}

// ---------- room connection ----------
function connectRoom(code, isPublic, attempt = 0) {
  if (attempt === 0) { const old = S.ws; S.ws = null; old?.close(); }
  const ws = new WebSocket(`${wsBase}/ws/${code}${isPublic ? '?public=1' : ''}`);
  S.ws = ws; S.code = code;
  sessionStorage.setItem('uv.room', code); sessionStorage.setItem('uv.pub', isPublic ? '1' : '0');
  ws.onopen = () => ws.send(JSON.stringify({ t: 'join', name: S.name, cls: S.cls, token: TOKEN, hero: HERO }));
  ws.onmessage = (e) => { if (S.ws === ws) onMsg(JSON.parse(e.data), ws); };
  ws.onclose = (e) => {
    if (S.ws !== ws) return;
    if (e.code === 1000 && e.reason === 'replaced') { S.ws = null; toast('Opened in another tab.'); return; }
    // auto-reconnect with backoff; the server keeps our character for 60s
    if (ws.ok) attempt = 0;
    if (attempt < 12 && !ws.fatal) {
      toast(`Lantern-link lost — reconnecting… (${attempt + 1})`, 2500);
      setTimeout(() => { if (S.ws === ws) connectRoom(code, isPublic, attempt + 1); }, Math.min(5000, 500 * 2 ** attempt));
    } else { toast('Connection to the vault lost.'); setTimeout(() => { if (S.ws === ws) leaveRoom(); }, 1500); }
  };
}
const send = (o) => { if (S.ws?.readyState === 1) S.ws.send(JSON.stringify(o)); };

function loadMap(map) {
  S.map = map;
  S.explored = new Uint8Array(map.w * map.h);
  renderer.buildLevel(map);
}

function onMsg(m, ws) {
  switch (m.t) {
    case 'welcome':
      if (ws) ws.ok = true;
      S.id = m.id; S.code = m.code;
      loadMap(m.map);
      history.replaceState(null, '', `?room=${m.code}`);
      $('#room-code').textContent = `🔗 ${m.code}${m.public ? ' · public' : ' · private'}`;
      showScreen('game');
      S.first = true;
      toast(m.resumed ? 'Reconnected — welcome back!' : `Depth ${m.map.depth} · ${themeForDepth(m.map.depth).name}`);
      break;
    case 'level':
      loadMap(m.map);
      S.first = true;
      sfx.descend();
      toast(`Depth ${m.map.depth} · ${themeForDepth(m.map.depth).name}${m.map.depth % 3 === 0 ? `<br><small>${MONSTERS[bossForDepth(m.map.depth)].name} awaits…</small>` : ''}`, 3000);
      break;
    case 'bump': S.me.x = m.x; S.me.y = m.y; renderer.setCamera(m.x, m.y, S.me.f); renderer.shake(0.03); sfx.bump(); break;
    case 'toast': toast(m.text); break;
    case 'error': if (ws) ws.fatal = true; toast(m.msg); break;
    case 's': onState(m); break;
  }
}

function onState(m) {
  S.players = m.p; S.monsters = m.m; S.items = m.i;
  const me = m.p.find((p) => p.id === S.id);
  if (me) {
    // accept server position when we haven't moved locally recently (prediction reconciliation)
    if (S.first || Date.now() - S.lastLocalMove > 350 || me.d) {
      if (S.first || me.x !== S.me.x || me.y !== S.me.y) { S.me.x = me.x; S.me.y = me.y; if (S.first) S.me.f = me.f; renderer.setCamera(me.x, me.y, S.me.f, S.first); }
      S.first = false;
    }
    if (S.lastHp !== null && me.hp < S.lastHp) { $('#hurt').style.opacity = 1; setTimeout(() => ($('#hurt').style.opacity = 0), 250); }
    S.lastHp = me.hp;
    S.self = me;
  }
  renderer.syncMonsters(m.m);
  renderer.syncPlayers(m.p, S.id);
  renderer.syncItems(m.i);
  for (const ev of m.ev) {
    if (ev.e === 'fx') {
      renderer.playFx(ev, S.id);
      const dist = Math.max(Math.abs(ev.x - S.me.x), Math.abs(ev.y - S.me.y));
      if (dist <= 10) sfx.play({ ...ev, near: dist <= 5 }, S.id);
    } else if (ev.e === 'cell') {
      const row = S.map.cells[ev.y];
      S.map.cells[ev.y] = row.slice(0, ev.x) + ev.c + row.slice(ev.x + 1);
      renderer.setCell(ev.x, ev.y, ev.c);
    } else if (ev.e === 'log') { addLog(ev.text, ev.kind); if (ev.kind === 'boss' && ev.text.includes('awakens')) sfx.bossRoar(); }
    else if (ev.e === 'chat') {
      sfx.chat();
      addLog(`<b style="--c:${CLASSES[ev.cls]?.color}">${esc(ev.from)}:</b> ${esc(ev.text)}`, 'chat', true);
      if (ev.pid !== S.id) renderer.say(ev.pid, ev.text); else toast(esc(ev.text), 1200);
      if (ev.emote !== undefined) S.pings.push({ x: ev.x, y: ev.y, color: CLASSES[ev.cls]?.color || '#fff', until: performance.now() + 3000 });
    }
    if (ev.e === 'fx' && ev.k === 'levelup' && ev.pid === S.id) toast('Level up!');
  }
  updateHud(m.depth);
}

// ---------- input ----------
const held = new Set();
let nextRepeat = 0;
function tryMove(rel) {
  if (!S.map || S.self?.d) return;
  const d = (S.me.f + rel) % 4;
  const [dx, dy] = DIRS[d];
  const nx = S.me.x + dx, ny = S.me.y + dy;
  if (S.map.cells[ny]?.[nx] === '+') { send({ t: 'move', d, f: S.me.f }); return; }
  if (!isWalkable(S.map.cells[ny]?.[nx]) || S.monsters.some((mo) => mo.x === nx && mo.y === ny)) { renderer.shake(0.025); sfx.bump(); return; }
  sfx.step();
  S.me.x = nx; S.me.y = ny; S.lastLocalMove = Date.now();
  renderer.setCamera(nx, ny, S.me.f);
  send({ t: 'move', d, f: S.me.f });
}
function turn(dir) {
  S.me.f = (S.me.f + dir + 4) % 4;
  renderer.setCamera(S.me.x, S.me.y, S.me.f);
  sfx.turn();
  send({ t: 'face', f: S.me.f });
}
const ACTIONS = {
  fwd: () => tryMove(0), back: () => tryMove(2), strafeL: () => tryMove(3), strafeR: () => tryMove(1),
  turnL: () => turn(-1), turnR: () => turn(1),
};
const KEYMAP = { KeyW: 'fwd', ArrowUp: 'fwd', KeyS: 'back', ArrowDown: 'back', KeyA: 'turnL', ArrowLeft: 'turnL', KeyD: 'turnR', ArrowRight: 'turnR', KeyQ: 'strafeL', KeyE: 'strafeR' };

addEventListener('keydown', (e) => {
  if ($('#hud').classList.contains('hidden')) return;
  const chat = $('#chat');
  if (document.activeElement === chat) {
    if (e.key === 'Enter') { if (chat.value.trim()) send({ t: 'chat', text: chat.value }); chat.value = ''; chat.classList.add('hidden'); chat.blur(); }
    else if (e.key === 'Escape') { chat.value = ''; chat.classList.add('hidden'); chat.blur(); }
    return;
  }
  if (e.key === 'Enter') { chat.classList.remove('hidden'); chat.focus(); e.preventDefault(); return; }
  const a = KEYMAP[e.code];
  if (a) {
    e.preventDefault();
    if (!e.repeat) { ACTIONS[a](); held.add(a); nextRepeat = performance.now() + 260; }
    return;
  }
  if (e.repeat) return;
  if (e.code === 'Space') { e.preventDefault(); send({ t: 'act', i: 0 }); }
  else if (e.code === 'Digit1') send({ t: 'act', i: 1 });
  else if (e.code === 'Digit2') send({ t: 'act', i: 2 });
  else if (e.code === 'KeyH' || e.code === 'Digit3') send({ t: 'potion' });
  else if (e.code === 'KeyG') send({ t: 'descend' });
  else if (e.code === 'KeyR') send({ t: 'revive' });
  else if (e.code === 'KeyB') toggleShop();
  else if (/^Digit[5-9]$/.test(e.code)) send({ t: 'emote', i: +e.code.slice(5) - 5 });
  else if (e.code === 'Escape') toggleShop(false);
  else if (e.code === 'KeyM') { sfx.toggleMute(); muteLabel(); }
});
addEventListener('keyup', (e) => { const a = KEYMAP[e.code]; if (a) held.delete(a); });
addEventListener('blur', () => held.clear());
document.querySelectorAll('#touch button').forEach((b) => {
  if (b.dataset.cmd) { b.addEventListener('pointerdown', (e) => { e.preventDefault(); if (b.dataset.cmd === 'shop') toggleShop(); else send({ t: b.dataset.cmd }); }); return; }
  b.addEventListener('pointerdown', (e) => { e.preventDefault(); ACTIONS[b.dataset.k](); held.add(b.dataset.k); nextRepeat = performance.now() + 260; });
  b.addEventListener('pointerup', () => held.delete(b.dataset.k));
  b.addEventListener('pointerleave', () => held.delete(b.dataset.k));
});
$('#mute').onclick = () => { sfx.unlock(); sfx.toggleMute(); muteLabel(); };
muteLabel();
$('#room-code').onclick = () => {
  navigator.clipboard?.writeText(`${location.origin}/?room=${S.code}`);
  toast('Invite link copied!');
};

// ---------- HUD ----------
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
function addLog(html, kind, raw = false) {
  const d = document.createElement('div');
  d.className = kind || '';
  d.innerHTML = raw ? html : esc(html);
  $('#log').appendChild(d);
  while ($('#log').children.length > 12) $('#log').firstChild.remove();
}
let toastTimer;
function toast(html, ms = 1800) {
  const t = $('#toast'); t.innerHTML = html; t.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), ms);
}

function buildAbilities() {
  const c = CLASSES[S.self.c];
  $('#abilities').innerHTML = c.abilities.map((a, i) => `<div class="ab" data-i="${i}" title="${a.name} — ${a.desc}"><span class="key">${i === 0 ? '␣' : i}</span>${a.icon}<span class="mp">${a.mp || ''}</span><div class="cd"></div></div>`).join('') +
    `<div class="gear-sep"></div>` + Object.values(SLOTS).map((sl, i) => `<div class="ab gear" data-g="${i}"><span class="key">${sl.label}</span><span class="gi">${sl.icon}</span></div>`).join('') +
    `<div class="ab" data-potion="1" title="Crimson Draught — restore 50% HP"><span class="key">H</span>🧪<span class="mp" id="po"></span></div>`;
  document.querySelectorAll('#abilities .ab:not(.gear)').forEach((el) => el.onclick = () => el.dataset.potion ? send({ t: 'potion' }) : send({ t: 'act', i: +el.dataset.i }));
  S.abBuilt = S.self.c;
}

const nearMerchant = () => S.map?.start && Math.max(Math.abs(S.me.x - S.map.start.x), Math.abs(S.me.y - S.map.start.y)) <= MERCHANT_RANGE;
function toggleShop(force) {
  const open = force ?? $('#shop').classList.contains('hidden');
  if (open && !nearMerchant()) { toast('The Lantern Merchant waits at the entry hall.'); return; }
  $('#shop').classList.toggle('hidden', !open);
  if (open) drawShop();
}
function drawShop() {
  const d = S.map.depth, gold = S.self?.g ?? 0;
  $('#shop-items').innerHTML = SHOP.map((it) => {
    const price = it.price(d);
    return `<button class="shop-item ${gold < price ? 'poor' : ''}" data-id="${it.id}"><span class="si">${it.icon}</span><span><b>${it.name}</b><br><small>${it.desc}</small></span><span class="sp">💰 ${price}</span></button>`;
  }).join('');
  $('#shop-gold').textContent = `💰 ${gold}`;
  document.querySelectorAll('.shop-item').forEach((b) => b.onclick = () => send({ t: 'buy', item: b.dataset.id }));
}
$('#shop-close').onclick = () => toggleShop(false);
$('#emotes').innerHTML = EMOTES.map((em, i) => `<button data-i="${i}" title="${em.text} (${i + 5})">${em.icon}</button>`).join('');
document.querySelectorAll('#emotes button').forEach((b) => b.onclick = () => send({ t: 'emote', i: +b.dataset.i }));
function updateHud(depth) {
  const me = S.self;
  if (!me) return;
  if (S.abBuilt !== me.c) buildAbilities();
  $('#depth').textContent = `Depth ${depth} · ${themeForDepth(depth).name}`;
  $('#compass').textContent = COMPASS[S.me.f];
  const setBar = (sel, v, max, txt) => { $(`${sel} > div`).style.width = `${(100 * v) / max}%`; $(`${sel} span`).textContent = txt; };
  setBar('.bar.hp', me.hp, me.mhp, `${me.hp} / ${me.mhp}`);
  setBar('.bar.mp', me.mp, me.mmp, `${me.mp} / ${me.mmp}`);
  setBar('.bar.xp', me.xp, me.nx, '');
  const c = CLASSES[me.c];
  document.querySelectorAll('#abilities .ab[data-i]').forEach((el) => {
    const i = +el.dataset.i, a = c.abilities[i];
    el.querySelector('.cd').style.setProperty('--p', `${(100 * me.cd[i]) / a.cd}%`);
    el.classList.toggle('nomp', me.mp < a.mp);
  });
  const po = $('#po'); if (po) po.textContent = me.po;
  const gearKey = JSON.stringify(me.ge);
  if (S.gearKey !== gearKey) {
    S.gearKey = gearKey;
    document.querySelectorAll('#abilities .ab.gear').forEach((el) => {
      const g = me.ge[+el.dataset.g], sl = Object.values(SLOTS)[+el.dataset.g];
      el.style.borderColor = g ? RARITY[g.rarity].color : '';
      el.style.boxShadow = g ? `0 0 ${6 + g.rarity * 5}px ${RARITY[g.rarity].color}` : '';
      el.querySelector('.gi').style.opacity = g ? 1 : 0.25;
      el.title = g ? `${RARITY[g.rarity].name} ${g.name}\n${gearDesc(g)}` : `${sl.label}: empty — monsters and chests drop gear`;
    });
  }
  $('#stats').innerHTML = `<b style="color:${c.color}">${c.icon} Lv ${me.l}</b><br>💰 ${me.g} · 🛡️ ${me.ar}<br>☠️ ${me.k} kills`;
  $('#party').innerHTML = S.players.map((p) => {
    const pc = CLASSES[p.c];
    const buffs = (p.o ? '📡' : '') + (p.mi ? '📯' : '') + (p.ve ? '🌑' : '') + (p.v ? '⬇️' : '');
    return `<div class="pf ${p.id === S.id ? 'self' : ''} ${p.d || p.o ? 'dead' : ''}" style="--c:${pc.color}">
      <div class="row"><span class="nm">${pc.icon} ${esc(p.n)}</span><span>Lv ${p.l} <span class="buffs">${buffs}</span></span></div>
      <div class="mini"><div style="width:${(100 * p.hp) / p.mhp}%;background:linear-gradient(90deg,#a11,#e44)"></div></div>
      <div class="mini"><div style="width:${(100 * p.mp) / p.mmp}%;background:linear-gradient(90deg,#227,#58f)"></div></div>
    </div>`;
  }).join('');
  $('#dead').classList.toggle('hidden', !me.d);
  if (me.d) {
    $('#dead-t').textContent = Math.ceil(me.d / 1000);
    const saver = S.players.find((p) => p.rt === me.id);
    $('#dead-help').textContent = saver ? `${saver.n} is reviving you… ${Math.round(saver.rv * 100)}%` : 'An ally can revive you sooner (R).';
  }
  // revive channel bar + hint when standing beside a fallen ally
  $('#channel').classList.toggle('hidden', !me.rv);
  if (me.rv) { const t = S.players.find((p) => p.id === me.rt); $('#channel div').style.width = `${me.rv * 100}%`; $('#channel span').textContent = `Reviving ${t ? t.n : ''}…`; }
  const fallen = !me.d && S.players.find((p) => p.id !== S.id && p.d && !p.o && Math.max(Math.abs(p.x - S.me.x), Math.abs(p.y - S.me.y)) <= 1);
  if (fallen && S.reviveHint !== fallen.id && !me.rv) toast(`Press <b>R</b> to revive ${esc(fallen.n)}`);
  S.reviveHint = fallen ? fallen.id : 0;
  const near = nearMerchant();
  if (!$('#shop').classList.contains('hidden')) { if (!near) toggleShop(false); else if (S.shopGold !== me.g) { S.shopGold = me.g; drawShop(); } }
  if (near && !S.merchantHint) toast('Press <b>B</b> to trade with the Lantern Merchant');
  S.merchantHint = near;
  // target frame: monster directly ahead (up to 8 cells in line)
  const [dx, dy] = DIRS[S.me.f];
  let tgt = null;
  for (let s = 1, x = S.me.x, y = S.me.y; s <= 8; s++) {
    x += dx; y += dy;
    if (!isWalkable(S.map.cells[y]?.[x])) break;
    tgt = S.monsters.find((mo) => mo.x === x && mo.y === y);
    if (tgt) break;
  }
  // boss bar: shown to the whole party once a boss is awake
  const boss = S.monsters.find((mo) => MONSTERS[mo.t].boss && mo.a);
  $('#bossbar').classList.toggle('hidden', !boss);
  if (boss) { const bd = MONSTERS[boss.t]; $('#bossbar b').textContent = `${bd.icon} ${bd.name}`; $('#bossbar .fill').style.width = `${(100 * boss.hp) / boss.mhp}%`; $('#bossbar span').textContent = `${boss.hp} / ${boss.mhp}`; }
  const tf = $('#target');
  tf.classList.toggle('hidden', !tgt);
  if (tgt) { const d = MONSTERS[tgt.t]; const af = tgt.e ? AFFIXES[tgt.e] : null; tf.innerHTML = `${d.icon} <span style="color:${af ? af.color : 'inherit'}">${eliteName(tgt, d)}</span>${tgt.s ? ' ❄️' : ''}${af ? `<div style="font-size:11px;opacity:.8">${af.icon} Elite — ${af.desc}</div>` : ''}<div class="mini"><div style="width:${(100 * tgt.hp) / tgt.mhp}%"></div></div>`; }
  if (S.map.cells[S.me.y]?.[S.me.x] === '>' && !S.onStairsHint) { toast('Press <b>G</b> to vote to descend'); S.onStairsHint = true; }
  if (S.map.cells[S.me.y]?.[S.me.x] !== '>') S.onStairsHint = false;
}

function drawMinimap() {
  if (!S.map) return;
  const cv = $('#minimap'), ctx = cv.getContext('2d');
  const { w, h, cells } = S.map;
  const sz = Math.floor(cv.width / Math.max(w, h));
  // reveal within radius 4 of self
  for (let y = S.me.y - 4; y <= S.me.y + 4; y++) for (let x = S.me.x - 4; x <= S.me.x + 4; x++) if (x >= 0 && y >= 0 && x < w && y < h) S.explored[y * w + x] = 1;
  ctx.fillStyle = '#07050a'; ctx.fillRect(0, 0, cv.width, cv.height);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (!S.explored[y * w + x]) continue;
    const c = cells[y][x];
    ctx.fillStyle = c === '#' ? '#3a3040' : c === 'P' ? '#5a4a60' : c === '+' ? '#8a5a2a' : c === '/' ? '#4a3220' : c === 'x' ? '#7a2020' : c === '>' ? '#55ccff' : '#1d1822';
    ctx.fillRect(x * sz, y * sz, sz, sz);
  }
  for (const it of S.items) if (S.explored[it.y * w + it.x]) { ctx.fillStyle = it.k === 'gold' ? '#ffcc33' : it.k === 'gear' ? RARITY[it.r].color : '#ff3355'; ctx.fillRect(it.x * sz + 2, it.y * sz + 2, sz - 4, sz - 4); }
  for (const mo of S.monsters) if (Math.abs(mo.x - S.me.x) <= 5 && Math.abs(mo.y - S.me.y) <= 5) { ctx.fillStyle = MONSTERS[mo.t].boss ? '#ff2a6a' : '#e33'; ctx.beginPath(); ctx.arc(mo.x * sz + sz / 2, mo.y * sz + sz / 2, sz / 2.4, 0, 7); ctx.fill(); }
  for (const p of S.players) {
    if (p.id === S.id) continue;
    ctx.fillStyle = CLASSES[p.c].color; ctx.beginPath(); ctx.arc(p.x * sz + sz / 2, p.y * sz + sz / 2, sz / 2.2, 0, 7); ctx.fill();
  }
  // emote pings
  const pt = performance.now();
  S.pings = S.pings.filter((p) => p.until > pt);
  for (const p of S.pings) {
    const k = ((p.until - pt) % 1000) / 1000;
    ctx.strokeStyle = p.color; ctx.lineWidth = 2; ctx.globalAlpha = k;
    ctx.beginPath(); ctx.arc(p.x * sz + sz / 2, p.y * sz + sz / 2, sz * (2.5 - 2 * k), 0, 7); ctx.stroke();
    ctx.globalAlpha = 1;
  }
  // self arrow
  ctx.save(); ctx.translate(S.me.x * sz + sz / 2, S.me.y * sz + sz / 2); ctx.rotate(S.me.f * Math.PI / 2);
  ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.moveTo(0, -sz * 0.7); ctx.lineTo(sz * 0.5, sz * 0.5); ctx.lineTo(-sz * 0.5, sz * 0.5); ctx.fill(); ctx.restore();
}

// ---------- main loop ----------
let titleYaw = 0;
function frame(now) {
  if (held.size && now >= nextRepeat) {
    for (const a of held) if (a !== 'turnL' && a !== 'turnR') ACTIONS[a]();
    nextRepeat = now + 190;
  }
  if (!S.map) {
    // attract mode: slowly orbit a demo dungeon behind the title screen
    if (!S.demo) { S.demo = true; renderer.buildLevel(demoMap()); renderer.setCamera(16, 16, 0, true); }
    titleYaw += 0.0025; renderer.cam.tyaw = titleYaw;
  } else if (!$('#hud').classList.contains('hidden')) drawMinimap();
  renderer.render();
  requestAnimationFrame(frame);
}
function demoMap() {
  const w = 33, h = 33, cells = [];
  for (let y = 0; y < h; y++) {
    let row = '';
    for (let x = 0; x < w; x++) {
      const inHall = x > 9 && x < 23 && y > 9 && y < 23;
      const pillar = inHall && x % 4 === 0 && y % 4 === 0 && !(x === 16 && y === 16);
      row += pillar ? 'P' : inHall ? '.' : '#';
    }
    cells.push(row);
  }
  return { w, h, cells, stairs: { x: 16, y: 13 } };
}
requestAnimationFrame(frame);
