// One definition of the downtown street grid. Scenery paints it, CityWorld
// drives on it and the HUD draws it. A single source of truth keeps the roads
// you can see in step with the roads the car (and the minimap) believe exist.

export const STREET_SPACING = 96;
export const BOULEVARD_EVERY = 3;
export const MINOR_WIDTH = 13;
export const BOULEVARD_WIDTH = 24;
export const CITY_EXTENT = 1152;

const isBoulevard = (k) => k % BOULEVARD_EVERY === 0;
const widthFor = (k) => (isBoulevard(k) ? BOULEVARD_WIDTH : MINOR_WIDTH);

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
