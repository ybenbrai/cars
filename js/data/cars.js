// Car catalogue, tuning personalities and cosmetic options.

export const CARS = [
  {
    id: 'falcon',
    name: 'FALCON GT',
    klass: 'BALANCED',
    tagline: 'The all-rounder. Quick enough to scare you, friendly enough to forgive you.',
    paint: '#ff5a1f',
    stats: { speed: 7, accel: 6, handling: 7, drift: 6 },
    pros: ['Confidence-inspiring grip', 'Predictable, sharp brakes'],
    cons: ['No single standout stat', 'Can feel a little anonymous'],
    physics: { speed: 1.0, accel: 1.0, grip: 1.0, turn: 1.0, boost: 1.0, slide: 1.0 },
    body: {
      length: 4.35, width: 1.92, wheelRadius: 0.37, wheelbase: 1.38,
      cabinLength: 2.0, cabinWidth: 1.52, cabinHeight: 0.52, cabinZ: -0.25,
      roofLength: 1.25, roofWidth: 1.32, rideHeight: 0.55,
      noseDrop: 0.82, tailHeight: 0.86, scoop: false, vents: false, ducktail: false,
    },
  },
  {
    id: 'viper',
    name: 'VIPER X',
    klass: 'TOP SPEED',
    tagline: 'A blunt instrument with a rocket strapped to the back. Point, squeeze, pray.',
    paint: '#e8173b',
    stats: { speed: 10, accel: 8, handling: 5, drift: 4 },
    pros: ['Highest top speed in the field', 'Nitro hits like a sledgehammer'],
    cons: ['Heavy nose, wide turning circle', 'Punishes sloppy corner exits'],
    physics: { speed: 1.12, accel: 1.1, grip: 0.9, turn: 0.86, boost: 1.3, slide: 1.12 },
    body: {
      length: 4.8, width: 2.06, wheelRadius: 0.4, wheelbase: 1.5,
      cabinLength: 2.05, cabinWidth: 1.58, cabinHeight: 0.48, cabinZ: -0.4,
      roofLength: 1.3, roofWidth: 1.36, rideHeight: 0.52,
      noseDrop: 0.8, tailHeight: 0.9, scoop: false, vents: true, ducktail: false,
    },
  },
  {
    id: 'kaze',
    name: 'KAZE S',
    klass: 'DRIFT',
    tagline: 'Built sideways. The rear end is less of a wheel and more of a suggestion.',
    paint: '#33d7ff',
    stats: { speed: 6, accel: 6, handling: 9, drift: 10 },
    pros: ['Biggest, most controllable drift angle', 'Telepathic steering feel'],
    cons: ['Low top speed', 'Twitchy over uneven ground'],
    physics: { speed: 0.94, accel: 0.98, grip: 0.93, turn: 1.14, boost: 0.95, slide: 0.72 },
    body: {
      length: 4.18, width: 1.86, wheelRadius: 0.35, wheelbase: 1.32,
      cabinLength: 1.95, cabinWidth: 1.5, cabinHeight: 0.55, cabinZ: -0.2,
      roofLength: 1.2, roofWidth: 1.3, rideHeight: 0.5,
      noseDrop: 0.78, tailHeight: 0.84, scoop: false, vents: false, ducktail: true,
    },
  },
  {
    id: 'comet',
    name: 'COMET RS',
    klass: 'LAUNCH',
    tagline: 'Featherweight rally blood. Off the line like a scalded cat, gone before the turbo.',
    paint: '#b6ff3c',
    stats: { speed: 7, accel: 10, handling: 8, drift: 5 },
    pros: ['Fastest launch off the line', 'Nimble through tight complexes'],
    cons: ['Lacks top-end legs', 'Light rear steps out unexpectedly'],
    physics: { speed: 0.97, accel: 1.2, grip: 1.04, turn: 1.08, boost: 1.05, slide: 1.03 },
    body: {
      length: 4.0, width: 1.9, wheelRadius: 0.38, wheelbase: 1.26,
      cabinLength: 2.1, cabinWidth: 1.54, cabinHeight: 0.62, cabinZ: -0.15,
      roofLength: 1.35, roofWidth: 1.34, rideHeight: 0.57,
      noseDrop: 0.84, tailHeight: 0.94, scoop: true, vents: false, ducktail: false,
    },
  },
];

export const PAINTS = [
  { name: 'Solar Flare', hex: '#ff5a1f' },
  { name: 'Cherry Bomb', hex: '#e8173b' },
  { name: 'Lava Gold', hex: '#ffb23d' },
  { name: 'Toxic Lime', hex: '#b6ff3c' },
  { name: 'Mint Rush', hex: '#4dffc3' },
  { name: 'Cyber Cyan', hex: '#33d7ff' },
  { name: 'Midnight Blue', hex: '#2447ff' },
  { name: 'Ultra Violet', hex: '#a855f7' },
  { name: 'Pearl White', hex: '#f1ece2' },
  { name: 'Gunmetal', hex: '#5c6470' },
  { name: 'Onyx', hex: '#17181e' },
];

