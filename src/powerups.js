/**
 * powerups.js — item crates, hazards and active-effect visuals.
 * All effects are plain Three.js meshes; nothing is loaded from disk.
 */
import * as THREE from 'three';
import { POWERUPS, randomItem, TAU, clamp } from './data.js';

/* ---------------------------------------------------------------------------
 * Item crate ("booster") visuals.
 * Each crate telegraphs what it holds: the power-up's colour, the same glyph
 * the HUD and How-to-Play chips use, and a floating name tag above the pod —
 * so players know what they are about to pick up. The pod itself is a
 * holographic cube with gyro rings, a light beam and a pool on the tarmac.
 * ------------------------------------------------------------------------- */

const CRATE_H = 1.35;            // rest height of the floating pod
const BEAM_TOP = -0.62;          // beam top, local to the pod
const BEAM_H = 0.8;
const BADGE_Y = 1.74;            // floating name tag height

/* Icon outlines mirror POWERUP_ICONS in data.js (32 x 32 authoring box) so
   the crate, the HUD slot and the help screen all show one visual language. */
const ICON = {
  nitro: { path: 'M18 2 6 18h7l-3 12L26 12h-8l3-10z', style: 'fill' },
  shield: { path: 'M16 3l11 4v9c0 7-5 11-11 13C10 27 5 23 5 16V7l11-4z', style: 'shield' },
  oil: { path: 'M16 3c6 8 10 11 10 16a10 10 0 1 1-20 0c0-5 4-8 10-16z', style: 'oil' },
  pulse: { style: 'pulse' }
};

/** Draw an item glyph inside a 32 x 32 box (origin top-left). */
function drawGlyph(x, id) {
  const def = ICON[id] || ICON.nitro;
  if (def.style === 'pulse') {
    x.strokeStyle = 'rgba(255,255,255,.45)';
    x.lineWidth = 2;
    x.setLineDash([4, 4]);
    x.beginPath(); x.arc(16, 16, 14, 0, TAU); x.stroke();
    x.setLineDash([]);
    x.strokeStyle = '#ffffff';
    x.beginPath(); x.arc(16, 16, 9, 0, TAU); x.stroke();
    x.fillStyle = '#ffffff';
    x.beginPath(); x.arc(16, 16, 4.5, 0, TAU); x.fill();
    return;
  }
  const p = new Path2D(def.path);
  if (def.style === 'fill') {
    x.fillStyle = '#ffffff';
    x.fill(p);
    return;
  }
  if (def.style === 'shield') {
    x.fillStyle = 'rgba(255,255,255,.32)';
    x.fill(p);
    x.strokeStyle = '#ffffff';
    x.lineWidth = 2;
    x.stroke(p);
    x.lineWidth = 2.6;
    x.lineCap = 'round';
    x.lineJoin = 'round';
    x.beginPath(); x.moveTo(11, 16); x.lineTo(15, 20); x.lineTo(22, 12); x.stroke();
    return;
  }
  /* oil droplet */
  x.fillStyle = 'rgba(255,255,255,.5)';
  x.fill(p);
  x.strokeStyle = '#ffffff';
  x.lineWidth = 2;
  x.stroke(p);
  x.fillStyle = 'rgba(255,255,255,.8)';
  x.beginPath(); x.ellipse(12, 19, 2.6, 3.6, 0, 0, TAU); x.fill();
}

/** Scale the 32 x 32 glyph into place at (cx, cy) with the given size. */
function glyphAt(x, id, cx, cy, size) {
  const k = size / 32;
  x.save();
  x.translate(cx - size / 2, cy - size / 2);
  x.scale(k, k);
  drawGlyph(x, id);
  x.restore();
}

function hexCss(color) {
  return `#${color.toString(16).padStart(6, '0')}`;
}

function roundRectPath(x, px, py, w, h, r) {
  x.beginPath();
  x.moveTo(px + r, py);
  x.arcTo(px + w, py, px + w, py + h, r);
  x.arcTo(px + w, py + h, px, py + h, r);
  x.arcTo(px, py + h, px, py, r);
  x.arcTo(px, py, px + w, py, r);
  x.closePath();
}

