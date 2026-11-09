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
  sendEmailOtp,
  sendPhoneOtp,
  supabase,
  verifyEmailOtp,
  verifyPhoneOtp,
} from './src/auth/supabase';
import { AuthScreen } from './src/screens/AuthScreen';
import { DashboardScreen } from './src/screens/DashboardScreen';
import { PendingVerificationScreen } from './src/screens/PendingVerificationScreen';
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
      // If profile not found, rider needs to complete onboarding
      if (!msg.includes('onboarding')) {
        setErrorMessage(msg);
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleSendOtp(email: string): Promise<void> {
    try {
      setLoading(true);
      setErrorMessage(null);
      await sendEmailOtp(email);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to send email verification code');
      throw err;
    } finally {
      setLoading(false);
    }
  }

  async function handleVerifyOtp(
    email: string,
    code: string,
    fullName: string,
    phoneNumber: string,
  ): Promise<void> {
    try {
      setLoading(true);
      setErrorMessage(null);
      await verifyEmailOtp(email, code);
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
      setErrorMessage(err instanceof Error ? err.message : 'Invalid or expired verification code');
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
      <StatusBar barStyle="light-content" backgroundColor={Colors.background} />

      {loading && !profile ? (
        <View style={styles.loaderContainer}>
          <ActivityIndicator size="large" color={Colors.dispatchGreen} />
        </View>
      ) : !authenticated || !profile ? (
        <AuthScreen
          onSendOtp={handleSendOtp}
          onVerifyOtp={handleVerifyOtp}
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
