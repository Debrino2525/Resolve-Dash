/**
 * GhanaDash customer design tokens (light, 2026), from the Stitch brief: brand green #00C853
 * for primary actions, deep ink #07090D for text, soft surfaces #F5F7FA, semantic amber/red,
 * info blue. Token names match the rider app so shared components work in both.
 *
 * Contrast: #00C853 is a fill colour only (dark ink text on it). Green *text* on white uses the
 * darker `dispatchGreenLight` (#007A35) to stay readable in bright sun.
 */
export const Colors = {
  background: '#F5F7FA',
  card: '#FFFFFF',
  cardHover: '#EEF1F5',
  surfaceLight: '#EEF1F5',
  cardBorder: '#E1E6ED',
  overlay: 'rgba(7, 9, 13, 0.45)',

  dispatchGreen: '#00C853',
  dispatchGreenLight: '#007A35',
  dispatchGreenGlow: 'rgba(0, 200, 83, 0.12)',
  onBrand: '#04210F',

  amberAlert: '#FF9F0A',
  amberLight: '#8A5300',
  amberDark: '#FFF4E0',
  amberBorder: '#F5D49A',
  amberAlertGlow: 'rgba(255, 159, 10, 0.14)',

  dangerRed: '#C62828',
  dangerDark: '#FDECEA',
  dangerBorder: '#F5C2BD',
  dangerRedGlow: 'rgba(255, 90, 79, 0.14)',

  textPrimary: '#07090D',
  textSecondary: '#4A5466',
  textMuted: '#667185',
  textInverse: '#FFFFFF',

  harborBlue: '#2F6FE0',
  harborBlueGlow: 'rgba(76, 141, 255, 0.14)',
  roadRoute: '#2F6FE0',
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
  micro: { fontSize: 12, fontWeight: '600' as const, letterSpacing: 0.2 },
  telemetry: { fontSize: 14, fontWeight: '700' as const, letterSpacing: 0.4 },
  statHero: { fontSize: 32, fontWeight: '800' as const, letterSpacing: -0.6 },
};

export const Radii = { sm: 8, md: 12, lg: 16, xl: 24, pill: 9999 };

export const TOUCH_TARGET = 48;

export const Elevation = {
  card: {
    shadowColor: '#0B1320',
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  floating: {
    shadowColor: '#0B1320',
    shadowOpacity: 0.16,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  sheet: {
    shadowColor: '#0B1320',
    shadowOpacity: 0.14,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: -6 },
    elevation: 16,
  },
};
