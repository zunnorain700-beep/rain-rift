# Rain Rift

**Created by Zunnorain Carti**

An original, fully client-side 3D arcade kart racer. Four circuits, six karts,
four racers, four power-ups, three real difficulty tiers, procedurally built
audio, and a leaderboard that never leaves your browser. No backend, no API
keys, no bundler — plain HTML, CSS and ES modules with Three.js.

---

## Features

- **4 tracks** — Neon City, Desert Canyon, Coastal Circuit, Forest Rush. Every
  road, barrier, prop and texture is generated in code from a closed spline.
- **6 vehicles** — Sport, muscle, buggy, rally, electric and truck, each with
  its own stats, 3D model and 10 paint colours in the garage.
- **4 racers** — selectable with an auto-rotating 3D preview, stat bars and
  synthesized voice lines.
- **4 power-ups** — Nitro Boost, Energy Shield, Oil Slick, Pulse Wave. Item
  crates show their colour, glyph and a floating name tag, so you always know
  what you are about to pick up.
- **3 difficulties** — Easy / Medium / Hard change rival top speed, aggression,
  grip assist and mistake rate. Rival speed and acceleration are 90%, 105%, and
  120% of each vehicle's base race tuning; harder rivals brake later, carry more
  corner speed, and use power-ups more often. Player speed stays the same.
- **Full race loop** — grid countdown, checkpoints, 3 laps, live positions,
  minimap, wrong-way warning, drift with charge-to-boost, collisions, item use,
  pause / restart / quit, results screen and local leaderboard.
- **Audio** — everything is synthesized with the Web Audio API: engine pitch
  tracks speed, tire squeal follows slip, music, countdown beeps, boost whoosh,
  menu blips and character voices. Master / music / SFX volume + mute.
- **Displays** — responsive layout with a touch control pad, three graphics
  quality levels, delta-time movement, resize handling and graceful WebGL
  fallback.

## Controls

| Key | Action |
| --- | --- |
| `W` / `↑` | Accelerate |
| `S` / `↓` | Brake / reverse |
| `A` `D` / `←` `→` | Steer |
| `Space` | Drift / handbrake (hold through a corner, release for a boost) |
| `Shift` or `E` | Use power-up |
| `Esc` | Pause |

**Touch:** on-screen steering pad plus throttle, brake, drift and item buttons
appear automatically on touch devices (and can be forced on in Settings).

---

## Run it locally

The game must be served over HTTP — ES modules and import maps do not work from
a `file://` URL.

```bash
# option 1 — Node (no install, package.json scripts included)
npm start            # serves on http://localhost:8080

# option 2 — Python
python -m http.server 8080

# option 3 — any static server of your choice
npx serve -l 8080 .
```

Open <http://localhost:8080> and click **Play**.

> First load fetches Three.js `0.160.1` from the jsDelivr CDN (pinned in the
> import map in `index.html`) and the browser caches it afterwards. For a fully
> offline build, download `three.module.js` into `assets/` and change one line
> of the import map.

## Deploy

### GitHub + Netlify (recommended)

1. Create a repository and push the project:
   ```bash
   git init
   git add .
   git commit -m "Rain Rift v1.0"
   git branch -M main
   git remote add origin https://github.com/<you>/rain-rift.git
   git push -u origin main
   ```
2. In the Netlify dashboard: **Add new site → Import an existing project** and
   pick the repository. `netlify.toml` already sets the publish directory (`.`,
   i.e. the repo root) and security/cache headers, so no build settings are
   needed — build command stays empty.
3. Deploy. Your site is live on a `*.netlify.app` URL.

### Other options

- **Drag and drop** — drop the whole project folder onto
  <https://app.netlify.com/drop>. Fastest way to get a link.
- **Netlify CLI**
  ```bash
  npm i -g netlify-cli
  netlify deploy --prod
  ```

Any other static host (GitHub Pages, Cloudflare Pages, a school server) works
too: publish the folder containing `index.html`.

---

## Project structure

