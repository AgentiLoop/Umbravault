// Umbravault client: title screen, matchmaking, networking, input, HUD.
import { CLASSES, MONSTERS, DIRS, isWalkable } from './data.js';
import { Renderer } from './render.js';

const $ = (s) => document.querySelector(s);
const wsBase = `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}`;
const COMPASS = ['N', 'E', 'S', 'W'];

const S = {
  name: localStorage.getItem('uv.name') || '',
  cls: localStorage.getItem('uv.cls') || 'vanguard',
  ws: null, qws: null, id: null, code: null, map: null,
  me: { x: 0, y: 0, f: 1 }, players: [], monsters: [], items: [],
  lastLocalMove: 0, explored: null, lastHp: null,
};
const renderer = new Renderer($('#view'));

// ---------- title screen ----------
$('#name').value = S.name;
function drawClasses() {
  $('#classes').innerHTML = Object.entries(CLASSES).map(([k, c]) => `
    <div class="cls ${k === S.cls ? 'sel' : ''}" data-k="${k}" style="--c:${c.color}">
      <div class="ic">${c.icon}</div><div class="nm">${c.name}</div>
      <div class="st">❤️ ${c.hp} · 🔷 ${c.mp}</div>
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

$('#btn-quick').onclick = () => { readName(); quickMatch(); };
$('#btn-create').onclick = async () => {
  readName();
  const { code } = await (await fetch('/api/create')).json();
  connectRoom(code, false);
};
$('#btn-join').onclick = () => { readName(); const c = $('#code').value.trim().toUpperCase(); if (c.length >= 4) connectRoom(c, false); };
$('#code').onkeydown = (e) => { if (e.key === 'Enter') $('#btn-join').click(); };
$('#btn-cancel').onclick = () => { S.qws?.close(); showScreen('title'); };

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
function connectRoom(code, isPublic) {
  S.ws?.close();
  const ws = new WebSocket(`${wsBase}/ws/${code}${isPublic ? '?public=1' : ''}`);
  S.ws = ws; S.code = code;
  ws.onopen = () => ws.send(JSON.stringify({ t: 'join', name: S.name, cls: S.cls }));
  ws.onmessage = (e) => onMsg(JSON.parse(e.data));
  ws.onclose = () => {
    if (S.ws !== ws) return;
    toast('Connection to the vault lost.');
    setTimeout(() => { if (S.ws === ws) { S.ws = null; showScreen('title'); } }, 1500);
  };
}
const send = (o) => { if (S.ws?.readyState === 1) S.ws.send(JSON.stringify(o)); };

function loadMap(map) {
  S.map = map;
  S.explored = new Uint8Array(map.w * map.h);
  renderer.buildLevel(map);
}

function onMsg(m) {
  switch (m.t) {
    case 'welcome':
      S.id = m.id; S.code = m.code;
      loadMap(m.map);
      history.replaceState(null, '', `?room=${m.code}`);
      $('#room-code').textContent = `🔗 ${m.code}${m.public ? ' · public' : ' · private'}`;
      showScreen('game');
      S.first = true;
      toast(`Depth ${m.map.depth}`);
      break;
    case 'level':
      loadMap(m.map);
      S.first = true;
      toast(`Depth ${m.map.depth}${m.map.depth % 3 === 0 ? '<br><small>The Hollow King awaits…</small>' : ''}`, 3000);
      break;
    case 'bump': S.me.x = m.x; S.me.y = m.y; renderer.setCamera(m.x, m.y, S.me.f); renderer.shake(0.03); break;
    case 'toast': toast(m.text); break;
    case 'error': toast(m.msg); break;
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
    if (ev.e === 'fx') renderer.playFx(ev, S.id);
    else if (ev.e === 'log') addLog(ev.text, ev.kind);
    else if (ev.e === 'chat') addLog(`<b style="--c:${CLASSES[ev.cls]?.color}">${esc(ev.from)}:</b> ${esc(ev.text)}`, 'chat', true);
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
  if (!isWalkable(S.map.cells[ny]?.[nx]) || S.monsters.some((mo) => mo.x === nx && mo.y === ny)) { renderer.shake(0.025); return; }
  S.me.x = nx; S.me.y = ny; S.lastLocalMove = Date.now();
  renderer.setCamera(nx, ny, S.me.f);
  send({ t: 'move', d, f: S.me.f });
}
function turn(dir) {
  S.me.f = (S.me.f + dir + 4) % 4;
  renderer.setCamera(S.me.x, S.me.y, S.me.f);
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
});
addEventListener('keyup', (e) => { const a = KEYMAP[e.code]; if (a) held.delete(a); });
addEventListener('blur', () => held.clear());
document.querySelectorAll('#touch button').forEach((b) => {
  b.addEventListener('pointerdown', (e) => { e.preventDefault(); ACTIONS[b.dataset.k](); held.add(b.dataset.k); nextRepeat = performance.now() + 260; });
  b.addEventListener('pointerup', () => held.delete(b.dataset.k));
  b.addEventListener('pointerleave', () => held.delete(b.dataset.k));
});
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
    `<div class="ab" data-potion="1" title="Crimson Draught — restore 50% HP"><span class="key">H</span>🧪<span class="mp" id="po"></span></div>`;
  document.querySelectorAll('#abilities .ab').forEach((el) => el.onclick = () => el.dataset.potion ? send({ t: 'potion' }) : send({ t: 'act', i: +el.dataset.i }));
  S.abBuilt = S.self.c;
}

function updateHud(depth) {
  const me = S.self;
  if (!me) return;
  if (S.abBuilt !== me.c) buildAbilities();
  $('#depth').textContent = `Depth ${depth}`;
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
  $('#stats').innerHTML = `<b style="color:${c.color}">${c.icon} Lv ${me.l}</b><br>💰 ${me.g}<br>☠️ ${me.k} kills`;
  $('#party').innerHTML = S.players.map((p) => {
    const pc = CLASSES[p.c];
    const buffs = (p.mi ? '📯' : '') + (p.ve ? '🌑' : '') + (p.v ? '⬇️' : '');
    return `<div class="pf ${p.id === S.id ? 'self' : ''} ${p.d ? 'dead' : ''}" style="--c:${pc.color}">
      <div class="row"><span class="nm">${pc.icon} ${esc(p.n)}</span><span>Lv ${p.l} <span class="buffs">${buffs}</span></span></div>
      <div class="mini"><div style="width:${(100 * p.hp) / p.mhp}%;background:linear-gradient(90deg,#a11,#e44)"></div></div>
      <div class="mini"><div style="width:${(100 * p.mp) / p.mmp}%;background:linear-gradient(90deg,#227,#58f)"></div></div>
    </div>`;
  }).join('');
  $('#dead').classList.toggle('hidden', !me.d);
  if (me.d) $('#dead-t').textContent = Math.ceil(me.d / 1000);
  // target frame: monster directly ahead (up to 8 cells in line)
  const [dx, dy] = DIRS[S.me.f];
  let tgt = null;
  for (let s = 1, x = S.me.x, y = S.me.y; s <= 8; s++) {
    x += dx; y += dy;
    if (!isWalkable(S.map.cells[y]?.[x])) break;
    tgt = S.monsters.find((mo) => mo.x === x && mo.y === y);
    if (tgt) break;
  }
  const tf = $('#target');
  tf.classList.toggle('hidden', !tgt);
  if (tgt) { const d = MONSTERS[tgt.t]; tf.innerHTML = `${d.icon} ${d.name}${tgt.s ? ' ❄️' : ''}<div class="mini"><div style="width:${(100 * tgt.hp) / tgt.mhp}%"></div></div>`; }
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
    ctx.fillStyle = c === '#' ? '#3a3040' : c === 'P' ? '#5a4a60' : c === '>' ? '#55ccff' : '#1d1822';
    ctx.fillRect(x * sz, y * sz, sz, sz);
  }
  for (const it of S.items) if (S.explored[it.y * w + it.x]) { ctx.fillStyle = it.k === 'gold' ? '#ffcc33' : '#ff3355'; ctx.fillRect(it.x * sz + 2, it.y * sz + 2, sz - 4, sz - 4); }
  for (const mo of S.monsters) if (Math.abs(mo.x - S.me.x) <= 5 && Math.abs(mo.y - S.me.y) <= 5) { ctx.fillStyle = MONSTERS[mo.t].boss ? '#ff2a6a' : '#e33'; ctx.beginPath(); ctx.arc(mo.x * sz + sz / 2, mo.y * sz + sz / 2, sz / 2.4, 0, 7); ctx.fill(); }
  for (const p of S.players) {
    if (p.id === S.id) continue;
    ctx.fillStyle = CLASSES[p.c].color; ctx.beginPath(); ctx.arc(p.x * sz + sz / 2, p.y * sz + sz / 2, sz / 2.2, 0, 7); ctx.fill();
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