/* crate shell faces: dark plate, frame, glowing glyph (tinted by emissive) */
const _faceCache = new Map();
function crateFaceTex(item) {
  const hit = _faceCache.get(item.id);
  if (hit) return hit;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const x = c.getContext('2d');
  x.fillStyle = '#04060f';
  x.fillRect(0, 0, 128, 128);
  x.strokeStyle = '#ffffff';
  x.lineWidth = 7;
  x.strokeRect(9, 9, 110, 110);
  x.strokeStyle = '#04060f';
  x.lineWidth = 3;
  x.strokeRect(17, 17, 94, 94);
  glyphAt(x, item.id, 64, 64, 58);
  const t = new THREE.CanvasTexture(c);
  if ('colorSpace' in t) t.colorSpace = THREE.SRGBColorSpace;
  _faceCache.set(item.id, t);
  return t;
}

/* floating name tag above the crate: glyph + power-up name on a plate */
const _badgeCache = new Map();
function crateBadgeTex(item) {
  const hit = _badgeCache.get(item.id);
  if (hit) return hit;
  const W = 256, H = 96;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const x = c.getContext('2d');
  const hex = hexCss(item.color);

  roundRectPath(x, 4, 8, W - 8, H - 16, 20);
  x.fillStyle = 'rgba(4,6,15,.84)';
  x.fill();
  x.strokeStyle = hex;
  x.lineWidth = 4;
  x.stroke();
  x.strokeStyle = 'rgba(255,255,255,.25)';
  x.lineWidth = 1.5;
  roundRectPath(x, 10, 14, W - 20, H - 28, 15);
  x.stroke();

  glyphAt(x, item.id, 50, H / 2, 56);

  const label = item.name.toUpperCase();
  let size = 30;
  const maxW = W - 92;
  x.textAlign = 'left';
  x.textBaseline = 'middle';
  for (; size > 13; size -= 2) {
    x.font = `bold ${size}px "Segoe UI", system-ui, sans-serif`;
    if (x.measureText(label).width <= maxW) break;
  }
  x.shadowColor = hex;
  x.shadowBlur = 12;
  x.fillStyle = '#ffffff';
  x.fillText(label, 86, H / 2 + 1);
  x.shadowBlur = 0;

  const t = new THREE.CanvasTexture(c);
  if ('colorSpace' in t) t.colorSpace = THREE.SRGBColorSpace;
  _badgeCache.set(item.id, t);
  return t;
}

