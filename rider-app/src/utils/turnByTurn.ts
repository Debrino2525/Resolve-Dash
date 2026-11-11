import type { NavBanner, NavStep } from '../services/routing';

export interface Pt {
  latitude: number;
  longitude: number;
}

/** Off route if further than this from the route line. */
export const OFF_ROUTE_METERS = 50;
/** Consecutive off-route fixes before re-routing (filters GPS jitter). */
export const OFF_ROUTE_FIXES = 3;
/** Arrived when this close to the destination (along the route). */
export const ARRIVAL_METERS = 30;

const EARTH_M_PER_DEG = 111_320;
const toRad = (d: number): number => (d * Math.PI) / 180;

/** Local flat projection (metres) around a reference latitude: accurate over a city. */
function toXY(p: Pt, refLat: number): { x: number; y: number } {
  return {
    x: p.longitude * EARTH_M_PER_DEG * Math.cos(toRad(refLat)),
    y: p.latitude * EARTH_M_PER_DEG,
  };
}

function segLen(a: Pt, b: Pt, refLat: number): number {
  const A = toXY(a, refLat);
  const B = toXY(b, refLat);
  return Math.hypot(B.x - A.x, B.y - A.y);
}

/** Compass bearing (0 = north) from a to b, in degrees. */
export function bearingDeg(a: Pt, b: Pt): number {
  const y = Math.sin(toRad(b.longitude - a.longitude)) * Math.cos(toRad(b.latitude));
  const x =
    Math.cos(toRad(a.latitude)) * Math.sin(toRad(b.latitude)) -
    Math.sin(toRad(a.latitude)) * Math.cos(toRad(b.latitude)) * Math.cos(toRad(b.longitude - a.longitude));
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

export interface Projection {
  /** Metres from the point to the line. */
  offset: number;
  /** Metres along the line from the projected point to its end. */
  remaining: number;
  /** Direction of travel at the projected point. */
  bearing: number;
}

/** Snaps `p` onto `line`; returns distance off the line and distance left to its end. */
export function projectOntoLine(p: Pt, line: Pt[]): Projection {
  if (line.length === 0) return { offset: Infinity, remaining: 0, bearing: 0 };
  if (line.length === 1) {
    return { offset: segLen(p, line[0], p.latitude), remaining: 0, bearing: 0 };
  }
  const ref = p.latitude;
  const P = toXY(p, ref);
  let best = { offset: Infinity, seg: 0, t: 0 };
  for (let i = 0; i < line.length - 1; i++) {
    const A = toXY(line[i], ref);
    const B = toXY(line[i + 1], ref);
    const dx = B.x - A.x;
    const dy = B.y - A.y;
    const len2 = dx * dx + dy * dy;
    const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((P.x - A.x) * dx + (P.y - A.y) * dy) / len2));
    const d = Math.hypot(P.x - (A.x + t * dx), P.y - (A.y + t * dy));
    if (d < best.offset) best = { offset: d, seg: i, t };
  }
  let remaining = segLen(line[best.seg], line[best.seg + 1], ref) * (1 - best.t);
  for (let i = best.seg + 1; i < line.length - 1; i++) remaining += segLen(line[i], line[i + 1], ref);
  return {
    offset: best.offset,
    remaining,
    bearing: bearingDeg(line[best.seg], line[best.seg + 1]),
  };
}

export interface NavProgress {
  /** Index of the step currently being travelled. */
  stepIndex: number;
  /** Metres to the next manoeuvre (end of the current step), along the road. */
  distanceToManeuver: number;
  remainingMeters: number;
  remainingSeconds: number;
  offRouteMeters: number;
  /** Direction of travel along the route here (for the map camera). */
  bearing: number;
  /** What to show in the banner: the upcoming manoeuvre. */
  banner: NavBanner | null;
  /** Road currently being travelled. */
  roadName: string;
  arrived: boolean;
}

