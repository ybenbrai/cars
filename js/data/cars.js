// Vehicle catalogue, tuning personalities, economy data and cosmetic options.
//
// The roster is modelled on real production cars. Internal `id`s stay stable
// so existing saves, career progress and records keep working even though the
// display name, class, specs and factory paint now describe the real car.
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
    name: 'KOTO MIRA',
    klass: 'CITY HATCH',
    category: 'hatch',
    price: 0,
    unlockRank: 0,
    starter: true,
    tagline: 'The honest city hatch: light, cheap and endlessly willing.',
    description:
      "Koto's everyday supermini in its purest form. The 1.5-litre four revs sweetly, the short wheelbase turns in eagerly and the narrow tyres teach momentum before they teach grip. A brilliant first car.",
    paint: '#f4c430',
    specs: { power: 118, weight: 1040, topSpeed: 196, drivetrain: 'FWD' },
    stats: { speed: 4, accel: 5, handling: 5, drift: 4 },
    pros: ['Cheap to run and genuinely reliable', 'Light enough to carry speed through corners'],
    cons: ['Out of breath on long straights', 'Narrow tyres run out of grip early'],
    physics: { speed: 0.82, accel: 0.9, grip: 0.95, turn: 1.05, boost: 0.8, slide: 1.15 },
    body: body('hatch', {
      length: 3.82, width: 1.74, wheelRadius: 0.31, wheelbase: 1.2,
      cabinLength: 2.05, cabinWidth: 1.44, cabinHeight: 0.6, cabinZ: -0.24,
      roofLength: 1.45, roofWidth: 1.26, rideHeight: 0.48,
      noseDrop: 0.68, tailHeight: 0.7,
    }),
    design: { headlight: 'reflector', drl: 'straight', grille: 'mesh', tail: 'clusters' },
  },
  {
    id: 'volt',
    name: 'HALDEN SPRINT R',
    klass: 'HOT HATCH',
    category: 'hatch',
    price: 14000,
    unlockRank: 0,
    tagline: 'The original hot hatch, still the benchmark for everyday speed.',
    description:
      "The Sprint R makes speed feel effortless: a torquey 2.0 turbo four, a quick-shifting twin-clutch box and a chassis that stays composed long after the sensible-hatchback labels have fallen away.",
    paint: '#c8102e',
    specs: { power: 228, weight: 1320, topSpeed: 250, drivetrain: 'FWD' },
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
    design: { headlight: 'projector', drl: 'u-shape', grille: 'slat', tail: 'clusters' },
  },
  {
    id: 'orion',
    name: 'TAKEDA ARROW TYPE-Z',
    klass: 'TRACK HATCH',
    category: 'hatch',
    price: 18500,
    unlockRank: 0,
    tagline: 'A front-wheel-drive race car with number plates and a rear wing.',
    description:
      "Takeda's Arrow Type-Z turns a humble five-door into a lap-record hunter. The 306 hp turbo four pulls hard to 7,000 rpm, the limited-slip diff drags it out of corners and the huge rear wing keeps it planted.",
    paint: '#d71920',
    specs: { power: 306, weight: 1380, topSpeed: 272, drivetrain: 'FWD' },
    stats: { speed: 7, accel: 7, handling: 8, drift: 5 },
    pros: ['Front-end grip that defies the layout', 'One of the great manual gearboxes'],
    cons: ['Firm ride on broken roads', 'The styling is not for everyone'],
    physics: { speed: 0.93, accel: 1.0, grip: 1.03, turn: 1.06, boost: 0.98, slide: 1.04 },
    body: body('hatch', {
      length: 4.37, width: 1.81, wheelRadius: 0.34, wheelbase: 1.33,
      cabinLength: 2.12, cabinWidth: 1.46, cabinHeight: 0.56, cabinZ: -0.26,
      roofLength: 1.52, roofWidth: 1.28, rideHeight: 0.47,
      noseDrop: 0.72, tailHeight: 0.76,
    }),
    look: { spoiler: 'big' },
    design: { headlight: 'slim', drl: 'c-hook', grille: 'mesh', tail: 'c-shape' },
  },
  {
    id: 'meridian',
    name: 'HALDEN AURA 30',
    klass: 'SPORTS SEDAN',
    category: 'sedan',
    price: 19000,
    unlockRank: 0,
    tagline: 'The everyday sports saloon: balanced, quick and quietly confident.',
    description:
      "The sensible Halden done right. A 255 hp turbo four, a near-perfect weight split and a chassis that settles beautifully at speed make it a relaxed long-distance car that still enjoys a twisty road.",
    paint: '#2f6fb0',
    specs: { power: 255, weight: 1545, topSpeed: 250, drivetrain: 'RWD' },
    stats: { speed: 6, accel: 5, handling: 6, drift: 5 },
    pros: ['Beautifully balanced chassis', 'Comfortable at any speed'],
    cons: ['Needs revs to feel quick', 'Options list gets expensive'],
    physics: { speed: 0.96, accel: 0.95, grip: 1.0, turn: 0.95, boost: 0.9, slide: 1.15 },
    body: body('sedan', {
      length: 4.78, width: 1.9, wheelRadius: 0.36, wheelbase: 1.62,
      cabinLength: 2.3, cabinWidth: 1.52, cabinHeight: 0.55, cabinZ: -0.18,
      roofLength: 1.45, roofWidth: 1.34, rideHeight: 0.54,
      noseDrop: 0.78, tailHeight: 0.82,
    }),
    design: { headlight: 'laser', drl: 'halo', grille: 'kidney', tail: 'l-shape' },
  },
  {
    id: 'regent',
    name: 'HALDEN R3 COMPETITION',
    klass: 'PERFORMANCE SEDAN',
    category: 'sedan',
    price: 29000,
    unlockRank: 2,
    tagline: 'A four-door M car with a motorsport heart and a short fuse.',
    description:
      "The R3 Competition pairs a 503 hp twin-turbo straight-six with the sharpest chassis Halden has put under a saloon in years. Stable when you want it, happy to rotate when you ask.",
    paint: '#1f5c3a',
    specs: { power: 503, weight: 1730, topSpeed: 290, drivetrain: 'RWD' },
    stats: { speed: 8, accel: 8, handling: 8, drift: 5 },
    pros: ['Enormous corner-exit traction', 'Stable under heavy braking'],
    cons: ['Feels heavy on the nose', 'Needs commitment to rotate'],
    physics: { speed: 1.02, accel: 1.06, grip: 1.04, turn: 0.99, boost: 1.04, slide: 1.08 },
    body: body('sedan', {
      length: 4.92, width: 1.95, wheelRadius: 0.38, wheelbase: 1.66,
      cabinLength: 2.24, cabinWidth: 1.54, cabinHeight: 0.52, cabinZ: -0.2,
      roofLength: 1.38, roofWidth: 1.36, rideHeight: 0.5,
      noseDrop: 0.74, tailHeight: 0.8, vents: true, ducktail: true,
    }),
    design: { headlight: 'laser', drl: 'halo', grille: 'kidney', tail: 'l-shape' },
  },
  {
    id: 'monarch',
    name: 'VOGEL ARGENT 63',
    klass: 'LUXURY SALOON',
    category: 'sedan',
    price: 88000,
    unlockRank: 3,
    tagline: 'Five metres of calm, then the twin-turbo V8 wakes up.',
    description:
      "The Argent 63 is a private jet for the road: air suspension, a hand-built 4.0-litre twin-turbo V8 and a cabin that hushes the world outside. Heavy, but the torque and all-wheel drive make it devastating on fast sweepers.",
    paint: '#14161c',
    specs: { power: 577, weight: 2070, topSpeed: 300, drivetrain: 'AWD' },
    stats: { speed: 8, accel: 6, handling: 6, drift: 4 },
    pros: ['Huge high-speed stability', 'Strong mid-range shove'],
    cons: ['Heaviest car outside the SUVs', 'Reluctant to change direction quickly'],
    physics: { speed: 1.08, accel: 1.02, grip: 1.03, turn: 0.92, boost: 1.06, slide: 1.18 },
    body: body('sedan', {
      length: 5.28, width: 1.98, wheelRadius: 0.39, wheelbase: 1.6,
      cabinLength: 2.62, cabinWidth: 1.58, cabinHeight: 0.5, cabinZ: -0.26,
      roofLength: 1.74, roofWidth: 1.4, rideHeight: 0.5,
      noseDrop: 0.78, tailHeight: 0.84, flagship: true,
    }),
    // Factory spec: no stripes or wing, metallic paint, dark privacy glass.
    look: { stripe: 'none', spoiler: 'none', finish: 'metallic', tint: 'dark' },
    design: { headlight: 'slim', drl: 'three-strip', grille: 'slat', tail: 'clusters' },
  },
  {
    id: 'falcon',
    name: 'KOTO RONIN GT',
    klass: 'SPORTS COUPE',
    category: 'sports',
    price: 21000,
    unlockRank: 0,
    tagline: 'A short-wheelbase coupe with a straight-six and a point to prove.',
    description:
      "The Ronin GT revives a legend with a turbocharged straight-six, rear-wheel drive and a short wheelbase. Quick, balanced and surprisingly friendly, with a punchy mid-range that loves a long corner.",
    paint: '#f5c518',
    specs: { power: 382, weight: 1540, topSpeed: 250, drivetrain: 'RWD' },
    stats: { speed: 7, accel: 8, handling: 8, drift: 6 },
    pros: ['Punchy turbo straight-six', 'Confidence-inspiring balance'],
    cons: ['Tight cabin', 'Not the last word in steering feel'],
    physics: { speed: 1.0, accel: 1.0, grip: 1.0, turn: 1.0, boost: 1.0, slide: 1.0 },
    body: body('sports', {
      length: 4.35, width: 1.92, wheelRadius: 0.37, wheelbase: 1.38,
      cabinLength: 2.0, cabinWidth: 1.52, cabinHeight: 0.52, cabinZ: -0.25,
      roofLength: 1.25, roofWidth: 1.32, rideHeight: 0.55,
      noseDrop: 0.82, tailHeight: 0.86, scoop: false, vents: false, ducktail: false,
    }),
    design: { headlight: 'slim', drl: 'l-shape', grille: 'split', tail: 'strip' },
  },
  {
    id: 'comet',
    name: 'VOGEL ORBIT RS',
    klass: 'COMPACT SPORTS',
    category: 'sports',
    price: 31000,
    unlockRank: 1,
    tagline: 'A compact coupe with a five-cylinder war cry and all-wheel-drive grip.',
    description:
      "The Orbit RS hides a 394 hp five-cylinder under its rounded body. The sound is unforgettable, the seven-speed twin-clutch shifts instantly and all-wheel drive puts every horse down, even in the wet.",
    paint: '#1f6feb',
    specs: { power: 394, weight: 1510, topSpeed: 280, drivetrain: 'AWD' },
    stats: { speed: 8, accel: 10, handling: 8, drift: 5 },
    pros: ['Fastest launch off the line', 'Nimble through tight complexes'],
    cons: ['Nose-heavy in slow corners', 'Firm ride on the standard suspension'],
    physics: { speed: 0.97, accel: 1.2, grip: 1.04, turn: 1.08, boost: 1.05, slide: 1.03 },
    body: body('sports', {
      length: 4.0, width: 1.9, wheelRadius: 0.38, wheelbase: 1.26,
      cabinLength: 2.1, cabinWidth: 1.54, cabinHeight: 0.62, cabinZ: -0.15,
      roofLength: 1.35, roofWidth: 1.34, rideHeight: 0.57,
      noseDrop: 0.84, tailHeight: 0.94, scoop: true, vents: false, ducktail: false,
    }),
    design: { headlight: 'projector', drl: 'l-shape', grille: 'hex', tail: 'clusters' },
  },
  {
    id: 'kaze',
    name: 'TAKEDA KAZE WRS',
    klass: 'RALLY SEDAN',
    category: 'offroad',
    price: 23000,
    unlockRank: 1,
    tagline: 'All-wheel drive, a boxer rumble and a permanent invitation to go sideways.',
    description:
      "The Kaze WRS is rally hardware for the road: a 305 hp turbo flat-four, all-wheel drive and a chassis that thrives on loose surfaces. On tarmac it grips hard, but the rear-biased diff lets it slide on demand.",
    paint: '#1f4fd8',
    specs: { power: 305, weight: 1560, topSpeed: 255, drivetrain: 'AWD' },
    stats: { speed: 6, accel: 7, handling: 9, drift: 9 },
    pros: ['Biggest, most controllable drift angle', 'Telepathic steering feel'],
    cons: ['Low top speed', 'Twitchy over uneven ground'],
    physics: { speed: 0.94, accel: 0.98, grip: 0.93, turn: 1.14, boost: 0.95, slide: 0.72 },
    body: body('offroad', {
      length: 4.18, width: 1.9, wheelRadius: 0.38, wheelbase: 1.32,
      cabinLength: 1.95, cabinWidth: 1.5, cabinHeight: 0.55, cabinZ: -0.2,
      roofLength: 1.2, roofWidth: 1.3, rideHeight: 0.62,
      noseDrop: 0.78, tailHeight: 0.84, scoop: false, vents: false, ducktail: true,
    }),
    look: { spoiler: 'big' },
    design: { headlight: 'projector', drl: 'c-hook', grille: 'mesh', tail: 'clusters' },
  },
  {
    id: 'dune',
    name: 'LONGHORN DUSTRUNNER',
    klass: 'DESERT TRUCK',
    category: 'offroad',
    price: 42000,
    unlockRank: 2,
    tagline: 'Long travel, huge tyres and absolutely no respect for kerbs.',
    description:
      "Longhorn's Dustrunner is a trophy truck with a bed. A 450 hp twin-turbo V6, long-travel dampers and 35-inch tyres let it carry impossible speed across rough ground, even if it feels enormous on tarmac.",
    paint: '#ff9d2e',
    specs: { power: 450, weight: 2620, topSpeed: 170, drivetrain: '4WD' },
    stats: { speed: 5, accel: 6, handling: 5, drift: 7 },
    pros: ['Unshakeable over rough surfaces', 'Huge mechanical grip'],
    cons: ['Heavy, tall and thirsty', 'Slow to change direction'],
    physics: { speed: 0.99, accel: 1.04, grip: 1.06, turn: 1.0, boost: 1.1, slide: 0.85 },
    body: body('offroad', {
      length: 4.72, width: 2.06, wheelRadius: 0.48, wheelbase: 1.62,
      cabinLength: 1.9, cabinWidth: 1.56, cabinHeight: 0.66, cabinZ: -0.16,
      roofLength: 1.35, roofWidth: 1.48, rideHeight: 0.84,
      noseDrop: 0.96, tailHeight: 1.0, scoop: true,
    }),
    look: { spoiler: 'none' },
    design: { headlight: 'reflector', drl: 'c-clamp', grille: 'mesh', tail: 'clusters' },
  },
  {
    id: 'titan',
    name: 'KESSLER KANTO S',
    klass: 'PERFORMANCE SUV',
    category: 'suv',
    price: 38000,
    unlockRank: 2,
    tagline: 'A two-tonne SUV that has clearly been to the gym.',
    description:
      "The Kanto S proves a tall car can still be a sports car. A 400 hp twin-turbo V6, active all-wheel drive and Kessler's chassis tuning hide most of the mass, and the brakes are strong enough to embarrass hot hatches.",
    paint: '#5c6470',
    specs: { power: 400, weight: 2210, topSpeed: 258, drivetrain: 'AWD' },
    stats: { speed: 6, accel: 6, handling: 7, drift: 5 },
    pros: ['Massive stability at speed', 'Shrugs off kerbs and contact'],
    cons: ['Very heavy under braking', 'Slow to rotate in tight corners'],
    physics: { speed: 0.95, accel: 0.95, grip: 1.02, turn: 0.92, boost: 1.0, slide: 1.05 },
    body: body('suv', {
      length: 4.96, width: 2.02, wheelRadius: 0.46, wheelbase: 1.72,
      cabinLength: 2.5, cabinWidth: 1.62, cabinHeight: 0.78, cabinZ: -0.16,
      roofLength: 1.8, roofWidth: 1.5, rideHeight: 0.82,
      noseDrop: 0.92, tailHeight: 1.02, vents: true,
    }),
    design: { headlight: 'projector', drl: 'four-dot', grille: 'slat', tail: 'bar' },
  },
  {
    id: 'ridge',
    name: 'ASHCOMBE HIGHLANDER XR',
    klass: 'LUXURY SUV',
    category: 'suv',
    price: 48000,
    unlockRank: 3,
    tagline: 'A luxury lounge with a supercharged V8 and a mean streak.',
    description:
      "The Highlander XR is the loudest, fastest version of an already capable SUV. A 542 hp supercharged V8, air suspension and a clever torque split make it far more entertaining than its size suggests.",
    paint: '#1f5fa8',
    specs: { power: 542, weight: 2310, topSpeed: 283, drivetrain: 'AWD' },
    stats: { speed: 7, accel: 7, handling: 7, drift: 6 },
    pros: ['Traction everywhere', 'Excellent high-speed stability'],
    cons: ['Turns like a building', 'Brakes fade after two laps'],
    physics: { speed: 1.0, accel: 1.0, grip: 1.06, turn: 1.0, boost: 1.05, slide: 0.96 },
    body: body('suv', {
      length: 5.02, width: 2.04, wheelRadius: 0.47, wheelbase: 1.76,
      cabinLength: 2.56, cabinWidth: 1.64, cabinHeight: 0.8, cabinZ: -0.18,
      roofLength: 1.85, roofWidth: 1.52, rideHeight: 0.86,
      noseDrop: 0.94, tailHeight: 1.04, vents: true, ducktail: true,
    }),
    design: { headlight: 'slim', drl: 'u-shape', grille: 'slat', tail: 'bar' },
  },
  {
    id: 'vandal',
    name: 'LONGHORN STALLION GT',
    klass: 'MUSCLE COUPE',
    category: 'muscle',
    price: 34000,
    unlockRank: 1,
    tagline: 'A big V8, a long hood and a short fuse.',
    description:
      "The Stallion GT is modern muscle done right: a 460 hp 5.0-litre V8, a six-speed manual and a chassis that finally likes corners. It still rewards a patient right foot, especially in the wet.",
    paint: '#e8173b',
    specs: { power: 460, weight: 1700, topSpeed: 250, drivetrain: 'RWD' },
    stats: { speed: 9, accel: 8, handling: 5, drift: 6 },
    pros: ['Devastating on long straights', 'Huge torque out of slow corners'],
    cons: ['Reluctant to change direction', 'Wheels spin under eager throttle'],
    physics: { speed: 1.1, accel: 1.14, grip: 0.88, turn: 0.9, boost: 1.22, slide: 1.0 },
    body: body('muscle', {
      length: 4.86, width: 2.0, wheelRadius: 0.4, wheelbase: 1.58,
      cabinLength: 1.9, cabinWidth: 1.56, cabinHeight: 0.5, cabinZ: -0.28,
      roofLength: 1.25, roofWidth: 1.4, rideHeight: 0.56,
      noseDrop: 0.82, tailHeight: 0.9, scoop: true, ducktail: true,
    }),
    design: { headlight: 'projector', drl: 'tri-bar', grille: 'hex', tail: 'tri-bar' },
  },
  {
    id: 'duke',
    name: 'BRAXTON HELLHOUND',
    klass: 'SUPERCHARGED MUSCLE',
    category: 'muscle',
    price: 52000,
    unlockRank: 3,
    tagline: 'The biggest engine in the room, wrapped in the widest body.',
    description:
      "The Hellhound is a 717 hp supercharged muscle car with old-school proportions and modern power. It is not subtle, it is not light, and it is absolutely unforgettable once the supercharger starts to whine.",
    paint: '#a855f7',
    specs: { power: 717, weight: 2000, topSpeed: 290, drivetrain: 'RWD' },
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
    design: { headlight: 'quad', drl: 'halo', grille: 'mesh', tail: 'bar' },
  },
  {
    id: 'kestrel',
    name: 'KOTO KESTREL RS',
    klass: 'ROADSTER',
    category: 'sports',
    price: 26000,
    unlockRank: 1,
    tagline: 'No roof, no rear seats, no excuses. Pure wind-in-your-face balance.',
    description:
      "The Kestrel RS proves you do not need power to have fun. A 181 hp naturally aspirated four, barely a tonne of weight and near-perfect balance make every corner an event, roof down or up.",
    paint: '#a31621',
    specs: { power: 181, weight: 1058, topSpeed: 219, drivetrain: 'RWD' },
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
    look: { spoiler: 'none' },
    design: { headlight: 'projector', drl: 'l-shape', grille: 'round', tail: 'rings' },
  },
  {
    id: 'viper',
    name: 'BRAXTON SERPENT TR',
    klass: 'TRACK SUPER CAR',
    category: 'super',
    price: 96000,
    unlockRank: 3,
    tagline: 'A blunt instrument with a rocket strapped to the back. Point, squeeze, pray.',
    description:
      "The Serpent TR is a road car built for lap times: a huge naturally aspirated V10, enormous aero and almost no electronic help. It rewards commitment and punishes clumsy inputs.",
    paint: '#f2c200',
    specs: { power: 645, weight: 1560, topSpeed: 285, drivetrain: 'RWD' },
    stats: { speed: 10, accel: 8, handling: 6, drift: 4 },
    pros: ['Highest top speed in its class', 'Nitro hits like a sledgehammer'],
    cons: ['Heavy nose, wide turning circle', 'Punishes sloppy corner exits'],
    physics: { speed: 1.12, accel: 1.1, grip: 0.9, turn: 0.86, boost: 1.3, slide: 1.12 },
    body: body('super', {
      length: 4.8, width: 2.06, wheelRadius: 0.4, wheelbase: 1.5,
      cabinLength: 1.72, cabinWidth: 1.5, cabinHeight: 0.44, cabinZ: -0.36,
      roofLength: 1.1, roofWidth: 1.34, rideHeight: 0.46,
      noseDrop: 0.58, tailHeight: 0.78, vents: true, ducktail: false,
    }),
    look: { spoiler: 'big' },
    design: { headlight: 'slim', drl: 'straight', grille: 'split', tail: 'rings' },
  },
  {
    id: 'nova',
    name: 'MORELLI 740 VELOCE',
    klass: 'SUPERCAR',
    category: 'super',
    price: 128000,
    unlockRank: 4,
    tagline: 'A road-legal race car with air conditioning and a short temper.',
    description:
      "The Morelli 740 Veloce is built around a carbon tub and a 710 hp twin-turbo V8. Savagely fast, astonishingly agile and surprisingly usable, with active aerodynamics that keep it planted when it matters.",
    paint: '#ff6b1a',
    specs: { power: 710, weight: 1419, topSpeed: 341, drivetrain: 'RWD' },
    stats: { speed: 10, accel: 10, handling: 9, drift: 6 },
    pros: ['Race-car balance at any speed', 'Aero keeps it planted'],
    cons: ['Expensive to repair', 'Low ground clearance'],
    physics: { speed: 1.08, accel: 1.12, grip: 0.97, turn: 0.96, boost: 1.18, slide: 0.98 },
    body: body('super', {
      length: 4.7, width: 2.02, wheelRadius: 0.39, wheelbase: 1.46,
      cabinLength: 1.66, cabinWidth: 1.48, cabinHeight: 0.42, cabinZ: -0.34,
      roofLength: 1.06, roofWidth: 1.32, rideHeight: 0.44,
      noseDrop: 0.54, tailHeight: 0.76, vents: true, scoop: true,
    }),
    look: { spoiler: 'big' },
    design: { headlight: 'slim', drl: 'c-hook', grille: 'split', tail: 'strip' },
  },
  {
    id: 'sovereign',
    name: 'VALENZA SOVRANO V12',
    klass: 'GRAND TOURER',
    category: 'super',
    price: 195000,
    unlockRank: 4,
    tagline: 'A front-engined V12 grand tourer that crosses continents before lunch.',
    description:
      "The Sovrano is one of the last great naturally aspirated front-engined V12 GTs. Its 789 hp engine revs past 8,500 rpm, the long bonnet hides the apex and the whole car feels alive at any speed.",
    paint: '#d40000',
    specs: { power: 789, weight: 1630, topSpeed: 340, drivetrain: 'RWD' },
    stats: { speed: 10, accel: 9, handling: 7, drift: 7 },
    pros: ['Rock-solid at very high speed', 'Huge mid-range torque'],
    cons: ['Heavy in tight hairpins', 'Long nose hides the apex'],
    physics: { speed: 1.15, accel: 1.1, grip: 0.95, turn: 0.9, boost: 1.28, slide: 1.06 },
    body: body('gt', {
      length: 4.92, width: 2.0, wheelRadius: 0.39, wheelbase: 1.56,
      cabinLength: 1.6, cabinWidth: 1.48, cabinHeight: 0.46, cabinZ: -0.62,
      roofLength: 1.08, roofWidth: 1.3, rideHeight: 0.48,
      noseDrop: 0.68, tailHeight: 0.8, vents: true,
    }),
    design: { headlight: 'projector', drl: 'l-shape', grille: 'mesh', tail: 'quad' },
  },
  {
    id: 'aurora',
    name: 'AURELIO TEMPESTA SV',
    klass: 'HYPERCAR',
    category: 'hyper',
    price: 320000,
    unlockRank: 4,
    tagline: 'A naturally aspirated V12 wrapped in carbon and bad decisions.',
    description:
      "The Tempesta SV is Aurelio at its most theatrical: a 759 hp naturally aspirated V12, four-wheel steering and active aero. It is loud, dramatic and demanding, and nothing else sounds like it.",
    paint: '#8dff3d',
    specs: { power: 759, weight: 1525, topSpeed: 350, drivetrain: 'RWD' },
    stats: { speed: 10, accel: 10, handling: 9, drift: 7 },
    pros: ['Relentless naturally aspirated power', 'Superb steering feedback'],
    cons: ['Snaps without warning', 'Very long braking distances'],
    physics: { speed: 1.2, accel: 1.22, grip: 1.0, turn: 1.0, boost: 1.4, slide: 0.9 },
    body: body('hyper', {
      length: 4.78, width: 2.08, wheelRadius: 0.39, wheelbase: 1.48,
      cabinLength: 1.5, cabinWidth: 1.46, cabinHeight: 0.4, cabinZ: -0.3,
      roofLength: 0.96, roofWidth: 1.3, rideHeight: 0.4,
      noseDrop: 0.5, tailHeight: 0.74, vents: true, scoop: true,
    }),
    look: { spoiler: 'big' },
    design: { headlight: 'slim', drl: 'y-shape', grille: 'split', tail: 'y-shape' },
  },
  {
    id: 'phantom',
    name: 'VALMONT NOCTURNE W16',
    klass: 'HYPERCAR',
    category: 'hyper',
    price: 480000,
    unlockRank: 4,
    tagline: 'The final boss. 1,500 horsepower and no excuses left.',
    description:
      "The Nocturne is the ultimate road car: a quad-turbo W16, 1,479 hp, all-wheel drive and a body shaped for 420 km/h. Nothing else in the catalogue combines this much speed with this much composure.",
    paint: '#1d3f8f',
    specs: { power: 1479, weight: 1995, topSpeed: 420, drivetrain: 'AWD' },
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
    design: { headlight: 'quad', drl: 'straight', grille: 'horseshoe', tail: 'bar' },
  },
];