let _glowTex = null;
function crateGlowTex() {
  if (_glowTex) return _glowTex;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const x = c.getContext('2d');
  const grad = x.createRadialGradient(64, 64, 2, 64, 64, 62);
  grad.addColorStop(0, 'rgba(255,255,255,0.95)');
  grad.addColorStop(0.45, 'rgba(255,255,255,0.32)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = grad;
  x.fillRect(0, 0, 128, 128);
  _glowTex = new THREE.CanvasTexture(c);
  if ('colorSpace' in _glowTex) _glowTex.colorSpace = THREE.SRGBColorSpace;
  return _glowTex;
}

function crateMesh(item, quality = 'medium') {
  const color = item.color;
  const rich = quality !== 'low';
  const root = new THREE.Group();
  const spinner = new THREE.Group();      // tumbles: shell + rings
  root.add(spinner);

  const tex = crateFaceTex(item);
  const coreMat = new THREE.MeshStandardMaterial({
    color: 0x070b1e, map: tex,
    emissive: new THREE.Color(color), emissiveMap: tex, emissiveIntensity: 1.35,
    metalness: 0.5, roughness: 0.3, transparent: true, opacity: 0.96
  });
  const core = new THREE.Mesh(new THREE.BoxGeometry(1.15, 1.15, 1.15), coreMat);
  const edgeMat = new THREE.LineBasicMaterial({ color });
  const edges = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(1.22, 1.22, 1.22)), edgeMat);
  spinner.add(core, edges);

  const tint = [{ m: coreMat, emissive: true }, { m: edgeMat }];
  let beam = null, pad = null, orbit = null, pivotA = null, pivotB = null;

  if (rich) {
    /* two gyro rings around the shell */
    const ringAMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9 });
    const ringBMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.7 });
    pivotA = new THREE.Group();
    pivotA.rotation.x = Math.PI / 2;
    pivotA.add(new THREE.Mesh(new THREE.TorusGeometry(1.06, 0.05, 6, 40), ringAMat));
    pivotB = new THREE.Group();
    pivotB.rotation.set(Math.PI / 2, 0, 0.55);
    pivotB.add(new THREE.Mesh(new THREE.TorusGeometry(1.2, 0.035, 6, 40), ringBMat));
    spinner.add(pivotA, pivotB);
    tint.push({ m: ringAMat }, { m: ringBMat });
  }

  /* light beam down to the tarmac */
  const beamMat = new THREE.MeshBasicMaterial({
    color, transparent: true, opacity: 0.15, side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending, depthWrite: false
  });
  beam = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 1.0, BEAM_H, 14, 1, true), beamMat);
  beam.position.y = BEAM_TOP - BEAM_H / 2;
  root.add(beam);
  tint.push({ m: beamMat });

  if (rich) {
    /* light pool on the ground */
    const padMat = new THREE.MeshBasicMaterial({
      map: crateGlowTex(), color, transparent: true, opacity: 0.6,
      blending: THREE.AdditiveBlending, depthWrite: false
    });
    pad = new THREE.Mesh(new THREE.PlaneGeometry(3.8, 3.8), padMat);
    pad.rotation.x = -Math.PI / 2;
    pad.position.y = 0.04 - CRATE_H;
    root.add(pad);
    tint.push({ m: padMat });
  }

  if (quality === 'high') {
    /* three orbiting spark motes */
    orbit = new THREE.Group();
    const satGeo = new THREE.OctahedronGeometry(0.13, 0);
    for (let i = 0; i < 3; i++) {
      const satMat = new THREE.MeshBasicMaterial({ color });
      const sat = new THREE.Mesh(satGeo, satMat);
      const a = (i / 3) * Math.PI * 2;
      sat.position.set(Math.cos(a) * 1.75, Math.sin(a * 2) * 0.34, Math.sin(a) * 1.75);
      orbit.add(sat);
      tint.push({ m: satMat });
    }
    root.add(orbit);
  }

  /* floating name tag — this is how players read the crate at speed */
  const badge = new THREE.Sprite(new THREE.SpriteMaterial({
    map: crateBadgeTex(item), transparent: true, depthWrite: false
  }));
  badge.scale.set(1.62, 0.61, 1);
  badge.position.y = BADGE_Y;
  root.add(badge);

  root.userData = { spinner, beam, pad, orbit, pivotA, pivotB, tint, coreMat, edgeMat, badge, item };
  return root;
}

/** Re-skin a crate for a freshly rolled power-up. */
function applyItem(mesh, item) {
  const u = mesh.userData;
  if (u.item && u.item.id === item.id) return;
  u.item = item;
  const tex = crateFaceTex(item);
  u.coreMat.map = tex;
  u.coreMat.emissiveMap = tex;
  u.coreMat.emissive.set(item.color);
  u.coreMat.needsUpdate = true;
  for (const entry of u.tint) {
    if (entry.emissive) entry.m.emissive.set(item.color);
    else entry.m.color.set(item.color);
  }
  if (u.badge) {
    u.badge.material.map = crateBadgeTex(item);
    u.badge.material.needsUpdate = true;
  }
}

export class Powerups {
  constructor(scene, track, quality = 'medium') {
    this.scene = scene;
    this.track = track;
    this.group = new THREE.Group();
    this.group.name = 'powerups';
    scene.add(this.group);
    this.crates = [];
    this.oils = [];
    this.effects = [];
    this.quality = quality;
    this._buildCrates();
  }

