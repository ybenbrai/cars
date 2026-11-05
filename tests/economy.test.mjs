import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  DIFFICULTIES,
  MODES,
  basePurse,
  computeRewards,
  getDifficulty,
  getMode,
  nextRankProgress,
  positionLabel,
} from '../js/economy.js';
import { CIRCUITS, getCircuit } from '../js/data/circuits.js';
import { CAREER_EVENTS, CAREER_SERIES, getCareerEvent } from '../js/data/career.js';

const circuit = getCircuit('sunset-coast');

test('four difficulties and four modes are available', () => {
  assert.deepEqual(DIFFICULTIES.map((d) => d.id), ['easy', 'normal', 'hard', 'expert']);
  assert.deepEqual(MODES.map((m) => m.id), ['career', 'quick', 'time-trial', 'practice']);
  assert.equal(getDifficulty('missing').id, 'normal');
  assert.equal(getMode('missing').id, 'quick');
});

test('circuits have distinct layouts, palettes and unlock ranks', () => {
  assert.ok(CIRCUITS.length >= 6, `expected six circuits, got ${CIRCUITS.length}`);
  assert.equal(new Set(CIRCUITS.map((c) => c.id)).size, CIRCUITS.length);
  assert.equal(new Set(CIRCUITS.map((c) => c.cp.length)).size > 1, true);
  for (const track of CIRCUITS) {
    assert.ok(track.cp.length >= 20, `${track.id} needs a real layout`);
    assert.ok(track.lengthKm > 0.4, `${track.id} is too short`);
    assert.ok(track.palette && track.palette.skyTop);
    assert.ok(Number.isInteger(track.unlockRank));
    assert.ok(track.laps >= 1);
  }
  assert.equal(getCircuit('nope').id, CIRCUITS[0].id);
});

test('career ladder is ordered and complete', () => {
  assert.ok(CAREER_SERIES.length >= 4);
  assert.ok(CAREER_EVENTS.length >= 8);
  assert.equal(new Set(CAREER_EVENTS.map((e) => e.id)).size, CAREER_EVENTS.length);
  for (const event of CAREER_EVENTS) {
    assert.ok(CAREER_SERIES.some((series) => series.id === event.series), event.id);
    assert.ok(CIRCUITS.some((track) => track.id === event.circuitId), event.id);
    assert.ok(event.laps >= 1 && event.opponents >= 1);
    assert.ok(event.targetPosition >= 1 && event.targetPosition <= event.opponents + 1);
    assert.ok(event.reward > 0);
    assert.ok(DIFFICULTIES.some((d) => d.id === event.difficulty), event.id);
  }
  assert.equal(getCareerEvent('missing'), null);
});

test('rewards scale with position, laps and difficulty', () => {
  const common = { mode: 'quick', circuit, laps: 3, totalRacers: 6, difficulty: 'normal' };
  const first = computeRewards({ ...common, position: 1 });
  const third = computeRewards({ ...common, position: 3 });
  const last = computeRewards({ ...common, position: 6 });
  assert.ok(first.total > third.total);
  assert.ok(third.total > last.total);
  assert.ok(first.lines.some((line) => line.label === 'Winner bonus'));

  const easy = computeRewards({ ...common, position: 1, difficulty: 'easy' });
  const expert = computeRewards({ ...common, position: 1, difficulty: 'expert' });
  assert.ok(expert.total > first.total);
  assert.ok(first.total > easy.total);

  const short = computeRewards({ ...common, position: 1, laps: 2 });
  const long = computeRewards({ ...common, position: 1, laps: 5 });
  assert.ok(long.total > short.total);
});

test('career purse only pays when the event objective is met', () => {
  const event = CAREER_EVENTS[0];
  const missed = computeRewards({
    mode: 'career', circuit, laps: event.laps, difficulty: event.difficulty,
    position: event.targetPosition + 1, totalRacers: event.opponents + 1,
    eventCleared: false, eventReward: event.reward, firstClear: false,
  });
  assert.ok(!missed.lines.some((line) => line.label.includes('Career')));

  const cleared = computeRewards({
    mode: 'career', circuit, laps: event.laps, difficulty: event.difficulty,
    position: event.targetPosition, totalRacers: event.opponents + 1,
    eventCleared: true, firstClear: true, eventReward: event.reward, firstWinBonus: event.firstWinBonus,
  });
  assert.ok(cleared.lines.some((line) => line.label === 'Career event reward'));

  const replay = computeRewards({
    mode: 'career', circuit, laps: event.laps, difficulty: event.difficulty,
    position: event.targetPosition, totalRacers: event.opponents + 1,
    eventCleared: true, firstClear: false, eventReward: event.reward,
  });
  assert.ok(replay.lines.some((line) => line.label === 'Career replay reward'));
  const eventLine = replay.lines.find((line) => line.label === 'Career replay reward');
  assert.equal(eventLine.value, Math.round(event.reward * 0.3));
});

test('time trial and practice pay out differently', () => {
  const trial = computeRewards({ mode: 'time-trial', circuit, laps: 3 });
  assert.ok(trial.total > 0);
  assert.equal(trial.position, null);

  const practice = computeRewards({ mode: 'practice', circuit, laps: Infinity, driftScore: 4000 });
  assert.ok(practice.total > 0);
  assert.ok(practice.total <= 2200);

  const noDrift = computeRewards({ mode: 'practice', driftScore: 0 });
  assert.equal(noDrift.total, 0);
});

test('records and drift add visible bonus lines', () => {
  const result = computeRewards({
    mode: 'quick', circuit, laps: 3, position: 2, totalRacers: 5,
    driftScore: 3000, newLapRecord: true,
  });
  assert.ok(result.lines.some((line) => line.label === 'Drift style bonus'));
  assert.ok(result.lines.some((line) => line.label === 'New circuit lap record'));
  assert.ok(basePurse({ mode: 'quick', circuit, laps: 3 }) > 0);
  assert.equal(positionLabel(2, 5), 'P2/5');
  assert.equal(positionLabel(null, 5), '—');
});

test('rank progress walks toward the next tier', () => {
  const start = nextRankProgress({ wins: 0, races: 0 });
  assert.equal(start.progress, 0);
  assert.ok(start.next > 0);
  const maxed = nextRankProgress({ wins: 40, races: 10 });
  assert.equal(maxed.next, null);
  assert.equal(maxed.progress, 1);
});
