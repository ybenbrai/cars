// Circuit catalogue. Layouts are generated from radial harmonics so every loop
// is guaranteed to be a clean, non-self-intersecting closed circuit.
//
// Each circuit has its own width, gate count, scenery theme and palette. The
// resulting layouts drive very differently: long flowing curves, tight technical
// complexes, fast sweepers and stop-and-go industrial corners.

function radial({
  radius = 200,
  squashX = 1,
  squashZ = 1,
  harmonics = [],
  points = 36,
  rotate = 0,
  wobble = 0,
}) {
  const cp = [];
  for (let i = 0; i < points; i++) {
    const a = (i / points) * Math.PI * 2 + rotate;
    let r = radius;
    for (const [freq, amp, phase = 0] of harmonics) {
      r += radius * amp * Math.sin(freq * a + phase);
    }
    if (wobble) r += radius * wobble * Math.sin(a * 17.3 + 1.7);
    cp.push([Math.cos(a) * r * squashX, Math.sin(a) * r * squashZ]);
  }
  return cp;
}

function polylineLength(cp) {
  let total = 0;
  for (let i = 0; i < cp.length; i++) {
    const a = cp[i];
    const b = cp[(i + 1) % cp.length];
    total += Math.hypot(b[0] - a[0], b[1] - a[1]);
  }
  return total;
}

const PALETTES = {
  gp: {
    skyTop: '#16203f', skyMid: '#3b4f86', skyLow: '#c9876a', skyHorizon: '#ffcf8a',
    sun: '#fff8e6', sunGlow: '#ffb466', fog: 0xb59a86, fogNear: 220, fogFar: 1050,
    ground: '#3f5a2e', groundStyle: 'grass', env: 0.6,
    hemiSky: 0xffe2b8, hemiGround: 0x23301c, sunLight: 0xffcf96, fillLight: 0x7f9cff, bounceLight: 0xff9a5f,
    road: '#2f3036', line: '#f4f1e8', curbA: '#f2efe6', curbB: '#d8262f',
    barrier: 0xd9dde6, marker: 0xd8262f, accent: 0xff3d4a,
  },
  coast: {
    skyTop: '#120d26', skyMid: '#43204a', skyLow: '#b9505a', skyHorizon: '#ff9a5f',
    sun: '#fff3d6', sunGlow: '#ff7a46', fog: 0xd98a68, fogNear: 190, fogFar: 980,
    ground: '#b98d63', groundStyle: 'sand', env: 0.5,
    hemiSky: 0xffc49a, hemiGround: 0x3a2436, sunLight: 0xffb37c, fillLight: 0x8f6bff, bounceLight: 0xff7a45,
    road: '#33323a', line: '#efe6d4', curbA: '#e7e0d1', curbB: '#cf3f2f',
    barrier: 0xd8c3a6, marker: 0xff6a2f, accent: 0xff7a45,
  },
  city: {
    skyTop: '#070912', skyMid: '#181a34', skyLow: '#3b2c63', skyHorizon: '#d1608a',
    sun: '#ffe2f2', sunGlow: '#ff5fa2', fog: 0x2a2340, fogNear: 150, fogFar: 780,
    ground: '#23232c', groundStyle: 'asphalt', env: 0.7,
    hemiSky: 0x9db4ff, hemiGround: 0x241a33, sunLight: 0xffb8d8, fillLight: 0x3f7bff, bounceLight: 0xff3d7f,
    road: '#2b2b34', line: '#e8e2f2', curbA: '#e6e0f0', curbB: '#2c50c8',
    barrier: 0x6d7189, marker: 0x5ce1e6, accent: 0x5ce1e6,
  },
  forest: {
    skyTop: '#101a1a', skyMid: '#253a2f', skyLow: '#6b7350', skyHorizon: '#e0a86a',
    sun: '#fff3cf', sunGlow: '#ffb45f', fog: 0x6b7a5e, fogNear: 120, fogFar: 700,
    ground: '#33422c', groundStyle: 'grass', env: 0.4,
    hemiSky: 0xc8e0a8, hemiGround: 0x1d2419, sunLight: 0xffd49a, fillLight: 0x5f8f6a, bounceLight: 0xff9a5f,
    road: '#35343a', line: '#e7ead9', curbA: '#e9e6d1', curbB: '#2f6f45',
    barrier: 0x8a7a5e, marker: 0xffb45f, accent: 0x8dffb0,
  },
  desert: {
    skyTop: '#180d20', skyMid: '#5a2948', skyLow: '#c8655c', skyHorizon: '#ffb066',
    sun: '#fff7dd', sunGlow: '#ff8a4a', fog: 0xd9a06a, fogNear: 230, fogFar: 1100,
    ground: '#b0845d', groundStyle: 'sand', env: 0.55,
    hemiSky: 0xffd2a0, hemiGround: 0x3d2720, sunLight: 0xffc078, fillLight: 0x9b6bff, bounceLight: 0xff7a3f,
    road: '#3a3638', line: '#f2e6cf', curbA: '#efe4cf', curbB: '#d05a35',
    barrier: 0xc9a982, marker: 0xff8f45, accent: 0xffb23d,
  },
  mountain: {
    skyTop: '#0a1024', skyMid: '#1d2c50', skyLow: '#5f6f9a', skyHorizon: '#f0b9a0',
    sun: '#fff2e4', sunGlow: '#ff9f78', fog: 0x8a8fa8, fogNear: 180, fogFar: 900,
    ground: '#4b5560', groundStyle: 'rock', env: 0.65,
    hemiSky: 0xd0dcff, hemiGround: 0x1e2430, sunLight: 0xffd4b8, fillLight: 0x6f8cff, bounceLight: 0xff7a5f,
    road: '#31333c', line: '#e6eaf2', curbA: '#e8edf2', curbB: '#3d5db8',
    barrier: 0x9aa3b5, marker: 0x5ce1e6, accent: 0x9db8ff,
  },
  industrial: {
    skyTop: '#120e0c', skyMid: '#2e231f', skyLow: '#6d4a3b', skyHorizon: '#d99a63',
    sun: '#ffe9c9', sunGlow: '#ff8a4a', fog: 0x6a5a50, fogNear: 130, fogFar: 760,
    ground: '#3a3630', groundStyle: 'asphalt', env: 0.45,
    hemiSky: 0xffc79a, hemiGround: 0x241d19, sunLight: 0xffb87f, fillLight: 0x5f7f9a, bounceLight: 0xff6a3f,
    road: '#302e30', line: '#e8ddc9', curbA: '#e4d6bd', curbB: '#b8492f',
    barrier: 0x8c7a5f, marker: 0xffc46b, accent: 0xffc46b,
  },
};

