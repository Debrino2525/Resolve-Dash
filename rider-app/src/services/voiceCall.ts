import { getRecordingPermissionsAsync, requestRecordingPermissionsAsync } from 'expo-audio';
import { NativeModules, TurboModuleRegistry } from 'react-native';

/**
 * Voice calls through Agora (customer ↔ rider), audio only.
 *
 * react-native-agora is native code that only exists in our installed builds, not in Expo Go,
 * so it is loaded lazily: in Expo Go `callingAvailable()` is false and the apps offer a normal
 * phone call instead.
 */

export interface CallJoinInfo {
  appId: string;
  channel: string;
  token: string;
  uid: number;
}

export interface VoiceCallEvents {
  /** The other person is in the call (audio flowing). */
  onRemoteJoined?: () => void;
  /** The other person left or dropped. */
  onRemoteLeft?: () => void;
  /** Network dropped or Agora failed. */
  onProblem?: (message: string) => void;
}

type AgoraModule = typeof import('react-native-agora');

let agora: AgoraModule | null | undefined;
function loadAgora(): AgoraModule | null {
  if (agora !== undefined) return agora;
  // Check for the native module first, without importing the library: in development a module
  // that throws while loading is reported as a fatal error even inside try/catch (Expo Go).
  if (!TurboModuleRegistry.get('AgoraRtcNg') && NativeModules.AgoraRtcNg == null) {
    agora = null;
    return agora;
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('react-native-agora') as AgoraModule;
    mod.createAgoraRtcEngine(); // throws in Expo Go (native module missing)
    agora = mod;
  } catch {
    agora = null;
  }
  return agora;
}

/** True in our installed app builds (Agora's native code is present). */
export function callingAvailable(): boolean {
  return loadAgora() !== null;
}

export type MicrophoneAccess = 'granted' | 'denied' | 'blocked';

/**
 * Microphone for calls (Android and iOS). 'blocked' means the phone won't show the prompt again
 * (denied before, or "don't ask again"): the person has to switch it on in Settings.
 */
export async function ensureMicrophone(): Promise<MicrophoneAccess> {
  try {
    const current = await getRecordingPermissionsAsync();
    if (current.granted) return 'granted';
    if (!current.canAskAgain) return 'blocked';
    const asked = await requestRecordingPermissionsAsync();
    if (asked.granted) return 'granted';
    return asked.canAskAgain ? 'denied' : 'blocked';
  } catch {
    return 'denied';
  }
}

/** One call: join, mute, speaker, leave. */
export class VoiceCall {
  private engine: ReturnType<AgoraModule['createAgoraRtcEngine']> | null = null;
  private handler: object | null = null;

  async join(info: CallJoinInfo, events: VoiceCallEvents): Promise<void> {
    const mod = loadAgora();
    if (!mod) throw new Error('Calling works in the installed GhanaDash app.');
    const engine = mod.createAgoraRtcEngine();
    engine.initialize({
      appId: info.appId,
      channelProfile: mod.ChannelProfileType.ChannelProfileCommunication,
    });
    engine.enableAudio();
    engine.setDefaultAudioRouteToSpeakerphone(false); // earpiece, like a phone call
    this.handler = {
      onUserJoined: () => events.onRemoteJoined?.(),
      onUserOffline: () => events.onRemoteLeft?.(),
      onConnectionLost: () => events.onProblem?.('Connection lost. Check your internet.'),
      onError: (_code: number, msg: string) => {
        if (msg) events.onProblem?.(msg);
      },
    };
    engine.registerEventHandler(this.handler as never);
    this.engine = engine;
    const rc = engine.joinChannel(info.token, info.channel, info.uid, {
      clientRoleType: mod.ClientRoleType.ClientRoleBroadcaster,
      channelProfile: mod.ChannelProfileType.ChannelProfileCommunication,
      publishMicrophoneTrack: true,
      autoSubscribeAudio: true,
    });
    if (rc < 0) throw new Error(`Could not start the call (code ${rc}).`);
  }

  setMuted(muted: boolean): void {
    this.engine?.muteLocalAudioStream(muted);
  }

  setSpeaker(on: boolean): void {
    this.engine?.setEnableSpeakerphone(on);
  }

  leave(): void {
    const e = this.engine;
    this.engine = null;
    if (!e) return;
    try {
      if (this.handler) e.unregisterEventHandler(this.handler as never);
      e.leaveChannel();
      e.release();
    } catch {
      // already gone
    }
  }
}