export const FINISHES = [
  { id: 'gloss', label: 'Gloss', roughness: 0.24, metalness: 0.45, clearcoat: 1, clearcoatRoughness: 0.06, env: 1.0 },
  { id: 'matte', label: 'Matte', roughness: 0.7, metalness: 0.1, clearcoat: 0.05, clearcoatRoughness: 0.6, env: 0.5 },
  { id: 'metallic', label: 'Metal', roughness: 0.34, metalness: 0.82, clearcoat: 0.8, clearcoatRoughness: 0.12, env: 1.15 },
  { id: 'chrome', label: 'Chrome', roughness: 0.07, metalness: 1.0, clearcoat: 1, clearcoatRoughness: 0.03, env: 1.7 },
];

export const RIM_COLORS = [
  { name: 'Silver', hex: '#d7dce6' },
  { name: 'Black', hex: '#15171d' },
  { name: 'Gold', hex: '#e8b54d' },
  { name: 'Bronze', hex: '#b06a3b' },
  { name: 'White', hex: '#f1f0ea' },
  { name: 'Cyan', hex: '#5ce1e6' },
];

export const RIM_STYLES = [
  { id: 'spoke', label: 'Spoke' },
  { id: 'aero', label: 'Aero' },
  { id: 'deep', label: 'Deep' },
];

export const SPOILERS = [
  { id: 'none', label: 'None' },
  { id: 'lip', label: 'Lip' },
  { id: 'gt', label: 'GT Wing' },
  { id: 'big', label: 'Big Wing' },
];

export const STRIPES = [
  { id: 'none', label: 'None' },
  { id: 'twin', label: 'Twin' },
  { id: 'side', label: 'Side' },
  { id: 'roof', label: 'Roof' },
];

export const STRIPE_COLORS = [
  { name: 'Ivory', hex: '#fff3e2' },
  { name: 'Black', hex: '#14151a' },
  { name: 'Gold', hex: '#ffc46b' },
  { name: 'Hot Pink', hex: '#ff3d7f' },
  { name: 'Cyan', hex: '#5ce1e6' },
];

export const TINTS = [
  { id: 'clear', label: 'Clear', color: '#2a3547', opacity: 0.5, metalness: 0.6 },
  { id: 'light', label: 'Light', color: '#151d2b', opacity: 0.72, metalness: 0.8 },
  { id: 'dark', label: 'Dark', color: '#070a12', opacity: 0.94, metalness: 0.9 },
  { id: 'mirror', label: 'Mirror', color: '#3a4252', opacity: 0.98, metalness: 1.0 },
];

export const UNDERGLOWS = [
  { id: 'off', label: 'Off', hex: null },
  { id: 'cyan', label: 'Cyan', hex: '#5ce1e6' },
  { id: 'pink', label: 'Pink', hex: '#ff3d7f' },
  { id: 'orange', label: 'Orange', hex: '#ff7a45' },
  { id: 'lime', label: 'Lime', hex: '#8dffb0' },
  { id: 'violet', label: 'Violet', hex: '#a855f7' },
];

export const STORAGE_KEY = 'sunset-drift-profile-v1';
export const BEST_KEY = 'sunset-drift-best-v1';

export function getCar(id) {
  return CARS.find((car) => car.id === id) || CARS[0];
}

export function defaultLook(car) {
  return {
    paint: car.paint,
    finish: 'gloss',
    rim: RIM_COLORS[0].hex,
    rimStyle: 'spoke',
    spoiler: car.id === 'viper' ? 'big' : car.id === 'kaze' ? 'lip' : 'gt',
    stripe: 'twin',
    stripeColor: STRIPE_COLORS[0].hex,
    tint: 'light',
    underglow: 'off',
    plate: 'SUNSET',
  };
}

export function normalizeLook(car, look = {}) {
  const base = defaultLook(car);
  const merged = { ...base, ...look };
  merged.paint = /^#[0-9a-f]{6}$/i.test(merged.paint) ? merged.paint : base.paint;
  merged.rim = /^#[0-9a-f]{6}$/i.test(merged.rim) ? merged.rim : base.rim;
  merged.stripeColor = /^#[0-9a-f]{6}$/i.test(merged.stripeColor) ? merged.stripeColor : base.stripeColor;
  merged.plate = String(merged.plate || base.plate).toUpperCase().replace(/[^A-Z0-9 \-_.]/g, '').slice(0, 9);
  if (!FINISHES.some((f) => f.id === merged.finish)) merged.finish = base.finish;
  if (!RIM_STYLES.some((f) => f.id === merged.rimStyle)) merged.rimStyle = base.rimStyle;
  if (!SPOILERS.some((f) => f.id === merged.spoiler)) merged.spoiler = base.spoiler;
  if (!STRIPES.some((f) => f.id === merged.stripe)) merged.stripe = base.stripe;
  if (!TINTS.some((f) => f.id === merged.tint)) merged.tint = base.tint;
  if (!UNDERGLOWS.some((f) => f.id === merged.underglow)) merged.underglow = base.underglow;
  return merged;
}

export const STAT_LABELS = [
  ['speed', 'SPEED'],
  ['accel', 'ACCEL'],
  ['handling', 'HANDLING'],
  ['drift', 'DRIFT'],
];
