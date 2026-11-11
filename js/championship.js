// Championship standings for each career series. Points come from your best
// finish in every event you have raced (no extra save data), against three
// named rivals per series whose results are fixed per event, so the table
// is stable between visits and only moves when you race.

import { CAREER_EVENTS } from './data/career.js';

export const POINTS = [25, 18, 15, 12, 10, 8, 6, 4];

export const RIVALS = {
  rookie: [
    { name: 'J. OKAFOR', skill: 0.35 },
    { name: 'M. LINDQVIST', skill: 0.5 },
    { name: 'R. TAVARES', skill: 0.65 },
  ],
  club: [
    { name: 'S. NAKAMURA', skill: 0.45 },
    { name: 'E. MOREAU', skill: 0.6 },
    { name: 'D. KOVAC', skill: 0.72 },
  ],
  pro: [
    { name: 'A. VARGAS', skill: 0.55 },
    { name: 'H. BRANDT', skill: 0.68 },
    { name: 'K. ADEYEMI', skill: 0.8 },
  ],
  elite: [
    { name: 'L. FONTAINE', skill: 0.7 },
    { name: 'Y. ISHIKAWA', skill: 0.8 },
    { name: 'C. MERCER', skill: 0.9 },
  ],
};

export const pointsFor = (position) => (position >= 1 && position <= POINTS.length ? POINTS[position - 1] : 0);

// Small deterministic hash -> [0, 1).
function hash01(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 100000) / 100000;
}

/**
 * Rival finishing positions for one event, never sharing a position with
 * the player or each other. Stronger rivals tend to take better places.
 */
export function rivalPositions(seriesId, event, playerPosition) {
  const field = (event.opponents || 3) + 1;
  const free = [];
  for (let p = 1; p <= field; p++) if (p !== playerPosition) free.push(p);
  const rivals = RIVALS[seriesId] || [];
  const order = rivals
    .map((rival, i) => ({ i, score: rival.skill + hash01(`${event.id}:${rival.name}`) * 0.6 }))
    .sort((a, b) => b.score - a.score);
  const out = new Array(rivals.length).fill(0);
  for (const { i } of order) {
    if (!free.length) break;
    // Best remaining place, sometimes one further back for variety.
    const slip = hash01(`${event.id}:slip:${rivals[i].name}`) < 0.3 && free.length > 1 ? 1 : 0;
    out[i] = free.splice(slip, 1)[0];
  }
  return out;
}

/** Standings table, your points and trophy for a series. */
export function seriesStandings(seriesId, bestPositions = {}, playerName = 'YOU') {
  const events = CAREER_EVENTS.filter((e) => e.series === seriesId);
  const raced = events.filter((e) => Number.isFinite(bestPositions[e.id]));
  const rivals = RIVALS[seriesId] || [];
  const rows = [
    { name: playerName, player: true, points: 0 },
    ...rivals.map((r) => ({ name: r.name, player: false, points: 0 })),
  ];
  for (const event of raced) {
    const pos = bestPositions[event.id];
    rows[0].points += pointsFor(pos);
    rivalPositions(seriesId, event, pos).forEach((p, i) => { rows[i + 1].points += pointsFor(p); });
  }
  // Ties go to the player (they beat the rivals on countback in a game).
  rows.sort((a, b) => b.points - a.points || (b.player ? 1 : 0) - (a.player ? 1 : 0));
  const rank = rows.findIndex((r) => r.player) + 1;
  const complete = raced.length === events.length && events.length > 0;
  const trophy = complete ? (['gold', 'silver', 'bronze'][rank - 1] || null) : null;
  return {
    rows, rank, trophy, complete, raced: raced.length, total: events.length,
    maxPoints: events.length * POINTS[0],
  };
}
