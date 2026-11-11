import { Ionicons } from '@expo/vector-icons';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChatThread, getChatThread, sendChatMessage, sendChatPhoto } from '../api/backendClient';
import { pickPhoto } from '../services/photos';
import { Colors, Radii, Spacing, TOUCH_TARGET, Typography } from '../theme/theme';
import { AuthImage } from './AuthImage';

const POLL_MS = 3000;

export interface ChatSheetProps {
  visible: boolean;
  orderId: string;
  /** Shown in the header, e.g. the rider's or customer's first name. */
  otherName: string;
  onClose: () => void;
  /** Lets the parent mark messages as read. */
  onSeen?: (count: number) => void;
}

/**
 * Customer ↔ rider chat for one delivery: text and photos (e.g. the parcel, the gate).
 * Polls every 3 s while open. Read-only once the delivery has ended.
 */
export function ChatSheet({ visible, orderId, otherName, onClose, onSeen }: ChatSheetProps): React.JSX.Element {
  const insets = useSafeAreaInsets();
  const [thread, setThread] = useState<ChatThread | null>(null);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const list = useRef<FlatList>(null);

  const apply = useCallback(
    (t: ChatThread) => {
      setThread(t);
      onSeen?.(t.messages.length);
    },
    [onSeen],
  );

  const load = useCallback(async () => {
    try {
      apply(await getChatThread(orderId));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load messages');
    }
  }, [orderId, apply]);

  useEffect(() => {
    if (!visible) return;
    void load();
    const t = setInterval(() => void load(), POLL_MS);
    return () => clearInterval(t);
  }, [visible, load]);

  const send = async (): Promise<void> => {
    const body = text.trim();
    if (!body || sending) return;
    setSending(true);
    try {
      apply(await sendChatMessage(orderId, body));
      setText('');
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Message not sent');
    } finally {
      setSending(false);
    }
  };

  const sendPhoto = async (source: 'camera' | 'library'): Promise<void> => {
    if (sending) return;
    const photo = await pickPhoto(source);
    if (!photo) return;
    setSending(true);
    try {
      apply(await sendChatPhoto(orderId, photo, text.trim() || undefined));
      setText('');
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Photo not sent');
    } finally {
      setSending(false);
    }
  };

  const open = thread?.open ?? true;

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} presentationStyle="fullScreen">
      <KeyboardAvoidingView
        style={[styles.container, { paddingTop: insets.top }]}
        behavior="padding"
      >
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} style={styles.iconBtn} accessibilityRole="button" accessibilityLabel="Close chat">
            <Ionicons name="chevron-down" size={26} color={Colors.textPrimary} />
          </TouchableOpacity>
          <View style={styles.headerText}>
            <Text style={styles.title} numberOfLines={1}>
              {otherName}
            </Text>
            <Text style={styles.sub}>Messages for this delivery</Text>
          </View>
          <View style={styles.iconBtn} />
        </View>

        {!thread ? (
          <View style={styles.center}>
            {error ? <Text style={styles.error}>{error}</Text> : <ActivityIndicator color={Colors.dispatchGreen} />}
          </View>
        ) : (
          <FlatList
            ref={list}
            data={thread.messages}
            keyExtractor={(m) => m.id}
            contentContainerStyle={styles.messages}
            onContentSizeChange={() => list.current?.scrollToEnd({ animated: true })}
            ListEmptyComponent={
              <Text style={styles.empty}>
                Say hello, or send a photo of the package or the gate to help find each other.
              </Text>
            }
            renderItem={({ item: m }) => (
              <View style={[styles.bubble, m.mine ? styles.mine : styles.theirs]}>
                {m.hasPhoto && (
                  <AuthImage path={`/orders/${orderId}/messages/${m.id}/photo`} style={styles.photo} />
                )}
                {m.body ? <Text style={[styles.body, m.mine && styles.bodyMine]}>{m.body}</Text> : null}
                <Text style={[styles.time, m.mine && styles.timeMine]}>
                  {new Date(m.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </Text>
              </View>
            )}
          />
        )}

        {error && thread && <Text style={styles.errorBar}>{error}</Text>}

        {open ? (
          <View style={[styles.composer, { paddingBottom: Math.max(insets.bottom, Spacing.sm) }]}>
            <TouchableOpacity
              style={styles.iconBtn}
              onPress={() => void sendPhoto('camera')}
              disabled={sending}
              accessibilityRole="button"
              accessibilityLabel="Take a photo"
            >
              <Ionicons name="camera-outline" size={24} color={Colors.textSecondary} />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.iconBtn}
              onPress={() => void sendPhoto('library')}
              disabled={sending}
              accessibilityRole="button"
              accessibilityLabel="Send a photo from your gallery"
            >
              <Ionicons name="image-outline" size={24} color={Colors.textSecondary} />
            </TouchableOpacity>
            <TextInput
              style={styles.input}
              placeholder="Message"
              placeholderTextColor={Colors.textMuted}
              value={text}
              onChangeText={setText}
              maxLength={1000}
              multiline
            />
            <TouchableOpacity
              style={[styles.send, (!text.trim() || sending) && { opacity: 0.5 }]}
              onPress={() => void send()}
              disabled={!text.trim() || sending}
              accessibilityRole="button"
              accessibilityLabel="Send"
            >
              {sending ? (
                <ActivityIndicator color={Colors.onBrand} />
              ) : (
                <Ionicons name="send" size={20} color={Colors.onBrand} />
              )}
            </TouchableOpacity>
          </View>
        ) : (
          <Text style={[styles.closed, { paddingBottom: insets.bottom + Spacing.md }]}>
            This delivery has ended. Messages are read-only.
          </Text>
        )}
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    backgroundColor: Colors.card,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.cardBorder,
  },
  headerText: { flex: 1, alignItems: 'center' },
  title: { ...Typography.h3, color: Colors.textPrimary },
  sub: { ...Typography.caption, color: Colors.textMuted },
  iconBtn: { width: TOUCH_TARGET, height: TOUCH_TARGET, alignItems: 'center', justifyContent: 'center' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.xl },
  messages: { padding: Spacing.lg, gap: Spacing.sm, flexGrow: 1 },
  empty: { ...Typography.body, color: Colors.textMuted, textAlign: 'center', marginTop: Spacing.huge },
  bubble: { maxWidth: '80%', borderRadius: Radii.lg, padding: Spacing.md, gap: Spacing.xs },
  mine: { alignSelf: 'flex-end', backgroundColor: Colors.dispatchGreen, borderBottomRightRadius: Radii.sm },
  theirs: {
    alignSelf: 'flex-start',
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    borderBottomLeftRadius: Radii.sm,
  },
  photo: { width: 220, height: 220 },
  body: { ...Typography.body, color: Colors.textPrimary },
  bodyMine: { color: Colors.onBrand },
  time: { ...Typography.caption, color: Colors.textMuted, alignSelf: 'flex-end', fontSize: 11 },
  timeMine: { color: Colors.onBrand, opacity: 0.7 },
  error: { ...Typography.body, color: Colors.dangerRed, textAlign: 'center' },
  errorBar: { ...Typography.caption, color: Colors.dangerRed, textAlign: 'center', padding: Spacing.xs },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: Spacing.xs,
    paddingHorizontal: Spacing.sm,
    paddingTop: Spacing.sm,
    backgroundColor: Colors.card,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.cardBorder,
  },
  input: {
    flex: 1,
    maxHeight: 120,
    minHeight: TOUCH_TARGET,
    backgroundColor: Colors.background,
    borderRadius: Radii.lg,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    color: Colors.textPrimary,
    ...Typography.body,
  },
  send: {
    width: TOUCH_TARGET,
    height: TOUCH_TARGET,
    borderRadius: TOUCH_TARGET / 2,
    backgroundColor: Colors.dispatchGreen,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closed: { ...Typography.caption, color: Colors.textMuted, textAlign: 'center', paddingTop: Spacing.md },
});
