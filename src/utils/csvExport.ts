import type { Timestamp } from 'firebase/firestore';
import type {
  EarningTransaction,
  TaskSubmission,
  UserProfile,
  WithdrawalRequest,
} from '../types';

function escapeCsvCell(value: string | number | boolean | null | undefined): string {
  const raw = value === null || value === undefined ? '' : String(value);
  // Neutralize spreadsheet formula triggers while keeping plain numbers/text intact
  const safe = /^[=+\-@\t\r]/.test(raw) && !/^-[0-9]/.test(raw) ? `'${raw}` : raw;
  if (/[",\r\n]/.test(safe)) {
    return `"${safe.replace(/"/g, '""')}"`;
  }
  return safe;
}

export function downloadCsvFile(
  filename: string,
  headers: string[],
  rows: Array<Array<string | number | boolean | null | undefined>>
): void {
  const csvLines = [
    headers.map(escapeCsvCell).join(','),
    ...rows.map((row) => row.map(escapeCsvCell).join(',')),
  ];
  const csvContent = '\uFEFF' + csvLines.join('\r\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function getMonthKeyFromTimestamp(ts?: Timestamp | null): string {
  if (!ts || typeof ts.toDate !== 'function') return '';
  const d = ts.toDate();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

export function getCurrentMonthKey(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

export function formatCsvTimestamp(ts?: Timestamp | null): string {
  if (!ts || typeof ts.toDate !== 'function') return '';
  return ts.toDate().toISOString().replace('T', ' ').slice(0, 19);
}

export interface MonthlyUserSummaryRow {
  user: UserProfile;
  periodVerifiedPages: number;
  periodTaskEarnings: number;
  periodReferralBonuses: number;
  periodTotalEarnings: number;
  periodWithdrawalsPaid: number;
  availableBalance: number;
}

export function computeMonthlyUserSummaries(
  users: UserProfile[],
  submissions: TaskSubmission[],
  transactions: EarningTransaction[],
  withdrawals: WithdrawalRequest[],
  monthFilter: string // 'ALL' or 'YYYY-MM'
): MonthlyUserSummaryRow[] {
  const isAll = monthFilter === 'ALL';

  const verifiedSubsByUser = new Map<string, number>();
  const taskEarnByUser = new Map<string, number>();
  const refEarnByUser = new Map<string, number>();
  const paidByUser = new Map<string, number>();

  submissions.forEach((s) => {
    if (s.status !== 'Verified') return;
    const subMonth = getMonthKeyFromTimestamp(s.updatedAt || s.createdAt) || s.dateKey.slice(0, 7);
    if (isAll || subMonth === monthFilter) {
      verifiedSubsByUser.set(s.userId, (verifiedSubsByUser.get(s.userId) || 0) + 1);
    }
  });

  transactions.forEach((tx) => {
    const txMonth = getMonthKeyFromTimestamp(tx.createdAt);
    if (!isAll && txMonth !== monthFilter) return;

    if (tx.type === 'task_credit') {
      taskEarnByUser.set(tx.userId, (taskEarnByUser.get(tx.userId) || 0) + (tx.amount || 0));
    } else if (tx.type === 'referral_bonus') {
      refEarnByUser.set(tx.userId, (refEarnByUser.get(tx.userId) || 0) + (tx.amount || 0));
    } else if (tx.type === 'withdrawal_paid') {
      paidByUser.set(tx.userId, (paidByUser.get(tx.userId) || 0) + (tx.amount || 0));
    }
  });

  // Fallback if legacy transactions haven't been created yet for paid withdrawals
  if (transactions.length === 0) {
    withdrawals.forEach((w) => {
      if (w.status !== 'Paid') return;
      const wMonth = getMonthKeyFromTimestamp(w.updatedAt || w.createdAt);
      if (isAll || wMonth === monthFilter) {
        paidByUser.set(w.userId, (paidByUser.get(w.userId) || 0) + (w.amount || 0));
      }
    });
  }

  return users.map((user) => {
    const periodTaskEarnings = isAll
      ? user.taskEarnings || 0
      : taskEarnByUser.get(user.uid) || 0;
    const periodReferralBonuses = isAll
      ? user.referralEarnings || 0
      : refEarnByUser.get(user.uid) || 0;
    const periodWithdrawalsPaid = isAll
      ? user.totalWithdrawn || 0
      : paidByUser.get(user.uid) || 0;
    const periodVerifiedPages = isAll
      ? user.verifiedPagesCount || 0
      : verifiedSubsByUser.get(user.uid) || 0;
    const availableBalance = Math.max(
      0,
      (user.totalEarnings || 0) -
        (user.totalWithdrawn || 0) -
        (user.pendingWithdrawalAmount || 0)
    );

    return {
      user,
      periodVerifiedPages,
      periodTaskEarnings,
      periodReferralBonuses,
      periodTotalEarnings: periodTaskEarnings + periodReferralBonuses,
      periodWithdrawalsPaid,
      availableBalance,
    };
  });
}

export function exportCombinedMonthlyReportCsv(params: {
  companyName: string;
  periodLabel: string;
  summaries: MonthlyUserSummaryRow[];
  withdrawals: WithdrawalRequest[];
  transactions: EarningTransaction[];
  userById: Map<string, UserProfile>;
}): string {
  const { companyName, periodLabel, summaries, withdrawals, transactions, userById } = params;
  const safePeriod = periodLabel === 'ALL' ? 'all-time' : periodLabel;
  const filename = `solar_power_monthly_report_${safePeriod}.csv`;

  const totalTaskCredits = summaries.reduce((acc, r) => acc + r.periodTaskEarnings, 0);
  const totalRefBonuses = summaries.reduce((acc, r) => acc + r.periodReferralBonuses, 0);
  const totalPaidWithdrawals = summaries.reduce((acc, r) => acc + r.periodWithdrawalsPaid, 0);

  const lines: Array<Array<string | number | boolean | null | undefined>> = [
    ['SOLAR POWER PVT. LTD. - MONTHLY FINANCIAL REPORT'],
    ['Company', companyName],
    ['Reporting Period', periodLabel === 'ALL' ? 'All Time' : periodLabel],
    ['Generated At (UTC)', new Date().toISOString().replace('T', ' ').slice(0, 19)],
    ['Period Task Credits (INR)', totalTaskCredits],
    ['Period Referral Bonuses (INR)', totalRefBonuses],
    ['Period Withdrawals Paid (INR)', totalPaidWithdrawals],
    ['Registered Users Count', summaries.length],
    ['Withdrawal Requests Count', withdrawals.length],
    ['Transaction Log Entries Count', transactions.length],
    [],
    ['SECTION 1: USER EARNINGS SUMMARY'],
    [
      'User ID',
      'Operator Name',
      'Email',
      'Mobile',
      'Account Status',
      'Verified Pages (Period)',
      'Task Earnings (Period INR)',
      'Referral Bonuses (Period INR)',
      'Total Period Earnings (INR)',
      'Withdrawals Paid (Period INR)',
      'Lifetime Total Earnings (INR)',
      'Lifetime Withdrawn (INR)',
      'Pending Withdrawals (INR)',
      'Available Balance (INR)',
    ],
    ...summaries.map((row) => [
      row.user.userCode,
      row.user.name,
      row.user.email,
      `+91 ${row.user.mobile}`,
      row.user.accountStatus,
      row.periodVerifiedPages,
      row.periodTaskEarnings,
      row.periodReferralBonuses,
      row.periodTotalEarnings,
      row.periodWithdrawalsPaid,
      row.user.totalEarnings || 0,
      row.user.totalWithdrawn || 0,
      row.user.pendingWithdrawalAmount || 0,
      row.availableBalance,
    ]),
    [],
    ['SECTION 2: WITHDRAWAL HISTORY'],
    [
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
    ],
    ...withdrawals.map((w) => [
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
    ]),
    [],
    ['SECTION 3: PLATFORM TRANSACTION LOGS'],
    [
      'Transaction ID',
      'Created At',
      'User ID',
      'Operator Name',
      'Type',
      'Amount (INR)',
      'Description',
      'Reference ID',
    ],
    ...transactions.map((tx) => {
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
    }),
  ];

  const csvText = '\uFEFF' + lines.map((row) => row.map(escapeCsvCell).join(',')).join('\r\n');
  const blob = new Blob([csvText], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);

  return filename;
}

