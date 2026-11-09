/**
 * GhanaDash Rider Design Tokens
 * Tailored for high-glare tropical sunlight & handlebar mount visibility in Takoradi, Ghana.
 */

export const Colors = {
  // Base Surfaces
  background: '#0B0E14',
  card: '#161B26',
  cardBorder: '#283142',
  cardHover: '#1E2534',
  surfaceLight: '#1F2633',

  // Brand & Dispatch Status
  dispatchGreen: '#00C853',
  dispatchGreenGlow: 'rgba(0, 200, 83, 0.25)',
  dispatchGreenLight: '#69F0AE',
  
  // Tactical Warnings & Paystack Renewal
  amberAlert: '#FF6D00',
  amberAlertGlow: 'rgba(255, 109, 0, 0.25)',
  amberLight: '#FFB74D',
  amberDark: '#2A2415',
  amberBorder: '#614C1D',

  // Critical / Expired / Lock
  dangerRed: '#FF3B30',
  dangerRedGlow: 'rgba(255, 59, 48, 0.25)',
  dangerDark: '#381A1A',
  dangerBorder: '#7F1D1D',

  // Typography
  textPrimary: '#FFFFFF',
  textSecondary: '#9EABB8',
  textMuted: '#6B7A8C',
  textInverse: '#0B0E14',

  // Accents & Maps
  harborBlue: '#2979FF',
  roadRoute: '#00E5FF',
};

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
};

export const Typography = {
  h1: { fontSize: 24, fontWeight: '800' as const, letterSpacing: 0.5 },
  h2: { fontSize: 20, fontWeight: '700' as const, letterSpacing: 0.3 },
  h3: { fontSize: 17, fontWeight: '700' as const },
  body: { fontSize: 15, fontWeight: '400' as const },
  bodyBold: { fontSize: 15, fontWeight: '600' as const },
  caption: { fontSize: 13, fontWeight: '500' as const },
  micro: { fontSize: 11, fontWeight: '700' as const, letterSpacing: 1 },
  telemetry: { fontSize: 14, fontWeight: '700' as const, letterSpacing: 1 },
  statHero: { fontSize: 32, fontWeight: '900' as const, letterSpacing: -0.5 },
};

export const Radii = {
  sm: 6,
  md: 10,
  lg: 14,
  xl: 18,
  pill: 9999,
};
