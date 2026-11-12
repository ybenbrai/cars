// Daily login rewards: one claim per calendar day. Coming back on
// consecutive days climbs a seven-day ladder; missing a day restarts it.

export const REWARD_LADDER = [500, 750, 1000, 1500, 2000, 2500, 5000];

const dayNumber = (dateKey) => Math.floor(Date.parse(`${dateKey}T00:00:00Z`) / 86400000);

/** What today's login would give, without claiming it. */
export function rewardStatus(login, todayKey) {
  const last = login?.lastDay || null;
  if (last === todayKey) return { available: false, streak: login.streak || 1, day: ((login.streak || 1) - 1) % 7, amount: 0 };
  const consecutive = last && dayNumber(todayKey) - dayNumber(last) === 1;
  const streak = consecutive ? (login.streak || 0) + 1 : 1;
  const day = (streak - 1) % REWARD_LADDER.length;
  return { available: true, streak, day, amount: REWARD_LADDER[day] };
}
