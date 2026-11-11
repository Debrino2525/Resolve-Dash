/**
 * GhanaDash Rider design tokens (v2, 2026).
 *
 * Principles: dark, high-contrast UI that stays legible in strong sunlight on a handlebar mount;
 * large touch targets (min 48dp); one brand accent (dispatch green) with semantic amber/red;
 * sentence-case labels instead of shouting caps; soft, elevated surfaces with generous radii.
 *
 * Older token names are kept (mapped to the new palette) so every screen picks up the refresh.
 */

export const Colors = {
  // Surfaces (darkest → raised)
  background: '#07090D',
  card: '#11151D',
  cardHover: '#181D27',
  surfaceLight: '#1E2430',
  cardBorder: '#232A37',
  overlay: 'rgba(5, 7, 10, 0.72)',

  // Brand
  dispatchGreen: '#00C853',
  dispatchGreenLight: '#5EF29A',
  dispatchGreenGlow: 'rgba(0, 200, 83, 0.16)',
  onBrand: '#03140A',

  // Semantic: warning
  amberAlert: '#FF9F0A',
  amberLight: '#FFC266',
  amberDark: '#2A1F0B',
  amberBorder: '#5C4115',
  amberAlertGlow: 'rgba(255, 159, 10, 0.18)',

  // Semantic: danger
  dangerRed: '#FF5A4F',
  dangerDark: '#2A1214',
  dangerBorder: '#6B2226',
  dangerRedGlow: 'rgba(255, 90, 79, 0.18)',

  // Text
  textPrimary: '#F5F7FA',
  textSecondary: '#A9B3C2',
  textMuted: '#6E7A8C',
  textInverse: '#07090D',

  // Map & info
  harborBlue: '#4C8DFF',
  harborBlueGlow: 'rgba(76, 141, 255, 0.18)',
  roadRoute: '#38E1FF',
};

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
  huge: 48,
};

export const Typography = {
  display: { fontSize: 34, fontWeight: '800' as const, letterSpacing: -0.6, lineHeight: 40 },
  h1: { fontSize: 28, fontWeight: '800' as const, letterSpacing: -0.4, lineHeight: 34 },
  h2: { fontSize: 21, fontWeight: '700' as const, letterSpacing: -0.2, lineHeight: 27 },
  h3: { fontSize: 17, fontWeight: '700' as const, lineHeight: 22 },
  body: { fontSize: 16, fontWeight: '400' as const, lineHeight: 23 },
  bodyBold: { fontSize: 16, fontWeight: '600' as const, lineHeight: 22 },
  caption: { fontSize: 13, fontWeight: '500' as const, lineHeight: 18 },
  /** Small label above inputs and sections. Sentence case, not all caps. */
  micro: { fontSize: 12, fontWeight: '600' as const, letterSpacing: 0.2 },
  telemetry: { fontSize: 14, fontWeight: '700' as const, letterSpacing: 0.4 },
  statHero: { fontSize: 32, fontWeight: '800' as const, letterSpacing: -0.6 },
};

export const Radii = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  pill: 9999,
};

/** Minimum touch target (Material/Apple guidance) for gloves and moving bikes. */
export const TOUCH_TARGET = 48;

/** Soft elevation for floating elements over the map. */
export const Elevation = {
  card: {
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  floating: {
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 10,
  },
  sheet: {
    shadowColor: '#000',
    shadowOpacity: 0.45,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: -6 },
    elevation: 16,
  },
};
