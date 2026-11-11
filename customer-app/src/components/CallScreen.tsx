import { Ionicons } from '@expo/vector-icons';
import { setAudioModeAsync, useAudioPlayer } from 'expo-audio';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Linking, Modal, StyleSheet, Text, TouchableOpacity, Vibration, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CallJoinInfo, callingAvailable, ensureMicrophone, VoiceCall } from '../services/voiceCall';

const RING = require('../../assets/sounds/ring.wav');
const VIBRATE = [0, 800, 1200];

/** The server's view of the call (from the polled order / job). */
export interface CallState {
  id: string;
  status: 'RINGING' | 'ACTIVE' | 'ENDED';
  incoming: boolean;
  endReason: 'HUNG_UP' | 'DECLINED' | 'MISSED' | 'CANCELLED' | 'DELIVERY_ENDED' | null;
}

export interface CallApi {
  start: () => Promise<CallJoinInfo & { call: CallState }>;
  answer: () => Promise<CallJoinInfo & { call: CallState }>;
  end: () => Promise<unknown>;
}

export interface CallScreenProps {
  visible: boolean;
  mode: 'outgoing' | 'incoming';
  /** "Kofi Mensah" */
  otherName: string;
  /** "Your rider" / "Customer" */
  otherLabel: string;
  /** Latest polled call state, so a hang-up on the other phone closes this screen. */
  polled: CallState | null;
  api: CallApi;
  /** Normal phone call, offered when in-app calling isn't possible. */
  onPhoneCall?: () => void;
  onClose: () => void;
}

type Phase = 'idle' | 'calling' | 'ringing' | 'connecting' | 'active' | 'ended' | 'unavailable' | 'microphone';

const ENDED_TEXT: Record<NonNullable<CallState['endReason']>, string> = {
  HUNG_UP: 'Call ended',
  DECLINED: 'Call declined',
  MISSED: 'No answer',
  CANCELLED: 'Call cancelled',
  DELIVERY_ENDED: 'Delivery finished: call ended',
};

