import React, { useCallback, useEffect, useState } from 'react';
import { onAuthStateChanged, signOut, type User } from 'firebase/auth';
import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import {
  FileSpreadsheet,
  LayoutDashboard,
  LogOut,
  Shield,
  Sun,
  User as UserIcon,
  Users,
  Wallet,
  X,
} from 'lucide-react';
import { AdminPanelView } from './components/AdminPanelView';
import { DashboardView } from './components/DashboardView';
import { DataEntryWorkView } from './components/DataEntryWorkView';
import { FAQView } from './components/FAQView';
import { LandingAuthView } from './components/LandingAuthView';
import { OfflineIndicator } from './components/PWAInstallControls';
import { ProfileView } from './components/ProfileView';
import { ReferralView } from './components/ReferralView';
import { WithdrawalView } from './components/WithdrawalView';
import {
  auth,
  BOOTSTRAPPED_ADMIN_EMAIL,
  db,
  handleFirestoreError,
  OperationType,
  testFirestoreConnection,
} from './firebase';
import type {
  ActiveTab,
  AppSettings,
  DataEntryTask,
  EarningTransaction,
  ReferralRecord,
  TaskSubmission,
  ToastNotice,
  UserProfile,
  WithdrawalRequest,
} from './types';
import {
  DEFAULT_APP_SETTINGS,
  SAMPLE_SOLAR_TASKS,
} from './utils/solarData';

