// Achievements: long-term goals that pay credits once. Most are read from
// the save (stats, garage, career); a few depend on how a race was run and
// are checked with the race context passed to `earnedNow`.

import { CARS } from './data/cars.js';
import { CAREER_EVENTS, CAREER_SERIES } from './data/career.js';
import { UPGRADE_PARTS, MAX_UPGRADE_LEVEL, normalizeUpgrades } from './data/upgrades.js';
import { seriesStandings } from './championship.js';

const wonRace = (ctx) => ctx.position === 1 && ctx.mode !== 'time-trial' && ctx.mode !== 'practice';

export const ACHIEVEMENTS = [
  { id: 'first-race', name: 'LIGHTS OUT', desc: 'Finish your first race.', reward: 500,
    check: (d) => d.stats.races >= 1 },
  { id: 'first-win', name: 'TOP STEP', desc: 'Win a race.', reward: 1000,
    check: (d) => d.stats.wins >= 1 },
  { id: 'ten-wins', name: 'SERIAL WINNER', desc: 'Win 10 races.', reward: 4000,
    check: (d) => d.stats.wins >= 10 },
  { id: 'podiums', name: 'CHAMPAGNE HABIT', desc: 'Finish on the podium 25 times.', reward: 3000,
    check: (d) => d.stats.podiums >= 25 },
  { id: 'laps-100', name: 'MILEAGE', desc: 'Complete 100 laps.', reward: 2000,
    check: (d) => d.stats.laps >= 100 },
  { id: 'drift-10k', name: 'SIDEWAYS', desc: 'Score 10,000 drift points in total.', reward: 1500,
    check: (d) => d.stats.driftScore >= 10000 },
  { id: 'drift-100k', name: 'TYRE SMOKE', desc: 'Score 100,000 drift points in total.', reward: 5000,
    check: (d) => d.stats.driftScore >= 100000 },
  { id: 'garage-5', name: 'COLLECTOR', desc: 'Own five cars.', reward: 2500,
    check: (d) => d.ownedCars.length >= 5 },
  { id: 'garage-all', name: 'FULL HOUSE', desc: 'Own every car in the catalogue.', reward: 25000,
    check: (d) => CARS.every((c) => d.ownedCars.includes(c.id)) },
  { id: 'hypercar', name: 'BIG LEAGUE', desc: 'Buy a hypercar.', reward: 5000,
    check: (d) => CARS.some((c) => c.category === 'hyper' && d.ownedCars.includes(c.id)) },
  { id: 'tuned', name: 'FIRST MOD', desc: 'Install any upgrade.', reward: 500,
    check: (d) => Object.values(d.upgrades || {}).some((u) => UPGRADE_PARTS.some((p) => normalizeUpgrades(u)[p.id] > 0)) },
  { id: 'fully-built', name: 'FULLY BUILT', desc: 'Max out every part on one car.', reward: 4000,
    check: (d) => Object.values(d.upgrades || {}).some((u) => UPGRADE_PARTS.every((p) => normalizeUpgrades(u)[p.id] >= MAX_UPGRADE_LEVEL)) },
  { id: 'daily-gold', name: 'GOLD STANDARD', desc: 'Earn gold in a daily challenge.', reward: 2000,
    check: (d) => d.daily?.tier === 2 },
  { id: 'series-gold', name: 'CHAMPION', desc: 'Win a career series and take its gold trophy.', reward: 6000,
    check: (d) => CAREER_SERIES.some((s) => seriesStandings(s.id, d.career.bestPositions).trophy === 'gold') },
  { id: 'career-done', name: 'LEGEND', desc: 'Clear every career event.', reward: 15000,
    check: (d) => CAREER_EVENTS.every((e) => d.career.completed.includes(e.id)) },
  { id: 'night-win', name: 'NIGHT OWL', desc: 'Win a race at night.', reward: 1500,
    check: (d, ctx) => wonRace(ctx) && ctx.conditions?.time === 'night' },
  { id: 'rain-win', name: 'RAIN MASTER', desc: 'Win a race in the rain.', reward: 2000,
    check: (d, ctx) => wonRace(ctx) && ctx.conditions?.weather === 'rain' },
  { id: 'full-grid', name: 'FROM THE BACK', desc: 'Win against a full grid of seven rivals.', reward: 3000,
    check: (d, ctx) => wonRace(ctx) && ctx.totalRacers >= 8 },
  { id: 'photographer', name: 'SHUTTERBUG', desc: 'Save a photo in photo mode.', reward: 300,
    check: (d, ctx) => !!ctx.photo },
];

/** Achievements newly earned given the save data and an optional context. */
export function earnedNow(data, ctx = {}) {
  const have = new Set(data.achievements || []);
  return ACHIEVEMENTS.filter((a) => !have.has(a.id) && a.check(data, ctx));
}