/**
 * Where the rider is along the route. Searches the current step and the next few (so it can
 * advance past short steps) and never goes backwards.
 */
export function computeProgress(steps: NavStep[], position: Pt, fromStep: number): NavProgress {
  const last = steps.length - 1;
  let chosen = { k: fromStep, proj: projectOntoLine(position, steps[fromStep]?.geometry ?? []) };
  for (let k = fromStep + 1; k <= Math.min(fromStep + 3, last); k++) {
    if (steps[k].geometry.length < 2) continue; // the final "arrive" step has no length
    const proj = projectOntoLine(position, steps[k].geometry);
    // Prefer the later step on near-ties: we have reached the manoeuvre.
    if (proj.offset <= chosen.proj.offset + 5) chosen = { k, proj };
  }

  const { k, proj } = chosen;
  const step = steps[k];
  const stepFraction = step.distanceMeters > 0 ? Math.min(1, proj.remaining / step.distanceMeters) : 0;
  let remainingMeters = proj.remaining;
  let remainingSeconds = step.durationSeconds * stepFraction;
  for (let j = k + 1; j <= last; j++) {
    remainingMeters += steps[j].distanceMeters;
    remainingSeconds += steps[j].durationSeconds;
  }

  const finalLeg = k >= last - 1;
  return {
    stepIndex: k,
    distanceToManeuver: proj.remaining,
    remainingMeters,
    remainingSeconds,
    offRouteMeters: proj.offset,
    bearing: proj.bearing,
    banner: step.banner ?? (steps[k + 1] ? { text: steps[k + 1].instruction, type: steps[k + 1].type, modifier: steps[k + 1].modifier } : null),
    roadName: step.name,
    arrived: finalLeg && remainingMeters <= ARRIVAL_METERS,
  };
}

/**
 * The voice prompt due now, if any: the closest-threshold announcement for this step whose
 * trigger distance has been reached and that hasn't been spoken. Marks it (and any earlier
 * thresholds skipped by a GPS jump) as spoken.
 */
export function dueAnnouncement(
  steps: NavStep[],
  progress: NavProgress,
  spoken: Set<string>,
): string | null {
  const step = steps[progress.stepIndex];
  if (!step) return null;
  const due = step.voice
    .map((v, i) => ({ ...v, key: `${progress.stepIndex}:${i}` }))
    .filter((v) => !spoken.has(v.key) && progress.distanceToManeuver <= v.distanceAlongGeometry + 5);
  if (due.length === 0) return null;
  due.forEach((v) => spoken.add(v.key));
  return due.reduce((a, b) => (b.distanceAlongGeometry < a.distanceAlongGeometry ? b : a)).announcement;
}

/** Icon (MaterialCommunityIcons) for a manoeuvre. Ghana drives on the right. */
export function maneuverIcon(type: string | undefined, modifier: string | undefined): string {
  if (type === 'arrive') return 'flag-checkered';
  if (type === 'roundabout' || type === 'rotary' || type === 'roundabout turn') return 'rotate-left';
  if (type === 'fork') return 'call-split';
  if (type === 'merge') return 'call-merge';
  switch (modifier) {
    case 'uturn':
      return 'arrow-u-left-top';
    case 'sharp left':
      return 'arrow-bottom-left';
    case 'left':
      return 'arrow-left-top';
    case 'slight left':
      return 'arrow-top-left';
    case 'slight right':
      return 'arrow-top-right';
    case 'right':
      return 'arrow-right-top';
    case 'sharp right':
      return 'arrow-bottom-right';
    default:
      return 'arrow-up';
  }
}

/** "350 m", "1.2 km", "Now" */
export function formatManeuverDistance(m: number): string {
  if (m < 15) return 'Now';
  if (m < 1000) return `${m < 100 ? Math.round(m / 5) * 5 : Math.round(m / 10) * 10} m`;
  return `${(m / 1000).toFixed(1)} km`;
}
