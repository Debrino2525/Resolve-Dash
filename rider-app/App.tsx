import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, BackHandler, StatusBar, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import {
  ApiError,
  getRiderProfile,
  getSubscriptionStatus,
  onboardRider,
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
import { TactileButton } from './src/components/TactileButton';
import { AccountRejectedScreen } from './src/screens/AccountRejectedScreen';
import { AuthBusy, AuthScreen, AuthTab, EmailMode, SignUpDetails } from './src/screens/AuthScreen';
import { CompleteProfileScreen, confirmLeaveProfile } from './src/screens/CompleteProfileScreen';
import { DashboardScreen } from './src/screens/DashboardScreen';
import { confirmFinishLater, PendingVerificationScreen } from './src/screens/PendingVerificationScreen';
import { VerifyCodeScreen } from './src/screens/VerifyCodeScreen';
import { WelcomeBackScreen } from './src/screens/WelcomeBackScreen';
import { executePaystackSubscriptionPayment } from './src/services/paystackCheckout';
import { stopBackgroundTracking } from './src/services/backgroundLocation';
import { registerForPush, unregisterFromPush } from './src/services/push';
import { Colors as AuthColors } from './src/theme/authTheme';
import { Colors, Spacing, Typography } from './src/theme/theme';
import { RiderProfile, SubscriptionDetails } from './src/types/subscription';

/**
 * signed_out     → AuthScreen (Google / email)
 * loading        → spinner while the backend profile loads
 * needs_profile  → CompleteProfileScreen (name + SMS-verified phone), first sign-in only
 * ready          → pending / rejected / dashboard, by the backend's onboardingStatus
 * error          → backend unreachable etc., with retry
 */
type Phase = 'starting' | 'signed_out' | 'loading' | 'needs_profile' | 'ready' | 'error';

/** Signed-out screens: Welcome back (returning rider), Sign In / Sign Up, then the SMS code. */
type AuthView =
  | { name: 'welcome' }
  | { name: 'form'; tab: AuthTab; email?: boolean }
  | { name: 'code'; phone: string; signUp: SignUpDetails | null; from: 'welcome' | 'form'; tab: AuthTab };

export default function App(): React.JSX.Element {
  const [phase, setPhase] = useState<Phase>('starting');
  const [accountEmail, setAccountEmail] = useState<string | null>(null);
  const [profile, setProfile] = useState<RiderProfile | null>(null);
  const [subscription, setSubscription] = useState<SubscriptionDetails | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [renewLoading, setRenewLoading] = useState(false);
  const [authBusy, setAuthBusy] = useState<AuthBusy>(null);
  const [authView, setAuthView] = useState<AuthView>({ name: 'form', tab: 'sign_in' });
  const [remembered, setRemembered] = useState<RememberedUser | null>(null);
  const [sessionPhone, setSessionPhone] = useState<string | null>(null);
  /** Name typed on Sign Up, used to create the rider profile once the code is confirmed. */
  const pendingSignUp = useRef<SignUpDetails | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);

  /** Reads the authoritative rider state from the backend and picks the screen. */
  const loadBackendState = useCallback(async (initial: boolean): Promise<void> => {
    if (initial) setPhase('loading');
    else setRefreshing(true);
    setErrorMessage(null);
    try {
      const riderProfile = await getRiderProfile();
      setProfile(riderProfile);
      if (riderProfile.phoneNumber) void rememberUser(riderProfile.fullName, riderProfile.phoneNumber);
      setSubscription(
        riderProfile.onboardingStatus === 'ACTIVE' ? await getSubscriptionStatus() : null,
      );
      setPhase('ready');
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        // Signed up with name + phone: create the rider profile now, then on to documents.
        const signUp = pendingSignUp.current;
        pendingSignUp.current = null;
        if (signUp) {
          try {
            const created = await onboardRider(`${signUp.firstName} ${signUp.lastName}`, null);
            setProfile(created);
            setSubscription(null);
            setPhase('ready');
            if (created.phoneNumber) void rememberUser(created.fullName, created.phoneNumber);
            return;
          } catch (onboardErr) {
            setErrorMessage(onboardErr instanceof Error ? onboardErr.message : 'Could not create your rider profile');
          }
        }
        setProfile(null);
        setPhase('needs_profile'); // signed in, but no rider profile yet
      } else {
        setErrorMessage(err instanceof Error ? err.message : 'Failed to reach the server');
        if (initial) setPhase('error');
      }
    } finally {
      setRefreshing(false);
    }
  }, []);

  // Approved rider signed in: register this phone for offer and call notifications.
  const isActiveRider = phase === 'ready' && profile?.onboardingStatus === 'ACTIVE';
  useEffect(() => {
    if (isActiveRider) void registerForPush();
  }, [isActiveRider]);

  // Returning rider on this phone: start on Welcome back.
  useEffect(() => {
    void getRememberedUser().then((u) => {
      setRemembered(u);
      if (u) setAuthView({ name: 'welcome' });
    });
  }, []);

  useEffect(() => {
    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      if (!session) {
        void getRememberedUser().then((u) => {
          setRemembered(u);
          setAuthView(u ? { name: 'welcome' } : { name: 'form', tab: 'sign_in' });
        });
        setSessionPhone(null);
        setPhase('signed_out');
        setProfile(null);
        setSubscription(null);
        setAccountEmail(null);
        return;
      }
      setAccountEmail(session.user.email ?? null);
      // Supabase stores the verified sign-in phone without '+'.
      setSessionPhone(session.user.phone ? `+${session.user.phone.replace(/^\+/, '')}` : null);
      // Only (re)load on sign-in; token refreshes must not reset the screen the rider is on.
      if (event === 'INITIAL_SESSION' || event === 'SIGNED_IN') {
        setInfoMessage(null);
        // Defer: calling Supabase inside this callback can deadlock its auth lock.
        setTimeout(() => void loadBackendState(true), 0);
      }
    });
    return () => listener.subscription.unsubscribe();
  }, [loadBackendState]);

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

  // Android back: step back through sign-in and onboarding instead of closing the app.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
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
        confirmLeaveProfile(handleSignOut);
        return true;
      }
      if (phase === 'ready' && profile?.onboardingStatus === 'PENDING_VERIFICATION') {
        confirmFinishLater(handleSignOut);
        return true;
      }
      return false;
    });
    return () => sub.remove();
  });

  async function handleGoogle(): Promise<void> {
    setAuthBusy('google');
    setErrorMessage(null);
    setInfoMessage(null);
    try {
      await signInWithGoogle(); // SIGNED_IN event loads the profile
    } catch (err) {
      if (!(err instanceof AuthCancelledError)) {
        setErrorMessage(err instanceof Error ? err.message : 'Google sign-in failed');
      }
    } finally {
      setAuthBusy(null);
    }
  }

  async function handleEmail(mode: EmailMode, email: string, password: string): Promise<void> {
    setAuthBusy('email');
    setErrorMessage(null);
    setInfoMessage(null);
    try {
      if (mode === 'sign_in') {
        await signInWithEmail(email, password);
      } else {
        const result = await signUpWithEmail(email, password);
        if (result.status === 'confirm_email') {
          setInfoMessage(
            `Check ${result.email} for a confirmation link, then come back and sign in. ` +
              'If you already have an account, just sign in.',
          );
        }
      }
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Authentication failed');
    } finally {
      setAuthBusy(null);
    }
  }

  async function handleCompleteProfile(fullName: string, phoneToken: string | null): Promise<void> {
    const created = await onboardRider(fullName, phoneToken);
    setProfile(created);
    if (created.phoneNumber) void rememberUser(created.fullName, created.phoneNumber);
    setSubscription(null);
    setPhase('ready');
  }

  async function handleRenewSubscription(): Promise<void> {
    try {
      setRenewLoading(true);
      setErrorMessage(null);
      setSubscription(await executePaystackSubscriptionPayment());
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : 'Subscription checkout initialization failed',
      );
    } finally {
      setRenewLoading(false);
    }
  }

  async function handleSignOut(): Promise<void> {
    await unregisterFromPush();
    await stopBackgroundTracking();
    await signOut(); // SIGNED_OUT event resets state
  }

  const refresh = (): Promise<void> => loadBackendState(false);

  let screen: React.JSX.Element;
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
        accountEmail={accountEmail}
        verifiedPhone={sessionPhone}
        onComplete={handleCompleteProfile}
        onSignOut={handleSignOut}
      />
    );
  } else if (phase === 'error' || !profile) {
    screen = (
      <View style={styles.center}>
        <Text style={styles.errorTitle}>Can't reach GhanaDash</Text>
        <Text style={styles.errorBody}>{errorMessage ?? 'Something went wrong.'}</Text>
        <TactileButton
          title="Try Again"
          variant="primary"
          onPress={() => loadBackendState(true)}
          style={styles.centerButton}
        />
        <TactileButton
          title="Sign Out"
          variant="secondary"
          onPress={handleSignOut}
          style={styles.centerButton}
        />
      </View>
    );
  } else if (profile.onboardingStatus === 'REJECTED') {
    screen = (
      <AccountRejectedScreen
        riderName={profile.fullName}
        onRefreshStatus={refresh}
        onSignOut={handleSignOut}
        loading={refreshing}
      />
    );
  } else if (profile.onboardingStatus === 'PENDING_VERIFICATION') {
    screen = (
      <PendingVerificationScreen
        riderName={profile.fullName}
        email={accountEmail}
        phoneNumber={profile.phoneNumber}
        onRefreshStatus={refresh}
        onSignOut={handleSignOut}
        loading={refreshing}
      />
    );
  } else {
    screen = (
      <DashboardScreen
        profile={profile}
        subscription={subscription}
        onRenewSubscription={handleRenewSubscription}
        onRefreshData={refresh}
        onSignOut={handleSignOut}
        renewLoading={renewLoading}
        email={accountEmail}
      />
    );
  }

  // The map dashboard draws edge to edge and handles insets itself; other screens sit inside
  // the safe area.
  const edgeToEdge = phase === 'ready' && profile?.onboardingStatus === 'ACTIVE';

  // The sign-in screens use the light design (same as the customer app).
  const signedOut = phase === 'signed_out';

  return (
    <SafeAreaProvider>
      <StatusBar barStyle={signedOut ? 'dark-content' : 'light-content'} />
      {edgeToEdge ? (
        <View style={styles.container}>{screen}</View>
      ) : (
        <SafeAreaView style={[styles.container, signedOut && { backgroundColor: AuthColors.background }]} edges={['top', 'bottom']}>
          {screen}
        </SafeAreaView>
      )}
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  center: {
    flex: 1,
    backgroundColor: Colors.background,
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.xl,
    gap: Spacing.md,
  },
  errorTitle: {
    ...Typography.h2,
    color: Colors.textPrimary,
  },
  errorBody: {
    ...Typography.body,
    color: Colors.textSecondary,
    textAlign: 'center',
  },
  centerButton: {
    width: 240,
  },
});
