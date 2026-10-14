/**
 * ui.js — every screen, selection control, HUD bridge and leaderboard view.
 */
import {
  CHARACTERS, VEHICLES, TRACKS, DIFFICULTIES, POWERUP_ICONS, PAINTS,
  formatTime, ordinal, clamp
} from './data.js';
import { drawTrackPreview } from './tracks.js';
import { Preview } from './preview.js';
import { storage } from './storage.js';
import { isTouchDevice } from './input.js';

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

const SCREENS = ['loading', 'nogl', 'menu', 'characters', 'garage', 'tracks', 'race', 'results', 'leaderboard', 'settings', 'howto'];

/**
 * Paints are stored as hex colours, but older saves kept the swatch index —
 * which would build a black kart. Small integers are treated as indexes.
 */
function normalizePaint(value, vehIndex) {
  const i = Math.max(0, vehIndex);
  const fallback = (VEHICLES[i] && VEHICLES[i].paint) || PAINTS[0];
  if (typeof value !== 'number' || !isFinite(value) || value < 0) return fallback;
  if (Number.isInteger(value) && value < PAINTS.length) return PAINTS[value];
  return value;
}

export class UI {
  constructor({ audio, input, callbacks }) {
    this.audio = audio;
    this.input = input;
    this.cb = callbacks || {};
    this.current = 'loading';
    this.charIndex = Math.max(0, CHARACTERS.findIndex((c) => c.id === storage.loadout.character));
    this.vehIndex = Math.max(0, VEHICLES.findIndex((v) => v.id === storage.loadout.vehicle));
    this.paint = normalizePaint(storage.loadout.paint, this.vehIndex);
    this.trackIndex = Math.max(0, TRACKS.findIndex((t) => t.id === storage.loadout.track));
    this.difficulty = storage.loadout.difficulty || 'medium';
    this.previews = {};
    this._toastTimer = null;
    this._mm = null;
    this._menuAnim = null;
    this.lastResultId = null;
    this.el = {};
  }

  /* ================================================= boot */
  init() {
    const sel = [
      'load-fill', 'load-status', 'screen-nogl', 'btn-retry-webgl',
      'menu-char-name', 'menu-vehicle-name', 'menu-best', 'menu-canvas',
      'char-canvas', 'char-name', 'char-role', 'char-desc', 'char-traits',
      'bar-char-speed', 'bar-char-accel', 'bar-char-handling',
      'garage-canvas', 'veh-name', 'veh-class', 'veh-desc', 'veh-good', 'veh-bad',
      'bar-veh-speed', 'bar-veh-accel', 'bar-veh-handling', 'bar-veh-stability',
      'paint-swatches', 'vehicle-list', 'track-grid', 'difficulty-hint',
      'start-loadout', 'start-track-meta', 'btn-start-race',
      'hud-pos', 'hud-lap', 'hud-time', 'hud-speed', 'minimap', 'dial-fill',
      'dial-needle', 'item-slot', 'item-icon', 'item-name', 'boost-fill',
      'countdown', 'toast', 'pause-overlay', 'pause-meta', 'hud-lap-times',
      'res-track', 'res-position', 'res-subtitle', 'res-time', 'res-bestlap',
      'res-points', 'res-difficulty', 'res-standings', 'res-name', 'res-saved',
      'stats-grid', 'lb-body', 'lb-empty', 'quality-hint',
      'set-master', 'set-music', 'set-sfx', 'set-mute', 'set-voice', 'set-name',
      'set-touch', 'val-master', 'val-music', 'val-sfx', 'touch-controls'
    ];
    sel.forEach((id) => { this.el[id] = document.getElementById(id); });

    this._bindNav();
    this._buildCharacterScreen();
    this._buildGarage();
    this._buildTrackScreen();
    this._buildSettings();
    this._buildResults();
    this._bindGlobalKeys();
    this._fillItemChips();
    this.updateMenu();
    this.applyTouchSetting();
  }

