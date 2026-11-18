import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import {
  CITY_GRID,
  SIDEWALK_WIDTH,
  bridgeCrossings,
  cityLots,
  createRiver,
} from './data/cityGrid.js';

// The dense roam-only downtown. Everything here is instanced so a skyline of
// a few thousand buildings, a canal and its bridges still costs a handful of
// draw calls on a phone. The street grid itself is painted by scenery.js; this
// module fills the blocks and adds the green and blue infrastructure.

function colorize(geo, hex) {
  const c = new THREE.Color(hex);
  const count = geo.attributes.position.count;
  const arr = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const shade = 0.85 + Math.random() * 0.25;
    arr[i * 3] = c.r * shade;
    arr[i * 3 + 1] = c.g * shade;
    arr[i * 3 + 2] = c.b * shade;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return geo;
}

function broadleafGeometry() {
  const parts = [];
  const trunk = new THREE.CylinderGeometry(0.14, 0.24, 2.4, 6);
  trunk.translate(0, 1.2, 0);
  parts.push(colorize(trunk, '#5a4030'));
  for (const [x, y, z, r, hex] of [
    [0, 3.6, 0, 1.7, '#4f7a3a'], [0.85, 3.0, 0.2, 1.2, '#5d8a43'], [-0.8, 3.2, -0.3, 1.25, '#476f35'],
  ]) {
    const crown = new THREE.SphereGeometry(r, 7, 5);
    crown.translate(x, y, z);
    parts.push(colorize(crown, hex));
  }
  return mergeGeometries(parts, false);
}

function palmGeometry() {
  const parts = [];
  const trunk = new THREE.CylinderGeometry(0.12, 0.28, 5.2, 6, 3);
  trunk.translate(0, 2.6, 0);
  const p = trunk.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i);
    p.setX(i, p.getX(i) + (y / 5.2) ** 2 * 0.7);
  }
  trunk.computeVertexNormals();
  parts.push(colorize(trunk, '#6d4a2f'));
  for (let i = 0; i < 7; i++) {
    const leaf = new THREE.ConeGeometry(0.45, 2.8, 4, 1);
    leaf.rotateZ(-Math.PI / 2);
    leaf.translate(1.3, 0, 0);
    leaf.rotateZ(-0.25 - Math.random() * 0.15);
    leaf.rotateY((i / 7) * Math.PI * 2);
    leaf.translate(0.75, 5.1, 0);
    parts.push(colorize(leaf, i % 2 ? '#4c7a3a' : '#5f8f43'));
  }
  return mergeGeometries(parts, false);
}

function facadeTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#12121c';
  ctx.fillRect(0, 0, 128, 256);
  for (let y = 8; y < 248; y += 18) {
    for (let x = 8; x < 120; x += 16) {
      const lit = Math.random();
      ctx.fillStyle = lit > 0.5
        ? `hsla(${30 + Math.random() * 20},90%,60%,${0.5 + Math.random() * 0.5})`
        : `rgba(34,40,58,${0.5 + Math.random() * 0.4})`;
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

/** Instance a list of { x, z, sx, sy, sz, ry, color } descriptors. */
function placer(group, dummy) {
  const tint = new THREE.Color();
  return (geo, mat, items, map, colors = null) => {
    if (!items.length) return null;
    const mesh = new THREE.InstancedMesh(geo, mat, items.length);
    items.forEach((item, i) => {
      const p = map(item);
      dummy.position.set(p.x, p.y ?? 0, p.z);
      dummy.rotation.set(0, p.ry ?? 0, 0);
      dummy.scale.set(p.sx ?? 1, p.sy ?? 1, p.sz ?? 1);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      if (colors) mesh.setColorAt(i, tint.set(colors[p.color ?? (i % colors.length)]));
    });
    mesh.count = items.length;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    return mesh;
  };
}

/**
 * Fill the painted grid with a real city: dense block development, street
 * trees, a canal with bridges, and lighting along every street. `addCollider`
 * is supplied by scenery.js so CityWorld gets solid footprints for free.
 */
export function buildDowntown({ group, grid = CITY_GRID, addCollider }) {
  const river = createRiver(grid);
  const dummy = new THREE.Object3D();
  const place = placer(group, dummy);
  const lots = cityLots(grid, river);

  // ── buildings
  const towers = [];
  const mids = [];
  const lows = [];
  for (const lot of lots) {
    if (lot.park) continue;
    addCollider(lot.x, lot.z, lot.w, lot.d);
    (lot.kind === 'tower' ? towers : lot.kind === 'low' ? lows : mids).push(lot);
  }
  const box = new THREE.BoxGeometry(1, 1, 1);
  const tex = facadeTexture();
  const windowMat = new THREE.MeshStandardMaterial({
    map: tex, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.55,
    roughness: 0.72, metalness: 0.25, color: 0xffffff,
  });
  const solidMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85, metalness: 0.08 });
  const facadeColors = [0x8a8fa8, 0x99a0b8, 0x7f8498, 0xa0a6bd, 0x8d8577];
  const lowColors = [0x9d8f80, 0x847c88, 0x6e7484, 0x94897b, 0x74806d];
  const footprint = (b) => ({ x: b.x, y: b.h / 2, z: b.z, ry: b.ry, sx: b.w, sy: b.h, sz: b.d });
  place(box, windowMat, towers.concat(mids), footprint, facadeColors);
  place(box, solidMat, lows, footprint, lowColors);

  // A bucket map keeps the tree/lamp placement away from building walls.
  const cell = 48;
  const buckets = new Map();
  for (const lot of lots) {
    if (lot.park) continue;
    const key = `${Math.floor(lot.x / cell)},${Math.floor(lot.z / cell)}`;
    let bucket = buckets.get(key);
    if (!bucket) buckets.set(key, bucket = []);
    bucket.push(lot);
  }
  const nearBuilding = (x, z, margin) => {
    const cx = Math.floor(x / cell);
    const cz = Math.floor(z / cell);
    for (let ix = cx - 1; ix <= cx + 1; ix++) {
      for (let iz = cz - 1; iz <= cz + 1; iz++) {
        for (const lot of buckets.get(`${ix},${iz}`) || []) {
          const min = Math.max(lot.w, lot.d) * 0.5 + margin;
          if ((x - lot.x) ** 2 + (z - lot.z) ** 2 < min * min) return true;
        }
      }
    }
    return false;
  };

  // ── street trees on the outer edge of every sidewalk
  const trees = [];
  const palms = [];
  for (const street of grid.streets) {
    const offset = street.width / 2 + SIDEWALK_WIDTH * 0.55;
    for (const side of [-1, 1]) {
      for (let d = -grid.extent + 48; d <= grid.extent - 48; d += 64) {
        // Keep the junctions, canal banks and building walls clear.
        if (Math.abs(d - Math.round(d / grid.spacing) * grid.spacing) < 16) continue;
        const x = street.axis === 0 ? street.pos + side * offset : d;
        const z = street.axis === 1 ? street.pos + side * offset : d;
        if (Math.abs(z - river.pos) < river.halfWidth + 8) continue;
        if (nearBuilding(x, z, 2.5)) continue;
        const tree = { x, z, s: 0.8 + Math.random() * 0.55 };
        // Palms line the boulevards, broadleaves the back streets.
        (street.boulevard ? palms : trees).push(tree);
      }
    }
  }
  const leafMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, flatShading: true });
  const treeScale = (t) => ({ x: t.x, z: t.z, sx: t.s, sy: t.s, sz: t.s });
  place(broadleafGeometry(), leafMat, trees, treeScale);
  place(palmGeometry(), leafMat, palms, treeScale);

  // ── canal water and the bridges that carry the north-south streets over it
  const water = new THREE.Mesh(
    new THREE.PlaneGeometry(grid.extent * 2 + 240, river.halfWidth * 2),
    new THREE.MeshStandardMaterial({
      color: 0x2b6480, transparent: true, opacity: 0.88, roughness: 0.25,
      metalness: 0.18, depthWrite: false, envMapIntensity: 1.4,
    }),
  );
  water.rotation.x = -Math.PI / 2;
  water.position.set(0, -0.012, river.pos);
  water.receiveShadow = true;
  group.add(water);

  const crossings = bridgeCrossings(grid, river);
  const deckMat = new THREE.MeshStandardMaterial({ color: 0x6d7079, roughness: 0.9 });
  const parapetMat = new THREE.MeshStandardMaterial({ color: 0x9aa0ac, roughness: 0.8 });
  place(box, deckMat, crossings, (c) => ({
    x: c.pos, y: -0.06, z: river.pos,
    sx: c.width + SIDEWALK_WIDTH * 2, sy: 0.12, sz: c.halfLength * 2,
  }));
  const rails = [];
  for (const c of crossings) {
    for (const sign of [-1, 1]) {
      rails.push({ pos: c.pos + sign * (c.width / 2 + SIDEWALK_WIDTH - 0.5) });
    }
  }
  place(box, parapetMat, rails, (r) => ({
    x: r.pos, y: 0.5, z: river.pos, sx: 0.32, sy: 1.0, sz: river.halfLength * 2,
  }));

  // ── street lighting down both sides of the streets, clear of the canal
  const lampSpots = [];
  for (const street of grid.streets) {
    const offset = street.width / 2 + SIDEWALK_WIDTH - 1.2;
    for (let d = -grid.extent + 24; d < grid.extent - 24; d += 96) {
      if (Math.abs(d - Math.round(d / grid.spacing) * grid.spacing) < 14) continue;
      const side = (Math.floor((d + grid.extent) / 96) % 2) ? 1 : -1;
      const x = street.axis === 0 ? street.pos + side * offset : d;
      const z = street.axis === 1 ? street.pos + side * offset : d;
      if (Math.abs(z - river.pos) < river.halfWidth + 8) continue;
      lampSpots.push({ x, z });
    }
  }
  const poleGeo = new THREE.CylinderGeometry(0.11, 0.17, 7.6, 6);
  poleGeo.translate(0, 3.8, 0);
  const poleMat = new THREE.MeshStandardMaterial({ color: 0x2a2a34, metalness: 0.6, roughness: 0.5 });
  const headMat = new THREE.MeshStandardMaterial({
    color: 0xffe6b0, emissive: 0xffc46b, emissiveIntensity: 2.2, roughness: 0.5,
  });
  const spotAt = (p) => ({ x: p.x, z: p.z });
  place(poleGeo, poleMat, lampSpots, spotAt);
  place(new THREE.BoxGeometry(1.25, 0.18, 0.42), headMat, lampSpots, (p) => ({ x: p.x, y: 7.55, z: p.z }));

  return {
    lots: lots.length,
    bridges: crossings.length,
    trees: trees.length + palms.length,
    lamps: lampSpots.length,
    river,
  };
}
