import * as THREE from 'three';

const N = 1200;

function noiseTexture(size, draw) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  draw(ctx, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 8;
  return tex;
}

function asphaltTexture(palette) {
  return noiseTexture(512, (ctx, s) => {
    ctx.fillStyle = palette.road || '#33323a';
    ctx.fillRect(0, 0, s, s);
    for (let i = 0; i < 9000; i++) {
      const shade = 38 + Math.random() * 45;
      ctx.fillStyle = `rgba(${shade},${shade},${shade + 4},${0.25 + Math.random() * 0.4})`;
      ctx.fillRect(Math.random() * s, Math.random() * s, 1 + Math.random() * 2, 1 + Math.random() * 2);
    }
    ctx.fillStyle = 'rgba(20,20,24,0.12)';
    ctx.fillRect(s * 0.26, 0, s * 0.14, s);
    ctx.fillRect(s * 0.6, 0, s * 0.14, s);
    ctx.fillStyle = palette.line || '#efe6d4';
    ctx.fillRect(16, 0, 10, s);
    ctx.fillRect(s - 26, 0, 10, s);
    for (const y of [24, 280]) {
      ctx.fillRect(s / 2 - 6, y, 12, 132);
    }
    ctx.fillStyle = 'rgba(0,0,0,0.12)';
    ctx.fillRect(0, 0, s, 3);
  });
}

