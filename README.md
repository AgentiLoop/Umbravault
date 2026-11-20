# Umbravault — Crypts of the Lantern-Bound

A 1–8 player online, first-person, grid-based dungeon crawler in the spirit of the classic
step-and-turn crawlers. It's built for **Cloudflare Workers + Durable Objects**, and the browser client uses **Three.js**.

## Play
- **Quick Match**: joins the matchmaking queue. You're dropped into an open public expedition that has room,
  or grouped with other waiting wanderers (up to 8). If you're the only one waiting for 6s, you get your own public room and the next players are matched into it.
- **Create Party**: makes a private room. Share the 🔗 code or invite link (click it in the HUD to copy).
- **Join**: enter a party code, or click an open public expedition on the title screen.

### Controls
| Key | Action |
|---|---|
| W / ↑, S / ↓ | step forward / back |
| A / ←, D / → | turn 90° |
| Q / E | strafe |
| Space, 1, 2 | class abilities |
| H (or 3) | Crimson Draught (heal 50%) |
| G | vote to descend (stand on the glowing stairway) |
| M | mute / unmute sound |
| Enter | chat |

### Callings (classes)
Vanguard 🛡️ (tank), Arcanist 🔮 (caster), Lightwarden ☀️ (healer), Nightblade 🗡️ (rogue) and Thornwarden 🏹 (archer).
Each calling has three abilities with their own cooldowns and MP costs, plus its own HP/MP growth per level.
Every third depth holds a boss, **The Hollow King**.

## Architecture
- `src/worker.js`: routes `/api/quickmatch` (WS → Lobby DO), `/api/rooms`, `/api/create`, and `/ws/:code` (WS → GameRoom DO). It also serves static assets.
- `src/lobby.js`: the singleton `Lobby` Durable Object, which holds the public room directory and the quick-match queue.
- `src/room.js`: the `GameRoom` Durable Object. It runs the authoritative 10 Hz simulation: procedural dungeon, monster AI (BFS flow field), combat, loot, XP and levels, respawns, and descend votes.
- `public/js/data.js`: classes, monsters and the dungeon generator, shared by the server and the client.
- `public/js/render.js`: the Three.js renderer. It handles procedural textures, lantern/torch lighting, billboard sprites and spell effects.
- `public/js/main.js`: UI, matchmaking, networking with client-side movement prediction, HUD and minimap.

## Develop / deploy
```sh
npm install
npx wrangler dev --port 8799      # local
npm test                          # smoke test against the local dev server
npx wrangler deploy               # deploy to Cloudflare
```
