import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, BackHandler, Linking, StatusBar, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import {
  answerCall,
  ApiError,
  endCall,
  getCustomerProfile,
  listOrders,
  onboardCustomer,
  startCall,
} from './src/api/backendClient';
import { forgetRememberedUser, getRememberedUser, RememberedUser, rememberUser } from './src/auth/rememberedUser';
import {
  AuthCancelledError,
  sendPhoneSignInCode,
  signInWithApple,
  signInWithEmail,
  signInWithGoogle,
  signOut,
  signUpWithEmail,
  supabase,
  verifyPhoneSignInCode,
} from './src/auth/supabase';
import { CallScreen } from './src/components/CallScreen';
import { Tab, TabBar } from './src/components/TabBar';
import { TactileButton } from './src/components/TactileButton';
import { AccountScreen } from './src/screens/AccountScreen';
import { AuthBusy, AuthScreen, AuthTab, EmailMode, SignUpDetails } from './src/screens/AuthScreen';
import { CompleteProfileScreen, confirmLeaveProfile } from './src/screens/CompleteProfileScreen';
import { ConfirmScreen } from './src/screens/ConfirmScreen';
import { HomeScreen } from './src/screens/HomeScreen';
import { NewDeliveryScreen } from './src/screens/NewDeliveryScreen';
import { OrdersScreen } from './src/screens/OrdersScreen';
import { TrackingScreen } from './src/screens/TrackingScreen';
import { VerifyCodeScreen } from './src/screens/VerifyCodeScreen';
import { WelcomeBackScreen } from './src/screens/WelcomeBackScreen';
import { registerForPush, unregisterFromPush, useOrderNotificationTaps } from './src/services/push';
import { Colors, Spacing, Typography } from './src/theme/theme';
import { CustomerOrder, CustomerProfile, DeliveryDraft, isActive, Quote } from './src/types/orders';

type Phase = 'starting' | 'signed_out' | 'loading' | 'needs_profile' | 'ready' | 'error';

