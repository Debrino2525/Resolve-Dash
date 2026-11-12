import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import {
  acceptOffer,
  ApiError,
  declineOffer,
  getDispatchState,
  markDelivered,
  markPickedUp,
  markStopDelivered,
  markStopFailed,
  releaseJob,
  updatePresence,
} from '../api/backendClient';
import { DispatchState } from '../types/dispatch';
import { LatLng } from './location';

const HEARTBEAT_MS = 5000;

export interface DispatchControls {
  state: DispatchState | null;
  /** Server says we're on duty (or we have a job to finish). */
  online: boolean;
  busy: boolean;
  error: string | null;
  clearError: () => void;
  goOnline: (at: LatLng) => Promise<boolean>;
  goOffline: () => Promise<void>;
  accept: (offerId: string) => Promise<void>;
  decline: (offerId: string) => Promise<void>;
  pickedUp: (jobId: string) => Promise<void>;
  /** Throws with the server's message (e.g. "Wrong PIN. 3 attempts left.") so the PIN sheet can show it. */
  delivered: (jobId: string, pin: string) => Promise<void>;
  /** Multi-stop drop-off before the final one; throws the server's message like `delivered`. */
  stopDelivered: (jobId: string, index: number, pin: string) => Promise<void>;
  stopFailed: (jobId: string, index: number, reason: string) => Promise<void>;
  release: (jobId: string) => Promise<void>;
  refresh: () => Promise<void>;
}

/**
 * Live dispatch for the rider: restores state on launch, sends a location heartbeat every 5 s
 * while on duty or on a job (which also delivers new offers), and wraps offer/job actions.
 */
export function useDispatch(position: LatLng | null): DispatchControls {
  const [state, setState] = useState<DispatchState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const positionRef = useRef(position);
  positionRef.current = position;
  const wantOnline = useRef(false);

  const apply = useCallback((s: DispatchState) => {
    wantOnline.current = s.online;
    setState(s);
  }, []);

  const refresh = useCallback(async () => {
    try {
      apply(await getDispatchState());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not reach dispatch');
    }
  }, [apply]);

  // Restore on launch (e.g. the app was closed mid-delivery), and when returning to the app.
  useEffect(() => {
    void refresh();
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') void refresh();
    });
    return () => sub.remove();
  }, [refresh]);

  const tracking = Boolean(state?.online || state?.job);

  // Heartbeat: position up, offers and job down.
  useEffect(() => {
    if (!tracking) return;
    let stopped = false;
    const beat = async (): Promise<void> => {
      const p = positionRef.current;
      try {
        const s = await updatePresence({ online: wantOnline.current, lat: p?.latitude, lng: p?.longitude });
        if (!stopped) apply(s);
      } catch (err) {
        if (stopped) return;
        // Plan expired or approval revoked while on duty: the server refuses; drop to offline.
        if (err instanceof ApiError && err.status === 403) {
          wantOnline.current = false;
          setState((prev) => (prev ? { ...prev, online: false } : prev));
          setError(err.message);
        }
        // Network blips: keep trying on the next beat.
      }
    };
    const timer = setInterval(() => void beat(), HEARTBEAT_MS);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [tracking, apply]);

  const run = useCallback(
    async (fn: () => Promise<DispatchState>, rethrow = false): Promise<void> => {
      setBusy(true);
      setError(null);
      try {
        apply(await fn());
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Something went wrong';
        if (rethrow) throw new Error(message);
        setError(message);
        await refresh();
      } finally {
        setBusy(false);
      }
    },
    [apply, refresh],
  );

  return {
    state,
    online: Boolean(state?.online),
    busy,
    error,
    clearError: () => setError(null),
    goOnline: async (at) => {
      let ok = false;
      await run(async () => {
        wantOnline.current = true;
        const s = await updatePresence({ online: true, lat: at.latitude, lng: at.longitude });
        ok = s.online;
        return s;
      });
      if (!ok) wantOnline.current = false;
      return ok;
    },
    goOffline: () => run(() => updatePresence({ online: false })),
    accept: (id) => run(() => acceptOffer(id)),
    decline: (id) => run(() => declineOffer(id)),
    pickedUp: (id) => run(() => markPickedUp(id)),
    delivered: (id, pin) => run(() => markDelivered(id, pin), true),
    stopDelivered: (id, index, pin) => run(() => markStopDelivered(id, index, pin), true),
    stopFailed: (id, index, reason) => run(() => markStopFailed(id, index, reason)),
    release: (id) => run(() => releaseJob(id)),
    refresh,
  };
}
