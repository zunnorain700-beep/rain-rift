/**
 * ai.js — opponent drivers: racing-line following with skill-scaled
 * cornering, braking, recovery and rubber-banding.
 */
import { clamp, TAU } from './data.js';

const wrap = (a) => {
  while (a > Math.PI) a -= TAU;
  while (a < -Math.PI) a += TAU;
  return a;
};

export function createAI(kart, track, diff, rng) {
  kart.ai = {
    rng: rng || Math.random,
    stuck: 0,
    reversing: 0,
    noise: (rng ? rng() : Math.random()) * TAU,
    linePhase: (rng ? rng() : Math.random()) * TAU,
    itemCooldown: (2 + (rng ? rng() : Math.random()) * 3) / diff.aiItems,
    skill: diff.aiSkill,
    targetOffset: 0,
    lastProgress: 0
  };
  return kart.ai;
}

/**
 * Produce one frame of driving input for an AI kart.
 * @returns {{throttle:number,brake:number,steer:number,drift:boolean}}
 */
export function aiDrive(kart, track, diff, dt, ctx = {}) {
  const ai = kart.ai;
  ai.itemCooldown = Math.max(0, ai.itemCooldown - dt);
  const n = track.count;
  const s = track.samples;
  const speed = Math.hypot(kart.vel.x, kart.vel.z);
  const idx = kart.sampleIdx;
  const segs = 3 + Math.round(speed * 0.5);           // steering lookahead
  const far = 8 + Math.round(speed * 1.1);            // cornering lookahead

  /* racing line: gentle weave that tightens with skill */
  ai.noise += dt * 0.35;
  const lineStrength = track.halfWidth * (0.32 + ai.skill * 0.28);
  const offset = Math.sin((idx / n) * TAU * 2 + ai.linePhase) * lineStrength +
                 Math.sin(ai.noise) * (1 - ai.skill) * 2.2;

  const tgt = s[(idx + segs) % n];
  const tx = tgt.x + tgt.nx * offset;
  const tz = tgt.z + tgt.nz * offset;

  /* steering toward target point */
  let desired = Math.atan2(tx - kart.pos.x, tz - kart.pos.z);
  let delta = wrap(desired - kart.yaw);

  /* aim back onto the road if running wide */
  const near = track.nearest(kart.sampleIdx, kart.pos.x, kart.pos.z);
  if (Math.abs(near.lateral) > track.halfWidth * 0.9) {
    const aim = Math.atan2(near.sample.x - kart.pos.x + near.sample.nx * 0, near.sample.z - kart.pos.z);
    delta = wrap(delta * 0.35 + wrap(aim - kart.yaw) * 0.65);
  }

  let steer = clamp(delta * (2.4 + ai.skill * 1.2), -1, 1);

  /* corner speed: measure how much the line bends ahead */
  let bend = 0;
  let prev = s[idx % n];
  for (let k = 4; k < far; k++) {
    const cur = s[(idx + k) % n];
    const a1 = Math.atan2(prev.tx, prev.tz);
    const a2 = Math.atan2(cur.tx, cur.tz);
    bend += Math.abs(wrap(a2 - a1));
    prev = cur;
  }
  const curvature = bend / Math.max(1, far - 4);
  const top = kart.tune.maxSpeed;
  let desiredSpeed = top * clamp(1 - curvature * 12 * (1.15 - ai.skill * 0.5 - diff.aiAggression * 0.2), 0.3, 1);

  /* rubber band: subtle catch-up without breaking immersion */
  if (ctx.playerProgress != null && diff.rubberBand > 0) {
    const gap = (ctx.playerProgress - kart.progress) / track.length;
    desiredSpeed *= 1 + clamp(gap * diff.rubberBand * 6, -0.08, 0.12);
  }

  const vf = kart.vel.x * Math.sin(kart.yaw) + kart.vel.z * Math.cos(kart.yaw);
  let throttle = 1, brake = 0;
  if (vf > desiredSpeed * (1.02 + diff.aiAggression * 0.03)) {
    throttle = 0;
    brake = clamp((vf - desiredSpeed) / 9, 0.15, 1);
  } else if (vf > desiredSpeed * (0.94 + diff.aiAggression * 0.03)) {
    throttle = 0.55;
  }

  /* stuck detection → reverse out */
  if (Math.abs(vf) < 2 && ctx.raceActive) {
    ai.stuck += dt;
    if (ai.stuck > 1.4) ai.reversing = 1.1;
  } else {
    ai.stuck = Math.max(0, ai.stuck - dt * 0.7);
  }
  if (ai.reversing > 0) {
    ai.reversing -= dt;
    throttle = 0;
    brake = 1;
    steer = -steer * 0.8;
  }

  /* drifting on hard corners for skilled rivals */
  const drift = ai.skill > 0.55 && Math.abs(delta) > 0.5 && vf > 17 && brake === 0;

  return { throttle, brake, steer, drift };
}

/** Decide whether an AI should spend its power-up right now. */
export function aiUseItem(kart, race) {
  const ai = kart.ai;
  if (!kart.item || ai.itemCooldown > 0 || kart.finished) return false;
  const item = kart.item.id;
  const rng = ai.rng;
  const speed = Math.hypot(kart.vel.x, kart.vel.z);

  const player = race.player;
  let gapAhead = Infinity, gapBehind = Infinity;
  if (player && player !== kart) {
    const rel = player.progress - kart.progress;
    if (rel > 0) gapAhead = rel; else gapBehind = -rel;
  }

  ai.itemCooldown = (1.2 + rng() * 2.4) / race.diff.aiItems;

  if (item === 'nitro') return speed > 6 && gapBehind > 12;
  if (item === 'shield') return gapAhead < 35 || gapBehind < 35;
  if (item === 'oil') return gapBehind < 45 || rng() < 0.15 + race.diff.aiAggression * 0.45;
  if (item === 'pulse') return gapBehind < 60 || gapAhead < 60;
  return false;
}
