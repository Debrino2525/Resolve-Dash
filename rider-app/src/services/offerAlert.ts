import { setAudioModeAsync, useAudioPlayer } from 'expo-audio';
import { useEffect } from 'react';
import { Vibration } from 'react-native';

const RINGTONE = require('../../assets/sounds/new_order.wav');
/** Buzz-pause pattern, repeated, so a rider feels it in a pocket or on a handlebar mount. */
const VIBRATION = [0, 500, 400, 500, 1200];

/**
 * Rings and vibrates while an order offer is on screen, and stops the moment it is accepted,
 * declined or expires (when `offerId` becomes null). Plays even with the phone on silent, since
 * missing an offer costs the rider money.
 */
export function useOfferAlert(offerId: string | null): void {
  const player = useAudioPlayer(RINGTONE);

  useEffect(() => {
    void setAudioModeAsync({ playsInSilentMode: true }).catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!offerId) return;
    try {
      player.loop = true;
      void player.seekTo(0);
      player.play();
    } catch {
      // Sound is best-effort; vibration below still alerts the rider.
    }
    Vibration.vibrate(VIBRATION, true);
    return () => {
      try {
        player.pause();
      } catch {
        // Player already released.
      }
      Vibration.cancel();
    };
  }, [offerId, player]);
}
