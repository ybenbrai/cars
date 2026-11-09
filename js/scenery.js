import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export const SUN_DIR = new THREE.Vector3(0.66, 0.19, 0.42).normalize();

const envCache = new Map();

function color(hex) {
  return new THREE.Color(hex);
}

function equirectEnv(renderer, palette) {
  const key = `${palette.skyHorizon}-${palette.skyLow}-${palette.sunGlow}`;
  if (envCache.has(key)) return envCache.get(key);

  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');

  const sky = ctx.createLinearGradient(0, 0, 0, 512);
  sky.addColorStop(0, palette.skyTop);
  sky.addColorStop(0.34, palette.skyMid);
  sky.addColorStop(0.52, palette.skyLow);
  sky.addColorStop(0.62, palette.skyHorizon);
  sky.addColorStop(0.7, palette.skyLow);
  sky.addColorStop(1, palette.skyTop);
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, 1024, 512);

  const sun = ctx.createRadialGradient(690, 300, 4, 690, 300, 130);
  sun.addColorStop(0, palette.sun);
  sun.addColorStop(0.12, palette.sunGlow);
  sun.addColorStop(0.5, 'rgba(255,120,70,0.28)');
  sun.addColorStop(1, 'rgba(255,120,70,0)');
  ctx.fillStyle = sun;
  ctx.fillRect(0, 0, 1024, 512);

  const fill = ctx.createRadialGradient(210, 380, 10, 210, 380, 260);
  fill.addColorStop(0, 'rgba(120,90,255,0.2)');
  fill.addColorStop(1, 'rgba(120,90,255,0)');
  ctx.fillStyle = fill;
  ctx.fillRect(0, 0, 1024, 512);

  const tex = new THREE.CanvasTexture(canvas);
  tex.mapping = THREE.EquirectangularReflectionMapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  const pmrem = new THREE.PMREMGenerator(renderer);
  const env = pmrem.fromEquirectangular(tex).texture;
  pmrem.dispose();
  tex.dispose();
  envCache.set(key, env);
  return env;
}

export function createEnvironmentMap(renderer, palette = {
  skyTop: '#120d26', skyMid: '#43204a', skyLow: '#b9505a', skyHorizon: '#ff9a5f',
  sun: '#fff3d6', sunGlow: '#ff7a46',
}) {
  return equirectEnv(renderer, palette);
}

