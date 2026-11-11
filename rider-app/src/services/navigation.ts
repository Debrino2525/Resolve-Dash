import * as Speech from 'expo-speech';
import { useEffect, useRef, useState } from 'react';
import {
  computeProgress,
  dueAnnouncement,
  NavProgress,
  OFF_ROUTE_FIXES,
  OFF_ROUTE_METERS,
} from '../utils/turnByTurn';
import { LatLng } from './location';
import { fetchNavigationRoute, NavRoute } from './routing';

export type NavStatus = 'loading' | 'navigating' | 'rerouting' | 'arrived' | 'error';

export interface TurnByTurnState {
  status: NavStatus;
  route: NavRoute | null;
  progress: NavProgress | null;
  error: string | null;
}

const REROUTE_COOLDOWN_MS = 15_000;

function speak(text: string, muted: boolean): void {
  if (muted || !text) return;
  Speech.stop();
  Speech.speak(text, { language: 'en-GB', rate: 1.0 });
}

/**
 * In-app turn-by-turn guidance to `destination`. Routes with Mapbox from the rider's position,
 * tracks progress on every GPS fix, speaks Mapbox voice prompts, re-routes after sustained
 * off-route fixes, and reports arrival.
 */
export function useTurnByTurn(
  destination: LatLng | null,
  position: LatLng | null,
  enabled: boolean,
  muted: boolean,
): TurnByTurnState {
  const [state, setState] = useState<TurnByTurnState>({
    status: 'loading',
    route: null,
    progress: null,
    error: null,
  });
  const stepIndex = useRef(0);
  const spoken = useRef(new Set<string>());
  const offRouteCount = useRef(0);
  const lastReroute = useRef(0);
  const routing = useRef(false);
  const mutedRef = useRef(muted);
  mutedRef.current = muted;
  const positionRef = useRef(position);
  positionRef.current = position;

  const loadRoute = async (from: LatLng, isReroute: boolean): Promise<void> => {
    if (!destination || routing.current) return;
    routing.current = true;
    // A fresh trip (new destination) drops the old route so it can't report a false arrival.
    setState((s) =>
      isReroute
        ? { ...s, status: 'rerouting', error: null }
        : { status: 'loading', route: null, progress: null, error: null },
    );
    const route = await fetchNavigationRoute(from, destination);
    routing.current = false;
    if (!route || route.steps.length === 0) {
      setState((s) => ({
        ...s,
        status: s.route ? 'navigating' : 'error',
        error: 'Could not get directions. Check your connection, or use Google Maps.',
      }));
      return;
    }
    stepIndex.current = 0;
    spoken.current = new Set();
    offRouteCount.current = 0;
    const progress = computeProgress(route.steps, from, 0);
    setState({ status: 'navigating', route, progress, error: null });
    // Opening prompt ("Drive north on X. Then turn right…").
    const opening =
      dueAnnouncement(route.steps, progress, spoken.current) ?? route.steps[0].instruction;
    speak(isReroute ? `Rerouting. ${opening}` : opening, mutedRef.current);
  };

  // Start (or restart) when navigation is switched on or the destination changes.
  useEffect(() => {
    if (!enabled || !destination) {
      setState({ status: 'loading', route: null, progress: null, error: null });
      return;
    }
    const start = positionRef.current;
    if (start) void loadRoute(start, false);
    return () => {
      Speech.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, destination?.latitude, destination?.longitude]);

  // First fix arrived after navigation started.
  useEffect(() => {
    if (enabled && position && !state.route && state.status === 'loading' && !routing.current) {
      void loadRoute(position, false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, position, state.route, state.status]);

  // Track progress on every position update.
  useEffect(() => {
    const route = state.route;
    if (!enabled || !route || !position || state.status === 'arrived') return;

    const progress = computeProgress(route.steps, position, stepIndex.current);
    stepIndex.current = progress.stepIndex;

    if (progress.arrived) {
      setState((s) => ({ ...s, progress, status: 'arrived' }));
      speak('You have arrived.', mutedRef.current);
      return;
    }

    if (progress.offRouteMeters > OFF_ROUTE_METERS) {
      offRouteCount.current += 1;
      const now = Date.now();
      if (
        offRouteCount.current >= OFF_ROUTE_FIXES &&
        now - lastReroute.current > REROUTE_COOLDOWN_MS
      ) {
        lastReroute.current = now;
        void loadRoute(position, true);
        return;
      }
    } else {
      offRouteCount.current = 0;
    }

    const announcement = dueAnnouncement(route.steps, progress, spoken.current);
    if (announcement) speak(announcement, mutedRef.current);
    setState((s) => ({ ...s, progress }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [position?.latitude, position?.longitude, enabled, state.route]);

  // Silence immediately when muted or when navigation stops.
  useEffect(() => {
    if (muted || !enabled) Speech.stop();
  }, [muted, enabled]);

  return state;
}
