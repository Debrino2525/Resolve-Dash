import { PermissionsAndroid, Platform } from 'react-native';

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

/** Asks for the microphone (Android at run time; iOS asks on first use). */
export async function ensureMicrophone(): Promise<boolean> {
  if (Platform.OS !== 'android') return true;
  const res = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO, {
    title: 'Microphone for calls',
    message: 'GhanaDash needs the microphone so you can talk during a delivery call.',
    buttonPositive: 'Allow',
  });
  return res === PermissionsAndroid.RESULTS.GRANTED;
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