function skyMesh(palette) {
  const geo = new THREE.SphereGeometry(1400, 48, 32);
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      uSunDir: { value: SUN_DIR },
      // The dome follows the camera so a long venue (the test runway) keeps a
      // sky overhead instead of driving out of a fixed, origin-centred dome.
      uCenter: { value: new THREE.Vector3() },
      uHorizon: { value: color(palette.skyHorizon) },
      uLow: { value: color(palette.skyLow) },
      uMid: { value: color(palette.skyMid) },
      uTop: { value: color(palette.skyTop) },
      uSun: { value: color(palette.sun) },
      uGlow: { value: color(palette.sunGlow) },
    },
    vertexShader: /* glsl */ `
      varying vec3 vWorld;
      void main() {
        vWorld = (modelMatrix * vec4(position, 1.0)).xyz;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      varying vec3 vWorld;
      uniform vec3 uSunDir;
      uniform vec3 uCenter;
      uniform vec3 uHorizon;
      uniform vec3 uLow;
      uniform vec3 uMid;
      uniform vec3 uTop;
      uniform vec3 uSun;
      uniform vec3 uGlow;
      void main() {
        vec3 d = normalize(vWorld - uCenter);
        float h = clamp(d.y, 0.0, 1.0);
        vec3 col = mix(uHorizon, uLow, smoothstep(0.0, 0.06, h));
        col = mix(col, uMid, smoothstep(0.05, 0.32, h));
        col = mix(col, uTop, smoothstep(0.30, 0.9, h));

        float sd = max(dot(d, uSunDir), 0.0);
        col += uSun * pow(sd, 1500.0) * 6.4;
        col += uGlow * pow(sd, 26.0) * 0.34;
        col += uGlow * pow(1.0 - h, 7.0) * 0.12;

        float n = fract(sin(dot(d, vec3(12.9898, 78.233, 37.719))) * 43758.5453);
        col += vec3(0.8, 0.8, 1.0) * step(0.99965, n) * smoothstep(0.35, 0.85, h) * 0.6;

        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.name = 'sky';
  return mesh;
}

function makeNoiseTexture(style) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');

  if (style === 'grass') {
    ctx.fillStyle = '#33422c';
    ctx.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 16000; i++) {
      const v = Math.random();
      ctx.fillStyle = v > 0.5
        ? `rgba(112,140,74,${0.05 + Math.random() * 0.22})`
        : `rgba(24,34,22,${0.05 + Math.random() * 0.2})`;
      ctx.fillRect(Math.random() * 512, Math.random() * 512, 1 + Math.random() * 3, 1 + Math.random() * 4);
    }
    for (let i = 0; i < 70; i++) {
      ctx.fillStyle = `rgba(90,120,60,${0.02 + Math.random() * 0.05})`;
      ctx.beginPath();
      ctx.ellipse(Math.random() * 512, Math.random() * 512, 8 + Math.random() * 40, 5 + Math.random() * 20, Math.random() * 3, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (style === 'asphalt') {
    ctx.fillStyle = '#23232c';
    ctx.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 14000; i++) {
      const shade = 30 + Math.random() * 55;
      ctx.fillStyle = `rgba(${shade},${shade},${shade + 6},${0.15 + Math.random() * 0.35})`;
      ctx.fillRect(Math.random() * 512, Math.random() * 512, 1 + Math.random() * 3, 1 + Math.random() * 3);
    }
    ctx.strokeStyle = 'rgba(10,10,14,0.35)';
    for (let i = 0; i < 18; i++) {
      ctx.lineWidth = 1 + Math.random() * 2;
      ctx.beginPath();
      ctx.moveTo(Math.random() * 512, 0);
      ctx.lineTo(Math.random() * 512, 512);
      ctx.stroke();
    }
  } else if (style === 'rock') {
    ctx.fillStyle = '#4b5560';
    ctx.fillRect(0, 0, 512, 512);
    for (let y = 0; y < 512; y += 4) {
      ctx.fillStyle = `rgba(${40 + Math.random() * 40},${46 + Math.random() * 40},${52 + Math.random() * 44},0.35)`;
      ctx.fillRect(0, y, 512, 2 + Math.random() * 3);
    }
    for (let i = 0; i < 6000; i++) {
      ctx.fillStyle = `rgba(180,190,205,${Math.random() * 0.12})`;
      ctx.fillRect(Math.random() * 512, Math.random() * 512, 1 + Math.random() * 2, 1 + Math.random() * 2);
    }
  } else {
    ctx.fillStyle = '#b98d63';
    ctx.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 12000; i++) {
      const v = Math.random();
      ctx.fillStyle = v > 0.5
        ? `rgba(226,190,145,${0.05 + Math.random() * 0.2})`
        : `rgba(92,60,45,${0.04 + Math.random() * 0.16})`;
      ctx.fillRect(Math.random() * 512, Math.random() * 512, 1 + Math.random() * 3, 1 + Math.random() * 3);
    }
    for (let i = 0; i < 60; i++) {
      ctx.fillStyle = `rgba(110,72,50,${0.03 + Math.random() * 0.05})`;
      ctx.beginPath();
      ctx.ellipse(Math.random() * 512, Math.random() * 512, 10 + Math.random() * 50, 4 + Math.random() * 20, Math.random() * 3, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(90, 90);
  tex.anisotropy = 8;
  return tex;
}

function windowTexture(tint) {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#101018';
  ctx.fillRect(0, 0, 128, 256);
  for (let y = 8; y < 248; y += 18) {
    for (let x = 8; x < 120; x += 16) {
      const lit = Math.random();
      if (lit > 0.52) {
        const hue = tint === 'cyan' ? 190 : tint === 'pink' ? 330 : 30;
        ctx.fillStyle = `hsla(${hue + Math.random() * 20},90%,${55 + Math.random() * 25}%,${0.5 + Math.random() * 0.5})`;
      } else {
        ctx.fillStyle = `rgba(30,36,52,${0.5 + Math.random() * 0.4})`;
      }
      ctx.fillRect(x, y, 9, 10);
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 4;
  return tex;
}

function colorize(geo, hex) {
  const c = new THREE.Color(hex);
  const count = geo.attributes.position.count;
  const arr = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const shade = 0.86 + Math.random() * 0.24;
    arr[i * 3] = c.r * shade;
    arr[i * 3 + 1] = c.g * shade;
    arr[i * 3 + 2] = c.b * shade;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return geo;
}

function palmGeometry() {
  const parts = [];
  const trunk = new THREE.CylinderGeometry(0.14, 0.34, 5.6, 6, 4);
  trunk.translate(0, 2.8, 0);
  const p = trunk.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i);
    p.setX(i, p.getX(i) + Math.pow(y / 5.6, 2) * 0.9);
  }
  trunk.computeVertexNormals();
  parts.push(colorize(trunk, '#6d4a2f'));
  for (let i = 0; i < 8; i++) {
    const leaf = new THREE.ConeGeometry(0.55, 3.2, 4, 1);
    leaf.rotateZ(-Math.PI / 2);
    leaf.translate(1.6, 0, 0);
    leaf.rotateZ(-0.3 - Math.random() * 0.18);
    leaf.rotateY((i / 8) * Math.PI * 2 + Math.random() * 0.15);
    leaf.translate(0.9, 5.5, 0);
    parts.push(colorize(leaf, i % 2 ? '#4c7a3a' : '#5f8f43'));
  }
  return mergeGeometries(parts, false);
}

function cactusGeometry() {
  const parts = [];
  const trunk = new THREE.CylinderGeometry(0.26, 0.32, 3.4, 7, 2);
  trunk.translate(0, 1.7, 0);
  parts.push(colorize(trunk, '#4d7d4b'));
  for (const sx of [-1, 1]) {
    const arm = new THREE.CylinderGeometry(0.15, 0.16, 0.9, 6);
    arm.rotateZ(Math.PI / 2);
    arm.translate(sx * 0.55, 1.8 + sx * 0.2, 0);
    parts.push(colorize(arm, '#4d7d4b'));
    const up = new THREE.CylinderGeometry(0.15, 0.17, 1.1, 6);
    up.translate(sx * 0.98, 2.3 + sx * 0.2, 0);
    parts.push(colorize(up, '#578a53'));
  }
  return mergeGeometries(parts, false);
}

function pineGeometry(snow = false) {
  const parts = [];
  const trunk = new THREE.CylinderGeometry(0.12, 0.24, 2.2, 6);
  trunk.translate(0, 1.1, 0);
  parts.push(colorize(trunk, '#4a3526'));
  for (let i = 0; i < 4; i++) {
    const y = 1.8 + i * 1.25;
    const r = 1.55 - i * 0.28;
    const cone = new THREE.ConeGeometry(r, 2.2, 7, 1);
    cone.translate(0, y, 0);
    parts.push(colorize(cone, snow && i === 3 ? '#d8e2ea' : i % 2 ? '#3d5a3a' : '#4a6b42'));
  }
  return mergeGeometries(parts, false);
}

function broadleafGeometry() {
  const parts = [];
  const trunk = new THREE.CylinderGeometry(0.16, 0.26, 2.4, 6);
  trunk.translate(0, 1.2, 0);
  parts.push(colorize(trunk, '#5a4030'));
  for (const [x, y, z, r, hex] of [
    [0, 3.7, 0, 1.9, '#4f7a3a'], [0.95, 3.1, 0.3, 1.3, '#5d8a43'], [-0.85, 3.3, -0.4, 1.4, '#476f35'],
  ]) {
    const crown = new THREE.SphereGeometry(r, 7, 5);
    crown.translate(x, y, z);
    parts.push(colorize(crown, hex));
  }
  return mergeGeometries(parts, false);
}

/** Generic trackside advertising: brand-neutral words on bold colour blocks. */
function hoardingTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  const blocks = [['#d8262f', 'VELOCITY'], ['#f2efe6', 'SUNSET DRIFT'], ['#1d2c50', 'NITRO'], ['#ffc46b', 'APEX']];
  blocks.forEach(([bg, word], i) => {
    ctx.fillStyle = bg;
    ctx.fillRect(i * 128, 0, 128, 64);
    ctx.fillStyle = bg === '#f2efe6' || bg === '#ffc46b' ? '#16121c' : '#ffffff';
    ctx.font = 'bold italic 22px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(word, i * 128 + 64, 33, 118);
  });
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function rockGeometry() {
  return new THREE.DodecahedronGeometry(1, 0);
}

function containerTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, 128, 64);
  for (let x = 0; x < 128; x += 8) {
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.fillRect(x, 0, 2, 64);
  }
  for (let i = 0; i < 500; i++) {
    ctx.fillStyle = `rgba(0,0,0,${Math.random() * 0.2})`;
    ctx.fillRect(Math.random() * 128, Math.random() * 64, 1 + Math.random() * 3, 1 + Math.random() * 2);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

/* ───────────────────────── environment ───────────────────────── */

export function createEnvironment(scene, renderer, palette) {
  scene.fog = new THREE.Fog(palette.fog, palette.fogNear, palette.fogFar);
  scene.environment = equirectEnv(renderer, palette);
  if ('environmentIntensity' in scene) scene.environmentIntensity = palette.env ?? 0.5;

  const sky = skyMesh(palette);
  scene.add(sky);

  const hemi = new THREE.HemisphereLight(palette.hemiSky, palette.hemiGround, 0.65);
  scene.add(hemi);

  const sun = new THREE.DirectionalLight(palette.sunLight, 2.6);
  sun.position.copy(SUN_DIR).multiplyScalar(140);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -52;
  sun.shadow.camera.right = 52;
  sun.shadow.camera.top = 52;
  sun.shadow.camera.bottom = -52;
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 340;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.035;
  scene.add(sun);
  scene.add(sun.target);

  const fill = new THREE.DirectionalLight(palette.fillLight, 0.5);
  fill.position.set(-80, 40, -100);
  scene.add(fill);

  const bounce = new THREE.DirectionalLight(palette.bounceLight, 0.3);
  bounce.position.set(20, -20, 60);
  scene.add(bounce);

  const groundMat = new THREE.MeshStandardMaterial({
    map: makeNoiseTexture(palette.groundStyle), color: palette.ground, roughness: 1, metalness: 0,
  });
  // Most circuits fit inside the default disc; long venues (the test runway)
  // ask for a bigger apron so the grass reaches past the barriers.
  const ground = new THREE.Mesh(new THREE.CircleGeometry(palette.groundRadius || 1250, 96), groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.06;
  ground.receiveShadow = true;
  scene.add(ground);

  return {
    sun,
    hemi,
    fill,
    bounce,
    sky,
    ground,
    env: scene.environment,
    sunDir: SUN_DIR,
    dispose() {
      sky.removeFromParent();
      sky.geometry.dispose();
      sky.material.dispose();
      ground.removeFromParent();
      ground.geometry.dispose();
      groundMat.map?.dispose();
      groundMat.dispose();
      hemi.removeFromParent();
      sun.removeFromParent();
      sun.target.removeFromParent();
      sun.shadow.dispose?.();
      fill.removeFromParent();
      bounce.removeFromParent();
    },
  };
}

/* ───────────────────────── scenery ───────────────────────── */

export function populateScenery(scene, track, circuit) {
  const palette = circuit.palette;
  const group = new THREE.Group();
  group.name = `scenery-${circuit.theme}`;
  scene.add(group);

  const start = track.start;
  const standPos = new THREE.Vector3().copy(start.point).addScaledVector(start.side, -(track.halfWidth + 22));

  const dummy = new THREE.Object3D();
  const tmpColor = new THREE.Color();

  function spot(minTrackDist, minRadius, maxRadius) {
    for (let attempt = 0; attempt < 70; attempt++) {
      const angle = Math.random() * Math.PI * 2;
      const radius = minRadius + Math.random() * (maxRadius - minRadius);
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;
      if (track.distanceToTrack(x, z) < minTrackDist) continue;
      if (Math.hypot(x - standPos.x, z - standPos.z) < 38) continue;
      return { x, z };
    }
    return null;
  }

  function instanced(geo, mat, count, placer, colors = null) {
    const mesh = new THREE.InstancedMesh(geo, mat, count);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    let placed = 0;
    for (let i = 0; i < count * 6 && placed < count; i++) {
      const spotResult = placer();
      if (!spotResult) continue;
      dummy.position.set(spotResult.x, spotResult.y ?? 0, spotResult.z);
      dummy.rotation.set(spotResult.rx ?? 0, spotResult.ry ?? Math.random() * Math.PI * 2, spotResult.rz ?? 0);
      const s = spotResult.scale ?? 1;
      dummy.scale.set(s * (spotResult.sx ?? 1), s * (spotResult.sy ?? 1), s * (spotResult.sz ?? 1));
      dummy.updateMatrix();
      mesh.setMatrixAt(placed, dummy.matrix);
      if (colors) {
        tmpColor.set(colors[Math.floor(Math.random() * colors.length)]);
        mesh.setColorAt(placed, tmpColor);
      }
      placed++;
    }
    mesh.count = placed;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    group.add(mesh);
    return mesh;
  }

  // ── distant backdrop
  const mesaMats = [
    new THREE.MeshStandardMaterial({ color: 0x9c5a45, roughness: 1, flatShading: true }),
    new THREE.MeshStandardMaterial({ color: 0x7f4438, roughness: 1, flatShading: true }),
    new THREE.MeshStandardMaterial({ color: 0xb06a4c, roughness: 1, flatShading: true }),
  ];

  if (circuit.theme === 'coast' || circuit.theme === 'desert') {
    for (let i = 0; i < (circuit.theme === 'coast' ? 16 : 20); i++) {
      const angle = (i / 16) * Math.PI * 2 + Math.random() * 0.35;
      const radius = 470 + Math.random() * 280;
      const height = 30 + Math.random() * 95;
      const base = 26 + Math.random() * 62;
      const geo = new THREE.CylinderGeometry(base * (0.4 + Math.random() * 0.3), base, height, 5 + Math.floor(Math.random() * 3), 2);
      const mesa = new THREE.Mesh(geo, mesaMats[i % mesaMats.length]);
      mesa.position.set(Math.cos(angle) * radius, height / 2 - 6, Math.sin(angle) * radius);
      mesa.rotation.y = Math.random() * Math.PI;
      group.add(mesa);
      if (Math.random() > 0.5) {
        const top = new THREE.Mesh(
          new THREE.CylinderGeometry(base * 0.24, base * 0.36, height * 0.34, 6, 1),
          mesaMats[(i + 1) % mesaMats.length],
        );
        top.position.set(mesa.position.x, height - 6 + height * 0.16, mesa.position.z);
        top.rotation.y = Math.random() * Math.PI;
        group.add(top);
      }
    }
  }

  if (circuit.theme === 'mountain') {
    for (let i = 0; i < 18; i++) {
      const angle = (i / 18) * Math.PI * 2 + Math.random() * 0.3;
      const radius = 430 + Math.random() * 300;
      const height = 110 + Math.random() * 190;
      const base = 90 + Math.random() * 120;
      const peak = new THREE.Mesh(
        new THREE.ConeGeometry(base, height, 5 + Math.floor(Math.random() * 3), 3),
        new THREE.MeshStandardMaterial({ color: 0x5b6370, roughness: 1, flatShading: true }),
      );
      peak.position.set(Math.cos(angle) * radius, height / 2 - 20, Math.sin(angle) * radius);
      peak.rotation.y = Math.random() * Math.PI;
      group.add(peak);
      const cap = new THREE.Mesh(
        new THREE.ConeGeometry(base * 0.34, height * 0.26, 5, 1),
        new THREE.MeshStandardMaterial({ color: 0xd7e2ec, roughness: 1, flatShading: true }),
      );
      cap.position.set(peak.position.x, height - 20 - height * 0.13, peak.position.z);
      cap.rotation.y = peak.rotation.y;
      group.add(cap);
    }
  }

  if (circuit.theme === 'forest') {
    for (let i = 0; i < 40; i++) {
      const angle = (i / 40) * Math.PI * 2 + Math.random() * 0.3;
      const radius = 430 + Math.random() * 320;
      const height = 55 + Math.random() * 90;
      const peak = new THREE.Mesh(
        new THREE.ConeGeometry(40 + Math.random() * 40, height, 6, 2),
        new THREE.MeshStandardMaterial({ color: 0x26382b, roughness: 1, flatShading: true }),
      );
      peak.position.set(Math.cos(angle) * radius, height / 2 - 10, Math.sin(angle) * radius);
      group.add(peak);
    }
  }

  if (circuit.theme === 'city' || circuit.theme === 'industrial') {
    for (let i = 0; i < 52; i++) {
      const angle = (i / 52) * Math.PI * 2 + Math.random() * 0.4;
      const radius = 300 + Math.random() * 380;
      const h = 30 + Math.random() * (circuit.theme === 'city' ? 180 : 70);
      const w = 22 + Math.random() * 45;
      const building = new THREE.Mesh(
        new THREE.BoxGeometry(w, h, w * (0.6 + Math.random() * 0.8)),
        new THREE.MeshStandardMaterial({
          color: circuit.theme === 'city' ? 0x161824 : 0x4a4238,
          roughness: 0.9,
          metalness: 0.15,
          emissive: circuit.theme === 'city' ? 0x120a20 : 0x000000,
          emissiveIntensity: 0.4,
        }),
      );
      building.position.set(Math.cos(angle) * radius, h / 2 - 2, Math.sin(angle) * radius);
      building.rotation.y = Math.random() * Math.PI;
      group.add(building);
    }
  }

  // ── theme detail
  if (circuit.theme === 'coast' || circuit.theme === 'desert') {
    const duneMat = new THREE.MeshStandardMaterial({ color: 0xb0845d, roughness: 1, flatShading: true });
    for (let i = 0; i < 30; i++) {
      const s = spot(42, 170, 480);
      if (!s) continue;
      const dune = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 0), duneMat);
      const r = 20 + Math.random() * 38;
      dune.scale.set(r, 3 + Math.random() * 8, r * (0.6 + Math.random() * 0.7));
      dune.position.set(s.x, -1, s.z);
      dune.rotation.y = Math.random() * Math.PI;
      dune.receiveShadow = true;
      group.add(dune);
    }

    const palmMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, flatShading: true });
    instanced(palmGeometry(), palmMat, circuit.theme === 'coast' ? 46 : 18, () => {
      const s = spot(18, 22, 330);
      if (!s) return null;
      return { x: s.x, z: s.z, scale: 0.8 + Math.random() * 0.8 };
    });

    const cactusMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, flatShading: true });
    instanced(cactusGeometry(), cactusMat, circuit.theme === 'desert' ? 60 : 26, () => {
      const s = spot(15, 22, 340);
      if (!s) return null;
      return { x: s.x, z: s.z, scale: 0.7 + Math.random() * 0.9 };
    });

    instanced(rockGeometry(), new THREE.MeshStandardMaterial({ color: 0xa47a5a, roughness: 1, flatShading: true }), 48, () => {
      const s = spot(14, 18, 360);
      if (!s) return null;
      const r = 0.4 + Math.random() * 2.2;
      return { x: s.x, y: r * 0.28, z: s.z, scale: r, sy: 0.5 + Math.random() * 0.5 };
    });

    instanced(new THREE.IcosahedronGeometry(0.7, 0), new THREE.MeshStandardMaterial({ color: 0x5d6b3c, roughness: 1, flatShading: true }), 90, () => {
      const s = spot(12, 16, 340);
      if (!s) return null;
      return { x: s.x, y: 0.2, z: s.z, scale: 0.5 + Math.random() * 1.2, sy: 0.7 };
    });
  }

  if (circuit.theme === 'forest' || circuit.theme === 'mountain') {
    const snow = circuit.theme === 'mountain';
    const pineMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, flatShading: true });
    instanced(pineGeometry(snow), pineMat, circuit.theme === 'forest' ? 220 : 150, () => {
      const s = spot(16, 18, 360);
      if (!s) return null;
      return { x: s.x, z: s.z, scale: 0.7 + Math.random() * 1.1 };
    });
    instanced(rockGeometry(), new THREE.MeshStandardMaterial({ color: snow ? 0x6d7480 : 0x5a5f4e, roughness: 1, flatShading: true }), 60, () => {
      const s = spot(14, 18, 340);
      if (!s) return null;
      const r = 0.5 + Math.random() * 2.6;
      return { x: s.x, y: r * 0.25, z: s.z, scale: r, sy: 0.6 + Math.random() * 0.5 };
    });
    instanced(new THREE.IcosahedronGeometry(0.7, 0), new THREE.MeshStandardMaterial({ color: snow ? 0x4f5a52 : 0x44502f, roughness: 1, flatShading: true }), 110, () => {
      const s = spot(12, 14, 330);
      if (!s) return null;
      return { x: s.x, y: 0.2, z: s.z, scale: 0.5 + Math.random() * 1.1, sy: 0.7 };
    });
  }

  if (circuit.theme === 'city') {
    const windowMat = new THREE.MeshStandardMaterial({
      map: windowTexture('mixed'), color: 0xffffff, roughness: 0.75, metalness: 0.25,
      emissive: 0xffffff, emissiveMap: windowTexture('mixed'), emissiveIntensity: 0.55,
    });
    instanced(new THREE.BoxGeometry(1, 1, 1), windowMat, 90, () => {
      const s = spot(24, 42, 330);
      if (!s) return null;
      const h = 12 + Math.random() * 70;
      const w = 8 + Math.random() * 20;
      return { x: s.x, y: h / 2, z: s.z, scale: 1, sx: w, sy: h, sz: w * (0.7 + Math.random() * 0.8) };
    });
    const lampMat = new THREE.MeshStandardMaterial({ color: 0xffe6b0, emissive: 0xffc46b, emissiveIntensity: 2.2 });
    for (let i = 0; i < 16; i++) {
      const s = spot(13, 14, 320);
      if (!s) continue;
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.18, 7.5, 6), new THREE.MeshStandardMaterial({ color: 0x2a2a34, metalness: 0.6, roughness: 0.5 }));
      pole.position.set(s.x, 3.75, s.z);
      group.add(pole);
      const lamp = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.18, 0.4), lampMat);
      lamp.position.set(s.x, 7.5, s.z);
      group.add(lamp);
    }
  }

  if (circuit.theme === 'industrial') {
    const containerMat = new THREE.MeshStandardMaterial({
      map: containerTexture(), color: 0xffffff, roughness: 0.75, metalness: 0.45,
    });
    instanced(new THREE.BoxGeometry(1, 1, 1), containerMat, 130, () => {
      const s = spot(18, 24, 360);
      if (!s) return null;
      const stack = 1 + Math.floor(Math.random() * 3);
      const h = 2.5 * stack;
      return {
        x: s.x, y: h / 2, z: s.z, scale: 1,
        sx: 2.5, sy: h, sz: 6 + Math.random() * 6, ry: Math.random() > 0.5 ? 0 : Math.PI / 2,
      };
    }, [0xb8492f, 0x2f6f5e, 0x2456a8, 0xb08a2e, 0x7a4a8a, 0x5c6470]);

    const warehouseMat = new THREE.MeshStandardMaterial({ color: 0x5a5348, roughness: 0.85, metalness: 0.15 });
    instanced(new THREE.BoxGeometry(1, 1, 1), warehouseMat, 26, () => {
      const s = spot(30, 70, 380);
      if (!s) return null;
      const h = 8 + Math.random() * 12;
      const w = 20 + Math.random() * 30;
      return { x: s.x, y: h / 2, z: s.z, scale: 1, sx: w, sy: h, sz: 14 + Math.random() * 24 };
    });

    const siloMat = new THREE.MeshStandardMaterial({ color: 0x8a8170, metalness: 0.5, roughness: 0.5 });
    for (let i = 0; i < 8; i++) {
      const s = spot(28, 80, 340);
      if (!s) continue;
      const h = 22 + Math.random() * 22;
      const silo = new THREE.Mesh(new THREE.CylinderGeometry(4, 4.4, h, 16), siloMat);
      silo.position.set(s.x, h / 2, s.z);
      silo.castShadow = true;
      group.add(silo);
      const cap = new THREE.Mesh(new THREE.ConeGeometry(4.2, 3, 16), siloMat);
      cap.position.set(s.x, h + 1.5, s.z);
      group.add(cap);
    }

    instanced(new THREE.CylinderGeometry(0.45, 0.45, 1.1, 10), new THREE.MeshStandardMaterial({ color: 0x9a5a32, roughness: 0.7, metalness: 0.4 }), 70, () => {
      const s = spot(13, 16, 330);
      if (!s) return null;
      return { x: s.x, y: 0.55, z: s.z, scale: 0.8 + Math.random() * 0.5 };
    });
  }

  if (circuit.theme === 'gp') {
    // Rolling parkland hills on the horizon.
    const hillMat = new THREE.MeshStandardMaterial({ color: 0x4a6838, roughness: 1, flatShading: true });
    for (let i = 0; i < 22; i++) {
      const angle = (i / 22) * Math.PI * 2 + Math.random() * 0.25;
      const radius = 520 + Math.random() * 220;
      const hill = new THREE.Mesh(new THREE.SphereGeometry(1, 9, 6), hillMat);
      hill.scale.set(70 + Math.random() * 70, 18 + Math.random() * 30, 70 + Math.random() * 70);
      hill.position.set(Math.cos(angle) * radius, -4, Math.sin(angle) * radius);
      group.add(hill);
    }

    const leafMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, flatShading: true });
    instanced(broadleafGeometry(), leafMat, 130, () => {
      const s = spot(30, 34, 380);
      if (!s) return null;
      return { x: s.x, z: s.z, scale: 0.9 + Math.random() * 0.9 };
    });

    // Tyre walls on the outside of every corner, hoardings along the straights.
    const tyreMat = new THREE.MeshStandardMaterial({ vertexColors: false, color: 0xffffff, roughness: 0.9 });
    const tyreGeo = new THREE.CylinderGeometry(0.5, 0.5, 0.42, 10);
    const tyreSpots = [];
    const boardSpots = [];
    const n = track.samples.length;
    const step = Math.max(1, Math.round(n / 220));
    for (let i = 0; i < n; i += step) {
      const a = track.samples[i];
      const b = track.samples[(i + step * 3) % n];
      const turn = a.tangent.x * b.tangent.z - a.tangent.z * b.tangent.x;
      const outside = turn > 0 ? 1 : -1;
      if (Math.abs(turn) > 0.12) {
        for (const k of [0, 1]) {
          const off = track.halfWidth + 9 + k * 1.05;
          const px = a.point.x + a.side.x * outside * off;
          const pz = a.point.z + a.side.z * outside * off;
          if (track.distanceToTrack(px, pz) < track.halfWidth + 7) continue;
          tyreSpots.push({ x: px, z: pz });
        }
      } else if (i % (step * 4) === 0) {
        const sign = i % (step * 8) === 0 ? 1 : -1;
        const off = track.halfWidth + 6.5;
        const px = a.point.x + a.side.x * sign * off;
        const pz = a.point.z + a.side.z * sign * off;
        if (track.distanceToTrack(px, pz) < track.halfWidth + 5) continue;
        if (Math.hypot(px - standPos.x, pz - standPos.z) < 26) continue;
        boardSpots.push({ x: px, z: pz, ry: Math.atan2(a.tangent.x, a.tangent.z) + Math.PI / 2 });
      }
    }
    const tyres = new THREE.InstancedMesh(tyreGeo, tyreMat, tyreSpots.length * 3);
    let ti = 0;
    tyreSpots.forEach((spotItem, index) => {
      for (let h = 0; h < 3; h++) {
        dummy.position.set(spotItem.x, 0.21 + h * 0.42, spotItem.z);
        dummy.rotation.set(0, 0, 0);
        dummy.scale.setScalar(1);
        dummy.updateMatrix();
        tyres.setMatrixAt(ti, dummy.matrix);
        tmpColor.setHex((index + h) % 2 ? 0xd8262f : 0xf2efe6);
        tyres.setColorAt(ti, tmpColor);
        ti++;
      }
    });
    tyres.count = ti;
    if (tyres.instanceColor) tyres.instanceColor.needsUpdate = true;
    tyres.castShadow = true;
    group.add(tyres);

    const boardMat = new THREE.MeshStandardMaterial({
      map: hoardingTexture(), roughness: 0.6, emissive: 0xffffff, emissiveIntensity: 0.18,
    });
    boardMat.emissiveMap = boardMat.map;
    instanced(new THREE.BoxGeometry(12, 1.1, 0.2), boardMat, boardSpots.length, (() => {
      let k = 0;
      return () => {
        const b = boardSpots[k++];
        return b ? { x: b.x, y: 0.75, z: b.z, ry: b.ry } : null;
      };
    })());

    // Pit building on the opposite side of the main straight from the grandstand.
    const pit = new THREE.Group();
    const pitPos = new THREE.Vector3().copy(start.point)
      .addScaledVector(start.side, track.halfWidth + 20)
      .addScaledVector(start.tangent, 30);
    pit.position.set(pitPos.x, 0, pitPos.z);
    pit.lookAt(pitPos.x - start.side.x, 0, pitPos.z - start.side.z);
    group.add(pit);
    const pitBody = new THREE.Mesh(
      new THREE.BoxGeometry(96, 7, 14),
      new THREE.MeshStandardMaterial({ color: 0xe9e6df, roughness: 0.7 }),
    );
    pitBody.position.y = 3.5;
    pitBody.castShadow = true;
    pitBody.receiveShadow = true;
    pit.add(pitBody);
    const glass = new THREE.Mesh(
      new THREE.BoxGeometry(94, 2, 0.2),
      new THREE.MeshStandardMaterial({ color: 0x1b2b44, metalness: 0.8, roughness: 0.15, emissive: 0x2a4f8a, emissiveIntensity: 0.35 }),
    );
    glass.position.set(0, 5.4, 7.05);
    pit.add(glass);
    const doorMat = new THREE.MeshStandardMaterial({ color: 0x2a2a32, roughness: 0.6, metalness: 0.4 });
    for (let i = 0; i < 12; i++) {
      const door = new THREE.Mesh(new THREE.BoxGeometry(6.2, 3.4, 0.15), doorMat);
      door.position.set(-41.5 + i * 7.55, 1.7, 7.05);
      pit.add(door);
    }
    const stripe = new THREE.Mesh(
      new THREE.BoxGeometry(96.4, 0.5, 14.4),
      new THREE.MeshStandardMaterial({ color: 0xd8262f, roughness: 0.6 }),
    );
    stripe.position.y = 7.2;
    pit.add(stripe);
  }

  if (circuit.theme === 'airport') {
    // ── runway edge lights: two rows down the whole loop
    const lightMat = new THREE.MeshStandardMaterial({
      color: 0x3a3324, emissive: 0xffdba0, emissiveIntensity: 2.4, roughness: 0.45,
    });
    const lightStep = Math.max(2, Math.round(track.samples.length / 320));
    const lightCount = Math.ceil(track.samples.length / lightStep) * 2;
    const edgeLights = new THREE.InstancedMesh(new THREE.BoxGeometry(0.6, 0.18, 0.6), lightMat, lightCount);
    let li = 0;
    for (let i = 0; i < track.samples.length; i += lightStep) {
      const s = track.samples[i];
      for (const sign of [-1, 1]) {
        const off = sign * (track.halfWidth + 1.8);
        dummy.position.set(s.point.x + s.side.x * off, 0.12, s.point.z + s.side.z * off);
        dummy.rotation.set(0, 0, 0);
        dummy.scale.setScalar(1);
        dummy.updateMatrix();
        edgeLights.setMatrixAt(li++, dummy.matrix);
      }
    }
    edgeLights.count = li;
    group.add(edgeLights);

    // ── hangars and a control tower on the outside of the main straight
    const outside = start.side.clone().multiplyScalar(-1);
    const along = start.tangent;
    const hangarMat = new THREE.MeshStandardMaterial({ color: 0xb9bec7, roughness: 0.75, metalness: 0.15 });
    const roofMat = new THREE.MeshStandardMaterial({ color: 0x6f7680, roughness: 0.8, metalness: 0.2 });
    const doorMat = new THREE.MeshStandardMaterial({ color: 0x3a3f48, roughness: 0.6, metalness: 0.35 });
    const towerCabMat = new THREE.MeshStandardMaterial({ color: 0x26242c, metalness: 0.6, roughness: 0.5 });
    for (let i = 0; i < 3; i++) {
      const hangar = new THREE.Group();
      const base = new THREE.Vector3().copy(start.point)
        .addScaledVector(outside, track.halfWidth + 52)
        .addScaledVector(along, 70 + i * 52);
      hangar.position.set(base.x, 0, base.z);
      hangar.rotation.y = Math.atan2(start.tangent.x, start.tangent.z);
      group.add(hangar);
      const body = new THREE.Mesh(new THREE.BoxGeometry(42, 13, 30), hangarMat);
      body.position.y = 6.5;
      body.castShadow = true;
      body.receiveShadow = true;
      hangar.add(body);
      const roof = new THREE.Mesh(new THREE.CylinderGeometry(15, 15, 42, 14, 1, false, 0, Math.PI), roofMat);
      roof.rotation.z = Math.PI / 2;
      roof.position.y = 13;
      roof.castShadow = true;
      hangar.add(roof);
      const door = new THREE.Mesh(new THREE.BoxGeometry(34, 10, 0.4), doorMat);
      door.position.set(0, 5, 15.1);
      hangar.add(door);
    }

    const tower = new THREE.Group();
    const towerBase = new THREE.Vector3().copy(start.point)
      .addScaledVector(outside, track.halfWidth + 30)
      .addScaledVector(along, -45);
    tower.position.set(towerBase.x, 0, towerBase.z);
    tower.rotation.y = Math.atan2(start.tangent.x, start.tangent.z);
    group.add(tower);
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(3.4, 4.4, 30, 12), hangarMat);
    shaft.position.y = 15;
    shaft.castShadow = true;
    tower.add(shaft);
    const cab = new THREE.Mesh(new THREE.CylinderGeometry(6, 5, 5, 12), towerCabMat);
    cab.position.y = 32.5;
    cab.castShadow = true;
    tower.add(cab);
    const cabGlass = new THREE.Mesh(
      new THREE.CylinderGeometry(6.05, 6.05, 2.2, 12),
      new THREE.MeshStandardMaterial({ color: 0x1b2b44, metalness: 0.7, roughness: 0.2, emissive: 0x2a4f8a, emissiveIntensity: 0.4 }),
    );
    cabGlass.position.y = 33.2;
    tower.add(cabGlass);
  }

  // ── grandstand near the start line
  const stand = new THREE.Group();
  stand.position.set(standPos.x, 0, standPos.z);
  stand.lookAt(start.point.x, 0, start.point.z);
  group.add(stand);

  const concrete = new THREE.MeshStandardMaterial({ color: 0x8f7f6c, roughness: 0.9 });
  const darkMetal = new THREE.MeshStandardMaterial({ color: 0x26242c, metalness: 0.6, roughness: 0.5 });
  const base = new THREE.Mesh(new THREE.BoxGeometry(30, 1.4, 12), concrete);
  base.position.set(0, 0.7, -4.2);
  base.castShadow = true;
  base.receiveShadow = true;
  stand.add(base);

  const tierMat = new THREE.MeshStandardMaterial({ color: 0x5d4a42, roughness: 0.9 });
  for (let i = 0; i < 4; i++) {
    const tier = new THREE.Mesh(new THREE.BoxGeometry(29, 0.9, 2.3), tierMat);
    tier.position.set(0, 1.4 + i * 0.85, -0.4 - i * 2.3);
    tier.castShadow = true;
    tier.receiveShadow = true;
    stand.add(tier);
  }
  for (const sx of [-1, 1]) {
    for (const sz of [1, -4]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 8.2, 8), darkMetal);
      post.position.set(sx * 14.4, 4.1, sz === 1 ? 1 : -9);
      stand.add(post);
    }
  }
  const roof = new THREE.Mesh(new THREE.BoxGeometry(31, 0.3, 11.5), darkMetal);
  roof.position.set(0, 8.5, -4.2);
  roof.castShadow = true;
  stand.add(roof);
  const trim = new THREE.Mesh(
    new THREE.BoxGeometry(31.2, 0.18, 0.3),
    new THREE.MeshStandardMaterial({ color: 0x1b1218, emissive: palette.accent, emissiveIntensity: 1.4 }),
  );
  trim.position.set(0, 8.3, 1.35);
  stand.add(trim);

  const crowdGeo = new THREE.BoxGeometry(0.34, 0.6, 0.3);
  const crowdMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9 });
  const crowd = new THREE.InstancedMesh(crowdGeo, crowdMat, 120);
  const crowdColors = [0xffc46b, 0xff7a45, 0x5ce1e6, 0xff3d7f, 0xf1ece2, 0x8dffb0, 0x7a5cff];
  let ci = 0;
  for (let row = 0; row < 4; row++) {
    for (let i = 0; i < 30; i++) {
      if (ci >= 120) break;
      dummy.position.set(-13 + i * 0.9 + (Math.random() - 0.5) * 0.2, 2.2 + row * 0.85, -0.4 - row * 2.3 + (Math.random() - 0.5) * 0.4);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.setScalar(0.9 + Math.random() * 0.35);
      dummy.updateMatrix();
      crowd.setMatrixAt(ci, dummy.matrix);
      tmpColor.setHex(crowdColors[Math.floor(Math.random() * crowdColors.length)]);
      crowd.setColorAt(ci, tmpColor);
      ci++;
    }
  }
  crowd.count = ci;
  stand.add(crowd);

  // ── floodlights
  const poleMat = new THREE.MeshStandardMaterial({ color: 0x2b2830, metalness: 0.65, roughness: 0.45 });
  const lampMat = new THREE.MeshStandardMaterial({ color: 0xfff0cc, emissive: 0xffca8a, emissiveIntensity: 1.6 });
  for (const t of [0.18, 0.43, 0.68, 0.93]) {
    const idx = Math.round(t * track.samples.length) % track.samples.length;
    const s = track.samples[idx];
    const sign = t > 0.5 ? -1 : 1;
    const px = s.point.x + s.side.x * sign * (track.halfWidth + 12);
    const pz = s.point.z + s.side.z * sign * (track.halfWidth + 12);
    if (track.distanceToTrack(px, pz) < track.halfWidth + 6) continue;
    const pole = new THREE.Group();
    pole.position.set(px, 0, pz);
    pole.lookAt(s.point.x, 0, s.point.z);
    group.add(pole);
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.26, 13, 8), poleMat);
    mast.position.y = 6.5;
    mast.castShadow = true;
    pole.add(mast);
    const head = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.3, 0.5), poleMat);
    head.position.set(0, 13, 0);
    pole.add(head);
    for (let i = -1; i <= 1; i++) {
      const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.45, 0.18), lampMat);
      lamp.position.set(i * 1.05, 12.8, 0.15);
      pole.add(lamp);
    }
  }

  function dispose() {
    group.traverse((obj) => {
      if (obj.isMesh || obj.isInstancedMesh) {
        obj.geometry?.dispose();
        if (Array.isArray(obj.material)) obj.material.forEach((m) => m.dispose());
        else obj.material?.dispose();
      }
    });
    group.removeFromParent();
  }

  return { group, stand, standPos, dispose };
}
