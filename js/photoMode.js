// Photo mode: freeze the race, orbit a camera around the player's car (drag
// to orbit, wheel or pinch to zoom) and save a watermarked PNG to share.

import * as THREE from 'three';

const MIN_DIST = 2.6;
const MAX_DIST = 14;

export class PhotoMode {
  constructor(camera, canvas) {
    this.camera = camera;
    this.canvas = canvas;
    this.active = false;
    this.target = new THREE.Vector3();
    this.yaw = 0;
    this.pitch = 0.28;
    this.dist = 6;
    this.pointers = new Map();
    this.pinchStart = 0;
    this.distStart = this.dist;
    this.wantShot = false;

    canvas.addEventListener('pointerdown', (e) => this.onDown(e));
    canvas.addEventListener('pointermove', (e) => this.onMove(e));
    const up = (e) => this.pointers.delete(e.pointerId);
    canvas.addEventListener('pointerup', up);
    canvas.addEventListener('pointercancel', up);
    canvas.addEventListener('wheel', (e) => {
      if (!this.active) return;
      e.preventDefault();
      this.dist = THREE.MathUtils.clamp(this.dist * (1 + Math.sign(e.deltaY) * 0.08), MIN_DIST, MAX_DIST);
    }, { passive: false });
  }

  /** Start orbiting the given car from behind and slightly above. */
  enter(car) {
    this.active = true;
    this.car = car;
    this.yaw = car.heading + Math.PI;
    this.pitch = 0.28;
    this.dist = Math.max(5, car.def.body.length * 1.35);
    this.pointers.clear();
  }

  exit() {
    this.active = false;
    this.pointers.clear();
  }

  onDown(e) {
    if (!this.active) return;
    this.canvas.setPointerCapture?.(e.pointerId);
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (this.pointers.size === 2) {
      const [a, b] = [...this.pointers.values()];
      this.pinchStart = Math.hypot(a.x - b.x, a.y - b.y);
      this.distStart = this.dist;
    }
  }

  onMove(e) {
    if (!this.active || !this.pointers.has(e.pointerId)) return;
    const prev = this.pointers.get(e.pointerId);
    const dx = e.clientX - prev.x;
    const dy = e.clientY - prev.y;
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (this.pointers.size >= 2) {
      const [a, b] = [...this.pointers.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (this.pinchStart > 0) {
        this.dist = THREE.MathUtils.clamp(this.distStart * (this.pinchStart / d), MIN_DIST, MAX_DIST);
      }
      return;
    }
    this.yaw -= dx * 0.008;
    this.pitch = THREE.MathUtils.clamp(this.pitch + dy * 0.006, 0.03, 1.25);
  }

  update() {
    if (!this.active || !this.car) return;
    this.target.copy(this.car.renderPos).setY(0.7);
    const c = this.camera;
    c.position.set(
      this.target.x + Math.sin(this.yaw) * Math.cos(this.pitch) * this.dist,
      this.target.y + Math.sin(this.pitch) * this.dist,
      this.target.z + Math.cos(this.yaw) * Math.cos(this.pitch) * this.dist,
    );
    c.lookAt(this.target);
    c.fov = 50;
    c.updateProjectionMatrix();
  }

  requestShot() {
    this.wantShot = true;
  }

  /**
   * Call right after rendering: copies the frame into a 2D canvas, adds the
   * watermark and downloads it. Returns true when a photo was saved.
   */
  captureIfRequested(glCanvas, label = 'SUNSET DRIFT') {
    if (!this.wantShot) return false;
    this.wantShot = false;
    const out = document.createElement('canvas');
    out.width = glCanvas.width;
    out.height = glCanvas.height;
    const ctx = out.getContext('2d');
    ctx.drawImage(glCanvas, 0, 0);
    const size = Math.max(16, Math.round(out.height * 0.035));
    ctx.font = `italic 700 ${size}px "Chakra Petch", system-ui, sans-serif`;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'bottom';
    ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
    ctx.fillText(label, out.width - size * 0.9 + 2, out.height - size * 0.7 + 2);
    ctx.fillStyle = 'rgba(255, 246, 236, 0.9)';
    ctx.fillText(label, out.width - size * 0.9, out.height - size * 0.7);
    out.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
      a.href = url;
      a.download = `sunset-drift-${stamp}.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
    }, 'image/png');
    return true;
  }
}
