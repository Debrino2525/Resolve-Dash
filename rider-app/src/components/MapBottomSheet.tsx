import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  LayoutChangeEvent,
  PanResponder,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, Elevation, Radii, Spacing } from '../theme/theme';

export interface MapBottomSheetProps {
  /** Always visible, even when collapsed (status + main action). Drag area. */
  header: React.ReactNode;
  /** Shown when expanded. */
  children: React.ReactNode;
  expanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
  /** Visible height in px (for map padding), reported whenever it changes. */
  onVisibleHeightChange?: (height: number) => void;
}

const DRAG_THRESHOLD = 40;
const VELOCITY_THRESHOLD = 0.5;

/**
 * Bottom sheet over the map with two snap points: expanded (header + body) and collapsed
 * (header only). Swipe the header up/down or tap the grab handle to toggle.
 */
export function MapBottomSheet({
  header,
  children,
  expanded,
  onExpandedChange,
  onVisibleHeightChange,
}: MapBottomSheetProps): React.JSX.Element {
  const insets = useSafeAreaInsets();
  const [headerHeight, setHeaderHeight] = useState(0);
  const [bodyHeight, setBodyHeight] = useState(0);
  const translateY = useRef(new Animated.Value(0)).current;

  // How far the sheet moves down when collapsed: the body, minus the bit that keeps the header
  // clear of the home indicator.
  const collapseOffset = Math.max(0, bodyHeight - insets.bottom - Spacing.sm);
  const offsetRef = useRef(collapseOffset);
  offsetRef.current = collapseOffset;
  const expandedRef = useRef(expanded);
  expandedRef.current = expanded;

  useEffect(() => {
    Animated.spring(translateY, {
      toValue: expanded ? 0 : collapseOffset,
      useNativeDriver: true,
      damping: 22,
      stiffness: 220,
      mass: 0.9,
    }).start();
    onVisibleHeightChange?.(headerHeight + bodyHeight - (expanded ? 0 : collapseOffset));
  }, [expanded, collapseOffset, headerHeight, bodyHeight, translateY, onVisibleHeightChange]);

  const pan = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_e, g) => Math.abs(g.dy) > 6 && Math.abs(g.dy) > Math.abs(g.dx),
        onPanResponderMove: (_e, g) => {
          const base = expandedRef.current ? 0 : offsetRef.current;
          translateY.setValue(Math.min(offsetRef.current, Math.max(0, base + g.dy)));
        },
        onPanResponderRelease: (_e, g) => {
          let next = expandedRef.current;
          if (g.dy < -DRAG_THRESHOLD || g.vy < -VELOCITY_THRESHOLD) next = true;
          else if (g.dy > DRAG_THRESHOLD || g.vy > VELOCITY_THRESHOLD) next = false;
          if (next === expandedRef.current) {
            // Snap back to where it was.
            Animated.spring(translateY, {
              toValue: next ? 0 : offsetRef.current,
              useNativeDriver: true,
            }).start();
          }
          onExpandedChange(next);
        },
        onPanResponderTerminate: () => {
          Animated.spring(translateY, {
            toValue: expandedRef.current ? 0 : offsetRef.current,
            useNativeDriver: true,
          }).start();
        },
      }),
    [onExpandedChange, translateY],
  );

  return (
    <Animated.View style={[styles.sheet, { transform: [{ translateY }] }]}>
      <View
        {...pan.panHandlers}
        onLayout={(e: LayoutChangeEvent) => setHeaderHeight(e.nativeEvent.layout.height)}
      >
        <Pressable
          onPress={() => onExpandedChange(!expanded)}
          style={styles.handleZone}
          accessibilityRole="button"
          accessibilityLabel={expanded ? 'Collapse panel' : 'Expand panel'}
          accessibilityState={{ expanded }}
          hitSlop={8}
        >
          <View style={styles.handle} />
        </Pressable>
        {header}
      </View>
      <View
        onLayout={(e: LayoutChangeEvent) => setBodyHeight(e.nativeEvent.layout.height)}
        style={{ paddingBottom: insets.bottom + Spacing.lg }}
        importantForAccessibility={expanded ? 'auto' : 'no-hide-descendants'}
        accessibilityElementsHidden={!expanded}
      >
        {children}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  sheet: {
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
    ...Elevation.sheet,
  },
  handleZone: {
    alignItems: 'center',
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.md,
  },
  handle: {
    width: 44,
    height: 5,
    borderRadius: 3,
    backgroundColor: Colors.surfaceLight,
  },
});