```
index.html          App shell: menu, HUD, every screen (import map lives here)
style.css           Design system, screens, HUD, responsive + touch layout
netlify.toml        Static publish config and response headers
package.json        type: module + local serve scripts
assets/favicon.svg  Original mark
src/
  main.js           Boot, WebGL check, race lifecycle, global loop
  ui.js             Screens, HUD bridge, results, leaderboard, settings
  game.js           Race orchestration: camera, events, ranking, results
  physics.js        Arcade kart dynamics, laps, checkpoints, collisions
  ai.js             Rival driving, racing lines, rubber-banding, item use
  input.js          Keyboard + touch input, pause hook
  powerups.js       Item crates, hazards, effect visuals
  tracks.js         Procedural circuits, road meshes, scenery, minimap data
  characters.js     Racer models and animation
  vehicles.js       Kart models, wheels, steering, paint
  preview.js        Auto-rotating 3D previews (characters + garage)
  audio.js          Web Audio: engine, squeal, music, sfx, voices
  data.js           Characters, vehicles, tracks, difficulties, power-ups
  storage.js        LocalStorage schema (settings, loadout, results, stats)
```

## How it works

- **Rendering** — Three.js via import map, one WebGL context per race (the
  canvas is recreated on every start and fully disposed on exit, so restarts
  never leak contexts).
- **Physics** — forward/lateral velocity split for a drift-happy arcade feel;
  movement is integrated with delta time so frame rate never changes speed.
  The centreline is sampled into 400 points and split into 8 checkpoint
  sectors; a lap counts when sector 0 is re-entered after sector 7.
- **AI** — rivals follow a smoothed racing line with per-vehicle pace, difficulty
  multipliers and light rubber-banding, and they use their items.
- **Audio** — oscillators, noise buffers and filters only; the engine responds
  to speed, throttle, braking and boosts, with simulated gear changes. Road
  rumble and wind rise with speed, rough surfaces add texture, and tire squeal
  follows slip. Movement audio fades on pause and respects SFX volume and mute.
  The audio context unlocks on the first click/tap (browser rule).
- **Data** — everything persists in `localStorage` under the `rainrift.v1` key:
  settings, loadout, per-track bests, career stats and the last 60 races.

## Testing checklist

Use this after any change:

1. Load the page — loading screen → main menu with **no console errors**.
2. Characters: cycle, preview rotates, confirm → menu slot updates, survives reload.
3. Garage: pick a vehicle + paint, confirm → menu slot updates, survives reload.
4. Tracks: select each of the 4 circuits and each difficulty; the hint text changes.
5. Race: countdown → drive → drift (`Space`) → item (`Shift`) → 3 laps → results.
6. Results: position, time, best lap, points, standings rows, `+1` leaderboard row.
7. Pause (`Esc`): time freezes, resume/restart/quit all work.
8. Leaderboard + Settings (volumes, mute, quality, touch, name, reset) + How to Play.
9. Reload with everything above persisted; no errors in the console at any point.
10. Resize the window and try a phone-size viewport: layout and touch pad adapt.

**Debug handle:** `window.__TR` exposes `{ race, ui, input, audio, startRace,
togglePause, quitToMenu }` for running the checks above from the devtools
console (for example `__TR.startRace({ trackId: 'forest', difficulty: 'hard' })`).

## Data & privacy

There is no server and no analytics. Leaderboards, settings and progress are
stored only in this browser's `localStorage`; clearing site data (or **Reset all
saved progress** in Settings) wipes them.

## Browser support

Evergreen Chrome, Edge, Firefox and Safari with WebGL. If WebGL is unavailable
the game shows a clear message instead of a black screen. Low quality mode is
aimed at older laptops and phones: reduced resolution, no shadows, lighter
scenery.

## Credits

Designed, coded and synthesized by **Zunnorain Carti**. All art, models, tracks,
music and sound effects are original and generated at runtime — no third-party
assets. Three.js is MIT-licensed.

MIT licensed — see `package.json`.
