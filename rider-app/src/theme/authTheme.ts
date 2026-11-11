/**
 * Light palette for the rider app's sign-in screens (Welcome back, Sign In / Sign Up, SMS code),
 * the same as the customer app so both sign-ins look alike. Every other rider screen keeps the
 * dark theme in theme.ts. Same token names, so the shared sign-in components work unchanged.
 */
export { Elevation, Radii, Spacing, TOUCH_TARGET, Typography } from './theme';

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
