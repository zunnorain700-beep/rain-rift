/**
 * vehicles.js — six procedural karts built from Three.js primitives.
 * Each build owns its own geometry/materials so it can be disposed safely.
 */
import * as THREE from 'three';

const boxGeo = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const cylGeo = (r, h, seg = 14) => new THREE.CylinderGeometry(r, r, h, seg);

function mtl(color, o = {}) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: o.roughness ?? 0.42,
    metalness: o.metalness ?? 0.25,
    emissive: o.emissive ?? 0x000000,
    emissiveIntensity: o.emissiveIntensity ?? 1,
    transparent: o.transparent ?? false,
    opacity: o.opacity ?? 1,
    flatShading: o.flatShading ?? false
  });
}

function addBox(parent, o) {
  const mesh = new THREE.Mesh(boxGeo(o.w, o.h, o.d), o.mat);
  mesh.position.set(o.x || 0, o.y || 0, o.z || 0);
  if (o.rx) mesh.rotation.x = o.rx;
  if (o.ry) mesh.rotation.y = o.ry;
  if (o.rz) mesh.rotation.z = o.rz;
  mesh.castShadow = o.cast !== false;
  mesh.receiveShadow = false;
  parent.add(mesh);
  return mesh;
}

function makeWheel(radius, width, rimColor) {
  const g = new THREE.Group();
  const tire = new THREE.Mesh(cylGeo(radius, width, 16), mtl(0x12131a, { roughness: 0.9, metalness: 0.05 }));
  tire.rotation.z = Math.PI / 2;
  tire.castShadow = true;
  g.add(tire);
  const rim = new THREE.Mesh(cylGeo(radius * 0.58, width * 1.06, 12), mtl(rimColor, { roughness: 0.3, metalness: 0.75 }));
  rim.rotation.z = Math.PI / 2;
  g.add(rim);
  // spokes
  for (let i = 0; i < 4; i++) {
    const s = new THREE.Mesh(boxGeo(radius * 1.0, width * 1.1, radius * 0.16), mtl(0xe8eefc, { roughness: 0.35, metalness: 0.6 }));
    s.rotation.z = 0;
    s.position.set(0, 0, 0);
    s.rotation.x = (i / 4) * Math.PI;
    g.add(s);
  }
  g.userData.spin = null;
  return g;
}

const DARK = () => mtl(0x161a2c, { roughness: 0.6, metalness: 0.3 });
const GLASS = () => mtl(0x0a1224, { roughness: 0.08, metalness: 0.6, transparent: true, opacity: 0.75 });

/**
 * @param {object} def vehicle definition from data.js
 * @param {number} paint hex colour
 */
