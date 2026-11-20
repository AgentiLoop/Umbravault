// Umbravault — Cloudflare Worker entry. Static assets are served from ./public by the [assets] binding.
import { MAX_PLAYERS } from '../public/js/data.js';
export { GameRoom } from './room.js';
export { Lobby } from './lobby.js';

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export function makeCode() {
  let s = '';
  for (let i = 0; i < 5; i++) s += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  return s;
}
const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'content-type': 'application/json' } });
const lobbyStub = (env) => env.LOBBY.get(env.LOBBY.idFromName('global'));

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    const p = url.pathname;
    if (p === '/api/quickmatch') {
      if (req.headers.get('Upgrade') !== 'websocket') return json({ error: 'websocket required' }, 426);
      return lobbyStub(env).fetch(new Request('https://lobby/queue', req));
    }
    if (p === '/api/rooms') return lobbyStub(env).fetch('https://lobby/rooms');
    if (p === '/api/create') return json({ code: makeCode(), max: MAX_PLAYERS });
    const m = p.match(/^\/ws\/([A-Z0-9]{4,8})$/i);
    if (m) {
      if (req.headers.get('Upgrade') !== 'websocket') return json({ error: 'websocket required' }, 426);
      const code = m[1].toUpperCase();
      const pub = url.searchParams.get('public') === '1';
      return env.ROOMS.get(env.ROOMS.idFromName(code)).fetch(new Request(`https://room/connect?code=${code}&public=${pub ? 1 : 0}`, req));
    }
    if (env.ASSETS) return env.ASSETS.fetch(req);
    return new Response('Not found', { status: 404 });
  },
};