export const PAINTS = [
  { name: 'Racing Red', hex: '#c8102e' },
  { name: 'Guards Red', hex: '#d5001c' },
  { name: 'Solar Yellow', hex: '#f4c430' },
  { name: 'Papaya Orange', hex: '#ff6b1a' },
  { name: 'Riviera Blue', hex: '#1f6feb' },
  { name: 'WR Blue', hex: '#1f4fd8' },
  { name: 'British Racing Green', hex: '#1f5c3a' },
  { name: 'Nardo Grey', hex: '#8a8d91' },
  { name: 'Pearl White', hex: '#f1ece2' },
  { name: 'Obsidian Black', hex: '#14161c' },
  { name: 'Soul Red', hex: '#a31621' },
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
    finish: car.look?.finish ?? 'gloss',
    rim: RIM_COLORS[0].hex,
    rimStyle: 'spoke',
    spoiler: car.look?.spoiler ?? (car.category === 'hyper' || car.category === 'super' ? 'big'
      : car.category === 'sports' && car.body?.style !== 'roadster' ? 'gt'
        : 'lip'),
    // Factory cars are clean; stripes stay available in the workshop but are
    // not applied to a stock car.
    stripe: car.look?.stripe ?? 'none',
    stripeColor: STRIPE_COLORS[0].hex,
    tint: car.look?.tint ?? 'light',
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
