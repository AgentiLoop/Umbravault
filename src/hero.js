// HeroVault Durable Object — one instance per browser hero key; stores one saved character per class.
import { CLASSES } from '../public/js/data.js';

export const validHeroKey = (k) => typeof k === 'string' && /^[\w-]{16,64}$/.test(k);

export class HeroVault {
  constructor(state) { this.state = state; }

  async fetch(req) {
    const url = new URL(req.url);
    const cls = url.searchParams.get('cls');
    if (url.pathname === '/all') {
      const out = {};
      for (const k of Object.keys(CLASSES)) { const h = await this.state.storage.get(k); if (h) out[k] = { lvl: h.lvl, name: h.name, gold: h.gold, best: h.best || 1 }; }
      return Response.json(out);
    }
    if (!CLASSES[cls]) return new Response('bad class', { status: 400 });
    if (url.pathname === '/load') return Response.json((await this.state.storage.get(cls)) || null);
    if (url.pathname === '/save' && req.method === 'POST') {
      const h = await req.json();
      const prev = await this.state.storage.get(cls);
      h.best = Math.max(h.best || 1, prev?.best || 1);
      await this.state.storage.put(cls, h);
      return new Response('ok');
    }
    return new Response('not found', { status: 404 });
  }
}
