import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Image, ImageSourcePropType, StyleSheet, Text, View } from 'react-native';
import { Colors, Elevation, Radii, Typography } from '../../theme/theme';
import { BrandMark } from './AuthParts';

/**
 * Overhead collage behind the logo on the Welcome back screen (Figma "Welcome Back & Login").
 *
 * PHOTOS: put licensed images in customer-app/assets/welcome/ and set `photo` on each slot,
 * e.g. photo: require('../../../assets/welcome/jollof.jpg'). Until then each slot shows a
 * coloured placeholder with an icon.
 */
interface Slot {
  name: string;
  photo?: ImageSourcePropType;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  tint: string;
  style: { left: number; top: number; size: number; round?: boolean; rotate?: string };
}

const SLOTS: Slot[] = [
  { name: 'Jollof rice', icon: 'restaurant', tint: '#F4C7A1', style: { left: -28, top: -28, size: 160, round: true } },
  { name: 'Pharmacy', icon: 'medkit', tint: '#DCE7F7', style: { left: 226, top: -22, size: 110, rotate: '-6deg' } },
  { name: 'Grilled tilapia', icon: 'fish', tint: '#F7E1B5', style: { left: 265, top: -15, size: 170, round: true } },
  { name: 'Waakye', icon: 'fast-food', tint: '#EAD7C3', style: { left: -28, top: 96, size: 208, round: true } },
  { name: 'Market fruit', icon: 'nutrition', tint: '#FBE3B0', style: { left: 73, top: 150, size: 150, round: true } },
  { name: 'Parcels', icon: 'cube', tint: '#D9EFE1', style: { left: 281, top: 120, size: 120, rotate: '8deg' } },
];

export function WelcomeCollage(): React.JSX.Element {
  return (
    <View style={styles.wrap} importantForAccessibility="no-hide-descendants">
      {SLOTS.map((s) => {
        const size = s.style.size;
        const shape = {
          left: s.style.left,
          top: s.style.top,
          width: size,
          height: size,
          borderRadius: s.style.round ? size / 2 : Radii.lg,
          transform: s.style.rotate ? [{ rotate: s.style.rotate }] : undefined,
        };
        return s.photo ? (
          <Image key={s.name} source={s.photo} style={[styles.tile, shape]} resizeMode="cover" />
        ) : (
          <View key={s.name} style={[styles.tile, shape, { backgroundColor: s.tint }]}>
            <Ionicons name={s.icon} size={size * 0.32} color="rgba(7,9,13,0.35)" />
          </View>
        );
      })}
      <View style={[styles.orb, { left: 300, top: 262, width: 34, height: 34, backgroundColor: '#FFC107' }]} />
      <View style={[styles.orb, { left: 338, top: 270, width: 22, height: 22, backgroundColor: '#FF9F0A' }]} />

      <View style={styles.logoCard}>
        <View style={styles.logoRow}>
          <BrandMark size={52} />
          <Text style={styles.wordmark}>
            GHANA<Text style={styles.wordmarkGreen}>DASH</Text>
          </Text>
        </View>
        <Text style={styles.by}>by Globitech Cyber Solutions</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { height: 320, overflow: 'hidden' },
  tile: { position: 'absolute', alignItems: 'center', justifyContent: 'center', ...Elevation.card },
  orb: { position: 'absolute', borderRadius: 999 },
  logoCard: {
    position: 'absolute',
    alignSelf: 'center',
    top: 122,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: Radii.lg,
    backgroundColor: 'rgba(255,255,255,0.94)',
    alignItems: 'center',
    ...Elevation.floating,
  },
  logoRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  wordmark: { fontSize: 28, fontWeight: '900', letterSpacing: 1.5, color: Colors.textPrimary },
  wordmarkGreen: { color: Colors.dispatchGreenLight },
  by: { ...Typography.micro, color: Colors.textMuted, marginTop: 4 },
});
