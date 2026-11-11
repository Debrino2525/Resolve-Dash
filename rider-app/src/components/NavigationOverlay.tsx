import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useKeepAwake } from 'expo-keep-awake';
import React from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { TurnByTurnState } from '../services/navigation';
import { formatDuration } from '../services/routing';
import { Colors, Elevation, Radii, Spacing, TOUCH_TARGET, Typography } from '../theme/theme';
import { formatDistance } from '../utils/geo';
import { formatManeuverDistance, maneuverIcon } from '../utils/turnByTurn';

export interface NavigationOverlayProps {
  nav: TurnByTurnState;
  destinationLabel: string;
  muted: boolean;
  onToggleMute: () => void;
  onExit: () => void;
  onOpenGoogleMaps: () => void;
  /** Action offered on arrival, e.g. "Picked up" / "Delivered". */
  arrivalActionLabel: string;
  onArrivalAction: () => void;
}

function arrivalClock(secondsFromNow: number): string {
  const t = new Date(Date.now() + secondsFromNow * 1000);
  return t.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

/** Full-screen turn-by-turn UI drawn over the map. Keeps the screen awake while shown. */
export function NavigationOverlay({
  nav,
  destinationLabel,
  muted,
  onToggleMute,
  onExit,
  onOpenGoogleMaps,
  arrivalActionLabel,
  onArrivalAction,
}: NavigationOverlayProps): React.JSX.Element {
  useKeepAwake();
  const insets = useSafeAreaInsets();
  const p = nav.progress;
  const arrived = nav.status === 'arrived';
  const banner = p?.banner;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      {/* Manoeuvre banner */}
      <View style={[styles.banner, { marginTop: insets.top + Spacing.sm }]}>
        {nav.status === 'loading' || (!p && nav.status !== 'error') ? (
          <View style={styles.bannerRow}>
            <ActivityIndicator color={Colors.onBrand} />
            <Text style={styles.bannerInstruction}>Finding the best route…</Text>
          </View>
        ) : arrived ? (
          <View style={styles.bannerRow}>
            <MaterialCommunityIcons name="flag-checkered" size={40} color={Colors.onBrand} />
            <Text style={styles.bannerInstruction}>You have arrived</Text>
          </View>
        ) : (
          <View style={styles.bannerRow}>
            <View style={styles.maneuverTile}>
              <MaterialCommunityIcons
                name={maneuverIcon(banner?.type, banner?.modifier) as never}
                size={44}
                color={Colors.onBrand}
              />
            </View>
            <View style={styles.flex}>
              <Text style={styles.bannerDistance} accessibilityLiveRegion="polite">
                {p ? formatManeuverDistance(p.distanceToManeuver) : ''}
              </Text>
              <Text style={styles.bannerInstruction} numberOfLines={2}>
                {banner?.text ?? 'Continue on the route'}
              </Text>
            </View>
          </View>
        )}
        {p?.roadName && !arrived ? (
          <Text style={styles.roadName} numberOfLines={1}>
            on {p.roadName}
          </Text>
        ) : null}
      </View>

      {(nav.status === 'rerouting' || nav.error) && (
        <View style={styles.statusPill}>
          {nav.status === 'rerouting' ? (
            <>
              <ActivityIndicator size="small" color={Colors.amberLight} />
              <Text style={styles.statusText}>Re-routing…</Text>
            </>
          ) : (
            <>
              <Ionicons name="warning" size={16} color={Colors.amberLight} />
              <Text style={styles.statusText}>{nav.error}</Text>
            </>
          )}
        </View>
      )}

      {/* Bottom bar */}
      <View style={[styles.bottom, { paddingBottom: insets.bottom + Spacing.md }]}>
        {arrived ? (
          <View>
            <Text style={styles.arrivedTitle}>{destinationLabel}</Text>
            <Text style={styles.arrivedSub}>Confirm when you're done here.</Text>
            <TouchableOpacity style={styles.arrivalBtn} onPress={onArrivalAction} accessibilityRole="button">
              <Ionicons name="checkmark-circle" size={22} color={Colors.onBrand} />
              <Text style={styles.arrivalBtnText}>{arrivalActionLabel}</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.tripRow}>
            <View style={styles.flex}>
              <Text style={styles.eta}>{p ? arrivalClock(p.remainingSeconds) : '--:--'}</Text>
              <Text style={styles.etaSub}>
                {p
                  ? `${formatDuration(p.remainingSeconds)} · ${formatDistance(p.remainingMeters)}`
                  : destinationLabel}
              </Text>
            </View>
          </View>
        )}

        <View style={styles.controls}>
          <RoundButton icon="close" label="End navigation" tone="danger" onPress={onExit} />
          <TouchableOpacity
            style={styles.googleBtn}
            onPress={onOpenGoogleMaps}
            accessibilityRole="button"
            accessibilityLabel="Open in Google Maps"
          >
            <MaterialCommunityIcons name="google-maps" size={20} color={Colors.textPrimary} />
            <Text style={styles.googleText}>Google Maps</Text>
          </TouchableOpacity>
          <RoundButton
            icon={muted ? 'volume-mute' : 'volume-high'}
            label={muted ? 'Unmute voice' : 'Mute voice'}
            onPress={onToggleMute}
          />
        </View>
      </View>
    </View>
  );
}

