// Time of day and weather. Every circuit keeps its own palette; night and
// rain are derived from it so all circuits get both without hand-made
// variants. Rain also lowers grip for every car on the grid.

export const TIMES = [
  { id: 'day', label: 'DAY' },
  { id: 'night', label: 'NIGHT' },
];
export const WEATHERS = [
  { id: 'clear', label: 'CLEAR' },
  { id: 'rain', label: 'RAIN' },
];

// Tyre grip and braking in the wet, relative to dry.
export const RAIN_GRIP = 0.84;

export function normalizeConditions(c = {}) {
  return {
    time: TIMES.some((t) => t.id === c.time) ? c.time : 'day',
    weather: WEATHERS.some((w) => w.id === c.weather) ? c.weather : 'clear',
  };
}

export const conditionsKey = (c) => `${c.time}/${c.weather}`;

// Tiny colour helpers (no Three.js, so this module also runs in Node tests).
// Colours may be '#rrggbb' strings or 0xrrggbb numbers.
const toInt = (c) => (typeof c === 'number' ? c : parseInt(String(c).replace('#', ''), 16));
class Mixed {
  constructor(value) { this.value = value; }
  getHex() { return this.value; }
  getHexString() { return this.value.toString(16).padStart(6, '0'); }
}
const mix = (a, b, t) => {
  const x = toInt(a);
  const y = toInt(b);
  const ch = (shift) => Math.round(((x >> shift) & 255) * (1 - t) + ((y >> shift) & 255) * t);
  return new Mixed((ch(16) << 16) | (ch(8) << 8) | ch(0));
};
const hex = (c) => `#${c.getHexString()}`;

/** Palette for a circuit under the given conditions. */
export function paletteFor(base, conditions) {
  const { time, weather } = normalizeConditions(conditions);
  const night = time === 'night';
  const p = { ...base, sunIntensity: 2.6, hemiIntensity: 0.65 };

  if (!night) {
    // Circuit palettes are sunset-themed and some are almost black (the neon
    // city sky is #070912). Lift them into real daylight so DAY never reads as
    // night. The warm horizon stays, keeping the Sunset Drift look.
    Object.assign(p, {
      skyTop: hex(mix(base.skyTop, '#1f5fa8', 0.72)),
      skyMid: hex(mix(base.skyMid, '#69a7e0', 0.62)),
      skyLow: hex(mix(base.skyLow, '#bcdcf0', 0.42)),
      skyHorizon: hex(mix(base.skyHorizon, '#ffe9bd', 0.34)),
      sun: '#fff8e8',
      sunGlow: hex(mix(base.sunGlow, '#ffd9a0', 0.5)),
      fog: mix(base.fog, 0xc9dcec, 0.42).getHex(),
      fogNear: base.fogNear * 1.1,
      fogFar: base.fogFar * 1.08,
      env: Math.min(1, (base.env ?? 0.5) * 1.15),
      hemiSky: 0xbcd8ff,
      hemiGround: mix(base.hemiGround ?? 0x2a2a2a, 0x8a8f7a, 0.45).getHex(),
      sunLight: 0xfff2da,
      ground: hex(mix(base.ground, '#ffffff', 0.08)),
      sunIntensity: 3,
      hemiIntensity: 0.95,
    });
  } else {
    Object.assign(p, {
      skyTop: hex(mix(base.skyTop, '#03040b', 0.85)),
      skyMid: hex(mix(base.skyMid, '#0a1230', 0.85)),
      skyLow: hex(mix(base.skyLow, '#141c3c', 0.85)),
      skyHorizon: hex(mix(base.skyHorizon, '#2a3664', 0.8)),
      sun: '#cdd8ff',
      sunGlow: '#3e4f86',
      fog: mix(base.fog, 0x0a0f20, 0.85).getHex(),
      fogNear: base.fogNear * 0.6,
      fogFar: base.fogFar * 0.7,
      env: (base.env ?? 0.5) * 0.3,
      hemiSky: 0x50608f,
      hemiGround: 0x07080d,
      sunLight: 0x9fb4ff,
      fillLight: 0x22305c,
      bounceLight: 0x141426,
      ground: hex(mix(base.ground, '#000000', 0.55)),
      sunIntensity: 0.55,
      hemiIntensity: 0.32,
    });
  }

  if (weather === 'rain') {
    const grey = night ? '#0d1018' : '#5c6470';
    Object.assign(p, {
      skyTop: hex(mix(p.skyTop, grey, 0.6)),
      skyMid: hex(mix(p.skyMid, grey, 0.65)),
      skyLow: hex(mix(p.skyLow, grey, 0.7)),
      skyHorizon: hex(mix(p.skyHorizon, grey, 0.7)),
      sunGlow: hex(mix(p.sunGlow, grey, 0.8)),
      fog: mix(p.fog, grey, 0.7).getHex(),
      fogNear: p.fogNear * 0.45,
      fogFar: p.fogFar * 0.55,
      sunLight: mix(p.sunLight, 0xb8c2d0, 0.6).getHex(),
      sunIntensity: p.sunIntensity * 0.45,
      hemiIntensity: p.hemiIntensity * 1.1,
      // Wet tarmac reads darker and picks up reflections from the sky.
      road: hex(mix(base.road, '#000000', 0.35)),
      wet: true,
    });
  }

  // The sky shader uses these to hide the sun after dark, show stars only at
  // night, and dim both under cloud. Without them it drew a glaring sun disc
  // at midnight and stars in broad daylight.
  p.night = night;
  p.rain = weather === 'rain';
  p.sunDisc = night ? 0 : (p.rain ? 0.12 : 1);
  p.stars = night ? (p.rain ? 0.35 : 1) : 0;
  return p;
}
