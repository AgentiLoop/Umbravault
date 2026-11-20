// Lobby Durable Object (singleton "global"): public room directory + quick-match queue.
import { MAX_PLAYERS } from '../public/js/data.js';

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const newCode = () => Array.from({ length: 5 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join('');
const SOLO_WAIT_MS = 6000; // a lone queued player gets their own public room after this, others will be matched into it

export class Lobby {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.rooms = new Map(); // code -> {code, count, depth, updated, reserved}
    this.queue = []; // {ws, name, cls, since}
    this.timer = null;
  }

  async fetch(req) {
    const url = new URL(req.url);
    if (url.pathname === '/update') {
      const r = await req.json();
      if (r.count <= 0) this.rooms.delete(r.code);
      else this.rooms.set(r.code, { ...(this.rooms.get(r.code) || {}), code: r.code, count: r.count, depth: r.depth, updated: Date.now(), reserved: 0 });
      return new Response('ok');
    }
    if (url.pathname === '/rooms') {
      this.prune();
      return new Response(JSON.stringify({ rooms: [...this.rooms.values()].map(({ code, count, depth }) => ({ code, count, depth })), waiting: this.queue.length }), { headers: { 'content-type': 'application/json' } });
    }
    if (url.pathname === '/queue') {
      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);
      server.accept();
      const entry = { ws: server, name: 'Wanderer', since: Date.now() };
      this.queue.push(entry);
      server.addEventListener('message', (e) => {
        try { const m = JSON.parse(e.data); if (m.t === 'hello') entry.name = String(m.name || '').slice(0, 16) || 'Wanderer'; } catch {}
      });
      const drop = () => { this.queue = this.queue.filter((q) => q !== entry); this.broadcastQueue(); };
      server.addEventListener('close', drop);
      server.addEventListener('error', drop);
      this.broadcastQueue();
      this.match();
      if (!this.timer) this.timer = setInterval(() => this.match(), 1000);
      return new Response(null, { status: 101, webSocket: client });
    }
    return new Response('not found', { status: 404 });
  }

  prune() {
    const now = Date.now();
    for (const [code, r] of this.rooms) if (now - r.updated > 90000) this.rooms.delete(code);
  }

  broadcastQueue() {
    const names = this.queue.map((q) => q.name);
    for (const q of this.queue) this.send(q.ws, { t: 'queue', waiting: this.queue.length, names });
  }

  send(ws, o) { try { ws.send(JSON.stringify(o)); } catch {} }

  assign(entries, code) {
    for (const e of entries) {
      this.send(e.ws, { t: 'matched', code, party: entries.map((x) => x.name) });
      try { e.ws.close(1000, 'matched'); } catch {}
    }
    const r = this.rooms.get(code) || { code, count: 0, depth: 1, updated: Date.now(), reserved: 0 };
    r.reserved += entries.length;
    r.updated = Date.now();
    this.rooms.set(code, r);
    this.queue = this.queue.filter((q) => !entries.includes(q));
  }

  match() {
    this.prune();
    if (this.queue.length === 0) {
      if (this.timer) { clearInterval(this.timer); this.timer = null; }
      return;
    }
    // 1) fill existing public rooms that have space (fullest first, so parties grow)
    const open = [...this.rooms.values()].filter((r) => r.count + r.reserved < MAX_PLAYERS).sort((a, b) => b.count - a.count);
    for (const r of open) {
      if (!this.queue.length) break;
      const space = MAX_PLAYERS - r.count - r.reserved;
      this.assign(this.queue.slice(0, space), r.code);
    }
    // 2) group waiting players together into a fresh room
    if (this.queue.length >= 2 || (this.queue.length === 1 && Date.now() - this.queue[0].since > SOLO_WAIT_MS)) {
      this.assign(this.queue.slice(0, MAX_PLAYERS), newCode());
    }
    this.broadcastQueue();
  }
}
