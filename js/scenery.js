import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export const SUN_DIR = new THREE.Vector3(0.66, 0.19, 0.42).normalize();

function equirectEnv(renderer) {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');

  const sky = ctx.createLinearGradient(0, 0, 0, 512);
  sky.addColorStop(0, '#140d26');
  sky.addColorStop(0.34, '#43204a');
  sky.addColorStop(0.52, '#b9505a');
  sky.addColorStop(0.62, '#ff9a5f');
  sky.addColorStop(0.7, '#6b3a3f');
  sky.addColorStop(1, '#120d12');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, 1024, 512);

  const sun = ctx.createRadialGradient(690, 300, 4, 690, 300, 130);
  sun.addColorStop(0, 'rgba(255,247,222,1)');
  sun.addColorStop(0.12, 'rgba(255,206,140,0.95)');
  sun.addColorStop(0.5, 'rgba(255,120,70,0.35)');
  sun.addColorStop(1, 'rgba(255,120,70,0)');
  ctx.fillStyle = sun;
  ctx.fillRect(0, 0, 1024, 512);

  // cool bounce light
  const fill = ctx.createRadialGradient(210, 380, 10, 210, 380, 260);
  fill.addColorStop(0, 'rgba(120,90,255,0.24)');
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
  return env;
}

export function createEnvironmentMap(renderer) {
  return equirectEnv(renderer);
}

function skyMesh() {
  const geo = new THREE.SphereGeometry(1100, 48, 32);
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      uSun: { value: SUN_DIR },
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
      uniform vec3 uSun;
      void main() {
        vec3 d = normalize(vWorld);
        float h = clamp(d.y, 0.0, 1.0);
        vec3 horizon = vec3(1.0, 0.46, 0.20);
        vec3 low = vec3(0.92, 0.31, 0.29);
        vec3 mid = vec3(0.34, 0.13, 0.33);
        vec3 top = vec3(0.055, 0.03, 0.12);
        vec3 col = mix(horizon, low, smoothstep(0.0, 0.055, h));
        col = mix(col, mid, smoothstep(0.04, 0.30, h));
        col = mix(col, top, smoothstep(0.28, 0.85, h));

        float sd = max(dot(d, uSun), 0.0);
        col += vec3(1.0, 0.82, 0.55) * pow(sd, 1500.0) * 7.0;
        col += vec3(1.0, 0.52, 0.22) * pow(sd, 26.0) * 0.34;
        col += vec3(1.0, 0.32, 0.16) * pow(1.0 - h, 7.0) * 0.13;

        // rare, very faint stars high in the sky
        float n = fract(sin(dot(d, vec3(12.9898, 78.233, 37.719))) * 43758.5453);
        col += vec3(0.8, 0.8, 1.0) * step(0.9997, n) * smoothstep(0.35, 0.8, h) * 0.55;

        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  return mesh;
}

function sandTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');
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
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(70, 70);
  tex.anisotropy = 8;
  return tex;
}