  /* ================================================= navigation */
  _bindNav() {
    $$('[data-nav]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const target = btn.dataset.nav;
        this.audio.unlock();
        this.audio.menuClick();
        this.show(target);
      });
    });
    this.el['btn-retry-webgl'].addEventListener('click', () => location.reload());
  }

  _bindGlobalKeys() {
    // focus states should not swallow game keys
    document.addEventListener('focusin', (e) => {
      if (e.target && e.target.tagName === 'INPUT') e.target.blur();
    });
  }

  show(name) {
    if (!SCREENS.includes(name)) return;
    const prev = this.current;
    if (prev === 'race' && name !== 'race') this.cb.onLeaveRace && this.cb.onLeaveRace();

    $$('.screen').forEach((s) => s.classList.remove('is-active'));
    const el = document.getElementById(`screen-${name}`);
    if (el) el.classList.add('is-active');
    this.current = name;

    /* preview lifecycle */
    Object.values(this.previews).forEach((p) => p.stop());
    if (name === 'characters') this._ensurePreview('character').start();
    if (name === 'garage') this._ensurePreview('garage').start();

    if (name === 'characters') this._renderCharacter();
    if (name === 'garage') this._renderVehicle();
    if (name === 'tracks') this._renderTrackScreen();
    if (name === 'leaderboard') this.renderLeaderboard();
    if (name === 'settings') this._syncSettings();

    if (name === 'menu' || name === 'tracks' || name === 'characters' || name === 'garage' ||
        name === 'leaderboard' || name === 'settings' || name === 'howto') {
      this.audio.startMusic('menu');
      this._startMenuAnim(name === 'menu');
    } else {
      this._startMenuAnim(false);
    }
  }

  _ensurePreview(kind) {
    if (this.previews[kind]) return this.previews[kind];
    const canvas = kind === 'character' ? this.el['char-canvas'] : this.el['garage-canvas'];
    const p = new Preview(canvas, kind, storage.settings.quality);
    this.previews[kind] = p;
    requestAnimationFrame(() => p.resize());
    return p;
  }

  tickPreviews(dt) {
    Object.values(this.previews).forEach((p) => p.update(dt));
    this._tickMenuAnim(dt);
  }

  /* ================================================= menu background */
  _startMenuAnim(on) {
    const canvas = this.el['menu-canvas'];
    if (!canvas || !on) { this._menuOn = false; return; }
    if (!this._menuCtx) {
      canvas.width = 900; canvas.height = 600;
      this._menuCtx = canvas.getContext('2d');
      this._stars = Array.from({ length: 70 }, () => ({
        x: Math.random() * 900, y: Math.random() * 600,
        s: 0.3 + Math.random() * 1.6, v: 6 + Math.random() * 26,
        c: ['#00e5ff', '#ff3d7f', '#ffd23f', '#7b5cff'][Math.floor(Math.random() * 4)]
      }));
      this._menuT = 0;
    }
    this._menuOn = true;
  }

  _tickMenuAnim(dt) {
    if (!this._menuOn || !this._menuCtx) return;
    const g = this._menuCtx;
    this._menuT += dt;
    g.clearRect(0, 0, 900, 600);
    g.fillStyle = 'rgba(6,10,26,.35)';
    g.fillRect(0, 0, 900, 600);
    // perspective road lines
    const horizon = 300;
    g.strokeStyle = 'rgba(0,229,255,.28)';
    g.lineWidth = 2;
    for (let i = 0; i < 14; i++) {
      const z = ((i / 14) + (this._menuT * 0.16) % (1 / 14)) % 1;
      const y = horizon + Math.pow(z, 2.4) * 320;
      g.globalAlpha = 0.15 + z * 0.5;
      g.beginPath(); g.moveTo(0, y); g.lineTo(900, y); g.stroke();
    }
    g.globalAlpha = 1;
    for (const s of this._stars) {
      s.x -= s.v * dt;
      if (s.x < -10) { s.x = 910; s.y = Math.random() * 600; }
      g.fillStyle = s.c;
      g.globalAlpha = 0.55;
      g.fillRect(s.x, s.y, s.s * 3, s.s);
    }
    g.globalAlpha = 1;
  }

  /* ================================================= characters */
  _buildCharacterScreen() {
    $('#char-prev').addEventListener('click', () => { this.audio.menuClick(); this._cycleChar(-1); });
    $('#char-next').addEventListener('click', () => { this.audio.menuClick(); this._cycleChar(1); });
    $('#char-confirm').addEventListener('click', () => {
      const c = CHARACTERS[this.charIndex];
      storage.setLoadout({ character: c.id });
      this.audio.select();
      this.updateMenu();
      this._renderCharacter();
      this.show('menu');
    });
  }

  _cycleChar(dir) {
    this.charIndex = (this.charIndex + dir + CHARACTERS.length) % CHARACTERS.length;
    this._renderCharacter();
  }

  _renderCharacter() {
    const c = CHARACTERS[this.charIndex];
    this.el['char-name'].textContent = c.name;
    this.el['char-role'].textContent = c.role;
    this.el['char-desc'].textContent = c.desc;
    this.el['bar-char-speed'].style.width = `${(c.stats.speed / 5) * 100}%`;
    this.el['bar-char-accel'].style.width = `${(c.stats.accel / 5) * 100}%`;
    this.el['bar-char-handling'].style.width = `${(c.stats.handling / 5) * 100}%`;
    this.el['char-traits'].innerHTML = c.traits.map((t) => `<span class="pill pill--good">${t}</span>`).join('') +
      (c.id === storage.loadout.character ? '<span class="pill">Selected</span>' : '');
    const p = this._ensurePreview('character');
    p.setCharacter(this.charIndex, c);
    p.start();
  }

  /* ================================================= garage */
  _buildGarage() {
    const list = this.el['vehicle-list'];
    list.innerHTML = '';
    VEHICLES.forEach((v, i) => {
      const card = document.createElement('button');
      card.className = 'vcard';
      card.type = 'button';
      card.setAttribute('role', 'option');
      card.innerHTML = `<b>${v.name}</b><span>${v.kind}</span><i style="width:${(v.stats.speed / 5) * 100}%"></i>`;
      card.addEventListener('click', () => {
        this.vehIndex = i;
        this.paint = VEHICLES[i].paint;
        this.audio.menuClick();
        this._renderVehicle();
      });
      list.appendChild(card);
    });

    const sw = this.el['paint-swatches'];
    sw.innerHTML = '';
    PAINTS.forEach((hex, i) => {
      const b = document.createElement('button');
      b.className = 'sw';
      b.type = 'button';
      b.title = `Paint ${i + 1}`;
      b.style.background = `#${hex.toString(16).padStart(6, '0')}`;
      b.addEventListener('click', () => {
        this.paint = hex;
        this.audio.menuClick();
        this._renderVehicle();
      });
      sw.appendChild(b);
    });

    $('#garage-confirm').addEventListener('click', () => {
      const v = VEHICLES[this.vehIndex];
      storage.setLoadout({ vehicle: v.id, paint: this.paint });
      this.audio.select();
      this.updateMenu();
      this.show('menu');
    });
  }

  _renderVehicle() {
    const v = VEHICLES[this.vehIndex];
    this.el['veh-name'].textContent = v.name;
    this.el['veh-class'].textContent = v.kind;
    this.el['veh-desc'].textContent = v.desc;
    this.el['veh-good'].textContent = v.good;
    this.el['veh-bad'].textContent = v.bad;
    this.el['bar-veh-speed'].style.width = `${(v.stats.speed / 5) * 100}%`;
    this.el['bar-veh-accel'].style.width = `${(v.stats.accel / 5) * 100}%`;
    this.el['bar-veh-handling'].style.width = `${(v.stats.handling / 5) * 100}%`;
    this.el['bar-veh-stability'].style.width = `${(v.stats.stability / 5) * 100}%`;
    $$('#vehicle-list .vcard').forEach((c, i) => c.classList.toggle('is-on', i === this.vehIndex));
    $$('#paint-swatches .sw').forEach((b, i) => b.classList.toggle('is-on', PAINTS[i] === this.paint));
    const p = this._ensurePreview('garage');
    if (!p.model || p.model.userData.def !== v) p.setVehicle(this.vehIndex, v, this.paint);
    else p.updatePaint(this.paint);
    p.start();
  }

  /* ================================================= tracks */
  _buildTrackScreen() {
    const grid = this.el['track-grid'];
    grid.innerHTML = '';
    TRACKS.forEach((t, i) => {
      const card = document.createElement('button');
      card.className = 'tcard';
      card.type = 'button';
      card.innerHTML = `
        <canvas></canvas>
        <div class="tcard__body">
          <b>${t.name}</b>
          <p>${t.desc}</p>
          <div class="tags">
            ${t.tags.map((x) => `<span class="tag">${x}</span>`).join('')}
            <span class="tag tag--hot">${t.hazard}</span>
          </div>
        </div>`;
      card.addEventListener('click', () => {
        this.trackIndex = i;
        storage.setLoadout({ track: t.id });
        this.audio.menuClick();
        this._renderTrackScreen();
      });
      card.addEventListener('dblclick', () => this._startRace());
      grid.appendChild(card);
      const canvas = card.querySelector('canvas');
      requestAnimationFrame(() => drawTrackPreview(canvas, t));
    });

    $$('#difficulty-group .seg').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.difficulty = btn.dataset.difficulty;
        storage.setLoadout({ difficulty: this.difficulty });
        this.audio.menuClick();
        this._renderTrackScreen();
      });
    });

    this.el['btn-start-race'].addEventListener('click', () => this._startRace());
  }

  _renderTrackScreen() {
    $$('#track-grid .tcard').forEach((c, i) => c.classList.toggle('is-on', i === this.trackIndex));
    // previews need a visible layout to size their backing store
    requestAnimationFrame(() => {
      $$('#track-grid .tcard').forEach((card, i) => {
        const canvas = card.querySelector('canvas');
        if (canvas && TRACKS[i]) drawTrackPreview(canvas, TRACKS[i]);
      });
    });
    $$('#difficulty-group .seg').forEach((b) => b.classList.toggle('is-on', b.dataset.difficulty === this.difficulty));
    const d = DIFFICULTIES[this.difficulty];
    this.el['difficulty-hint'].textContent = d.hint;
    const ch = CHARACTERS[this.charIndex];
    const v = VEHICLES[this.vehIndex];
    this.el['start-loadout'].textContent = `${ch.name} · ${v.name}`;
    const t = TRACKS[this.trackIndex];
    this.el['start-track-meta'].textContent = `${t.name} · ${t.laps} laps · ${d.label}`;
  }

  getConfig() {
    return {
      trackId: TRACKS[this.trackIndex].id,
      difficulty: this.difficulty,
      characterId: CHARACTERS[this.charIndex].id,
      vehicleId: VEHICLES[this.vehIndex].id,
      paint: this.paint,
      quality: storage.settings.quality,
      playerName: storage.settings.name
    };
  }

  _startRace() {
    const cfg = this.getConfig();
    storage.setLoadout({
      track: cfg.trackId, difficulty: cfg.difficulty,
      character: cfg.characterId, vehicle: cfg.vehicleId, paint: cfg.paint
    });
    this.audio.unlock();
    this.audio.select();
    this.cb.startRace && this.cb.startRace(cfg);
  }

  /* ================================================= results */
  _buildResults() {
    $('#btn-race-again').addEventListener('click', () => { this.audio.menuClick(); this.cb.raceAgain && this.cb.raceAgain(); });
    $('#btn-next-track').addEventListener('click', () => {
      this.audio.menuClick();
      this.trackIndex = (this.trackIndex + 1) % TRACKS.length;
      storage.setLoadout({ track: TRACKS[this.trackIndex].id });
      this.cb.raceAgain && this.cb.raceAgain();
    });
    this.el['res-name'].addEventListener('change', () => {
      const name = this._cleanName(this.el['res-name'].value);
      this.el['res-name'].value = name;
      storage.setSettings({ name });
      if (this.lastResultId) storage.renameResult(this.lastResultId, name);
      this.el['res-saved'].textContent = 'Name updated on the local leaderboard.';
    });
  }

  _cleanName(v) {
    const s = String(v || '').replace(/[^\w \-]/g, '').trim().slice(0, 14);
    return s.toUpperCase() || 'RACER';
  }

  showResults(r) {
    const pos = r.position;
    this.el['res-track'].textContent = `${r.trackName} · ${r.laps} laps`;
    this.el['res-position'].textContent = ordinal(pos);
    this.el['res-subtitle'].textContent =
      pos === 1 ? 'Victory! The rift is yours.' :
      pos <= 3 ? 'Podium finish — strong drive.' : 'Every lap counts. Go again.';
    this.el['res-time'].textContent = formatTime(r.time);
    this.el['res-bestlap'].textContent = r.bestLap ? formatTime(r.bestLap) : '—';
    this.el['res-points'].textContent = `+${r.points}`;
    this.el['res-difficulty'].textContent = r.difficultyLabel;

    const ol = this.el['res-standings'];
    ol.innerHTML = '';
    const fallbackName = this._cleanName(r.playerName || storage.settings.name);
    (r.standings.length ? r.standings : [{ rank: pos, name: fallbackName, isPlayer: true, finished: true, finishTime: r.time / 1000 }])
      .sort((a, b) => a.rank - b.rank)
      .forEach((s) => {
        const li = document.createElement('li');
        li.className = s.isPlayer ? 'is-player' : '';
        li.innerHTML = `<span>${ordinal(s.rank)} · ${escapeHtml(s.name)} <small>(${escapeHtml(s.vehName || '')})</small></span>
          <span>${s.finished ? formatTime(s.finishTime * 1000) : 'racing…'}</span>`;
        ol.appendChild(li);
      });

    const name = fallbackName;
    this.el['res-name'].value = name;
    const saved = storage.recordResult({
      name,
      position: pos,
      time: r.time,
      bestLap: r.bestLap,
      points: r.points,
      trackId: r.trackId,
      trackName: r.trackName,
      difficulty: r.difficulty,
      difficultyLabel: r.difficultyLabel,
      vehicleId: r.vehicleId,
      vehicleName: r.vehicleName,
      characterName: r.characterName,
      laps: r.laps,
      date: Date.now()
    });
    this.lastResultId = saved.id;
    this.el['res-saved'].textContent = storage.available
      ? 'Saved to this browser’s local leaderboard.'
      : 'Storage unavailable — result kept for this session only.';
    this.updateMenu();
    this.show('results');
  }

  /* ================================================= leaderboard */
  renderLeaderboard() {
    const st = storage.state;
    const cards = [
      ['Total races', st.stats.races],
      ['Race wins', st.stats.wins],
      ['Best lap', st.stats.bestLap ? formatTime(st.stats.bestLap) : '—'],
      ['Best finish', st.stats.bestFinish ? ordinal(st.stats.bestFinish) : '—'],
      ['Total points', st.stats.points],
      ['Tracks cleared', `${st.stats.tracksCompleted.length}/${TRACKS.length}`]
    ];
    this.el['stats-grid'].innerHTML = cards
      .map(([label, val]) => `<div class="stat-card"><span>${label}</span><b>${val}</b></div>`)
      .join('');

    const rows = st.results;
    this.el['lb-empty'].style.display = rows.length ? 'none' : 'block';
    this.el['lb-body'].innerHTML = rows.map((r, i) => `
      <tr>
        <td>${i + 1}</td>
        <td>${escapeHtml(r.name)}</td>
        <td class="pos-${r.position}">${ordinal(r.position)}</td>
        <td>${escapeHtml(r.vehicleName || '')}</td>
        <td>${formatTime(r.time)}</td>
        <td>${escapeHtml(r.trackName || '')}</td>
        <td>${escapeHtml(r.difficultyLabel || '')}</td>
        <td>${new Date(r.date).toLocaleDateString()}</td>
      </tr>`).join('');

    const clearBtn = $('#btn-clear-races');
    if (!clearBtn._bound) {
      clearBtn._bound = true;
      clearBtn.addEventListener('click', () => {
        if (rows.length && window.confirm('Clear the local race log?')) {
          storage.clearResults();
          this.audio.menuBack();
          this.renderLeaderboard();
        }
      });
    }
  }

  /* ================================================= settings */
  _buildSettings() {
    const s = storage.settings;
    const bindRange = (id, key, label) => {
      const input = this.el[id];
      input.value = Math.round(s[key] * 100);
      this.el[label].textContent = `${Math.round(s[key] * 100)}%`;
      input.addEventListener('input', () => {
        const v = Number(input.value) / 100;
        this.el[label].textContent = `${input.value}%`;
        storage.setSettings({ [key]: v });
        this.audio.applySettings({ [key]: v });
      });
    };
    bindRange('set-master', 'master', 'val-master');
    bindRange('set-music', 'music', 'val-music');
    bindRange('set-sfx', 'sfx', 'val-sfx');

    this.el['set-mute'].checked = s.mute;
    this.el['set-mute'].addEventListener('change', (e) => {
      storage.setSettings({ mute: e.target.checked });
      this.audio.applySettings({ mute: e.target.checked });
      this.audio.menuClick();
    });
    this.el['set-voice'].checked = s.voice;
    this.el['set-voice'].addEventListener('change', (e) => {
      storage.setSettings({ voice: e.target.checked });
      this.audio.applySettings({ voice: e.target.checked });
    });
    this.el['set-touch'].checked = s.touch === 'always';
    this.el['set-touch'].addEventListener('change', (e) => {
      storage.setSettings({ touch: e.target.checked ? 'always' : 'auto' });
      this.applyTouchSetting();
    });

    const nameInput = this.el['set-name'];
    nameInput.value = s.name;
    nameInput.addEventListener('change', () => {
      const name = this._cleanName(nameInput.value);
      nameInput.value = name;
      storage.setSettings({ name });
      this.updateMenu();
    });

    $$('#quality-group .seg').forEach((btn) => {
      btn.addEventListener('click', () => {
        const q = btn.dataset.quality;
        storage.setSettings({ quality: q });
        $$('#quality-group .seg').forEach((b) => b.classList.toggle('is-on', b === btn));
        this.el['quality-hint'].textContent =
          q === 'low' ? 'Fastest — reduced resolution, no shadows, less scenery.' :
          q === 'high' ? 'Fullest visuals — shadows and dense scenery.' :
          'Balanced visuals and frame rate.';
        this.audio.menuClick();
      });
    });

    $('#btn-reset-progress').addEventListener('click', () => {
      if (!window.confirm('Erase settings, personal bests and the local leaderboard?')) return;
      storage.reset();
      this.audio.menuBack();
      this._syncSettings();
      this.updateMenu();
      this.renderLeaderboard();
      this.el['res-saved'].textContent = 'Saved data cleared.';
    });
  }

  _syncSettings() {
    const s = storage.settings;
    this.el['set-master'].value = Math.round(s.master * 100);
    this.el['set-music'].value = Math.round(s.music * 100);
    this.el['set-sfx'].value = Math.round(s.sfx * 100);
    this.el['val-master'].textContent = `${Math.round(s.master * 100)}%`;
    this.el['val-music'].textContent = `${Math.round(s.music * 100)}%`;
    this.el['val-sfx'].textContent = `${Math.round(s.sfx * 100)}%`;
    this.el['set-mute'].checked = s.mute;
    this.el['set-voice'].checked = s.voice;
    this.el['set-touch'].checked = s.touch === 'always';
    this.el['set-name'].value = s.name;
    $$('#quality-group .seg').forEach((b) => b.classList.toggle('is-on', b.dataset.quality === s.quality));
  }

  applyTouchSetting() {
    const on = storage.settings.touch === 'always' || (storage.settings.touch === 'auto' && isTouchDevice());
    this.el['touch-controls'].classList.toggle('is-on', on);
    this.el['touch-controls'].setAttribute('aria-hidden', on ? 'false' : 'true');
  }

  updateMenu() {
    const ch = CHARACTERS.find((c) => c.id === storage.loadout.character) || CHARACTERS[0];
    const v = VEHICLES.find((x) => x.id === storage.loadout.vehicle) || VEHICLES[0];
    this.el['menu-char-name'].textContent = ch.name;
    this.el['menu-vehicle-name'].textContent = v.name;
    const st = storage.state;
    this.el['menu-best'].textContent = st.stats.races
      ? `${ordinal(st.stats.bestFinish || 6)} best · ${st.stats.points} pts`
      : 'No races yet';
    this.charIndex = Math.max(0, CHARACTERS.findIndex((c) => c.id === ch.id));
    this.vehIndex = Math.max(0, VEHICLES.findIndex((x) => x.id === v.id));
    this.paint = normalizePaint(storage.loadout.paint, this.vehIndex);
  }

  _fillItemChips() {
    $$('.item-chip').forEach((el) => {
      el.innerHTML = POWERUP_ICONS[el.dataset.item] || '';
    });
  }

  /* ================================================= pause */
  showPause(show) {
    this.el['pause-overlay'].hidden = !show;
    const t = TRACKS.find((x) => x.id === storage.loadout.track);
    const d = DIFFICULTIES[storage.loadout.difficulty];
    this.el['pause-meta'].textContent = `${t ? t.name : ''} · ${d ? d.label : ''}`;
  }

  /* ================================================= HUD bridge */
  createHud() {
    const el = this.el;
    return {
      countdown: (text, isGo) => {
        const c = el.countdown;
        c.textContent = text;
        c.classList.remove('show', 'go');
        if (!text) return;
        void c.offsetWidth;
        c.classList.add('show');
        if (isGo) c.classList.add('go');
      },
      speed: (kmh) => {
        el['hud-speed'].textContent = String(kmh);
        const ratio = clamp(kmh / 240, 0, 1);
        el['dial-fill'].style.strokeDashoffset = String(251 * (1 - ratio));
        el['dial-needle'].style.transform = `rotate(${-90 + ratio * 180}deg)`;
      },
      position: (rank, total) => { el['hud-pos'].textContent = `${rank}/${total}`; },
      lap: (cur, total) => { el['hud-lap'].textContent = `${cur}/${total}`; },
      time: (ms) => { el['hud-time'].textContent = formatTime(ms); },
      lapTimes: (times) => {
        el['hud-lap-times'].innerHTML = times.map((t, i) =>
          `<div>L${i + 1}<b>${formatTime(t * 1000)}</b></div>`).join('');
      },
      item: (item) => {
        const slot = el['item-slot'];
        if (item) {
          slot.classList.add('has-item');
          el['item-icon'].innerHTML = POWERUP_ICONS[item.id] || '';
          el['item-icon'].dataset.item = item.id;
          el['item-name'].textContent = item.name;
        } else {
          slot.classList.remove('has-item');
          el['item-icon'].innerHTML = '';
          el['item-icon'].dataset.item = '';
          el['item-name'].textContent = 'No item';
        }
      },
      boost: (r) => { el['boost-fill'].style.width = `${clamp(r, 0, 1) * 100}%`; },
      toast: (text, kind) => {
        const t = el.toast;
        t.textContent = text;
        t.className = `toast show${kind ? ` toast--${kind}` : ''}`;
        clearTimeout(this._toastTimer);
        this._toastTimer = setTimeout(() => { t.className = 'toast'; }, 1500);
      },
      drawMinimap: (data) => this._drawMinimap(data),
      clear: () => {
        el['hud-lap-times'].innerHTML = '';
        el['toast'].className = 'toast';
        el.countdown.textContent = '';
      }
    };
  }

  _drawMinimap({ path, player, others, palette }) {
    const c = this.el.minimap;
    if (!c || !path || path.length < 4) return;
    const g = c.getContext('2d');
    const W = c.width, H = c.height;
    if (!this._mm || this._mm.path !== path) {
      let minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9;
      path.forEach(([x, y]) => {
        minX = Math.min(minX, x); maxX = Math.max(maxX, x);
        minY = Math.min(minY, y); maxY = Math.max(maxY, y);
      });
      const pad = 16;
      const sc = Math.min((W - pad * 2) / (maxX - minX), (H - pad * 2) / (maxY - minY));
      this._mm = {
        path, minX, minY, sc,
        ox: (W - (maxX - minX) * sc) / 2,
        oy: (H - (maxY - minY) * sc) / 2
      };
    }
    const m = this._mm;
    const px = (x) => m.ox + (x - m.minX) * m.sc;
    const py = (y) => m.oy + (y - m.minY) * m.sc;

    g.clearRect(0, 0, W, H);
    g.lineJoin = 'round';
    g.lineCap = 'round';
    g.beginPath();
    path.forEach(([x, y], i) => { i ? g.lineTo(px(x), py(y)) : g.moveTo(px(x), py(y)); });
    g.closePath();
    g.strokeStyle = 'rgba(255,255,255,.22)';
    g.lineWidth = 7;
    g.stroke();
    g.strokeStyle = `#${(palette ? palette.edge : 0x00e5ff).toString(16).padStart(6, '0')}`;
    g.lineWidth = 2;
    g.globalAlpha = 0.75;
    g.stroke();
    g.globalAlpha = 1;

    // start line
    g.fillStyle = '#fff';
    g.fillRect(px(path[0][0]) - 4, py(path[0][1]) - 4, 8, 8);

    others.forEach(([x, y]) => {
      g.fillStyle = 'rgba(255,255,255,.8)';
      g.beginPath(); g.arc(px(x), py(y), 4, 0, Math.PI * 2); g.fill();
    });
    g.fillStyle = '#ffd23f';
    g.shadowColor = '#ffd23f';
    g.shadowBlur = 8;
    g.beginPath(); g.arc(px(player[0]), py(player[1]), 5.5, 0, Math.PI * 2); g.fill();
    g.shadowBlur = 0;
  }
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[ch]));
}
