// Vehicle catalogue, tuning personalities, economy data and cosmetic options.
//
// Stats are 1–10 and line up with the physics multipliers below, so the bar
// chart in the garage is an honest preview of how the car behaves on track.

const BASE_BODY = {
  wheelRadius: 0.36,
  wheelbase: 1.3,
  cabinLength: 1.9,
  cabinWidth: 1.48,
  cabinHeight: 0.52,
  cabinZ: -0.2,
  roofLength: 1.2,
  roofWidth: 1.28,
  rideHeight: 0.52,
  noseDrop: 0.8,
  tailHeight: 0.86,
  scoop: false,
  vents: false,
  ducktail: false,
  style: 'sports',
};

const body = (style, overrides = {}) => ({ ...BASE_BODY, style, ...overrides });

export const CATEGORIES = [
  { id: 'all', label: 'All cars' },
  { id: 'hatch', label: 'Hatchbacks' },
  { id: 'sedan', label: 'Sedans' },
  { id: 'sports', label: 'Sports cars' },
  { id: 'super', label: 'Supercars' },
  { id: 'suv', label: 'SUVs' },
  { id: 'muscle', label: 'Muscle cars' },
  { id: 'hyper', label: 'Hypercars' },
  { id: 'offroad', label: 'Off-road' },
];