export function buildVehicle(def, paint) {
  const root = new THREE.Group();
  root.name = def.id;

  const paintMat = mtl(paint, { roughness: 0.32, metalness: 0.28 });
  const trimMat = mtl(0x101426, { roughness: 0.5, metalness: 0.35 });
  const chrome = mtl(0xd8e2f5, { roughness: 0.2, metalness: 0.9 });
  const accentMat = mtl(0x00e5ff, { roughness: 0.3, emissive: 0x00e5ff, emissiveIntensity: 0.5 });
  const headMat = mtl(0xfff6d8, { roughness: 0.2, emissive: 0xfff0c0, emissiveIntensity: 1.4 });
  const tailMat = mtl(0xff2b4a, { roughness: 0.3, emissive: 0xff2b4a, emissiveIntensity: 0.9 });

  const paintMats = [paintMat];
  const brakeMats = [tailMat];
  const flames = [];
  const wheels = [];

  const dims = {
    sport: { L: 2.9, W: 1.62, R: 0.34, WW: 0.26, F: 0.95, B: -0.95, seatY: 0.62, seatZ: -0.18, hipY: 0.5 },
    muscle: { L: 3.3, W: 1.74, R: 0.37, WW: 0.3, F: 1.1, B: -1.1, seatY: 0.66, seatZ: -0.35, hipY: 0.56 },
    buggy: { L: 3.0, W: 1.72, R: 0.46, WW: 0.34, F: 1.05, B: -1.05, seatY: 0.86, seatZ: -0.1, hipY: 0.72 },
    rally: { L: 3.0, W: 1.66, R: 0.38, WW: 0.28, F: 1.0, B: -1.0, seatY: 0.7, seatZ: -0.15, hipY: 0.6 },
    electric: { L: 3.0, W: 1.6, R: 0.33, WW: 0.26, F: 1.0, B: -1.0, seatY: 0.6, seatZ: -0.1, hipY: 0.5 },
    truck: { L: 3.5, W: 1.82, R: 0.5, WW: 0.36, F: 1.15, B: -1.15, seatY: 1.0, seatZ: -0.45, hipY: 0.92 }
  }[def.type];

  const { L, W, R, WW, F, B } = dims;
  const halfW = W / 2;
  const bodyY = R * 0.95;

  /* ---------------- per-type body ---------------- */
  if (def.type === 'sport') {
    addBox(root, { w: W, h: 0.34, d: L * 0.94, x: 0, y: bodyY, z: 0, mat: paintMat });
    addBox(root, { w: W * 0.86, h: 0.2, d: L * 0.5, x: 0, y: bodyY + 0.26, z: -0.1, mat: paintMat });
    addBox(root, { w: W * 0.7, h: 0.18, d: L * 0.4, x: 0, y: bodyY + 0.2, z: L * 0.36, mat: paintMat, rx: 0.1 });
    addBox(root, { w: W * 0.62, h: 0.3, d: 0.5, x: 0, y: bodyY + 0.12, z: -0.2, mat: trimMat }); // cockpit
    // spoiler
    addBox(root, { w: 0.1, h: 0.3, d: 0.1, x: -W * 0.34, y: bodyY + 0.4, z: -L * 0.42, mat: trimMat });
    addBox(root, { w: 0.1, h: 0.3, d: 0.1, x: W * 0.34, y: bodyY + 0.4, z: -L * 0.42, mat: trimMat });
    addBox(root, { w: W * 0.94, h: 0.07, d: 0.4, x: 0, y: bodyY + 0.56, z: -L * 0.44, mat: paintMat, rx: -0.16 });
    addBox(root, { w: W * 0.5, h: 0.1, d: 0.12, x: 0, y: bodyY + 0.02, z: L * 0.47, mat: headMat });
    addBox(root, { w: W * 0.55, h: 0.08, d: 0.08, x: 0, y: bodyY + 0.05, z: -L * 0.47, mat: tailMat });
    addBox(root, { w: W * 1.02, h: 0.1, d: 0.3, x: 0, y: bodyY - 0.16, z: L * 0.3, mat: trimMat });
  } else if (def.type === 'muscle') {
    addBox(root, { w: W, h: 0.42, d: L * 0.96, x: 0, y: bodyY + 0.04, z: 0, mat: paintMat });
    addBox(root, { w: W * 0.92, h: 0.3, d: L * 0.52, x: 0, y: bodyY + 0.4, z: 0.28, mat: paintMat }); // long hood
    addBox(root, { w: W * 0.42, h: 0.16, d: 0.6, x: 0, y: bodyY + 0.6, z: 0.5, mat: trimMat }); // scoop
    addBox(root, { w: W * 0.86, h: 0.34, d: L * 0.34, x: 0, y: bodyY + 0.5, z: -0.5, mat: GLASS() }); // cabin
    addBox(root, { w: W * 0.9, h: 0.3, d: 0.16, x: 0, y: bodyY + 0.1, z: L * 0.48, mat: chrome }); // grille
    addBox(root, { w: W * 0.7, h: 0.06, d: L * 0.9, x: 0, y: bodyY + 0.45, z: 0.1, mat: mtl(0xf5f7ff, { roughness: 0.4 }) }); // stripe
    addBox(root, { w: 0.14, h: 0.14, d: 0.5, x: -W * 0.42, y: bodyY - 0.1, z: -0.4, mat: chrome });
    addBox(root, { w: 0.14, h: 0.14, d: 0.5, x: W * 0.42, y: bodyY - 0.1, z: -0.4, mat: chrome });
    addBox(root, { w: 0.22, h: 0.14, d: 0.12, x: -W * 0.28, y: bodyY + 0.14, z: L * 0.46, mat: headMat });
    addBox(root, { w: 0.22, h: 0.14, d: 0.12, x: W * 0.28, y: bodyY + 0.14, z: L * 0.46, mat: headMat });
    addBox(root, { w: W * 0.8, h: 0.1, d: 0.1, x: 0, y: bodyY + 0.16, z: -L * 0.47, mat: tailMat });
  } else if (def.type === 'buggy') {
    addBox(root, { w: W * 0.78, h: 0.3, d: L * 0.7, x: 0, y: bodyY + 0.1, z: 0, mat: paintMat });
    addBox(root, { w: W * 0.7, h: 0.26, d: L * 0.3, x: 0, y: bodyY + 0.3, z: -0.2, mat: trimMat });
    // roll cage
    const tube = 0.09;
    addBox(root, { w: tube, h: 0.85, d: tube, x: -W * 0.36, y: bodyY + 0.6, z: 0.3, mat: chrome });
    addBox(root, { w: tube, h: 0.85, d: tube, x: W * 0.36, y: bodyY + 0.6, z: 0.3, mat: chrome });
    addBox(root, { w: tube, h: 0.7, d: tube, x: -W * 0.36, y: bodyY + 0.55, z: -0.7, mat: chrome });
    addBox(root, { w: tube, h: 0.7, d: tube, x: W * 0.36, y: bodyY + 0.55, z: -0.7, mat: chrome });
    addBox(root, { w: W * 0.78, h: tube, d: tube, x: 0, y: bodyY + 1.0, z: 0.3, mat: chrome });
    addBox(root, { w: W * 0.78, h: tube, d: tube, x: 0, y: bodyY + 0.9, z: -0.7, mat: chrome });
    addBox(root, { w: tube, h: tube, d: 1.0, x: -W * 0.36, y: bodyY + 1.0, z: -0.2, mat: chrome, rx: Math.PI / 2 });
    addBox(root, { w: tube, h: tube, d: 1.0, x: W * 0.36, y: bodyY + 1.0, z: -0.2, mat: chrome, rx: Math.PI / 2 });
    // suspension arms
    [-1, 1].forEach((s) => {
      addBox(root, { w: 0.5, h: 0.1, d: 0.12, x: s * halfW * 0.7, y: bodyY + 0.05, z: F, mat: chrome });
      addBox(root, { w: 0.5, h: 0.1, d: 0.12, x: s * halfW * 0.7, y: bodyY + 0.05, z: B, mat: chrome });
    });
    addBox(root, { w: 0.6, h: 0.16, d: 0.16, x: 0, y: bodyY + 0.16, z: L * 0.4, mat: headMat });
    addBox(root, { w: 0.5, h: 0.1, d: 0.08, x: 0, y: bodyY + 0.3, z: -L * 0.4, mat: tailMat });
    addBox(root, { w: W * 0.9, h: 0.12, d: 0.14, x: 0, y: bodyY - 0.1, z: L * 0.45, mat: trimMat });
  } else if (def.type === 'rally') {
    addBox(root, { w: W, h: 0.4, d: L * 0.95, x: 0, y: bodyY, z: 0, mat: paintMat });
    addBox(root, { w: W * 0.9, h: 0.42, d: L * 0.5, x: 0, y: bodyY + 0.4, z: -0.1, mat: paintMat });
    addBox(root, { w: W * 0.82, h: 0.32, d: L * 0.34, x: 0, y: bodyY + 0.44, z: -0.15, mat: GLASS() });
    addBox(root, { w: W * 0.8, h: 0.06, d: L * 0.34, x: 0, y: bodyY + 0.66, z: -0.15, mat: trimMat }); // roof rack base
    addBox(root, { w: W * 0.7, h: 0.1, d: 0.3, x: 0, y: bodyY + 0.74, z: 0.0, mat: mtl(0xffd23f, { roughness: 0.5 }) });
    // light bar
    for (let i = -1; i <= 1; i++) {
      const lamp = new THREE.Mesh(cylGeo(0.11, 0.08, 12), headMat);
      lamp.rotation.x = Math.PI / 2;
      lamp.position.set(i * 0.24, bodyY + 0.62, L * 0.16);
      root.add(lamp);
    }
    addBox(root, { w: W * 0.9, h: 0.07, d: 0.4, x: 0, y: bodyY + 0.5, z: -L * 0.45, mat: paintMat, rx: -0.2 }); // wing
    addBox(root, { w: W * 0.5, h: 0.12, d: 0.1, x: 0, y: bodyY + 0.1, z: L * 0.47, mat: headMat });
    addBox(root, { w: W * 0.6, h: 0.1, d: 0.08, x: 0, y: bodyY + 0.14, z: -L * 0.47, mat: tailMat });
    addBox(root, { w: 0.24, h: 0.3, d: 0.06, x: -W * 0.4, y: bodyY - 0.18, z: 0.5, mat: trimMat });
    addBox(root, { w: 0.24, h: 0.3, d: 0.06, x: W * 0.4, y: bodyY - 0.18, z: 0.5, mat: trimMat });
  } else if (def.type === 'electric') {
    addBox(root, { w: W, h: 0.3, d: L * 0.96, x: 0, y: bodyY, z: 0, mat: paintMat, rx: 0.02 });
    addBox(root, { w: W * 0.9, h: 0.34, d: L * 0.5, x: 0, y: bodyY + 0.3, z: -0.1, mat: paintMat });
    addBox(root, { w: W * 0.74, h: 0.3, d: L * 0.4, x: 0, y: bodyY + 0.44, z: -0.1, mat: GLASS() }); // canopy
    addBox(root, { w: W * 0.7, h: 0.09, d: L * 0.6, x: 0, y: bodyY + 0.16, z: 0.1, mat: trimMat }); // vent channel
    addBox(root, { w: W * 0.86, h: 0.05, d: 0.07, x: 0, y: bodyY + 0.1, z: L * 0.48, mat: accentMat }); // LED strip
    addBox(root, { w: W * 0.8, h: 0.05, d: 0.07, x: 0, y: bodyY + 0.14, z: -L * 0.48, mat: tailMat });
    addBox(root, { w: 0.1, h: 0.16, d: L * 0.7, x: -halfW * 0.96, y: bodyY + 0.24, z: 0, mat: accentMat });
    addBox(root, { w: 0.1, h: 0.16, d: L * 0.7, x: halfW * 0.96, y: bodyY + 0.24, z: 0, mat: accentMat });
    addBox(root, { w: W * 1.02, h: 0.1, d: 0.7, x: 0, y: bodyY + 0.12, z: L * 0.34, mat: paintMat });
    addBox(root, { w: W * 0.9, h: 0.06, d: 0.3, x: 0, y: bodyY - 0.14, z: -L * 0.3, mat: trimMat }); // diffuser
  } else if (def.type === 'truck') {
    addBox(root, { w: W, h: 0.5, d: L * 0.96, x: 0, y: bodyY + 0.2, z: 0, mat: paintMat });            // frame
    addBox(root, { w: W * 0.94, h: 0.8, d: L * 0.42, x: 0, y: bodyY + 0.78, z: L * 0.26, mat: paintMat }); // cab
    addBox(root, { w: W * 0.86, h: 0.4, d: 0.1, x: 0, y: bodyY + 0.92, z: L * 0.47, mat: GLASS() });  // windscreen
    addBox(root, { w: W * 0.9, h: 0.34, d: 0.1, x: 0, y: bodyY + 0.86, z: L * 0.06, mat: GLASS() });  // rear glass
    addBox(root, { w: W * 0.94, h: 0.46, d: L * 0.42, x: 0, y: bodyY + 0.5, z: -L * 0.26, mat: paintMat }); // bed
    addBox(root, { w: W * 0.9, h: 0.1, d: L * 0.4, x: 0, y: bodyY + 0.34, z: -L * 0.26, mat: trimMat });
    addBox(root, { w: W * 1.0, h: 0.3, d: 0.16, x: 0, y: bodyY + 0.02, z: L * 0.5, mat: chrome });     // bull bar
    addBox(root, { w: W * 0.96, h: 0.1, d: 0.1, x: 0, y: bodyY + 0.24, z: L * 0.5, mat: chrome });
    addBox(root, { w: 0.16, h: 0.7, d: 0.16, x: -W * 0.36, y: bodyY + 0.7, z: -L * 0.02, mat: chrome }); // stacks
    addBox(root, { w: 0.16, h: 0.7, d: 0.16, x: W * 0.36, y: bodyY + 0.7, z: -L * 0.02, mat: chrome });
    addBox(root, { w: W * 0.8, h: 0.12, d: 0.14, x: 0, y: bodyY + 1.22, z: L * 0.2, mat: headMat });    // roof lights
    addBox(root, { w: 0.3, h: 0.2, d: 0.14, x: -W * 0.3, y: bodyY + 0.3, z: L * 0.47, mat: headMat });
    addBox(root, { w: 0.3, h: 0.2, d: 0.14, x: W * 0.3, y: bodyY + 0.3, z: L * 0.47, mat: headMat });
    addBox(root, { w: W * 0.7, h: 0.14, d: 0.1, x: 0, y: bodyY + 0.3, z: -L * 0.47, mat: tailMat });
  }

  /* ---------------- boost flames ---------------- */
  const flameMat = new THREE.MeshBasicMaterial({ color: 0xffd23f, transparent: true, opacity: 0.9 });
  const flameGeo = new THREE.ConeGeometry(0.16, 0.7, 8);
  [-0.42, 0.42].forEach((x) => {
    const f = new THREE.Mesh(flameGeo, flameMat);
    f.rotation.x = -Math.PI / 2;
    f.position.set(x * (W / 1.6), bodyY + 0.04, -L * 0.5 - 0.2);
    f.visible = false;
    f.userData.phase = Math.random() * 6;
    root.add(f);
    flames.push(f);
  });

  /* ---------------- wheels ---------------- */
  const wheelDefs = [
    { x: -halfW + 0.06, z: F, steer: true },
    { x: halfW - 0.06, z: F, steer: true },
    { x: -halfW + 0.06, z: B, steer: false },
    { x: halfW - 0.06, z: B, steer: false }
  ];
  wheelDefs.forEach((wd) => {
    const w = makeWheel(R, WW, 0xc9d4ee);
    w.position.set(wd.x, R, wd.z);
    root.add(w);
    wheels.push({ group: w, steer: wd.steer, radius: R, x: wd.x, z: wd.z });
  });

  /* ---------------- chassis shadow catcher ---------------- */
  const shadowCanvas = document.createElement('canvas');
  shadowCanvas.width = 64;
  shadowCanvas.height = 64;
  const shadowContext = shadowCanvas.getContext('2d');
  const shadowGradient = shadowContext.createRadialGradient(32, 32, 6, 32, 32, 32);
  shadowGradient.addColorStop(0, 'rgba(0, 0, 0, 0.32)');
  shadowGradient.addColorStop(0.5, 'rgba(0, 0, 0, 0.20)');
  shadowGradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
  shadowContext.fillStyle = shadowGradient;
  shadowContext.fillRect(0, 0, 64, 64);
  const shadowMap = new THREE.CanvasTexture(shadowCanvas);
  const shadow = new THREE.Mesh(
    new THREE.PlaneGeometry(W * 1.5, L * 1.15),
    new THREE.MeshBasicMaterial({
      map: shadowMap, transparent: true, depthWrite: false,
      polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1
    })
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.045;
  root.add(shadow);

  root.userData = {
    isVehicle: true,
    shadow,
    def,
    wheels,
    flames,
    paintMats,
    brakeMats,
    paint,
    dims,
    driverMount: new THREE.Vector3(0, dims.seatY, dims.seatZ),
    seatHipY: dims.hipY,
    setPaint(hex) {
      root.userData.paint = hex;
      paintMats.forEach((m) => m.color.setHex(hex));
    }
  };
  return root;
}

/** Per-frame cosmetic update. */
export function updateVehicleVisual(group, dt, state) {
  const ud = group.userData;
  if (!ud || !ud.wheels) return;
  const spin = ((state.speed || 0) / 0.34) * dt;
  const steer = state.steer || 0;
  ud.wheels.forEach((w) => {
    w.group.rotation.x += spin;
    if (w.steer) w.group.rotation.y = steer * 0.42;
  });
  ud.brakeMats.forEach((m) => { m.emissiveIntensity = state.brake ? 2.6 : 0.9; });
  const boosting = !!state.boosting;
  ud.flames.forEach((f, i) => {
    f.visible = boosting;
    if (boosting) {
      const p = 0.7 + Math.sin(performance.now() * 0.03 + i) * 0.3;
      f.scale.set(p, 1 + p * 0.5, p);
      f.material.color.setHex(Math.random() > 0.5 ? 0xffd23f : 0xff6b2c);
    }
  });
  group.rotation.z = -(state.lean || 0) * 0.12;
  group.rotation.x = state.pitch || 0;
}

/** Dispose geometry + materials owned by an object tree. */
export function disposeObject(root) {
  const geos = new Set();
  const mats = new Set();
  const textures = new Set();
  root.traverse((o) => {
    if (o.geometry) geos.add(o.geometry);
    if (o.material) {
      const list = Array.isArray(o.material) ? o.material : [o.material];
      list.forEach((m) => {
        mats.add(m);
        Object.values(m).forEach((value) => {
          if (value && value.isTexture) textures.add(value);
        });
      });
    }
  });
  geos.forEach((g) => g.dispose());
  mats.forEach((m) => m.dispose());
  textures.forEach((texture) => texture.dispose());
}
