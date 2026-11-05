import * as THREE from 'three';

const MAX_PARTICLES = 340;
const MAX_SKIDS = 520;
const clamp = (v, a, b) => Math.min(Math.max(v, a), b);

export class Effects {
  constructor(scene) {
    this.scene = scene;
    this.car = null;
    this.emitAcc = 0;
    this.skidAcc = 0;
    this.skidIndex = 0;
    this.skidDummy = new THREE.Object3D();
    this.buildParticles();
    this.buildSkids();
  }

  buildParticles() {
    const geo = new THREE.BufferGeometry();
    this.positions = new Float32Array(MAX_PARTICLES * 3);
    this.sizes = new Float32Array(MAX_PARTICLES);
    this.alphas = new Float32Array(MAX_PARTICLES);
    this.colors = new Float32Array(MAX_PARTICLES * 3);
    for (let i = 0; i < MAX_PARTICLES; i++) {
      this.positions[i * 3 + 1] = -100;
    }
    geo.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    geo.setAttribute('aSize', new THREE.BufferAttribute(this.sizes, 1));
    geo.setAttribute('aAlpha', new THREE.BufferAttribute(this.alphas, 1));
    geo.setAttribute('aColor', new THREE.BufferAttribute(this.colors, 3));

    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: {
        uPixelRatio: { value: Math.min(window.devicePixelRatio || 1, 2) },
      },
      vertexShader: /* glsl */ `
        attribute float aSize;
        attribute float aAlpha;
        attribute vec3 aColor;
        varying float vAlpha;
        varying vec3 vColor;
        uniform float uPixelRatio;
        void main() {
          vAlpha = aAlpha;
          vColor = aColor;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = aSize * uPixelRatio * (300.0 / max(1.0, -mv.z));
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: /* glsl */ `
        varying float vAlpha;
        varying vec3 vColor;
        void main() {
          vec2 c = gl_PointCoord - 0.5;
          float d = length(c);
          float a = smoothstep(0.5, 0.08, d) * vAlpha;
          if (a < 0.01) discard;
          gl_FragColor = vec4(vColor, a);
        }
      `,
    });

    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    this.scene.add(this.points);
    this.particles = Array.from({ length: MAX_PARTICLES }, () => ({
      life: 0, maxLife: 1, vx: 0, vy: 0, vz: 0, size: 0.5, grow: 1, alpha: 0.3, color: null,
    }));
    this.particleIndex = 0;
  }

  buildSkids() {
    const geo = new THREE.PlaneGeometry(0.32, 0.72);
    geo.rotateX(-Math.PI / 2);
    const mat = new THREE.MeshBasicMaterial({
      color: 0x0a0a0c,
      transparent: true,
      opacity: 0.36,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });
    this.skids = new THREE.InstancedMesh(geo, mat, MAX_SKIDS);
    this.skids.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    const zero = new THREE.Matrix4().makeScale(0, 0, 0);
    for (let i = 0; i < MAX_SKIDS; i++) this.skids.setMatrixAt(i, zero);
    this.skids.instanceMatrix.needsUpdate = true;
    this.skids.frustumCulled = false;
    this.scene.add(this.skids);
  }

  setCar(car) {
    if (this.flames) {
      this.flames.removeFromParent();
      this.flames = null;
    }
    this.car = car;
    if (!car) return;

    const L = car.def.body.length;
    const flames = new THREE.Group();
    flames.position.set(0, 0.47, -L / 2 - 0.04);
    const outerMat = new THREE.MeshBasicMaterial({
      color: 0xff7a2f, transparent: true, opacity: 0.85,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    const innerMat = new THREE.MeshBasicMaterial({
      color: 0x9ff5ff, transparent: true, opacity: 0.9,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    const outerGeo = new THREE.ConeGeometry(0.17, 1.15, 10, 1, true);
    outerGeo.rotateX(-Math.PI / 2);
    outerGeo.translate(0, 0, -0.575);
    const innerGeo = new THREE.ConeGeometry(0.08, 0.7, 8, 1, true);
    innerGeo.rotateX(-Math.PI / 2);
    innerGeo.translate(0, 0, -0.35);
    for (const sx of [-1, 1]) {
      const outer = new THREE.Mesh(outerGeo, outerMat.clone());
      outer.position.x = sx * 0.48;
      outer.scale.set(1, 1, 1.1);
      flames.add(outer);
      const inner = new THREE.Mesh(innerGeo, innerMat.clone());
      inner.position.x = sx * 0.48;
      flames.add(inner);
    }
    flames.visible = false;
    car.group.add(flames);
    this.flames = flames;
  }

  spawnParticle(x, y, z, vx, vy, vz, size, grow, life, color, alpha) {
    const i = this.particleIndex;
    this.particleIndex = (this.particleIndex + 1) % MAX_PARTICLES;
    const p = this.particles[i];
    p.life = life;
    p.maxLife = life;
    p.vx = vx;
    p.vy = vy;
    p.vz = vz;
    p.size = size;
    p.grow = grow;
    p.alpha = alpha;
    p.color = color;
    p.index = i;
    this.positions[i * 3] = x;
    this.positions[i * 3 + 1] = y;
    this.positions[i * 3 + 2] = z;
    this.colors[i * 3] = color.r;
    this.colors[i * 3 + 1] = color.g;
    this.colors[i * 3 + 2] = color.b;
    return i;
  }

  addSkid(x, z, heading) {
    this.skidDummy.position.set(x, 0.028, z);
    this.skidDummy.rotation.set(0, heading, 0);
    this.skidDummy.scale.set(1, 1, 1);
    this.skidDummy.updateMatrix();
    this.skids.setMatrixAt(this.skidIndex, this.skidDummy.matrix);
    this.skidIndex = (this.skidIndex + 1) % MAX_SKIDS;
    this.skids.instanceMatrix.needsUpdate = true;
  }

  update(dt) {
    const car = this.car;
    if (car) {
      const f = car.forward;
      const r = car.right;
      const rear = { x: car.pos.x - f.x * (car.def.body.wheelbase - 0.05), z: car.pos.z - f.z * (car.def.body.wheelbase - 0.05) };
      const bx = r.x * (car.def.body.width / 2 - 0.08);
      const bz = r.z * (car.def.body.width / 2 - 0.08);

      const smoke = car.drifting && !car.offroad && car.speed > 6;
      const dust = car.offroad && car.speed > 4;
      if (smoke) {
        this.emitAcc += dt * (38 + car.slip * 7);
      } else if (dust) {
        this.emitAcc += dt * 34;
      }
      let guard = 0;
      while (this.emitAcc >= 1 && guard < 16) {
        this.emitAcc -= 1;
        guard++;
        const side = Math.random() > 0.5 ? 1 : -1;
        const px = rear.x + bx * side + (Math.random() - 0.5) * 0.32;
        const pz = rear.z + bz * side + (Math.random() - 0.5) * 0.32;
        if (smoke) {
          const c = new THREE.Color().setHSL(0.08, 0.06, 0.68 + Math.random() * 0.14);
          this.spawnParticle(
            px, 0.16 + Math.random() * 0.24, pz,
            -car.vel.x * 0.06 + (Math.random() - 0.5) * 1.2,
            0.6 + Math.random() * 1.1,
            -car.vel.z * 0.06 + (Math.random() - 0.5) * 1.2,
            0.55 + Math.random() * 0.7,
            2.4,
            0.9 + Math.random() * 0.7,
            c,
            0.34,
          );
        } else if (dust) {
          const c = new THREE.Color().setHSL(0.09, 0.45, 0.55 + Math.random() * 0.15);
          this.spawnParticle(
            px, 0.12 + Math.random() * 0.2, pz,
            (Math.random() - 0.5) * 2.2,
            0.8 + Math.random() * 1.2,
            (Math.random() - 0.5) * 2.2,
            0.7 + Math.random() * 0.8,
            2.8,
            0.8 + Math.random() * 0.6,
            c,
            0.3,
          );
        }
      }

      if (!smoke) this.emitAcc = Math.min(this.emitAcc, 2);

      // skid marks
      if (smoke && car.speed > 6) {
        this.skidAcc += car.speed * dt;
        if (this.skidAcc > 1.1) {
          this.skidAcc = 0;
          this.addSkid(rear.x + bx, rear.z + bz, car.heading);
          this.addSkid(rear.x - bx, rear.z - bz, car.heading);
        }
      } else {
        this.skidAcc = 0;
      }

      if (this.flames) {
        const boosting = car.boosting;
        this.flames.visible = boosting;
        if (boosting) {
          const flicker = 0.82 + Math.random() * 0.5;
          this.flames.children.forEach((mesh, i) => {
            mesh.scale.z = (i % 2 === 0 ? 1.4 : 1.0) * flicker;
          });
        }
      }
    }

    // update particles
    for (let i = 0; i < MAX_PARTICLES; i++) {
      const p = this.particles[i];
      if (p.life <= 0) {
        this.alphas[i] = 0;
        continue;
      }
      p.life -= dt;
      if (p.life <= 0) {
        this.alphas[i] = 0;
        continue;
      }
      const t = 1 - p.life / p.maxLife;
      const ix = i * 3;
      this.positions[ix] += p.vx * dt;
      this.positions[ix + 1] += p.vy * dt;
      this.positions[ix + 2] += p.vz * dt;
      p.vx *= 1 - 1.6 * dt;
      p.vz *= 1 - 1.6 * dt;
      p.vy += 0.8 * dt;
      const size = p.size * (1 + t * p.grow);
      this.sizes[i] = size;
      const fade = Math.min(1, t * 7) * Math.pow(1 - t, 1.5);
      this.alphas[i] = clamp(fade * p.alpha * 2.2, 0, 0.6);
    }

    const geo = this.points.geometry;
    geo.attributes.position.needsUpdate = true;
    geo.attributes.aSize.needsUpdate = true;
    geo.attributes.aAlpha.needsUpdate = true;
    geo.attributes.aColor.needsUpdate = true;
  }

  reset() {
    for (const p of this.particles) p.life = 0;
    for (let i = 0; i < MAX_PARTICLES; i++) this.alphas[i] = 0;
    this.points.geometry.attributes.aAlpha.needsUpdate = true;
    const zero = new THREE.Matrix4().makeScale(0, 0, 0);
    for (let i = 0; i < MAX_SKIDS; i++) this.skids.setMatrixAt(i, zero);
    this.skids.instanceMatrix.needsUpdate = true;
    this.skidIndex = 0;
    if (this.flames) this.flames.visible = false;
  }
}
