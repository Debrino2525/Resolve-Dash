import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, Spacing, Typography } from '../theme/theme';

export type Tab = 'home' | 'orders' | 'account';

const TABS: { key: Tab; label: string; icon: React.ComponentProps<typeof Ionicons>['name'] }[] = [
  { key: 'home', label: 'Home', icon: 'home' },
  { key: 'orders', label: 'Orders', icon: 'receipt' },
  { key: 'account', label: 'Account', icon: 'person-circle' },
];

export function TabBar({
  active,
  onChange,
  ordersBadge = 0,
}: {
  active: Tab;
  onChange: (t: Tab) => void;
  ordersBadge?: number;
}): React.JSX.Element {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.bar, { paddingBottom: Math.max(insets.bottom, Spacing.sm) }]} accessibilityRole="tablist">
      {TABS.map((t) => {
        const on = t.key === active;
        return (
          <TouchableOpacity
            key={t.key}
            style={styles.tab}
            onPress={() => onChange(t.key)}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            accessibilityLabel={t.key === 'orders' && ordersBadge ? `Orders, ${ordersBadge} active` : t.label}
          >
            <View>
              <Ionicons
                name={on ? t.icon : (`${t.icon}-outline` as typeof t.icon)}
                size={24}
                color={on ? Colors.dispatchGreenLight : Colors.textMuted}
              />
              {t.key === 'orders' && ordersBadge > 0 && (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{ordersBadge}</Text>
                </View>
              )}
            </View>
            <Text style={[styles.label, on && styles.labelOn]}>{t.label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    backgroundColor: Colors.card,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.cardBorder,
    paddingTop: Spacing.sm,
  },
  tab: { flex: 1, alignItems: 'center', gap: 2, minHeight: 48, justifyContent: 'center' },
  label: { ...Typography.micro, color: Colors.textMuted },
  labelOn: { color: Colors.dispatchGreenLight },
  badge: {
    position: 'absolute',
    top: -4,
    right: -10,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: Colors.dispatchGreen,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  badgeText: { fontSize: 11, fontWeight: '800', color: Colors.onBrand },
});
