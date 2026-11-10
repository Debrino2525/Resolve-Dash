import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  SafeAreaView,
  StatusBar,
  StyleSheet,
  View,
} from 'react-native';
import {
  getRiderProfile,
  getSubscriptionStatus,
  onboardRider,
} from './src/api/backendClient';
import {
  signInOrRegisterWithPassword,
  supabase,
} from './src/auth/supabase';
import { AuthScreen } from './src/screens/AuthScreen';
import { DashboardScreen } from './src/screens/DashboardScreen';
import { PendingVerificationScreen } from './src/screens/PendingVerificationScreen';
import { TactileButton } from './src/components/TactileButton';
import { executePaystackSubscriptionPayment } from './src/services/paystackCheckout';
import { Colors } from './src/theme/theme';
import { RiderProfile, SubscriptionDetails } from './src/types/subscription';

export default function App(): React.JSX.Element {
  const [authenticated, setAuthenticated] = useState(false);
  const [loading, setLoading] = useState(false);
  const [renewLoading, setRenewLoading] = useState(false);
  const [profile, setProfile] = useState<RiderProfile | null>(null);
  const [subscription, setSubscription] = useState<SubscriptionDetails | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) {
        setAuthenticated(true);
        loadAuthoritativeBackendState();
      }
    });

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      setAuthenticated(!!session);
      if (session) {
        loadAuthoritativeBackendState();
      } else {
        setProfile(null);
        setSubscription(null);
      }
    });

    return () => {
      authListener.subscription.unsubscribe();
    };
  }, []);

  async function loadAuthoritativeBackendState(): Promise<void> {
    try {
      setLoading(true);
      setErrorMessage(null);
      const riderProfile = await getRiderProfile();
      setProfile(riderProfile);

      if (riderProfile.onboardingStatus === 'ACTIVE') {
        const sub = await getSubscriptionStatus();
        setSubscription(sub);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to synchronize with server';
      // If profile not found, clear profile so AuthScreen displays
      if (!msg.includes('onboarding') && !msg.includes('not found')) {
        setErrorMessage(msg);
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleAuthenticate(
    email: string,
    password: string,
    fullName: string,
    phoneNumber: string,
  ): Promise<void> {
    try {
      setLoading(true);
      setErrorMessage(null);
      await signInOrRegisterWithPassword(email, password);
      setAuthenticated(true);

      // Attempt to load existing profile or submit initial onboarding
      try {
        const existingProfile = await getRiderProfile();
        setProfile(existingProfile);
        if (existingProfile.onboardingStatus === 'ACTIVE') {
          const sub = await getSubscriptionStatus();
          setSubscription(sub);
        }
      } catch {
        // Create initial rider profile with PENDING_VERIFICATION status
        if (fullName) {
          const newProfile = await onboardRider(fullName, phoneNumber);
          setProfile(newProfile);
        }
      }
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Authentication failed');
      throw err;
    } finally {
      setLoading(false);
    }
  }

  async function handleRenewSubscription(): Promise<void> {
    try {
      setRenewLoading(true);
      setErrorMessage(null);
      const updatedSub = await executePaystackSubscriptionPayment();
      setSubscription(updatedSub);
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : 'Subscription checkout initialization failed',
      );
    } finally {
      setRenewLoading(false);
    }
  }

  async function handleSignOut(): Promise<void> {
    await supabase.auth.signOut();
    setAuthenticated(false);
    setProfile(null);
    setSubscription(null);
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" />

      {loading && !profile ? (
        <View style={styles.loaderContainer}>
          <ActivityIndicator size="large" color={Colors.dispatchGreen} />
          <TactileButton
            title="Reset / Go to Login"
            variant="secondary"
            onPress={handleSignOut}
            style={{ marginTop: 24, width: 220 }}
          />
        </View>
      ) : !authenticated || !profile ? (
        <AuthScreen
          onAuthenticate={handleAuthenticate}
          loading={loading}
          errorMessage={errorMessage}
        />
      ) : profile.onboardingStatus === 'PENDING_VERIFICATION' ? (
        <PendingVerificationScreen
          riderName={profile.fullName}
          onRefreshStatus={loadAuthoritativeBackendState}
          loading={loading}
        />
      ) : (
        <DashboardScreen
          profile={profile}
          subscription={subscription}
          onRenewSubscription={handleRenewSubscription}
          onRefreshData={loadAuthoritativeBackendState}
          onSignOut={handleSignOut}
          renewLoading={renewLoading}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  loaderContainer: {
    flex: 1,
    backgroundColor: Colors.background,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
