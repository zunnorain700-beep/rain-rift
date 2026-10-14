/**
 * characters.js — procedural low-poly racers built from Three.js primitives.
 * Every racer shares geometry buffers; only materials and proportions differ.
 */
import * as THREE from 'three';

/* Shared geometry cache ---------------------------------- */
const geo = {
  box: new THREE.BoxGeometry(1, 1, 1),
  head: new THREE.BoxGeometry(0.44, 0.44, 0.42),
  sphere: new THREE.SphereGeometry(1, 12, 9),
  helmet: new THREE.SphereGeometry(0.28, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.62),
  cyl: new THREE.CylinderGeometry(1, 1, 1, 12),
  cone: new THREE.ConeGeometry(1, 1, 8),
  disc: new THREE.CylinderGeometry(1, 1, 1, 20)
};

const matCache = new Map();
function mat(color, opts = {}) {
  const key = `${color}-${opts.emissive || 0}-${opts.transparent || false}-${opts.opacity || 1}`;
  if (matCache.has(key)) return matCache.get(key);
  const m = new THREE.MeshStandardMaterial({
    color,
    roughness: opts.roughness ?? 0.7,
    metalness: opts.metalness ?? 0.05,
    emissive: opts.emissive ?? 0x000000,
    emissiveIntensity: opts.emissiveIntensity ?? 1,
    transparent: opts.transparent ?? false,
    opacity: opts.opacity ?? 1,
    flatShading: opts.flatShading ?? false
  });
  matCache.set(key, m);
  return m;
}

function part(geometry, material, sx, sy, sz, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geometry, material);
  m.scale.set(sx, sy, sz);
  m.position.set(x, y, z);
  m.castShadow = true;
  return m;
}

/**
 * Build a racer.
 * @param {object} def character definition from data.js
 * @param {{seated?:boolean, detail?:number}} opts
 */