function RoundButton({
  icon,
  label,
  onPress,
  tone = 'neutral',
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
  onPress: () => void;
  tone?: 'neutral' | 'danger';
}): React.JSX.Element {
  return (
    <TouchableOpacity
      style={[styles.round, tone === 'danger' && styles.roundDanger]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Ionicons name={icon} size={22} color={tone === 'danger' ? Colors.dangerRed : Colors.textPrimary} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  banner: {
    marginHorizontal: Spacing.md,
    backgroundColor: Colors.dispatchGreen,
    borderRadius: Radii.xl,
    padding: Spacing.lg,
    ...Elevation.floating,
  },
  bannerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  maneuverTile: {
    width: 64,
    height: 64,
    borderRadius: Radii.lg,
    backgroundColor: 'rgba(3, 20, 10, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bannerDistance: {
    ...Typography.h1,
    color: Colors.onBrand,
  },
  bannerInstruction: {
    ...Typography.h3,
    color: Colors.onBrand,
    flexShrink: 1,
  },
  roadName: {
    ...Typography.caption,
    color: 'rgba(3, 20, 10, 0.75)',
    marginTop: Spacing.sm,
  },
  statusPill: {
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginTop: Spacing.sm,
    marginHorizontal: Spacing.lg,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderRadius: Radii.pill,
    backgroundColor: Colors.amberDark,
    borderWidth: 1,
    borderColor: Colors.amberBorder,
  },
  statusText: {
    ...Typography.caption,
    color: Colors.amberLight,
    flexShrink: 1,
  },
  bottom: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: Colors.card,
    borderTopLeftRadius: Radii.xl,
    borderTopRightRadius: Radii.xl,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.lg,
    ...Elevation.sheet,
  },
  tripRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  eta: {
    ...Typography.h1,
    color: Colors.dispatchGreenLight,
  },
  etaSub: {
    ...Typography.body,
    color: Colors.textSecondary,
  },
  arrivedTitle: {
    ...Typography.h2,
    color: Colors.textPrimary,
  },
  arrivedSub: {
    ...Typography.body,
    color: Colors.textSecondary,
    marginBottom: Spacing.md,
  },
  arrivalBtn: {
    flexDirection: 'row',
    gap: Spacing.sm,
    minHeight: 56,
    borderRadius: Radii.lg,
    backgroundColor: Colors.dispatchGreen,
    alignItems: 'center',
    justifyContent: 'center',
  },
  arrivalBtnText: {
    ...Typography.h3,
    color: Colors.onBrand,
  },
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    marginTop: Spacing.lg,
  },
  round: {
    width: TOUCH_TARGET + 4,
    height: TOUCH_TARGET + 4,
    borderRadius: Radii.pill,
    backgroundColor: Colors.surfaceLight,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  roundDanger: {
    backgroundColor: Colors.dangerDark,
    borderColor: Colors.dangerBorder,
  },
  googleBtn: {
    flex: 1,
    flexDirection: 'row',
    gap: Spacing.sm,
    height: TOUCH_TARGET + 4,
    borderRadius: Radii.pill,
    backgroundColor: Colors.surfaceLight,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  googleText: {
    ...Typography.bodyBold,
    color: Colors.textPrimary,
  },
});
