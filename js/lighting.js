// Night driving light tuning. Three r169 uses physically correct light units,
// so the old 22 cd spotlights were little more than a glow on the lens. These
// values give the player a wide, readable pool of light on the road ahead
// without lifting the whole night scene and flattening its contrast.

export const HEADLIGHT = Object.freeze({
  intensity: 260, // candela
  distance: 90, // metres before the beam fades out completely
  angle: 0.46, // half-angle in radians, about 26°
  penumbra: 0.6,
  decay: 1.1,
  aim: 20, // metres ahead of the bumper the beam points
});

export function headlightIntensity(night = true) {
  return night ? HEADLIGHT.intensity : 0;
}
