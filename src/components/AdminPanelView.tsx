import React, { useEffect, useMemo, useState } from 'react';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';
import {
  CheckCircle2,
  Database,
  Download,
  Edit3,
  FileSpreadsheet,
  Plus,
  Settings,
  Shield,
  Trash2,
  TrendingUp,
  Users,
  Wallet,
  XCircle,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { db, handleFirestoreError, OperationType } from '../firebase';
import type {
  AppSettings,
  DataEntryTask,
  EarningTransaction,
  ReferralRecord,
  TaskCategory,
  TaskSubmission,
  UserProfile,
  WithdrawalRequest,
} from '../types';
import {
  computeMonthlyUserSummaries,
  downloadCsvFile,
  exportCombinedMonthlyReportCsv,
  formatCsvTimestamp,
  getCurrentMonthKey,
  getMonthKeyFromTimestamp,
} from '../utils/csvExport';
import {
  formatINR,
  formatTimestamp,
  SAMPLE_SOLAR_TASKS,
  TASK_CATEGORIES,
} from '../utils/solarData';
import { playSuccessChime } from '../utils/soundEffects';

interface AdminPanelViewProps {
  adminProfile: UserProfile;
  settings: AppSettings;
  allUsers: UserProfile[];
  tasks: DataEntryTask[];
  allSubmissions: TaskSubmission[];
  allReferrals: ReferralRecord[];
  allWithdrawals: WithdrawalRequest[];
  allTransactions: EarningTransaction[];
  onNotify: (tone: 'success' | 'error' | 'info', title: string, detail?: string) => void;
}

type AdminSection =
  | 'overview'
  | 'verifications'
  | 'tasks'
  | 'withdrawals'
  | 'referrals'
  | 'users'
  | 'settings';

export const AdminPanelView: React.FC<AdminPanelViewProps> = ({
  adminProfile,
  settings,
  allUsers,
  tasks,
  allSubmissions,
  allReferrals,
  allWithdrawals,
  allTransactions,
  onNotify,
}) => {
  const [section, setSection] = useState<AdminSection>('overview');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [reportScope, setReportScope] = useState<'month' | 'all'>('month');
  const [selectedMonth, setSelectedMonth] = useState<string>(getCurrentMonthKey());

  // Task editor modal/inline state
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [taskTitle, setTaskTitle] = useState('');
  const [taskCategory, setTaskCategory] = useState<TaskCategory>('Verification');
  const [taskPageNum, setTaskPageNum] = useState<string>(String(tasks.length + 1));
  const [taskRecordId, setTaskRecordId] = useState('');
  const [taskCustomerName, setTaskCustomerName] = useState('');
  const [taskSiteLocation, setTaskSiteLocation] = useState('');
  const [taskMeterNumber, setTaskMeterNumber] = useState('');
  const [taskKwhReading, setTaskKwhReading] = useState('');
  const [taskBillingDate, setTaskBillingDate] = useState('2026-11-16');
  const [taskNotes, setTaskNotes] = useState('');
  const [taskIsActive, setTaskIsActive] = useState(true);

  // Rejection / UTR inputs keyed by ID
  const [rejectReasonById, setRejectReasonById] = useState<Record<string, string>>({});
  const [utrByWithdrawalId, setUtrByWithdrawalId] = useState<Record<string, string>>({});

  // Settings form state
  const [cfgCompanyName, setCfgCompanyName] = useState(settings.companyName);
  const [cfgDailyLimit, setCfgDailyLimit] = useState(String(settings.dailyPageLimit));
  const [cfgPerPageReward, setCfgPerPageReward] = useState(String(settings.perPageReward));
  const [cfgReferralReward, setCfgReferralReward] = useState(String(settings.referralReward));
  const [cfgReferralPages, setCfgReferralPages] = useState(
    String(settings.referralEligibilityPages)
  );
  const [cfgMinWithdrawal, setCfgMinWithdrawal] = useState(String(settings.minWithdrawal));
  const [cfgProcessingHours, setCfgProcessingHours] = useState(
    settings.withdrawalProcessingHours
  );
  const [cfgTaskTimerSeconds, setCfgTaskTimerSeconds] = useState(
    String(settings.taskTimerSeconds ?? 180)
  );

  useEffect(() => {
    setCfgTaskTimerSeconds(String(settings.taskTimerSeconds ?? 180));
  }, [settings.taskTimerSeconds]);

  // Sub-filters
  const [subFilter, setSubFilter] = useState<'Pending' | 'All' | 'Verified' | 'Rejected'>('Pending');
  const [subCategoryFilter, setSubCategoryFilter] = useState<'All' | TaskCategory>('All');
  const [taskCategoryFilter, setTaskCategoryFilter] = useState<'All' | TaskCategory>('All');
  const [userSearch, setUserSearch] = useState('');

  const taskById = useMemo(() => {
    const map = new Map<string, DataEntryTask>();
    tasks.forEach((t) => map.set(t.id, t));
    return map;
  }, [tasks]);

  const userById = useMemo(() => {
    const map = new Map<string, UserProfile>();
    allUsers.forEach((u) => map.set(u.uid, u));
    return map;
  }, [allUsers]);

  // Company payment metrics
  const metrics = useMemo(() => {
    const totalCredited = allUsers.reduce((acc, u) => acc + (u.totalEarnings || 0), 0);
    const totalTaskPayouts = allUsers.reduce((acc, u) => acc + (u.taskEarnings || 0), 0);
    const totalReferralPayouts = allUsers.reduce((acc, u) => acc + (u.referralEarnings || 0), 0);
    const totalPaidWithdrawals = allUsers.reduce((acc, u) => acc + (u.totalWithdrawn || 0), 0);
    const pendingWithdrawalLiability = allUsers.reduce(
      (acc, u) => acc + (u.pendingWithdrawalAmount || 0),
      0
    );
    const pendingVerifications = allSubmissions.filter((s) => s.status === 'Pending').length;
    const pendingWithdrawalsCount = allWithdrawals.filter(
      (w) => w.status === 'Pending' || w.status === 'Approved'
    ).length;
    const pendingReferralsCount = allReferrals.filter(
      (r) => r.status === 'Eligible' || r.status === 'Pending Eligibility'
    ).length;

    return {
      totalCredited,
      totalTaskPayouts,
      totalReferralPayouts,
      totalPaidWithdrawals,
      pendingWithdrawalLiability,
      pendingVerifications,
      pendingWithdrawalsCount,
      pendingReferralsCount,
    };
  }, [allUsers, allSubmissions, allWithdrawals, allReferrals]);

  const activeMonthFilter = reportScope === 'all' ? 'ALL' : selectedMonth;

  const monthlyUserSummaries = useMemo(
    () =>
      computeMonthlyUserSummaries(
        allUsers,
        allSubmissions,
        allTransactions,
        allWithdrawals,
        activeMonthFilter
      ),
    [allUsers, allSubmissions, allTransactions, allWithdrawals, activeMonthFilter]
  );

  const filteredReportWithdrawals = useMemo(() => {
    if (activeMonthFilter === 'ALL') return allWithdrawals;
    return allWithdrawals.filter(
      (w) => getMonthKeyFromTimestamp(w.createdAt) === activeMonthFilter
    );
  }, [allWithdrawals, activeMonthFilter]);

  const filteredReportTransactions = useMemo(() => {
    if (activeMonthFilter === 'ALL') return allTransactions;
    return allTransactions.filter(
      (tx) => getMonthKeyFromTimestamp(tx.createdAt) === activeMonthFilter
    );
  }, [allTransactions, activeMonthFilter]);

  const reportPeriodTotals = useMemo(() => {
    const taskEarnings = monthlyUserSummaries.reduce((acc, r) => acc + r.periodTaskEarnings, 0);
    const referralBonuses = monthlyUserSummaries.reduce(
      (acc, r) => acc + r.periodReferralBonuses,
      0
    );
    const paidWithdrawals = monthlyUserSummaries.reduce(
      (acc, r) => acc + r.periodWithdrawalsPaid,
      0
    );
    const requestedWithdrawals = filteredReportWithdrawals.reduce(
      (acc, w) => acc + (w.amount || 0),
      0
    );
    return {
      taskEarnings,
      referralBonuses,
      paidWithdrawals,
      requestedWithdrawals,
      withdrawalCount: filteredReportWithdrawals.length,
    };
  }, [monthlyUserSummaries, filteredReportWithdrawals]);

  const monthlyTrendData = useMemo(() => {
    const bucket = new Map<
      string,
      {
        monthKey: string;
        label: string;
        taskCredits: number;
        referralBonuses: number;
        withdrawalsPaid: number;
        totalPayouts: number;
      }
    >();

    const formatMonthLabel = (key: string) => {
      const [yStr, mStr] = key.split('-');
      const y = Number(yStr);
      const m = Number(mStr);
      if (!y || !m) return key;
      return new Date(y, m - 1, 1).toLocaleDateString('en-IN', {
        month: 'short',
        year: 'numeric',
      });
    };

    // Always seed a 6-month trailing window ending at selectedMonth (or current month)
    const anchor = selectedMonth || getCurrentMonthKey();
    const [ay, am] = anchor.split('-').map(Number);
    for (let offset = 5; offset >= 0; offset -= 1) {
      const d = new Date(ay, am - 1 - offset, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      bucket.set(key, {
        monthKey: key,
        label: formatMonthLabel(key),
        taskCredits: 0,
        referralBonuses: 0,
        withdrawalsPaid: 0,
        totalPayouts: 0,
      });
    }

    const ensureBucket = (key: string) => {
      if (!bucket.has(key)) {
        bucket.set(key, {
          monthKey: key,
          label: formatMonthLabel(key),
          taskCredits: 0,
          referralBonuses: 0,
          withdrawalsPaid: 0,
          totalPayouts: 0,
        });
      }
      return bucket.get(key)!;
    };

    if (allTransactions.length > 0) {
      allTransactions.forEach((tx) => {
        const key = getMonthKeyFromTimestamp(tx.createdAt);
        if (!key) return;
        const entry = ensureBucket(key);
        if (tx.type === 'task_credit') {
          entry.taskCredits += tx.amount || 0;
          entry.totalPayouts += tx.amount || 0;
        } else if (tx.type === 'referral_bonus') {
          entry.referralBonuses += tx.amount || 0;
          entry.totalPayouts += tx.amount || 0;
        } else if (tx.type === 'withdrawal_paid') {
          entry.withdrawalsPaid += tx.amount || 0;
        }
      });
    } else {
      allSubmissions.forEach((sub) => {
        if (sub.status !== 'Verified') return;
        const key =
          getMonthKeyFromTimestamp(sub.updatedAt || sub.createdAt) ||
          sub.dateKey.slice(0, 7);
        if (!key) return;
        const entry = ensureBucket(key);
        const amt = sub.creditedAmount || 0;
        entry.taskCredits += amt;
        entry.totalPayouts += amt;
      });
      allWithdrawals.forEach((w) => {
        if (w.status !== 'Paid') return;
        const key = getMonthKeyFromTimestamp(w.updatedAt || w.createdAt);
        if (!key) return;
        const entry = ensureBucket(key);
        entry.withdrawalsPaid += w.amount || 0;
      });
    }

    return Array.from(bucket.values()).sort((a, b) =>
      a.monthKey.localeCompare(b.monthKey)
    );
  }, [allTransactions, allSubmissions, allWithdrawals, selectedMonth]);

  const hasMonthlyChartData = useMemo(
    () =>
      monthlyTrendData.some(
        (d) => d.totalPayouts > 0 || d.withdrawalsPaid > 0
      ),
    [monthlyTrendData]
  );

  const handleExportUserEarningsCsv = () => {
    const periodLabel = activeMonthFilter === 'ALL' ? 'all-time' : activeMonthFilter;
    const filename = `solar_power_user_earnings_${periodLabel}.csv`;
    const headers = [
      'User ID',
      'Operator Name',
      'Email',
      'Mobile',
      'Account Status',
      'Report Period',
      'Verified Pages (Period)',
      'Task Earnings (Period INR)',
      'Referral Bonuses (Period INR)',
      'Total Period Earnings (INR)',
      'Withdrawals Paid (Period INR)',
      'Lifetime Total Earnings (INR)',
      'Lifetime Task Earnings (INR)',
      'Lifetime Referral Earnings (INR)',
      'Lifetime Withdrawn (INR)',
      'Pending Withdrawals (INR)',
      'Available Balance (INR)',
    ];
    const rows = monthlyUserSummaries.map((row) => [
      row.user.userCode,
      row.user.name,
      row.user.email,
      `+91 ${row.user.mobile}`,
      row.user.accountStatus,
      activeMonthFilter === 'ALL' ? 'All Time' : activeMonthFilter,
      row.periodVerifiedPages,
      row.periodTaskEarnings,
      row.periodReferralBonuses,
      row.periodTotalEarnings,
      row.periodWithdrawalsPaid,
      row.user.totalEarnings || 0,
      row.user.taskEarnings || 0,
      row.user.referralEarnings || 0,
      row.user.totalWithdrawn || 0,
      row.user.pendingWithdrawalAmount || 0,
      row.availableBalance,
    ]);
    downloadCsvFile(filename, headers, rows);
    onNotify('success', 'User Earnings CSV Exported', `${rows.length} operator rows downloaded (${filename}).`);
  };

  const handleExportWithdrawalsCsv = () => {
    const periodLabel = activeMonthFilter === 'ALL' ? 'all-time' : activeMonthFilter;
    const filename = `solar_power_withdrawals_${periodLabel}.csv`;
    const headers = [
      'Withdrawal ID',
      'Requested At',
      'Updated At',
      'User ID',
      'Operator Name',
      'Method',
      'Account Holder',
      'UPI ID',
      'Bank Name',
      'Masked Account Number',
      'IFSC Code',
      'Amount (INR)',
      'Status',
      'Payment Reference (UTR)',
      'Rejection Reason',
    ];
    const rows = filteredReportWithdrawals.map((w) => [
      w.id,
      formatCsvTimestamp(w.createdAt),
      formatCsvTimestamp(w.updatedAt),
      w.userCode,
      w.userName,
      w.method,
      w.accountHolder,
      w.upiId || '',
      w.bankName || '',
      w.accountNumber || '',
      w.ifscCode || '',
      w.amount,
      w.status,
      w.paymentReference || '',
      w.rejectionReason || '',
    ]);
    downloadCsvFile(filename, headers, rows);
    onNotify('success', 'Withdrawals CSV Exported', `${rows.length} payout records downloaded (${filename}).`);
  };

  const handleExportLedgerCsv = () => {
    const periodLabel = activeMonthFilter === 'ALL' ? 'all-time' : activeMonthFilter;
    const filename = `solar_power_financial_ledger_${periodLabel}.csv`;
    const headers = [
      'Transaction ID',
      'Created At',
      'User ID',
      'Operator Name',
      'Type',
      'Amount (INR)',
      'Description',
      'Reference ID',
    ];
    const rows = filteredReportTransactions.map((tx) => {
      const u = userById.get(tx.userId);
      return [
        tx.id,
        formatCsvTimestamp(tx.createdAt),
        u?.userCode || tx.userId,
        u?.name || '',
        tx.type,
        tx.amount,
        tx.description,
        tx.referenceId,
      ];
    });
    downloadCsvFile(filename, headers, rows);
    onNotify('success', 'Financial Ledger CSV Exported', `${rows.length} ledger rows downloaded (${filename}).`);
  };

  const handleDownloadCsv = () => {
    const filename = exportCombinedMonthlyReportCsv({
      companyName: settings.companyName,
      periodLabel: activeMonthFilter,
      summaries: monthlyUserSummaries,
      withdrawals: filteredReportWithdrawals,
      transactions: filteredReportTransactions,
      userById,
    });
    onNotify(
      'success',
      'Monthly Report CSV Downloaded',
      `Exported ${monthlyUserSummaries.length} users, ${filteredReportWithdrawals.length} withdrawals, and ${filteredReportTransactions.length} transactions (${filename}).`
    );
  };

  const resetTaskForm = () => {
    setEditingTaskId(null);
    setTaskTitle('');
    setTaskCategory('Verification');
    setTaskPageNum(String(tasks.length + 1));
    setTaskRecordId('');
    setTaskCustomerName('');
    setTaskSiteLocation('');
    setTaskMeterNumber('');
    setTaskKwhReading('');
    setTaskBillingDate('2026-11-16');
    setTaskNotes('');
    setTaskIsActive(true);
  };

  const handleEditTask = (task: DataEntryTask) => {
    setEditingTaskId(task.id);
    setTaskTitle(task.title);
    setTaskCategory(task.category);
    setTaskPageNum(String(task.pageNumber));
    setTaskRecordId(task.sourceRecordId);
    setTaskCustomerName(task.sourceCustomerName);
    setTaskSiteLocation(task.sourceSiteLocation);
    setTaskMeterNumber(task.sourceMeterNumber);
    setTaskKwhReading(task.sourceKwhReading);
    setTaskBillingDate(task.sourceBillingDate);
    setTaskNotes(task.sourceNotes);
    setTaskIsActive(task.isActive);
  };

  const handleSaveTask = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusyId('save_task');
    try {
      const payload = {
        title: taskTitle.trim(),
        category: taskCategory,
        pageNumber: Math.max(1, Number(taskPageNum) || 1),
        rewardAmount: settings.perPageReward,
        isActive: taskIsActive,
        sourceRecordId: taskRecordId.trim(),
        sourceCustomerName: taskCustomerName.trim(),
        sourceSiteLocation: taskSiteLocation.trim(),
        sourceMeterNumber: taskMeterNumber.trim(),
        sourceKwhReading: taskKwhReading.trim(),
        sourceBillingDate: taskBillingDate.trim(),
        sourceNotes: taskNotes.trim() || 'Verify solar field log values.',
        updatedAt: serverTimestamp(),
      };

      if (editingTaskId) {
        await updateDoc(doc(db, 'tasks', editingTaskId), payload);
        onNotify('success', 'Task Updated', payload.title);
      } else {
        const newRef = doc(collection(db, 'tasks'));
        await setDoc(newRef, {
          ...payload,
          createdBy: adminProfile.uid,
          createdAt: serverTimestamp(),
        });
        onNotify('success', 'Task Created', payload.title);
      }
      resetTaskForm();
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'tasks');
    } finally {
      setBusyId(null);
    }
  };

  const handleDeleteTask = async (taskId: string) => {
    setBusyId(taskId);
    try {
      await deleteDoc(doc(db, 'tasks', taskId));
      onNotify('info', 'Task Deleted');
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `tasks/${taskId}`);
    } finally {
      setBusyId(null);
    }
  };

  const handleSeedSampleTasks = async () => {
    setBusyId('seed_tasks');
    try {
      const batch = writeBatch(db);
      const startPage = tasks.length + 1;
      SAMPLE_SOLAR_TASKS.forEach((sample, idx) => {
        const taskRef = doc(collection(db, 'tasks'));
        batch.set(taskRef, {
          title: sample.title,
          category: sample.category,
          pageNumber: startPage + idx,
          rewardAmount: settings.perPageReward,
          isActive: true,
          sourceRecordId: sample.sourceRecordId,
          sourceCustomerName: sample.sourceCustomerName,
          sourceSiteLocation: sample.sourceSiteLocation,
          sourceMeterNumber: sample.sourceMeterNumber,
          sourceKwhReading: sample.sourceKwhReading,
          sourceBillingDate: sample.sourceBillingDate,
          sourceNotes: sample.sourceNotes,
          createdBy: adminProfile.uid,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      });
      await batch.commit();
      onNotify('success', 'Sample Solar Tasks Added', `${SAMPLE_SOLAR_TASKS.length} pages added to queue.`);
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'tasks/seed');
    } finally {
      setBusyId(null);
    }
  };

  const handleVerifySubmission = async (sub: TaskSubmission, approve: boolean) => {
    setBusyId(sub.id);
    try {
      const targetUser = userById.get(sub.userId);
      if (!targetUser) {
        onNotify('error', 'User Not Found', 'Cannot locate operator profile for this submission.');
        setBusyId(null);
        return;
      }

      const batch = writeBatch(db);
      const reward = sub.rewardAmount || settings.perPageReward;

      if (approve) {
        batch.update(doc(db, 'submissions', sub.id), {
          status: 'Verified',
          creditedAmount: reward,
          rejectionReason: '',
          verifiedBy: adminProfile.uid,
          updatedAt: serverTimestamp(),
        });

        batch.update(doc(db, 'users', sub.userId), {
          totalEarnings: (targetUser.totalEarnings || 0) + reward,
          taskEarnings: (targetUser.taskEarnings || 0) + reward,
          verifiedPagesCount: (targetUser.verifiedPagesCount || 0) + 1,
          updatedAt: serverTimestamp(),
        });

        const txRef = doc(collection(db, 'transactions'));
        batch.set(txRef, {
          userId: sub.userId,
          type: 'task_credit',
          amount: reward,
          description: `Verified Page #${sub.pageNumber}: ${sub.taskTitle}`,
          referenceId: sub.id,
          createdBy: adminProfile.uid,
          createdAt: serverTimestamp(),
        });

        // Update referral progress if this operator was referred
        const refDocRef = doc(db, 'referrals', sub.userId);
        const refSnap = await getDoc(refDocRef);
        if (refSnap.exists()) {
          const refData = refSnap.data();
          const nextVerified = (refData.referredVerifiedPages || 0) + 1;
          const nextStatus =
            refData.status === 'Pending Eligibility' &&
            nextVerified >= (refData.eligibilityTargetPages || settings.referralEligibilityPages)
              ? 'Eligible'
              : refData.status;
          batch.update(refDocRef, {
            referredVerifiedPages: nextVerified,
            status: nextStatus,
            updatedAt: serverTimestamp(),
          });
        }

        await batch.commit();
        playSuccessChime('approve');
        onNotify('success', 'Submission Verified', `${formatINR(reward)} credited to ${sub.userName}.`);
      } else {
        const reason =
          (rejectReasonById[sub.id] || '').trim() ||
          'Entered values did not match the source solar sheet.';
        batch.update(doc(db, 'submissions', sub.id), {
          status: 'Rejected',
          creditedAmount: 0,
          rejectionReason: reason,
          verifiedBy: adminProfile.uid,
          updatedAt: serverTimestamp(),
        });
        await batch.commit();
        onNotify('info', 'Submission Rejected', `No earnings credited for ${sub.userName}.`);
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `submissions/${sub.id}`);
    } finally {
      setBusyId(null);
    }
  };

  const handleReferralAction = async (refItem: ReferralRecord, action: 'credit' | 'reject') => {
    setBusyId(refItem.id);
    try {
      const referrer = userById.get(refItem.referrerUid);
      if (!referrer) {
        onNotify('error', 'Referrer Missing', 'Could not locate referrer profile.');
        setBusyId(null);
        return;
      }
      const batch = writeBatch(db);
      if (action === 'credit') {
        const bonus = refItem.rewardAmount || settings.referralReward;
        batch.update(doc(db, 'referrals', refItem.id), {
          status: 'Credited',
          adminNotes: 'Verified eligibility and credited bonus',
          updatedAt: serverTimestamp(),
        });
        batch.update(doc(db, 'users', referrer.uid), {
          totalEarnings: (referrer.totalEarnings || 0) + bonus,
          referralEarnings: (referrer.referralEarnings || 0) + bonus,
          updatedAt: serverTimestamp(),
        });
        const txRef = doc(collection(db, 'transactions'));
        batch.set(txRef, {
          userId: referrer.uid,
          type: 'referral_bonus',
          amount: bonus,
          description: `Referral bonus for ${refItem.referredName} (${refItem.referredUserCode})`,
          referenceId: refItem.id,
          createdBy: adminProfile.uid,
          createdAt: serverTimestamp(),
        });
        await batch.commit();
        onNotify('success', 'Referral Credited', `${formatINR(bonus)} credited to ${referrer.name}.`);
      } else {
        batch.update(doc(db, 'referrals', refItem.id), {
          status: 'Rejected',
          adminNotes: 'Eligibility criteria not met',
          updatedAt: serverTimestamp(),
        });
        await batch.commit();
        onNotify('info', 'Referral Rejected');
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `referrals/${refItem.id}`);
    } finally {
      setBusyId(null);
    }
  };

  const handleWithdrawalAction = async (
    w: WithdrawalRequest,
    action: 'approve' | 'reject' | 'paid'
  ) => {
    setBusyId(w.id);
    try {
      const targetUser = userById.get(w.userId);
      if (!targetUser) {
        onNotify('error', 'User Not Found');
        setBusyId(null);
        return;
      }

      const batch = writeBatch(db);

      if (action === 'approve') {
        batch.update(doc(db, 'withdrawals', w.id), {
          status: 'Approved',
          processedBy: adminProfile.uid,
          updatedAt: serverTimestamp(),
        });
        await batch.commit();
        onNotify('success', 'Withdrawal Approved', `${formatINR(w.amount)} ready for payout.`);
      } else if (action === 'reject') {
        const reason =
          (rejectReasonById[w.id] || '').trim() || 'Payout details verification failed.';
        batch.update(doc(db, 'withdrawals', w.id), {
          status: 'Rejected',
          rejectionReason: reason,
          processedBy: adminProfile.uid,
          updatedAt: serverTimestamp(),
        });
        batch.update(doc(db, 'users', w.userId), {
          pendingWithdrawalAmount: Math.max(0, (targetUser.pendingWithdrawalAmount || 0) - w.amount),
          updatedAt: serverTimestamp(),
        });
        await batch.commit();
        onNotify('info', 'Withdrawal Rejected & Refunded', `${formatINR(w.amount)} restored to user balance.`);
      } else {
        const utr =
          (utrByWithdrawalId[w.id] || '').trim() ||
          `SOLUTR${String(Date.now()).slice(-8)}`;
        batch.update(doc(db, 'withdrawals', w.id), {
          status: 'Paid',
          paymentReference: utr,
          processedBy: adminProfile.uid,
          updatedAt: serverTimestamp(),
        });
        batch.update(doc(db, 'users', w.userId), {
          pendingWithdrawalAmount: Math.max(0, (targetUser.pendingWithdrawalAmount || 0) - w.amount),
          totalWithdrawn: (targetUser.totalWithdrawn || 0) + w.amount,
          updatedAt: serverTimestamp(),
        });
        const txRef = doc(collection(db, 'transactions'));
        batch.set(txRef, {
          userId: w.userId,
          type: 'withdrawal_paid',
          amount: w.amount,
          description: `${w.method} payout settled (UTR: ${utr})`,
          referenceId: w.id,
          createdBy: adminProfile.uid,
          createdAt: serverTimestamp(),
        });
        await batch.commit();
        onNotify('success', 'Withdrawal Marked Paid', `${formatINR(w.amount)} settled (UTR: ${utr}).`);
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `withdrawals/${w.id}`);
    } finally {
      setBusyId(null);
    }
  };

  const handleToggleUserStatus = async (user: UserProfile) => {
    setBusyId(user.uid);
    try {
      const nextStatus = user.accountStatus === 'active' ? 'suspended' : 'active';
      await updateDoc(doc(db, 'users', user.uid), {
        accountStatus: nextStatus,
        updatedAt: serverTimestamp(),
      });
      onNotify(
        'info',
        `User ${nextStatus === 'active' ? 'Activated' : 'Suspended'}`,
        `${user.name} (${user.userCode})`
      );
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `users/${user.uid}`);
    } finally {
      setBusyId(null);
    }
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusyId('save_settings');
    try {
      await setDoc(doc(db, 'settings', 'app'), {
        companyName: cfgCompanyName.trim() || 'Solar Power Pvt. Ltd.',
        dailyPageLimit: Math.max(1, Number(cfgDailyLimit) || 200),
        perPageReward: Math.max(1, Number(cfgPerPageReward) || 5),
        referralReward: Math.max(0, Number(cfgReferralReward) || 250),
        referralEligibilityPages: Math.max(1, Number(cfgReferralPages) || 5),
        minWithdrawal: Math.max(10, Number(cfgMinWithdrawal) || 100),
        withdrawalProcessingHours:
          cfgProcessingHours.trim() || '24–48 Business Hours',
        taskTimerSeconds: Math.min(3600, Math.max(30, Math.round(Number(cfgTaskTimerSeconds) || 180))),
        updatedAt: serverTimestamp(),
      });
      onNotify('success', 'Platform Settings Updated');
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'settings/app');
    } finally {
      setBusyId(null);
    }
  };

  const filteredSubmissions = useMemo(() => {
    return allSubmissions.filter((s) => {
      if (subFilter !== 'All' && s.status !== subFilter) return false;
      if (subCategoryFilter !== 'All' && s.taskCategory !== subCategoryFilter) return false;
      return true;
    });
  }, [allSubmissions, subFilter, subCategoryFilter]);

  const filteredTasks = useMemo(() => {
    const sorted = [...tasks].sort((a, b) => a.pageNumber - b.pageNumber);
    if (taskCategoryFilter === 'All') return sorted;
    return sorted.filter((t) => t.category === taskCategoryFilter);
  }, [tasks, taskCategoryFilter]);

  const filteredUsers = useMemo(() => {
    if (!userSearch.trim()) return allUsers;
    const q = userSearch.toLowerCase();
    return allUsers.filter(
      (u) =>
        u.name.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        u.userCode.toLowerCase().includes(q) ||
        u.mobile.includes(q)
    );
  }, [allUsers, userSearch]);

  const isExactFieldMatch = (sub: TaskSubmission, task?: DataEntryTask) => {
    if (!task) return false;
    return (
      sub.enteredRecordId.trim().toLowerCase() === task.sourceRecordId.trim().toLowerCase() &&
      sub.enteredCustomerName.trim().toLowerCase() === task.sourceCustomerName.trim().toLowerCase() &&
      sub.enteredSiteLocation.trim().toLowerCase() === task.sourceSiteLocation.trim().toLowerCase() &&
      sub.enteredMeterNumber.trim().toLowerCase() === task.sourceMeterNumber.trim().toLowerCase() &&
      sub.enteredKwhReading.trim().toLowerCase() === task.sourceKwhReading.trim().toLowerCase() &&
      sub.enteredBillingDate.trim().toLowerCase() === task.sourceBillingDate.trim().toLowerCase()
    );
  };

  return (
    <div className="space-y-6">
      {/* Admin Header & Sub-Nav */}
      <div className="bg-white border border-[#DCE6DE] rounded-xl p-5 space-y-4">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <Shield className="w-5 h-5 text-[#15803D]" />
            <div>
              <h1 className="font-display text-xl font-bold text-[#0F1F16]">
                Administrator Control Console
              </h1>
              <p className="text-xs text-[#4A5D52]">
                Signed in as {adminProfile.email} · Full Verification &amp; Treasury Authority
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-1 p-1 bg-[#F0F5F1] rounded-lg">
            {(
              [
                { id: 'overview', label: 'Company Payments' },
                { id: 'verifications', label: `Verify Pages (${metrics.pendingVerifications})` },
                { id: 'tasks', label: `Tasks (${tasks.length})` },
                { id: 'withdrawals', label: `Withdrawals (${metrics.pendingWithdrawalsCount})` },
                { id: 'referrals', label: `Referrals (${metrics.pendingReferralsCount})` },
                { id: 'users', label: `Users (${allUsers.length})` },
                { id: 'settings', label: 'App Settings' },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setSection(tab.id)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 ${
                  section === tab.id
                    ? 'bg-white text-[#0F1F16] shadow-xs'
                    : 'text-[#4A5D52] hover:text-[#0F1F16]'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* SECTION 1: COMPANY PAYMENTS & OVERVIEW */}
      {section === 'overview' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white border border-[#DCE6DE] rounded-xl p-5">
              <p className="text-xs font-medium text-[#4A5D52]">Total Company Earnings Credited</p>
              <p className="font-mono text-2xl font-bold text-[#15803D] mt-1.5 tabular-nums">
                {formatINR(metrics.totalCredited)}
              </p>
              <p className="text-xs text-[#4A5D52] mt-1">
                Tasks: {formatINR(metrics.totalTaskPayouts)} · Referrals:{' '}
                {formatINR(metrics.totalReferralPayouts)}
              </p>
            </div>

            <div className="bg-white border border-[#DCE6DE] rounded-xl p-5">
              <p className="text-xs font-medium text-[#4A5D52]">Total Paid Withdrawals</p>
              <p className="font-mono text-2xl font-bold text-[#0F1F16] mt-1.5 tabular-nums">
                {formatINR(metrics.totalPaidWithdrawals)}
              </p>
              <p className="text-xs text-[#4A5D52] mt-1">Settled via UPI &amp; Bank</p>
            </div>

            <div className="bg-white border border-[#DCE6DE] rounded-xl p-5">
              <p className="text-xs font-medium text-[#4A5D52]">Pending Withdrawal Liability</p>
              <p className="font-mono text-2xl font-bold text-[#CA8A04] mt-1.5 tabular-nums">
                {formatINR(metrics.pendingWithdrawalLiability)}
              </p>
              <p className="text-xs text-[#4A5D52] mt-1">
                {metrics.pendingWithdrawalsCount} requests awaiting action
              </p>
            </div>

            <div className="bg-white border border-[#DCE6DE] rounded-xl p-5">
              <p className="text-xs font-medium text-[#4A5D52]">Registered Operators</p>
              <p className="font-mono text-2xl font-bold text-[#0F1F16] mt-1.5 tabular-nums">
                {allUsers.length}
              </p>
              <p className="text-xs text-[#4A5D52] mt-1">
                {tasks.length} data entry pages configured
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <button
              type="button"
              onClick={() => setSection('verifications')}
              className="bg-white border border-[#DCE6DE] rounded-xl p-5 text-left hover:border-[#15803D] transition-colors"
            >
              <CheckCircle2 className="w-5 h-5 text-[#15803D] mb-2" />
              <p className="font-display text-base font-semibold text-[#0F1F16]">
                Verify Submitted Pages ({metrics.pendingVerifications})
              </p>
              <p className="text-xs text-[#4A5D52] mt-1">
                Audit pending submissions and credit {formatINR(settings.perPageReward)} per approved page.
              </p>
            </button>

            <button
              type="button"
              onClick={() => setSection('withdrawals')}
              className="bg-white border border-[#DCE6DE] rounded-xl p-5 text-left hover:border-[#15803D] transition-colors"
            >
              <Wallet className="w-5 h-5 text-[#CA8A04] mb-2" />
              <p className="font-display text-base font-semibold text-[#0F1F16]">
                Process Withdrawals ({metrics.pendingWithdrawalsCount})
              </p>
              <p className="text-xs text-[#4A5D52] mt-1">
                Approve, reject, or record UTR settlement for operator payout requests.
              </p>
            </button>

            <button
              type="button"
              onClick={() => setSection('tasks')}
              className="bg-white border border-[#DCE6DE] rounded-xl p-5 text-left hover:border-[#15803D] transition-colors"
            >
              <Database className="w-5 h-5 text-[#15803D] mb-2" />
              <p className="font-display text-base font-semibold text-[#0F1F16]">
                Manage Task Pages ({tasks.length})
              </p>
              <p className="text-xs text-[#4A5D52] mt-1">
                Create, edit, seed, or remove solar data entry task pages.
              </p>
            </button>
          </div>

          {/* Monthly Earnings Trends Bar Chart */}
          <div className="bg-white border border-[#DCE6DE] rounded-xl p-6 space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-4 border-b border-[#EEF3EF]">
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-lg bg-[#FEF9C3] text-[#CA8A04] flex items-center justify-center shrink-0">
                  <TrendingUp className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="font-display text-lg font-bold text-[#0F1F16]">
                    Monthly Earnings &amp; Payout Trends
                  </h2>
                  <p className="text-xs text-[#4A5D52] mt-0.5">
                    Total payouts per month across verified task credits, referral bonuses, and settled withdrawals.
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-4 text-xs shrink-0">
                <div>
                  <span className="text-[#4A5D52] block">Total Credited</span>
                  <span className="font-mono font-bold text-[#15803D] tabular-nums">
                    {formatINR(metrics.totalCredited)}
                  </span>
                </div>
                <div>
                  <span className="text-[#4A5D52] block">Settled Payouts</span>
                  <span className="font-mono font-bold text-[#0F1F16] tabular-nums">
                    {formatINR(metrics.totalPaidWithdrawals)}
                  </span>
                </div>
              </div>
            </div>

            {!hasMonthlyChartData && (
              <div className="p-3.5 rounded-lg bg-[#F7FAF7] border border-[#DCE6DE] text-xs text-[#4A5D52]">
                No verified payouts recorded yet. Approve submitted tasks, credit eligible referrals, or mark withdrawals paid to visualize monthly growth bars below.
              </div>
            )}

            <div className="w-full h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={monthlyTrendData}
                  margin={{ top: 8, right: 16, left: 4, bottom: 4 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#E2EAE4" vertical={false} />
                  <XAxis
                    dataKey="label"
                    tick={{ fill: '#4A5D52', fontSize: 12 }}
                    axisLine={{ stroke: '#DCE6DE' }}
                    tickLine={false}
                  />
                  <YAxis
                    tickFormatter={(value: number) => `₹${value}`}
                    tick={{ fill: '#4A5D52', fontSize: 12 }}
                    axisLine={false}
                    tickLine={false}
                    width={70}
                  />
                  <Tooltip
                    cursor={{ fill: '#F0F5F1' }}
                    contentStyle={{
                      backgroundColor: '#FFFFFF',
                      borderColor: '#DCE6DE',
                      borderRadius: '0.75rem',
                      fontSize: '12px',
                    }}
                    formatter={(value, name) => [
                      formatINR(Number(value) || 0),
                      String(name),
                    ]}
                  />
                  <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '8px' }} />
                  <Bar
                    dataKey="taskCredits"
                    name="Task Credits"
                    fill="#15803D"
                    radius={[4, 4, 0, 0]}
                    maxBarSize={36}
                  />
                  <Bar
                    dataKey="referralBonuses"
                    name="Referral Bonuses"
                    fill="#EAB308"
                    radius={[4, 4, 0, 0]}
                    maxBarSize={36}
                  />
                  <Bar
                    dataKey="withdrawalsPaid"
                    name="Withdrawals Paid"
                    fill="#14532D"
                    radius={[4, 4, 0, 0]}
                    maxBarSize={36}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Monthly Reporting & CSV Export Panel */}
          <div className="bg-white border border-[#DCE6DE] rounded-xl p-6 space-y-5">
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 pb-4 border-b border-[#EEF3EF]">
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-lg bg-[#DCFCE7] text-[#15803D] flex items-center justify-center shrink-0">
                  <FileSpreadsheet className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="font-display text-lg font-bold text-[#0F1F16]">
                    Monthly Financial Reporting &amp; CSV Export
                  </h2>
                  <p className="text-xs text-[#4A5D52] mt-0.5">
                    Select a reporting month or All Time to export operator earnings, withdrawal requests, and verified ledger records.
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 shrink-0">
                <div className="flex items-center gap-1 p-1 bg-[#F0F5F1] rounded-lg">
                  <button
                    type="button"
                    onClick={() => setReportScope('month')}
                    className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors whitespace-nowrap ${
                      reportScope === 'month'
                        ? 'bg-white text-[#0F1F16] shadow-xs'
                        : 'text-[#4A5D52] hover:text-[#0F1F16]'
                    }`}
                  >
                    By Month
                  </button>
                  <button
                    type="button"
                    onClick={() => setReportScope('all')}
                    className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors whitespace-nowrap ${
                      reportScope === 'all'
                        ? 'bg-white text-[#0F1F16] shadow-xs'
                        : 'text-[#4A5D52] hover:text-[#0F1F16]'
                    }`}
                  >
                    All Time
                  </button>
                </div>

                {reportScope === 'month' && (
                  <input
                    type="month"
                    value={selectedMonth}
                    onChange={(e) => setSelectedMonth(e.target.value || getCurrentMonthKey())}
                    aria-label="Reporting Month"
                    className="px-3 py-1.5 text-xs font-mono bg-[#F7FAF7] border border-[#DCE6DE] rounded-lg focus:outline-none focus:border-[#15803D]"
                  />
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
              <div className="p-3.5 rounded-lg bg-[#F7FAF7] border border-[#DCE6DE]">
                <span className="text-[#4A5D52] block">Task Credits ({activeMonthFilter === 'ALL' ? 'All' : selectedMonth})</span>
                <span className="font-mono text-base font-bold text-[#15803D] mt-1 block tabular-nums">
                  {formatINR(reportPeriodTotals.taskEarnings)}
                </span>
              </div>
              <div className="p-3.5 rounded-lg bg-[#F7FAF7] border border-[#DCE6DE]">
                <span className="text-[#4A5D52] block">Referral Bonuses</span>
                <span className="font-mono text-base font-bold text-[#CA8A04] mt-1 block tabular-nums">
                  {formatINR(reportPeriodTotals.referralBonuses)}
                </span>
              </div>
              <div className="p-3.5 rounded-lg bg-[#F7FAF7] border border-[#DCE6DE]">
                <span className="text-[#4A5D52] block">Withdrawals Paid</span>
                <span className="font-mono text-base font-bold text-[#0F1F16] mt-1 block tabular-nums">
                  {formatINR(reportPeriodTotals.paidWithdrawals)}
                </span>
              </div>
              <div className="p-3.5 rounded-lg bg-[#F7FAF7] border border-[#DCE6DE]">
                <span className="text-[#4A5D52] block">Withdrawal Requests</span>
                <span className="font-mono text-base font-bold text-[#0F1F16] mt-1 block tabular-nums">
                  {reportPeriodTotals.withdrawalCount} ({formatINR(reportPeriodTotals.requestedWithdrawals)})
                </span>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={handleDownloadCsv}
                className="px-4 py-2.5 rounded-lg bg-[#15803D] text-white text-xs font-semibold hover:bg-[#166534] transition-colors inline-flex items-center gap-2 whitespace-nowrap shrink-0"
              >
                <Download className="w-4 h-4" />
                <span>Download CSV</span>
              </button>

              <button
                type="button"
                onClick={handleExportUserEarningsCsv}
                className="px-4 py-2.5 rounded-lg bg-[#FEF9C3] text-[#0F1F16] border border-[#EAB308]/40 text-xs font-semibold hover:bg-[#FEF08A] transition-colors inline-flex items-center gap-2 whitespace-nowrap shrink-0"
              >
                <Download className="w-4 h-4 text-[#CA8A04]" />
                <span>User Earnings CSV ({monthlyUserSummaries.length})</span>
              </button>

              <button
                type="button"
                onClick={handleExportWithdrawalsCsv}
                className="px-4 py-2.5 rounded-lg border border-[#DCE6DE] bg-white text-xs font-semibold text-[#0F1F16] hover:bg-[#F0F5F1] transition-colors inline-flex items-center gap-2 whitespace-nowrap shrink-0"
              >
                <Download className="w-4 h-4 text-[#15803D]" />
                <span>Withdrawals CSV ({filteredReportWithdrawals.length})</span>
              </button>

              <button
                type="button"
                onClick={handleExportLedgerCsv}
                className="px-4 py-2.5 rounded-lg border border-[#DCE6DE] bg-white text-xs font-semibold text-[#0F1F16] hover:bg-[#F0F5F1] transition-colors inline-flex items-center gap-2 whitespace-nowrap shrink-0"
              >
                <Download className="w-4 h-4 text-[#15803D]" />
                <span>Transaction Logs CSV ({filteredReportTransactions.length})</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* SECTION 2: VERIFY SUBMISSIONS */}
      {section === 'verifications' && (
        <div className="bg-white border border-[#DCE6DE] rounded-xl p-6 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <h2 className="font-display text-lg font-semibold text-[#0F1F16]">
                Page Verification Queue
              </h2>
              <p className="text-xs text-[#4A5D52]">
                Compare submitted operator entries against the official source record before crediting earnings.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <select
                value={subCategoryFilter}
                onChange={(e) => setSubCategoryFilter(e.target.value as 'All' | TaskCategory)}
                aria-label="Filter verification queue by task category"
                className="px-3 py-1.5 text-xs font-medium text-[#0F1F16] bg-[#F7FAF7] border border-[#DCE6DE] rounded-lg focus:outline-none focus:border-[#15803D]"
              >
                <option value="All">All Categories</option>
                {TASK_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>

              <div className="flex items-center gap-1 p-1 bg-[#F0F5F1] rounded-lg w-fit">
                {(['Pending', 'All', 'Verified', 'Rejected'] as const).map((tab) => (
                  <button
                    key={tab}
                    type="button"
                    onClick={() => setSubFilter(tab)}
                    className={`px-3 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                      subFilter === tab
                        ? 'bg-white text-[#0F1F16] shadow-xs'
                        : 'text-[#4A5D52] hover:text-[#0F1F16]'
                    }`}
                  >
                    {tab}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {filteredSubmissions.length === 0 ? (
            <div className="py-10 text-center text-sm text-[#4A5D52]">
              No submissions in the {subFilter}
              {subCategoryFilter !== 'All' ? ` (${subCategoryFilter})` : ''} queue.
            </div>
          ) : (
            <div className="space-y-4">
              {filteredSubmissions.map((sub) => {
                const task = taskById.get(sub.taskId);
                const exact = isExactFieldMatch(sub, task);
                return (
                  <div
                    key={sub.id}
                    className="border border-[#DCE6DE] rounded-xl p-4 space-y-3 bg-[#F7FAF7]"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="text-sm font-semibold text-[#0F1F16]">
                          {sub.taskTitle} · Page #{sub.pageNumber} · {sub.taskCategory}
                        </p>
                        <p className="text-xs text-[#4A5D52]">
                          Operator: {sub.userName} ({sub.userCode}) · Submitted{' '}
                          {formatTimestamp(sub.createdAt)}
                        </p>
                      </div>
                      <div className="flex items-center gap-3 text-xs">
                        <span
                          className={`font-semibold ${
                            exact ? 'text-[#15803D]' : 'text-[#CA8A04]'
                          }`}
                        >
                          {exact ? '100% Exact Source Match' : 'Check Field Differences'}
                        </span>
                        <span className="font-mono font-bold text-[#0F1F16]">
                          {sub.status}
                        </span>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                      <div className="p-3 rounded-lg bg-white border border-[#DCE6DE] space-y-1">
                        <p className="font-semibold text-[#4A5D52]">Source Record</p>
                        {task ? (
                          <div className="grid grid-cols-2 gap-1.5 font-mono text-[#0F1F16]">
                            <span>ID: {task.sourceRecordId}</span>
                            <span>Name: {task.sourceCustomerName}</span>
                            <span>Loc: {task.sourceSiteLocation}</span>
                            <span>Meter: {task.sourceMeterNumber}</span>
                            <span>kWh: {task.sourceKwhReading}</span>
                            <span>Date: {task.sourceBillingDate}</span>
                          </div>
                        ) : (
                          <p className="text-[#4A5D52]">Source task archived</p>
                        )}
                      </div>

                      <div className="p-3 rounded-lg bg-white border border-[#DCE6DE] space-y-1">
                        <p className="font-semibold text-[#15803D]">Operator Entry</p>
                        <div className="grid grid-cols-2 gap-1.5 font-mono text-[#0F1F16]">
                          <span>ID: {sub.enteredRecordId}</span>
                          <span>Name: {sub.enteredCustomerName}</span>
                          <span>Loc: {sub.enteredSiteLocation}</span>
                          <span>Meter: {sub.enteredMeterNumber}</span>
                          <span>kWh: {sub.enteredKwhReading}</span>
                          <span>Date: {sub.enteredBillingDate}</span>
                        </div>
                      </div>
                    </div>

                    {sub.status === 'Pending' && (
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
                        <input
                          type="text"
                          value={rejectReasonById[sub.id] || ''}
                          onChange={(e) =>
                            setRejectReasonById((prev) => ({
                              ...prev,
                              [sub.id]: e.target.value,
                            }))
                          }
                          placeholder="Optional rejection reason..."
                          className="flex-1 px-3 py-1.5 text-xs bg-white border border-[#DCE6DE] rounded-lg focus:outline-none focus:border-[#15803D]"
                        />
                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            type="button"
                            disabled={busyId === sub.id}
                            onClick={() => handleVerifySubmission(sub, false)}
                            className="px-3.5 py-1.5 rounded-lg border border-red-200 bg-red-50 text-red-700 text-xs font-semibold hover:bg-red-100 transition-colors whitespace-nowrap"
                          >
                            Reject
                          </button>
                          <button
                            type="button"
                            disabled={busyId === sub.id}
                            onClick={() => handleVerifySubmission(sub, true)}
                            className="px-4 py-1.5 rounded-lg bg-[#15803D] text-white text-xs font-semibold hover:bg-[#166534] transition-colors whitespace-nowrap"
                          >
                            Approve &amp; Credit {formatINR(sub.rewardAmount || settings.perPageReward)}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* SECTION 3: MANAGE DATA ENTRY TASKS */}
      {section === 'tasks' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-5 bg-white border border-[#DCE6DE] rounded-xl p-6 space-y-4">
            <div className="flex items-center justify-between gap-2">
              <h2 className="font-display text-lg font-semibold text-[#0F1F16]">
                {editingTaskId ? 'Edit Task Page' : 'Add New Data Entry Task'}
              </h2>
              <button
                type="button"
                disabled={busyId === 'seed_tasks'}
                onClick={handleSeedSampleTasks}
                className="px-3 py-1.5 rounded-lg bg-[#FEF9C3] text-[#0F1F16] border border-[#EAB308]/40 text-xs font-semibold hover:bg-[#FEF08A] transition-colors whitespace-nowrap shrink-0"
              >
                {busyId === 'seed_tasks' ? 'Seeding...' : 'Seed 12 Solar Pages'}
              </button>
            </div>

            <form onSubmit={handleSaveTask} className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-[#4A5D52] mb-1">
                  Task Page Title
                </label>
                <input
                  type="text"
                  required
                  value={taskTitle}
                  onChange={(e) => setTaskTitle(e.target.value)}
                  placeholder="e.g. Surat Commercial Inverter Log #013"
                  className="w-full px-3 py-2 text-sm bg-[#F7FAF7] border border-[#DCE6DE] rounded-lg focus:outline-none focus:border-[#15803D]"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-[#4A5D52] mb-1">
                    Category
                  </label>
                  <select
                    value={taskCategory}
                    onChange={(e) => setTaskCategory(e.target.value as TaskCategory)}
                    className="w-full px-3 py-2 text-sm bg-[#F7FAF7] border border-[#DCE6DE] rounded-lg focus:outline-none focus:border-[#15803D]"
                  >
                    {TASK_CATEGORIES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#4A5D52] mb-1">
                    Page Number
                  </label>
                  <input
                    type="number"
                    min={1}
                    required
                    value={taskPageNum}
                    onChange={(e) => setTaskPageNum(e.target.value)}
                    className="w-full px-3 py-2 text-sm font-mono bg-[#F7FAF7] border border-[#DCE6DE] rounded-lg focus:outline-none focus:border-[#15803D]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-[#4A5D52] mb-1">
                    Source Record ID
                  </label>
                  <input
                    type="text"
                    required
                    value={taskRecordId}
                    onChange={(e) => setTaskRecordId(e.target.value)}
                    placeholder="INV-SRT-1042"
                    className="w-full px-3 py-2 text-sm font-mono bg-[#F7FAF7] border border-[#DCE6DE] rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#4A5D52] mb-1">
                    Customer Name
                  </label>
                  <input
                    type="text"
                    required
                    value={taskCustomerName}
                    onChange={(e) => setTaskCustomerName(e.target.value)}
                    placeholder="Narmada Solar Co."
                    className="w-full px-3 py-2 text-sm bg-[#F7FAF7] border border-[#DCE6DE] rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#4A5D52] mb-1">
                    Site Location
                  </label>
                  <input
                    type="text"
                    required
                    value={taskSiteLocation}
                    onChange={(e) => setTaskSiteLocation(e.target.value)}
                    placeholder="Surat GIDC"
                    className="w-full px-3 py-2 text-sm bg-[#F7FAF7] border border-[#DCE6DE] rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#4A5D52] mb-1">
                    Meter Number
                  </label>
                  <input
                    type="text"
                    required
                    value={taskMeterNumber}
                    onChange={(e) => setTaskMeterNumber(e.target.value)}
                    placeholder="MTR-GJ-11920"
                    className="w-full px-3 py-2 text-sm font-mono bg-[#F7FAF7] border border-[#DCE6DE] rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#4A5D52] mb-1">
                    kWh Reading
                  </label>
                  <input
                    type="text"
                    required
                    value={taskKwhReading}
                    onChange={(e) => setTaskKwhReading(e.target.value)}
                    placeholder="514.2 kWh"
                    className="w-full px-3 py-2 text-sm font-mono bg-[#F7FAF7] border border-[#DCE6DE] rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#4A5D52] mb-1">
                    Billing Date
                  </label>
                  <input
                    type="text"
                    required
                    value={taskBillingDate}
                    onChange={(e) => setTaskBillingDate(e.target.value)}
                    className="w-full px-3 py-2 text-sm font-mono bg-[#F7FAF7] border border-[#DCE6DE] rounded-lg"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-[#4A5D52] mb-1">
                  Field Notes
                </label>
                <input
                  type="text"
                  required
                  value={taskNotes}
                  onChange={(e) => setTaskNotes(e.target.value)}
                  placeholder="Solar installation notes..."
                  className="w-full px-3 py-2 text-sm bg-[#F7FAF7] border border-[#DCE6DE] rounded-lg"
                />
              </div>

              <label className="flex items-center gap-2 text-xs font-medium text-[#0F1F16]">
                <input
                  type="checkbox"
                  checked={taskIsActive}
                  onChange={(e) => setTaskIsActive(e.target.checked)}
                  className="accent-[#15803D]"
                />
                Task is active and visible to operators
              </label>

              <div className="flex items-center gap-2 pt-2">
                <button
                  type="submit"
                  disabled={busyId === 'save_task'}
                  className="px-4 py-2 rounded-lg bg-[#15803D] text-white text-xs font-semibold hover:bg-[#166534] transition-colors inline-flex items-center gap-1.5"
                >
                  <Plus className="w-4 h-4" />
                  <span>{editingTaskId ? 'Update Task' : 'Create Task'}</span>
                </button>
                {editingTaskId && (
                  <button
                    type="button"
                    onClick={resetTaskForm}
                    className="px-4 py-2 rounded-lg border border-[#DCE6DE] text-xs font-semibold text-[#4A5D52]"
                  >
                    Cancel Edit
                  </button>
                )}
              </div>
            </form>
          </div>

          <div className="lg:col-span-7 bg-white border border-[#DCE6DE] rounded-xl p-6 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <h2 className="font-display text-lg font-semibold text-[#0F1F16]">
                All Data Entry Pages ({filteredTasks.length}
                {taskCategoryFilter !== 'All' ? ` of ${tasks.length}` : ''})
              </h2>
              <select
                value={taskCategoryFilter}
                onChange={(e) => setTaskCategoryFilter(e.target.value as 'All' | TaskCategory)}
                aria-label="Filter task pages by category"
                className="px-3 py-1.5 text-xs font-medium text-[#0F1F16] bg-[#F7FAF7] border border-[#DCE6DE] rounded-lg focus:outline-none focus:border-[#15803D]"
              >
                <option value="All">All Categories ({tasks.length})</option>
                {TASK_CATEGORIES.map((c) => {
                  const count = tasks.filter((t) => t.category === c).length;
                  return (
                    <option key={c} value={c}>
                      {c} ({count})
                    </option>
                  );
                })}
              </select>
            </div>
            {filteredTasks.length === 0 ? (
              <div className="py-10 text-center text-sm text-[#4A5D52]">
                {tasks.length === 0
                  ? 'No tasks configured yet. Click “Seed 12 Solar Pages” or create one on the left.'
                  : `No tasks found in the ${taskCategoryFilter} category.`}
              </div>
            ) : (
              <div className="divide-y divide-[#EEF3EF] max-h-[600px] overflow-y-auto">
                {filteredTasks.map((task) => (
                    <div
                      key={task.id}
                      className="py-3 flex items-center justify-between gap-4 text-sm"
                    >
                      <div className="min-w-0">
                        <p className="font-medium text-[#0F1F16] truncate">
                          #{task.pageNumber} · {task.title}
                        </p>
                        <p className="text-xs text-[#4A5D52] font-mono">
                          {task.sourceRecordId} · {task.category} ·{' '}
                          {task.isActive ? 'Active' : 'Paused'}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => handleEditTask(task)}
                          className="p-2 rounded-lg border border-[#DCE6DE] text-[#4A5D52] hover:text-[#0F1F16]"
                          title="Edit Task"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          disabled={busyId === task.id}
                          onClick={() => handleDeleteTask(task.id)}
                          className="p-2 rounded-lg border border-red-200 text-red-600 hover:bg-red-50"
                          title="Delete Task"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* SECTION 4: WITHDRAWAL REQUESTS */}
      {section === 'withdrawals' && (
        <div className="bg-white border border-[#DCE6DE] rounded-xl p-6 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <h2 className="font-display text-lg font-semibold text-[#0F1F16]">
              Withdrawal Requests &amp; Settlement ({allWithdrawals.length})
            </h2>
            <button
              type="button"
              onClick={handleExportWithdrawalsCsv}
              className="px-3.5 py-2 rounded-lg border border-[#DCE6DE] bg-[#F7FAF7] text-xs font-semibold text-[#0F1F16] hover:bg-[#F0F5F1] transition-colors inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 w-fit"
            >
              <Download className="w-3.5 h-3.5 text-[#15803D]" />
              <span>Export Withdrawals CSV ({activeMonthFilter === 'ALL' ? 'All Time' : selectedMonth})</span>
            </button>
          </div>

          {allWithdrawals.length === 0 ? (
            <div className="py-10 text-center text-sm text-[#4A5D52]">
              No withdrawal requests submitted yet.
            </div>
          ) : (
            <div className="space-y-3">
              {allWithdrawals.map((w) => (
                <div
                  key={w.id}
                  className="p-4 rounded-xl border border-[#DCE6DE] bg-[#F7FAF7] flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4"
                >
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-display text-sm font-bold text-[#0F1F16]">
                        {w.userName} ({w.userCode})
                      </span>
                      <span className="font-mono text-sm font-bold text-[#15803D] tabular-nums">
                        {formatINR(w.amount)}
                      </span>
                      <span className="text-xs font-semibold text-[#4A5D52]">
                        · {w.status}
                      </span>
                    </div>
                    <p className="text-xs font-mono text-[#4A5D52]">
                      {w.method}:{' '}
                      {w.method === 'UPI'
                        ? w.upiId
                        : `${w.bankName} · ${w.accountNumber} · IFSC ${w.ifscCode}`}{' '}
                      · Holder: {w.accountHolder}
                    </p>
                    <p className="text-xs text-[#4A5D52]">
                      Requested {formatTimestamp(w.createdAt)}
                      {w.paymentReference ? ` · UTR: ${w.paymentReference}` : ''}
                      {w.rejectionReason ? ` · Reason: ${w.rejectionReason}` : ''}
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    {w.status === 'Pending' && (
                      <>
                        <input
                          type="text"
                          value={rejectReasonById[w.id] || ''}
                          onChange={(e) =>
                            setRejectReasonById((prev) => ({
                              ...prev,
                              [w.id]: e.target.value,
                            }))
                          }
                          placeholder="Rejection note (optional)"
                          className="px-3 py-1.5 text-xs bg-white border border-[#DCE6DE] rounded-lg"
                        />
                        <button
                          type="button"
                          disabled={busyId === w.id}
                          onClick={() => handleWithdrawalAction(w, 'reject')}
                          className="px-3 py-1.5 rounded-lg bg-red-50 border border-red-200 text-red-700 text-xs font-semibold hover:bg-red-100"
                        >
                          Reject &amp; Refund
                        </button>
                        <button
                          type="button"
                          disabled={busyId === w.id}
                          onClick={() => handleWithdrawalAction(w, 'approve')}
                          className="px-3.5 py-1.5 rounded-lg bg-[#15803D] text-white text-xs font-semibold hover:bg-[#166534]"
                        >
                          Approve Request
                        </button>
                      </>
                    )}

                    {w.status === 'Approved' && (
                      <>
                        <input
                          type="text"
                          value={utrByWithdrawalId[w.id] || ''}
                          onChange={(e) =>
                            setUtrByWithdrawalId((prev) => ({
                              ...prev,
                              [w.id]: e.target.value,
                            }))
                          }
                          placeholder="UTR / Tx Reference"
                          className="px-3 py-1.5 text-xs font-mono bg-white border border-[#DCE6DE] rounded-lg"
                        />
                        <button
                          type="button"
                          disabled={busyId === w.id}
                          onClick={() => handleWithdrawalAction(w, 'paid')}
                          className="px-3.5 py-1.5 rounded-lg bg-[#15803D] text-white text-xs font-semibold hover:bg-[#166534]"
                        >
                          Mark Paid
                        </button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* SECTION 5: REFERRAL REWARDS */}
      {section === 'referrals' && (
        <div className="bg-white border border-[#DCE6DE] rounded-xl p-6 space-y-4">
          <h2 className="font-display text-lg font-semibold text-[#0F1F16]">
            Referral Rewards Management ({allReferrals.length})
          </h2>
          {allReferrals.length === 0 ? (
            <div className="py-10 text-center text-sm text-[#4A5D52]">
              No referral records yet.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-sm">
                <thead>
                  <tr className="border-b border-[#DCE6DE] text-xs font-medium text-[#4A5D52]">
                    <th className="py-2.5 pr-4">Referrer</th>
                    <th className="py-2.5 px-4">Referred Operator</th>
                    <th className="py-2.5 px-4">Verified Pages</th>
                    <th className="py-2.5 px-4">Status</th>
                    <th className="py-2.5 px-4">Reward</th>
                    <th className="py-2.5 pl-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#EEF3EF]">
                  {allReferrals.map((r) => (
                    <tr key={r.id}>
                      <td className="py-3 pr-4">
                        <p className="font-medium text-[#0F1F16]">{r.referrerName}</p>
                        <p className="text-xs font-mono text-[#4A5D52]">{r.referralCode}</p>
                      </td>
                      <td className="py-3 px-4">
                        <p className="font-medium text-[#0F1F16]">{r.referredName}</p>
                        <p className="text-xs font-mono text-[#4A5D52]">{r.referredUserCode}</p>
                      </td>
                      <td className="py-3 px-4 font-mono text-xs tabular-nums">
                        {r.referredVerifiedPages} / {r.eligibilityTargetPages}
                      </td>
                      <td className="py-3 px-4 text-xs font-semibold">{r.status}</td>
                      <td className="py-3 px-4 font-mono font-semibold tabular-nums">
                        {formatINR(r.rewardAmount)}
                      </td>
                      <td className="py-3 pl-4 text-right">
                        {(r.status === 'Eligible' || r.status === 'Pending Eligibility') && (
                          <div className="inline-flex items-center gap-2">
                            <button
                              type="button"
                              disabled={busyId === r.id}
                              onClick={() => handleReferralAction(r, 'reject')}
                              className="px-2.5 py-1 rounded border border-red-200 bg-red-50 text-red-700 text-xs font-semibold"
                            >
                              Reject
                            </button>
                            <button
                              type="button"
                              disabled={busyId === r.id}
                              onClick={() => handleReferralAction(r, 'credit')}
                              className="px-3 py-1 rounded bg-[#15803D] text-white text-xs font-semibold"
                            >
                              Credit {formatINR(r.rewardAmount)}
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* SECTION 6: REGISTERED USERS */}
      {section === 'users' && (
        <div className="bg-white border border-[#DCE6DE] rounded-xl p-6 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex items-center gap-2">
              <Users className="w-5 h-5 text-[#15803D]" />
              <h2 className="font-display text-lg font-semibold text-[#0F1F16]">
                Registered Users ({allUsers.length})
              </h2>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="text"
                value={userSearch}
                onChange={(e) => setUserSearch(e.target.value)}
                placeholder="Search name, email, mobile, ID..."
                className="px-3.5 py-1.5 text-xs bg-[#F7FAF7] border border-[#DCE6DE] rounded-lg focus:outline-none focus:border-[#15803D]"
              />
              <button
                type="button"
                onClick={handleExportUserEarningsCsv}
                className="px-3.5 py-1.5 rounded-lg border border-[#DCE6DE] bg-[#F7FAF7] text-xs font-semibold text-[#0F1F16] hover:bg-[#F0F5F1] transition-colors inline-flex items-center gap-1.5 whitespace-nowrap shrink-0"
              >
                <Download className="w-3.5 h-3.5 text-[#15803D]" />
                <span>Export Earnings CSV</span>
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="border-b border-[#DCE6DE] text-xs font-medium text-[#4A5D52]">
                  <th className="py-2.5 pr-4">Operator</th>
                  <th className="py-2.5 px-4">Mobile &amp; Email</th>
                  <th className="py-2.5 px-4">Verified Pages</th>
                  <th className="py-2.5 px-4">Total Earned</th>
                  <th className="py-2.5 px-4">Withdrawn</th>
                  <th className="py-2.5 px-4">Status</th>
                  <th className="py-2.5 pl-4 text-right">Account Control</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#EEF3EF]">
                {filteredUsers.map((u) => (
                  <tr key={u.uid} className="hover:bg-[#F7FAF7]">
                    <td className="py-3 pr-4">
                      <p className="font-medium text-[#0F1F16]">{u.name}</p>
                      <p className="text-xs font-mono text-[#4A5D52]">
                        {u.userCode} · {u.referralCode}
                      </p>
                    </td>
                    <td className="py-3 px-4 text-xs text-[#4A5D52]">
                      <p className="font-mono text-[#0F1F16]">+91 {u.mobile}</p>
                      <p>{u.email}</p>
                    </td>
                    <td className="py-3 px-4 font-mono text-xs tabular-nums">
                      {u.verifiedPagesCount}
                    </td>
                    <td className="py-3 px-4 font-mono text-xs font-semibold text-[#15803D] tabular-nums">
                      {formatINR(u.totalEarnings)}
                    </td>
                    <td className="py-3 px-4 font-mono text-xs tabular-nums">
                      {formatINR(u.totalWithdrawn)}
                    </td>
                    <td className="py-3 px-4 text-xs font-semibold">
                      {u.accountStatus === 'active' ? (
                        <span className="text-[#15803D] inline-flex items-center gap-1">
                          <CheckCircle2 className="w-3.5 h-3.5" /> Active
                        </span>
                      ) : (
                        <span className="text-[#DC2626] inline-flex items-center gap-1">
                          <XCircle className="w-3.5 h-3.5" /> Suspended
                        </span>
                      )}
                    </td>
                    <td className="py-3 pl-4 text-right">
                      {u.uid !== adminProfile.uid && (
                        <button
                          type="button"
                          disabled={busyId === u.uid}
                          onClick={() => handleToggleUserStatus(u)}
                          className={`px-3 py-1 rounded-lg text-xs font-semibold border ${
                            u.accountStatus === 'active'
                              ? 'border-red-200 bg-red-50 text-red-700 hover:bg-red-100'
                              : 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                          }`}
                        >
                          {u.accountStatus === 'active' ? 'Suspend' : 'Activate'}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* SECTION 7: APP SETTINGS */}
      {section === 'settings' && (
        <div className="bg-white border border-[#DCE6DE] rounded-xl p-6 max-w-2xl space-y-5">
          <div className="flex items-center gap-2">
            <Settings className="w-5 h-5 text-[#15803D]" />
            <h2 className="font-display text-lg font-semibold text-[#0F1F16]">
              Platform Limits &amp; App Settings
            </h2>
          </div>

          <form onSubmit={handleSaveSettings} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-[#4A5D52] mb-1">
                Company Display Name
              </label>
              <input
                type="text"
                required
                value={cfgCompanyName}
                onChange={(e) => setCfgCompanyName(e.target.value)}
                className="w-full px-3.5 py-2 text-sm bg-[#F7FAF7] border border-[#DCE6DE] rounded-lg"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-[#4A5D52] mb-1">
                  Daily Page Limit
                </label>
                <input
                  type="number"
                  min={1}
                  required
                  value={cfgDailyLimit}
                  onChange={(e) => setCfgDailyLimit(e.target.value)}
                  className="w-full px-3.5 py-2 text-sm font-mono bg-[#F7FAF7] border border-[#DCE6DE] rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#4A5D52] mb-1">
                  Payment Per Verified Page (₹)
                </label>
                <input
                  type="number"
                  min={1}
                  required
                  value={cfgPerPageReward}
                  onChange={(e) => setCfgPerPageReward(e.target.value)}
                  className="w-full px-3.5 py-2 text-sm font-mono bg-[#F7FAF7] border border-[#DCE6DE] rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#4A5D52] mb-1">
                  Referral Reward (₹)
                </label>
                <input
                  type="number"
                  min={0}
                  required
                  value={cfgReferralReward}
                  onChange={(e) => setCfgReferralReward(e.target.value)}
                  className="w-full px-3.5 py-2 text-sm font-mono bg-[#F7FAF7] border border-[#DCE6DE] rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#4A5D52] mb-1">
                  Referral Eligibility (Min Verified Pages)
                </label>
                <input
                  type="number"
                  min={1}
                  required
                  value={cfgReferralPages}
                  onChange={(e) => setCfgReferralPages(e.target.value)}
                  className="w-full px-3.5 py-2 text-sm font-mono bg-[#F7FAF7] border border-[#DCE6DE] rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#4A5D52] mb-1">
                  Minimum Withdrawal Amount (₹)
                </label>
                <input
                  type="number"
                  min={10}
                  required
                  value={cfgMinWithdrawal}
                  onChange={(e) => setCfgMinWithdrawal(e.target.value)}
                  className="w-full px-3.5 py-2 text-sm font-mono bg-[#F7FAF7] border border-[#DCE6DE] rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#4A5D52] mb-1">
                  Withdrawal Processing Time
                </label>
                <input
                  type="text"
                  required
                  value={cfgProcessingHours}
                  onChange={(e) => setCfgProcessingHours(e.target.value)}
                  className="w-full px-3.5 py-2 text-sm bg-[#F7FAF7] border border-[#DCE6DE] rounded-lg"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-[#4A5D52] mb-1">
                  Task Focus Countdown Timer (Seconds)
                </label>
                <input
                  type="number"
                  min={30}
                  max={3600}
                  required
                  value={cfgTaskTimerSeconds}
                  onChange={(e) => setCfgTaskTimerSeconds(e.target.value)}
                  className="w-full px-3.5 py-2 text-sm font-mono bg-[#F7FAF7] border border-[#DCE6DE] rounded-lg"
                />
                <p className="text-[11px] text-[#4A5D52] mt-1">
                  Allowed range: 30–3600 seconds per task session (default: 180 seconds / 3 minutes).
                </p>
              </div>
            </div>

            <button
              type="submit"
              disabled={busyId === 'save_settings'}
              className="px-5 py-2.5 rounded-lg bg-[#15803D] text-white text-sm font-semibold hover:bg-[#166534] transition-colors"
            >
              {busyId === 'save_settings' ? 'Saving...' : 'Save App Settings'}
            </button>
          </form>
        </div>
      )}
    </div>
  );
};
