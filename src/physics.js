/**
 * physics.js — arcade kart dynamics.
 * Velocity is decomposed into forward/lateral components each frame so drift,
 * grip and wall collisions stay stable and easy to tune.
 */
import { clamp, SECTOR_COUNT } from './data.js';

export function createKart(o) {
  return {
    id: o.id,
    isPlayer: !!o.isPlayer,
    pos: { x: o.x || 0, z: o.z || 0 },
    yaw: o.yaw || 0,
    vel: { x: 0, z: 0 },
    steer: 0,
    steerVisual: 0,
    lap: 0,
    sector: 0,
    nextSector: 1,
    sampleIdx: o.sampleIdx || 0,
    progress: 0,
    finished: false,
    finishTime: null,
    lapStart: 0,
    lapTimes: [],
    totalTime: 0,
    boostTimer: 0,
    shieldTimer: 0,
    stunTimer: 0,
    spinTimer: 0,
    spinDir: 1,
    driftActive: false,
    driftCharge: 0,
    slip: 0,
    offroad: false,
    wrongWay: 0,
    item: null,
    charDef: o.charDef,
    vehDef: o.vehDef,
    tune: o.tune,
    color: o.color,
    ai: o.ai || null,
    name: o.name || '',
    radius: o.radius || 1.15,
    rank: 1,
    grid: o.grid || 0
  };
}

/** Effective speed target for the current state. */
function targetSpeed(k, boosting) {
  const t = k.tune;
  let v = t.maxSpeed * (boosting ? 1.34 : 1);
  if (k.offroad) v *= 0.55 + t.offroad * 0.35;
  if (k.stunTimer > 0) v = Math.min(v, t.maxSpeed * 0.32);
  return v;
}

/**
 * Advance one kart.
 * @param {object} k kart
 * @param {{throttle:number,brake:number,steer:number,drift:boolean}} input
 * @param {number} dt seconds
 * @param {object} track from tracks.js
 * @param {{diff:object, emit:Function, time:number}} ctx
 */
