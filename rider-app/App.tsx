import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  SafeAreaView,
  StatusBar,
} from 'react-native';
import { supabase, sendPhoneOtp, verifyPhoneOtp } from './src/auth/supabase';
import { getRiderProfile, getSubscriptionStatus } from './src/api/backendClient';
import { executePaystackSubscriptionPayment } from './src/services/paystackCheckout';
import { RiderProfile, SubscriptionDetails } from './src/types/subscription';
import { formatPesewasToGHS } from './src/types/money';

function computeRemainingHours(targetIso: string | null, serverTimeIso: string): number {
  if (!targetIso) return 0;
  const targetMs = new Date(targetIso).getTime();
  const serverMs = new Date(serverTimeIso).getTime();
  const diffHours = (targetMs - serverMs) / (1000 * 60 * 60);
  return Math.max(0, Math.floor(diffHours));
}

export default function App(): React.JSX.Element {
  const [sessionActive, setSessionActive] = useState(false);
  const [phoneNumber, setPhoneNumber] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [step, setStep] = useState<'PHONE' | 'OTP' | 'DASHBOARD'>('PHONE');
  const [loading, setLoading] = useState(false);
  const [profile, setProfile] = useState<RiderProfile | null>(null);
  const [subscription, setSubscription] = useState<SubscriptionDetails | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) {
        setSessionActive(true);
        loadAuthoritativeBackendState();
      }
    });
  }, []);

  /**
   * Screen state is based SOLELY on the backend's rider status and subscription,
   * never client-side decoded JWT claims.
   */
  async function loadAuthoritativeBackendState(): Promise<void> {
    try {
      setLoading(true);
      const riderProfile = await getRiderProfile();
      setProfile(riderProfile);

      if (riderProfile.onboardingStatus === 'ACTIVE') {
        const sub = await getSubscriptionStatus();
        setSubscription(sub);
      }
      setStep('DASHBOARD');
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Failed to fetch status from server');
    } finally {
      setLoading(false);
    }
  }

  async function handleSendOtp(): Promise<void> {
    try {
      setLoading(true);
      setMessage(null);
      await sendPhoneOtp(phoneNumber);
      setStep('OTP');
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Error sending OTP');
    } finally {
      setLoading(false);
    }
  }

  async function handleVerifyOtp(): Promise<void> {
    try {
      setLoading(true);
      setMessage(null);
      await verifyPhoneOtp(phoneNumber, otpCode);
      setSessionActive(true);
      await loadAuthoritativeBackendState();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Invalid OTP code');
    } finally {
      setLoading(false);
    }
  }

  async function handlePaySubscription(): Promise<void> {
    try {
      setLoading(true);
      setMessage(null);
      // Deep link return only acts as a UX trigger; backend is polled for authoritative status
      const updatedSub = await executePaystackSubscriptionPayment();
      setSubscription(updatedSub);
      if (updatedSub.canAcceptOrders) {
        setMessage('Subscription active! Ready for dispatch.');
      } else {
        setMessage('Payment received; awaiting backend confirmation.');
      }
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Payment initialization failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" />
      <View style={styles.content}>
        <Text style={styles.brandTitle}>GhanaDash Rider 🏍️</Text>
        <Text style={styles.hubSubtitle}>Takoradi Commercial Hub</Text>

        {message && <Text style={styles.messageText}>{message}</Text>}

        {loading ? (
          <ActivityIndicator size="large" color="#00C853" style={styles.loader} />
        ) : step === 'PHONE' ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Rider Mobile Login</Text>
            <Text style={styles.label}>Enter Phone Number (E.164):</Text>
            <TextInput
              style={styles.input}
              placeholder="+233241234567"
              placeholderTextColor="#777"
              keyboardType="phone-pad"
              value={phoneNumber}
              onChangeText={setPhoneNumber}
            />
            <TouchableOpacity style={styles.primaryButton} onPress={handleSendOtp}>
              <Text style={styles.primaryButtonText}>Send SMS OTP</Text>
            </TouchableOpacity>
          </View>
        ) : step === 'OTP' ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Enter 6-Digit Code</Text>
            <TextInput
              style={styles.input}
              placeholder="123456"
              placeholderTextColor="#777"
              keyboardType="number-pad"
              maxLength={6}
              value={otpCode}
              onChangeText={setOtpCode}
            />
            <TouchableOpacity style={styles.primaryButton} onPress={handleVerifyOtp}>
              <Text style={styles.primaryButtonText}>Verify & Proceed</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Rider Status</Text>

            {/* Screen state driven directly by backend onboarding status */}
            {profile?.onboardingStatus === 'PENDING_VERIFICATION' ? (
              <View style={styles.bannerPending}>
                <Text style={styles.bannerText}>
                  Your rider profile is PENDING_VERIFICATION with the Takoradi operations hub.
                  You will receive an SMS upon approval.
                </Text>
                <TouchableOpacity style={styles.secondaryButton} onPress={loadAuthoritativeBackendState}>
                  <Text style={styles.secondaryButtonText}>Check Verification Status</Text>
                </TouchableOpacity>
              </View>
            ) : profile?.onboardingStatus === 'REJECTED' ? (
              <View style={styles.bannerRejected}>
                <Text style={styles.bannerText}>
                  Your rider application was not approved. Please contact Takoradi dispatch support.
                </Text>
              </View>
            ) : subscription ? (
              <View style={styles.subscriptionBox}>
                <Text style={styles.statusLabel}>
                  Status: <Text style={styles.highlightText}>{subscription.status}</Text>
                </Text>

                {subscription.paidUntil && (
                  <Text style={styles.statusLabel}>
                    Remaining Access:{' '}
                    <Text style={styles.highlightText}>
                      {computeRemainingHours(subscription.paidUntil, subscription.serverTime)} hours
                    </Text>
                  </Text>
                )}

                <Text style={styles.statusLabel}>
                  Rate: {formatPesewasToGHS(subscription.pricePesewas)} / week
                </Text>

                <Text style={styles.statusLabel}>
                  Dispatch Eligibility:{' '}
                  <Text style={subscription.canAcceptOrders ? styles.activeGreen : styles.errorRed}>
                    {subscription.canAcceptOrders ? 'ONLINE (Eligible)' : 'OFFLINE (Subscription Required)'}
                  </Text>
                </Text>

                {(!subscription.canAcceptOrders || subscription.status === 'GRACE_PERIOD') && (
                  <TouchableOpacity style={styles.payButton} onPress={handlePaySubscription}>
                    <Text style={styles.payButtonText}>Renew 7-Day Access via Paystack (MoMo / Card)</Text>
                  </TouchableOpacity>
                )}
              </View>
            ) : null}
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F1216',
  },
  content: {
    padding: 20,
    flex: 1,
    justifyContent: 'center',
  },
  brandTitle: {
    fontSize: 28,
    fontWeight: '800',
    color: '#FFFFFF',
    textAlign: 'center',
  },
  hubSubtitle: {
    fontSize: 14,
    color: '#00C853',
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 24,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  card: {
    backgroundColor: '#1B2028',
    borderRadius: 12,
    padding: 20,
    borderWidth: 1,
    borderColor: '#2D3542',
  },
  cardTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 16,
  },
  label: {
    color: '#A0AAB8',
    fontSize: 13,
    marginBottom: 6,
  },
  input: {
    backgroundColor: '#0F1216',
    borderRadius: 8,
    color: '#FFFFFF',
    padding: 14,
    fontSize: 16,
    borderWidth: 1,
    borderColor: '#374151',
    marginBottom: 16,
  },
  primaryButton: {
    backgroundColor: '#00C853',
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  secondaryButton: {
    backgroundColor: '#2D3542',
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 12,
  },
  secondaryButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  payButton: {
    backgroundColor: '#FF6D00',
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 16,
  },
  payButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
    textAlign: 'center',
  },
  statusLabel: {
    fontSize: 15,
    color: '#E0E6ED',
    marginBottom: 8,
  },
  highlightText: {
    fontWeight: '700',
    color: '#00E676',
  },
  activeGreen: {
    color: '#00E676',
    fontWeight: '700',
  },
  errorRed: {
    color: '#FF5252',
    fontWeight: '700',
  },
  bannerPending: {
    backgroundColor: '#2A2415',
    padding: 14,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#614C1D',
    marginTop: 8,
  },
  bannerRejected: {
    backgroundColor: '#381A1A',
    padding: 14,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#7F1D1D',
    marginTop: 8,
  },
  bannerText: {
    color: '#FDD835',
    fontSize: 13,
    lineHeight: 18,
  },
  subscriptionBox: {
    marginTop: 8,
  },
  messageText: {
    color: '#FFB74D',
    textAlign: 'center',
    marginBottom: 12,
  },
  loader: {
    marginVertical: 20,
  },
});