export default function App() {
  const [authReady, setAuthReady] = useState(false);
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [profileChecked, setProfileChecked] = useState(false);
  const [isAdminUser, setIsAdminUser] = useState(false);

  const [settings, setSettings] = useState<AppSettings>(DEFAULT_APP_SETTINGS);
  const [tasks, setTasks] = useState<DataEntryTask[]>([]);
  const [mySubmissions, setMySubmissions] = useState<TaskSubmission[]>([]);
  const [myReferrals, setMyReferrals] = useState<ReferralRecord[]>([]);
  const [myWithdrawals, setMyWithdrawals] = useState<WithdrawalRequest[]>([]);
  const [myTransactions, setMyTransactions] = useState<EarningTransaction[]>([]);

  // Admin collections
  const [allUsers, setAllUsers] = useState<UserProfile[]>([]);
  const [allSubmissions, setAllSubmissions] = useState<TaskSubmission[]>([]);
  const [allReferrals, setAllReferrals] = useState<ReferralRecord[]>([]);
  const [allWithdrawals, setAllWithdrawals] = useState<WithdrawalRequest[]>([]);
  const [allTransactions, setAllTransactions] = useState<EarningTransaction[]>([]);

  const [activeTab, setActiveTab] = useState<ActiveTab>('dashboard');
  const [toasts, setToasts] = useState<ToastNotice[]>([]);
  const [logoFailed, setLogoFailed] = useState(false);

  const initialReferralCode =
    typeof window !== 'undefined'
      ? new URLSearchParams(window.location.search).get('ref') || ''
      : '';

  const notify = useCallback(
    (tone: 'success' | 'error' | 'info', title: string, detail?: string) => {
      const id = `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      setToasts((prev) => [...prev.slice(-2), { id, tone, title, detail }]);
      window.setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, 4500);
    },
    []
  );

  // Test Firestore connection on mount
  useEffect(() => {
    testFirestoreConnection();
  }, []);

  // Auth listener
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      setFirebaseUser(user);
      setAuthReady(true);
      if (!user) {
        setProfile(null);
        setProfileChecked(true);
        setIsAdminUser(false);
      } else {
        setProfileChecked(false);
      }
    });
    return () => unsub();
  }, []);

  // Load current user profile + admin marker
  useEffect(() => {
    if (!authReady || !firebaseUser) return;

    let cancelled = false;
    const checkAdmin = async () => {
      const byBootstrappedEmail =
        firebaseUser.email === BOOTSTRAPPED_ADMIN_EMAIL &&
        firebaseUser.emailVerified;
      try {
        const adminDoc = await getDoc(doc(db, 'admins', firebaseUser.uid));
        if (!cancelled) {
          setIsAdminUser(byBootstrappedEmail || adminDoc.exists());
        }
      } catch {
        if (!cancelled) {
          setIsAdminUser(byBootstrappedEmail);
        }
      }
    };
    checkAdmin();

    const unsubProfile = onSnapshot(
      doc(db, 'users', firebaseUser.uid),
      (snap) => {
        if (snap.exists()) {
          setProfile(snap.data() as UserProfile);
        } else {
          setProfile(null);
        }
        setProfileChecked(true);
      },
      (err) => {
        handleFirestoreError(err, OperationType.GET, `users/${firebaseUser.uid}`);
      }
    );

    return () => {
      cancelled = true;
      unsubProfile();
    };
  }, [authReady, firebaseUser]);

  // Bootstrap settings & initial sample tasks when admin signs in and none exist
  useEffect(() => {
    if (!authReady || !firebaseUser || !isAdminUser) return;

    const bootstrapAdminDefaults = async () => {
      try {
        const settingsRef = doc(db, 'settings', 'app');
        const settingsSnap = await getDoc(settingsRef);
        if (!settingsSnap.exists()) {
          await setDoc(settingsRef, {
            ...DEFAULT_APP_SETTINGS,
            updatedAt: serverTimestamp(),
          });
        }
      } catch (err) {
        console.warn('Settings bootstrap skipped:', err);
      }
    };
    bootstrapAdminDefaults();
  }, [authReady, firebaseUser, isAdminUser]);

  // Subscribe to app settings & tasks when signed in
  useEffect(() => {
    if (!authReady || !firebaseUser || !profile) return;

    const unsubSettings = onSnapshot(
      doc(db, 'settings', 'app'),
      (snap) => {
        if (snap.exists()) {
          setSettings(snap.data() as AppSettings);
        }
      },
      (err) => handleFirestoreError(err, OperationType.GET, 'settings/app')
    );

    const unsubTasks = onSnapshot(
      collection(db, 'tasks'),
      async (snap) => {
        const list = snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<DataEntryTask, 'id'>),
        }));
        setTasks(list);

        // If admin signs in and there are 0 tasks, auto-seed sample solar pages once
        if (list.length === 0 && isAdminUser) {
          try {
            const batch = writeBatch(db);
            SAMPLE_SOLAR_TASKS.forEach((sample) => {
              const taskRef = doc(collection(db, 'tasks'));
              batch.set(taskRef, {
                title: sample.title,
                category: sample.category,
                pageNumber: sample.pageNumber,
                rewardAmount: DEFAULT_APP_SETTINGS.perPageReward,
                isActive: true,
                sourceRecordId: sample.sourceRecordId,
                sourceCustomerName: sample.sourceCustomerName,
                sourceSiteLocation: sample.sourceSiteLocation,
                sourceMeterNumber: sample.sourceMeterNumber,
                sourceKwhReading: sample.sourceKwhReading,
                sourceBillingDate: sample.sourceBillingDate,
                sourceNotes: sample.sourceNotes,
                createdBy: firebaseUser.uid,
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
              });
            });
            await batch.commit();
          } catch (seedErr) {
            console.warn('Initial task seed failed:', seedErr);
          }
        }
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'tasks')
    );

    const unsubSubs = onSnapshot(
      query(
        collection(db, 'submissions'),
        where('userId', '==', firebaseUser.uid)
      ),
      (snap) => {
        const items = snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<TaskSubmission, 'id'>),
        }));
        items.sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));
        setMySubmissions(items);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'submissions')
    );

    const unsubRefs = onSnapshot(
      query(
        collection(db, 'referrals'),
        where('referrerUid', '==', firebaseUser.uid)
      ),
      (snap) => {
        const items = snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<ReferralRecord, 'id'>),
        }));
        items.sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));
        setMyReferrals(items);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'referrals')
    );

    const unsubWithdrawals = onSnapshot(
      query(
        collection(db, 'withdrawals'),
        where('userId', '==', firebaseUser.uid)
      ),
      (snap) => {
        const items = snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<WithdrawalRequest, 'id'>),
        }));
        items.sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));
        setMyWithdrawals(items);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'withdrawals')
    );

    const unsubTx = onSnapshot(
      query(
        collection(db, 'transactions'),
        where('userId', '==', firebaseUser.uid)
      ),
      (snap) => {
        const items = snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<EarningTransaction, 'id'>),
        }));
        items.sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));
        setMyTransactions(items);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'transactions')
    );

    return () => {
      unsubSettings();
      unsubTasks();
      unsubSubs();
      unsubRefs();
      unsubWithdrawals();
      unsubTx();
    };
  }, [authReady, firebaseUser, profile?.uid, isAdminUser]);

  // Admin-only listeners
  useEffect(() => {
    if (!authReady || !firebaseUser || !profile || !isAdminUser) return;

    const unsubUsers = onSnapshot(
      collection(db, 'users'),
      (snap) => {
        const items = snap.docs.map((d) => d.data() as UserProfile);
        items.sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));
        setAllUsers(items);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'users')
    );

    const unsubAllSubs = onSnapshot(
      collection(db, 'submissions'),
      (snap) => {
        const items = snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<TaskSubmission, 'id'>),
        }));
        items.sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));
        setAllSubmissions(items);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'submissions(admin)')
    );

    const unsubAllRefs = onSnapshot(
      collection(db, 'referrals'),
      (snap) => {
        const items = snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<ReferralRecord, 'id'>),
        }));
        items.sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));
        setAllReferrals(items);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'referrals(admin)')
    );

    const unsubAllWithdrawals = onSnapshot(
      collection(db, 'withdrawals'),
      (snap) => {
        const items = snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<WithdrawalRequest, 'id'>),
        }));
        items.sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));
        setAllWithdrawals(items);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'withdrawals(admin)')
    );

    const unsubAllTx = onSnapshot(
      collection(db, 'transactions'),
      (snap) => {
        const items = snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<EarningTransaction, 'id'>),
        }));
        items.sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));
        setAllTransactions(items);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'transactions(admin)')
    );

    return () => {
      unsubUsers();
      unsubAllSubs();
      unsubAllRefs();
      unsubAllWithdrawals();
      unsubAllTx();
    };
  }, [authReady, firebaseUser, profile?.uid, isAdminUser]);

  if (!authReady || (firebaseUser && !profileChecked)) {
    return (
      <div className="min-h-screen bg-[#F7FAF7] flex items-center justify-center p-6">
        <div className="bg-white border border-[#DCE6DE] rounded-xl px-8 py-6 text-center space-y-2">
          <Sun className="w-7 h-7 text-[#15803D] mx-auto" />
          <p className="font-display text-base font-semibold text-[#0F1F16]">
            Solar Power Pvt. Ltd.
          </p>
          <p className="text-xs text-[#4A5D52]">Loading operator workspace...</p>
        </div>
      </div>
    );
  }

  const toastOverlay = (
    <div className="fixed bottom-20 md:bottom-6 right-4 z-50 space-y-2 max-w-sm w-full pointer-events-none">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`pointer-events-auto p-3.5 rounded-xl border bg-white shadow-sm flex items-start justify-between gap-3 ${
            t.tone === 'error'
              ? 'border-red-200'
              : t.tone === 'success'
                ? 'border-[#15803D]/40'
                : 'border-[#EAB308]/50'
          }`}
        >
          <div className="min-w-0">
            <p className="text-xs font-semibold text-[#0F1F16]">{t.title}</p>
            {t.detail && <p className="text-xs text-[#4A5D52] mt-0.5">{t.detail}</p>}
          </div>
          <button
            type="button"
            onClick={() => setToasts((prev) => prev.filter((item) => item.id !== t.id))}
            className="text-[#4A5D52] hover:text-[#0F1F16] shrink-0"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      ))}
    </div>
  );

  if (!firebaseUser || !profile) {
    return (
      <>
        <LandingAuthView
          firebaseUser={firebaseUser}
          needsRegistration={Boolean(firebaseUser && !profile)}
          settings={settings}
          initialReferralCode={initialReferralCode}
          onRegistrationComplete={() => setActiveTab('dashboard')}
          onNotify={notify}
        />
        <OfflineIndicator />
        {toastOverlay}
      </>
    );
  }

  const navItems: { id: ActiveTab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'work', label: 'Data Entry', icon: FileSpreadsheet },
    { id: 'referrals', label: 'Referrals', icon: Users },
    { id: 'withdrawals', label: 'Withdrawals', icon: Wallet },
    { id: 'profile', label: 'Profile', icon: UserIcon },
  ];

  if (isAdminUser) {
    navItems.push({ id: 'admin', label: 'Admin Panel', icon: Shield });
  }

  return (
    <div className="min-h-screen bg-[#F7FAF7] text-[#0F1F16] flex flex-col">
      {/* Top Bar Contract: 3 clean zones */}
      <header className="bg-white border-b border-[#DCE6DE] sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-8">
          <button
            type="button"
            onClick={() => setActiveTab('dashboard')}
            className="flex items-center gap-2.5 font-display text-base sm:text-lg font-bold tracking-tight text-[#0F1F16] whitespace-nowrap shrink-0"
          >
            {!logoFailed ? (
              <img
                src="/src/assets/images/solar_brand_emblem_1794830239840.jpg"
                alt="Solar Power Pvt. Ltd."
                referrerPolicy="no-referrer"
                onError={() => setLogoFailed(true)}
                className="w-8 h-8 rounded object-contain"
              />
            ) : (
              <Sun className="w-5 h-5 text-[#15803D]" />
            )}
            <span>{settings.companyName}</span>
          </button>

          <nav className="hidden lg:flex items-center gap-6 text-sm font-medium text-[#4A5D52]">
            {navItems.map((item) => {
              const active = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActiveTab(item.id)}
                  className={`py-1 transition-colors whitespace-nowrap shrink-0 border-b-2 ${
                    active
                      ? 'text-[#15803D] font-semibold border-[#15803D]'
                      : 'border-transparent hover:text-[#0F1F16]'
                  }`}
                >
                  {item.label}
                </button>
              );
            })}
          </nav>

          <div className="flex items-center shrink-0">
            <button
              type="button"
              onClick={() => signOut(auth)}
              className="px-3.5 py-2 rounded-lg border border-[#DCE6DE] text-xs font-semibold text-[#0F1F16] hover:bg-[#F0F5F1] transition-colors inline-flex items-center gap-1.5 whitespace-nowrap shrink-0"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Sign Out</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-6 pb-24 lg:pb-10">
        {activeTab === 'dashboard' && (
          <DashboardView
            profile={profile}
            settings={settings}
            submissions={mySubmissions}
            transactions={myTransactions}
            onNavigate={setActiveTab}
          />
        )}
        {activeTab === 'work' && (
          <DataEntryWorkView
            profile={profile}
            settings={settings}
            tasks={tasks}
            submissions={mySubmissions}
            onNotify={notify}
          />
        )}
        {activeTab === 'referrals' && (
          <ReferralView
            profile={profile}
            settings={settings}
            referrals={myReferrals}
            onNotify={notify}
          />
        )}
        {activeTab === 'withdrawals' && (
          <WithdrawalView
            profile={profile}
            settings={settings}
            withdrawals={myWithdrawals}
            onNotify={notify}
          />
        )}
        {activeTab === 'profile' && (
          <ProfileView profile={profile} onNotify={notify} onNavigate={setActiveTab} />
        )}
        {activeTab === 'faq' && (
          <FAQView settings={settings} onNavigate={setActiveTab} />
        )}
        {activeTab === 'admin' && isAdminUser && (
          <AdminPanelView
            adminProfile={profile}
            settings={settings}
            allUsers={allUsers}
            tasks={tasks}
            allSubmissions={allSubmissions}
            allReferrals={allReferrals}
            allWithdrawals={allWithdrawals}
            allTransactions={allTransactions}
            onNotify={notify}
          />
        )}
      </main>

      {/* Mobile Bottom Navigation (compact <= 10% viewport height) */}
      <nav
        aria-label="Mobile Navigation"
        className="lg:hidden fixed bottom-0 inset-x-0 bg-white border-t border-[#DCE6DE] z-30 px-1 py-1.5"
      >
        <div className="flex items-center justify-around">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveTab(item.id)}
                className={`flex flex-col items-center justify-center px-2 py-1 rounded-lg min-w-[54px] text-[11px] font-medium transition-colors ${
                  active ? 'text-[#15803D] font-semibold' : 'text-[#4A5D52]'
                }`}
              >
                <Icon className="w-4 h-4 mb-0.5" />
                <span className="truncate max-w-[64px]">{item.label}</span>
              </button>
            );
          })}
        </div>
      </nav>

      <OfflineIndicator />
      {toastOverlay}
    </div>
  );
}
