/**
 * tracks.js — procedural circuits: spline centerline, road ribbon, barriers,
 * scenery biomes, checkpoints, item spots and minimap data.
 */
import * as THREE from 'three';
import { sampleClosedSpline, makeRng, SECTOR_COUNT, ITEM_SPOTS, TAU, clamp } from './data.js';

const SAMPLES = 400;

/* ---------------------------------------------------------------
   Procedural road textures
   --------------------------------------------------------------- */
function roadTexture(def) {
  const p = def.palette;
  const c = document.createElement('canvas');
  c.width = 256; c.height = 256;
  const g = c.getContext('2d');
  const base = `#${p.road.toString(16).padStart(6, '0')}`;
  g.fillStyle = base;
  g.fillRect(0, 0, 256, 256);

  const rng = makeRng(def.seed);
  // surface noise
  for (let i = 0; i < 2400; i++) {
    const x = rng() * 256, y = rng() * 256, r = rng() * 2.4 + 0.4;
    g.fillStyle = `rgba(0,0,0,${rng() * 0.16})`;
    g.fillRect(x, y, r, r);
  }
  for (let i = 0; i < 500; i++) {
    g.fillStyle = `rgba(255,255,255,${rng() * 0.05})`;
    g.fillRect(rng() * 256, rng() * 256, 2, 2);
  }

  const line = `#${p.line.toString(16).padStart(6, '0')}`;
  const edge = `#${p.edge.toString(16).padStart(6, '0')}`;
  // solid edge lines
  g.fillStyle = edge;
  g.fillRect(6, 0, 7, 256);
  g.fillRect(243, 0, 7, 256);
  // dashed centre line (one dash per 12 m tile)
  if (def.biome !== 'desert') {
    g.fillStyle = line;
    g.fillRect(123, 6, 6, 96);
    g.fillRect(123, 160, 6, 96);
  } else {
    g.fillStyle = 'rgba(255,240,210,.55)';
    g.fillRect(123, 20, 6, 70);
    g.fillRect(123, 150, 6, 70);
  }
  // biome dressing
  if (def.biome === 'city') {
    g.fillStyle = 'rgba(0,229,255,.16)';
    g.fillRect(14, 0, 3, 256);
    g.fillStyle = 'rgba(255,61,127,.16)';
    g.fillRect(239, 0, 3, 256);
  } else if (def.biome === 'desert') {
    for (let i = 0; i < 40; i++) {
      g.fillStyle = `rgba(120,70,40,${0.05 + rng() * 0.12})`;
      g.beginPath();
      g.ellipse(rng() * 256, rng() * 256, 18 + rng() * 30, 8 + rng() * 14, 0, 0, TAU);
      g.fill();
    }
  } else if (def.biome === 'forest') {
    for (let i = 0; i < 60; i++) {
      g.fillStyle = `rgba(40,60,35,${0.06 + rng() * 0.14})`;
      g.beginPath();
      g.ellipse(rng() * 256, rng() * 256, 14 + rng() * 26, 6 + rng() * 12, 0, 0, TAU);
      g.fill();
    }
  }

  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 4;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function checkerTexture() {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 64;
  const g = c.getContext('2d');
  const n = 16, s = 256 / n;
  for (let y = 0; y < 4; y++) {
    for (let x = 0; x < n; x++) {
      g.fillStyle = (x + y) % 2 ? '#101426' : '#f7fbff';
      g.fillRect(x * s, y * 16, s, 16);
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function bannerTexture(text, color) {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 128;
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 512, 0);
  grad.addColorStop(0, '#05070f');
  grad.addColorStop(0.5, '#141a3a');
  grad.addColorStop(1, '#05070f');
  g.fillStyle = grad;
  g.fillRect(0, 0, 512, 128);
  g.strokeStyle = `#${color.toString(16).padStart(6, '0')}`;
  g.lineWidth = 8;
  g.strokeRect(4, 4, 504, 120);
  g.fillStyle = '#f2f7ff';
  g.font = 'bold 74px Orbitron, Arial Black, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, 256, 66);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function windowTexture(seed) {
  const c = document.createElement('canvas');
  c.width = 64; c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#000';
  g.fillRect(0, 0, 64, 128);
  const rng = makeRng(seed);
  const cols = ['#00e5ff', '#ff3d7f', '#ffd23f', '#7b5cff', '#3ddc97', '#ffffff'];
  for (let y = 4; y < 124; y += 10) {
    for (let x = 4; x < 60; x += 10) {
      if (rng() > 0.42) {
        g.fillStyle = cols[Math.floor(rng() * cols.length)];
        g.globalAlpha = 0.35 + rng() * 0.65;
        g.fillRect(x, y, 6, 6);
      }
    }
  }
  g.globalAlpha = 1;
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/* ---------------------------------------------------------------
   Geometry builders
   --------------------------------------------------------------- */
function ribbonGeometry(pts, halfW, y, uvRepeat, extra = 0) {
  const n = pts.length;
  const pos = new Float32Array((n + 1) * 2 * 3);
  const uv = new Float32Array((n + 1) * 2 * 2);
  const idx = [];
  let d = 0;
  for (let i = 0; i <= n; i++) {
    const k = i % n;
    const s = pts[k];
    const nx = s.nx * (halfW + extra), nz = s.nz * (halfW + extra);
    const o = i * 6;
    pos[o] = s.x + nx; pos[o + 1] = y; pos[o + 2] = s.z + nz;
    pos[o + 3] = s.x - nx; pos[o + 4] = y; pos[o + 5] = s.z - nz;
    const u = i * 4;
    uv[u] = 0; uv[u + 1] = d / uvRepeat;
    uv[u + 2] = 1; uv[u + 3] = d / uvRepeat;
    if (i < n) {
      const a = i * 2, b = a + 1, c2 = a + 2, d2 = a + 3;
      idx.push(a, b, c2, b, d2, c2);
    }
    if (i < n) d += s.segLen;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

function wallGeometry(pts, offset, h0, h1) {
  const n = pts.length;
  const pos = new Float32Array((n + 1) * 2 * 3);
  const idx = [];
  const col = new Float32Array((n + 1) * 2 * 3);
  for (let i = 0; i <= n; i++) {
    const k = i % n;
    const s = pts[k];
    const ox = s.nx * offset, oz = s.nz * offset;
    const o = i * 6;
    pos[o] = s.x + ox; pos[o + 1] = h0; pos[o + 2] = s.z + oz;
    pos[o + 3] = s.x + ox; pos[o + 4] = h1; pos[o + 5] = s.z + oz;
    if (i < n) {
      const a = i * 2, b = a + 1, c = a + 2, d = a + 3;
      idx.push(a, b, c, b, d, c);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

function arrowGeometry(pts, offset) {
  // thin bright band used as checkpoint markers on the barriers
  const n = pts.length;
  const pos = [];
  const idx = [];
  let vi = 0;
  for (let i = 0; i < n; i += 10) {
    const a = pts[i], b = pts[(i + 1) % n];
    const ax = a.x + a.nx * offset, az = a.z + a.nz * offset;
    const bx = b.x + b.nx * offset, bz = b.z + b.nz * offset;
    pos.push(ax, 0.62, az, bx, 0.62, bz, bx, 1.0, bz, ax, 1.0, az);
    idx.push(vi, vi + 1, vi + 2, vi, vi + 2, vi + 3);
    vi += 4;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/* ---------------------------------------------------------------
   Scenery
   --------------------------------------------------------------- */
function addScenery(track, def, quality) {
  const p = def.palette;
  const rng = makeRng(def.seed * 7 + 3);
  const g = track.group;
  const density = quality === 'low' ? 0.55 : quality === 'high' ? 1.25 : 1;
  const roadEdge = track.halfWidth + track.runoff + 3.5;
  const hex = (n) => `#${n.toString(16).padStart(6, '0')}`;

  const rockGeo = new THREE.IcosahedronGeometry(1, 0);
  const trunkGeo = new THREE.CylinderGeometry(0.16, 0.24, 1, 6);
  const pineGeo = new THREE.ConeGeometry(1, 1, 7);
  const boxGeo = new THREE.BoxGeometry(1, 1, 1);

  const mats = {
    rock: new THREE.MeshStandardMaterial({ color: p.deco, roughness: 0.95, flatShading: true }),
    trunk: new THREE.MeshStandardMaterial({ color: 0x6b4a2f, roughness: 0.95 }),
    leaf: new THREE.MeshStandardMaterial({ color: p.deco, roughness: 0.9, flatShading: true }),
    leaf2: new THREE.MeshStandardMaterial({ color: p.accent, roughness: 0.85, flatShading: true }),
    metal: new THREE.MeshStandardMaterial({ color: 0x8892b0, roughness: 0.5, metalness: 0.6 }),
    glow: new THREE.MeshStandardMaterial({ color: p.accent, emissive: p.accent, emissiveIntensity: 1.5, roughness: 0.4 })
  };

  const place = (mesh, i, side, dist) => {
    const s = track.samples[i % track.samples.length];
    mesh.position.set(s.x + s.nx * dist * side, 0, s.z + s.nz * dist * side);
    mesh.rotation.y = rng() * TAU;
    g.add(mesh);
    return mesh;
  };

  const nStations = Math.floor(track.samples.length / 6);
  const step = Math.max(1, Math.round(1 / density));

  if (def.biome === 'city') {
    const winTex = windowTexture(def.seed);
    const bMat = new THREE.MeshStandardMaterial({
      color: p.deco, roughness: 0.8, metalness: 0.25,
      emissive: 0xffffff, emissiveMap: winTex, emissiveIntensity: 0.9
    });
    for (let s = 0; s < nStations; s += step) {
      const i = s * 6;
      [-1, 1].forEach((side) => {
        if (rng() > 0.72) return;
        const h = 14 + rng() * 46;
        const w = 8 + rng() * 12;
        const b = new THREE.Mesh(boxGeo, bMat);
        b.scale.set(w, h, w * (0.7 + rng() * 0.7));
        place(b, i, side, roadEdge + 8 + rng() * 34);
        b.position.y = h / 2;
        // rooftop beacon
        if (rng() > 0.55) {
          const be = new THREE.Mesh(new THREE.SphereGeometry(0.8, 8, 6), mats.glow);
          be.position.set(b.position.x, h + 1, b.position.z);
          g.add(be);
        }
      });
    }
    // street lights along both sides
    for (let s = 0; s < track.samples.length; s += 14) {
      const side = (s / 14) % 2 ? 1 : -1;
      const st = track.samples[s];
      const pole = new THREE.Mesh(trunkGeo, mats.metal);
      pole.scale.set(1.4, 8, 1.4);
      pole.position.set(st.x + st.nx * (roadEdge + 1.2) * side, 4, st.z + st.nz * (roadEdge + 1.2) * side);
      g.add(pole);
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.7, 8, 6), mats.glow);
      lamp.position.set(pole.position.x, 8, pole.position.z);
      g.add(lamp);
    }
  } else if (def.biome === 'desert') {
    for (let s = 0; s < nStations; s += step) {
      const i = s * 6;
      [-1, 1].forEach((side) => {
        const roll = rng();
        if (roll < 0.5) {
          const mesa = new THREE.Mesh(new THREE.CylinderGeometry(1, 1.35, 1, 7), mats.rock);
          const h = 6 + rng() * 22;
          mesa.scale.set(5 + rng() * 9, h, 5 + rng() * 9);
          place(mesa, i, side, roadEdge + 6 + rng() * 40);
          mesa.position.y = h / 2 - 1;
        } else if (roll < 0.8) {
          const r = new THREE.Mesh(rockGeo, mats.rock);
          const sc = 1.6 + rng() * 4;
          r.scale.set(sc, sc * (0.7 + rng() * 0.8), sc);
          place(r, i, side, roadEdge + 2 + rng() * 24);
          r.position.y = sc * 0.4;
        } else {
          const c = new THREE.Mesh(trunkGeo, mats.leaf);
          c.scale.set(1.6, 3 + rng() * 2, 1.6);
          place(c, i, side, roadEdge + 2 + rng() * 10);
          c.position.y = 2;
          const a1 = new THREE.Mesh(trunkGeo, mats.leaf);
          a1.scale.set(1.1, 1.6, 1.1);
          a1.position.set(c.position.x + 1.1, 2.6, c.position.z);
          a1.rotation.z = -0.9;
          g.add(a1);
        }
      });
    }
    // distant mesas
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * TAU;
      const m = new THREE.Mesh(rockGeo, mats.rock);
      const sc = 60 + rng() * 60;
      m.scale.set(sc, sc * 0.7, sc);
      m.position.set(Math.cos(a) * 620, sc * 0.2, Math.sin(a) * 620);
      g.add(m);
    }
  } else if (def.biome === 'coast') {
    const leafMat = mats.leaf2;
    for (let s = 0; s < nStations; s += step) {
      const i = s * 6;
      [-1, 1].forEach((side) => {
        if (rng() > 0.8) return;
        const palm = new THREE.Group();
        const h = 5 + rng() * 3.5;
        const trunk = new THREE.Mesh(trunkGeo, mats.trunk);
        trunk.scale.set(1.5, h, 1.5);
        trunk.position.y = h / 2;
        trunk.rotation.z = (rng() - 0.5) * 0.35;
        palm.add(trunk);
        for (let l = 0; l < 7; l++) {
          const blade = new THREE.Mesh(new THREE.ConeGeometry(0.5, 3.2, 4), leafMat);
          blade.position.y = h;
          blade.rotation.z = Math.PI / 2.4;
          blade.rotation.y = (l / 7) * TAU;
          blade.scale.set(1, 1, 0.35);
          blade.position.x = Math.cos((l / 7) * TAU) * 1.2;
          blade.position.z = Math.sin((l / 7) * TAU) * 1.2;
          palm.add(blade);
        }
        place(palm, i, side, roadEdge + 3 + rng() * 22);
      });
    }
    // cliff blocks on the inland side + ocean on the other
    for (let i = 0; i < track.samples.length; i += 26) {
      const st = track.samples[i];
      const cliff = new THREE.Mesh(boxGeo, mats.rock);
      cliff.scale.set(18 + rng() * 14, 10 + rng() * 16, 18 + rng() * 14);
      cliff.position.set(st.x + st.nx * (roadEdge + 40) * -1, 4, st.z + st.nz * (roadEdge + 40) * -1);
      cliff.rotation.y = rng() * TAU;
      g.add(cliff);
    }
  } else {
    // forest
    for (let s = 0; s < nStations; s += Math.max(1, Math.round(step / 1.6))) {
      const i = s * 6;
      [-1, 1].forEach((side) => {
        if (rng() > 0.9) return;
        const tree = new THREE.Group();
        const h = 4 + rng() * 5;
        const trunk = new THREE.Mesh(trunkGeo, mats.trunk);
        trunk.scale.set(1.6, h * 0.5, 1.6);
        trunk.position.y = h * 0.25;
        tree.add(trunk);
        for (let l = 0; l < 3; l++) {
          const cone = new THREE.Mesh(pineGeo, l === 2 ? mats.leaf2 : mats.leaf);
          const sc = 2.4 - l * 0.55;
          cone.scale.set(sc, sc * 1.15, sc);
          cone.position.y = h * 0.42 + l * 1.35;
          tree.add(cone);
        }
        place(tree, i, side, roadEdge + 1.5 + rng() * 30);
      });
    }
    for (let s = 0; s < track.samples.length; s += 40) {
      const st = track.samples[s];
      const b = new THREE.Mesh(rockGeo, mats.rock);
      const sc = 1.4 + rng() * 2.4;
      b.scale.set(sc, sc * 0.8, sc);
      b.position.set(st.x + st.nx * (roadEdge + 1) * ((s / 40) % 2 ? 1 : -1), sc * 0.35,
        st.z + st.nz * (roadEdge + 1) * ((s / 40) % 2 ? 1 : -1));
      g.add(b);
    }
  }
}

/* ---------------------------------------------------------------
   Track assembly
   --------------------------------------------------------------- */
export function buildTrack(def, quality = 'medium') {
  const raw = sampleClosedSpline(def.points, SAMPLES);
  const n = raw.length;
  const samples = [];
  let total = 0;
  for (let i = 0; i < n; i++) {
    const prev = raw[(i - 1 + n) % n];
    const next = raw[(i + 1) % n];
    let tx = next[0] - prev[0], tz = next[1] - prev[1];
    const len = Math.hypot(tx, tz) || 1;
    tx /= len; tz /= len;
    const nx = tz, nz = -tx; // right-hand side normal
    const segLen = Math.hypot(raw[i][0] - raw[(i + 1) % n][0], raw[i][1] - raw[(i + 1) % n][1]);
    samples.push({ x: raw[i][0], z: raw[i][1], tx, tz, nx, nz, d: total, segLen });
    total += segLen;
  }

  const halfWidth = def.width / 2;
  const runoff = def.biome === 'forest' ? 2.4 : 3.0;
  const group = new THREE.Group();
  group.name = `track-${def.id}`;

  const pal = def.palette;
  const hex = (num, alpha = 1) => {
    const s = num.toString(16).padStart(6, '0');
    return alpha === 1 ? `#${s}` : `rgba(${parseInt(s.slice(0, 2), 16)},${parseInt(s.slice(2, 4), 16)},${parseInt(s.slice(4, 6), 16)},${alpha})`;
  };

  /* ground */
  const groundMat = new THREE.MeshStandardMaterial({ color: pal.ground, roughness: 1 });
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(2600, 2600), groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.06;
  ground.receiveShadow = true;
  group.add(ground);

  /* sea for coast */
  if (def.biome === 'coast') {
    const sea = new THREE.Mesh(
      new THREE.PlaneGeometry(3000, 3000),
      new THREE.MeshStandardMaterial({ color: 0x1f7fd6, roughness: 0.25, metalness: 0.4, transparent: true, opacity: 0.95 })
    );
    sea.rotation.x = -Math.PI / 2;
    sea.position.y = -1.6;
    group.add(sea);
  }

  /* verge (off-road strip) */
  const verge = new THREE.Mesh(
    ribbonGeometry(samples, halfWidth + runoff, -0.01, 8),
    new THREE.MeshStandardMaterial({ color: pal.ground, roughness: 1 })
  );
  verge.receiveShadow = true;
  group.add(verge);

  /* road */
  const tex = roadTexture(def);
  tex.repeat.set(1, 1);
  const road = new THREE.Mesh(
    ribbonGeometry(samples, halfWidth, 0.02, 12),
    new THREE.MeshStandardMaterial({ map: tex, roughness: 0.85, metalness: 0.05 })
  );
  road.receiveShadow = true;
  group.add(road);

  /* barriers */
  const wallDist = halfWidth + runoff;
  const wallMat = new THREE.MeshStandardMaterial({
    color: pal.barrier, roughness: 0.5, metalness: 0.35, side: THREE.DoubleSide,
    emissive: def.biome === 'city' ? pal.barrier : 0x000000,
    emissiveIntensity: def.biome === 'city' ? 0.55 : 0
  });
  const wallL = new THREE.Mesh(wallGeometry(samples, -wallDist, 0, 0.62), wallMat);
  const wallR = new THREE.Mesh(wallGeometry(samples, wallDist, 0, 0.62), wallMat);
  group.add(wallL, wallR);

  /* glowing trim on barrier tops */
  const trimMat = new THREE.MeshBasicMaterial({ color: pal.edge, side: THREE.DoubleSide });
  const trimL = new THREE.Mesh(wallGeometry(samples, -wallDist, 0.62, 0.74), trimMat);
  const trimR = new THREE.Mesh(wallGeometry(samples, wallDist, 0.62, 0.74), trimMat);
  group.add(trimL, trimR);

  /* start / finish line */
  const checker = checkerTexture();
  checker.repeat.set(1, 1);
  const startStrip = new THREE.Mesh(
    ribbonGeometry([samples[0], samples[1], samples[2]], halfWidth, 0.03, 6),
    new THREE.MeshStandardMaterial({ map: checker, roughness: 0.7 })
  );
  group.add(startStrip);

  /* gantry */
  const gantry = new THREE.Group();
  const s0 = samples[0];
  const postMat = new THREE.MeshStandardMaterial({ color: 0x2a3160, roughness: 0.5, metalness: 0.6 });
  [-1, 1].forEach((side) => {
    const post = new THREE.Mesh(new THREE.BoxGeometry(1.1, 8, 1.1), postMat);
    post.position.set(s0.x + s0.nx * (wallDist + 1.6) * side, 4, s0.z + s0.nz * (wallDist + 1.6) * side);
    post.castShadow = true;
    gantry.add(post);
  });
  const bannerTex = bannerTexture('FINISH', pal.accent);
  const banner = new THREE.Mesh(
    new THREE.BoxGeometry(wallDist * 2 + 4, 2.4, 0.5),
    [postMat, postMat, postMat, postMat,
      new THREE.MeshBasicMaterial({ map: bannerTex }),
      new THREE.MeshBasicMaterial({ map: bannerTex })]
  );
  banner.position.set(s0.x, 7.6, s0.z);
  banner.rotation.y = Math.atan2(s0.tx, s0.tz);
  gantry.add(banner);
  group.add(gantry);

  /* checkpoint pylons at sector boundaries */
  const sectorLen = n / SECTOR_COUNT;
  const pylonMat = new THREE.MeshStandardMaterial({
    color: pal.accent, emissive: pal.accent, emissiveIntensity: 1.1, roughness: 0.4
  });
  const pylonGeo = new THREE.BoxGeometry(0.5, 3.4, 0.5);
  const checkpoints = [];
  for (let c = 0; c < SECTOR_COUNT; c++) {
    const i = Math.round(c * sectorLen) % n;
    checkpoints.push(i);
    [-1, 1].forEach((side) => {
      const s = samples[i];
      const p = new THREE.Mesh(pylonGeo, pylonMat);
      p.position.set(s.x + s.nx * (wallDist + 0.9) * side, 1.7, s.z + s.nz * (wallDist + 0.9) * side);
      group.add(p);
    });
  }

  /* scenery */
  addScenery({ group, samples, halfWidth, runoff }, def, quality);

  /* item box spawn points — deliberately spaced a quarter-lap apart so the
     first row sits well clear of the starting grid */
  const itemSpots = [];
  for (let k = 0; k < ITEM_SPOTS; k++) {
    const i = Math.floor((k / ITEM_SPOTS) * n + n * 0.25) % n;
    [-4.2, 0, 4.2].forEach((lat) => {
      const s = samples[i];
      itemSpots.push({ x: s.x + s.nx * lat, z: s.z + s.nz * lat, index: i, lat });
    });
  }

  /* minimap polyline */
  const minimapPath = [];
  for (let i = 0; i < n; i += 4) minimapPath.push([samples[i].x, samples[i].z]);

  const track = {
    def, group, samples, length: total, segLen: total / n, halfWidth, runoff,
    wallDist, checkpoints, itemSpots, minimapPath, count: n,
    laps: def.laps,
    sectorSize: sectorLen,
    dispose() {
      group.traverse((o) => {
        if (o.geometry) o.geometry.dispose();
        if (o.material) {
          const list = Array.isArray(o.material) ? o.material : [o.material];
          list.forEach((m) => { if (m.map) m.map.dispose(); m.dispose(); });
        }
      });
    },
    /** Nearest centerline sample near a hint index (with global fallback). */
    nearest(hint, x, z) {
      const w = 36;
      let best = -1, bestD = Infinity;
      for (let k = -w; k <= w; k++) {
        const i = ((hint + k) % n + n) % n;
        const s = samples[i];
        const dx = x - s.x, dz = z - s.z;
        const d = dx * dx + dz * dz;
        if (d < bestD) { bestD = d; best = i; }
      }
      if (bestD > (track.segLen * 4) ** 2) {
        bestD = Infinity;
        for (let i = 0; i < n; i += 2) {
          const s = samples[i];
          const dx = x - s.x, dz = z - s.z;
          const d = dx * dx + dz * dz;
          if (d < bestD) { bestD = d; best = i; }
        }
      }
      const s = samples[best];
      const rx = x - s.x, rz = z - s.z;
      const lateral = rx * s.nx + rz * s.nz;
      const along = rx * s.tx + rz * s.tz;
      return { index: best, sample: s, lateral, along, side: Math.sign(lateral) || 1 };
    },
    pointAt(i) {
      const s = samples[((i % n) + n) % n];
      return s;
    }
  };
  return track;
}

/* ---------------------------------------------------------------
   2D preview used by the track-select cards
   --------------------------------------------------------------- */
export function drawTrackPreview(canvas, def) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = canvas.clientWidth || 300, h = canvas.clientHeight || 150;
  canvas.width = w * dpr; canvas.height = h * dpr;
  const g = canvas.getContext('2d');
  g.scale(dpr, dpr);
  const p = def.palette;
  const hex = (n) => `#${n.toString(16).padStart(6, '0')}`;

  g.fillStyle = hex(p.ground);
  g.fillRect(0, 0, w, h);
  const shade = g.createLinearGradient(0, 0, 0, h);
  shade.addColorStop(0, 'rgba(255,255,255,.10)');
  shade.addColorStop(1, 'rgba(0,0,0,.35)');
  g.fillStyle = shade;
  g.fillRect(0, 0, w, h);

  const pts = sampleClosedSpline(def.points, 220);
  let minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9;
  pts.forEach(([x, y]) => {
    minX = Math.min(minX, x); maxX = Math.max(maxX, x);
    minY = Math.min(minY, y); maxY = Math.max(maxY, y);
  });
  const pad = 18;
  const sc = Math.min((w - pad * 2) / (maxX - minX), (h - pad * 2) / (maxY - minY));
  const ox = (w - (maxX - minX) * sc) / 2, oy = (h - (maxY - minY) * sc) / 2;
  const map = ([x, y]) => [ox + (x - minX) * sc, oy + (y - minY) * sc];

  const path = new Path2D();
  pts.forEach(([x, y], i) => {
    const [px, py] = map([x, y]);
    if (i === 0) path.moveTo(px, py); else path.lineTo(px, py);
  });
  path.closePath();

  g.lineJoin = 'round';
  g.strokeStyle = 'rgba(0,0,0,.5)';
  g.lineWidth = Math.max(9, def.width * sc * 1.5 + 6);
  g.stroke(path);
  g.strokeStyle = hex(p.road);
  g.lineWidth = Math.max(7, def.width * sc);
  g.stroke(path);
  g.strokeStyle = hex(p.edge);
  g.lineWidth = 1.5;
  g.setLineDash([6, 7]);
  g.stroke(path);
  g.setLineDash([]);

  // start line marker
  const [sx, sy] = map([pts[0][0], pts[0][1]]);
  g.fillStyle = '#fff';
  g.beginPath(); g.arc(sx, sy, 5, 0, TAU); g.fill();
  g.strokeStyle = hex(p.accent);
  g.lineWidth = 2;
  g.stroke();

  // label
  g.fillStyle = 'rgba(0,0,0,.45)';
  g.fillRect(0, h - 24, w, 24);
  g.fillStyle = '#eaf0ff';
  g.font = '700 13px Rajdhani, Arial, sans-serif';
  g.textBaseline = 'middle';
  g.fillText(`${(trackLengthMeters(def) / 1000).toFixed(2)} km · ${def.laps} laps · width ${def.width}m`, 10, h - 12);
}

export function trackLengthMeters(def) {
  const pts = sampleClosedSpline(def.points, 120);
  let d = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    d += Math.hypot(b[0] - a[0], b[1] - a[1]);
  }
  return d;
}
