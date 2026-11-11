import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import React, { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { nearbyRiders } from '../api/backendClient';
import { DeliveryMap } from '../components/DeliveryMap';
import { getCurrentPoint } from '../services/location';
import { Colors, Elevation, Radii, Spacing, Typography } from '../theme/theme';
import { cedis, CustomerOrder, CustomerProfile, Point, STATUS_LABEL } from '../types/orders';

export interface HomeScreenProps {
  profile: CustomerProfile;
  activeOrders: CustomerOrder[];
  onNewDelivery: () => void;
  onOpenOrder: (id: string) => void;
}

/** Map of riders around you, any live deliveries, and the "Send a package" entry point. */
export function HomeScreen({ profile, activeOrders, onNewDelivery, onOpenOrder }: HomeScreenProps): React.JSX.Element {
  const insets = useSafeAreaInsets();
  const [here, setHere] = useState<Point | null>(null);
  const [riders, setRiders] = useState<Point[]>([]);
  const [riderCount, setRiderCount] = useState<number | null>(null);

  useEffect(() => {
    void getCurrentPoint(true).then(setHere);
  }, []);

  useEffect(() => {
    if (!here) return;
    let alive = true;
    const load = (): void => {
      nearbyRiders(here)
        .then((r) => {
          if (!alive) return;
          setRiders(r.riders);
          setRiderCount(r.count);
        })
        .catch(() => undefined);
    };
    load();
    const t = setInterval(load, 20_000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [here]);

  const firstName = profile.fullName.split(' ')[0];

  return (
    <View style={styles.container}>
      <View style={styles.mapArea}>
        <DeliveryMap center={here} nearby={riders} edgePadding={{ top: 40, bottom: 40 }} />
        <View style={[styles.mapChip, { top: insets.top + Spacing.sm }]}>
          <View style={[styles.dot, { backgroundColor: riderCount ? Colors.dispatchGreen : Colors.textMuted }]} />
          <Text style={styles.mapChipText}>
            {riderCount === null
              ? 'Looking for riders near you…'
              : riderCount === 0
                ? 'No riders online nearby right now'
                : `${riderCount} rider${riderCount === 1 ? '' : 's'} online nearby`}
          </Text>
        </View>
      </View>

      <ScrollView style={styles.sheet} contentContainerStyle={styles.sheetContent}>
        <Text style={styles.greeting}>Hi {firstName}</Text>
        <Text style={styles.headline}>What are we sending today?</Text>

        <TouchableOpacity style={styles.sendCard} onPress={onNewDelivery} accessibilityRole="button" activeOpacity={0.85}>
          <View style={styles.sendIcon}>
            <MaterialCommunityIcons name="moped" size={28} color={Colors.onBrand} />
          </View>
          <View style={styles.flex}>
            <Text style={styles.sendTitle}>Send a package</Text>
            <Text style={styles.sendSub}>Pickup to drop-off by motorbike · pay cash on delivery</Text>
          </View>
          <Ionicons name="arrow-forward" size={22} color={Colors.onBrand} />
        </TouchableOpacity>

        {activeOrders.length > 0 && (
          <>
            <Text style={styles.section}>On the way</Text>
            {activeOrders.map((o) => (
              <TouchableOpacity key={o.id} style={styles.active} onPress={() => onOpenOrder(o.id)} accessibilityRole="button">
                <View style={styles.activeIcon}>
                  <Ionicons name={o.status === 'SEARCHING' ? 'search' : 'navigate'} size={18} color={Colors.harborBlue} />
                </View>
                <View style={styles.flex}>
                  <Text style={styles.activeTitle}>{STATUS_LABEL[o.status]}</Text>
                  <Text style={styles.activeSub} numberOfLines={1}>
                    To {o.dropoff.address}
                  </Text>
                </View>
                <View style={styles.activeRight}>
                  <Text style={styles.activeFare}>{cedis(o.farePesewas)}</Text>
                  <Text style={styles.activeTrack}>Track</Text>
                </View>
              </TouchableOpacity>
            ))}
          </>
        )}

        <Text style={styles.section}>How it works</Text>
        <View style={styles.steps}>
          <Step icon="location" title="Set pickup and drop-off" body="Search, use your location, or pin it on the map. Add a landmark so the rider finds it fast." />
          <Step icon="pricetag" title="See the price first" body="You get the exact fare by road distance before you book." />
          <Step icon="key" title="Hand over with a PIN" body="Pay the rider in cash. They complete the delivery with your 4-digit PIN." />
        </View>
      </ScrollView>
    </View>
  );
}

function Step({ icon, title, body }: { icon: React.ComponentProps<typeof Ionicons>['name']; title: string; body: string }): React.JSX.Element {
  return (
    <View style={styles.step}>
      <View style={styles.stepIcon}>
        <Ionicons name={icon} size={18} color={Colors.dispatchGreenLight} />
      </View>
      <View style={styles.flex}>
        <Text style={styles.stepTitle}>{title}</Text>
        <Text style={styles.stepBody}>{body}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  flex: { flex: 1 },
  mapArea: { height: '38%', overflow: 'hidden' },
  mapChip: {
    position: 'absolute',
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.card,
    borderRadius: Radii.pill,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    ...Elevation.floating,
  },
  dot: { width: 8, height: 8, borderRadius: 4 },
  mapChipText: { ...Typography.caption, color: Colors.textPrimary, fontWeight: '700' },
  sheet: {
    flex: 1,
    marginTop: -Spacing.xxl,
    backgroundColor: Colors.background,
    borderTopLeftRadius: Radii.xl,
    borderTopRightRadius: Radii.xl,
  },
  sheetContent: { padding: Spacing.xl, gap: Spacing.md, paddingBottom: Spacing.huge },
  greeting: { ...Typography.bodyBold, color: Colors.textSecondary },
  headline: { ...Typography.h1, color: Colors.textPrimary, marginBottom: Spacing.sm },
  sendCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    backgroundColor: Colors.dispatchGreen,
    borderRadius: Radii.xl,
    padding: Spacing.lg,
    ...Elevation.card,
  },
  sendIcon: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: 'rgba(255,255,255,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendTitle: { ...Typography.h2, color: Colors.onBrand },
  sendSub: { ...Typography.caption, color: Colors.onBrand },
  section: { ...Typography.h3, color: Colors.textPrimary, marginTop: Spacing.lg },
  active: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    backgroundColor: Colors.card,
    borderRadius: Radii.lg,
    padding: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
  },
  activeIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.harborBlueGlow,
    alignItems: 'center',
    justifyContent: 'center',
  },
  activeTitle: { ...Typography.bodyBold, color: Colors.textPrimary },
  activeSub: { ...Typography.caption, color: Colors.textSecondary },
  activeRight: { alignItems: 'flex-end' },
  activeFare: { ...Typography.bodyBold, color: Colors.textPrimary },
  activeTrack: { ...Typography.caption, color: Colors.dispatchGreenLight, fontWeight: '700' },
  steps: { backgroundColor: Colors.card, borderRadius: Radii.lg, padding: Spacing.lg, gap: Spacing.lg, borderWidth: 1, borderColor: Colors.cardBorder },
  step: { flexDirection: 'row', gap: Spacing.md },
  stepIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.dispatchGreenGlow,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepTitle: { ...Typography.bodyBold, color: Colors.textPrimary },
  stepBody: { ...Typography.caption, color: Colors.textSecondary },
});
