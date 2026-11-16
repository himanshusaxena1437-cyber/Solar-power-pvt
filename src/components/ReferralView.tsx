import React, { useState } from 'react';
import { Check, CheckCircle2, Clock, Copy, Share2, Users, XCircle } from 'lucide-react';
import type { AppSettings, ReferralRecord, UserProfile } from '../types';
import { formatINR, formatTimestamp } from '../utils/solarData';

interface ReferralViewProps {
  profile: UserProfile;
  settings: AppSettings;
  referrals: ReferralRecord[];
  onNotify: (tone: 'success' | 'error' | 'info', title: string, detail?: string) => void;
}

export const ReferralView: React.FC<ReferralViewProps> = ({
  profile,
  settings,
  referrals,
  onNotify,
}) => {
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  const inviteUrl =
    typeof window !== 'undefined'
      ? `${window.location.origin}/?ref=${encodeURIComponent(profile.referralCode)}`
      : `?ref=${profile.referralCode}`;

  const copyText = async (value: string, type: 'code' | 'link') => {
    try {
      await navigator.clipboard.writeText(value);
      if (type === 'code') {
        setCopiedCode(true);
        window.setTimeout(() => setCopiedCode(false), 2000);
        onNotify('success', 'Referral Code Copied', value);
      } else {
        setCopiedLink(true);
        window.setTimeout(() => setCopiedLink(false), 2000);
        onNotify('success', 'Invite Link Copied', 'Share it with friends to earn referral rewards.');
      }
    } catch {
      onNotify('error', 'Clipboard Unavailable', 'Please select and copy the code manually.');
    }
  };

  const creditedCount = referrals.filter((r) => r.status === 'Credited').length;
  const pendingCount = referrals.filter(
    (r) => r.status === 'Pending Eligibility' || r.status === 'Eligible'
  ).length;

  return (
    <div className="space-y-6">
      {/* Referral Invite Banner */}
      <div className="bg-white border border-[#DCE6DE] rounded-xl p-6 grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
        <div className="lg:col-span-7 space-y-2">
          <p className="text-xs font-medium text-[#15803D]">
            Solar Power Pvt. Ltd. · Referral Reward Program
          </p>
          <h1 className="font-display text-2xl font-bold text-[#0F1F16]">
            Invite Friends &amp; Earn {formatINR(settings.referralReward)} Per Referral
          </h1>
          <p className="text-sm text-[#4A5D52] leading-relaxed">
            Share your unique referral code. When a referred operator registers with OTP
            verification and completes at least{' '}
            <span className="font-mono font-semibold text-[#0F1F16]">
              {settings.referralEligibilityPages} verified data entry pages
            </span>
            , your {formatINR(settings.referralReward)} reward becomes eligible for admin credit.
          </p>
        </div>

        <div className="lg:col-span-5 bg-[#F7FAF7] border border-[#DCE6DE] rounded-xl p-4 space-y-3">
          <div>
            <span className="text-xs text-[#4A5D52] block mb-1">Your Unique Referral Code</span>
            <div className="flex items-center gap-2">
              <div className="flex-1 px-3.5 py-2.5 bg-white border border-[#DCE6DE] rounded-lg font-mono text-base font-bold text-[#0F1F16] tracking-wider">
                {profile.referralCode}
              </div>
              <button
                type="button"
                onClick={() => copyText(profile.referralCode, 'code')}
                className="px-4 py-2.5 rounded-lg bg-[#15803D] text-white text-xs font-semibold hover:bg-[#166534] transition-colors inline-flex items-center gap-1.5 whitespace-nowrap shrink-0"
              >
                {copiedCode ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                <span>{copiedCode ? 'Copied' : 'Copy Code'}</span>
              </button>
            </div>
          </div>

          <div>
            <span className="text-xs text-[#4A5D52] block mb-1">Direct Invite Link</span>
            <div className="flex items-center gap-2">
              <input
                type="text"
                readOnly
                value={inviteUrl}
                className="flex-1 px-3 py-2 bg-white border border-[#DCE6DE] rounded-lg text-xs font-mono text-[#4A5D52] truncate"
              />
              <button
                type="button"
                onClick={() => copyText(inviteUrl, 'link')}
                className="px-3.5 py-2 rounded-lg bg-[#FEF9C3] text-[#0F1F16] border border-[#EAB308]/40 text-xs font-semibold hover:bg-[#FEF08A] transition-colors inline-flex items-center gap-1.5 whitespace-nowrap shrink-0"
              >
                {copiedLink ? <Check className="w-3.5 h-3.5" /> : <Share2 className="w-3.5 h-3.5" />}
                <span>{copiedLink ? 'Copied' : 'Copy Link'}</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Referral KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div className="bg-white border border-[#DCE6DE] rounded-xl p-5">
          <p className="text-xs font-medium text-[#4A5D52]">Total Referral Earnings</p>
          <p className="font-mono text-2xl font-bold text-[#15803D] mt-1.5 tabular-nums">
            {formatINR(profile.referralEarnings)}
          </p>
        </div>
        <div className="bg-white border border-[#DCE6DE] rounded-xl p-5">
          <p className="text-xs font-medium text-[#4A5D52]">Total Invited Friends</p>
          <p className="font-mono text-2xl font-bold text-[#0F1F16] mt-1.5 tabular-nums">
            {referrals.length}
          </p>
        </div>
        <div className="bg-white border border-[#DCE6DE] rounded-xl p-5">
          <p className="text-xs font-medium text-[#4A5D52]">Credited Referrals</p>
          <p className="font-mono text-2xl font-bold text-[#0F1F16] mt-1.5 tabular-nums">
            {creditedCount}
          </p>
        </div>
        <div className="bg-white border border-[#DCE6DE] rounded-xl p-5">
          <p className="text-xs font-medium text-[#4A5D52]">Awaiting Eligibility</p>
          <p className="font-mono text-2xl font-bold text-[#CA8A04] mt-1.5 tabular-nums">
            {pendingCount}
          </p>
        </div>
      </div>

      {/* Referral History Table */}
      <div className="bg-white border border-[#DCE6DE] rounded-xl p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-lg font-semibold text-[#0F1F16]">
            Referral History
          </h2>
          <span className="text-xs text-[#4A5D52]">
            Eligibility Target: {settings.referralEligibilityPages} verified pages
          </span>
        </div>

        {referrals.length === 0 ? (
          <div className="py-10 text-center space-y-2">
            <Users className="w-8 h-8 text-[#4A5D52]/50 mx-auto" />
            <p className="text-sm font-medium text-[#0F1F16]">No Referrals Yet</p>
            <p className="text-xs text-[#4A5D52] max-w-md mx-auto">
              Copy your referral code or invite link above and share it with colleagues to track their
              onboarding and earn {formatINR(settings.referralReward)} bonuses.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="border-b border-[#DCE6DE] text-xs font-medium text-[#4A5D52]">
                  <th className="py-2.5 pr-4">Referred Operator</th>
                  <th className="py-2.5 px-4">Operator ID</th>
                  <th className="py-2.5 px-4">Progress</th>
                  <th className="py-2.5 px-4">Joined</th>
                  <th className="py-2.5 px-4">Status</th>
                  <th className="py-2.5 pl-4 text-right">Reward</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#EEF3EF]">
                {referrals.map((ref) => (
                  <tr key={ref.id} className="hover:bg-[#F7FAF7]">
                    <td className="py-3 pr-4 font-medium text-[#0F1F16]">{ref.referredName}</td>
                    <td className="py-3 px-4 font-mono text-xs text-[#4A5D52]">
                      {ref.referredUserCode}
                    </td>
                    <td className="py-3 px-4 font-mono text-xs text-[#0F1F16] tabular-nums">
                      {ref.referredVerifiedPages} / {ref.eligibilityTargetPages} pages
                    </td>
                    <td className="py-3 px-4 font-mono text-xs text-[#4A5D52] whitespace-nowrap">
                      {formatTimestamp(ref.createdAt)}
                    </td>
                    <td className="py-3 px-4">
                      {ref.status === 'Credited' && (
                        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#15803D]">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          Credited
                        </span>
                      )}
                      {ref.status === 'Eligible' && (
                        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#15803D]">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          Eligible (Awaiting Payout)
                        </span>
                      )}
                      {ref.status === 'Pending Eligibility' && (
                        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#CA8A04]">
                          <Clock className="w-3.5 h-3.5" />
                          Pending Eligibility
                        </span>
                      )}
                      {ref.status === 'Rejected' && (
                        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#DC2626]">
                          <XCircle className="w-3.5 h-3.5" />
                          Rejected
                        </span>
                      )}
                    </td>
                    <td className="py-3 pl-4 text-right font-mono font-semibold tabular-nums text-[#0F1F16]">
                      {formatINR(ref.rewardAmount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
