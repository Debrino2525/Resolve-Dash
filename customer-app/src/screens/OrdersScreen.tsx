import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { FlatList, RefreshControl, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { ScreenHeader } from '../components/ScreenHeader';
import { TactileButton } from '../components/TactileButton';
import { Colors, Radii, Spacing, Typography } from '../theme/theme';
import { cedis, CustomerOrder, isActive, OrderStatus, STATUS_LABEL } from '../types/orders';

const TONE: Record<OrderStatus, { fg: string; bg: string }> = {
  SEARCHING: { fg: Colors.harborBlue, bg: Colors.harborBlueGlow },
  ASSIGNED: { fg: Colors.harborBlue, bg: Colors.harborBlueGlow },
  PICKED_UP: { fg: Colors.harborBlue, bg: Colors.harborBlueGlow },
  DELIVERED: { fg: Colors.dispatchGreenLight, bg: Colors.dispatchGreenGlow },
  CANCELLED: { fg: Colors.textSecondary, bg: Colors.surfaceLight },
  NO_RIDER: { fg: Colors.amberLight, bg: Colors.amberDark },
};

export function OrdersScreen({
  orders,
  loading,
  error,
  onRefresh,
  onOpen,
  onNewDelivery,
}: {
  orders: CustomerOrder[];
  loading: boolean;
  error: string | null;
  onRefresh: () => void;
  onOpen: (o: CustomerOrder) => void;
  onNewDelivery: () => void;
}): React.JSX.Element {
  return (
    <View style={styles.container}>
      <ScreenHeader title="Your deliveries" />
      <FlatList
        data={orders}
        keyExtractor={(o) => o.id}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={onRefresh} tintColor={Colors.dispatchGreen} />}
        ListHeaderComponent={error ? <Text style={styles.error}>{error}</Text> : undefined}
        ListEmptyComponent={
          loading ? undefined : (
            <View style={styles.empty}>
              <Ionicons name="cube-outline" size={48} color={Colors.textMuted} />
              <Text style={styles.emptyTitle}>No deliveries yet</Text>
              <Text style={styles.emptyBody}>Your active and past deliveries will show here.</Text>
              <TactileButton title="Send a package" onPress={onNewDelivery} style={styles.emptyBtn} />
            </View>
          )
        }
        renderItem={({ item: o }) => {
          const tone = TONE[o.status];
          return (
            <TouchableOpacity style={styles.card} onPress={() => onOpen(o)} accessibilityRole="button">
              <View style={styles.top}>
                <Text style={[styles.chip, { color: tone.fg, backgroundColor: tone.bg }]}>{STATUS_LABEL[o.status]}</Text>
                <Text style={styles.fare}>{cedis(o.farePesewas)}</Text>
              </View>
              <Text style={styles.addr} numberOfLines={1}>
                From {o.pickup.address}
              </Text>
              <Text style={styles.addr} numberOfLines={1}>
                To {o.dropoff.address}
                {o.stops?.length ? ` + ${o.stops.length} more` : ''}
              </Text>
              <View style={styles.bottom}>
                <Text style={styles.meta}>
                  {o.code} · {new Date(o.requestedAt).toLocaleDateString([], { day: 'numeric', month: 'short' })}{' '}
                  {new Date(o.requestedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </Text>
                <Text style={styles.action}>
                  {isActive(o.status) ? 'Track' : o.status === 'DELIVERED' && !o.rating ? 'Rate' : 'Details'}
                </Text>
              </View>
            </TouchableOpacity>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  list: { padding: Spacing.lg, gap: Spacing.md, flexGrow: 1 },
  error: { ...Typography.caption, color: Colors.dangerRed, marginBottom: Spacing.sm },
  card: { backgroundColor: Colors.card, borderRadius: Radii.lg, borderWidth: 1, borderColor: Colors.cardBorder, padding: Spacing.lg, gap: 4 },
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.xs },
  chip: {
    ...Typography.micro,
    paddingHorizontal: Spacing.md,
    paddingVertical: 5,
    borderRadius: Radii.pill,
    overflow: 'hidden',
  },
  fare: { ...Typography.h3, color: Colors.textPrimary },
  addr: { ...Typography.body, color: Colors.textPrimary },
  bottom: { flexDirection: 'row', justifyContent: 'space-between', marginTop: Spacing.sm },
  meta: { ...Typography.caption, color: Colors.textMuted },
  action: { ...Typography.caption, color: Colors.dispatchGreenLight, fontWeight: '700' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.sm, padding: Spacing.xl },
  emptyTitle: { ...Typography.h2, color: Colors.textPrimary },
  emptyBody: { ...Typography.body, color: Colors.textSecondary, textAlign: 'center' },
  emptyBtn: { marginTop: Spacing.md, alignSelf: 'stretch' },
});
