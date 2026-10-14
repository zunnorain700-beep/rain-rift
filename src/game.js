/**
 * game.js — race orchestration: scene, karts, camera, timing, HUD feeding.
 */
import * as THREE from 'three';
import { buildTrack } from './tracks.js';
import { buildVehicle, updateVehicleVisual, disposeObject } from './vehicles.js';
import { buildCharacter, poseSeated, animateDriving } from './characters.js';
import { createKart, stepKart, collideKarts, rankKarts } from './physics.js';
import { createAI, aiDrive, aiUseItem } from './ai.js';
import { Powerups } from './powerups.js';
import {
  CHARACTERS, VEHICLES, DIFFICULTIES, POINTS_TABLE, makeRng, clamp,
  formatTime, randomCharacter, randomVehicle, TAU
} from './data.js';

const AI_NAMES = ['VEX', 'ORBIT', 'JUNO', 'RAZOR', 'PIXEL', 'MIRA', 'BOLT', 'ZEPH', 'ECHO', 'TANK'];

/**
 * Tiny procedural sky used as the scene environment. Without it, metallic
 * materials (kart paint, chrome, road studs) have nothing to reflect and turn
 * almost black — especially on the night circuit.
 * @returns {THREE.Texture|null}
 */
function buildEnvironment(renderer, p) {
  try {
    const w = 32, h = 16;
    const data = new Uint8Array(w * h * 4);
    const top = new THREE.Color(p.sky);
    const horizon = new THREE.Color(p.fog);
    const bottom = new THREE.Color(p.ground);
    const c = new THREE.Color();
    const sx = w * 0.28, sy = h * 0.2;          // fake sun spot
    for (let y = 0; y < h; y++) {
      const t = y / (h - 1);
      if (t < 0.5) c.copy(top).lerp(horizon, t * 2);
      else c.copy(horizon).lerp(bottom, (t - 0.5) * 2);
      for (let x = 0; x < w; x++) {
        const dx = x - sx, dy = (y - sy) * 2.2;
        const glow = Math.max(0, 1 - (dx * dx + dy * dy) / 9);
        const i = (y * w + x) * 4;
        data[i] = Math.min(255, (c.r + glow * 0.9) * 255);
        data[i + 1] = Math.min(255, (c.g + glow * 0.9) * 255);
        data[i + 2] = Math.min(255, (c.b + glow * 0.8) * 255);
        data[i + 3] = 255;
      }
    }
    const tex = new THREE.DataTexture(data, w, h, THREE.RGBAFormat);
    tex.mapping = THREE.EquirectangularReflectionMapping;
    tex.needsUpdate = true;
    const pmrem = new THREE.PMREMGenerator(renderer);
    const target = pmrem.fromEquirectangular(tex);
    tex.dispose();
    pmrem.dispose();
    return target.texture;
  } catch (err) {
    return null;                                // no env map is still playable
  }
}

function effectiveTune(vehDef, charDef, isPlayer, diff) {
  const t = { ...vehDef.tune };
  t.maxSpeed *= 0.65;
  t.accel *= 0.70;
  if (!isPlayer) {
    t.maxSpeed *= diff.aiSpeed;
    t.accel *= diff.aiSpeed;
  }
  if (isPlayer && charDef) {
    t.maxSpeed *= 1 + charDef.bonus.speed;
    t.accel *= 1 + charDef.bonus.accel;
    t.steer *= 1 + charDef.bonus.handling;
    t.grip += charDef.bonus.grip * 6;
  }
  return t;
}

export class Race {
  /**
   * @param {object} o
   * @param {HTMLCanvasElement} o.canvas
   * @param {object} o.hud  UI bridge (see ui.js createHud)
   * @param {object} o.audio AudioEngine
   * @param {object} o.input Input
   * @param {object} o.config {trackId, difficulty, characterId, vehicleId, paint, quality}
   * @param {Function} o.onEnd results callback
   */
  constructor(o) {
    this.canvas = o.canvas;
    this.hud = o.hud;
    this.audio = o.audio;
    this.input = o.input;
    this.config = { ...o.config };
    this.onEnd = o.onEnd || (() => {});
    this.diff = DIFFICULTIES[this.config.difficulty] || DIFFICULTIES.medium;
    this.quality = this.config.quality || 'medium';
    this.trackDef = o.trackDef || null;

    this.state = 'idle';
    this.paused = false;
    this.time = 0;
    this.countdown = 3.6;
    this.lastCountdownMark = null;
    this.shake = 0;
    this.finishDelay = -1;
    this.frames = 0;
    this.disposed = false;

    this._onResize = () => this.resize();
    this._lastHud = {};
  }

