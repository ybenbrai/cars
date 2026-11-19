// Accessible colour choices for race gates and minimap markers.
//
// The default mode follows each circuit's own marker/accent palette, so turning
// the setting off reproduces today's colours exactly. The accessible mode swaps
// the red/green "next vs passed" distinction for warm amber against cool blue,
// with neutral idle gates. Shape cues are never changed — the pulsing arch, the
// minimap diamond and the numbered rival discs still carry the meaning on their
// own, so colour is only ever an extra signal.

export const MARKER_PALETTE_MODES = ['default', 'accessible'];

export function normalizeMarkerPaletteMode(value) {
  return value === 'accessible' ? 'accessible' : 'default';
}

// `null` gate entries mean "keep the circuit's own colour". The minimap values
// mirror the hardcoded colours used before this module existed.
const DEFAULT = {
  gate: { idle: null, next: null, passed: 0x8dffb0 },
  minimap: {
    nextRing: 'rgba(92,225,230,0.5)',
    next: '#5ce1e6',
    done: 'rgba(255,246,236,0.42)',
    player: '#ffd166',
    playerGlow: '#ff7a45',
  },
};

const ACCESSIBLE = {
  gate: { idle: 0xe8edf5, next: 0xffd23f, passed: 0x4fc3f7 },
  minimap: {
    nextRing: 'rgba(255,210,63,0.55)',
    next: '#ffd23f',
    done: 'rgba(232,237,245,0.55)',
    player: '#4fc3f7',
    playerGlow: '#4fc3f7',
  },
};

/** Resolve a saved mode against a circuit palette into concrete colours. */
export function resolveMarkerPalette(mode, base = {}) {
  const source = normalizeMarkerPaletteMode(mode) === 'accessible' ? ACCESSIBLE : DEFAULT;
  return {
    gate: {
      idle: source.gate.idle ?? base.marker ?? 0x5ce1e6,
      next: source.gate.next ?? base.accent ?? 0x5ce1e6,
      passed: source.gate.passed,
    },
    minimap: { ...source.minimap },
  };
}
