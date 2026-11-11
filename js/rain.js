// Rain: a box of falling streaks that follows the camera. One LineSegments
// draw call; positions wrap inside the box so the shower never runs out.

import * as THREE from 'three';

const COUNT = 1600;
const SIZE = 60; // box width/depth around the camera (m)
const HEIGHT = 30;
const SPEED = 24; // m/s fall speed
const STREAK = 0.9; // streak length (m)

export class Rain {
  constructor(scene) {
    this.positions = new Float32Array(COUNT * 6);
    this.drops = new Float32Array(COUNT * 3);
    for (let i = 0; i < COUNT; i++) {
      this.drops[i * 3] = (Math.random() - 0.5) * SIZE;
      this.drops[i * 3 + 1] = Math.random() * HEIGHT;
      this.drops[i * 3 + 2] = (Math.random() - 0.5) * SIZE;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    this.material = new THREE.LineBasicMaterial({ color: 0xb8c8e0, transparent: true, opacity: 0.35, depthWrite: false });
    this.lines = new THREE.LineSegments(geo, this.material);
    this.lines.frustumCulled = false;
    scene.add(this.lines);
  }

  update(dt, camera) {
    const p = this.positions;
    const d = this.drops;
    const cx = camera.position.x;
    const cy = camera.position.y;
    const cz = camera.position.z;
    const half = SIZE / 2;
    for (let i = 0; i < COUNT; i++) {
      let y = d[i * 3 + 1] - SPEED * dt;
      if (y < 0) y += HEIGHT;
      d[i * 3 + 1] = y;
      // Wrap x/z around the camera so the box travels with it.
      const x = ((((d[i * 3] - cx + half) % SIZE) + SIZE) % SIZE) - half + cx;
      const z = ((((d[i * 3 + 2] - cz + half) % SIZE) + SIZE) % SIZE) - half + cz;
      const wy = cy - HEIGHT * 0.35 + y;
      const j = i * 6;
      p[j] = x;
      p[j + 1] = wy;
      p[j + 2] = z;
      p[j + 3] = x + 0.04;
      p[j + 4] = wy + STREAK;
      p[j + 5] = z;
    }
    this.lines.geometry.attributes.position.needsUpdate = true;
  }

  dispose() {
    this.lines.removeFromParent();
    this.lines.geometry.dispose();
    this.material.dispose();
  }
}