  /* ------------------------------------------------ build */
  start() {
    // Fresh canvas per race: guarantees a clean WebGL context every restart.
    const prev = document.getElementById('race-canvas');
    if (prev) {
      const fresh = prev.cloneNode(false);
      prev.replaceWith(fresh);
      this._oldCanvas = prev;
    }
    const canvas = this.canvas = document.getElementById('race-canvas');
    this.contextLost = false;
    canvas.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      if (this.contextLost) return;
      this.contextLost = true;
      this.hud.toast('Graphics context lost', 'bad');
      this.pause();
    });
    const renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: this.quality !== 'low',
      powerPreference: 'high-performance'
    });
    this.renderer = renderer;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, this.quality === 'low' ? 1 : this.quality === 'high' ? 2 : 1.5));
    renderer.shadowMap.enabled = this.quality === 'high';
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.06;

    const trackDef = this.trackDef;
    const scene = new THREE.Scene();
    this.scene = scene;
    const p = trackDef.palette;
    scene.background = new THREE.Color(p.sky);
    const fogNear = this.quality === 'low' ? 40 : 70;
    const fogFar = this.quality === 'low' ? 240 : this.quality === 'high' ? 460 : 340;
    scene.fog = new THREE.Fog(p.fog, fogNear, fogFar);

    const camera = new THREE.PerspectiveCamera(74, 1, 0.4, 1600);
    this.camera = camera;

    /* lights */
    const hemi = new THREE.HemisphereLight(p.sky, p.ground, 1.3);
    scene.add(hemi);
    const amb = new THREE.AmbientLight(p.ambient, 0.62);
    scene.add(amb);
    const sun = new THREE.DirectionalLight(p.sun, trackDef.biome === 'city' ? 1.0 : 1.35);
    sun.position.set(80, 130, 60);
    if (this.quality === 'high') {
      sun.castShadow = true;
      sun.shadow.mapSize.set(1024, 1024);
      sun.shadow.camera.near = 10;
      sun.shadow.camera.far = 260;
      const s = 70;
      sun.shadow.camera.left = -s; sun.shadow.camera.right = s;
      sun.shadow.camera.top = s; sun.shadow.camera.bottom = -s;
      sun.shadow.bias = -0.0012;
    }
    scene.add(sun, sun.target);
    this.sun = sun;

    /* fill light rides with the camera so the player's kart always reads,
       even on the night circuit */
    const fill = new THREE.DirectionalLight(p.sun, 0.55);
    fill.position.set(0, 20, 0);
    scene.add(fill, fill.target);
    this.fill = fill;

    if (trackDef.biome === 'city') {
      // light pools from the signs
      const glow = new THREE.PointLight(p.accent, 90, 160, 2);
      glow.position.set(0, 40, 0);
      scene.add(glow);
    }

    /* procedural sky environment — gives metal something to reflect */
    this.envMap = buildEnvironment(this.renderer, p);
    if (this.envMap) scene.environment = this.envMap;

    /* track */
    const track = buildTrack(trackDef, this.quality);
    scene.add(track.group);
    this.track = track;

    /* power-ups */
    this.powerups = new Powerups(scene, track, this.quality);

    /* karts */
    this.karts = [];
    this.actors = [];
    this._buildKarts();

    /* events */
    this.emit = (type, data) => this._handleEvent(type, data);

    this.resize();
    window.addEventListener('resize', this._onResize);

    this.audio.unlock();
    this.audio.startMusic('race');
    this.audio.engineStart();
    this.audio.startTires();

    this.state = 'countdown';
    this.paused = false;
    this.time = 0;
    this.countdown = 3.6;
    this.hud.countdown('');
    this.hud.time(0);
    this.hud.item(null);
    this.hud.boost(0);
    this.hud.position(1, this.karts.length);
    this.hud.lap(1, track.laps);

    this._placeOnGrid();
    this._updateCamera(1, true);
    this.hud.drawMinimap(this._minimapPoints());
    this.audio.voice(this._charDef, this._charDef.lines[0]);
    return this;
  }

  _buildKarts() {
    const cfg = this.config;
    const track = this.track;
    const rng = makeRng((this.trackDef.seed || 1) + cfg.difficulty.length * 97);

    const usedVehicles = [];
    const playerChar = CHARACTERS.find((c) => c.id === cfg.characterId) || CHARACTERS[0];
    const playerVeh = VEHICLES.find((v) => v.id === cfg.vehicleId) || VEHICLES[0];
    this._charDef = playerChar;

    const mk = (charDef, vehDef, isPlayer, gridIndex) => {
      const tune = effectiveTune(vehDef, charDef, isPlayer, this.diff);
      const kart = createKart({
        id: isPlayer ? 'player' : `ai-${gridIndex}`,
        isPlayer,
        charDef, vehDef,
        tune,
        sampleIdx: 0,
        radius: 1.2 + (vehDef.type === 'truck' ? 0.22 : 0),
        name: isPlayer ? (cfg.playerName || 'YOU') : AI_NAMES[gridIndex % AI_NAMES.length]
      });

      /* visual */
      const holder = new THREE.Group();
      const veh = buildVehicle(vehDef, isPlayer ? cfg.paint : vehDef.paint);
      holder.add(veh);
      holder.add(veh.userData.shadow);
      veh.userData.shadow.material.opacity = this.quality === 'high' ? 0.55 : 1;
      const DRIVER_SCALE = 0.72;
      const driver = buildCharacter(charDef, { seated: true });
      driver.scale.setScalar(DRIVER_SCALE);
      const mount = veh.userData.driverMount;
      driver.position.copy(mount);
      // drop the racer into the cockpit: hips at the seat surface, not on top
      const hipY = typeof veh.userData.seatHipY === 'number' ? veh.userData.seatHipY : mount.y;
      poseSeated(driver, (hipY - mount.y) / DRIVER_SCALE);
      holder.add(driver);

      const bubble = new THREE.Mesh(
        new THREE.SphereGeometry(2.1, 16, 12),
        new THREE.MeshBasicMaterial({
          color: 0x00e5ff, transparent: true, opacity: 0.22,
          depthWrite: false, side: THREE.DoubleSide
        })
      );
      bubble.position.y = 1.0;
      bubble.visible = false;
      holder.add(bubble);

      this.scene.add(holder);
      kart.mesh = holder;
      kart.vehicleMesh = veh;
      kart.driverMesh = driver;
      kart.bubble = bubble;
      kart.paint = isPlayer ? cfg.paint : vehDef.paint;
      return kart;
    };

    const player = mk(playerChar, playerVeh, true, 0);
    this.player = player;
    this.karts.push(player);

    const total = 6;
    for (let i = 1; i < total; i++) {
      let veh = randomVehicle(rng);
      let guard = 0;
      while (usedVehicles.includes(veh.id) && guard++ < 8) veh = randomVehicle(rng);
      usedVehicles.push(veh.id);
      const ch = randomCharacter(rng);
      const k = mk(ch, veh, false, i);
      createAI(k, track, this.diff, rng);
      this.karts.push(k);
    }
    usedVehicles.push(playerVeh.id);

    this.karts.forEach((k) => {
      k.lapStart = 0;
      k.laps = track.laps;
    });
  }

  _placeOnGrid() {
    const track = this.track;
    const order = [this.player, ...this.karts.filter((k) => !k.isPlayer)];
    order.forEach((k, i) => {
      const idx = 40 - i * 6;
      const s = track.samples[idx];
      const lat = (i % 2 ? -1 : 1) * track.halfWidth * 0.42;
      k.sampleIdx = idx;
      k.pos.x = s.x + s.nx * lat;
      k.pos.z = s.z + s.nz * lat;
      k.yaw = Math.atan2(s.tx, s.tz);
      k.vel.x = 0; k.vel.z = 0;
      k.lap = 0;
      k.nextSector = 1;
      k.sector = 0;
      k.progress = track.samples[idx].d;
      if (k.mesh) {
        k.mesh.position.set(k.pos.x, 0, k.pos.z);
        k.mesh.rotation.y = k.yaw;
      }
    });
  }

  /* ------------------------------------------------ events */
  _handleEvent(type, data) {
    const a = this.audio;
    const hud = this.hud;
    switch (type) {
      case 'wall':
        if (data.kart.isPlayer) { a.wallHit(data.intensity); this.shake = Math.min(1, this.shake + data.intensity * 0.7); }
        else if (data.intensity > 0.5) a.wallHit(data.intensity * 0.6);
        break;
      case 'bump': {
        const mine = data.a.isPlayer || data.b.isPlayer;
        a.collision(data.intensity * (mine ? 1 : 0.55));
        if (mine) this.shake = Math.min(1, this.shake + data.intensity * 0.8);
        break;
      }
      case 'spin':
        if (data.kart.isPlayer) a.spinOut();
        break;
      case 'oiled':
        if (data.kart.isPlayer) { a.spinOut(); hud.toast('Oiled!', 'bad'); }
        break;
      case 'shield-hit':
        a.collision(0.8);
        if (data.victim.isPlayer) { this.shake = 0.7; hud.toast('Shield bash!', 'warn'); }
        break;
      case 'drift-boost':
        if (data.kart.isPlayer) a.boost();
        break;
      case 'lap': {
        if (data.kart.isPlayer) {
          a.beep(1180, 0.2, 'square', 0.3);
          const remaining = this.track.laps - data.lap;
          hud.lapTimes(data.kart.lapTimes);
          if (remaining > 0) hud.toast(remaining === 1 ? 'Final lap!' : `Lap ${data.lap + 1}/${this.track.laps}`, 'warn');
        }
        break;
      }
      case 'finish': {
        if (data.kart.isPlayer) this._onPlayerFinish();
        else a.beep(700, 0.1, 'triangle', 0.14);
        break;
      }
      case 'pickup': {
        if (data.kart.isPlayer) {
          a.itemDraw(data.item.id);
          hud.item(data.item);
          hud.toast(`+ ${data.item.name}`, 'good');
        }
        break;
      }
      case 'nitro':
        a.boost();
        if (data.kart.isPlayer) { hud.toast('Nitro!', 'warn'); this.shake = Math.min(0.7, this.shake + 0.3); }
        break;
      case 'shield':
        a.shieldUp();
        if (data.kart.isPlayer) hud.toast('Shield up', 'good');
        break;
      case 'oil':
        a.slickDrop();
        if (data.kart.isPlayer) hud.toast('Oil slick dropped', 'warn');
        break;
      case 'pulse': {
        a.pulseWave();
        const hit = this.powerups.applyPulse(data.kart, 30, this.karts);
        if (data.kart.isPlayer) hud.toast(`Pulse hit ${hit.length}`, 'good');
        else if (hit.some((k) => k.isPlayer)) hud.toast('Pulsed!', 'bad');
        break;
      }
      case 'pickup-error':
      default:
        break;
    }
  }

  /* ------------------------------------------------ countdown */
  _tickCountdown(dt) {
    this.countdown -= dt;
    const c = this.countdown;
    const mark = Math.ceil(c);
    if (mark !== this.lastCountdownMark && mark >= 1 && mark <= 3) {
      this.lastCountdownMark = mark;
      this.hud.countdown(String(mark));
      this.audio.countdownBeep(false);
    }
    if (c <= 0 && this.state === 'countdown') {
      this.state = 'racing';
      this.time = 0;
      this.hud.countdown('GO!', true);
      this.audio.countdownBeep(true);
      this.audio.voice(this._charDef, this._charDef.lines[1]);
    }
  }

  /* ------------------------------------------------ main update */
  update(dt) {
    if (this.disposed || this.paused) return;
    dt = Math.min(dt, 0.05);
    this.frames++;

    if (this.state === 'countdown') this._tickCountdown(dt);
    if (this.state === 'racing' || this.state === 'finished') this.time += dt;

    const racing = this.state === 'racing';
    const controls = this.input.sample();
    const useItem = this.input.consumeItem();

    const ctx = {
      diff: this.diff,
      emit: this.emit,
      time: this.time,
      raceActive: racing,
      playerProgress: this.player.progress
    };

    /* player input */
    const playerControls = this.state === 'countdown'
      ? { throttle: 0, brake: 0, steer: 0, drift: false }
      : controls;
    if (this.player.finished) {
      playerControls.throttle *= 0.4;
    }
    stepKart(this.player, playerControls, dt, this.track, ctx);

    /* AI */
    for (const k of this.karts) {
      if (k.isPlayer) continue;
      if (this.state === 'countdown') {
        stepKart(k, { throttle: 0, brake: 0, steer: 0, drift: false }, dt, this.track, ctx);
        continue;
      }
      const inp = aiDrive(k, this.track, this.diff, dt, ctx);
      if (k.finished) { inp.throttle *= 0.5; inp.brake *= 0.5; }
      stepKart(k, inp, dt, this.track, ctx);
      if (aiUseItem(k, this)) this.powerups.use(k, this.emit);
    }

    /* item use (player) */
    if (useItem && this.player.item && !this.player.finished && racing) {
      this.powerups.use(this.player, this.emit);
      this.hud.item(null);
    }

    collideKarts(this.karts, this.emit);
    // pickups only count once the race is actually under way
    this.powerups.update(dt, this.time, this.karts, this.emit, racing);
    rankKarts(this.karts);

    /* visuals */
    for (const k of this.karts) {
      if (!k.mesh) continue;
      k.mesh.position.set(k.pos.x, 0, k.pos.z);
      k.mesh.rotation.y = k.yaw;
      const speed = Math.hypot(k.vel.x, k.vel.z);
      const fx = Math.sin(k.yaw), fz = Math.cos(k.yaw);
      const vr = k.vel.x * fz - k.vel.z * fx;
      updateVehicleVisual(k.vehicleMesh, dt, {
        speed,
        steer: k.steerVisual,
        brake: k.isPlayer ? playerControls.brake > 0 : false,
        boosting: k.boostTimer > 0,
        lean: clamp(-vr / 26, -1, 1),
        pitch: k.offroad ? Math.sin(this.frames * 0.5 + k.pos.x) * 0.03 : 0
      });
      animateDriving(k.driverMesh, this.time, k.steerVisual, k.offroad ? 1 : 0);
      k.bubble.visible = k.shieldTimer > 0;
      if (k.shieldTimer > 0) {
        const s = 1 + Math.sin(this.time * 6) * 0.05;
        k.bubble.scale.setScalar(s);
      }
    }

    /* camera */
    this._updateCamera(dt, false);

    /* sun follows player for shadows */
    if (this.renderer.shadowMap.enabled) {
      this.sun.position.set(this.player.pos.x + 70, 130, this.player.pos.z + 55);
      this.sun.target.position.set(this.player.pos.x, 0, this.player.pos.z);
      this.sun.target.updateMatrixWorld();
    }

    /* audio */
    const speed = Math.hypot(this.player.vel.x, this.player.vel.z);
    this.audio.updateEngine({
      speed,
      dt,
      maxSpeed: this.player.tune.maxSpeed,
      throttle: this.state === 'countdown' ? 0 : playerControls.throttle,
      brake: this.state === 'countdown' ? 0 : playerControls.brake,
      offroad: this.player.offroad,
      boosting: this.player.boostTimer > 0
    });
    this.audio.updateTires(this.player.slip, speed);

    /* HUD */
    this._updateHud(dt, speed);

    /* finish sequencing */
    if (this.state === 'finished') {
      this.finishDelay -= dt;
      if (this.finishDelay <= 0) {
        // _complete() hands results to the UI and may dispose this race,
        // so stop here instead of rendering into a torn-down scene.
        this._complete();
        return;
      }
    }

    if (!this.scene || !this.renderer) return;
    this.renderer.render(this.scene, this.camera);
  }

  _updateCamera(dt, snap) {
    const p = this.player;
    const speed = Math.hypot(p.vel.x, p.vel.z);
    const fx = Math.sin(p.yaw), fz = Math.cos(p.yaw);
    const back = 6.0 + speed * 0.06 + (p.boostTimer > 0 ? 0.5 : 0);
    const desired = new THREE.Vector3(
      p.pos.x - fx * back,
      2.9 + speed * 0.008,
      p.pos.z - fz * back
    );
    if (snap) this.camera.position.copy(desired);
    else this.camera.position.lerp(desired, 1 - Math.exp(-dt * 10));

    const look = new THREE.Vector3(p.pos.x + fx * 5.5, 1.35, p.pos.z + fz * 5.5);
    if (this.shake > 0.001) {
      look.x += (Math.random() - 0.5) * this.shake * 1.6;
      look.y += (Math.random() - 0.5) * this.shake * 1.2;
      this.shake *= Math.exp(-dt * 5);
    }
    this.camera.lookAt(look);

    const targetFov = 72 + clamp(speed / p.tune.maxSpeed, 0, 1) * 8 + (p.boostTimer > 0 ? 7 : 0);
    if (Math.abs(this.camera.fov - targetFov) > 0.05) {
      this.camera.fov += (targetFov - this.camera.fov) * Math.min(1, dt * 4);
      this.camera.updateProjectionMatrix();
    }
  }

  _updateHud(dt, speed) {
    const hud = this.hud;
    const p = this.player;
    const kmh = Math.round(speed * 3.6);
    if (kmh !== this._lastHud.kmh) { hud.speed(kmh); this._lastHud.kmh = kmh; }
    hud.boost(clamp(p.driftCharge / 3, 0, 1));
    if (p.rank !== this._lastHud.rank || this.frames % 30 === 0) {
      hud.position(p.rank, this.karts.length);
      this._lastHud.rank = p.rank;
    }
    const lap = Math.min(this.track.laps, p.lap + (p.finished ? 0 : 1));
    if (lap !== this._lastHud.lap) { hud.lap(lap, this.track.laps); this._lastHud.lap = lap; }
    if (this.state === 'racing' || this.state === 'finished') hud.time(this.time * 1000);
    if (p.wrongWay > 1) {
      if (!this._lastHud.warn) { this.hud.toast('Wrong way!', 'bad'); this.audio.wrongWay(); this._lastHud.warn = true; }
    } else this._lastHud.warn = false;
    if (this.frames % 4 === 0) hud.drawMinimap(this._minimapPoints());
  }

  _minimapPoints() {
    const p = this.player;
    return {
      path: this.track.minimapPath,
      player: [p.pos.x, p.pos.z],
      others: this.karts.filter((k) => !k.isPlayer).map((k) => [k.pos.x, k.pos.z]),
      palette: this.trackDef.palette
    };
  }

  /* ------------------------------------------------ finish */
  _onPlayerFinish() {
    this.state = 'finished';
    this.finishDelay = 2.0;
    this.input.clear();
    const pos = this.player.rank;
    this.audio.finishRace(pos === 1);
    this.audio.voice(this._charDef, pos === 1 ? this._charDef.lines[2] : this._charDef.lines[0]);
    this.hud.toast(pos === 1 ? 'Victory!' : 'Finished!', 'warn');
    this._standings = rankKarts(this.karts).map((k) => ({
      name: k.name,
      isPlayer: k.isPlayer,
      charName: k.charDef.name,
      vehName: k.vehDef.name,
      finished: k.finished,
      finishTime: k.finishTime,
      progress: k.progress,
      rank: k.rank
    }));
  }

  _complete() {
    this.state = 'done';
    const p = this.player;
    const totalMs = (p.finishTime != null ? p.finishTime : this.time) * 1000;
    const bestLap = p.lapTimes.length ? Math.min(...p.lapTimes) * 1000 : null;
    const position = p.rank;
    const points = POINTS_TABLE[clamp(position - 1, 0, POINTS_TABLE.length - 1)] || 0;
    const result = {
      trackId: this.trackDef.id,
      trackName: this.trackDef.name,
      difficulty: this.diff.id,
      difficultyLabel: this.diff.label,
      vehicleId: p.vehDef.id,
      vehicleName: p.vehDef.name,
      characterName: p.charDef.name,
      playerName: p.name,
      position,
      total: this.karts.length,
      laps: this.track.laps,
      time: totalMs,
      bestLap,
      lapTimes: p.lapTimes.map((t) => t * 1000),
      points,
      standings: this._standings || []
    };
    this.onEnd(result);
  }

  /* ------------------------------------------------ control */
  pause() {
    if (this.state === 'done' || this.paused) return;
    this.paused = true;
    this.audio.engineStop();
    this.audio.stopTires();
    if (this.audio.ok) this.audio.music.gain.setTargetAtTime(0.06, this.audio.ctx.currentTime, 0.1);
    this.input.clear();
  }

  resume() {
    if (!this.paused) return;
    this.paused = false;
    this.audio.engineStart();
    this.audio.startTires();
    if (this.audio.ok) this.audio.music.gain.setTargetAtTime(this.audio.settings.music * 0.5, this.audio.ctx.currentTime, 0.1);
  }

  resize() {
    if (!this.renderer) return;
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / Math.max(1, h);
    this.camera.updateProjectionMatrix();
  }

  setTrack(def) { this.trackDef = def; }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    window.removeEventListener('resize', this._onResize);
    this.audio.engineStop();
    this.audio.stopTires();
    this.audio.stopMusic();
    if (this.powerups) this.powerups.dispose();
    this.karts.forEach((k) => {
      if (k.mesh) { this.scene.remove(k.mesh); disposeObject(k.mesh); }
    });
    if (this.track) { this.scene.remove(this.track.group); this.track.dispose(); }
    if (this.envMap) {
      this.scene.environment = null;
      this.envMap.dispose();
      this.envMap = null;
    }
    if (this.renderer) {
      this.renderer.dispose();
      const ctx = this.renderer.getContext();
      if (ctx && ctx.getExtension) {
        const ext = ctx.getExtension('WEBGL_lose_context');
        if (ext) ext.loseContext();
      }
    }
    this.scene = null;
    this.karts = [];
    this.state = 'idle';
  }
}

export { formatTime, TAU };