/** Full-screen voice call (same look in both apps). */
export function CallScreen({
  visible,
  mode,
  otherName,
  otherLabel,
  polled,
  api,
  onPhoneCall,
  onClose,
}: CallScreenProps): React.JSX.Element {
  const [phase, setPhase] = useState<Phase>('idle');
  const [message, setMessage] = useState<string | null>(null);
  const [muted, setMuted] = useState(false);
  const [speaker, setSpeaker] = useState(false);
  const [seconds, setSeconds] = useState(0);
  /** The phone won't show the microphone prompt again: Settings is the only way. */
  const [micBlocked, setMicBlocked] = useState(false);
  const call = useRef<VoiceCall | null>(null);
  const callId = useRef<string | null>(null);
  const player = useAudioPlayer(RING);

  const stopRing = useCallback((): void => {
    try {
      player.pause();
    } catch {
      // released
    }
    Vibration.cancel();
  }, [player]);

  const finish = useCallback(
    (text: string, notifyServer: boolean): void => {
      stopRing();
      call.current?.leave();
      call.current = null;
      if (notifyServer) void api.end().catch(() => undefined);
      setMessage(text);
      setPhase('ended');
      setTimeout(onClose, 1600);
    },
    [api, onClose, stopRing],
  );

  const join = useCallback(
    async (info: CallJoinInfo, next: Phase): Promise<void> => {
      const vc = new VoiceCall();
      call.current = vc;
      await vc.join(info, {
        onRemoteJoined: () => setPhase('active'),
        onRemoteLeft: () => finish('Call ended', true),
        onProblem: (m) => setMessage(m),
      });
      setPhase(next);
    },
    [finish],
  );

  // Open: start ringing (incoming) or place the call (outgoing).
  useEffect(() => {
    if (!visible) return;
    setMessage(null);
    setMuted(false);
    setSpeaker(false);
    setSeconds(0);
    if (!callingAvailable()) {
      setPhase('unavailable');
      return;
    }
    if (mode === 'incoming') {
      setPhase('ringing');
      void setAudioModeAsync({ playsInSilentMode: true }).catch(() => undefined);
      try {
        player.loop = true;
        void player.seekTo(0);
        player.play();
      } catch {
        // vibration still rings
      }
      Vibration.vibrate(VIBRATE, true);
      return stopRing;
    }
    setPhase('calling');
    void (async () => {
      const mic = await ensureMicrophone();
      if (mic !== 'granted') {
        setMicBlocked(mic === 'blocked');
        setPhase('microphone');
        return;
      }
      try {
        const res = await api.start();
        callId.current = res.call.id;
        await join(res, res.call.status === 'ACTIVE' ? 'connecting' : 'calling');
      } catch (err) {
        finish(err instanceof Error ? err.message : 'Could not start the call', false);
      }
    })();
    return undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, mode]);

  // The other phone hung up, declined, or the ring timed out.
  useEffect(() => {
    if (!visible || !polled || phase === 'ended' || phase === 'unavailable' || phase === 'microphone') return;
    if (callId.current && polled.id !== callId.current) return;
    if (polled.status === 'ENDED') finish(polled.endReason ? ENDED_TEXT[polled.endReason] : 'Call ended', false);
  }, [visible, polled, phase, finish]);

  // Call timer.
  useEffect(() => {
    if (phase !== 'active') return;
    const t = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [phase]);

  // Leaving the screen always leaves the channel.
  useEffect(
    () => () => {
      call.current?.leave();
      Vibration.cancel();
    },
    [],
  );

  const accept = async (): Promise<void> => {
    stopRing();
    setPhase('connecting');
    const mic = await ensureMicrophone();
    if (mic !== 'granted') {
      void api.end().catch(() => undefined);
      setMicBlocked(mic === 'blocked');
      setPhase('microphone');
      return;
    }
    try {
      const res = await api.answer();
      callId.current = res.call.id;
      await join(res, 'connecting');
    } catch (err) {
      finish(err instanceof Error ? err.message : 'Could not answer', true);
    }
  };

  const status =
    phase === 'ringing'
      ? `${otherLabel} is calling…`
      : phase === 'calling'
        ? 'Calling…'
        : phase === 'connecting'
          ? 'Connecting…'
          : phase === 'active'
            ? `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
            : phase === 'unavailable'
              ? 'In-app calling works in the installed GhanaDash app'
              : phase === 'microphone'
                ? micBlocked
                  ? 'Microphone is off for GhanaDash. Turn it on in Settings (Permissions → Microphone), then call again.'
                  : 'GhanaDash needs your microphone so you can talk. Allow it when your phone asks.'
                : (message ?? '');

  const initials = otherName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('');

  return (
    <Modal visible={visible} animationType="fade" onRequestClose={() => undefined} statusBarTranslucent>
      <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
        <View style={styles.top}>
          <Text style={styles.label}>GhanaDash call · {otherLabel}</Text>
          <View style={[styles.avatar, phase === 'ringing' && styles.avatarRinging]}>
            <Text style={styles.avatarText}>{initials || '?'}</Text>
          </View>
          <Text style={styles.name} numberOfLines={1}>
            {otherName}
          </Text>
          <Text style={styles.status} accessibilityLiveRegion="polite">
            {status}
          </Text>
          {message && phase !== 'ended' ? <Text style={styles.problem}>{message}</Text> : null}
          {(phase === 'calling' || phase === 'connecting') && <ActivityIndicator color="#5EF29A" style={styles.spinner} />}
        </View>

        {phase === 'ringing' && (
          <View style={styles.row}>
            <RoundButton icon="close" label="Decline" color="#FF5A4F" onPress={() => finish('Call declined', true)} />
            <RoundButton icon="call" label="Accept" color="#00C853" onPress={() => void accept()} />
          </View>
        )}

        {(phase === 'calling' || phase === 'connecting' || phase === 'active') && (
          <View style={styles.controls}>
            <View style={styles.row}>
              <RoundButton
                icon={muted ? 'mic-off' : 'mic'}
                label={muted ? 'Unmute' : 'Mute'}
                color={muted ? '#F5F7FA' : '#232A37'}
                iconColor={muted ? '#07090D' : '#F5F7FA'}
                onPress={() => {
                  call.current?.setMuted(!muted);
                  setMuted(!muted);
                }}
              />
              <RoundButton
                icon={speaker ? 'volume-high' : 'volume-medium'}
                label="Speaker"
                color={speaker ? '#F5F7FA' : '#232A37'}
                iconColor={speaker ? '#07090D' : '#F5F7FA'}
                onPress={() => {
                  call.current?.setSpeaker(!speaker);
                  setSpeaker(!speaker);
                }}
              />
            </View>
            <RoundButton
              icon="call"
              label={phase === 'active' ? 'Hang up' : 'Cancel'}
              color="#FF5A4F"
              rotate
              onPress={() => finish(phase === 'active' ? 'Call ended' : 'Call cancelled', true)}
            />
          </View>
        )}

        {phase === 'microphone' && (
          <View style={styles.controls}>
            {micBlocked ? (
              <TouchableOpacity style={styles.wide} onPress={() => void Linking.openSettings()} accessibilityRole="button">
                <Ionicons name="settings-outline" size={18} color="#03140A" />
                <Text style={styles.wideText}>Open settings</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={styles.wide}
                onPress={() => {
                  setPhase('idle');
                  setTimeout(onClose, 0);
                }}
                accessibilityRole="button"
              >
                <Ionicons name="mic" size={18} color="#03140A" />
                <Text style={styles.wideText}>OK, I'll allow it next time</Text>
              </TouchableOpacity>
            )}
            {onPhoneCall && (
              <TouchableOpacity
                style={[styles.wide, styles.wideGhost]}
                onPress={() => {
                  onClose();
                  onPhoneCall();
                }}
                accessibilityRole="button"
              >
                <Ionicons name="call" size={18} color="#F5F7FA" />
                <Text style={[styles.wideText, { color: '#F5F7FA' }]}>Call by phone instead</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity style={[styles.wide, styles.wideGhost]} onPress={onClose} accessibilityRole="button">
              <Text style={[styles.wideText, { color: '#F5F7FA' }]}>Close</Text>
            </TouchableOpacity>
          </View>
        )}

        {phase === 'unavailable' && (
          <View style={styles.controls}>
            {onPhoneCall && (
              <TouchableOpacity
                style={styles.wide}
                onPress={() => {
                  onClose();
                  onPhoneCall();
                }}
                accessibilityRole="button"
              >
                <Ionicons name="call" size={18} color="#03140A" />
                <Text style={styles.wideText}>Call by phone instead</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity style={[styles.wide, styles.wideGhost]} onPress={onClose} accessibilityRole="button">
              <Text style={[styles.wideText, { color: '#F5F7FA' }]}>Close</Text>
            </TouchableOpacity>
          </View>
        )}
      </SafeAreaView>
    </Modal>
  );
}

function RoundButton({
  icon,
  label,
  color,
  iconColor = '#FFFFFF',
  rotate = false,
  onPress,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
  color: string;
  iconColor?: string;
  rotate?: boolean;
  onPress: () => void;
}): React.JSX.Element {
  return (
    <View style={styles.btnWrap}>
      <TouchableOpacity
        onPress={onPress}
        style={[styles.btn, { backgroundColor: color }]}
        accessibilityRole="button"
        accessibilityLabel={label}
      >
        <Ionicons name={icon} size={30} color={iconColor} style={rotate ? { transform: [{ rotate: '135deg' }] } : undefined} />
      </TouchableOpacity>
      <Text style={styles.btnLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#07090D', justifyContent: 'space-between', paddingVertical: 32 },
  top: { alignItems: 'center', paddingHorizontal: 24, paddingTop: 40, gap: 10 },
  label: { fontSize: 13, fontWeight: '600', color: '#A9B3C2', letterSpacing: 0.3 },
  avatar: {
    width: 112,
    height: 112,
    borderRadius: 56,
    backgroundColor: '#00C853',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 24,
  },
  avatarRinging: { borderWidth: 6, borderColor: 'rgba(0,200,83,0.35)' },
  avatarText: { fontSize: 40, fontWeight: '800', color: '#03140A' },
  name: { fontSize: 28, fontWeight: '800', color: '#F5F7FA', marginTop: 12 },
  status: { fontSize: 17, color: '#A9B3C2', textAlign: 'center' },
  problem: { fontSize: 14, color: '#FFC266', textAlign: 'center' },
  spinner: { marginTop: 8 },
  controls: { alignItems: 'center', gap: 28, paddingHorizontal: 24 },
  row: { flexDirection: 'row', justifyContent: 'space-evenly', alignSelf: 'stretch' },
  btnWrap: { alignItems: 'center', gap: 8 },
  btn: { width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center' },
  btnLabel: { fontSize: 13, fontWeight: '600', color: '#F5F7FA' },
  wide: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    minHeight: 54,
    alignSelf: 'stretch',
    borderRadius: 999,
    backgroundColor: '#00C853',
  },
  wideGhost: { backgroundColor: 'transparent', borderWidth: 1, borderColor: '#232A37' },
  wideText: { fontSize: 16, fontWeight: '700', color: '#03140A' },
});
