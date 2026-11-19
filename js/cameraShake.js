// Collision camera shake. Kept separate from the camera code so the impact
// feel is easy to tune and verify without a running renderer.
//
// These values replace the old 0.9 (barrier/building) and 0.55 (car contact)
// scales. Both are now well under half, so a heavy hit still reads as an impact
// without throwing the picture around.

export const IMPACT_SHAKE_SCALE = 0.35;
export const CONTACT_SHAKE_SCALE = 0.22;

export function impactShake(impact) {
  return Number.isFinite(impact) && impact > 0 ? impact * IMPACT_SHAKE_SCALE : 0;
}

export function contactShake(push) {
  return Number.isFinite(push) && push > 0 ? push * CONTACT_SHAKE_SCALE : 0;
}