/** Signed-out screens: Welcome back (returning user), Sign In / Sign Up, then the SMS code. */
type AuthView =
  | { name: 'welcome' }
  | { name: 'form'; tab: AuthTab; email?: boolean }
  | { name: 'code'; phone: string; signUp: SignUpDetails | null; from: 'welcome' | 'form'; tab: AuthTab };

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
  const [authBusy, setAuthBusy] = useState<AuthBusy>(null);
  const [authView, setAuthView] = useState<AuthView>({ name: 'form', tab: 'sign_in' });
  const [remembered, setRemembered] = useState<RememberedUser | null>(null);
  const [sessionPhone, setSessionPhone] = useState<string | null>(null);
  /** Name and email typed on Sign Up, used to create the profile once the code is confirmed. */
  const pendingSignUp = useRef<SignUpDetails | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);

  const [tab, setTab] = useState<Tab>('home');
  const [page, setPage] = useState<Page>({ name: 'tabs' });
  // Signed in with a profile: register for delivery notifications, and open a tapped one.
  const signedInReady = phase === 'ready' && Boolean(profile);
  useEffect(() => {
    if (signedInReady) void registerForPush();
  }, [signedInReady]);
  useOrderNotificationTaps(signedInReady, (orderId) => setPage({ name: 'track', orderId, initial: null }));
  const [orders, setOrders] = useState<CustomerOrder[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [ordersError, setOrdersError] = useState<string | null>(null);
  /** The call on screen (one at a time); incoming calls open it from the polled orders. */
  const [callUi, setCallUi] = useState<{ orderId: string; mode: 'outgoing' | 'incoming' } | null>(null);
  const dismissedCalls = useRef(new Set<string>());

  const loadProfile = useCallback(async (): Promise<void> => {
    setPhase('loading');
    setErrorMessage(null);
    try {
      const p = await getCustomerProfile();
      setProfile(p);
      setPhase('ready');
      void rememberUser(p.fullName, p.phoneNumber);
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        // Signed up with name + phone: create the profile straight away, no extra screen.
        const signUp = pendingSignUp.current;
        pendingSignUp.current = null;
        if (signUp) {
          try {
            const p = await onboardCustomer(`${signUp.firstName} ${signUp.lastName}`, null, signUp.email);
            setProfile(p);
            setPhase('ready');
            void rememberUser(p.fullName, p.phoneNumber);
            return;
          } catch (onboardErr) {
            setErrorMessage(onboardErr instanceof Error ? onboardErr.message : 'Could not create your profile');
          }
        }
        setPhase('needs_profile');
      } else {
        setErrorMessage(err instanceof Error ? err.message : 'Could not reach GhanaDash');
        setPhase('error');
      }
    }
  }, []);

  // Returning user on this phone: start on Welcome back.
  useEffect(() => {
    void getRememberedUser().then((u) => {
      setRemembered(u);
      if (u) setAuthView({ name: 'welcome' });
    });
  }, []);

  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (!session) {
        void getRememberedUser().then((u) => {
          setRemembered(u);
          setAuthView(u ? { name: 'welcome' } : { name: 'form', tab: 'sign_in' });
        });
        setSessionPhone(null);
        setPhase('signed_out');
        setProfile(null);
        setOrders([]);
        setPage({ name: 'tabs' });
        setTab('home');
        setEmail(null);
        return;
      }
      setEmail(session.user.email ?? null);
      // Supabase stores the verified sign-in phone without '+'.
      setSessionPhone(session.user.phone ? `+${session.user.phone.replace(/^\+/, '')}` : null);
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
    // 5 s so a call from the rider rings promptly on any screen.
    const t = setInterval(() => void refreshOrders(), 5_000);
    return () => clearInterval(t);
  }, [phase, activeOrders.length, page.name, refreshOrders]);

  // Android back button walks back through pages.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      // Sign-in: step back from the code screen, and from the form to Welcome back.
      if (phase === 'signed_out') {
        if (authView.name === 'code') {
          setErrorMessage(null);
          setAuthView(authView.from === 'welcome' && remembered ? { name: 'welcome' } : { name: 'form', tab: authView.tab });
          return true;
        }
        if (authView.name === 'form' && remembered) {
          setErrorMessage(null);
          setAuthView({ name: 'welcome' });
          return true;
        }
        return false;
      }
      if (phase === 'needs_profile') {
        confirmLeaveProfile(() => signOut());
        return true;
      }
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
  }, [page, tab, phase, authView, remembered]);

  // A rider calling: ring on whatever screen the customer is on.
  useEffect(() => {
    if (callUi) return;
    const ringing = orders.find((o) => o.call?.status === 'RINGING' && o.call.incoming && !dismissedCalls.current.has(o.call.id));
    if (ringing?.call) {
      dismissedCalls.current.add(ringing.call.id);
      setCallUi({ orderId: ringing.id, mode: 'incoming' });
    }
  }, [orders, callUi]);

  const upsertOrder = useCallback((o: CustomerOrder): void => {
    setOrders((list) => [o, ...list.filter((x) => x.id !== o.id)].sort((a, b) => b.requestedAt.localeCompare(a.requestedAt)));
  }, []);

  async function handlePhone(phone: string, signUp: SignUpDetails | null, from: 'welcome' | 'form', tab: AuthTab): Promise<void> {
    setAuthBusy('phone');
    setErrorMessage(null);
    setInfoMessage(null);
    try {
      await sendPhoneSignInCode(phone);
      setAuthView({ name: 'code', phone, signUp, from, tab });
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Could not send the SMS code');
    } finally {
      setAuthBusy(null);
    }
  }

  async function handleVerifyCode(phone: string, code: string, signUp: SignUpDetails | null): Promise<void> {
    setAuthBusy('phone');
    setErrorMessage(null);
    pendingSignUp.current = signUp;
    try {
      await verifyPhoneSignInCode(phone, code); // the auth listener takes it from here
    } catch (err) {
      pendingSignUp.current = null;
      setErrorMessage(err instanceof Error ? err.message : 'Could not check the code');
    } finally {
      setAuthBusy(null);
    }
  }

  async function handleApple(): Promise<void> {
    setAuthBusy('apple');
    setErrorMessage(null);
    setInfoMessage(null);
    try {
      await signInWithApple();
    } catch (err) {
      if (!(err instanceof AuthCancelledError)) setErrorMessage(err instanceof Error ? err.message : 'Apple sign-in failed');
    } finally {
      setAuthBusy(null);
    }
  }

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
    await unregisterFromPush();
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
    const clear = (): void => {
      setErrorMessage(null);
      setInfoMessage(null);
    };
    if (authView.name === 'welcome' && remembered) {
      edgeToEdge = true;
      screen = (
        <WelcomeBackScreen
          user={remembered}
          busy={authBusy === 'phone'}
          error={errorMessage}
          onContinueWithPhone={(phone) => void handlePhone(phone, null, 'welcome', 'sign_in')}
          onUseEmail={() => {
            clear();
            setAuthView({ name: 'form', tab: 'sign_in', email: true });
          }}
          onUseAnotherAccount={() => {
            clear();
            void forgetRememberedUser();
            setRemembered(null);
            setAuthView({ name: 'form', tab: 'sign_in' });
          }}
        />
      );
    } else if (authView.name === 'code') {
      const view = authView;
      screen = (
        <VerifyCodeScreen
          phoneE164={view.phone}
          busy={authBusy === 'phone'}
          error={errorMessage}
          onVerify={(code) => handleVerifyCode(view.phone, code, view.signUp)}
          onResend={async () => {
            setErrorMessage(null);
            await sendPhoneSignInCode(view.phone).catch((err: unknown) => {
              setErrorMessage(err instanceof Error ? err.message : 'Could not send the SMS code');
              throw err;
            });
          }}
          onEdit={() => {
            clear();
            setAuthView(view.from === 'welcome' && remembered ? { name: 'welcome' } : { name: 'form', tab: view.tab });
          }}
        />
      );
    } else {
      const view = authView.name === 'form' ? authView : { name: 'form' as const, tab: 'sign_in' as AuthTab };
      screen = (
        <AuthScreen
          key={`${view.tab}-${view.email ? 'email' : 'phone'}`}
          initialTab={view.tab}
          startWithEmail={view.email}
          onBack={
            remembered
              ? () => {
                  clear();
                  setAuthView({ name: 'welcome' });
                }
              : undefined
          }
          busy={authBusy}
          errorMessage={errorMessage}
          infoMessage={infoMessage}
          onGoogle={handleGoogle}
          onApple={handleApple}
          onPhone={(phone, signUp) => handlePhone(phone, signUp, 'form', signUp ? 'sign_up' : 'sign_in')}
          onEmailSubmit={handleEmail}
        />
      );
    }
  } else if (phase === 'needs_profile') {
    screen = (
      <CompleteProfileScreen
        accountEmail={email}
        verifiedPhone={sessionPhone}
        onSignOut={handleSignOut}
        onComplete={async (fullName, token) => {
          const p = await onboardCustomer(fullName, token);
          setProfile(p);
          setPhase('ready');
          void rememberUser(p.fullName, p.phoneNumber);
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
        onCallRider={(o) => setCallUi({ orderId: o.id, mode: 'outgoing' })}
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
              <AccountScreen
                profile={profile}
                orders={orders}
                onSignOut={handleSignOut}
                onOpenOrder={openOrder}
                onShowOrders={() => setTab('orders')}
                onProfileChange={(p) => {
                  setProfile(p);
                  void rememberUser(p.fullName, p.phoneNumber);
                }}
              />
            </SafeAreaView>
          )}
        </View>
        <TabBar active={tab} onChange={setTab} ordersBadge={activeOrders.length} />
      </View>
    );
  }

  const inTabs = phase === 'ready' && profile && page.name === 'tabs';

  const callOrder = callUi ? orders.find((o) => o.id === callUi.orderId) ?? null : null;

  return (
    <SafeAreaProvider>
      {callUi && (
        <CallScreen
          visible
          mode={callUi.mode}
          otherName={callOrder?.rider?.fullName ?? 'Your rider'}
          otherLabel="Your rider"
          polled={callOrder?.call ?? null}
          api={{
            start: () => startCall(callUi.orderId),
            answer: () => answerCall(callUi.orderId),
            end: () => endCall(callUi.orderId),
          }}
          onPhoneCall={
            callOrder?.rider ? () => void Linking.openURL(`tel:${callOrder.rider!.phoneNumber}`) : undefined
          }
          onClose={() => {
            setCallUi(null);
            void refreshOrders();
          }}
        />
      )}
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