const RAW = [
  {
    id: 'sunset-coast',
    name: 'SUNSET COAST',
    location: 'Costa Dorada',
    subtitle: 'The original. Long straights, a fast infield and a sunset you can taste.',
    theme: 'coast',
    unlockRank: 0,
    difficulty: 1,
    width: 7.4,
    gates: 8,
    laps: 3,
    pads: [0.055, 0.30, 0.545, 0.79],
    features: ['Fast sweepers', 'Long main straight', 'Forgiving run-off'],
    cp: [
      [-92, -256], [-10, -268], [68, -272], [138, -252], [180, -208],
      [206, -152], [214, -84], [186, -28], [126, 26], [54, 38], [14, 16],
      [0, 0], [70, 6], [135, -12], [172, -62], [158, -120], [100, -146],
      [58, -122], [18, -148], [-28, -190], [-92, -206], [-148, -176],
      [-164, -116], [-202, -78], [-250, -102], [-266, -164], [-236, -220],
      [-168, -242],
    ],
  },
  {
    id: 'neon-city',
    name: 'NEON MILE',
    location: 'Kowloon Heights',
    subtitle: 'A tight downtown loop under a wall of neon. Brake late and pray.',
    theme: 'city',
    unlockRank: 1,
    difficulty: 2,
    width: 7.8,
    gates: 9,
    laps: 3,
    pads: [0.09, 0.34, 0.58, 0.82],
    features: ['Technical corners', 'Short straights', 'Concrete walls'],
    cp: radial({
      radius: 168, squashX: 1.18, squashZ: 0.9, points: 40, rotate: 0.18,
      harmonics: [[2, 0.13], [3, 0.09, 0.6], [5, 0.045, 1.4]],
    }),
  },
  {
    id: 'redwood-run',
    name: 'REDWOOD RUN',
    location: 'Cedar Valley',
    subtitle: 'A dark forest ribbon that rewards rhythm, patience and clean lines.',
    theme: 'forest',
    unlockRank: 1,
    difficulty: 2,
    width: 7.0,
    gates: 9,
    laps: 3,
    pads: [0.12, 0.38, 0.64, 0.88],
    features: ['Blind crests', 'Flowing esses', 'Narrow racing line'],
    cp: radial({
      radius: 196, squashX: 1.0, squashZ: 1.08, points: 43, rotate: 2.1,
      harmonics: [[2, 0.10], [4, 0.07, 0.9], [7, 0.035, 2.2]],
      wobble: 0.006,
    }),
  },
  {
    id: 'dust-basin',
    name: 'DUST BASIN',
    location: 'Mojave Flats',
    subtitle: 'The fastest track in the game. Huge sweepers, huge speed, zero shade.',
    theme: 'desert',
    unlockRank: 2,
    difficulty: 2,
    width: 8.6,
    gates: 6,
    laps: 3,
    pads: [0.07, 0.26, 0.52, 0.76],
    features: ['Flat-out sweepers', 'Wide surface', 'Huge top-speed reward'],
    cp: radial({
      radius: 244, squashX: 1.12, squashZ: 0.84, points: 34, rotate: 0.9,
      harmonics: [[2, 0.16], [3, 0.05, 1.1]],
    }),
  },
  {
    id: 'velocity-park',
    name: 'VELOCITY PARK',
    location: 'Autodromo Nazionale',
    subtitle: 'A purpose-built grand prix venue: a long pit straight, a late-braking chicane and a fast back loop.',
    theme: 'gp',
    unlockRank: 2,
    difficulty: 2,
    width: 8.4,
    gates: 9,
    laps: 3,
    pads: [0.12, 0.4, 0.62, 0.86],
    features: ['400 m pit straight', 'Chicane + hairpin', 'Wide run-off, tyre walls'],
    // Starts mid pit-straight so the whole grid lines up on tarmac, not a corner.
    cp: [
      [0, -254], [80, -252], [160, -248],
      [215, -225], [238, -175], [222, -125], [180, -100], [120, -96],
      [80, -74], [45, -100], [8, -80], [-30, -48], [-42, 0], [-22, 48],
      [30, 88], [100, 108], [170, 130], [218, 172], [230, 230], [192, 272], [120, 280], [40, 264],
      [-40, 242], [-110, 222], [-160, 182], [-152, 124], [-192, 72], [-250, 42],
      [-286, -18], [-292, -100], [-282, -180], [-266, -228],
      [-240, -250], [-160, -252], [-80, -254],
    ],
  },
  {
    id: 'alpine-pass',
    name: 'ALPINE PASS',
    location: 'Col du Glacier',
    subtitle: 'Hairpins, elevation fakery and a razor-thin ribbon of mountain road.',
    theme: 'mountain',
    unlockRank: 3,
    difficulty: 3,
    width: 7.1,
    gates: 10,
    laps: 3,
    pads: [0.10, 0.32, 0.56, 0.80],
    features: ['Hairpin complex', 'Narrow walls', 'Rewards traction'],
    cp: radial({
      radius: 182, squashX: 0.9, squashZ: 1.24, points: 46, rotate: 3.7,
      harmonics: [[3, 0.16, 0.3], [5, 0.075, 1.9], [8, 0.03, 0.4]],
    }),
  },
  {
    id: 'dockyard',
    name: 'DOCKYARD GP',
    location: 'Pier 19',
    subtitle: 'Containers, concrete and 90-degree punishment. Nowhere to hide.',
    theme: 'industrial',
    unlockRank: 4,
    difficulty: 3,
    width: 8.0,
    gates: 8,
    laps: 4,
    pads: [0.08, 0.29, 0.51, 0.74],
    features: ['Stop-and-go corners', 'Container chicanes', 'Heavy walls'],
    cp: radial({
      radius: 174, squashX: 1.22, squashZ: 0.92, points: 32, rotate: 1.35,
      harmonics: [[4, 0.17, 0.8], [6, 0.06, 2.4], [2, 0.08]],
    }),
  },
];

export const CIRCUITS = RAW.map((raw) => {
  const length = polylineLength(raw.cp);
  const palette = PALETTES[raw.theme] || PALETTES.coast;
  return {
    ...raw,
    palette,
    length,
    lengthKm: Math.round((length / 1000) * 10) / 10,
    rankLabel: ['Rookie', 'Club', 'Pro', 'Elite', 'Legend'][raw.unlockRank] || 'Legend',
    difficultyLabel: ['', 'Beginner', 'Intermediate', 'Expert'][raw.difficulty] || 'Expert',
  };
});

export function getCircuit(id) {
  return CIRCUITS.find((c) => c.id === id) || CIRCUITS[0];
}

export function circuitPalette(theme) {
  return PALETTES[theme] || PALETTES.coast;
}
