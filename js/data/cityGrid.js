// One definition of the downtown street grid. Scenery paints it, CityWorld
// drives on it and the HUD draws it. A single source of truth keeps the roads
// you can see in step with the roads the car (and the minimap) believe exist.

export const STREET_SPACING = 96;
export const BOULEVARD_EVERY = 3;
export const MINOR_WIDTH = 13;
export const BOULEVARD_WIDTH = 24;
export const SIDEWALK_WIDTH = 4;
export const CITY_EXTENT = 1152;

const isBoulevard = (k) => k % BOULEVARD_EVERY === 0;
const widthFor = (k) => (isBoulevard(k) ? BOULEVARD_WIDTH : MINOR_WIDTH);

/** Is this painted street line a wide boulevard? */
export function isBoulevardLine(pos) {
  return isBoulevard(Math.round(pos / STREET_SPACING));
}

/** The two sidewalk centre lines on either side of a street. */
export function sidewalkCenters(street) {
  const offset = street.width / 2 + SIDEWALK_WIDTH / 2;
  return [street.pos - offset, street.pos + offset];
}

/** Road width of the street crossing at a junction on this coordinate. */
export function roadWidthAt(pos) {
  return isBoulevardLine(pos) ? BOULEVARD_WIDTH : MINOR_WIDTH;
}

/** Coordinate of the next grid junction ahead along a travel axis. */
export function nextJunction(pos, dir, spacing = STREET_SPACING) {
  const k = dir > 0 ? Math.floor(pos / spacing) + 1 : Math.ceil(pos / spacing) - 1;
  return k * spacing;
}

/**
 * Signal phase set for traffic or walkers travelling along `axis` at a
 * junction. Perpendicular directions get opposite sets, so cross traffic never
 * has green at the same time.
 */
export function signalGroup(axis, junctionPos) {
  const k = Math.round(junctionPos / STREET_SPACING);
  return ((k + (axis === 0 ? 0 : 1)) % 2 + 2) % 2;
}

/** Which way a car turns when it swaps travel axis: +1 right, -1 left. */
export function turnDirection(fromAxis, fromDir, toAxis, toDir) {
  const fx = fromAxis === 0 ? fromDir : 0;
  const fz = fromAxis === 1 ? fromDir : 0;
  const tx = toAxis === 0 ? toDir : 0;
  const tz = toAxis === 1 ? toDir : 0;
  return fx * tz - fz * tx > 0 ? 1 : -1;
}

/**
 * Build the grid for a given half-size. Lines sit on multiples of
 * STREET_SPACING; every third one is a wide boulevard. The same numbers are
 * used for the painted asphalt, the lane markings, traffic and the minimap.
 */
export function createCityGrid(extent = CITY_EXTENT) {
  const maxK = Math.floor(extent / STREET_SPACING);
  const vertical = [];
  const horizontal = [];
  for (let k = -maxK; k <= maxK; k++) {
    const pos = k * STREET_SPACING;
    const boulevard = isBoulevard(k);
    const width = widthFor(k);
    vertical.push({ axis: 0, pos, k, width, boulevard });
    horizontal.push({ axis: 1, pos, k, width, boulevard });
  }
  return {
    extent,
    spacing: STREET_SPACING,
    vertical,
    horizontal,
    streets: vertical.concat(horizontal),
    boulevardLines: vertical.filter((s) => s.boulevard).map((s) => s.pos),
  };
}

export const CITY_GRID = createCityGrid();

/**
 * A canal running east-west through downtown, in the block of open land
 * between the minor street at 192 m and the boulevard at 288 m. Keeping the
 * water between street lines means no road is painted underwater; the north-
 * south streets simply become bridge decks where they cross it.
 */
export function createRiver(grid = CITY_GRID) {
  return {
    axis: 1,
    pos: grid.spacing * 2.5,
    halfWidth: 26,
    min: grid.spacing * 2.5 - 26,
    max: grid.spacing * 2.5 + 26,
  };
}

/** North-south street crossings that need a bridge deck over the canal. */
export function bridgeCrossings(grid = CITY_GRID, river = createRiver(grid)) {
  return grid.vertical
    .filter((s) => Math.abs(s.pos) <= grid.extent)
    .map((s) => ({
      pos: s.pos,
      width: s.width,
      halfLength: river.halfWidth + 8,
      boulevard: s.boulevard,
    }));
}

