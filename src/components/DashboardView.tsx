import React from 'react';
import {
  ArrowUpRight,
  Award,
  CheckCircle2,
  Clock,
  FileSpreadsheet,
  ShieldCheck,
  Trophy,
  Users,
  Wallet,
} from 'lucide-react';
import type {
  ActiveTab,
  AppSettings,
  EarningTransaction,
  LeaderboardEntry,
  TaskSubmission,
  UserProfile,
} from '../types';
import { getCurrentMonthKey, getMonthKeyFromTimestamp } from '../utils/csvExport';
import { formatINR, formatTimestamp, getTodayDateKey } from '../utils/solarData';
import { PWAInstallButton } from './PWAInstallControls';

interface DashboardViewProps {
  profile: UserProfile;
  settings: AppSettings;
  submissions: TaskSubmission[];
  transactions: EarningTransaction[];
  leaderboardEntries: LeaderboardEntry[];
  onNavigate: (tab: ActiveTab) => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  profile,
  settings,
  submissions,
  transactions,
  leaderboardEntries,
  onNavigate,
}) => {
  const todayKey = getTodayDateKey();
  const todaySubmissions = submissions.filter((s) => s.dateKey === todayKey);
  const todayVerified = todaySubmissions.filter((s) => s.status === 'Verified');
  const todayEarnings = todayVerified.reduce((acc, s) => acc + (s.creditedAmount || 0), 0);
  const pendingSubmissions = submissions.filter((s) => s.status === 'Pending');
  const pendingPotential = pendingSubmissions.reduce((acc, s) => acc + (s.rewardAmount || 0), 0);

  const availableBalance = Math.max(
    0,
    profile.totalEarnings - profile.totalWithdrawn - profile.pendingWithdrawalAmount
  );

  const dailyProgressPct = Math.min(
    100,
    Math.round((todaySubmissions.length / Math.max(1, settings.dailyPageLimit)) * 100)
  );
  const maxDailyOpportunity = settings.dailyPageLimit * settings.perPageReward;

  const currentMonthKey = getCurrentMonthKey();
  const [yrStr, moStr] = currentMonthKey.split('-');
  const currentMonthLabel = new Date(Number(yrStr), Number(moStr) - 1, 1).toLocaleDateString(
    'en-IN',
    { month: 'long', year: 'numeric' }
  );

  const sortedLeaderboard = [...leaderboardEntries]
    .filter((entry) => entry.monthKey === currentMonthKey && entry.approvedCount > 0)
    .sort((a, b) => b.approvedCount - a.approvedCount || a.userName.localeCompare(b.userName));
  const topFivePerformers = sortedLeaderboard.slice(0, 5);
  const topScore = topFivePerformers[0]?.approvedCount || 1;

  const myMonthlyApprovedFromSubmissions = submissions.filter((s) => {
    if (s.status !== 'Verified') return false;
    const m = getMonthKeyFromTimestamp(s.updatedAt || s.createdAt) || s.dateKey.slice(0, 7);
    return m === currentMonthKey;
  }).length;
  const myLeaderboardIndex = sortedLeaderboard.findIndex((e) => e.userId === profile.uid);
  const myMonthlyApprovedCount =
    myLeaderboardIndex >= 0
      ? sortedLeaderboard[myLeaderboardIndex].approvedCount
      : myMonthlyApprovedFromSubmissions;

  return (
    <div className="space-y-6">
      {/* Welcome & Daily Quota Banner */}
      <div className="bg-white border border-[#DCE6DE] rounded-xl p-6 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-2 text-xs text-[#4A5D52]">
            <span className="font-medium text-[#15803D]">{settings.companyName}</span>
            <span aria-hidden="true">·</span>
            <span className="font-mono">{profile.userCode}</span>
            <span aria-hidden="true">·</span>
            <span>
              Account: {profile.accountStatus === 'active' ? 'Active & OTP Verified' : 'Suspended'}
            </span>
          </div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-[#0F1F16]">
            Welcome back, {profile.name}
          </h1>
          <p className="text-sm text-[#4A5D52]">
            Daily target: {settings.dailyPageLimit} pages at {formatINR(settings.perPageReward)}/page
            (up to {formatINR(maxDailyOpportunity)}/day after verification).
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={() => onNavigate('work')}
            className="px-4 py-2.5 rounded-lg bg-[#15803D] text-white text-sm font-semibold hover:bg-[#166534] transition-colors flex items-center gap-2 whitespace-nowrap shrink-0"
          >
            <FileSpreadsheet className="w-4 h-4" />
            <span>Start Data Entry</span>
          </button>
          <button
            type="button"
            onClick={() => onNavigate('withdrawals')}
            className="px-4 py-2.5 rounded-lg bg-[#FEF9C3] text-[#0F1F16] border border-[#EAB308]/40 text-sm font-semibold hover:bg-[#FEF08A] transition-colors flex items-center gap-2 whitespace-nowrap shrink-0"
          >
            <Wallet className="w-4 h-4 text-[#CA8A04]" />
            <span>Withdraw Funds</span>
          </button>
          <PWAInstallButton />
        </div>
      </div>

      {/* Primary KPI Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-4">
        <div className="bg-white border border-[#DCE6DE] rounded-xl p-5">
          <p className="text-xs font-medium text-[#4A5D52]">Available Balance</p>
          <p className="font-mono text-2xl font-bold text-[#15803D] mt-1.5 tabular-nums">
            {formatINR(availableBalance)}
          </p>
          <p className="text-xs text-[#4A5D52] mt-1.5">
            Ready for UPI / Bank withdrawal
          </p>
        </div>

        <div className="bg-white border border-[#DCE6DE] rounded-xl p-5">
          <p className="text-xs font-medium text-[#4A5D52]">Total Lifetime Earnings</p>
          <p className="font-mono text-2xl font-bold text-[#0F1F16] mt-1.5 tabular-nums">
            {formatINR(profile.totalEarnings)}
          </p>
          <p className="text-xs text-[#4A5D52] mt-1.5">
            Withdrawn: <span className="font-mono tabular-nums">{formatINR(profile.totalWithdrawn)}</span>
          </p>
        </div>

        <div className="bg-white border border-[#DCE6DE] rounded-xl p-5">
          <p className="text-xs font-medium text-[#4A5D52]">Today&apos;s Verified Earnings</p>
          <p className="font-mono text-2xl font-bold text-[#0F1F16] mt-1.5 tabular-nums">
            {formatINR(todayEarnings)}
          </p>
          <p className="text-xs text-[#4A5D52] mt-1.5">
            Pending review: <span className="font-mono tabular-nums">{formatINR(pendingPotential)}</span>
          </p>
        </div>

        <div className="bg-white border border-[#DCE6DE] rounded-xl p-5">
          <p className="text-xs font-medium text-[#4A5D52]">Completed Pages</p>
          <p className="font-mono text-2xl font-bold text-[#0F1F16] mt-1.5 tabular-nums">
            {profile.verifiedPagesCount}{' '}
            <span className="text-sm font-normal text-[#4A5D52]">verified</span>
          </p>
          <p className="text-xs text-[#4A5D52] mt-1.5">
            Today: <span className="font-mono tabular-nums">{todaySubmissions.length}/{settings.dailyPageLimit}</span> submitted
          </p>
        </div>

        <div className="bg-white border border-[#DCE6DE] rounded-xl p-5">
          <p className="text-xs font-medium text-[#4A5D52]">Referral Earnings</p>
          <p className="font-mono text-2xl font-bold text-[#CA8A04] mt-1.5 tabular-nums">
            {formatINR(profile.referralEarnings)}
          </p>
          <button
            type="button"
            onClick={() => onNavigate('referrals')}
            className="text-xs font-medium text-[#15803D] hover:underline mt-1.5 inline-flex items-center gap-1"
          >
            Invite friends ({formatINR(settings.referralReward)}/referral)
            <ArrowUpRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Daily Progress & Rules Split */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-7 bg-white border border-[#DCE6DE] rounded-xl p-6 space-y-5">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="font-display text-lg font-semibold text-[#0F1F16]">
                Daily Work Quota ({todayKey})
              </h2>
              <p className="text-xs text-[#4A5D52] mt-0.5">
                {todaySubmissions.length} of {settings.dailyPageLimit} pages submitted today ·{' '}
                {todayVerified.length} verified
              </p>
            </div>
            <span className="font-mono text-sm font-semibold text-[#15803D] tabular-nums">
              {dailyProgressPct}%
            </span>
          </div>

          <div className="w-full h-3 bg-[#EEF3EF] rounded-full overflow-hidden">
            <div
              className="h-full bg-[#15803D] transition-all duration-200"
              style={{ width: `${dailyProgressPct}%` }}
            />
          </div>

          <div className="pt-2 border-t border-[#E8EFE9]">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-display text-sm font-semibold text-[#0F1F16]">
                Recent Verified Ledger Entries
              </h3>
              <button
                type="button"
                onClick={() => onNavigate('work')}
                className="text-xs font-medium text-[#15803D] hover:underline"
              >
                View All Submissions
              </button>
            </div>

            {transactions.length === 0 ? (
              <div className="py-8 text-center text-sm text-[#4A5D52]">
                No verified earnings or payouts yet. Submit data entry pages and wait for admin verification to see credits here.
              </div>
            ) : (
              <div className="divide-y divide-[#EEF3EF]">
                {transactions.slice(0, 5).map((tx) => (
                  <div
                    key={tx.id}
                    className="py-3 flex items-center justify-between gap-4 text-sm"
                  >
                    <div className="min-w-0">
                      <p className="font-medium text-[#0F1F16] truncate">{tx.description}</p>
                      <p className="text-xs text-[#4A5D52] mt-0.5">
                        {tx.type === 'task_credit'
                          ? 'Task Verified Credit'
                          : tx.type === 'referral_bonus'
                            ? 'Referral Bonus'
                            : 'Withdrawal Paid'}{' '}
                        · {formatTimestamp(tx.createdAt)}
                      </p>
                    </div>
                    <span
                      className={`font-mono text-sm font-semibold tabular-nums shrink-0 ${
                        tx.type === 'withdrawal_paid' ? 'text-[#4A5D52]' : 'text-[#15803D]'
                      }`}
                    >
                      {tx.type === 'withdrawal_paid' ? '-' : '+'}
                      {formatINR(tx.amount)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="lg:col-span-5 bg-white border border-[#DCE6DE] rounded-xl p-6 space-y-4">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-[#15803D]" />
            <h2 className="font-display text-lg font-semibold text-[#0F1F16]">
              Earning &amp; Withdrawal Conditions
            </h2>
          </div>

          <div className="divide-y divide-[#EEF3EF] text-sm">
            <div className="py-3 flex items-center justify-between gap-4">
              <span className="text-[#4A5D52]">Daily Work Limit</span>
              <span className="font-mono font-semibold text-[#0F1F16] tabular-nums">
                {settings.dailyPageLimit} pages/day
              </span>
            </div>
            <div className="py-3 flex items-center justify-between gap-4">
              <span className="text-[#4A5D52]">Payment Per Verified Page</span>
              <span className="font-mono font-semibold text-[#15803D] tabular-nums">
                {formatINR(settings.perPageReward)}
              </span>
            </div>
            <div className="py-3 flex items-center justify-between gap-4">
              <span className="text-[#4A5D52]">Maximum Daily Earnings</span>
              <span className="font-mono font-semibold text-[#0F1F16] tabular-nums">
                {formatINR(maxDailyOpportunity)}
              </span>
            </div>
            <div className="py-3 flex items-center justify-between gap-4">
              <span className="text-[#4A5D52]">Referral Reward</span>
              <span className="font-mono font-semibold text-[#CA8A04] tabular-nums">
                {formatINR(settings.referralReward)}
              </span>
            </div>
            <div className="py-3 flex items-center justify-between gap-4">
              <span className="text-[#4A5D52]">Referral Eligibility</span>
              <span className="font-mono font-semibold text-[#0F1F16] tabular-nums">
                {settings.referralEligibilityPages} verified pages
              </span>
            </div>
            <div className="py-3 flex items-center justify-between gap-4">
              <span className="text-[#4A5D52]">Minimum Withdrawal</span>
              <span className="font-mono font-semibold text-[#0F1F16] tabular-nums">
                {formatINR(settings.minWithdrawal)}
              </span>
            </div>
            <div className="py-3 flex items-center justify-between gap-4">
              <span className="text-[#4A5D52]">Processing Time</span>
              <span className="font-medium text-[#0F1F16] text-right">
                {settings.withdrawalProcessingHours}
              </span>
            </div>
          </div>

          <div className="p-3.5 rounded-lg bg-[#FEFCE8] border border-[#EAB308]/35 text-xs text-[#713F12] flex items-start gap-2.5">
            <Clock className="w-4 h-4 text-[#CA8A04] shrink-0 mt-0.5" />
            <span>
              Earnings are credited strictly after administrator verification of each submitted page.
              Duplicate submissions for the same page are automatically blocked.
            </span>
          </div>

          <div className="pt-1 flex items-center justify-between text-xs text-[#4A5D52]">
            <span className="flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-[#15803D]" />
              Pending Approval: {pendingSubmissions.length} pages
            </span>
            <button
              type="button"
              onClick={() => onNavigate('referrals')}
              className="inline-flex items-center gap-1 font-medium text-[#15803D] hover:underline"
            >
              <Users className="w-3.5 h-3.5" />
              Referral Code: {profile.referralCode}
            </button>
          </div>
        </div>
      </div>

      {/* Top Performers Section */}
      <div className="bg-white border border-[#DCE6DE] rounded-xl p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-3 border-b border-[#EEF3EF]">
          <div className="flex items-start gap-2.5">
            <Trophy className="w-5 h-5 text-[#CA8A04] shrink-0 mt-0.5" />
            <div>
              <h2 className="font-display text-lg font-semibold text-[#0F1F16]">
                Top Performers · {currentMonthLabel}
              </h2>
              <p className="text-xs text-[#4A5D52] mt-0.5">
                Top 5 operators ranked by verified and approved task pages this month.
              </p>
            </div>
          </div>

          <div className="text-xs text-left sm:text-right">
            <span className="text-[#4A5D52] block">Your Monthly Approved</span>
            <span className="font-mono text-sm font-bold text-[#15803D] tabular-nums">
              {myMonthlyApprovedCount} {myMonthlyApprovedCount === 1 ? 'page' : 'pages'}
              {myLeaderboardIndex >= 0 ? ` · Rank #${myLeaderboardIndex + 1}` : ''}
            </span>
          </div>
        </div>

        {topFivePerformers.length === 0 ? (
          <div className="py-8 text-center space-y-2.5">
            <Award className="w-7 h-7 text-[#CA8A04] mx-auto" />
            <p className="text-sm font-medium text-[#0F1F16]">
              No approved tasks recorded for {currentMonthLabel} yet
            </p>
            <p className="text-xs text-[#4A5D52] max-w-md mx-auto">
              Submit accurate data entry pages and earn admin verification to climb to the #1 spot on this month&apos;s leaderboard.
            </p>
            <button
              type="button"
              onClick={() => onNavigate('work')}
              className="mt-1 px-4 py-2 rounded-lg bg-[#15803D] text-white text-xs font-semibold hover:bg-[#166534] transition-colors inline-flex items-center gap-1.5"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              <span>Start Data Entry</span>
            </button>
          </div>
        ) : (
          <div className="divide-y divide-[#EEF3EF]">
            {topFivePerformers.map((entry, idx) => {
              const rank = idx + 1;
              const isCurrentUser = entry.userId === profile.uid;
              const barPct = Math.max(8, Math.round((entry.approvedCount / topScore) * 100));
              const rankColor =
                rank === 1
                  ? 'text-[#B45309]'
                  : rank <= 3
                    ? 'text-[#15803D]'
                    : 'text-[#4A5D52]';

              return (
                <div
                  key={entry.id}
                  className={`py-3.5 px-2 -mx-2 rounded-lg flex items-center justify-between gap-4 text-sm ${
                    isCurrentUser ? 'bg-[#F0FDF4]' : 'hover:bg-[#F7FAF7]'
                  }`}
                >
                  <div className="flex items-center gap-3.5 min-w-0">
                    <span
                      className={`font-mono text-sm font-bold tabular-nums w-8 shrink-0 ${rankColor}`}
                    >
                      #{rank}
                    </span>
                    <div className="min-w-0">
                      <p className="font-semibold text-[#0F1F16] truncate">
                        {entry.userName}
                        {isCurrentUser && (
                          <span className="ml-1.5 text-xs font-semibold text-[#15803D]">
                            (You)
                          </span>
                        )}
                      </p>
                      <p className="text-xs font-mono text-[#4A5D52]">
                        {entry.userCode}
                        {rank === 1 ? ' · Monthly Leader' : ''}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-4 shrink-0">
                    <div className="hidden sm:block w-28 h-2 rounded-full bg-[#EEF3EF] overflow-hidden">
                      <div
                        className={`h-full rounded-full ${
                          rank === 1 ? 'bg-[#EAB308]' : 'bg-[#15803D]'
                        }`}
                        style={{ width: `${barPct}%` }}
                      />
                    </div>
                    <div className="text-right min-w-[92px]">
                      <span className="font-mono font-bold text-[#0F1F16] tabular-nums">
                        {entry.approvedCount}
                      </span>{' '}
                      <span className="text-xs text-[#4A5D52]">
                        {entry.approvedCount === 1 ? 'task' : 'tasks'}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
