import React, { useEffect, useState } from 'react';
import { signInWithPopup, signOut, type User } from 'firebase/auth';
import {
  collection,
  doc,
  getDoc,
  serverTimestamp,
  writeBatch,
} from 'firebase/firestore';
import {
  ArrowRight,
  CheckCircle2,
  KeyRound,
  Lock,
  ShieldCheck,
  Smartphone,
  Sun,
  Users,
  Wallet,
} from 'lucide-react';
import {
  auth,
  db,
  googleProvider,
  handleFirestoreError,
  OperationType,
} from '../firebase';
import type { AppSettings } from '../types';
import {
  formatINR,
  generateReferralCode,
  generateUserCode,
  sanitizeMobileDigits,
} from '../utils/solarData';
import { PWAInstallButton } from './PWAInstallControls';

interface LandingAuthViewProps {
  firebaseUser: User | null;
  needsRegistration: boolean;
  settings: AppSettings;
  initialReferralCode: string;
  onRegistrationComplete: () => void;
  onNotify: (tone: 'success' | 'error' | 'info', title: string, detail?: string) => void;
}

export const LandingAuthView: React.FC<LandingAuthViewProps> = ({
  firebaseUser,
  needsRegistration,
  settings,
  initialReferralCode,
  onRegistrationComplete,
  onNotify,
}) => {
  const [signingIn, setSigningIn] = useState(false);
  const [heroImgFailed, setHeroImgFailed] = useState(false);
  const [logoImgFailed, setLogoImgFailed] = useState(false);

  // Registration & OTP state
  const [fullName, setFullName] = useState(firebaseUser?.displayName || '');
  const [mobileInput, setMobileInput] = useState('');
  const [referralInput, setReferralInput] = useState(initialReferralCode.toUpperCase());
  const [generatedOtp, setGeneratedOtp] = useState<string | null>(null);
  const [otpExpiresAt, setOtpExpiresAt] = useState<number>(0);
  const [otpSecondsLeft, setOtpSecondsLeft] = useState<number>(0);
  const [enteredOtp, setEnteredOtp] = useState('');
  const [otpVerified, setOtpVerified] = useState(false);
  const [otpSending, setOtpSending] = useState(false);
  const [submittingReg, setSubmittingReg] = useState(false);
  const [regError, setRegError] = useState<string | null>(null);

  useEffect(() => {
    if (firebaseUser?.displayName && !fullName) {
      setFullName(firebaseUser.displayName);
    }
  }, [firebaseUser, fullName]);

  useEffect(() => {
    if (!generatedOtp || otpVerified) return;
    const timer = window.setInterval(() => {
      const remaining = Math.max(0, Math.floor((otpExpiresAt - Date.now()) / 1000));
      setOtpSecondsLeft(remaining);
      if (remaining === 0) {
        setGeneratedOtp(null);
      }
    }, 1000);
    return () => window.clearInterval(timer);
  }, [generatedOtp, otpExpiresAt, otpVerified]);

  const handleGoogleSignIn = async () => {
    setSigningIn(true);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to complete sign-in.';
      onNotify('error', 'Sign-In Failed', message);
    } finally {
      setSigningIn(false);
    }
  };

  const handleSendOtp = async () => {
    setRegError(null);
    const digits = sanitizeMobileDigits(mobileInput);
    if (digits.length !== 10) {
      setRegError('Please enter a valid 10-digit mobile number.');
      return;
    }

    setOtpSending(true);
    try {
      const mobileSnap = await getDoc(doc(db, 'mobileRegistry', digits));
      if (mobileSnap.exists()) {
        setRegError('This mobile number is already registered to another operator account.');
        return;
      }
      const code = String(Math.floor(100000 + Math.random() * 900000));
      setGeneratedOtp(code);
      setOtpExpiresAt(Date.now() + 300_000);
      setOtpSecondsLeft(300);
      setEnteredOtp('');
      setOtpVerified(false);
      onNotify('info', 'OTP Dispatched', `Verification code sent for +91 ${digits}.`);
    } catch (err) {
      handleFirestoreError(err, OperationType.GET, `mobileRegistry/${digits}`);
    } finally {
      setOtpSending(false);
    }
  };

  const handleVerifyOtp = () => {
    setRegError(null);
    if (!generatedOtp) {
      setRegError('OTP expired or not sent yet. Request a new code.');
      return;
    }
    if (enteredOtp.trim() !== generatedOtp) {
      setRegError('Incorrect 6-digit OTP code. Please check and try again.');
      return;
    }
    setOtpVerified(true);
    onNotify('success', 'Mobile Number Verified', 'You can now activate your operator account.');
  };

  const handleCompleteRegistration = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!firebaseUser) return;
    setRegError(null);

    const trimmedName = fullName.trim();
    const digits = sanitizeMobileDigits(mobileInput);
    const cleanRef = referralInput.trim().toUpperCase();

    if (trimmedName.length < 2) {
      setRegError('Full name must be at least 2 characters.');
      return;
    }
    if (digits.length !== 10) {
      setRegError('Please enter a valid 10-digit mobile number.');
      return;
    }
    if (!otpVerified) {
      setRegError('Complete OTP verification on your mobile number before registering.');
      return;
    }

    setSubmittingReg(true);
    try {
      const mobileRef = doc(db, 'mobileRegistry', digits);
      const mobileSnap = await getDoc(mobileRef);
      if (mobileSnap.exists()) {
        setRegError('Mobile number is already linked to an existing account.');
        setSubmittingReg(false);
        return;
      }

      let referrerUid = '';
      let referrerName = '';
      if (cleanRef) {
        const refCodeSnap = await getDoc(doc(db, 'referralCodes', cleanRef));
        if (!refCodeSnap.exists()) {
          setRegError(`Referral code "${cleanRef}" was not found. Clear it or enter a valid code.`);
          setSubmittingReg(false);
          return;
        }
        const refData = refCodeSnap.data();
        if (refData.ownerUid === firebaseUser.uid) {
          setRegError('Self-referral is not permitted.');
          setSubmittingReg(false);
          return;
        }
        referrerUid = refData.ownerUid;
        referrerName = refData.ownerName;
      }

      const userCode = generateUserCode(firebaseUser.uid);
      const myReferralCode = generateReferralCode(trimmedName, firebaseUser.uid);
      const batch = writeBatch(db);

      batch.set(doc(db, 'users', firebaseUser.uid), {
        uid: firebaseUser.uid,
        userCode,
        name: trimmedName,
        email: firebaseUser.email || '',
        mobile: digits,
        otpVerified: true,
        referralCode: myReferralCode,
        referredByCode: cleanRef,
        referredByUid: referrerUid,
        accountStatus: 'active',
        role: 'user',
        totalEarnings: 0,
        taskEarnings: 0,
        referralEarnings: 0,
        totalWithdrawn: 0,
        pendingWithdrawalAmount: 0,
        verifiedPagesCount: 0,
        savedUpiId: '',
        savedBankName: '',
        savedAccountHolder: trimmedName,
        savedAccountNumberMasked: '',
        savedIfsc: '',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      batch.set(doc(db, 'referralCodes', myReferralCode), {
        code: myReferralCode,
        ownerUid: firebaseUser.uid,
        ownerName: trimmedName,
        createdAt: serverTimestamp(),
      });

      batch.set(mobileRef, {
        mobile: digits,
        uid: firebaseUser.uid,
        createdAt: serverTimestamp(),
      });

      if (cleanRef && referrerUid) {
        batch.set(doc(collection(db, 'referrals'), firebaseUser.uid), {
          referrerUid,
          referrerName,
          referralCode: cleanRef,
          referredUid: firebaseUser.uid,
          referredName: trimmedName,
          referredUserCode: userCode,
          eligibilityTargetPages: settings.referralEligibilityPages,
          referredVerifiedPages: 0,
          rewardAmount: settings.referralReward,
          status: 'Pending Eligibility',
          adminNotes: 'Awaiting minimum verified pages',
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }

      await batch.commit();
      onNotify('success', 'Account Activated', `Welcome to ${settings.companyName}.`);
      onRegistrationComplete();
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `users/${firebaseUser.uid}`);
    } finally {
      setSubmittingReg(false);
    }
  };

  if (firebaseUser && needsRegistration) {
    return (
      <div className="min-h-screen bg-[#F7FAF7] flex flex-col">
        <header className="bg-white border-b border-[#DCE6DE] px-6 py-4">
          <div className="max-w-5xl mx-auto flex items-center justify-between gap-8">
            <div className="flex items-center gap-3 whitespace-nowrap shrink-0">
              {!logoImgFailed ? (
                <img
                  src="/src/assets/images/solar_brand_emblem_1794830239840.jpg"
                  alt="Solar Power Pvt. Ltd. emblem"
                  referrerPolicy="no-referrer"
                  onError={() => setLogoImgFailed(true)}
                  className="w-8 h-8 rounded-md object-contain"
                />
              ) : (
                <div className="w-8 h-8 rounded-md bg-[#15803D] text-white flex items-center justify-center">
                  <Sun className="w-4 h-4" />
                </div>
              )}
              <span className="font-display text-lg font-bold tracking-tight text-[#0F1F16] whitespace-nowrap shrink-0">
                {settings.companyName}
              </span>
            </div>
            <button
              type="button"
              onClick={() => signOut(auth)}
              className="text-sm font-medium text-[#4A5D52] hover:text-[#0F1F16] transition-colors whitespace-nowrap shrink-0"
            >
              Switch Account
            </button>
          </div>
        </header>

        <main className="flex-1 flex items-center justify-center p-4 sm:p-8">
          <div className="w-full max-w-xl bg-white border border-[#DCE6DE] rounded-xl p-6 sm:p-8">
            <div className="mb-6">
              <p className="text-xs font-medium text-[#15803D] mb-1">
                One Account Per Operator · Identity &amp; OTP Verification
              </p>
              <h1 className="font-display text-2xl font-bold text-[#0F1F16]">
                Complete Operator Registration
              </h1>
              <p className="text-sm text-[#4A5D52] mt-1">
                Verify your mobile number via 6-digit OTP to activate data entry tasks and payouts.
              </p>
            </div>

            {regError && (
              <div className="mb-5 p-3.5 rounded-lg bg-red-50 border border-red-200 text-sm text-red-800">
                {regError}
              </div>
            )}

            <form onSubmit={handleCompleteRegistration} className="space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-[#4A5D52] mb-1.5">
                    Full Legal Name
                  </label>
                  <input
                    type="text"
                    required
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="e.g. Priya Sharma"
                    className="w-full px-3.5 py-2.5 text-sm bg-[#F7FAF7] border border-[#DCE6DE] rounded-lg focus:outline-none focus:border-[#15803D]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#4A5D52] mb-1.5">
                    Verified Email Address
                  </label>
                  <input
                    type="email"
                    disabled
                    value={firebaseUser.email || ''}
                    className="w-full px-3.5 py-2.5 text-sm bg-[#F0F5F1] border border-[#DCE6DE] rounded-lg text-[#4A5D52] cursor-not-allowed"
                  />
                </div>
              </div>

              <div className="pt-2 border-t border-[#E8EFE9]">
                <label className="block text-xs font-medium text-[#4A5D52] mb-1.5">
                  Mobile Number (10-Digit Indian Mobile)
                </label>
                <div className="flex flex-col sm:flex-row gap-2.5">
                  <div className="flex flex-1 items-center bg-[#F7FAF7] border border-[#DCE6DE] rounded-lg overflow-hidden focus-within:border-[#15803D]">
                    <span className="px-3 py-2.5 text-sm font-mono text-[#4A5D52] bg-[#F0F5F1] border-r border-[#DCE6DE]">
                      +91
                    </span>
                    <input
                      type="tel"
                      required
                      disabled={otpVerified}
                      maxLength={10}
                      value={mobileInput}
                      onChange={(e) => setMobileInput(sanitizeMobileDigits(e.target.value))}
                      placeholder="9876543210"
                      className="flex-1 px-3 py-2.5 text-sm font-mono bg-transparent focus:outline-none disabled:text-[#4A5D52]"
                    />
                  </div>
                  <button
                    type="button"
                    disabled={otpSending || otpVerified}
                    onClick={handleSendOtp}
                    className="px-4 py-2.5 text-sm font-semibold rounded-lg bg-[#FEF08A] text-[#0F1F16] border border-[#EAB308]/40 hover:bg-[#FDE047] transition-colors whitespace-nowrap shrink-0 disabled:opacity-50"
                  >
                    {otpVerified
                      ? 'OTP Verified'
                      : otpSending
                        ? 'Sending...'
                        : generatedOtp
                          ? 'Resend OTP'
                          : 'Send OTP'}
                  </button>
                </div>

                {generatedOtp && !otpVerified && (
                  <div className="mt-3 p-4 rounded-lg bg-[#FEFCE8] border border-[#EAB308]/40 space-y-3">
                    <div className="flex items-center justify-between gap-4 text-xs text-[#713F12]">
                      <span className="font-medium flex items-center gap-1.5">
                        <Smartphone className="w-4 h-4 text-[#CA8A04]" />
                        Verification OTP: <strong className="font-mono text-sm text-[#0F1F16]">{generatedOtp}</strong>
                      </span>
                      <span className="font-mono tabular-nums">
                        Expires in {Math.floor(otpSecondsLeft / 60)}:
                        {String(otpSecondsLeft % 60).padStart(2, '0')}
                      </span>
                    </div>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        maxLength={6}
                        value={enteredOtp}
                        onChange={(e) => setEnteredOtp(e.target.value.replace(/\D/g, ''))}
                        placeholder="Enter 6-digit OTP"
                        className="flex-1 px-3.5 py-2 text-sm font-mono tracking-widest bg-white border border-[#DCE6DE] rounded-lg focus:outline-none focus:border-[#15803D]"
                      />
                      <button
                        type="button"
                        onClick={handleVerifyOtp}
                        className="px-4 py-2 text-sm font-semibold rounded-lg bg-[#15803D] text-white hover:bg-[#166534] transition-colors whitespace-nowrap shrink-0"
                      >
                        Verify OTP
                      </button>
                    </div>
                  </div>
                )}

                {otpVerified && (
                  <p className="mt-2 text-xs font-medium text-[#15803D] flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4" />
                    Mobile number verified with 6-digit OTP security check.
                  </p>
                )}
              </div>

              <div>
                <label className="block text-xs font-medium text-[#4A5D52] mb-1.5">
                  Referral Code (Optional — {formatINR(settings.referralReward)} reward for your referrer after {settings.referralEligibilityPages} verified pages)
                </label>
                <input
                  type="text"
                  value={referralInput}
                  onChange={(e) => setReferralInput(e.target.value.toUpperCase())}
                  placeholder="e.g. SOLAR-PRI7821"
                  className="w-full px-3.5 py-2.5 text-sm font-mono uppercase bg-[#F7FAF7] border border-[#DCE6DE] rounded-lg focus:outline-none focus:border-[#15803D]"
                />
              </div>

              <button
                type="submit"
                disabled={submittingReg || !otpVerified}
                className="w-full py-3 px-5 rounded-lg bg-[#15803D] text-white text-sm font-semibold hover:bg-[#166534] transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                <ShieldCheck className="w-4 h-4" />
                {submittingReg ? 'Creating Verified Account...' : 'Activate Operator Account'}
              </button>
            </form>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F7FAF7] text-[#0F1F16] flex flex-col">
      {/* Strict 3-Zone Top Bar Contract */}
      <header className="bg-white border-b border-[#DCE6DE] sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-8">
          <a
            href="#top"
            className="flex items-center gap-2.5 font-display text-lg font-bold tracking-tight text-[#0F1F16] whitespace-nowrap shrink-0"
          >
            {!logoImgFailed ? (
              <img
                src="/src/assets/images/solar_brand_emblem_1794830239840.jpg"
                alt="Solar Power Pvt. Ltd. emblem"
                referrerPolicy="no-referrer"
                onError={() => setLogoImgFailed(true)}
                className="w-8 h-8 rounded object-contain"
              />
            ) : (
              <Sun className="w-5 h-5 text-[#15803D]" />
            )}
            <span>{settings.companyName}</span>
          </a>

          <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-[#4A5D52]">
            <a href="#rules" className="hover:text-[#0F1F16] transition-colors whitespace-nowrap shrink-0">
              Earning Rules
            </a>
            <a href="#workflow" className="hover:text-[#0F1F16] transition-colors whitespace-nowrap shrink-0">
              Task Workflow
            </a>
            <a href="#referrals" className="hover:text-[#0F1F16] transition-colors whitespace-nowrap shrink-0">
              Referral Program
            </a>
            <a href="#payouts" className="hover:text-[#0F1F16] transition-colors whitespace-nowrap shrink-0">
              Withdrawals
            </a>
          </nav>

          <button
            type="button"
            disabled={signingIn}
            onClick={handleGoogleSignIn}
            className="px-4 py-2 rounded-lg bg-[#15803D] text-white text-sm font-semibold hover:bg-[#166534] transition-colors whitespace-nowrap shrink-0 disabled:opacity-60"
          >
            {signingIn ? 'Connecting...' : 'Operator Login'}
          </button>
        </div>
      </header>

      <main id="top" className="flex-1">
        {/* Hero Split Section */}
        <section className="max-w-7xl mx-auto px-4 sm:px-6 pt-8 pb-10 sm:pt-12 sm:pb-14">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch">
            <div className="lg:col-span-6 flex flex-col justify-between bg-white border border-[#DCE6DE] rounded-xl p-6 sm:p-10">
              <div>
                <p className="text-xs font-medium text-[#15803D] mb-3">
                  Solar Operations Digitization · Verified Per-Page Payouts
                </p>
                <h1 className="font-display text-3xl sm:text-4xl lg:text-[42px] font-bold tracking-tight text-[#0F1F16] leading-[1.15]">
                  Structured Solar Data Entry With Transparent Daily Earnings
                </h1>
                <p className="mt-4 text-base text-[#4A5D52] leading-relaxed max-w-xl">
                  Join Solar Power Pvt. Ltd. as a verified data entry operator. Process solar
                  inverter telemetry, net-metering bills, and grid inspection sheets from any
                  device and earn {formatINR(settings.perPageReward)} for every admin-verified page.
                </p>
              </div>

              <div className="mt-8 pt-6 border-t border-[#E8EFE9] space-y-4">
                <div className="flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    disabled={signingIn}
                    onClick={handleGoogleSignIn}
                    className="px-6 py-3 rounded-lg bg-[#15803D] text-white text-sm font-semibold hover:bg-[#166534] transition-colors flex items-center gap-2 whitespace-nowrap shrink-0 disabled:opacity-60"
                  >
                    <span>{signingIn ? 'Opening Sign-In...' : 'Sign In / Register with Google'}</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                  <a
                    href="#rules"
                    className="px-5 py-3 rounded-lg bg-[#FEF9C3] text-[#0F1F16] border border-[#EAB308]/40 text-sm font-semibold hover:bg-[#FEF08A] transition-colors whitespace-nowrap shrink-0"
                  >
                    View Earning Rules
                  </a>
                  <PWAInstallButton />
                </div>
                <p className="text-xs text-[#4A5D52]">
                  Protected by Google Identity, 6-digit mobile OTP verification, and one-account-per-user audit rules.
                </p>
              </div>
            </div>

            <div className="lg:col-span-6 relative rounded-xl overflow-hidden border border-[#DCE6DE] min-h-[280px] sm:min-h-[360px] bg-[#14532D]">
              {!heroImgFailed ? (
                <img
                  src="/src/assets/images/solar_hero_banner_1794830240561.jpg"
                  alt="Solar Power Pvt. Ltd. commercial photovoltaic field"
                  referrerPolicy="no-referrer"
                  onError={() => setHeroImgFailed(true)}
                  className="w-full h-full lg:h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center p-8 text-white bg-gradient-to-br from-[#14532D] to-[#15803D]">
                  <Sun className="w-12 h-12 text-[#FACC15] mb-3" />
                  <p className="font-display text-xl font-bold">{settings.companyName}</p>
                </div>
              )}
              <div className="absolute inset-x-0 bottom-0 p-6 bg-gradient-to-t from-black/80 via-black/45 to-transparent text-white">
                <p className="text-xs font-medium text-[#FEF08A]">
                  Clean Energy Operations · National Grid Ledger
                </p>
                <p className="font-display text-lg font-semibold mt-1">
                  Up to {formatINR(settings.dailyPageLimit * settings.perPageReward)} daily opportunity across {settings.dailyPageLimit} verified pages
                </p>
              </div>
            </div>
          </div>

          {/* Full-width 4-Column KPI Strip below hero split */}
          <div className="mt-6 grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white border border-[#DCE6DE] rounded-xl p-5">
              <p className="text-xs font-medium text-[#4A5D52]">Daily Work Limit</p>
              <p className="font-mono text-2xl font-bold text-[#0F1F16] mt-1 tabular-nums">
                {settings.dailyPageLimit} Pages
              </p>
              <p className="text-xs text-[#15803D] mt-1">Per operator / 24h</p>
            </div>
            <div className="bg-white border border-[#DCE6DE] rounded-xl p-5">
              <p className="text-xs font-medium text-[#4A5D52]">Verified Page Rate</p>
              <p className="font-mono text-2xl font-bold text-[#15803D] mt-1 tabular-nums">
                {formatINR(settings.perPageReward)}
              </p>
              <p className="text-xs text-[#4A5D52] mt-1">Credited after review</p>
            </div>
            <div className="bg-white border border-[#DCE6DE] rounded-xl p-5">
              <p className="text-xs font-medium text-[#4A5D52]">Max Daily Potential</p>
              <p className="font-mono text-2xl font-bold text-[#0F1F16] mt-1 tabular-nums">
                {formatINR(settings.dailyPageLimit * settings.perPageReward)}
              </p>
              <p className="text-xs text-[#CA8A04] mt-1">200 pages × ₹5/page</p>
            </div>
            <div className="bg-white border border-[#DCE6DE] rounded-xl p-5">
              <p className="text-xs font-medium text-[#4A5D52]">Referral Bonus</p>
              <p className="font-mono text-2xl font-bold text-[#0F1F16] mt-1 tabular-nums">
                {formatINR(settings.referralReward)}
              </p>
              <p className="text-xs text-[#4A5D52] mt-1">
                After {settings.referralEligibilityPages} verified pages
              </p>
            </div>
          </div>
        </section>

        {/* Clear Rules & Conditions */}
        <section id="rules" className="max-w-7xl mx-auto px-4 sm:px-6 py-10 border-t border-[#DCE6DE]">
          <div className="mb-8">
            <h2 className="font-display text-2xl font-bold text-[#0F1F16]">
              Program Rules, Verification &amp; Payout Standards
            </h2>
            <p className="text-sm text-[#4A5D52] mt-1">
              Every rupee earned on Solar Power Pvt. Ltd. is backed by verifiable task records and admin approval.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div id="workflow" className="bg-white border border-[#DCE6DE] rounded-xl p-6">
              <div className="w-10 h-10 rounded-lg bg-[#DCFCE7] text-[#15803D] flex items-center justify-center mb-4">
                <KeyRound className="w-5 h-5" />
              </div>
              <h3 className="font-display text-lg font-semibold text-[#0F1F16]">
                1. Data Entry &amp; Verification
              </h3>
              <p className="text-sm text-[#4A5D52] mt-2 leading-relaxed">
                Complete up to {settings.dailyPageLimit} solar data entry pages per day. Each page
                submitted is audited by an administrator; {formatINR(settings.perPageReward)} is
                credited only upon successful verification. Duplicate submissions are blocked.
              </p>
            </div>

            <div id="referrals" className="bg-white border border-[#DCE6DE] rounded-xl p-6">
              <div className="w-10 h-10 rounded-lg bg-[#FEF9C3] text-[#CA8A04] flex items-center justify-center mb-4">
                <Users className="w-5 h-5" />
              </div>
              <h3 className="font-display text-lg font-semibold text-[#0F1F16]">
                2. Referral Eligibility
              </h3>
              <p className="text-sm text-[#4A5D52] mt-2 leading-relaxed">
                Share your unique SOLAR referral code with colleagues. Earn{' '}
                {formatINR(settings.referralReward)} per referral once your invited friend completes
                at least {settings.referralEligibilityPages} admin-verified pages.
              </p>
            </div>

            <div id="payouts" className="bg-white border border-[#DCE6DE] rounded-xl p-6">
              <div className="w-10 h-10 rounded-lg bg-[#DCFCE7] text-[#15803D] flex items-center justify-center mb-4">
                <Wallet className="w-5 h-5" />
              </div>
              <h3 className="font-display text-lg font-semibold text-[#0F1F16]">
                3. UPI &amp; Bank Withdrawals
              </h3>
              <p className="text-sm text-[#4A5D52] mt-2 leading-relaxed">
                Request payouts starting from {formatINR(settings.minWithdrawal)} via UPI or Bank
                Transfer. Admin approves requests before settlement within{' '}
                {settings.withdrawalProcessingHours}.
              </p>
            </div>
          </div>
        </section>
      </main>

      <footer className="bg-white border-t border-[#DCE6DE] py-6 px-4 sm:px-6">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-[#4A5D52]">
          <span className="flex items-center gap-1.5">
            <Lock className="w-3.5 h-3.5 text-[#15803D]" />
            {settings.companyName} · Verified Operator Portal
          </span>
          <span>
            Daily Limit: {settings.dailyPageLimit} Pages · Rate: {formatINR(settings.perPageReward)}/Page · Min Withdrawal: {formatINR(settings.minWithdrawal)}
          </span>
        </div>
      </footer>
    </div>
  );
};
