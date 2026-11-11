import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  ImageStyle,
  Modal,
  Pressable,
  StyleProp,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import { apiUrl } from '../api/backendClient';
import { getValidAccessToken } from '../auth/supabase';
import { Colors, Radii } from '../theme/theme';

/**
 * Shows a private photo served by the GhanaDash API (package or chat photo). The request carries
 * the user's sign-in token; photos are never public URLs. Tap to view full screen.
 */
export function AuthImage({
  path,
  style,
  expandable = true,
}: {
  /** API path, e.g. /orders/<id>/package-photo */
  path: string;
  style?: StyleProp<ImageStyle>;
  expandable?: boolean;
}): React.JSX.Element {
  const [token, setToken] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let alive = true;
    void getValidAccessToken()
      .then((t) => alive && setToken(t))
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, [path]);

  const source = token ? { uri: apiUrl(path), headers: { Authorization: `Bearer ${token}` } } : null;

  return (
    <>
      <TouchableOpacity
        activeOpacity={0.85}
        disabled={!expandable || !source || failed}
        onPress={() => setOpen(true)}
        accessibilityRole="imagebutton"
        accessibilityLabel="Photo, tap to enlarge"
      >
        <View style={[styles.frame, style]}>
          {source && !failed && (
            <Image
              source={source}
              style={StyleSheet.absoluteFill}
              resizeMode="cover"
              onLoadEnd={() => setLoading(false)}
              onError={() => {
                setFailed(true);
                setLoading(false);
              }}
            />
          )}
          {loading && !failed && <ActivityIndicator color={Colors.textMuted} />}
          {failed && <Ionicons name="image-outline" size={28} color={Colors.textMuted} />}
        </View>
      </TouchableOpacity>

      {source && (
        <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
          <Pressable style={styles.viewer} onPress={() => setOpen(false)}>
            <Image source={source} style={styles.full} resizeMode="contain" />
            <View style={styles.close}>
              <Ionicons name="close" size={28} color="#FFFFFF" />
            </View>
          </Pressable>
        </Modal>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  frame: {
    overflow: 'hidden',
    borderRadius: Radii.md,
    backgroundColor: Colors.surfaceLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  viewer: { flex: 1, backgroundColor: 'rgba(0,0,0,0.92)', justifyContent: 'center' },
  full: { width: '100%', height: '80%' },
  close: { position: 'absolute', top: 48, right: 20 },
});
