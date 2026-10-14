/**
 * storage.js — LocalStorage persistence for settings, loadout, bests and leaderboards.
 * Everything stays in this browser; there is no backend.
 */

const KEY = 'rainrift.v1';

export const DEFAULTS = {
  settings: {
    master: 0.9,
    music: 0.6,
    sfx: 0.9,
    mute: false,
    voice: true,
    quality: 'medium',
    touch: 'auto',
    name: 'RACER'
  },
  loadout: {
    character: 'nova',
    vehicle: 'spark',
    paint: 0xff3d7f,      // hex colour (PAINTS[0]) — not a swatch index
    track: 'neon',
    difficulty: 'medium'
  },
  bests: {},
  stats: {
    races: 0,
    wins: 0,
    points: 0,
    bestFinish: null,
    bestLap: null,
    tracksCompleted: []
  },
  results: []
};

let cache = null;
let available = true;

function deepMerge(base, extra) {
  const out = Array.isArray(base) ? base.slice() : { ...base };
  if (!extra || typeof extra !== 'object') return out;
  for (const k of Object.keys(extra)) {
    const b = base ? base[k] : undefined;
    const e = extra[k];
    if (e && typeof e === 'object' && !Array.isArray(e) && b && typeof b === 'object' && !Array.isArray(b)) {
      out[k] = deepMerge(b, e);
    } else if (e !== undefined) {
      out[k] = e;
    }
  }
  return out;
}

function readRaw() {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (err) {
    available = false;
    return null;
  }
}

function writeRaw() {
  if (!available) return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(cache));
  } catch (err) {
    available = false; // quota or private mode — keep running in memory
  }
}

export const storage = {
  init() {
    cache = deepMerge(DEFAULTS, readRaw());
    if (!Array.isArray(cache.results)) cache.results = [];
    return cache;
  },
  get state() {
    if (!cache) this.init();
    return cache;
  },
  get settings() { return this.state.settings; },
  get loadout() { return this.state.loadout; },
  get available() { return available; },

  setSettings(patch) {
    Object.assign(this.state.settings, patch);
    writeRaw();
    return this.state.settings;
  },
  setLoadout(patch) {
    Object.assign(this.state.loadout, patch);
    writeRaw();
    return this.state.loadout;
  },

  /** Record a finished race. Returns the points earned. */
  recordResult(entry) {
    const s = this.state;
    s.stats.races += 1;
    if (entry.position === 1) s.stats.wins += 1;
    s.stats.points += entry.points;
    if (s.stats.bestFinish == null || entry.position < s.stats.bestFinish) {
      s.stats.bestFinish = entry.position;
    }
    if (entry.bestLap != null && (s.stats.bestLap == null || entry.bestLap < s.stats.bestLap)) {
      s.stats.bestLap = entry.bestLap;
    }
    if (!s.stats.tracksCompleted.includes(entry.trackId)) {
      s.stats.tracksCompleted.push(entry.trackId);
    }

    const best = s.bests[entry.trackId] || {};
    if (entry.time != null && (best.time == null || entry.time < best.time)) best.time = entry.time;
    if (entry.bestLap != null && (best.lap == null || entry.bestLap < best.lap)) best.lap = entry.bestLap;
    if (best.pos == null || entry.position < best.pos) best.pos = entry.position;
    s.bests[entry.trackId] = best;

    entry.id = `${Date.now()}-${Math.floor(Math.random() * 1e5)}`;
    s.results.unshift(entry);
    if (s.results.length > 60) s.results.length = 60;
    writeRaw();
    return entry;
  },

  renameResult(id, name) {
    const r = this.state.results.find((x) => x.id === id);
    if (r) { r.name = name; writeRaw(); }
  },
  lastName() {
    const r = this.state.results[0];
    return r ? r.name : this.state.settings.name;
  },
  clearResults() {
    this.state.results = [];
    writeRaw();
  },
  reset() {
    cache = JSON.parse(JSON.stringify(DEFAULTS));
    try { window.localStorage.removeItem(KEY); } catch (err) { /* ignore */ }
    writeRaw();
    return cache;
  }
};
