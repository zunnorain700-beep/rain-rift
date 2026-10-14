/**
 * main.js — bootstrap: WebGL detection, loading sequence, global loop,
 * race lifecycle and pause handling.
 */
import { TRACKS } from './data.js';
import { storage } from './storage.js';
import { AudioEngine } from './audio.js';
import { Input, isTouchDevice } from './input.js';
import { UI } from './ui.js';
import { Race } from './game.js';

const loadingFill = document.getElementById('load-fill');
const loadingStatus = document.getElementById('load-status');

function setProgress(pct, text) {
  if (loadingFill) loadingFill.style.width = `${Math.max(0, Math.min(100, pct))}%`;
  if (text && loadingStatus) loadingStatus.textContent = text;
}

function wait(ms) { return new Promise((r) => setTimeout(r, ms)); }

function webglSupported() {
  try {
    if (!window.WebGLRenderingContext) return false;
    const c = document.createElement('canvas');
    const gl = c.getContext('webgl2') || c.getContext('webgl') || c.getContext('experimental-webgl');
    if (!gl) return false;
    const ext = gl.getExtension('WEBGL_lose_context');
    if (ext) ext.loseContext();
    return true;
  } catch (err) {
    return false;
  }
}

/* ---------------------------------------------------------- */
let ui = null;
let race = null;
let hud = null;
let paused = false;
let lastConfig = null;

function startRace(config) {
  try {
    if (!ui || !hud) { console.warn('UI not ready yet'); return; }
    if (race) { race.dispose(); race = null; }
    lastConfig = { ...config };
    paused = false;
    const trackDef = TRACKS.find((t) => t.id === config.trackId) || TRACKS[0];
    ui.show('race');
    ui.showPause(false);
    hud.clear();
    race = new Race({
      canvas: document.getElementById('race-canvas'),
      hud,
      audio,
      input,
      config,
      trackDef,
      onEnd: (res) => {
        if (race) { race.dispose(); race = null; }
        paused = false;
        ui.showResults(res);
      }
    });
    race.start();
  } catch (err) {
    console.error('Race failed to start', err);
    if (race) { try { race.dispose(); } catch (e) { /* ignore */ } race = null; }
    ui.show('menu');
    window.alert('The race could not start on this device. Try lowering the graphics quality in Settings.');
  }
}

function quitToMenu() {
  if (race) { race.dispose(); race = null; }
  paused = false;
  ui.showPause(false);
  ui.show('menu');
}

function togglePause(force) {
  if (!race || race.state === 'done' || race.contextLost) return;
  const next = typeof force === 'boolean' ? force : !paused;
  if (next === paused) return;
  paused = next;
  if (paused) { race.pause(); ui.showPause(true); }
  else { race.resume(); ui.showPause(false); }
}

/* ---------------------------------------------------------- */
const audio = new AudioEngine();
const input = new Input({ onPause: () => togglePause() });

async function boot() {
  setProgress(6, 'Loading core systems…');
  storage.init();
  audio.applySettings(storage.settings);
  input.attach();

  setProgress(24, 'Checking 3D support…');
  await wait(160);
  if (!webglSupported()) {
    document.getElementById('screen-loading').classList.remove('is-active');
    document.getElementById('screen-nogl').classList.add('is-active');
    return;
  }

  setProgress(44, 'Building interface…');
  hud = null;
  ui = new UI({
    audio,
    input,
    callbacks: {
      startRace: (cfg) => startRace(cfg),
      raceAgain: () => startRace(ui.getConfig()),
      onLeaveRace: () => { if (race) { race.dispose(); race = null; } paused = false; ui.showPause(false); }
    }
  });
  ui.init();
  hud = ui.createHud();
  await wait(140);

  setProgress(68, 'Generating racers and karts…');
  await wait(180);

  setProgress(88, 'Preparing tracks…');
  _bindRaceControls();
  await wait(180);

  setProgress(100, 'Ready');
  await wait(320);

  document.getElementById('screen-loading').classList.remove('is-active');
  ui.show('menu');
  startLoop();

  // unlock audio on the first gesture (browser autoplay policy)
  const unlock = () => {
    audio.unlock();
    if (ui.current === 'menu' || ui.current !== 'race') audio.startMusic('menu');
  };
  window.addEventListener('pointerdown', unlock, { once: false });
  window.addEventListener('keydown', unlock, { once: false });
}

function _bindRaceControls() {
  document.getElementById('btn-pause').addEventListener('click', () => togglePause(true));
  document.getElementById('btn-resume').addEventListener('click', () => togglePause(false));
  document.getElementById('btn-restart').addEventListener('click', () => {
    audio.menuClick();
    if (lastConfig) startRace(ui.getConfig());
  });
  document.getElementById('btn-quit').addEventListener('click', () => {
    audio.menuBack();
    quitToMenu();
  });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && race && !paused) togglePause(true);
  });

  // auto-switch touch controls on hybrid devices
  if (isTouchDevice() && storage.settings.touch === 'auto') ui.applyTouchSetting();
}

/* ---------------------------------------------------------- */
let lastT = performance.now();
function startLoop() {
  lastT = performance.now();
  requestAnimationFrame(loop);
}

function loop(now) {
  const dt = Math.min(0.05, (now - lastT) / 1000);
  lastT = now;
  try {
    if (race && !document.hidden) race.update(dt);
    ui.tickPreviews(dt);
  } catch (err) {
    console.error('Frame error', err);
  }
  requestAnimationFrame(loop);
}

window.addEventListener('error', (e) => {
  console.error('Uncaught error', e.error || e.message);
});
window.addEventListener('unhandledrejection', (e) => {
  console.error('Unhandled promise rejection', e.reason);
});

// Lightweight debug/inspection handle (harmless in production).
window.__TR = {
  get race() { return race; },
  get ui() { return ui; },
  input, audio, startRace, togglePause, quitToMenu
};

boot();
