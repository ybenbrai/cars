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
    this.buildWorkshop();
    // Tuning camera: null = turntable, otherwise a part id (see focusPart).
    this.focus = null;
    this.camPos = new THREE.Vector3();
    this.camLook = new THREE.Vector3(0, 0.72, 0);
    this.homePos = new THREE.Vector3();
    this.homeLook = new THREE.Vector3(0, 0.72, 0);
    this.lift = 0;
    this.hood = 0;
    this.tuning = {};
    this.spinWheels = 0;
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

  /** Workshop props for the tuning views: a two-post lift and sparks. */
  buildWorkshop() {
    const yellow = new THREE.MeshStandardMaterial({ color: 0xffc400, metalness: 0.4, roughness: 0.45 });
    const steel = new THREE.MeshStandardMaterial({ color: 0x3a3f48, metalness: 0.8, roughness: 0.35 });
    this.liftRig = new THREE.Group();
    this.liftRig.visible = false;
    this.liftArms = new THREE.Group();
    for (const sx of [-1, 1]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.22, 2.4, 0.22), yellow);
      post.position.set(sx * 1.55, 1.2, -0.25);
      post.castShadow = true;
      this.liftRig.add(post);
      for (const sz of [-1, 1]) {
        const arm = new THREE.Mesh(new THREE.BoxGeometry(1.25, 0.06, 0.12), steel);
        arm.position.set(sx * 0.95, 0, sz * 0.75);
        arm.rotation.y = sx * sz * 0.35;
        this.liftArms.add(arm);
      }
    }
    this.liftRig.add(this.liftArms);
    this.scene.add(this.liftRig);

    // Spark burst played when a part is installed.
    const count = 90;
    this.sparkVel = new Float32Array(count * 3);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
    this.sparks = new THREE.Points(geo, new THREE.PointsMaterial({
      color: 0xffc46b, size: 0.06, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending,
    }));
    this.sparks.frustumCulled = false;
    this.scene.add(this.sparks);
    this.sparkT = 2;
    this.flash = new THREE.PointLight(0xffd29a, 0, 6, 2);
    this.scene.add(this.flash);
    this.nitroGlow = new THREE.PointLight(0x31e0ff, 0, 5, 2);
    this.scene.add(this.nitroGlow);
  }

  /**
   * Where the camera goes for each part, in the car's own coordinates
   * (+z is the nose, +x the driver's left).
   */
  focusShot(part) {
    const b = this.model.bodyDef;
    const L = b.length;
    const W = b.width;
    const top = this.model.bodyTop;
    const r = b.wheelRadius;
    switch (part) {
      case 'engine':
      case 'turbo':
        return { pos: [W * 0.95, top + 1.35, L / 2 + 1.4], look: [0, top, L * 0.22] };
      case 'intake':
        return { pos: [W * 0.85, 0.75, -L / 2 - 1.9], look: [0, 0.4, -L / 2] };
      case 'nitro':
        return { pos: [-W * 1.3, 1.5, -L / 2 - 2.4], look: [0, 0.6, -L / 2 + 0.4] };
      case 'tyres':
      case 'brakes':
        return { pos: [W / 2 + 1.35, r + 0.25, b.wheelbase + 0.9], look: [W / 2 - 0.05, r, b.wheelbase] };
      case 'suspension':
        return { pos: [W / 2 + 2.4, 1.1, L / 2 + 2.6], look: [0, 0.75, 0] };
      case 'gearbox':
        return { pos: [W / 2 + 2.6, 0.45, -0.4], look: [0, 0.45, 0] };
      default:
        return { pos: [W / 2 + 3.4, 1.4, 1.4], look: [0, 0.7, 0] };
    }
  }

  /** Point the tuning camera at a part (null returns to the turntable). */
  focusPart(part, tuning = {}) {
    if (!this.model) return;
    this.tuning = tuning || {};
    if (part === this.focus) return;
    this.focus = part;
    if (part) this.velocity = 0;
  }

  /** Sparks and a flash at a part right after buying it. */
  installFx(part) {
    if (!this.model) return;
    const shot = this.focusShot(part || this.focus || 'weight');
    const at = this.model.root.localToWorld(new THREE.Vector3(...shot.look));
    const pos = this.sparks.geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      pos.setXYZ(i, at.x, at.y, at.z);
      const a = Math.random() * Math.PI * 2;
      const out = 1 + Math.random() * 2.5;
      this.sparkVel.set([Math.cos(a) * out, 1.5 + Math.random() * 3, Math.sin(a) * out], i * 3);
    }
    pos.needsUpdate = true;
    this.sparkT = 0;
    this.flash.position.copy(at);
    this.flash.position.y += 0.4;
    this.flash.intensity = 30;
  }

  updateWorkshop(dt) {
    const m = this.model;
    if (!m) return;
    const f = this.focus;
    const ease = 1 - Math.exp(-5 * dt);
    // Bonnet opens for engine work; the car rises on the lift for suspension.
    this.hood += ((f === 'engine' || f === 'turbo' ? 1 : 0) - this.hood) * ease;
    this.lift += ((f === 'suspension' ? 1 : 0) - this.lift) * ease;
    m.setHoodOpen(this.hood > 0.01 ? this.hood : 0, this.tuning);
    m.root.position.y = this.lift * 0.55;
    this.liftRig.visible = this.lift > 0.01;
    this.liftRig.rotation.y = this.turntable.rotation.y;
    this.liftArms.position.y = this.lift * 0.55 + 0.02;
    // Tyres spin on the wheel view; nitro glows blue at the back.
    if (f === 'tyres' || f === 'brakes') {
      this.spinWheels += dt * 7;
      m.setSpin(this.spinWheels);
    }
    const glow = f === 'nitro' ? 14 + Math.sin(this.elapsed * 6) * 6 : 0;
    this.nitroGlow.intensity += (glow - this.nitroGlow.intensity) * ease;
    if (glow) this.nitroGlow.position.copy(m.root.localToWorld(new THREE.Vector3(0, 0.45, -m.bodyDef.length / 2 - 0.4)));

    // Camera: the part's shot, or home.
    let pos = this.homePos;
    let look = this.homeLook;
    if (f) {
      const shot = this.focusShot(f);
      pos = m.root.localToWorld(new THREE.Vector3(...shot.pos));
      look = m.root.localToWorld(new THREE.Vector3(...shot.look));
    }
    const k = 1 - Math.exp(-3.2 * dt);
    this.camPos.lerp(pos, k);
    this.camLook.lerp(look, k);
    this.camera.position.copy(this.camPos);
    this.camera.lookAt(this.camLook);

    // Sparks fall and fade; the flash dies away.
    if (this.sparkT < 1.2) {
      this.sparkT += dt;
      const p = this.sparks.geometry.attributes.position;
      for (let i = 0; i < p.count; i++) {
        this.sparkVel[i * 3 + 1] -= 9.8 * dt;
        p.setXYZ(i, p.getX(i) + this.sparkVel[i * 3] * dt, p.getY(i) + this.sparkVel[i * 3 + 1] * dt, p.getZ(i) + this.sparkVel[i * 3 + 2] * dt);
      }
      p.needsUpdate = true;
      this.sparks.material.opacity = Math.max(0, 1 - this.sparkT / 1.2);
    }
    this.flash.intensity *= Math.exp(-6 * dt);
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
    this.hood = 0;
    this.lift = 0;
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
    this.homePos.set(this.distance * 0.54, this.distance * 0.27 + 0.35, this.distance * 0.79);
    if (!this.focus) {
      this.camPos.copy(this.homePos);
      this.camLook.copy(this.homeLook);
      this.camera.position.copy(this.homePos);
      this.camera.lookAt(this.homeLook);
    }
    this.camera.updateProjectionMatrix();
  }

  update(dt) {
    this.elapsed += dt;
    const idle = this.dragging ? 0 : 1;
    this.velocity *= Math.exp(-2.4 * dt);
    this.rotation += this.velocity * dt;
    // The turntable holds still while a part is in focus.
    if (!this.dragging && !this.focus) this.rotation += 0.1 * dt * idle;
    this.turntable.rotation.y = this.rotation;
    this.turntable.updateMatrixWorld(true);
    this.updateWorkshop(dt);

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
