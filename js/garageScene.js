import * as THREE from 'three';
import { createEnvironmentMap } from './scenery.js';

function platformTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 1024;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#0c0812';
  ctx.fillRect(0, 0, 1024, 1024);

  const glow = ctx.createRadialGradient(512, 512, 40, 512, 512, 512);
  glow.addColorStop(0, 'rgba(255,122,69,0.16)');
  glow.addColorStop(0.45, 'rgba(90,40,70,0.12)');
  glow.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, 1024, 1024);

  ctx.strokeStyle = 'rgba(255,196,107,0.28)';
  ctx.lineWidth = 2;
  for (const r of [150, 300, 420, 480]) {
    ctx.beginPath();
    ctx.arc(512, 512, r, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.strokeStyle = 'rgba(255,246,236,0.1)';
  ctx.lineWidth = 1;
  for (let i = 0; i < 96; i++) {
    const a = (i / 96) * Math.PI * 2;
    const inner = i % 4 === 0 ? 450 : 470;
    ctx.beginPath();
    ctx.moveTo(512 + Math.cos(a) * inner, 512 + Math.sin(a) * inner);
    ctx.lineTo(512 + Math.cos(a) * 486, 512 + Math.sin(a) * 486);
    ctx.stroke();
  }
  ctx.fillStyle = 'rgba(255,122,69,0.5)';
  ctx.font = '600 22px "Chakra Petch", Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('S U N S E T   D R I V E', 512, 780);
  ctx.fillStyle = 'rgba(255,246,236,0.22)';
  ctx.font = '500 16px "Chakra Petch", Arial, sans-serif';
  ctx.fillText('PREMIUM MOTORWORKS  ·  EST. 2026', 512, 808);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

function moteTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  const g = ctx.createRadialGradient(32, 32, 1, 32, 32, 30);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.3, 'rgba(255,214,170,0.7)');
  g.addColorStop(1, 'rgba(255,160,100,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(canvas);
}

export class GarageScene {
  constructor(container) {
    this.container = container;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.setClearColor(0x000000, 0);
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.environment = createEnvironmentMap(this.renderer);
    if ('environmentIntensity' in this.scene) this.scene.environmentIntensity = 0.85;

    this.camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
    this.turntable = new THREE.Group();
    this.scene.add(this.turntable);
    this.model = null;
    this.rotation = -0.52;
    this.velocity = 0;
    this.dragging = false;
    this.lastPointer = 0;
    this.lastX = 0;
    this.elapsed = 0;
    this.distance = 8.6;

    this.buildStage();
    this.buildLights();
    this.buildMotes();
    this.bindDrag();
    this.resize();
  }

  buildStage() {
    const top = new THREE.MeshStandardMaterial({
      map: platformTexture(), color: 0xffffff, metalness: 0.55, roughness: 0.32, envMapIntensity: 1.1,
    });
    const side = new THREE.MeshStandardMaterial({ color: 0x0c0912, metalness: 0.7, roughness: 0.35 });
    const bottom = new THREE.MeshStandardMaterial({ color: 0x060409, metalness: 0.4, roughness: 0.6 });
    const platform = new THREE.Mesh(new THREE.CylinderGeometry(5.3, 5.15, 0.3, 72), [side, top, bottom]);
    platform.position.y = -0.15;
    platform.receiveShadow = true;
    this.scene.add(platform);

    this.ringMat = new THREE.MeshBasicMaterial({ color: 0xff7a45, transparent: true, opacity: 0.85 });
    const ring = new THREE.Mesh(new THREE.TorusGeometry(5.24, 0.022, 8, 120), this.ringMat);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.006;
    this.scene.add(ring);

    this.ring2Mat = new THREE.MeshBasicMaterial({ color: 0xff3d7f, transparent: true, opacity: 0.4 });
    const ring2 = new THREE.Mesh(new THREE.TorusGeometry(4.9, 0.008, 6, 120), this.ring2Mat);
    ring2.rotation.x = Math.PI / 2;
    ring2.position.y = 0.008;
    this.scene.add(ring2);

    const glowGeo = new THREE.PlaneGeometry(17, 17);
    const glowCanvas = document.createElement('canvas');
    glowCanvas.width = 256;
    glowCanvas.height = 256;
    const gctx = glowCanvas.getContext('2d');
    const grade = gctx.createRadialGradient(128, 128, 8, 128, 128, 126);
    grade.addColorStop(0, 'rgba(255,122,69,0.24)');
    grade.addColorStop(0.4, 'rgba(255,61,127,0.08)');
    grade.addColorStop(1, 'rgba(0,0,0,0)');
    gctx.fillStyle = grade;
    gctx.fillRect(0, 0, 256, 256);
    const glowTex = new THREE.CanvasTexture(glowCanvas);
    const glowMat = new THREE.MeshBasicMaterial({
      map: glowTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
    });
    const glow = new THREE.Mesh(glowGeo, glowMat);
    glow.rotation.x = -Math.PI / 2;
    glow.position.y = 0.012;
    this.scene.add(glow);
  }

  buildLights() {
    this.scene.add(new THREE.HemisphereLight(0xffcfae, 0x1a0f22, 0.5));

    const key = new THREE.DirectionalLight(0xffc39a, 2.4);
    key.position.set(5.5, 9, 4.5);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.camera.left = -6.5;
    key.shadow.camera.right = 6.5;
    key.shadow.camera.top = 6.5;
    key.shadow.camera.bottom = -6.5;
    key.shadow.camera.near = 1;
    key.shadow.camera.far = 30;
    key.shadow.bias = -0.0006;
    key.shadow.normalBias = 0.02;
    this.scene.add(key);
    this.scene.add(key.target);

    const rimPink = new THREE.PointLight(0xff3d7f, 38, 16, 2);
    rimPink.position.set(-4.6, 2.4, -3.4);
    this.scene.add(rimPink);

    const rimCyan = new THREE.PointLight(0x5ce1e6, 30, 16, 2);
    rimCyan.position.set(4.8, 1.8, -4.2);
    this.scene.add(rimCyan);

    const frontFill = new THREE.PointLight(0xffd8b0, 18, 18, 2);
    frontFill.position.set(2.2, 3.2, 5.2);
    this.scene.add(frontFill);

    this.keyLight = key;
  }

  buildMotes() {
    const count = 70;
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = 1.6 + Math.random() * 4.2;
      positions[i * 3] = Math.cos(a) * r;
      positions[i * 3 + 1] = 0.2 + Math.random() * 3.6;
      positions[i * 3 + 2] = Math.sin(a) * r;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.PointsMaterial({
      map: moteTexture(), color: 0xffc9a0, size: 0.055, transparent: true,
      opacity: 0.7, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true,
    });
    this.motes = new THREE.Points(geo, mat);
    this.scene.add(this.motes);
  }

  bindDrag() {
    const el = this.renderer.domElement;
    el.addEventListener('pointerdown', (e) => {
      this.dragging = true;
      this.lastX = e.clientX;
      this.velocity = 0;
      el.setPointerCapture(e.pointerId);
    });
    el.addEventListener('pointermove', (e) => {
      if (!this.dragging) return;
      const dx = e.clientX - this.lastX;
      this.lastX = e.clientX;
      const delta = dx * 0.009;
      this.rotation += delta;
      this.velocity = delta * 26;
    });
    const up = (e) => {
      if (!this.dragging) return;
      this.dragging = false;
      try { el.releasePointerCapture(e.pointerId); } catch { /* noop */ }
    };
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    el.addEventListener('pointerleave', (e) => {
      if (e.pointerType !== 'mouse') return;
      this.dragging = false;
    });
  }

  setCar(model) {
    if (this.model && this.model.root.parent === this.turntable) {
      this.turntable.remove(this.model.root);
    }
    this.model = model;
    this.turntable.add(model.root);
    this.rotation = -0.52;
    this.velocity = 0;
  }

  resize() {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h, false);
    const aspect = w / h;
    this.camera.aspect = aspect;
    const zoom = Math.max(1, 1.32 / aspect);
    this.distance = 8.5 * zoom;
    this.camera.position.set(this.distance * 0.54, this.distance * 0.27 + 0.35, this.distance * 0.79);
    this.camera.lookAt(0, 0.72, 0);
    this.camera.updateProjectionMatrix();
  }

  update(dt) {
    this.elapsed += dt;
    const idle = this.dragging ? 0 : 1;
    this.velocity *= Math.exp(-2.4 * dt);
    this.rotation += this.velocity * dt;
    if (!this.dragging) this.rotation += 0.1 * dt * idle;
    this.turntable.rotation.y = this.rotation;

    this.ringMat.opacity = 0.7 + Math.sin(this.elapsed * 2.2) * 0.2;
    this.ring2Mat.opacity = 0.28 + Math.sin(this.elapsed * 1.7 + 1.5) * 0.12;
    this.motes.rotation.y += dt * 0.03;
    this.motes.position.y = Math.sin(this.elapsed * 0.6) * 0.08;

    this.renderer.render(this.scene, this.camera);
  }

  setActive(active) {
    this.container.style.display = active ? 'block' : 'none';
    if (active) this.resize();
  }
}