export function buildCharacter(def, opts = {}) {
  const L = def.look;
  const root = new THREE.Group();
  root.name = def.id;

  const suit = mat(L.suit, { roughness: 0.55 });
  const suit2 = mat(L.suit2, { roughness: 0.6 });
  const trim = mat(L.trim, { roughness: 0.4, emissive: L.trim, emissiveIntensity: 0.35 });
  const skin = mat(L.skin, { roughness: 0.85 });
  const hair = mat(L.hair, { roughness: 0.9 });
  const dark = mat(0x14162a, { roughness: 0.5 });
  const accent = mat(L.accent, { roughness: 0.45, emissive: L.accent, emissiveIntensity: 0.25 });

  /* ---- torso ---- */
  const torso = new THREE.Group();
  torso.position.y = 1.02;
  root.add(torso);

  const chest = part(geo.box, suit, 0.5, 0.56, 0.3, 0, 0, 0);
  torso.add(chest);
  torso.add(part(geo.box, suit2, 0.52, 0.2, 0.32, 0, -0.2, 0));
  torso.add(part(geo.box, trim, 0.34, 0.06, 0.33, 0, 0.14, 0.005));   // chest stripe
  torso.add(part(geo.box, accent, 0.12, 0.12, 0.05, 0.12, 0.02, 0.16)); // badge light

  /* ---- head ---- */
  const neck = new THREE.Group();
  neck.position.y = 0.34;
  torso.add(neck);
  const headMesh = part(geo.head, skin, 1, 1, 1, 0, 0.24, 0);
  neck.add(headMesh);
  neck.add(part(geo.box, dark, 0.07, 0.06, 0.03, -0.1, 0.26, 0.21)); // eyes
  neck.add(part(geo.box, dark, 0.07, 0.06, 0.03, 0.1, 0.26, 0.21));

  /* ---- helmet / headgear variants ---- */
  const gear = L.helmet;
  if (gear === 'visor') {
    const helm = new THREE.Mesh(geo.helmet, mat(L.suit, { roughness: 0.3, metalness: 0.35 }));
    helm.scale.set(0.34, 0.36, 0.34);
    helm.position.set(0, 0.3, 0);
    helm.castShadow = true;
    neck.add(helm);
    const visor = part(geo.box, mat(L.visor, { roughness: 0.1, metalness: 0.5, emissive: L.visor, emissiveIntensity: 0.45 }),
      0.3, 0.14, 0.1, 0, 0.27, 0.22);
    neck.add(visor);
    neck.add(part(geo.box, trim, 0.06, 0.05, 0.06, 0, 0.46, 0.14));
  } else if (gear === 'scarf') {
    neck.add(part(geo.cyl, hair, 0.24, 0.2, 0.24, 0, 0.46, 0));
    neck.add(part(geo.box, trim, 0.46, 0.1, 0.46, 0, 0.4, 0));
    neck.add(part(geo.box, mat(L.visor, { roughness: 0.2, metalness: 0.4 }), 0.3, 0.09, 0.06, 0, 0.3, 0.2));
    const scarf = part(geo.box, accent, 0.5, 0.12, 0.36, 0, -0.04, 0);
    neck.add(scarf);
    neck.add(part(geo.box, accent, 0.16, 0.3, 0.1, -0.2, -0.18, -0.12)); // trailing end
  } else if (gear === 'headset') {
    neck.add(part(geo.box, hair, 0.48, 0.2, 0.46, 0, 0.44, 0));
    neck.add(part(geo.box, hair, 0.5, 0.24, 0.14, 0, 0.3, -0.2));
    neck.add(part(geo.box, dark, 0.06, 0.44, 0.06, -0.26, 0.3, 0));
    neck.add(part(geo.box, dark, 0.06, 0.44, 0.06, 0.26, 0.3, 0));
    const cupL = part(geo.cyl, trim, 0.09, 0.06, 0.09, -0.27, 0.22, 0);
    cupL.rotation.z = Math.PI / 2;
    neck.add(cupL);
    const cupR = part(geo.cyl, trim, 0.09, 0.06, 0.09, 0.27, 0.22, 0);
    cupR.rotation.z = Math.PI / 2;
    neck.add(cupR);
    neck.add(part(geo.box, mat(L.visor, { emissive: L.visor, emissiveIntensity: 0.6 }), 0.26, 0.07, 0.04, 0, 0.3, 0.21));
  } else if (gear === 'crown') {
    neck.add(part(geo.box, hair, 0.46, 0.16, 0.44, 0, 0.44, 0));
    neck.add(part(geo.box, accent, 0.46, 0.08, 0.44, 0, 0.5, 0));
    neck.add(part(geo.box, accent, 0.4, 0.05, 0.2, 0, 0.46, 0.3)); // cap peak
    neck.add(part(geo.box, trim, 0.1, 0.14, 0.1, -0.13, 0.58, 0));
    neck.add(part(geo.box, trim, 0.1, 0.14, 0.1, 0.13, 0.58, 0));
    neck.add(part(geo.box, trim, 0.1, 0.18, 0.1, 0, 0.6, 0));
  }

  /* ---- arms ---- */
  const arms = [];
  [-1, 1].forEach((side) => {
    const shoulder = new THREE.Group();
    shoulder.position.set(side * 0.31, 0.2, 0);
    torso.add(shoulder);
    const upper = part(geo.box, suit, 0.16, 0.34, 0.16, 0, -0.17, 0);
    shoulder.add(upper);
    const elbow = new THREE.Group();
    elbow.position.y = -0.34;
    shoulder.add(elbow);
    elbow.add(part(geo.box, suit2, 0.14, 0.3, 0.14, 0, -0.15, 0));
    elbow.add(part(geo.box, skin, 0.15, 0.13, 0.15, 0, -0.34, 0)); // glove/hand
    elbow.add(part(geo.box, trim, 0.17, 0.05, 0.17, 0, -0.03, 0)); // wrist band
    arms.push({ shoulder, elbow, side });
  });

  /* ---- legs ---- */
  const legs = [];
  [-1, 1].forEach((side) => {
    const hip = new THREE.Group();
    hip.position.set(side * 0.14, -0.3, 0);
    torso.add(hip);
    hip.add(part(geo.box, suit2, 0.2, 0.42, 0.2, 0, -0.21, 0));
    const knee = new THREE.Group();
    knee.position.y = -0.42;
    hip.add(knee);
    knee.add(part(geo.box, suit, 0.18, 0.4, 0.18, 0, -0.2, 0));
    knee.add(part(geo.box, dark, 0.2, 0.12, 0.3, 0, -0.42, 0.06)); // boot
    legs.push({ hip, knee, side });
  });

  /* ---- proportions per character (silhouette variety) ---- */
  const v = (def.id.charCodeAt(0) % 7) / 100;
  root.scale.set(1 + v * 0.5, 1 - v * 0.35, 1 + v * 0.2);

  root.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = false; } });

  root.userData = {
    isCharacter: true,
    parts: { torso, neck, arms, legs },
    def,
    height: 1.72
  };

  poseStanding(root);
  return root;
}

