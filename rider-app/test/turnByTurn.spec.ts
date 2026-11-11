import type { NavStep } from '../src/services/routing';
import { offsetPoint } from '../src/utils/geo';
import {
  bearingDeg,
  computeProgress,
  dueAnnouncement,
  formatManeuverDistance,
  maneuverIcon,
  projectOntoLine,
} from '../src/utils/turnByTurn';

// Synthetic Takoradi route: 300 m north (A→B), turn right, 400 m east (B→C), arrive at C.
const A = { latitude: 4.9, longitude: -1.755 };
const B = offsetPoint(A, 300, 0);
const C = offsetPoint(B, 400, 90);
const along = (from: typeof A, m: number, bearing: number) => offsetPoint(from, m, bearing);

const steps: NavStep[] = [
  {
    instruction: 'Head north on Harbour Road.',
    type: 'depart',
    name: 'Harbour Road',
    distanceMeters: 300,
    durationSeconds: 60,
    geometry: [A, along(A, 150, 0), B],
    voice: [
      { distanceAlongGeometry: 250, announcement: 'In 250 meters, turn right onto Market Street.' },
      { distanceAlongGeometry: 50, announcement: 'Turn right onto Market Street.' },
    ],
    banner: { text: 'Market Street', type: 'turn', modifier: 'right' },
  },
  {
    instruction: 'Turn right onto Market Street.',
    type: 'turn',
    modifier: 'right',
    name: 'Market Street',
    distanceMeters: 400,
    durationSeconds: 80,
    geometry: [B, C],
    voice: [{ distanceAlongGeometry: 100, announcement: 'You will arrive at your destination.' }],
    banner: { text: 'Your destination', type: 'arrive' },
  },
  {
    instruction: 'You have arrived.',
    type: 'arrive',
    name: 'Market Street',
    distanceMeters: 0,
    durationSeconds: 0,
    geometry: [C, C],
    voice: [],
    banner: null,
  },
];

describe('projectOntoLine', () => {
  it('measures offset and distance left to the end of the line', () => {
    const p = along(A, 100, 0);
    const r = projectOntoLine(p, [A, B]);
    expect(r.offset).toBeLessThan(1);
    expect(r.remaining).toBeCloseTo(200, -1);
    expect(r.bearing).toBeCloseTo(0, 0);
  });

  it('reports how far off the line a point is', () => {
    const p = along(along(A, 100, 0), 80, 270); // 80 m west of the road
    expect(projectOntoLine(p, [A, B]).offset).toBeCloseTo(80, -1);
  });
});

describe('computeProgress', () => {
  it('starts on the first step with the full route ahead', () => {
    const p = computeProgress(steps, A, 0);
    expect(p.stepIndex).toBe(0);
    expect(p.distanceToManeuver).toBeCloseTo(300, -1);
    expect(p.remainingMeters).toBeCloseTo(700, -1);
    expect(p.remainingSeconds).toBeCloseTo(140, -1);
    expect(p.banner).toEqual({ text: 'Market Street', type: 'turn', modifier: 'right' });
    expect(p.roadName).toBe('Harbour Road');
    expect(p.arrived).toBe(false);
  });

  it('advances to the next step after the turn', () => {
    const p = computeProgress(steps, along(B, 100, 90), 0);
    expect(p.stepIndex).toBe(1);
    expect(p.distanceToManeuver).toBeCloseTo(300, -1);
    expect(p.bearing).toBeCloseTo(90, 0);
  });

  it('never goes backwards to an earlier step', () => {
    const p = computeProgress(steps, along(A, 50, 0), 1);
    expect(p.stepIndex).toBe(1);
  });

  it('flags the rider as off route', () => {
    const p = computeProgress(steps, along(along(A, 150, 0), 200, 270), 0);
    expect(p.offRouteMeters).toBeGreaterThan(150);
  });

  it('reports arrival close to the destination', () => {
    expect(computeProgress(steps, along(C, 20, 270), 1).arrived).toBe(true);
    expect(computeProgress(steps, along(C, 120, 270), 1).arrived).toBe(false);
  });
});

describe('dueAnnouncement', () => {
  it('speaks each prompt once, when its distance is reached', () => {
    const spoken = new Set<string>();
    expect(dueAnnouncement(steps, computeProgress(steps, along(A, 10, 0), 0), spoken)).toBeNull();

    const at100 = computeProgress(steps, along(A, 100, 0), 0); // 200 m to the turn
    expect(dueAnnouncement(steps, at100, spoken)).toBe('In 250 meters, turn right onto Market Street.');
    expect(dueAnnouncement(steps, at100, spoken)).toBeNull(); // not repeated

    const at260 = computeProgress(steps, along(A, 260, 0), 0); // 40 m to the turn
    expect(dueAnnouncement(steps, at260, spoken)).toBe('Turn right onto Market Street.');
  });

  it('after a GPS jump, says only the most relevant prompt', () => {
    const spoken = new Set<string>();
    const near = computeProgress(steps, along(A, 270, 0), 0); // both thresholds passed at once
    expect(dueAnnouncement(steps, near, spoken)).toBe('Turn right onto Market Street.');
    expect(dueAnnouncement(steps, near, spoken)).toBeNull();
  });
});

describe('maneuverIcon / formatManeuverDistance / bearingDeg', () => {
  it.each([
    ['turn', 'right', 'arrow-right-top'],
    ['turn', 'slight left', 'arrow-top-left'],
    ['turn', 'uturn', 'arrow-u-left-top'],
    ['rotary', 'slight right', 'rotate-left'],
    ['arrive', undefined, 'flag-checkered'],
    ['continue', 'straight', 'arrow-up'],
  ])('%s/%s → %s', (type, modifier, icon) => {
    expect(maneuverIcon(type, modifier)).toBe(icon);
  });

  it.each([
    [8, 'Now'],
    [47, '45 m'],
    [348, '350 m'],
    [2480, '2.5 km'],
  ])('%p m → %p', (m, text) => {
    expect(formatManeuverDistance(m)).toBe(text);
  });

  it('computes compass bearings', () => {
    expect(bearingDeg(A, B)).toBeCloseTo(0, 0);
    expect(bearingDeg(B, C)).toBeCloseTo(90, 0);
  });
});