function curbTexture(palette) {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = palette.curbA || '#e7e0d1';
  ctx.fillRect(0, 0, 64, 32);
  ctx.fillStyle = palette.curbB || '#cf3f2f';
  ctx.fillRect(0, 32, 64, 32);
  for (let i = 0; i < 300; i++) {
    ctx.fillStyle = `rgba(20,16,14,${Math.random() * 0.16})`;
    ctx.fillRect(Math.random() * 64, Math.random() * 64, 1, 1);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 8;
  return tex;
}

function checkerTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  const cell = 32;
  for (let y = 0; y < 2; y++) {
    for (let x = 0; x < 16; x++) {
      ctx.fillStyle = (x + y) % 2 === 0 ? '#f2ecdd' : '#141419';
      ctx.fillRect(x * cell, y * cell, cell, cell);
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

function bannerTexture(title, subtitle, palette) {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 160;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#100b18';
  ctx.fillRect(0, 0, 1024, 160);
  ctx.strokeStyle = `#${palette.marker.toString(16).padStart(6, '0')}`;
  ctx.lineWidth = 4;
  ctx.strokeRect(6, 6, 1012, 148);
  for (let x = 0; x < 8; x++) {
    for (let y = 0; y < 2; y++) {
      ctx.fillStyle = (x + y) % 2 === 0 ? '#f2ecdd' : '#1b1524';
      ctx.fillRect(20 + x * 22, 60 + y * 22, 22, 22);
      ctx.fillRect(806 + x * 22, 60 + y * 22, 22, 22);
    }
  }
  ctx.fillStyle = '#fff4e6';
  ctx.font = 'italic 700 58px "Chakra Petch", Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(title, 512, 74);
  if (subtitle) {
    ctx.fillStyle = '#ffc46b';
    ctx.font = '600 18px "Chakra Petch", Arial, sans-serif';
    ctx.fillText(subtitle.toUpperCase(), 512, 120);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

function padTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, 256, 128);
  ctx.strokeStyle = '#8ff7ff';
  ctx.lineWidth = 12;
  ctx.lineCap = 'round';
  for (const x of [64, 128, 192]) {
    ctx.beginPath();
    ctx.moveTo(x - 28, 30);
    ctx.lineTo(x + 16, 64);
    ctx.lineTo(x - 28, 98);
    ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function ribbonGeometry(samples, curveLength, offsetA, offsetB, y, uvPeriod) {
  const positions = [];
  const uvs = [];
  const indices = [];
  for (let i = 0; i <= N; i++) {
    const s = samples[i % N];
    positions.push(
      s.point.x + s.side.x * offsetA, y, s.point.z + s.side.z * offsetA,
      s.point.x + s.side.x * offsetB, y, s.point.z + s.side.z * offsetB,
    );
    const v = ((i / N) * curveLength) / uvPeriod;
    uvs.push(0, v, 1, v);
  }
  for (let i = 0; i < N; i++) {
    const a0 = i * 2;
    const b0 = a0 + 1;
    const a1 = a0 + 2;
    const b1 = a0 + 3;
    indices.push(a0, b0, a1, a1, b0, b1);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

function disposeObject(root) {
  root.traverse((obj) => {
    if (obj.isMesh || obj.isInstancedMesh) {
      obj.geometry?.dispose();
      if (Array.isArray(obj.material)) obj.material.forEach((m) => m.dispose());
      else obj.material?.dispose();
    }
  });
  root.removeFromParent();
}

export function createTrack(scene, circuit) {
  const palette = circuit.palette;
  const halfWidth = circuit.width;
  const curbOuter = halfWidth + 1.2;
  const wallOffset = halfWidth + 3.0;

  const points = circuit.cp.map(([x, z]) => new THREE.Vector3(x, 0, z));
  const curve = new THREE.CatmullRomCurve3(points, true, 'centripetal', 0.5);
  const length = curve.getLength();
  const raw = curve.getSpacedPoints(N);

  const samples = [];
  for (let i = 0; i < N; i++) {
    const point = raw[i].clone();
    const prev = raw[(i - 1 + N) % N];
    const next = raw[(i + 1) % N];
    const tangent = new THREE.Vector3().subVectors(next, prev);
    tangent.y = 0;
    tangent.normalize();
    const side = new THREE.Vector3(tangent.z, 0, -tangent.x);
    samples.push({ point, tangent, side, dist: (i / N) * length });
  }

  const group = new THREE.Group();
  group.name = `track-${circuit.id}`;
  scene.add(group);

  // ── road surface
  const roadPeriod = length / Math.max(1, Math.round(length / 11));
  const roadMat = new THREE.MeshStandardMaterial({
    map: asphaltTexture(palette),
    roughness: 0.93,
    metalness: 0.04,
    color: 0xffffff,
  });
  const road = new THREE.Mesh(
    ribbonGeometry(samples, length, halfWidth, -halfWidth, 0, roadPeriod),
    roadMat,
  );
  road.receiveShadow = true;
  group.add(road);

  // ── curbs
  const curbPeriod = length / Math.max(1, Math.round(length / 4));
  const curbMat = new THREE.MeshStandardMaterial({ map: curbTexture(palette), roughness: 0.8, metalness: 0.02 });
  const curbL = new THREE.Mesh(
    ribbonGeometry(samples, length, curbOuter, halfWidth + 0.02, 0.018, curbPeriod),
    curbMat,
  );
  curbL.receiveShadow = true;
  group.add(curbL);
  const curbR = new THREE.Mesh(
    ribbonGeometry(samples, length, -halfWidth - 0.02, -curbOuter, 0.018, curbPeriod),
    curbMat,
  );
  curbR.receiveShadow = true;
  group.add(curbR);

  // ── barriers
  const step = Math.max(2, Math.round(N / (length / 3.6)));
  const barrierCount = Math.ceil(N / step) * 2;
  const segLength = (length / N) * step * 0.94;
  const barrierGeo = new THREE.BoxGeometry(0.34, 0.7, segLength);
  const barrierMat = new THREE.MeshStandardMaterial({ color: palette.barrier, roughness: 0.85, metalness: 0.05 });
  const barriers = new THREE.InstancedMesh(barrierGeo, barrierMat, barrierCount);
  const markerGeo = new THREE.BoxGeometry(0.38, 0.06, 0.14);
  const markerMat = new THREE.MeshStandardMaterial({ color: 0x2a1d16, emissive: palette.marker, emissiveIntensity: 1.2 });
  const markers = new THREE.InstancedMesh(markerGeo, markerMat, barrierCount);
  const dummy = new THREE.Object3D();
  let bi = 0;
  for (let i = 0; i < N; i += step) {
    const s = samples[i];
    for (const sign of [-1, 1]) {
      const off = sign * wallOffset;
      dummy.position.set(s.point.x + s.side.x * off, 0.35, s.point.z + s.side.z * off);
      dummy.rotation.set(0, Math.atan2(s.tangent.x, s.tangent.z), 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      barriers.setMatrixAt(bi, dummy.matrix);
      dummy.position.y = 0.72;
      dummy.updateMatrix();
      markers.setMatrixAt(bi, dummy.matrix);
      bi++;
    }
  }
  barriers.count = bi;
  markers.count = bi;
  barriers.castShadow = true;
  barriers.receiveShadow = true;
  group.add(barriers, markers);

  // ── start / finish line
  const startSample = samples[0];
  const checkerMat = new THREE.MeshStandardMaterial({ map: checkerTexture(), roughness: 0.7 });
  const startLine = new THREE.Mesh(new THREE.PlaneGeometry(halfWidth * 2, 2.4), checkerMat);
  startLine.rotation.x = -Math.PI / 2;
  startLine.position.set(startSample.point.x, 0.026, startSample.point.z);
  startLine.rotation.z = -Math.atan2(startSample.tangent.x, startSample.tangent.z);
  startLine.receiveShadow = true;
  group.add(startLine);

  // ── start arch
  const archGroup = new THREE.Group();
  archGroup.position.copy(startSample.point);
  archGroup.rotation.y = Math.atan2(startSample.tangent.x, startSample.tangent.z);
  group.add(archGroup);
  const metalMat = new THREE.MeshStandardMaterial({ color: 0x1b1b22, roughness: 0.45, metalness: 0.7 });
  const archTrimMat = new THREE.MeshStandardMaterial({
    color: 0x1a1218, emissive: palette.accent, emissiveIntensity: 0.9, roughness: 0.4, metalness: 0.5,
  });
  const archWidth = halfWidth + 1.8;
  for (const sx of [-1, 1]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.55, 6.4, 0.55), metalMat);
    post.position.set(sx * archWidth, 3.2, 0);
    post.castShadow = true;
    archGroup.add(post);
    const trim = new THREE.Mesh(new THREE.BoxGeometry(0.13, 5.4, 0.58), archTrimMat);
    trim.position.set(sx * archWidth, 3.2, 0.01);
    archGroup.add(trim);
  }
  const beam = new THREE.Mesh(new THREE.BoxGeometry(archWidth * 2 + 0.6, 0.5, 0.6), metalMat);
  beam.position.set(0, 6.5, 0);
  beam.castShadow = true;
  archGroup.add(beam);
  const bannerMat = new THREE.MeshStandardMaterial({
    map: bannerTexture(circuit.name, circuit.location, palette),
    roughness: 0.6, metalness: 0.1, side: THREE.FrontSide,
  });
  const bannerWidth = Math.min(archWidth * 1.7, 16.5);
  const banner = new THREE.Mesh(new THREE.PlaneGeometry(bannerWidth, bannerWidth * 0.155), bannerMat);
  banner.position.set(0, 6.1, 0.32);
  archGroup.add(banner);
  const bannerBack = new THREE.Mesh(new THREE.PlaneGeometry(bannerWidth, bannerWidth * 0.155), bannerMat);
  bannerBack.position.set(0, 6.1, -0.32);
  bannerBack.rotation.y = Math.PI;
  archGroup.add(bannerBack);

  // ── checkpoint gates
  const gates = [];
  const gateCount = circuit.gates || 8;
  for (let i = 0; i < gateCount; i++) {
    const t = i / gateCount;
    const idx = Math.round(t * N) % N;
    const s = samples[idx];
    const mat = new THREE.MeshStandardMaterial({
      color: 0x12101a, emissive: palette.accent, emissiveIntensity: 0.35,
      roughness: 0.4, metalness: 0.6,
    });
    const g = new THREE.Group();
    g.position.copy(s.point);
    g.rotation.y = Math.atan2(s.tangent.x, s.tangent.z);
    group.add(g);
    if (i !== 0) {
      const gw = halfWidth + 0.9;
      for (const sx of [-1, 1]) {
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.22, 5.1, 0.22), mat);
        post.position.set(sx * gw, 2.55, 0);
        post.castShadow = true;
        g.add(post);
      }
      const beam = new THREE.Mesh(new THREE.BoxGeometry(gw * 2 + 0.2, 0.22, 0.22), mat);
      beam.position.set(0, 5.1, 0);
      g.add(beam);
      for (const sx of [-1, 1]) {
        const glow = new THREE.Mesh(new THREE.BoxGeometry(0.1, 4.4, 0.3), mat);
        glow.position.set(sx * (gw - 0.02), 2.4, 0.06);
        g.add(glow);
      }
    }
    gates.push({
      index: i, t, point: s.point.clone(), tangent: s.tangent.clone(),
      group: g, material: mat, flash: 0, gate: true,
    });
  }
  gates[0].material = archTrimMat;

  // ── boost pads
  const pads = [];
  const padMat = new THREE.MeshBasicMaterial({
    map: padTexture(), color: 0x5ce1e6, transparent: true, opacity: 0.85,
    blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
  });
  for (const t of circuit.pads || [0.08, 0.32, 0.56, 0.8]) {
    const idx = Math.round(t * N) % N;
    const s = samples[idx];
    const pad = new THREE.Mesh(new THREE.PlaneGeometry(5.6, 3.2), padMat.clone());
    pad.rotation.x = -Math.PI / 2;
    pad.rotation.z = -Math.atan2(s.tangent.x, s.tangent.z);
    pad.position.set(s.point.x, 0.03, s.point.z);
    pad.userData.base = 0.65;
    pad.userData.phase = Math.random() * Math.PI * 2;
    group.add(pad);
    pads.push({ point: s.point.clone(), mesh: pad, readyAt: 0 });
  }

  // ── queries
  function nearest(pos, hint = null) {
    let best = Infinity;
    let bestIndex = 0;
    let from = 0;
    let to = N;
    // When a previous index is supplied, only scan a local window around it.
    // This keeps per-frame cost flat for AI and the player alike. If the car
    // has been teleported far away we fall back to a full scan below.
    if (Number.isInteger(hint) && hint >= 0 && hint < N) {
      from = hint - 70;
      to = hint + 70;
    }
    for (let k = from; k <= to; k++) {
      const i = ((k % N) + N) % N;
      const s = samples[i];
      const dx = pos.x - s.point.x;
      const dz = pos.z - s.point.z;
      const d = dx * dx + dz * dz;
      if (d < best) {
        best = d;
        bestIndex = i;
      }
    }
    if (best > 45 * 45 && (to - from) < N) {
      for (let i = 0; i < N; i++) {
        const s = samples[i];
        const dx = pos.x - s.point.x;
        const dz = pos.z - s.point.z;
        const d = dx * dx + dz * dz;
        if (d < best) {
          best = d;
          bestIndex = i;
        }
      }
    }
    const s = samples[bestIndex];
    return {
      index: bestIndex,
      point: s.point,
      tangent: s.tangent,
      side: s.side,
      dist: s.dist,
      distance: Math.sqrt(best),
      signed: (pos.x - s.point.x) * s.side.x + (pos.z - s.point.z) * s.side.z,
    };
  }

  function sampleAt(distance) {
    const wrapped = ((distance % length) + length) % length;
    const idx = Math.round((wrapped / length) * N) % N;
    return samples[idx];
  }

  function distanceToTrack(x, z) {
    let best = Infinity;
    for (let i = 0; i < N; i += 3) {
      const p = samples[i].point;
      const dx = x - p.x;
      const dz = z - p.z;
      const d = dx * dx + dz * dz;
      if (d < best) best = d;
    }
    return Math.sqrt(best);
  }

  function gridSlot(index) {
    const row = Math.floor(index / 2);
    const col = index % 2;
    // Grid rows sit ~8 m apart in metres, measured backwards from the line.
    const behind = 8 + row * 8.5;
    const wrapped = ((length - behind) % length + length) % length;
    const idx = Math.round((wrapped / length) * N) % N;
    const s = samples[idx];
    const lateral = (col === 0 ? -1 : 1) * Math.min(2.2, halfWidth * 0.34);
    return {
      point: new THREE.Vector3(s.point.x + s.side.x * lateral, 0, s.point.z + s.side.z * lateral),
      tangent: s.tangent.clone(),
      index: idx,
      dist: s.dist,
    };
  }

  let elapsed = 0;
  function update(dt, nextGate) {
    elapsed += dt;
    for (const gate of gates) {
      if (!gate.gate) continue;
      gate.flash = Math.max(0, gate.flash - dt * 2.4);
      const active = gate.index === nextGate;
      if (gate.flash > 0) {
        gate.material.emissive.set(0x8dffb0);
        gate.material.emissiveIntensity = 2 + gate.flash * 3;
      } else if (active) {
        gate.material.emissive.set(palette.accent);
        gate.material.emissiveIntensity = 1.6 + Math.sin(elapsed * 5) * 1.1;
      } else {
        gate.material.emissive.set(palette.marker);
        gate.material.emissiveIntensity = gate.index === 0 ? 0.9 : 0.35;
      }
    }
    for (const pad of pads) {
      const m = pad.mesh.material;
      const pulse = 0.55 + Math.sin(elapsed * 4 + pad.mesh.userData.phase) * 0.35;
      m.opacity = pad.readyAt > 0 ? 0.18 : pulse;
      const scale = pad.readyAt > 0 ? 1 : 1 + Math.sin(elapsed * 4 + pad.mesh.userData.phase) * 0.04;
      pad.mesh.scale.setScalar(scale);
    }
  }

  function flashGate(gate) {
    if (gate && gate.gate) gate.flash = 1;
  }

  function dispose() {
    disposeObject(group);
    roadMat.map?.dispose();
    curbMat.map?.dispose();
    checkerMat.map?.dispose();
    padMat.map?.dispose();
  }

  return {
    circuit,
    curve,
    samples,
    gates,
    pads,
    length,
    halfWidth,
    curbOuter,
    wallOffset,
    group,
    start: samples[0],
    startGrid: gridSlot(0),
    gridSlot,
    nearest,
    sampleAt,
    distanceToTrack,
    update,
    flashGate,
    dispose,
  };
}