  _buildCrates() {
    this.track.itemSpots.forEach((spot) => {
      const item = randomItem(Math.random);
      const mesh = crateMesh(item, this.quality);
      mesh.position.set(spot.x, CRATE_H, spot.z);
      this.group.add(mesh);
      this.crates.push({ mesh, spot, item, active: true, timer: 0, phase: Math.random() * TAU });
    });
  }

  /** Respawn crates, spin them, test pickups (pickups need allowPickup). */
  update(dt, time, karts, emit, allowPickup = true) {
    this.crates.forEach((c) => {
      if (!c.active) {
        c.timer -= dt;
        if (c.timer <= 0) {
          c.active = true;
          c.mesh.visible = true;
          c.mesh.scale.setScalar(0.01);
          c.item = randomItem(Math.random);   // new crate, new power-up
          applyItem(c.mesh, c.item);
        }
        return;
      }
      /* float + tumble the shell, keep the beam & pool glued to the road */
      const bob = Math.sin(time * 2 + c.phase) * 0.18;
      c.mesh.position.y = CRATE_H + bob;
      const u = c.mesh.userData;
      if (u.spinner) {
        u.spinner.rotation.y += dt * 1.6;
        u.spinner.rotation.x += dt * 0.9;
      }
      if (u.pivotA) u.pivotA.rotation.y = time * 1.5 + c.phase;
      if (u.pivotB) u.pivotB.rotation.y = -time * 2.1 - c.phase;
      if (u.orbit) u.orbit.rotation.y += dt * 2.2;
      if (u.beam) u.beam.position.y = BEAM_TOP - BEAM_H / 2 - bob;
      if (u.pad) u.pad.position.y = 0.04 - CRATE_H - bob;
      if (u.badge) u.badge.position.y = BADGE_Y + Math.sin(time * 2.4 + c.phase) * 0.1;

      /* pulse the glow so the icon reads even in bright daylight */
      u.coreMat.emissiveIntensity = 1.25 + Math.sin(time * 3 + c.phase) * 0.45;

      const target = 1;
      const s = c.mesh.scale.x;
      c.mesh.scale.setScalar(s + (target - s) * Math.min(1, dt * 6));

      if (!allowPickup) return;   // no freebies before the start signal

      for (const k of karts) {
        if (k.item || k.finished) continue;
        const dx = k.pos.x - c.spot.x, dz = k.pos.z - c.spot.z;
        if (dx * dx + dz * dz < 4.4) {
          const item = c.item;               // you get exactly what the crate showed
          k.item = item;
          c.active = false;
          c.timer = 4.5;
          c.mesh.visible = false;
          emit('pickup', { kart: k, item });
          break;
        }
      }
    });

    /* oil slicks */
    for (let i = this.oils.length - 1; i >= 0; i--) {
      const o = this.oils[i];
      o.life -= dt;
      o.mesh.material.opacity = clamp(o.life / 3, 0, 0.85);
      if (o.life <= 0) {
        this.group.remove(o.mesh);
        o.mesh.geometry.dispose();
        o.mesh.material.dispose();
        this.oils.splice(i, 1);
        continue;
      }
      for (const k of karts) {
        if (k.shieldTimer > 0 || k.spinTimer > 0 || k.finished) continue;
        const dx = k.pos.x - o.x, dz = k.pos.z - o.z;
        if (dx * dx + dz * dz < 4.6) {
          k.spinTimer = 1.15;
          k.spinDir = Math.random() > 0.5 ? 1 : -1;
          k.vel.x *= 0.55;
          k.vel.z *= 0.55;
          emit('oiled', { kart: k });
          o.life = 0;
          break;
        }
      }
    }

    /* transient effects (rings, flashes) */
    for (let i = this.effects.length - 1; i >= 0; i--) {
      const e = this.effects[i];
      e.life -= dt;
      const p = 1 - e.life / e.max;
      e.mesh.scale.setScalar(1 + p * e.grow);
      if (e.mesh.material.opacity !== undefined) e.mesh.material.opacity = clamp(1 - p, 0, 1);
      if (e.life <= 0) {
        this.group.remove(e.mesh);
        e.mesh.geometry.dispose();
        e.mesh.material.dispose();
        this.effects.splice(i, 1);
      }
    }
  }