export function stepKart(k, input, dt, track, ctx) {
  const diff = ctx.diff;
  const t = k.tune;

  /* ---- steering smoothing ---- */
  const steerRate = 7 + t.steer * 2.5;
  k.steer += (input.steer - k.steer) * Math.min(1, dt * steerRate);
  if (Math.abs(k.steer) < 0.002) k.steer = 0;

  /* ---- status timers ---- */
  if (k.boostTimer > 0) k.boostTimer -= dt;
  if (k.shieldTimer > 0) k.shieldTimer -= dt;
  if (k.stunTimer > 0) k.stunTimer -= dt;
  let control = 1;
  if (k.stunTimer > 0) control = 0.2;
  if (k.spinTimer > 0) {
    k.spinTimer -= dt;
    control = 0.1;
    k.yaw += k.spinDir * 7.5 * dt;
  }

  /* ---- decompose velocity ---- */
  const fx = Math.sin(k.yaw), fz = Math.cos(k.yaw);
  const rx = fz, rz = -fx;
  let vf = k.vel.x * fx + k.vel.z * fz;
  let vr = k.vel.x * rx + k.vel.z * rz;

  const boosting = k.boostTimer > 0;

  /* ---- longitudinal ---- */
  const top = targetSpeed(k, boosting);
  if (input.throttle > 0 && control > 0.5) {
    const rate = (t.accel / 6) * (boosting ? 1.5 : 1) * (k.offroad ? 0.55 : 1);
    if (vf < top) vf += (top - vf) * Math.min(1, rate * dt) * input.throttle;
    else vf += (top - vf) * Math.min(1, rate * 1.6 * dt);
  } else {
    // coasting / engine braking
    vf -= vf * (k.offroad ? 1.9 : 0.55) * dt;
  }
  if (input.brake > 0) {
    if (vf > 0.4) vf -= t.brake * input.brake * dt;
    else vf -= t.accel * 0.55 * input.brake * dt;
    vf = Math.max(vf, -t.maxSpeed * 0.32);
  }
  if (k.stunTimer > 0) vf -= vf * 2.6 * dt;

  /* ---- steering ---- */
  const speedFactor = clamp(Math.abs(vf) / 7, 0, 1);
  const dir = vf >= 0 ? 1 : -1;
  const gripBonus = 1 + (k.isPlayer ? diff.playerGrip : 0);
  k.yaw += k.steer * t.steer * speedFactor * dir * dt * control * gripBonus;

  /* ---- stability assist (easier difficulties) ---- */
  if (k.isPlayer && diff.steerAssist > 0 && Math.abs(vf) > 6) {
    const velAng = Math.atan2(k.vel.x, k.vel.z);
    let delta = velAng - k.yaw;
    while (delta > Math.PI) delta -= Math.PI * 2;
    while (delta < -Math.PI) delta += Math.PI * 2;
    if (Math.abs(delta) < 1.1) k.yaw += delta * diff.steerAssist * dt * 1.6;
  }

  /* ---- lateral grip & drift ---- */
  const wantsDrift = input.drift && Math.abs(vf) > 7 && control > 0.5;
  const drifting = wantsDrift || (Math.abs(k.steer) > 0.55 && Math.abs(vf) > 16 && t.drift > 2.6);
  const grip = (drifting ? 1.5 : t.grip + (k.isPlayer ? diff.playerGrip * 10 : 0)) * (k.offroad ? 0.72 : 1);
  vr -= vr * grip * dt;
  if (drifting) {
    vr += -k.steer * Math.abs(vf) * 0.62 * (t.drift / 2.6) * dt;
  }

  // drift charge → mini boost on release
  const slip = clamp(Math.abs(vr) / Math.max(6, Math.abs(vf)), 0, 1);
  k.slip = slip;
  if (drifting && slip > 0.16) {
    k.driftCharge = Math.min(3, k.driftCharge + dt);
    if (!k.driftActive) { k.driftActive = true; ctx.emit('drift-start', { kart: k }); }
  } else if (k.driftActive && !input.drift) {
    k.driftActive = false;
    if (k.driftCharge > 0.85 && k.boostTimer <= 0 && control > 0.5) {
      k.boostTimer = Math.min(1.7, 0.7 + k.driftCharge * 0.42);
      ctx.emit('drift-boost', { kart: k });
    }
    k.driftCharge = 0;
  }

  /* ---- recombine ---- */
  k.vel.x = fx * vf + rx * vr;
  k.vel.z = fz * vf + rz * vr;
  k.pos.x += k.vel.x * dt;
  k.pos.z += k.vel.z * dt;

  /* ---- track constraints ---- */
  const near = track.nearest(k.sampleIdx, k.pos.x, k.pos.z);
  k.sampleIdx = near.index;
  const lat = near.lateral;
  k.offroad = Math.abs(lat) > track.halfWidth;
  k.sector = Math.floor(near.index / track.sectorSize) % SECTOR_COUNT;

  const wallDist = track.wallDist + (diff.wallMargin - 1) * 3;
  if (Math.abs(lat) > wallDist) {
    const s = near.sample;
    const side = near.side;
    const nx = s.nx * side, nz = s.nz * side; // outward normal
    const over = Math.abs(lat) - wallDist;
    k.pos.x -= nx * over;
    k.pos.z -= nz * over;
    const vn = k.vel.x * nx + k.vel.z * nz;
    if (vn > 0) {
      const impact = vn;
      k.vel.x -= nx * vn * 1.35;
      k.vel.z -= nz * vn * 1.35;
      const loss = clamp(impact / 26, 0, 0.55) * diff.collisionLoss;
      k.vel.x *= 1 - loss;
      k.vel.z *= 1 - loss;
      if (impact > 3.5) {
        ctx.emit('wall', { kart: k, intensity: clamp(impact / 22, 0.2, 1.2) });
        if (!k.isPlayer && impact > 10) k.stunTimer = Math.max(k.stunTimer, 0.35);
      }
    }
  }

  /* ---- checkpoints & laps ---- */
  if (k.sector === k.nextSector && !k.finished) {
    const passed = k.nextSector;
    k.nextSector = (k.nextSector + 1) % SECTOR_COUNT;
    if (passed === 0) {
      k.lap += 1;
      const lapTime = ctx.time - k.lapStart;
      k.lapStart = ctx.time;
      if (k.lap > 1 || lapTime > 5) {
        k.lapTimes.push(lapTime);
        ctx.emit('lap', { kart: k, time: lapTime, lap: k.lap });
      }
      if (k.lap >= track.laps) {
        k.finished = true;
        k.finishTime = ctx.time;
        ctx.emit('finish', { kart: k, time: ctx.time });
      }
    } else {
      ctx.emit('checkpoint', { kart: k, sector: passed });
    }
  }

  /* ---- wrong way ---- */
  const fwdDot = k.vel.x * near.sample.tx + k.vel.z * near.sample.tz;
  if (fwdDot < -6 && Math.hypot(k.vel.x, k.vel.z) > 4) k.wrongWay += dt;
  else k.wrongWay = Math.max(0, k.wrongWay - dt * 2);

  /* ---- ranking progress ---- */
  k.progress = k.lap * track.length + track.samples[k.sampleIdx].d;
  k.steerVisual += (k.steer - k.steerVisual) * Math.min(1, dt * 10);
}

