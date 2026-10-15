🌧️ Rain Rift

A 3D arcade kart racing game built for the browser.

Created by Zunnorain Carti

Race through neon-lit streets, desert canyons, coastal roads, and forest trails in Rain Rift, an arcade-style kart racer featuring customizable vehicles, rival AI racers, power-ups, and fast-paced drifting.

Built with JavaScript and "Three.js" (https://threejs.org/), Rain Rift runs directly in your browser with no backend or installation required.


https://rain-raft.netlify.app

---

🎮 Game Features

- 4 Unique Tracks — Neon City, Desert Canyon, Coastal Circuit, and Forest Rush.
- 6 Playable Vehicles — Sport, Muscle, Buggy, Rally, Electric, and Truck, each with unique stats and handling.
- 10 Paint Colours — Customize your vehicle in the garage.
- 4 Selectable Racers — Choose your character and explore rotating 3D previews.
- 4 Power-Ups — Nitro Boost, Energy Shield, Oil Slick, and Pulse Wave.
- 3 Difficulty Levels — Easy, Medium, and Hard, with different AI speeds and behaviours.
- Arcade Drifting — Charge your drift and release it to gain a speed boost.
- AI Opponents — Race against rivals that follow racing lines and use power-ups.
- Race HUD — Track your speed, position, lap count, checkpoints, and race progress.
- Minimap — Keep track of the circuit while racing.
- Dynamic Audio — Procedurally generated engine sounds, tyre squeals, music, and sound effects.
- Local Leaderboard — Save your race results and track your progress.
- Mobile Controls — Touch-friendly controls for supported mobile devices.
- Graphics Settings — Choose between three quality levels to suit your device.

🕹️ Controls

Input| Action
"W" / "↑"| Accelerate
"S" / "↓"| Brake / Reverse
"A" / "←"| Steer Left
"D" / "→"| Steer Right
"Space"| Drift / Handbrake
"Shift" / "E"| Use Power-Up
"Esc"| Pause / Resume

Mobile: Use the on-screen steering pad and action buttons to control your kart.

🏁 How to Play

1. Select your racer and customize your vehicle.
2. Choose a track and difficulty level.
3. Wait for the countdown and get ready to race.
4. Complete three laps while passing checkpoints and competing against AI opponents.
5. Collect item crates and use power-ups to gain an advantage.
6. Drift through corners and release to build speed.
7. Finish the race, check your results, and aim for a better position next time.

⚙️ Built With

- HTML5 — Game interface and page structure.
- CSS3 — Styling, responsive layouts, menus, and HUD.
- JavaScript ES Modules — Game logic, physics, AI, and state management.
- Three.js — 3D rendering, vehicle models, tracks, and scenery.
- Web Audio API — Procedural audio and sound effects.
- LocalStorage — Local settings, player progress, and race history.

🚀 Run Locally

Requirements

- A modern browser with WebGL support.
- Node.js or Python for a local HTTP server.
- An internet connection for loading Three.js from the CDN, unless a local copy is configured.

Start the game

Clone or download the repository, then open a terminal in the project directory.

Using Node.js:

npm start

Using Python:

python -m http.server 8080

Open the following address in your browser:

"http://localhost:8080"

Select Play to start racing.

«Note: Opening "index.html" directly using "file://" is not supported because the game uses JavaScript ES modules and an import map.»

📁 Project Structure

rain-rift/
├── index.html
├── style.css
├── package.json
├── netlify.toml
├── assets/
│   └── favicon.svg
└── src/
    ├── main.js
    ├── ui.js
    ├── game.js
    ├── physics.js
    ├── ai.js
    ├── input.js
    ├── powerups.js
    ├── tracks.js
    ├── characters.js
    ├── vehicles.js
    ├── preview.js
    ├── audio.js
    ├── data.js
    └── storage.js

Core Systems

File| Responsibility
"main.js"| Initialization and main game loop
"game.js"| Race lifecycle, camera, rankings, and results
"physics.js"| Vehicle movement, drifting, and collisions
"ai.js"| Rival driving and difficulty behaviour
"tracks.js"| Procedural circuits and scenery
"vehicles.js"| Vehicle models and customization
"characters.js"| Racer models and animations
"powerups.js"| Item crates and power-up effects
"input.js"| Keyboard and touch input
"audio.js"| Sound effects, music, and engine audio
"preview.js"| 3D previews in selection menus
"ui.js"| Menus, HUD, settings, and results
"data.js"| Game content and configuration
"storage.js"| Local saves and player settings

💾 Save Data

Rain Rift uses browser "localStorage" to save:

- Game settings and audio preferences
- Selected racer and vehicle
- Vehicle paint colour
- Track records and race results
- Career statistics and leaderboard entries

All saved data stays in the current browser. There is no online account or server-side leaderboard, so progress does not automatically transfer between browsers or devices.

You can reset saved progress through the game's settings.

🖥️ Compatibility

Rain Rift is designed for modern versions of Chrome, Edge, Firefox, and Safari with WebGL support.

Graphics settings allow players to reduce rendering quality and disable shadows for better performance on less powerful devices. The interface also adapts to smaller screens and supported touch devices.

Performance may vary depending on your device and browser.

🧪 Development & Debugging

For development, the game exposes a "window.__TR" debug object with access to selected game systems and controls.

Example: start a race on Forest Rush at Hard difficulty from the browser console.

__TR.startRace({
  trackId: 'forest',
  difficulty: 'hard'
});

The project includes separate modules for game physics, AI, audio, rendering, input, and interface logic to make individual systems easier to maintain and improve.

🔒 Privacy

Rain Rift does not require registration, collect analytics through a game backend, or transmit locally saved race progress to a server.

Game settings and results are stored in your browser's local storage.

📜 Credits & License

Created by Zunnorain Carti

Built with "Three.js" (https://threejs.org/), distributed under the MIT License.

Rain Rift's game environments, models, effects, and audio are generated through code. Third-party libraries remain subject to their respective licenses.

The project is released under the MIT License. See the repository's license information for details.

---

Start your engine. Find your racing line. Own the track. 🏎️