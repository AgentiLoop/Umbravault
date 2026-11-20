// Smoke test against a running `wrangler dev` (default http://localhost:8799).
// Two players quick-match into the same room, move, attack, chat; a third joins by code.
const BASE = process.env.BASE || 'http://localhost:8799';
const WS = BASE.replace(/^http/, 'ws');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failures = 0;
const check = (cond, msg) => { console.log(`${cond ? 'PASS' : 'FAIL'} ${msg}`); if (!cond) failures++; };

function open(url) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    ws.msgs = [];
    ws.onmessage = (e) => ws.msgs.push(JSON.parse(e.data));
    ws.onopen = () => resolve(ws);
    ws.onerror = reject;
  });
}
async function waitFor(ws, pred, ms = 10000) {
  const end = Date.now() + ms;
  while (Date.now() < end) { const m = ws.msgs.find(pred); if (m) return m; await sleep(50); }
  return null;
}

const a = await open(`${WS}/api/quickmatch`);
a.send(JSON.stringify({ t: 'hello', name: 'Alpha' }));
const b = await open(`${WS}/api/quickmatch`);
b.send(JSON.stringify({ t: 'hello', name: 'Bravo' }));
const ma = await waitFor(a, (m) => m.t === 'matched');
const mb = await waitFor(b, (m) => m.t === 'matched');
check(ma && mb && ma.code === mb.code, `quick-match pairs both players into room ${ma?.code}`);

const code = ma.code;
const pa = await open(`${WS}/ws/${code}?public=1`);
pa.send(JSON.stringify({ t: 'join', name: 'Alpha', cls: 'arcanist', token: 'tok-alpha' }));
const pb = await open(`${WS}/ws/${code}?public=1`);
pb.send(JSON.stringify({ t: 'join', name: 'Bravo', cls: 'vanguard' }));
const wa = await waitFor(pa, (m) => m.t === 'welcome');
check(wa && wa.map.cells.length === wa.map.h, 'welcome contains the dungeon map');
const st = await waitFor(pb, (m) => m.t === 's' && m.p.length === 2);
check(!!st, 'both players visible in room state');
check(st && st.m.length > 0, `monsters spawned (${st?.m.length})`);
check(st && st.p.every((p) => typeof p.rv === 'number' && typeof p.rt === 'number'), 'players carry revive channel fields in state');
check(st && st.p.every((p) => Array.isArray(p.ge) && p.ge.length === 3 && typeof p.ar === 'number'), 'players carry gear slots + armor in state');

const rooms = await (await fetch(`${BASE}/api/rooms`)).json();
check(rooms.rooms.some((r) => r.code === code && r.count === 2), 'lobby lists the public room with 2 players');

// a third player quick-matches and should be dropped straight into the open public room
const c = await open(`${WS}/api/quickmatch`);
c.send(JSON.stringify({ t: 'hello', name: 'Charlie' }));
const mc = await waitFor(c, (m) => m.t === 'matched');
check(mc && mc.code === code, 'third quick-matcher joins the existing public room');

// move: try every direction until one succeeds
const me = st.p.find((p) => p.n === 'Alpha');
const DIRS = [[0, -1], [1, 0], [0, 1], [-1, 0]];
const d = DIRS.findIndex(([dx, dy]) => '.>'.includes(wa.map.cells[me.y + dy][me.x + dx]));
pa.send(JSON.stringify({ t: 'move', d, f: d }));
await sleep(300);
pa.msgs = [];
const st2 = await waitFor(pa, (m) => m.t === 's');
const me2 = st2.p.find((p) => p.n === 'Alpha');
check(me2.x === me.x + DIRS[d][0] && me2.y === me.y + DIRS[d][1], `movement processed (from ${me.x},${me.y} to ${me2.x},${me2.y})`);

pa.send(JSON.stringify({ t: 'act', i: 0 }));
const fx = await waitFor(pa, (m) => m.t === 's' && m.ev.some((e) => e.e === 'fx' && e.k === 'bolt'));
check(!!fx, 'ability cast emits a bolt effect');
pb.send(JSON.stringify({ t: 'chat', text: 'hello vault' }));
const chat = await waitFor(pa, (m) => m.t === 's' && m.ev.some((e) => e.e === 'chat' && e.text === 'hello vault'));
check(!!chat, 'chat relayed to other players');

// private room join by code
const { code: priv } = await (await fetch(`${BASE}/api/create`)).json();
const pc = await open(`${WS}/ws/${priv}`);
pc.send(JSON.stringify({ t: 'join', name: 'Delta', cls: 'thornwarden' }));
const wc = await waitFor(pc, (m) => m.t === 'welcome');
check(wc && wc.code === priv && wc.public === false, `private party room ${priv} created`);
const rooms2 = await (await fetch(`${BASE}/api/rooms`)).json();
check(!rooms2.rooms.some((r) => r.code === priv), 'private room is not listed publicly');

// reconnect: Alpha drops, is shown offline, then resumes the same character with the same token
const before = (await waitFor(pb, (m) => m.t === 's')).p.find((p) => p.n === 'Alpha');
pa.close();
pb.msgs = [];
const off = await waitFor(pb, (m) => m.t === 's' && m.p.some((p) => p.n === 'Alpha' && p.o === 1));
check(!!off, 'disconnected player kept in party and flagged offline');
const pa2 = await open(`${WS}/ws/${code}?public=1`);
pa2.send(JSON.stringify({ t: 'join', name: 'Alpha', cls: 'arcanist', token: 'tok-alpha' }));
const wr = await waitFor(pa2, (m) => m.t === 'welcome');
check(wr && wr.resumed && wr.id === before.id, `reconnect resumes same character (id ${wr?.id})`);
pb.msgs = [];
const back = await waitFor(pb, (m) => m.t === 's' && m.p.filter((p) => p.n.startsWith('Alpha')).length === 1 && m.p.find((p) => p.n === 'Alpha')?.o === 0);
check(!!back, 'resumed player online again with no duplicate');
for (const w of [a, b, c, pa2, pb, pc]) w.close();
console.log(failures ? `${failures} FAILED` : 'ALL PASSED');
process.exit(failures ? 1 : 0);