// Small deterministic hash so the generated skyline is stable between reloads
// and can be asserted in tests without seeding a global random generator.
function hash01(...parts) {
  let h = 2166136261;
  for (const part of parts) h = Math.imul(h ^ (part + 0x9e3779b9), 16777619);
  h ^= h >>> 15; h = Math.imul(h, 2246822507);
  h ^= h >>> 13; h = Math.imul(h, 3266489909);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/**
 * Building parcels for the dense roam city. Every block between two street
 * lines is subdivided into lots, with parks and towers mixed into the rows.
 * Each lot stays clear of the painted road and sidewalk on all four sides.
 */
export function cityLots(grid = CITY_GRID, river = createRiver(grid)) {
  const lots = [];
  for (let vi = 0; vi < grid.vertical.length - 1; vi++) {
    const v0 = grid.vertical[vi];
    const v1 = grid.vertical[vi + 1];
    for (let hi = 0; hi < grid.horizontal.length - 1; hi++) {
      const h0 = grid.horizontal[hi];
      const h1 = grid.horizontal[hi + 1];
      // Leave the canal and both banks open water.
      if (h0.pos < river.max && h1.pos > river.min) continue;
      const minX = v0.pos + v0.width / 2 + SIDEWALK_WIDTH + 2;
      const maxX = v1.pos - v1.width / 2 - SIDEWALK_WIDTH - 2;
      const minZ = h0.pos + h0.width / 2 + SIDEWALK_WIDTH + 2;
      const maxZ = h1.pos - h1.width / 2 - SIDEWALK_WIDTH - 2;
      if (maxX - minX < 14 || maxZ - minZ < 14) continue;

      const roll = hash01(vi, hi, 0);
      if (roll < 0.08) {
        lots.push({
          park: true, x: (minX + maxX) / 2, z: (minZ + maxZ) / 2,
          w: maxX - minX, d: maxZ - minZ,
        });
        continue;
      }

      const tall = roll > 0.86;
      let nx = tall ? (hash01(vi, hi, 1) > 0.6 ? 2 : 1) : (hash01(vi, hi, 1) > 0.45 ? 3 : 2);
      let nz = tall ? 1 : (hash01(vi, hi, 2) > 0.45 ? 3 : 2);
      if (nx === 3 && nz === 3) nz = 2; // cap at six parcels per block
      const cw = (maxX - minX) / nx;
      const cd = (maxZ - minZ) / nz;
      for (let ix = 0; ix < nx; ix++) {
        for (let iz = 0; iz < nz; iz++) {
          const w = cw * (0.58 + hash01(vi, hi, ix + 23, iz + 17) * 0.3);
          const d = cd * (0.6 + hash01(vi, hi, ix + 33, iz + 27) * 0.3);
          const x = minX + cw * (ix + 0.5)
            + (hash01(vi, hi, ix + 3, iz + 3) - 0.5) * cw * 0.08;
          const z = minZ + cd * (iz + 0.5)
            + (hash01(vi, hi, ix + 13, iz + 7) - 0.5) * cd * 0.08;
          const kindRoll = hash01(vi, hi, ix + 43, iz + 37);
          const kind = tall ? 'tower' : kindRoll < 0.28 ? 'low' : kindRoll > 0.94 ? 'tower' : 'mid';
          const heightRoll = hash01(vi, hi, ix + 53, iz + 47);
          const h = kind === 'tower' ? 58 + heightRoll * 92
            : kind === 'low' ? 5 + heightRoll * 9
              : 16 + heightRoll * 40;
          lots.push({
            x, z, w, d, h, kind,
            color: Math.floor(hash01(vi, hi, ix + 63, iz + 57) * 5),
            ry: hash01(vi, hi, ix + 73, iz + 67) > 0.5 ? 0 : Math.PI / 2,
          });
        }
      }
    }
  }
  return lots;
}

/**
 * Nearest painted road to a world position. We compare distance to the road
 * *edge* rather than its centre, so a wide boulevard can win over a closer
 * minor street when its shoulder is actually nearer to the car.
 */
export function nearestRoad(x, z, grid = CITY_GRID) {
  const maxK = Math.floor(grid.extent / grid.spacing);
  let best = null;
  for (const axis of [0, 1]) {
    const coord = axis === 0 ? x : z;
    const centre = Math.round(coord / grid.spacing);
    for (let k = centre - 1; k <= centre + 1; k++) {
      if (k < -maxK || k > maxK) continue;
      const pos = k * grid.spacing;
      const dist = Math.abs(coord - pos);
      const boulevard = isBoulevard(k);
      const halfWidth = widthFor(k) / 2;
      const edge = Math.max(0, dist - halfWidth);
      if (best && edge >= best.edge) continue;
      best = {
        axis,
        k,
        pos,
        dist,
        edge,
        halfWidth,
        boulevard,
        x: axis === 0 ? pos : x,
        z: axis === 1 ? pos : z,
        tx: axis === 0 ? 0 : 1,
        tz: axis === 0 ? 1 : 0,
      };
    }
  }
  return best;
}
