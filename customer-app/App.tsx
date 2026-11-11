import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, BackHandler, StatusBar, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { ApiError, getCustomerProfile, listOrders, onboardCustomer } from './src/api/backendClient';
import {
  AuthCancelledError,
  signInWithEmail,
  signInWithGoogle,
  signOut,
  signUpWithEmail,
  supabase,
} from './src/auth/supabase';
import { Tab, TabBar } from './src/components/TabBar';
import { TactileButton } from './src/components/TactileButton';
import { AccountScreen } from './src/screens/AccountScreen';
import { AuthScreen, EmailMode } from './src/screens/AuthScreen';
import { CompleteProfileScreen } from './src/screens/CompleteProfileScreen';
import { ConfirmScreen } from './src/screens/ConfirmScreen';
import { HomeScreen } from './src/screens/HomeScreen';
import { NewDeliveryScreen } from './src/screens/NewDeliveryScreen';
import { OrdersScreen } from './src/screens/OrdersScreen';
import { TrackingScreen } from './src/screens/TrackingScreen';
import { Colors, Spacing, Typography } from './src/theme/theme';
import { CustomerOrder, CustomerProfile, DeliveryDraft, isActive, Quote } from './src/types/orders';

type Phase = 'starting' | 'signed_out' | 'loading' | 'needs_profile' | 'ready' | 'error';

/** Pages pushed over the tabs. */
type Page =
  | { name: 'tabs' }
  | { name: 'new'; initial?: DeliveryDraft | null }
  | { name: 'confirm'; draft: DeliveryDraft; quote: Quote }
  | { name: 'track'; orderId: string; initial?: CustomerOrder | null };