export const CARS = [
  {
    id: 'pulse',
    name: 'PULSE H3',
    klass: 'STARTER HATCH',
    category: 'hatch',
    price: 0,
    unlockRank: 0,
    starter: true,
    tagline: 'Light, honest and impossible to hate. The first car you actually own.',
    description:
      'A stripped-back city hatch with a willing engine and no pretensions. It will not win a drag race, but it teaches weight transfer, braking points and momentum better than anything else in the garage.',
    paint: '#ffd23f',
    specs: { power: 118, weight: 1040, topSpeed: 196, drivetrain: 'FWD' },
    stats: { speed: 4, accel: 5, handling: 5, drift: 4 },
    pros: ['Cheap to run and forgiving', 'Turns in eagerly at low speed'],
    cons: ['Runs out of breath uphill', 'Front tyres give up early'],
    physics: { speed: 0.82, accel: 0.9, grip: 0.95, turn: 1.05, boost: 0.8, slide: 1.15 },
    body: body('hatch', {
      length: 3.82, width: 1.74, wheelRadius: 0.31, wheelbase: 1.2,
      cabinLength: 2.05, cabinWidth: 1.44, cabinHeight: 0.6, cabinZ: -0.24,
      roofLength: 1.45, roofWidth: 1.26, rideHeight: 0.48,
      noseDrop: 0.68, tailHeight: 0.7,
    }),
  },
  {
    id: 'volt',
    name: 'VOLT H5',
    klass: 'HOT HATCH',
    category: 'hatch',
    price: 14000,
    unlockRank: 0,
    tagline: 'A shopping hatch with a caffeine habit and a limited-slip diff.',
    description:
      'The sensible body hides a turbo four, stiffened suspension and a short wheelbase that rotates on command. It is the cheapest way to learn how to trail-brake into a hairpin without ending up in a wall.',
    paint: '#4dffc3',
    specs: { power: 208, weight: 1215, topSpeed: 232, drivetrain: 'FWD' },
    stats: { speed: 5, accel: 7, handling: 7, drift: 5 },
    pros: ['Huge grip for the money', 'Easy to place in tight corners'],
    cons: ['Understeers when pushed too hard', 'Low top end on long straights'],
    physics: { speed: 0.9, accel: 1.05, grip: 1.02, turn: 1.1, boost: 1.0, slide: 1.02 },
    body: body('hatch', {
      length: 4.02, width: 1.8, wheelRadius: 0.33, wheelbase: 1.26,
      cabinLength: 2.0, cabinWidth: 1.46, cabinHeight: 0.58, cabinZ: -0.22,
      roofLength: 1.4, roofWidth: 1.28, rideHeight: 0.46,
      noseDrop: 0.7, tailHeight: 0.74, vents: true,
    }),
  },
  {
    id: 'orion',
    name: 'ORION H',
    klass: 'COMPACT HATCH',
    category: 'hatch',
    price: 18500,
    unlockRank: 0,
    tagline: 'A sensible five-door with a turbo four, a short shift and a taste for back roads.',
    description:
      'Astra-sized and front-wheel drive, the Orion is the everyday hatch that quietly does everything well. The turbo four pulls from low down, the wide track keeps it planted and the five-door body adds just enough weight over the rear to make lift-off feel interesting.',
    paint: '#e8173b',
    specs: { power: 200, weight: 1320, topSpeed: 235, drivetrain: 'FWD' },
    stats: { speed: 5, accel: 6, handling: 7, drift: 5 },
    pros: ['Planted and predictable at speed', 'Turbo torque out of tight corners'],
    cons: ['Front tyres wash out on long sweeps', 'Not as fast as the coupés on a straight'],
    physics: { speed: 0.93, accel: 1.0, grip: 1.03, turn: 1.06, boost: 0.98, slide: 1.04 },
    body: body('hatch', {
      length: 4.37, width: 1.81, wheelRadius: 0.34, wheelbase: 1.33,
      cabinLength: 2.12, cabinWidth: 1.46, cabinHeight: 0.56, cabinZ: -0.26,
      roofLength: 1.52, roofWidth: 1.28, rideHeight: 0.47,
      noseDrop: 0.72, tailHeight: 0.76,
    }),
  },
  {
    id: 'meridian',
    name: 'MERIDIAN 4D',
    klass: 'EXECUTIVE SEDAN',
    category: 'sedan',
    price: 19000,
    unlockRank: 0,
    tagline: 'Three boxes, five seats and a surprising appetite for corners.',
    description:
      'A rear-wheel-drive saloon built for long distances and quiet speed. The extra wheelbase makes it stable at the limit, while the torquey six lets you steer with the throttle when the road opens up.',
    paint: '#8ea4bf',
    specs: { power: 265, weight: 1580, topSpeed: 244, drivetrain: 'RWD' },
    stats: { speed: 6, accel: 5, handling: 6, drift: 5 },
    pros: ['Planting stability at speed', 'Comfortable and predictable'],
    cons: ['Noticeable weight in slow corners', 'Soft suspension rolls a lot'],
    physics: { speed: 0.96, accel: 0.95, grip: 1.0, turn: 0.95, boost: 0.9, slide: 1.15 },
    body: body('sedan', {
      length: 4.78, width: 1.9, wheelRadius: 0.36, wheelbase: 1.62,
      cabinLength: 2.3, cabinWidth: 1.52, cabinHeight: 0.55, cabinZ: -0.18,
      roofLength: 1.45, roofWidth: 1.34, rideHeight: 0.54,
      noseDrop: 0.78, tailHeight: 0.82,
    }),
  },
  {
    id: 'regent',
    name: 'REGENT S',
    klass: 'PERFORMANCE SEDAN',
    category: 'sedan',
    price: 29000,
    unlockRank: 2,
    tagline: 'A boardroom missile. Quiet until it absolutely is not.',
    description:
      'Twin-turbo V8, adaptive dampers and enough electronics to make a 1,800 kg saloon feel half its size. It rewards clean inputs and punishes lazy ones with a very expensive-sounding slide.',
    paint: '#2447ff',
    specs: { power: 470, weight: 1810, topSpeed: 284, drivetrain: 'AWD' },
    stats: { speed: 7, accel: 7, handling: 7, drift: 5 },
    pros: ['Enormous corner-exit traction', 'Stable under heavy braking'],
    cons: ['Feels heavy on the nose', 'Needs commitment to rotate'],
    physics: { speed: 1.02, accel: 1.06, grip: 1.04, turn: 0.99, boost: 1.04, slide: 1.08 },
    body: body('sedan', {
      length: 4.92, width: 1.95, wheelRadius: 0.38, wheelbase: 1.66,
      cabinLength: 2.24, cabinWidth: 1.54, cabinHeight: 0.52, cabinZ: -0.2,
      roofLength: 1.38, roofWidth: 1.36, rideHeight: 0.5,
      noseDrop: 0.74, tailHeight: 0.8, vents: true, ducktail: true,
    }),
  },
  {
    id: 'falcon',
    name: 'FALCON GT',
    klass: 'BALANCED COUPE',
    category: 'sports',
    price: 21000,
    unlockRank: 0,
    tagline: 'The all-rounder. Quick enough to scare you, friendly enough to forgive you.',
    description:
      'A front-engine coupe with near-perfect weight distribution. The Falcon is the reference point for the whole catalogue: not the fastest, not the sharpest, but always composed enough to show you where you lost time.',
    paint: '#ff5a1f',
    specs: { power: 320, weight: 1420, topSpeed: 258, drivetrain: 'RWD' },
    stats: { speed: 7, accel: 6, handling: 7, drift: 6 },
    pros: ['Confidence-inspiring grip', 'Predictable, sharp brakes'],
    cons: ['No single standout stat', 'Can feel a little anonymous'],
    physics: { speed: 1.0, accel: 1.0, grip: 1.0, turn: 1.0, boost: 1.0, slide: 1.0 },
    body: body('sports', {
      length: 4.35, width: 1.92, wheelRadius: 0.37, wheelbase: 1.38,
      cabinLength: 2.0, cabinWidth: 1.52, cabinHeight: 0.52, cabinZ: -0.25,
      roofLength: 1.25, roofWidth: 1.32, rideHeight: 0.55,
      noseDrop: 0.82, tailHeight: 0.86, scoop: false, vents: false, ducktail: false,
    }),
  },
  {
    id: 'comet',
    name: 'COMET RS',
    klass: 'LAUNCH SPECIALIST',
    category: 'sports',
    price: 31000,
    unlockRank: 1,
    tagline: 'Featherweight rally blood. Off the line like a scalded cat.',
    description:
      'A homologation special with a short wheelbase and a turbo that spools before you have finished thinking about it. The rear is light, the steering is fast and the launch control is genuinely unfair.',
    paint: '#b6ff3c',
    specs: { power: 355, weight: 1288, topSpeed: 262, drivetrain: 'AWD' },
    stats: { speed: 7, accel: 10, handling: 8, drift: 5 },
    pros: ['Fastest launch off the line', 'Nimble through tight complexes'],
    cons: ['Lacks top-end legs', 'Light rear steps out unexpectedly'],
    physics: { speed: 0.97, accel: 1.2, grip: 1.04, turn: 1.08, boost: 1.05, slide: 1.03 },
    body: body('sports', {
      length: 4.0, width: 1.9, wheelRadius: 0.38, wheelbase: 1.26,
      cabinLength: 2.1, cabinWidth: 1.54, cabinHeight: 0.62, cabinZ: -0.15,
      roofLength: 1.35, roofWidth: 1.34, rideHeight: 0.57,
      noseDrop: 0.84, tailHeight: 0.94, scoop: true, vents: false, ducktail: false,
    }),
  },
  {
    id: 'kaze',
    name: 'KAZE S',
    klass: 'DRIFT / RALLY',
    category: 'offroad',
    price: 23000,
    unlockRank: 1,
    tagline: 'Built sideways. The rear end is less of a wheel and more of a suggestion.',
    description:
      'A rally-bred coupe with a locked rear diff and suspension travel for days. It starts sliding earlier than any other car here, then holds the angle with a calm that makes the rest of the field look nervous.',
    paint: '#33d7ff',
    specs: { power: 290, weight: 1310, topSpeed: 238, drivetrain: 'RWD' },
    stats: { speed: 6, accel: 6, handling: 9, drift: 10 },
    pros: ['Biggest, most controllable drift angle', 'Telepathic steering feel'],
    cons: ['Low top speed', 'Twitchy over uneven ground'],
    physics: { speed: 0.94, accel: 0.98, grip: 0.93, turn: 1.14, boost: 0.95, slide: 0.72 },
    body: body('offroad', {
      length: 4.18, width: 1.9, wheelRadius: 0.38, wheelbase: 1.32,
      cabinLength: 1.95, cabinWidth: 1.5, cabinHeight: 0.55, cabinZ: -0.2,
      roofLength: 1.2, roofWidth: 1.3, rideHeight: 0.62,
      noseDrop: 0.78, tailHeight: 0.84, scoop: false, vents: false, ducktail: true,
    }),
  },
  {
    id: 'dune',
    name: 'DUNE RX',
    klass: 'DESERT RAIDER',
    category: 'offroad',
    price: 42000,
    unlockRank: 2,
    tagline: 'Long travel, huge tyres and absolutely no respect for kerbs.',
    description:
      'A purpose-built desert racer with a tubed chassis, a naturally aspirated V8 and suspension that laughs at kerbs. It is not subtle on tarmac, but it carries impossible speed across rough ground.',
    paint: '#ff9d2e',
    specs: { power: 430, weight: 1650, topSpeed: 228, drivetrain: '4WD' },
    stats: { speed: 7, accel: 7, handling: 8, drift: 7 },
    pros: ['Unshakeable over rough surfaces', 'Huge mechanical grip'],
    cons: ['Heavy, tall and thirsty', 'Slow to change direction'],
    physics: { speed: 0.99, accel: 1.04, grip: 1.06, turn: 1.0, boost: 1.1, slide: 0.85 },
    body: body('offroad', {
      length: 4.72, width: 2.06, wheelRadius: 0.48, wheelbase: 1.62,
      cabinLength: 1.9, cabinWidth: 1.56, cabinHeight: 0.66, cabinZ: -0.16,
      roofLength: 1.35, roofWidth: 1.48, rideHeight: 0.84,
      noseDrop: 0.96, tailHeight: 1.0, scoop: true,
    }),
  },
  {
    id: 'titan',
    name: 'TITAN XR',
    klass: 'PERFORMANCE SUV',
    category: 'suv',
    price: 38000,
    unlockRank: 2,
    tagline: 'A two-tonne SUV that has clearly been to the gym.',
    description:
      'Ridiculous on paper, effective in practice. The Titan uses a rear-biased all-wheel-drive system and active anti-roll bars to hide its mass. It will not dance, but it will lean on a corner and refuse to let go.',
    paint: '#5c6470',
    specs: { power: 395, weight: 2210, topSpeed: 254, drivetrain: 'AWD' },
    stats: { speed: 6, accel: 5, handling: 6, drift: 5 },
    pros: ['Massive stability at speed', 'Shrugs off kerbs and contact'],
    cons: ['Very heavy under braking', 'Slow to rotate in tight corners'],
    physics: { speed: 0.95, accel: 0.95, grip: 1.02, turn: 0.92, boost: 1.0, slide: 1.05 },
    body: body('suv', {
      length: 4.96, width: 2.02, wheelRadius: 0.46, wheelbase: 1.72,
      cabinLength: 2.5, cabinWidth: 1.62, cabinHeight: 0.78, cabinZ: -0.16,
      roofLength: 1.8, roofWidth: 1.5, rideHeight: 0.82,
      noseDrop: 0.92, tailHeight: 1.02, vents: true,
    }),
  },
  {
    id: 'ridge',
    name: 'RIDGE TRL',
    klass: 'LUXURY SUV',
    category: 'suv',
    price: 48000,
    unlockRank: 3,
    tagline: 'A luxury lounge with a low-range transfer case and a mean streak.',
    description:
      'The Ridge is the sensible choice for a championship that visits every surface. Air suspension, a twin-turbo V8 and a clever torque split make it far more capable than its size suggests.',
    paint: '#2f6f5e',
    specs: { power: 455, weight: 2380, topSpeed: 248, drivetrain: 'AWD' },
    stats: { speed: 7, accel: 6, handling: 7, drift: 6 },
    pros: ['Traction everywhere', 'Excellent high-speed stability'],
    cons: ['Turns like a building', 'Brakes fade after two laps'],
    physics: { speed: 1.0, accel: 1.0, grip: 1.06, turn: 1.0, boost: 1.05, slide: 0.96 },
    body: body('suv', {
      length: 5.02, width: 2.04, wheelRadius: 0.47, wheelbase: 1.76,
      cabinLength: 2.56, cabinWidth: 1.64, cabinHeight: 0.8, cabinZ: -0.18,
      roofLength: 1.85, roofWidth: 1.52, rideHeight: 0.86,
      noseDrop: 0.94, tailHeight: 1.04, vents: true, ducktail: true,
    }),
  },
  {
    id: 'vandal',
    name: 'VANDAL 440',
    klass: 'MUSCLE',
    category: 'muscle',
    price: 34000,
    unlockRank: 1,
    tagline: 'A big-block bruiser with a short fuse and a longer hood.',
    description:
      'No turbo, no hybrid, no apology. The Vandal makes its lap time with straight-line violence and a chassis that encourages you to use the rear tyres as steering aids. Subtlety is not included.',
    paint: '#e8173b',
    specs: { power: 485, weight: 1720, topSpeed: 272, drivetrain: 'RWD' },
    stats: { speed: 9, accel: 8, handling: 4, drift: 6 },
    pros: ['Devastating on long straights', 'Huge torque out of slow corners'],
    cons: ['Reluctant to change direction', 'Wheels spin under eager throttle'],
    physics: { speed: 1.1, accel: 1.14, grip: 0.88, turn: 0.9, boost: 1.22, slide: 1.0 },
    body: body('muscle', {
      length: 4.86, width: 2.0, wheelRadius: 0.4, wheelbase: 1.58,
      cabinLength: 1.9, cabinWidth: 1.56, cabinHeight: 0.5, cabinZ: -0.28,
      roofLength: 1.25, roofWidth: 1.4, rideHeight: 0.56,
      noseDrop: 0.82, tailHeight: 0.9, scoop: true, ducktail: true,
    }),
  },
  {
    id: 'duke',
    name: 'DUKE 429',
    klass: 'HEAVY MUSCLE',
    category: 'muscle',
    price: 52000,
    unlockRank: 3,
    tagline: 'The biggest engine in the room, wrapped in the widest body.',
    description:
      'A pro-touring muscle car with modern tyres bolted to a classic silhouette. It still demands respect on corner entry, but the huge rear rubber and a six-speed manual reward anyone brave enough to stay in it.',
    paint: '#b06a3b',
    specs: { power: 545, weight: 1795, topSpeed: 288, drivetrain: 'RWD' },
    stats: { speed: 10, accel: 9, handling: 4, drift: 5 },
    pros: ['Monstrous top speed', 'Enormous rear grip once hooked up'],
    cons: ['Heavy nose washes wide', 'Thirsty and unforgiving'],
    physics: { speed: 1.15, accel: 1.18, grip: 0.86, turn: 0.88, boost: 1.35, slide: 1.05 },
    body: body('muscle', {
      length: 5.0, width: 2.1, wheelRadius: 0.43, wheelbase: 1.62,
      cabinLength: 1.92, cabinWidth: 1.6, cabinHeight: 0.48, cabinZ: -0.3,
      roofLength: 1.24, roofWidth: 1.44, rideHeight: 0.54,
      noseDrop: 0.8, tailHeight: 0.9, scoop: true, ducktail: true,
    }),
  },
  {
    id: 'kestrel',
    name: 'KESTREL RS',
    klass: 'OPEN ROADSTER',
    category: 'sports',
    price: 26000,
    unlockRank: 1,
    tagline: 'No roof, no rear seats, no excuses. Pure wind-in-your-face balance.',
    description:
      'A featherweight two-seat roadster with a high-revving four and a near fifty-fifty weight split. It lacks the punch of the coupes, but it carries more speed through a corner than anything at its price and slides the moment you ask.',
    paint: '#33d7ff',
    specs: { power: 210, weight: 985, topSpeed: 230, drivetrain: 'RWD' },
    stats: { speed: 5, accel: 6, handling: 9, drift: 8 },
    pros: ['Sharpest turn-in under 50k', 'Lightweight, easy to rotate'],
    cons: ['Modest top speed', 'Gets pushed around in contact'],
    physics: { speed: 0.9, accel: 0.98, grip: 1.05, turn: 1.14, boost: 0.9, slide: 1.12 },
    body: body('roadster', {
      length: 3.96, width: 1.76, wheelRadius: 0.34, wheelbase: 1.18,
      cabinLength: 1.3, cabinWidth: 1.42, cabinHeight: 0.34, cabinZ: -0.22,
      roofLength: 0.9, roofWidth: 1.2, rideHeight: 0.44,
      noseDrop: 0.6, tailHeight: 0.7,
    }),
  },
  {
    id: 'viper',
    name: 'VIPER X',
    klass: 'SUPERCAR',
    category: 'super',
    price: 96000,
    unlockRank: 3,
    tagline: 'A blunt instrument with a rocket strapped to the back. Point, squeeze, pray.',
    description:
      'Mid-engine, rear-drive and completely uninterested in your comfort. The Viper X trades the last word in agility for a top end that keeps pulling long after the horizon has given up.',
    paint: '#e8173b',
    specs: { power: 640, weight: 1495, topSpeed: 322, drivetrain: 'RWD' },
    stats: { speed: 10, accel: 8, handling: 5, drift: 4 },
    pros: ['Highest top speed in its class', 'Nitro hits like a sledgehammer'],
    cons: ['Heavy nose, wide turning circle', 'Punishes sloppy corner exits'],
    physics: { speed: 1.12, accel: 1.1, grip: 0.9, turn: 0.86, boost: 1.3, slide: 1.12 },
    body: body('super', {
      length: 4.8, width: 2.06, wheelRadius: 0.4, wheelbase: 1.5,
      cabinLength: 1.72, cabinWidth: 1.5, cabinHeight: 0.44, cabinZ: -0.36,
      roofLength: 1.1, roofWidth: 1.34, rideHeight: 0.46,
      noseDrop: 0.58, tailHeight: 0.78, vents: true, ducktail: false,
    }),
  },
  {
    id: 'nova',
    name: 'NOVA SV',
    klass: 'TRACK SUPER',
    category: 'super',
    price: 128000,
    unlockRank: 4,
    tagline: 'A road-legal race car with air conditioning and a short temper.',
    description:
      'Every panel, vent and wing on the Nova exists to make the next corner faster. It is the most balanced supercar in the game: less dramatic than the Viper, but devastatingly consistent over a full race distance.',
    paint: '#a855f7',
    specs: { power: 690, weight: 1380, topSpeed: 318, drivetrain: 'RWD' },
    stats: { speed: 9, accel: 9, handling: 7, drift: 6 },
    pros: ['Race-car balance at any speed', 'Aero keeps it planted'],
    cons: ['Expensive to repair', 'Low ground clearance'],
    physics: { speed: 1.08, accel: 1.12, grip: 0.97, turn: 0.96, boost: 1.18, slide: 0.98 },
    body: body('super', {
      length: 4.7, width: 2.02, wheelRadius: 0.39, wheelbase: 1.46,
      cabinLength: 1.66, cabinWidth: 1.48, cabinHeight: 0.42, cabinZ: -0.34,
      roofLength: 1.06, roofWidth: 1.32, rideHeight: 0.44,
      noseDrop: 0.54, tailHeight: 0.76, vents: true, scoop: true,
    }),
  },
  {
    id: 'sovereign',
    name: 'SOVEREIGN GT12',
    klass: 'GRAND TOURER',
    category: 'super',
    price: 195000,
    unlockRank: 4,
    tagline: 'A front-engined V12 grand tourer that crosses continents before lunch.',
    description:
      'An endless bonnet, a cabin pushed right back onto the rear axle and a twin-turbo V12 that makes its power everywhere. The Sovereign is heavier than the mid-engined cars, but it is stable at speeds where they get nervous.',
    paint: '#2447ff',
    specs: { power: 730, weight: 1690, topSpeed: 330, drivetrain: 'RWD' },
    stats: { speed: 10, accel: 8, handling: 6, drift: 7 },
    pros: ['Rock-solid at very high speed', 'Huge mid-range torque'],
    cons: ['Heavy in tight hairpins', 'Long nose hides the apex'],
    physics: { speed: 1.15, accel: 1.1, grip: 0.95, turn: 0.9, boost: 1.28, slide: 1.06 },
    body: body('gt', {
      length: 4.92, width: 2.0, wheelRadius: 0.39, wheelbase: 1.56,
      cabinLength: 1.6, cabinWidth: 1.48, cabinHeight: 0.46, cabinZ: -0.62,
      roofLength: 1.08, roofWidth: 1.3, rideHeight: 0.48,
      noseDrop: 0.68, tailHeight: 0.8, vents: true,
    }),
  },
  {
    id: 'aurora',
    name: 'AURORA V12',
    klass: 'HYPERCAR',
    category: 'hyper',
    price: 320000,
    unlockRank: 4,
    tagline: 'A naturally aspirated V12 wrapped in carbon and bad decisions.',
    description:
      'The old-school hypercar: no turbos, no hybrid trickery, just twelve cylinders screaming behind your head. The Aurora is alive in a way modern cars are not, and it asks for a driver who can keep up.',
    paint: '#ffb23d',
    specs: { power: 780, weight: 1520, topSpeed: 340, drivetrain: 'RWD' },
    stats: { speed: 10, accel: 10, handling: 8, drift: 7 },
    pros: ['Relentless naturally aspirated power', 'Superb steering feedback'],
    cons: ['Snaps without warning', 'Very long braking distances'],
    physics: { speed: 1.2, accel: 1.22, grip: 1.0, turn: 1.0, boost: 1.4, slide: 0.9 },
    body: body('hyper', {
      length: 4.78, width: 2.08, wheelRadius: 0.39, wheelbase: 1.48,
      cabinLength: 1.5, cabinWidth: 1.46, cabinHeight: 0.4, cabinZ: -0.3,
      roofLength: 0.96, roofWidth: 1.3, rideHeight: 0.4,
      noseDrop: 0.5, tailHeight: 0.74, vents: true, scoop: true,
    }),
  },
  {
    id: 'phantom',
    name: 'PHANTOM ONE',
    klass: 'HYPERCAR',
    category: 'hyper',
    price: 480000,
    unlockRank: 4,
    tagline: 'The final boss. Carbon, electric torque fill and no excuses left.',
    description:
      'A limited-run hypercar with a hybrid V8, active aero and a chassis developed on a simulator for two years before it ever turned a wheel. Nothing in the catalogue is faster over a lap.',
    paint: '#f1ece2',
    specs: { power: 986, weight: 1390, topSpeed: 356, drivetrain: 'AWD' },
    stats: { speed: 10, accel: 10, handling: 10, drift: 8 },
    pros: ['The fastest car in the game', 'Active aero and immense grip'],
    cons: ['Half a million credits', 'So fast it shrinks the road'],
    physics: { speed: 1.24, accel: 1.26, grip: 1.06, turn: 1.06, boost: 1.45, slide: 0.85 },
    body: body('hyper', {
      length: 4.84, width: 2.12, wheelRadius: 0.4, wheelbase: 1.52,
      cabinLength: 1.46, cabinWidth: 1.44, cabinHeight: 0.38, cabinZ: -0.28,
      roofLength: 0.92, roofWidth: 1.28, rideHeight: 0.38,
      noseDrop: 0.46, tailHeight: 0.72, vents: true, scoop: true, ducktail: true,
    }),
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

export const STORAGE_KEY = 'sunset-drift-save-v2';
export const LEGACY_STORAGE_KEY = 'sunset-drift-profile-v1';
export const LEGACY_BEST_KEY = 'sunset-drift-best-v1';
export const STARTING_MONEY = 30000;

export const STAT_LABELS = [
  ['speed', 'SPEED'],
  ['accel', 'ACCEL'],
  ['handling', 'HANDLING'],
  ['drift', 'DRIFT'],
];

export const RANK_LABELS = ['Rookie', 'Club', 'Pro', 'Elite', 'Legend'];

export function getCar(id) {
  return CARS.find((car) => car.id === id) || CARS[0];
}

export function getCategory(id) {
  return CATEGORIES.find((category) => category.id === id) || CATEGORIES[0];
}

export function defaultLook(car) {
  return {
    paint: car.paint,
    finish: 'gloss',
    rim: RIM_COLORS[0].hex,
    rimStyle: 'spoke',
    spoiler: car.category === 'hyper' || car.category === 'super' ? 'big'
      : car.category === 'sports' && car.body?.style !== 'roadster' ? 'gt'
        : 'lip',
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

export function formatCredits(value) {
  return Math.round(value || 0).toLocaleString('en-US');
}

export function rankForWins(wins = 0, completed = 0) {
  const score = wins * 2 + completed;
  if (score >= 24) return 4;
  if (score >= 14) return 3;
  if (score >= 7) return 2;
  if (score >= 2) return 1;
  return 0;
}