function colorize(geo, hex) {
  const color = new THREE.Color(hex);
  const count = geo.attributes.position.count;
  const arr = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const shade = 0.86 + Math.random() * 0.24;
    arr[i * 3] = color.r * shade;
    arr[i * 3 + 1] = color.g * shade;
    arr[i * 3 + 2] = color.b * shade;
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

export function createEnvironment(scene, renderer) {
  scene.fog = new THREE.Fog(0xd98a68, 190, 980);
  scene.environment = equirectEnv(renderer);
  if ('environmentIntensity' in scene) scene.environmentIntensity = 0.5;

  const sky = skyMesh();
  scene.add(sky);

  // lights
  const hemi = new THREE.HemisphereLight(0xffc49a, 0x3a2436, 0.6);
  scene.add(hemi);

  const sun = new THREE.DirectionalLight(0xffb37c, 2.5);
  sun.position.copy(SUN_DIR).multiplyScalar(140);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -48;
  sun.shadow.camera.right = 48;
  sun.shadow.camera.top = 48;
  sun.shadow.camera.bottom = -48;
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 320;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.035;
  scene.add(sun);
  scene.add(sun.target);

  const fill = new THREE.DirectionalLight(0x8f6bff, 0.5);
  fill.position.set(-80, 40, -100);
  scene.add(fill);

  const bounce = new THREE.DirectionalLight(0xff7a45, 0.28);
  bounce.position.set(20, -20, 60);
  scene.add(bounce);

  // ground
  const groundMat = new THREE.MeshStandardMaterial({
    map: sandTexture(), color: 0xffffff, roughness: 1, metalness: 0,
  });
  const ground = new THREE.Mesh(new THREE.CircleGeometry(1000, 96), groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.06;
  ground.receiveShadow = true;
  scene.add(ground);

  return { sun, hemi, sky, env: scene.environment, sunDir: SUN_DIR };
}

export function populateScenery(scene, track) {
  const group = new THREE.Group();
  group.name = 'scenery';
  scene.add(group);

  const start = track.start;
  const standPos = start.point.clone().addScaledVector(start.side, -28);

  function spot(minTrackDist, minRadius, maxRadius) {
    for (let attempt = 0; attempt < 60; attempt++) {
      const angle = Math.random() * Math.PI * 2;
      const radius = minRadius + Math.random() * (maxRadius - minRadius);
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;
      if (track.distanceToTrack(x, z) < minTrackDist) continue;
      if (Math.hypot(x - standPos.x, z - standPos.z) < 34) continue;
      return { x, z };
    }
    return null;
  }

  // distant mesas / buttes
  const mesaMats = [
    new THREE.MeshStandardMaterial({ color: 0x9c5a45, roughness: 1, flatShading: true }),
    new THREE.MeshStandardMaterial({ color: 0x7f4438, roughness: 1, flatShading: true }),
    new THREE.MeshStandardMaterial({ color: 0xb06a4c, roughness: 1, flatShading: true }),
  ];
  for (let i = 0; i < 16; i++) {
    const angle = (i / 16) * Math.PI * 2 + Math.random() * 0.35;
    const radius = 440 + Math.random() * 260;
    const height = 30 + Math.random() * 95;
    const base = 24 + Math.random() * 60;
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

  // dunes
  const duneMat = new THREE.MeshStandardMaterial({ color: 0xb0845d, roughness: 1, flatShading: true });
  for (let i = 0; i < 26; i++) {
    const s = spot(40, 150, 420);
    if (!s) continue;
    const geo = new THREE.IcosahedronGeometry(1, 0);
    const dune = new THREE.Mesh(geo, duneMat);
    const r = 18 + Math.random() * 34;
    dune.scale.set(r, 3 + Math.random() * 8, r * (0.6 + Math.random() * 0.7));
    dune.position.set(s.x, -1, s.z);
    dune.rotation.y = Math.random() * Math.PI;
    dune.receiveShadow = true;
    group.add(dune);
  }

  // palms
  const palmMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, flatShading: true });
  const palmGeo = palmGeometry();
  const palmCount = 34;
  const palms = new THREE.InstancedMesh(palmGeo, palmMat, palmCount);
  palms.castShadow = true;
  const dummy = new THREE.Object3D();
  let placed = 0;
  for (let i = 0; i < 300 && placed < palmCount; i++) {
    const s = spot(17, 20, 300);
    if (!s) continue;
    dummy.position.set(s.x, 0, s.z);
    dummy.rotation.set(0, Math.random() * Math.PI * 2, (Math.random() - 0.5) * 0.12);
    const sc = 0.8 + Math.random() * 0.8;
    dummy.scale.set(sc, sc, sc);
    dummy.updateMatrix();
    palms.setMatrixAt(placed++, dummy.matrix);
  }
  palms.count = placed;
  group.add(palms);

  // cacti
  const cactusMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, flatShading: true });
  const cactusGeo = cactusGeometry();
  const cacti = new THREE.InstancedMesh(cactusGeo, cactusMat, 40);
  cacti.castShadow = true;
  placed = 0;
  for (let i = 0; i < 300 && placed < 40; i++) {
    const s = spot(14, 20, 320);
    if (!s) continue;
    dummy.position.set(s.x, 0, s.z);
    dummy.rotation.set(0, Math.random() * Math.PI * 2, 0);
    const sc = 0.7 + Math.random() * 0.9;
    dummy.scale.set(sc, sc, sc);
    dummy.updateMatrix();
    cacti.setMatrixAt(placed++, dummy.matrix);
  }
  cacti.count = placed;
  group.add(cacti);

  // rocks
  const rockGeo = new THREE.DodecahedronGeometry(1, 0);
  const rockMat = new THREE.MeshStandardMaterial({ color: 0xa47a5a, roughness: 1, flatShading: true });
  const rockCount = 46;
  const rocks = new THREE.InstancedMesh(rockGeo, rockMat, rockCount);
  rocks.castShadow = true;
  rocks.receiveShadow = true;
  const color = new THREE.Color();
  placed = 0;
  for (let i = 0; i < 300 && placed < rockCount; i++) {
    const s = spot(13, 16, 340);
    if (!s) continue;
    const r = 0.4 + Math.random() * 2.2;
    dummy.position.set(s.x, r * 0.28, s.z);
    dummy.rotation.set(Math.random(), Math.random() * Math.PI, Math.random());
    dummy.scale.set(r, r * (0.5 + Math.random() * 0.5), r);
    dummy.updateMatrix();
    rocks.setMatrixAt(placed, dummy.matrix);
    color.setHSL(0.06 + Math.random() * 0.03, 0.28, 0.34 + Math.random() * 0.16);
    rocks.setColorAt(placed, color);
    placed++;
  }
  rocks.count = placed;
  group.add(rocks);

  // scrub bushes
  const bushGeo = new THREE.IcosahedronGeometry(0.7, 0);
  const bushMat = new THREE.MeshStandardMaterial({ color: 0x5d6b3c, roughness: 1, flatShading: true });
  const bushCount = 90;
  const bushes = new THREE.InstancedMesh(bushGeo, bushMat, bushCount);
  placed = 0;
  for (let i = 0; i < 500 && placed < bushCount; i++) {
    const s = spot(11.5, 14, 320);
    if (!s) continue;
    dummy.position.set(s.x, 0.2, s.z);
    dummy.rotation.set(0, Math.random() * Math.PI, 0);
    const sc = 0.5 + Math.random() * 1.2;
    dummy.scale.set(sc * 1.3, sc * 0.7, sc * 1.3);
    dummy.updateMatrix();
    bushes.setMatrixAt(placed++, dummy.matrix);
  }
  bushes.count = placed;
  group.add(bushes);

  // grandstand near the start line
  const stand = new THREE.Group();
  stand.position.set(standPos.x, 0, standPos.z);
  stand.lookAt(start.point.x, 0, start.point.z);
  group.add(stand);

  const concrete = new THREE.MeshStandardMaterial({ color: 0x9a8875, roughness: 0.9 });
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
    new THREE.MeshStandardMaterial({ color: 0x1b1218, emissive: 0xff7a45, emissiveIntensity: 1.4 }),
  );
  trim.position.set(0, 8.3, 1.35);
  stand.add(trim);

  // crowd
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
      color.setHex(crowdColors[Math.floor(Math.random() * crowdColors.length)]);
      crowd.setColorAt(ci, color);
      ci++;
    }
  }
  crowd.count = ci;
  stand.add(crowd);

  // floodlight poles
  const poleMat = new THREE.MeshStandardMaterial({ color: 0x2b2830, metalness: 0.65, roughness: 0.45 });
  const lampMat = new THREE.MeshStandardMaterial({ color: 0xfff0cc, emissive: 0xffca8a, emissiveIntensity: 1.6 });
  for (const t of [0.18, 0.43, 0.68, 0.93]) {
    const idx = Math.round(t * track.samples.length) % track.samples.length;
    const s = track.samples[idx];
    const sign = t > 0.5 ? -1 : 1;
    const px = s.point.x + s.side.x * sign * 19;
    const pz = s.point.z + s.side.z * sign * 19;
    if (track.distanceToTrack(px, pz) < 14) continue;
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

  return { group, stand, standPos };
}