export default function App(): React.JSX.Element {
  const [phase, setPhase] = useState<Phase>('starting');
  const [email, setEmail] = useState<string | null>(null);
  const [profile, setProfile] = useState<CustomerProfile | null>(null);
  const [authBusy, setAuthBusy] = useState<'google' | 'email' | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);

  const [tab, setTab] = useState<Tab>('home');
  const [page, setPage] = useState<Page>({ name: 'tabs' });
  const [orders, setOrders] = useState<CustomerOrder[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [ordersError, setOrdersError] = useState<string | null>(null);

  const loadProfile = useCallback(async (): Promise<void> => {
    setPhase('loading');
    setErrorMessage(null);
    try {
      setProfile(await getCustomerProfile());
      setPhase('ready');
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        setPhase('needs_profile');
      } else {
        setErrorMessage(err instanceof Error ? err.message : 'Could not reach GhanaDash');
        setPhase('error');
      }
    }
  }, []);

  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (!session) {
        setPhase('signed_out');
        setProfile(null);
        setOrders([]);
        setPage({ name: 'tabs' });
        setTab('home');
        setEmail(null);
        return;
      }
      setEmail(session.user.email ?? null);
      if (event === 'INITIAL_SESSION' || event === 'SIGNED_IN') {
        setInfoMessage(null);
        setTimeout(() => void loadProfile(), 0); // avoid Supabase auth-lock deadlock
      }
    });
    return () => data.subscription.unsubscribe();
  }, [loadProfile]);

  const refreshOrders = useCallback(async (): Promise<void> => {
    setOrdersLoading(true);
    try {
      setOrders(await listOrders());
      setOrdersError(null);
    } catch (err) {
      setOrdersError(err instanceof Error ? err.message : 'Could not load your deliveries');
    } finally {
      setOrdersLoading(false);
    }
  }, []);

  const activeOrders = orders.filter((o) => isActive(o.status));

  useEffect(() => {
    if (phase !== 'ready') return;
    void refreshOrders();
  }, [phase, tab, refreshOrders]);

  // Keep the Home "On the way" list fresh while something is in progress.
  useEffect(() => {
    if (phase !== 'ready' || activeOrders.length === 0 || page.name !== 'tabs') return;
    const t = setInterval(() => void refreshOrders(), 15_000);
    return () => clearInterval(t);
  }, [phase, activeOrders.length, page.name, refreshOrders]);

  // Android back button walks back through pages.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (page.name === 'confirm') {
        setPage({ name: 'new', initial: page.draft });
        return true;
      }
      if (page.name !== 'tabs') {
        setPage({ name: 'tabs' });
        return true;
      }
      if (tab !== 'home') {
        setTab('home');
        return true;
      }
      return false;
    });
    return () => sub.remove();
  }, [page, tab]);

  const upsertOrder = useCallback((o: CustomerOrder): void => {
    setOrders((list) => [o, ...list.filter((x) => x.id !== o.id)].sort((a, b) => b.requestedAt.localeCompare(a.requestedAt)));
  }, []);

  async function handleGoogle(): Promise<void> {
    setAuthBusy('google');
    setErrorMessage(null);
    setInfoMessage(null);
    try {
      await signInWithGoogle();
    } catch (err) {
      if (!(err instanceof AuthCancelledError)) setErrorMessage(err instanceof Error ? err.message : 'Google sign-in failed');
    } finally {
      setAuthBusy(null);
    }
  }

  async function handleEmail(mode: EmailMode, mail: string, password: string): Promise<void> {
    setAuthBusy('email');
    setErrorMessage(null);
    setInfoMessage(null);
    try {
      if (mode === 'sign_in') {
        await signInWithEmail(mail, password);
      } else {
        const r = await signUpWithEmail(mail, password);
        if (r.status === 'confirm_email') {
          setInfoMessage(`Check ${r.email} for a confirmation link, then come back and sign in.`);
        }
      }
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Sign-in failed');
    } finally {
      setAuthBusy(null);
    }
  }

  const handleSignOut = async (): Promise<void> => {
    await signOut();
  };

  let screen: React.JSX.Element;
  let edgeToEdge = false;

  if (phase === 'starting' || phase === 'loading') {
    screen = (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={Colors.dispatchGreen} />
      </View>
    );
  } else if (phase === 'signed_out') {
    screen = (
      <AuthScreen onGoogle={handleGoogle} onEmailSubmit={handleEmail} busy={authBusy} errorMessage={errorMessage} infoMessage={infoMessage} />
    );
  } else if (phase === 'needs_profile') {
    screen = (
      <CompleteProfileScreen
        accountEmail={email}
        onSignOut={handleSignOut}
        onComplete={async (fullName, token) => {
          setProfile(await onboardCustomer(fullName, token));
          setPhase('ready');
        }}
      />
    );
  } else if (phase === 'error' || !profile) {
    screen = (
      <View style={styles.center}>
        <Text style={styles.errorTitle}>Can't reach GhanaDash</Text>
        <Text style={styles.errorBody}>{errorMessage ?? 'Something went wrong.'}</Text>
        <TactileButton title="Try again" onPress={() => void loadProfile()} style={styles.centerButton} />
        <TactileButton title="Sign out" variant="secondary" onPress={() => void handleSignOut()} style={styles.centerButton} />
      </View>
    );
  } else if (page.name === 'new') {
    screen = (
      <NewDeliveryScreen
        profile={profile}
        initial={page.initial}
        onBack={() => setPage({ name: 'tabs' })}
        onQuoted={(draft, quote) => setPage({ name: 'confirm', draft, quote })}
      />
    );
  } else if (page.name === 'confirm') {
    screen = (
      <ConfirmScreen
        draft={page.draft}
        quote={page.quote}
        onBack={() => setPage({ name: 'new', initial: page.draft })}
        onBooked={(order) => {
          upsertOrder(order);
          setPage({ name: 'track', orderId: order.id, initial: order });
        }}
      />
    );
  } else if (page.name === 'track') {
    edgeToEdge = true;
    screen = (
      <TrackingScreen
        key={page.orderId}
        orderId={page.orderId}
        initial={page.initial}
        onClose={() => setPage({ name: 'tabs' })}
        onRebook={(draft) => setPage({ name: 'new', initial: draft })}
        onChanged={upsertOrder}
      />
    );
  } else {
    edgeToEdge = tab === 'home';
    const openOrder = (id: string): void =>
      setPage({ name: 'track', orderId: id, initial: orders.find((o) => o.id === id) ?? null });
    const startNew = (): void => setPage({ name: 'new' });
    screen = (
      <View style={styles.flex}>
        <View style={styles.flex}>
          {tab === 'home' && <HomeScreen profile={profile} activeOrders={activeOrders} onNewDelivery={startNew} onOpenOrder={openOrder} />}
          {tab === 'orders' && (
            <SafeAreaView style={styles.flex} edges={['top']}>
              <OrdersScreen
                orders={orders}
                loading={ordersLoading}
                error={ordersError}
                onRefresh={() => void refreshOrders()}
                onOpen={(o) => openOrder(o.id)}
                onNewDelivery={startNew}
              />
            </SafeAreaView>
          )}
          {tab === 'account' && (
            <SafeAreaView style={styles.flex} edges={['top']}>
              <AccountScreen profile={profile} onSignOut={handleSignOut} />
            </SafeAreaView>
          )}
        </View>
        <TabBar active={tab} onChange={setTab} ordersBadge={activeOrders.length} />
      </View>
    );
  }

  const inTabs = phase === 'ready' && profile && page.name === 'tabs';

  return (
    <SafeAreaProvider>
      <StatusBar barStyle="dark-content" />
      {edgeToEdge || inTabs ? (
        <View style={styles.container}>{screen}</View>
      ) : (
        <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
          {screen}
        </SafeAreaView>
      )}
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  flex: { flex: 1 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: Spacing.xl, gap: Spacing.md, backgroundColor: Colors.background },
  errorTitle: { ...Typography.h2, color: Colors.textPrimary },
  errorBody: { ...Typography.body, color: Colors.textSecondary, textAlign: 'center' },
  centerButton: { width: 240 },
});
