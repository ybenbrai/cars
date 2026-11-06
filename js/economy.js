// Difficulty, rewards and progression math. Kept separate from UI so the
// balance can be tuned in one place.

export const DIFFICULTIES = [
  { id: 'easy', label: 'Easy', blurb: 'Relaxed opponents. Learn the circuit.', pace: 0.76, steer: 0.9, mistakes: 0.22, reward: 0.82, color: '#8dffb0' },
  { id: 'normal', label: 'Normal', blurb: 'A fair fight. Mistakes cost positions.', pace: 0.88, steer: 1.0, mistakes: 0.12, reward: 1.0, color: '#5ce1e6' },
  { id: 'hard', label: 'Hard', blurb: 'They brake late and defend hard.', pace: 0.96, steer: 1.08, mistakes: 0.05, reward: 1.2, color: '#ffc46b' },
  { id: 'expert', label: 'Expert', blurb: 'Your car, driven at the limit. No gifts.', pace: 1.0, steer: 1.14, mistakes: 0.015, reward: 1.45, color: '#ff3d7f' },
];

export const MODES = [
  {
    id: 'career', label: 'CAREER', short: 'Build a legacy',
    blurb: 'Nine events across four series. Earn credits, unlock circuits and climb from Rookie to Legend.',
  },
  {
    id: 'quick', label: 'QUICK RACE', short: 'Pick a fight',
    blurb: 'Choose any owned car, any unlocked circuit and up to seven AI opponents.',
  },
  {
    id: 'time-trial', label: 'TIME TRIAL', short: 'Beat the clock',
    blurb: 'Empty track. Three laps. Every circuit keeps its own lap record.',
  },
  {
    id: 'practice', label: 'PRACTICE', short: 'Free drive',
    blurb: 'No opponents, no timer, no pressure. Learn the lines and stack drift score.',
  },
];

export function getDifficulty(id) {
  return DIFFICULTIES.find((d) => d.id === id) || DIFFICULTIES[1];
}

export function getMode(id) {
  return MODES.find((m) => m.id === id) || MODES[1];
}

const POSITION_FACTOR = [1.85, 1.3, 0.98, 0.76, 0.58, 0.44, 0.34, 0.26];

export function basePurse({ mode, circuit, laps }) {
  const km = circuit?.lengthKm || 0.6;
  if (mode === 'time-trial') return Math.round(480 + km * 320 + laps * 75);
  if (mode === 'practice') return 0;
  return Math.round(720 + km * 460 + laps * 150);
}

/**
 * Returns a full reward breakdown so the results screen can show exactly where
 * every credit came from.
 */
export function computeRewards({
  mode = 'quick',
  circuit,
  laps = 3,
  difficulty = 'normal',
  position = 1,
  totalRacers = 1,
  driftScore = 0,
  newLapRecord = false,
  firstClear = false,
  eventCleared = false,
  eventReward = 0,
  firstWinBonus = 0,
}) {
  const diff = getDifficulty(difficulty);
  const lines = [];
  let total = 0;

  if (mode === 'practice') {
    const drift = Math.min(2200, Math.round((driftScore || 0) * 0.28));
    if (drift) lines.push({ label: 'Drift bonus', value: drift });
    total += drift;
    return { total, lines, difficulty: diff, position: null };
  }

  if (mode === 'time-trial') {
    const base = basePurse({ mode, circuit, laps });
    lines.push({ label: 'Time trial purse', value: base });
    total += base;
    const clean = Math.round(base * 0.35);
    lines.push({ label: 'Clean running bonus', value: clean });
    total += clean;
  } else {
    const base = basePurse({ mode, circuit, laps });
    lines.push({ label: 'Race purse', value: base });
    total += base;

    const factor = POSITION_FACTOR[Math.max(0, Math.min(POSITION_FACTOR.length - 1, position - 1))] || 0.2;
    const positionBonus = Math.round(base * (factor - 1));
    lines.push({
      label: position === 1 ? 'Winner bonus' : positionBonus >= 0 ? `P${position} bonus` : `P${position} finish`,
      value: positionBonus,
    });
    total += positionBonus;

    const diffBonus = Math.round(total * (diff.reward - 1));
    if (diffBonus) {
      lines.push({ label: diffBonus > 0 ? `${diff.label} difficulty bonus` : `${diff.label} difficulty`, value: diffBonus });
      total += diffBonus;
    }
  }

  // The career purse is only paid when the event objective is met. Replaying a
  // cleared event still pays, but at 30% so it never becomes a money printer.
  if (mode === 'career' && eventReward && eventCleared) {
    const value = Math.round(eventReward * (firstClear ? 1 : 0.3));
    lines.push({ label: firstClear ? 'Career event reward' : 'Career replay reward', value });
    total += value;
  }
  if (mode === 'career' && firstClear && position === 1 && firstWinBonus) {
    lines.push({ label: 'First clear victory bonus', value: firstWinBonus });
    total += firstWinBonus;
  }

  const drift = Math.min(2600, Math.round((driftScore || 0) * 0.32));
  if (drift > 24) {
    lines.push({ label: 'Drift style bonus', value: drift });
    total += drift;
  }
  if (newLapRecord) {
    const value = Math.round(600 + (circuit?.lengthKm || 0.6) * 260);
    lines.push({ label: 'New circuit lap record', value });
    total += value;
  }

  return {
    total: Math.max(0, Math.round(total)),
    lines,
    difficulty: diff,
    // Time trials are solo: there is no race position to report.
    position: mode === 'time-trial' ? null : position,
  };
}

export function positionLabel(position, total) {
  if (!position || !total) return '—';
  return `P${position}/${total}`;
}

export function nextRankProgress(stats) {
  const score = (stats?.wins || 0) * 2 + (stats?.races || 0);
  const tiers = [2, 7, 14, 24];
  const next = tiers.find((t) => score < t);
  if (next == null) return { score, next: null, progress: 1 };
  const prev = [0, ...tiers].filter((t) => score >= t).pop() || 0;
  return { score, next, progress: (score - prev) / (next - prev) };
}