/** Circle-vs-circle kart contact resolution. */
export function collideKarts(karts, emit) {
  for (let i = 0; i < karts.length; i++) {
    for (let j = i + 1; j < karts.length; j++) {
      const a = karts[i], b = karts[j];
      if (a.finished && b.finished) continue;
      const dx = b.pos.x - a.pos.x, dz = b.pos.z - a.pos.z;
      const dist = Math.hypot(dx, dz);
      const minD = a.radius + b.radius;
      if (dist > minD || dist < 0.0001) continue;

      const nx = dx / dist, nz = dz / dist;
      const overlap = minD - dist;
      const ma = a.tune.mass, mb = b.tune.mass;
      const total = ma + mb;
      a.pos.x -= nx * overlap * (mb / total);
      a.pos.z -= nz * overlap * (mb / total);
      b.pos.x += nx * overlap * (ma / total);
      b.pos.z += nz * overlap * (ma / total);

      const rav = a.vel.x * nx + a.vel.z * nz;
      const rbv = b.vel.x * nx + b.vel.z * nz;
      const rel = rbv - rav;
      if (rel > 0) continue; // separating

      const aShield = a.shieldTimer > 0;
      const bShield = b.shieldTimer > 0;
      const restitution = 0.55;
      const jImp = -(1 + restitution) * rel / (1 / ma + 1 / mb);
      a.vel.x -= (jImp / ma) * nx; a.vel.z -= (jImp / ma) * nz;
      b.vel.x += (jImp / mb) * nx; b.vel.z += (jImp / mb) * nz;

      const intensity = clamp(Math.abs(rel) / 20, 0.15, 1.2);
      if (aShield !== bShield) {
        // shielded kart punts the other
        const victim = aShield ? b : a;
        const attacker = aShield ? a : b;
        victim.vel.x += nx * (attacker === a ? 1 : -1) * 9;
        victim.vel.z += nz * (attacker === a ? 1 : -1) * 9;
        victim.spinTimer = 0.55;
        victim.spinDir = Math.random() > 0.5 ? 1 : -1;
        emit('shield-hit', { attacker, victim });
      } else if (intensity > 0.32) {
        const spinTarget = Math.abs(rav) < Math.abs(rbv) ? a : b;
        spinTarget.spinTimer = Math.max(spinTarget.spinTimer, 0.4);
        spinTarget.spinDir = Math.random() > 0.5 ? 1 : -1;
        emit('spin', { kart: spinTarget });
      }
      emit('bump', { a, b, intensity });
    }
  }
}

/** Rank karts: finished first (by time), then by progress. */
export function rankKarts(karts) {
  const arr = karts.slice().sort((a, b) => {
    if (a.finished && b.finished) return a.finishTime - b.finishTime;
    if (a.finished) return -1;
    if (b.finished) return 1;
    return b.progress - a.progress;
  });
  arr.forEach((k, i) => { k.rank = i + 1; });
  return arr;
}
