import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, StatusBar, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import {
  ApiError,
  getRiderProfile,
  getSubscriptionStatus,
  onboardRider,
} from './src/api/backendClient';
import {
  AuthCancelledError,
  signInWithEmail,
  signInWithGoogle,
  signOut,
  signUpWithEmail,
  supabase,
} from './src/auth/supabase';
import { TactileButton } from './src/components/TactileButton';
import { AccountRejectedScreen } from './src/screens/AccountRejectedScreen';
import { AuthScreen, EmailMode } from './src/screens/AuthScreen';
import { CompleteProfileScreen } from './src/screens/CompleteProfileScreen';
import { DashboardScreen } from './src/screens/DashboardScreen';
import { PendingVerificationScreen } from './src/screens/PendingVerificationScreen';
import { executePaystackSubscriptionPayment } from './src/services/paystackCheckout';
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

export default function App(): React.JSX.Element {
  const [phase, setPhase] = useState<Phase>('starting');
  const [accountEmail, setAccountEmail] = useState<string | null>(null);
  const [profile, setProfile] = useState<RiderProfile | null>(null);
  const [subscription, setSubscription] = useState<SubscriptionDetails | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [renewLoading, setRenewLoading] = useState(false);
  const [authBusy, setAuthBusy] = useState<'google' | 'email' | null>(null);
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
      setSubscription(
        riderProfile.onboardingStatus === 'ACTIVE' ? await getSubscriptionStatus() : null,
      );
      setPhase('ready');
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
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

  useEffect(() => {
    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      if (!session) {
        setPhase('signed_out');
        setProfile(null);
        setSubscription(null);
        setAccountEmail(null);
        return;
      }
      setAccountEmail(session.user.email ?? null);
      // Only (re)load on sign-in; token refreshes must not reset the screen the rider is on.
      if (event === 'INITIAL_SESSION' || event === 'SIGNED_IN') {
        setInfoMessage(null);
        // Defer: calling Supabase inside this callback can deadlock its auth lock.
        setTimeout(() => void loadBackendState(true), 0);
      }
    });
    return () => listener.subscription.unsubscribe();
  }, [loadBackendState]);

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

  async function handleCompleteProfile(fullName: string, phoneToken: string): Promise<void> {
    const created = await onboardRider(fullName, phoneToken);
    setProfile(created);
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
    screen = (
      <AuthScreen
        onGoogle={handleGoogle}
        onEmailSubmit={handleEmail}
        busy={authBusy}
        errorMessage={errorMessage}
        infoMessage={infoMessage}
      />
    );
  } else if (phase === 'needs_profile') {
    screen = (
      <CompleteProfileScreen
        accountEmail={accountEmail}
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

  return (
    <SafeAreaProvider>
      <StatusBar barStyle="light-content" />
      {edgeToEdge ? (
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