  /** Apply the player's / AI's held power-up. */
  use(kart, emit) {
    const item = kart.item;
    if (!item) return false;
    kart.item = null;

    switch (item.id) {
      case 'nitro':
        kart.boostTimer = item.duration;
        this.ring(kart.pos.x, kart.pos.z, 0xffd23f, 3, 14);
        emit('nitro', { kart });
        break;
      case 'shield':
        kart.shieldTimer = item.duration;
        this.ring(kart.pos.x, kart.pos.z, 0x00e5ff, 3, 12);
        emit('shield', { kart });
        break;
      case 'oil': {
        const bx = kart.pos.x - Math.sin(kart.yaw) * 3.6;
        const bz = kart.pos.z - Math.cos(kart.yaw) * 3.6;
        this.dropOil(bx, bz);
        emit('oil', { kart });
        break;
      }
      case 'pulse': {
        this.ring(kart.pos.x, kart.pos.z, 0xff3d7f, 2, 30);
        emit('pulse', { kart });
        break;
      }
      default:
        break;
    }
    return true;
  }

  /** Disrupt rivals near a pulse origin (called by the race). */
  applyPulse(origin, radius, karts) {
    const hit = [];
    karts.forEach((k) => {
      if (k === origin || k.finished || k.shieldTimer > 0) return;
      const d = Math.hypot(k.pos.x - origin.pos.x, k.pos.z - origin.pos.z);
      if (d < radius) {
        k.stunTimer = 1.6;
        k.vel.x *= 0.35;
        k.vel.z *= 0.35;
        hit.push(k);
      }
    });
    return hit;
  }

  dropOil(x, z) {
    const mesh = new THREE.Mesh(
      new THREE.CircleGeometry(2.3, 20),
      new THREE.MeshBasicMaterial({ color: 0x4b2f9e, transparent: true, opacity: 0.85, depthWrite: false })
    );
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(x, 0.06, z);
    this.group.add(mesh);
    this.oils.push({ mesh, x, z, life: 14 });
    // shimmer highlight
    const gloss = new THREE.Mesh(
      new THREE.CircleGeometry(0.9, 14),
      new THREE.MeshBasicMaterial({ color: 0xa99bff, transparent: true, opacity: 0.5, depthWrite: false })
    );
    gloss.rotation.x = -Math.PI / 2;
    gloss.position.set(x + 0.5, 0.07, z - 0.4);
    this.group.add(gloss);
    this.oils.push({ mesh: gloss, x, z, life: 14 });
  }

  ring(x, z, color, start, grow) {
    const mesh = new THREE.Mesh(
      new THREE.RingGeometry(0.6, 1.1, 32),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false })
    );
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(x, 0.4, z);
    mesh.scale.setScalar(start);
    this.group.add(mesh);
    this.effects.push({ mesh, life: 0.6, max: 0.6, grow });
  }

  clearHazards() {
    this.oils.forEach((o) => {
      this.group.remove(o.mesh);
      o.mesh.geometry.dispose();
      o.mesh.material.dispose();
    });
    this.oils.length = 0;
  }

  dispose() {
    this.clearHazards();
    this.effects.forEach((e) => {
      this.group.remove(e.mesh);
      e.mesh.geometry.dispose();
      e.mesh.material.dispose();
    });
    this.effects.length = 0;
    this.crates.forEach((c) => {
      this.group.remove(c.mesh);
      c.mesh.traverse((o) => {
        if (o.geometry) o.geometry.dispose();
        if (o.material) o.material.dispose();
      });
    });
    this.crates.length = 0;
    if (this.group.parent) this.group.parent.remove(this.group);
  }
}

export { POWERUPS };
