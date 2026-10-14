/**
 * preview.js — shared 3D preview stage used by character select and the garage.
 */
import * as THREE from 'three';
import { buildCharacter, animateStanding, poseStanding } from './characters.js';
import { buildVehicle, updateVehicleVisual, disposeObject } from './vehicles.js';

export class Preview {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {'character'|'garage'} kind
   * @param {'low'|'medium'|'high'} quality
   */
  constructor(canvas, kind, quality = 'medium') {
    this.canvas = canvas;
    this.kind = kind;
    this.quality = quality;
    this.active = false;
    this.time = 0;
    this.spin = 0;
    this.dragging = false;
    this.dragX = 0;
    this.ownSpin = 0;
    this.model = null;

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: quality !== 'low', alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, quality === 'high' ? 2 : 1.5));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(40, 1, 0.1, 120);

    const key = new THREE.DirectionalLight(0xffffff, 2.4);
    key.position.set(4, 7, 6);
    const fill = new THREE.DirectionalLight(0x7b9bff, 1.1);
    fill.position.set(-6, 3, -4);
    const rim = new THREE.DirectionalLight(0xff3d7f, 1.4);
    rim.position.set(0, 4, -8);
    const hemi = new THREE.HemisphereLight(0xbfe6ff, 0x120a24, 1.1);
    this.scene.add(key, fill, rim, hemi);

    // stage platform
    const platform = new THREE.Mesh(
      new THREE.CylinderGeometry(2.7, 2.9, 0.3, 48),
      new THREE.MeshStandardMaterial({ color: 0x111736, roughness: 0.5, metalness: 0.5 })
    );
    platform.position.y = -0.15;
    this.scene.add(platform);

    const glowRing = new THREE.Mesh(
      new THREE.TorusGeometry(2.75, 0.06, 10, 60),
      new THREE.MeshBasicMaterial({ color: 0x00e5ff })
    );
    glowRing.rotation.x = Math.PI / 2;
    glowRing.position.y = 0.02;
    this.scene.add(glowRing);
    this.glowRing = glowRing;

    const halo = new THREE.Mesh(
      new THREE.RingGeometry(2.9, 5.4, 48),
      new THREE.MeshBasicMaterial({ color: 0x7b5cff, transparent: true, opacity: 0.16, side: THREE.DoubleSide })
    );
    halo.rotation.x = -Math.PI / 2;
    halo.position.y = -0.02;
    this.scene.add(halo);

    this.pivot = new THREE.Group();
    this.scene.add(this.pivot);

    this._onResize = () => this.resize();
    this._bindDrag();
    window.addEventListener('resize', this._onResize);
    this.resize();
  }

  _bindDrag() {
    const el = this.canvas;
    const down = (e) => { this.dragging = true; this.dragX = e.clientX ?? (e.touches && e.touches[0].clientX); };
    const move = (e) => {
      if (!this.dragging) return;
      const x = e.clientX ?? (e.touches && e.touches[0].clientX);
      this.spin += (x - this.dragX) * 0.01;
      this.dragX = x;
      if (e.cancelable) e.preventDefault();
    };
    const up = () => { this.dragging = false; };
    el.addEventListener('pointerdown', down);
    window.addEventListener('pointermove', move, { passive: false });
    window.addEventListener('pointerup', up);
    this._unbind = () => {
      el.removeEventListener('pointerdown', down);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
  }

  _clearModel() {
    if (this.model) {
      this.pivot.remove(this.model);
      disposeObject(this.model);
      this.model = null;
    }
  }

  setCharacter(index, def) {
    this._clearModel();
    const g = buildCharacter(def, {});
    g.scale.multiplyScalar(1.55);
    g.position.y = 0;
    poseStanding(g);
    this.model = g;
    this.pivot.add(g);
    this.camera.position.set(0, 1.85, 6.2);
    this.camera.lookAt(0, 1.5, 0);
    this.glowRing.material.color.setHex(def.look.suit);
  }

  setVehicle(index, def, paint) {
    this._clearModel();
    const g = buildVehicle(def, paint);
    g.scale.multiplyScalar(1.35);
    g.position.y = 0.05;
    this.model = g;
    this.pivot.add(g);
    this.camera.position.set(0, 2.4, 7.4);
    this.camera.lookAt(0, 0.85, 0);
    this.glowRing.material.color.setHex(paint);
  }

  updatePaint(paint) {
    if (this.model && this.model.userData.setPaint) {
      this.model.userData.setPaint(paint);
      this.glowRing.material.color.setHex(paint);
    }
  }

  start() { this.active = true; }
  stop() { this.active = false; }

  update(dt) {
    if (!this.active) return;
    this.time += dt;
    const auto = this.dragging ? 0 : dt * 0.55;
    this.spin += auto + (this.ownSpin * (this.dragging ? 1 : 0.06));
    this.ownSpin *= this.dragging ? 1 : 0.9;
    this.pivot.rotation.y = this.spin;

    if (this.model) {
      if (this.model.userData.isCharacter) {
        animateStanding(this.model, this.time);
      } else if (this.model.userData.isVehicle) {
        updateVehicleVisual(this.model, dt, {
          speed: 0, steer: Math.sin(this.time * 0.8) * 0.35, brake: false,
          boosting: false, lean: Math.sin(this.time * 0.6) * 0.25, pitch: 0
        });
        this.model.position.y = 0.05 + Math.sin(this.time * 1.4) * 0.03;
      }
    }
    this.glowRing.material.opacity = 1;
    this.renderer.render(this.scene, this.camera);
  }

  resize() {
    const w = this.canvas.clientWidth || 400;
    const h = this.canvas.clientHeight || 300;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / Math.max(1, h);
    this.camera.updateProjectionMatrix();
  }

  dispose() {
    this.stop();
    window.removeEventListener('resize', this._onResize);
    if (this._unbind) this._unbind();
    this._clearModel();
    this.scene.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) {
        const list = Array.isArray(o.material) ? o.material : [o.material];
        list.forEach((m) => m.dispose());
      }
    });
    this.renderer.dispose();
  }
}
