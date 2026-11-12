// Ranked online racing: a multiplayer Elo. Every finished online race is
// scored as head-to-head results between each pair of drivers (higher
// finishing position wins the pair), averaged so a six-car race moves a
// rating about as much as a one-on-one.

export const START_RATING = 1000;
const K = 32;

export const DIVISIONS = [
  { id: 'bronze', name: 'BRONZE', min: 0 },
  { id: 'silver', name: 'SILVER', min: 1100 },
  { id: 'gold', name: 'GOLD', min: 1250 },
  { id: 'platinum', name: 'PLATINUM', min: 1400 },
  { id: 'diamond', name: 'DIAMOND', min: 1600 },
  { id: 'champion', name: 'CHAMPION', min: 1800 },
];

export function divisionFor(rating) {
  let d = DIVISIONS[0];
  for (const div of DIVISIONS) if (rating >= div.min) d = div;
  return d;
}

/**
 * New ratings for drivers in finishing order (index 0 won).
 * @param {number[]} ratings current ratings, in finishing order
 * @returns {number[]} rounded new ratings, same order
 */
export function rateRace(ratings) {
  const n = ratings.length;
  if (n < 2) return ratings.map((r) => Math.round(r));
  return ratings.map((r, i) => {
    let delta = 0;
    for (let j = 0; j < n; j++) {
      if (i === j) continue;
      const expected = 1 / (1 + 10 ** ((ratings[j] - r) / 400));
      const score = i < j ? 1 : 0;
      delta += score - expected;
    }
    return Math.round(r + (K * delta) / (n - 1));
  });
}

/** Soft reset between seasons: halfway back to the start rating. */
export const seasonReset = (rating) => Math.round(START_RATING + (rating - START_RATING) / 2);
