# Umbravault — Crypts of the Lantern-Bound

A 1–8 player online, first-person, grid-based dungeon crawler in the spirit of the classic
step-and-turn crawlers. It's built for **Cloudflare Workers + Durable Objects**, and the browser client uses **Three.js**.

**Play now:** https://umbravault.todd-de8.workers.dev

## Play
- **Quick Match**: joins the matchmaking queue. You're dropped into an open public expedition that has room,
  or grouped with other waiting wanderers (up to 8). If you're the only one waiting for 6s, you get your own public room and the next players are matched into it.
- **Create Party**: makes a private room. Share the 🔗 code or invite link (click it in the HUD to copy).
- **Join**: enter a party code, or click an open public expedition on the title screen.
- **Reconnect**: if your connection drops or you reload the page, the client reconnects on its own and you resume the same character (level, gold, position). The room keeps a disconnected character for 60s; monsters ignore them while they're offline (📡 in the party list).

### Controls
| Key | Action |
|---|---|
| W / ↑, S / ↓ | step forward / back |
| A / ←, D / → | turn 90° |
| Q / E | strafe |
| Space, 1, 2 | class abilities |
| H (or 3) | Crimson Draught (heal 50%) |
| G | vote to descend (stand on the glowing stairway) |
| B | trade with the Lantern Merchant (stand near the entry hall) |
| R | revive a fallen ally next to you (2.5s channel, 1s for Lightwardens) |
| M | mute / unmute sound |
| 5–9 | emotes: 👋 hail, 🆘 help, ⚠️ danger, ➡️ follow, 🎉 victory (bubble over your head + minimap ping) |
| Touch | on-screen pad + big ability buttons; swipe the view left/right to turn, up/down to step, tap to use your primary ability |
| Enter | chat (appears as a speech bubble over your hero) |

### Callings (classes)
Vanguard 🛡️ (tank), Arcanist 🔮 (caster), Lightwarden ☀️ (healer), Nightblade 🗡️ (rogue), Thornwarden 🏹 (archer) and Hexweaver 🕯️ (warlock: life-draining bolts, a crowd curse and a damage-reducing party ward).
Each calling has three abilities with their own cooldowns and MP costs, plus its own HP/MP growth per level.
Every third depth holds a boss, and the three bosses rotate. **The Hollow King** (depth 3) raises skeletons. **The Brood Matriarch** (depth 6) births spider swarms. **The Ember Tyrant** (depth 9) gathers a firestorm: watch for the red ring and step more than 2 paces away before it erupts. **Varkas the Iron Warlord** (depth 12) is a crowned human general in gilded plate who sounds his war horn to call in cutthroats, archers and knights. Once a boss wakes, its health bar appears for the whole party. Killing it breaks the stairway ward and destroys its minions.

### Floor themes
Each depth has its own look, cycling through five: Sunken Crypt, Mosswood Grotto (green torchlight), Rimefrost Halls (icy blue), Ember Forge (red-hot) and Abyssal Sanctum (violet). Each theme tints the stone and floor and changes the fog, ambient light, torch flames and drifting motes.
### Foes
Every foe is a fully 3D, animated model built procedurally in `public/js/models.js`, with walk cycles, attack swings, hit flashes, stun tint and a death fall. There are no flat sprites.
- **Outlaws and soldiers:** Hooded Cutthroat (twin daggers), Brigand Archer (bow), Tusked Marauder (orc with greataxe), Renegade Battlemage (blue-orb staff), Fallen Knight (plate, sword and shield) and Blackguard Captain (horned plate, greatsword).
- **Creatures and undead:** Gloom Rat, Mire Goblin, Vault Spider, Bone Rattler (skeleton), Ember Cultist, Crypt Ghoul, Pale Wraith and Cavern Ogre.
- **Bosses:** the crowned skeletal Hollow King, the scorpion-tailed Brood Matriarch, the winged, horned Ember Tyrant and the human general Varkas the Iron Warlord.

### Elite monsters
Some monsters spawn as **elites**: about 9% on depth 1, rising to about 22% by depth 8. An elite has 2.2× HP and one affix, shown by a colored glow, a ring and a name label:
💨 Swift (moves and attacks faster), 🩸 Vampiric (heals from its hits), 🪨 Stoneskin (takes 35% less damage), 💢 Frenzied (hits 40% harder) and 🌋 Molten (explodes when slain, so step back).
Elites give 3× XP and always drop Runed-or-better gear.

### Lantern Merchant
A spectral merchant hovers over each floor's entry hall. Stand within 2 paces and press **B** (or tap 🏮) to spend gold on:
Crimson Draughts, a Lantern Elixir (full HP/MP restore), a Runed Cache (random Runed+ gear) or a Mythic Cache (random Mythic+ gear). Prices scale with depth.
### Doors & traps
Iron-bound doors guard many room entrances. Walk into a door to raise it, and it stays open for the whole party. Monsters can't open doors or see through closed ones.
Hidden spike traps lie in rooms and corridors. Stepping on one costs about 15% of max HP and leaves spikes showing. **Nightblades** sense armed traps within 2 paces and disarm them automatically.

### Saved heroes
Your characters are saved on the server, one per calling, in a `HeroVault` Durable Object. They're keyed by a random hero ID stored in your browser's localStorage.
The save holds level, XP, gold, potions, kills, equipped gear and deepest depth reached. It's written on level-up, on descending, when you disconnect, and every 30s.
Choosing a calling you've played before restores that hero in any room, and the title screen shows its level and gold (⭐).

### Gear
Monsters and dungeon rooms drop gear. Each piece glows in its rarity color: **Worn** (grey), **Runed** (blue), **Mythic** (purple) or **Lantern-Forged** (orange).
There are three slots: Weapon (+% damage), Armor (+armor, +HP) and Charm (+MP, +% damage).
Walking over a piece equips it automatically if it's better than what you have, and the old piece is salvaged for gold. Weaker pieces are salvaged straight into gold.
Deeper floors roll stronger gear, and the Hollow King always drops Mythic-or-better loot. Hover over the gear slots in the HUD to see their stats.

## Architecture
- `src/worker.js`: routes `/api/quickmatch` (WS → Lobby DO), `/api/rooms`, `/api/create`, and `/ws/:code` (WS → GameRoom DO). It also serves static assets.
- `src/lobby.js`: the singleton `Lobby` Durable Object, which holds the public room directory and the quick-match queue.
- `src/hero.js`: the `HeroVault` Durable Object (one per hero key), which persists one saved character per class.
- `src/room.js`: the `GameRoom` Durable Object. It runs the authoritative 10 Hz simulation: procedural dungeon, monster AI (BFS flow field), combat, loot, XP and levels, respawns, and descend votes.
- `public/js/data.js`: classes, monsters and the dungeon generator, shared by the server and the client.
- `public/js/render.js`: the Three.js renderer. It handles procedural textures, lantern/torch lighting, billboard sprites and spell effects.
- `public/js/main.js`: UI, matchmaking, networking with client-side movement prediction, HUD and minimap.

## Develop / deploy
```sh
npm install
npx wrangler dev --port 8799      # local
npm test                          # smoke test against the local dev server
BASE=https://umbravault.todd-de8.workers.dev npm test   # smoke test against production
npx wrangler deploy               # deploy to Cloudflare
```