/** Relaxed standing pose (menus / preview). */
export function poseStanding(group) {
  const p = group.userData.parts;
  if (!p) return;
  p.torso.rotation.set(0, 0, 0);
  p.legs.forEach((l) => { l.hip.rotation.set(0, 0, 0); l.knee.rotation.set(0, 0, 0); });
  p.arms.forEach((a) => {
    a.shoulder.rotation.set(0.08, 0, a.side * 0.16);
    a.elbow.rotation.set(-0.2, 0, 0);
  });
}

/**
 * Seated driving pose (inside a kart).
 * @param {THREE.Object3D} group
 * @param {number} hipsY hip height in character space — the caller converts
 *   from the cockpit height so the racer sits in the seat instead of standing
 *   on top of it.
 */
export function poseSeated(group, hipsY = -0.17) {
  const p = group.userData.parts;
  if (!p) return;
  p.torso.position.y = hipsY + 0.3;      // hips sit 0.3 below the torso pivot
  p.torso.rotation.x = 0.14;
  p.legs.forEach((l) => {
    l.hip.rotation.x = -1.45;
    l.hip.rotation.z = l.side * 0.16;
    l.knee.rotation.x = 1.35;
  });
  p.arms.forEach((a) => {
    a.shoulder.rotation.set(-1.05, 0, a.side * 0.22);
    a.elbow.rotation.set(-0.55, 0, 0);
  });
}

/** Animate a standing racer (preview / podium). */
export function animateStanding(group, t) {
  const p = group.userData.parts;
  if (!p) return;
  group.position.y = Math.sin(t * 2) * 0.03;
  p.torso.rotation.y = Math.sin(t * 0.9) * 0.12;
  p.neck.rotation.y = Math.sin(t * 0.7 + 1) * 0.22;
  p.arms.forEach((a, i) => {
    a.shoulder.rotation.x = 0.08 + Math.sin(t * 2 + i) * 0.14;
    a.elbow.rotation.x = -0.2 - Math.max(0, Math.sin(t * 2 + i)) * 0.2;
  });
  p.legs.forEach((l, i) => { l.knee.rotation.x = Math.sin(t * 1.4 + i) * 0.05; });
}

/** Animate a seated racer while driving. */
export function animateDriving(group, t, steer = 0, bounce = 0) {
  const p = group.userData.parts;
  if (!p) return;
  p.torso.rotation.y = steer * 0.35;
  p.torso.rotation.x = 0.14 + bounce * 0.05;
  p.neck.rotation.y = -steer * 0.25;
  p.neck.rotation.x = -bounce * 0.06;
  p.arms.forEach((a) => {
    a.shoulder.rotation.y = -steer * 0.5;
    a.shoulder.rotation.x = -1.05 + Math.sin(t * 9) * 0.03 * bounce;
  });
}
