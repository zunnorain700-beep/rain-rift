/**
 * data.js — static content database: racers, vehicles, tracks, difficulty, power-ups.
 * Pure data + tiny math helpers, no engine dependencies.
 */

/* ---------------------------------------------------------
   Small deterministic helpers
   --------------------------------------------------------- */
export const TAU = Math.PI * 2;
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;

/** Mulberry32 — tiny seeded RNG so scenery is stable between reloads. */
export function makeRng(seed) {
  let s = seed >>> 0;
  return function () {
    s |= 0; s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Closed Catmull-Rom through points [[x,z],...] → dense polyline. */
export function sampleClosedSpline(points, samples) {
  const n = points.length;
  const out = [];
  for (let i = 0; i < samples; i++) {
    const t = (i / samples) * n;
    const i1 = Math.floor(t) % n;
    const f = t - Math.floor(t);
    const p0 = points[(i1 - 1 + n) % n];
    const p1 = points[i1];
    const p2 = points[(i1 + 1) % n];
    const p3 = points[(i1 + 2) % n];
    const f2 = f * f, f3 = f2 * f;
    const x = 0.5 * ((2 * p1[0]) + (-p0[0] + p2[0]) * f +
      (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * f2 +
      (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * f3);
    const z = 0.5 * ((2 * p1[1]) + (-p0[1] + p2[1]) * f +
      (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * f2 +
      (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * f3);
    out.push([x, z]);
  }
  return out;
}

/* ---------------------------------------------------------
   RACERS — 4 original characters
   --------------------------------------------------------- */
export const CHARACTERS = [
  {
    id: 'nova',
    name: 'Nova Vega',
    role: 'Futuristic Street Racer',
    desc: 'Runs the midnight circuits of the glass district. Confident, quick, and always first to break formation.',
    traits: ['Boost affinity', 'Balanced'],
    stats: { speed: 4, accel: 4, handling: 4 },
    bonus: { speed: 0.03, accel: 0.04, handling: 0.03, grip: 0.01 },
    look: {
      suit: 0x12e0ff, suit2: 0x0a1a3c, trim: 0xff3d7f, skin: 0xf2c49b,
      hair: 0x1b1f3a, helmet: 'visor', accent: 0x7b5cff, visor: 0xffe98a
    },
    voice: { base: 300, rate: 1.15, blips: 4 },
    lines: ['Rift is mine!', 'Full throttle!', 'Watch this line!']
  },
  {
    id: 'kade',
    name: 'Rust Kade',
    role: 'Desert Explorer',
    desc: 'Cartographer of the red canyons. Calm under pressure and impossible to knock off a racing line.',
    traits: ['Steady grip', 'Crash resistant'],
    stats: { speed: 3, accel: 4, handling: 3 },
    bonus: { speed: 0.01, accel: 0.03, handling: 0.02, grip: 0.05 },
    look: {
      suit: 0xd9a066, suit2: 0x6b4a2f, trim: 0x2f9e8f, skin: 0xc98b5e,
      hair: 0x2b2118, helmet: 'scarf', accent: 0xf2e3c4, visor: 0x1b2b3a
    },
    voice: { base: 210, rate: 0.9, blips: 3 },
    lines: ['Sand remembers.', 'Easy does it.', 'Line is clear.']
  },
  {
    id: 'hex',
    name: 'Hex Marlow',
    role: 'Cyberpunk Driver',
    desc: 'Hacks rival telemetry mid-corner. Twists through traffic like smoke, then vanishes in the mirror.',
    traits: ['Sharp turn-in', 'Late braker'],
    stats: { speed: 3, accel: 5, handling: 5 },
    bonus: { speed: 0.0, accel: 0.05, handling: 0.05, grip: 0.0 },
    look: {
      suit: 0xff3d7f, suit2: 0x150a20, trim: 0x00e5ff, skin: 0xe8b89a,
      hair: 0x2de1d1, helmet: 'headset', accent: 0xffd23f, visor: 0x8affea
    },
    voice: { base: 340, rate: 1.3, blips: 5 },
    lines: ['Signal jammed.', 'Ghosting now.', 'Ping!']
  },
  {
    id: 'sterling',
    name: 'Sterling Vale',
    role: 'Racing Champion',
    desc: 'Three-time Rift Cup winner. Textbook technique, ice-cold nerves, and a smile for the podium.',
    traits: ['Top speed', 'Champion IQ'],
    stats: { speed: 5, accel: 3, handling: 3 },
    bonus: { speed: 0.05, accel: 0.0, handling: 0.01, grip: 0.02 },
    look: {
      suit: 0xf5f7ff, suit2: 0xc9a227, trim: 0xffd23f, skin: 0xf7d7b3,
      hair: 0x6b4a2f, helmet: 'crown', accent: 0x1b2b6b, visor: 0x9fd4ff
    },
    voice: { base: 250, rate: 1.0, blips: 4 },
    lines: ['Podium awaits.', 'Smooth and fast.', 'All yours.']
  }
];

/* ---------------------------------------------------------
   VEHICLES — 6 original karts
   --------------------------------------------------------- */
export const PAINTS = [
  0xff3d7f, 0x00e5ff, 0xffd23f, 0x3ddc97, 0x7b5cff,
  0xff6b2c, 0xf5f7ff, 0x1b2b6b, 0x12162e, 0xff9ee7
];

export const VEHICLES = [
  {
    id: 'spark', name: 'Spark GT', kind: 'Sport kart', type: 'sport',
    desc: 'Lightweight track weapon with a razor wedge nose. Rewards clean, fast lines.',
    good: 'Agile in corners', bad: 'Light — gets shoved around',
    stats: { speed: 4.5, accel: 4, handling: 4, stability: 3 },
    paint: 0xff3d7f,
    tune: { maxSpeed: 36, accel: 12.5, brake: 20, steer: 2.15, grip: 5.4, drift: 2.6, mass: 1.0, offroad: 0.72 }
  },
  {
    id: 'vandal', name: 'Vandal V8', kind: 'Muscle racer', type: 'muscle',
    desc: 'Big block thunder with a long hood. Devastating in a straight line, lazy on the brakes.',
    good: 'Brutal top speed', bad: 'Wide turning radius',
    stats: { speed: 5, accel: 3, handling: 2.5, stability: 4 },
    paint: 0x12162e,
    tune: { maxSpeed: 38.5, accel: 10.4, brake: 18, steer: 1.78, grip: 4.6, drift: 3.2, mass: 1.35, offroad: 0.6 }
  },
  {
    id: 'dune', name: 'Dune Strider', kind: 'Off-road buggy', type: 'buggy',
    desc: 'Long-travel suspension and knobbly tyres. Shrugs off sand, dirt and bad decisions.',
    good: 'Off-road monster', bad: 'Lower peak speed',
    stats: { speed: 3, accel: 4, handling: 4.5, stability: 4.5 },
    paint: 0xffd23f,
    tune: { maxSpeed: 33.5, accel: 12.8, brake: 19, steer: 2.3, grip: 5.6, drift: 2.4, mass: 1.1, offroad: 0.96 }
  },
  {
    id: 'trailhawk', name: 'Trailhawk RS', kind: 'Rally vehicle', type: 'rally',
    desc: 'Gravel-spec all-rounder with a tall wing. Nothing drama, everything pace.',
    good: 'Best all-rounder', bad: 'No real weakness',
    stats: { speed: 3.5, accel: 4, handling: 4, stability: 4 },
    paint: 0x00e5ff,
    tune: { maxSpeed: 34.8, accel: 11.6, brake: 19.5, steer: 2.16, grip: 5.2, drift: 2.7, mass: 1.12, offroad: 0.88 }
  },
  {
    id: 'ionflux', name: 'Ion Flux', kind: 'Electric racer', type: 'electric',
    desc: 'Instant torque, silent drivetrain, glowing aero. Leaves a cyan trail at full charge.',
    good: 'Explosive acceleration', bad: 'Unstable at the limit',
    stats: { speed: 4, accel: 5, handling: 4.5, stability: 3 },
    paint: 0x00e5ff,
    tune: { maxSpeed: 35.6, accel: 14.2, brake: 20.5, steer: 2.32, grip: 5.0, drift: 2.9, mass: 0.95, offroad: 0.68 }
  },
  {
    id: 'gravemaul', name: 'Gravemaul HX', kind: 'Heavy-duty truck', type: 'truck',
    desc: 'Armoured hauler with bull bars. Bullets through barriers and rivals alike.',
    good: 'Almost unstoppable', bad: 'Slow to turn in',
    stats: { speed: 2.5, accel: 2.5, handling: 2, stability: 5 },
    paint: 0x3ddc97,
    tune: { maxSpeed: 32.4, accel: 9.6, brake: 17, steer: 1.62, grip: 5.9, drift: 2.1, mass: 1.75, offroad: 0.86 }
  }
];

/* ---------------------------------------------------------
   TRACKS — 4 original circuits (shapes are procedural)
   --------------------------------------------------------- */
function superEllipse(count, rx, rz, n) {
  const pts = [];
  for (let i = 0; i < count; i++) {
    const a = (i / count) * TAU;
    const c = Math.cos(a), s = Math.sin(a);
    const k = 2 / n;
    pts.push([
      Math.sign(c) * Math.pow(Math.abs(c), k) * rx,
      Math.sign(s) * Math.pow(Math.abs(s), k) * rz
    ]);
  }
  return pts;
}
function radial(count, radius, fn) {
  const pts = [];
  for (let i = 0; i < count; i++) {
    const a = (i / count) * TAU;
    const r = radius * fn(a, i);
    pts.push([Math.cos(a) * r, Math.sin(a) * r]);
  }
  return pts;
}

function neonShape() {
  const pts = superEllipse(16, 246, 196, 3.6);
  // pull two adjacent stations inward for a street chicane
  pts[4][0] *= 0.8; pts[4][1] *= 0.8;
  pts[5][0] *= 0.84; pts[5][1] *= 0.84;
  return pts;
}
const desertShape = () => radial(15, 214, (a) => 1 + 0.26 * Math.sin(3 * a) + 0.1 * Math.cos(6 * a));
const coastShape = () => radial(14, 236, (a) => 1 + 0.2 * Math.cos(a) + 0.1 * Math.cos(2 * a - 0.6));
const forestShape = () => radial(17, 202, (a) => 1 + 0.23 * Math.sin(4 * a) + 0.08 * Math.cos(7 * a));

export const TRACKS = [
  {
    id: 'neon',
    name: 'Neon City',
    desc: 'A midnight street circuit between glow towers — long straights, one tight chicane.',
    biome: 'city',
    laps: 3, width: 17, seed: 1337,
    points: neonShape(),
    palette: {
      sky: 0x05070f, fog: 0x0a0f2a, ground: 0x0b0f22, road: 0x141a30,
      edge: 0x00e5ff, line: 0x7ef9ff, barrier: 0xff3d7f, deco: 0x1b2350,
      accent: 0x7b5cff, sun: 0x6f7bff, ambient: 0x3a4a8f
    },
    hazard: 'Barriers close in on the chicane exit',
    tags: ['Night', 'Fast', 'Street']
  },
  {
    id: 'desert',
    name: 'Desert Canyon',
    desc: 'Red rock switchbacks carved through the dunes. Wide, dusty and full of late-braking duels.',
    biome: 'desert',
    laps: 3, width: 19, seed: 4242,
    points: desertShape(),
    palette: {
      sky: 0xffcf8f, fog: 0xf2c187, ground: 0xd9a066, road: 0x8c6b4f,
      edge: 0xffe3b0, line: 0xfff4e0, barrier: 0xd95d39, deco: 0xc1663f,
      accent: 0xff8a3d, sun: 0xfff0d0, ambient: 0xd9b08a
    },
    hazard: 'Off-road sand kills your momentum',
    tags: ['Day', 'Technical', 'Dust']
  },
  {
    id: 'coast',
    name: 'Coastal Circuit',
    desc: 'Cliff-top sweepers above a turquoise sea. Pure speed with zero room for hesitation.',
    biome: 'coast',
    laps: 3, width: 18, seed: 909,
    points: coastShape(),
    palette: {
      sky: 0x8fd9ff, fog: 0xbfe9ff, ground: 0xe8dca8, road: 0x3b4152,
      edge: 0xffffff, line: 0xffffff, barrier: 0x2ea3ff, deco: 0x2f9e6f,
      accent: 0x00e5ff, sun: 0xfff8e0, ambient: 0xa9d7ff
    },
    hazard: 'Cliff-edge barriers at maximum speed',
    tags: ['Ocean', 'Fast', 'Flowing']
  },
  {
    id: 'forest',
    name: 'Forest Rush',
    desc: 'Tight woodland threading between ancient pines. Rhythm sections punish sloppy exits.',
    biome: 'forest',
    laps: 3, width: 15, seed: 2024,
    points: forestShape(),
    palette: {
      sky: 0x9ad7c3, fog: 0x86bfa8, ground: 0x2f6b3f, road: 0x4a4f45,
      edge: 0xd8e6c8, line: 0xf2f7e6, barrier: 0x8a5a2b, deco: 0x1f5a34,
      accent: 0x3ddc97, sun: 0xf6ffdf, ambient: 0x8fbf9a
    },
    hazard: 'Narrow road, trees on both sides',
    tags: ['Forest', 'Twisty', 'Technical']
  }
];

/* ---------------------------------------------------------
   DIFFICULTY — these numbers really drive gameplay
   --------------------------------------------------------- */
export const DIFFICULTIES = {
  easy: {
    id: 'easy', label: 'Easy',
    hint: 'Slower, sloppier rivals · forgiving grip and collisions · fewer hazards.',
    aiSpeed: 0.90, aiSkill: 0.35, aiAggression: 0.35, aiItems: 0.45,
    playerGrip: 0.16, steerAssist: 0.30, collisionLoss: 0.55,
    offroadPenalty: 0.65, hazardRate: 0.45, wallMargin: 1.15, rubberBand: 0.05
  },
  medium: {
    id: 'medium', label: 'Medium',
    hint: 'Quick, competitive rivals · later braking · more frequent power-ups.',
    aiSpeed: 1.05, aiSkill: 0.65, aiAggression: 0.70, aiItems: 0.8,
    playerGrip: 0.07, steerAssist: 0.12, collisionLoss: 0.78,
    offroadPenalty: 1.0, hazardRate: 0.75, wallMargin: 1.0, rubberBand: 0.04
  },
  hard: {
    id: 'hard', label: 'Hard',
    hint: 'Fast, aggressive rivals · late braking and frequent attacks · less grip assist.',
    aiSpeed: 1.20, aiSkill: 0.95, aiAggression: 1.0, aiItems: 1.0,
    playerGrip: 0.0, steerAssist: 0.0, collisionLoss: 1.0,
    offroadPenalty: 1.3, hazardRate: 1.0, wallMargin: 0.85, rubberBand: 0.02
  }
};

/* ---------------------------------------------------------
   POWER-UPS
   --------------------------------------------------------- */
export const POWERUPS = [
  { id: 'nitro', name: 'Nitro Boost', color: 0xffd23f, duration: 2.6, weight: 3 },
  { id: 'shield', name: 'Energy Shield', color: 0x00e5ff, duration: 7.0, weight: 2.5 },
  { id: 'oil', name: 'Oil Slick', color: 0x7b5cff, duration: 14, weight: 2.5 },
  { id: 'pulse', name: 'Pulse Wave', color: 0xff3d7f, duration: 1.6, weight: 2 }
];

export const POWERUP_ICONS = {
  nitro: '<svg viewBox="0 0 32 32" fill="none"><path d="M18 2 6 18h7l-3 12L26 12h-8l3-10z" fill="#ffd23f" stroke="#fff" stroke-width="1.4" stroke-linejoin="round"/></svg>',
  shield: '<svg viewBox="0 0 32 32" fill="none"><path d="M16 3l11 4v9c0 7-5 11-11 13C10 27 5 23 5 16V7l11-4z" fill="rgba(0,229,255,.35)" stroke="#00e5ff" stroke-width="2"/><path d="M11 16l4 4 7-8" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  oil: '<svg viewBox="0 0 32 32" fill="none"><path d="M16 3c6 8 10 11 10 16a10 10 0 1 1-20 0c0-5 4-8 10-16z" fill="rgba(123,92,255,.5)" stroke="#a99bff" stroke-width="2"/><ellipse cx="12" cy="19" rx="3" ry="4" fill="rgba(255,255,255,.55)"/></svg>',
  pulse: '<svg viewBox="0 0 32 32" fill="none"><circle cx="16" cy="16" r="4" fill="#ff3d7f"/><circle cx="16" cy="16" r="9" stroke="#ff7fa6" stroke-width="2"/><circle cx="16" cy="16" r="14" stroke="rgba(255,61,127,.5)" stroke-width="2" stroke-dasharray="4 4"/></svg>'
};

export const POINTS_TABLE = [10, 8, 6, 4, 2, 1];

export const SECTOR_COUNT = 8;
export const ITEM_SPOTS = 6;
export const MAX_KARTS = 6;

export function randomVehicle(rng) {
  return VEHICLES[Math.floor(rng() * VEHICLES.length)];
}
export function randomCharacter(rng) {
  return CHARACTERS[Math.floor(rng() * CHARACTERS.length)];
}
export function randomItem(rng) {
  const total = POWERUPS.reduce((s, p) => s + p.weight, 0);
  let r = rng() * total;
  for (const p of POWERUPS) { r -= p.weight; if (r <= 0) return p; }
  return POWERUPS[0];
}
export function ordinal(n) {
  const s = ['th', 'st', 'nd', 'rd'], v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}
export function formatTime(ms) {
  if (ms == null || !isFinite(ms)) return '--:--.--';
  const t = Math.max(0, ms);
  const m = Math.floor(t / 60000);
  const s = Math.floor((t % 60000) / 1000);
  const c = Math.floor((t % 1000) / 10);
  return `${m}:${String(s).padStart(2, '0')}.${String(c).padStart(2, '0')}`;
}
