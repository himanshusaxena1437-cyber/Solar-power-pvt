import React, { useState } from 'react';
import { doc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { ArrowRight, CheckCircle2, HelpCircle, Save, ShieldCheck, User } from 'lucide-react';
import { db, handleFirestoreError, OperationType } from '../firebase';
import type { ActiveTab, UserProfile } from '../types';
import { formatINR, formatTimestamp, maskAccountNumber } from '../utils/solarData';

interface ProfileViewProps {
  profile: UserProfile;
  onNotify: (tone: 'success' | 'error' | 'info', title: string, detail?: string) => void;
  onNavigate: (tab: ActiveTab) => void;
}

export const ProfileView: React.FC<ProfileViewProps> = ({ profile, onNotify, onNavigate }) => {
  const [name, setName] = useState(profile.name);
  const [savedUpiId, setSavedUpiId] = useState(profile.savedUpiId || '');
  const [savedAccountHolder, setSavedAccountHolder] = useState(
    profile.savedAccountHolder || profile.name
  );
  const [savedBankName, setSavedBankName] = useState(profile.savedBankName || '');
  const [bankAccountInput, setBankAccountInput] = useState('');
  const [savedIfsc, setSavedIfsc] = useState(profile.savedIfsc || '');
  const [saving, setSaving] = useState(false);

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = name.trim();
    if (cleanName.length < 2) {
      onNotify('error', 'Invalid Name', 'Name must be at least 2 characters.');
      return;
    }

    setSaving(true);
    try {
      const nextMaskedAccount = bankAccountInput.trim()
        ? maskAccountNumber(bankAccountInput)
        : profile.savedAccountNumberMasked || '';

      await updateDoc(doc(db, 'users', profile.uid), {
        name: cleanName,
        savedUpiId: savedUpiId.trim(),
        savedAccountHolder: savedAccountHolder.trim(),
        savedBankName: savedBankName.trim(),
        savedAccountNumberMasked: nextMaskedAccount,
        savedIfsc: savedIfsc.trim().toUpperCase(),
        updatedAt: serverTimestamp(),
      });

      setBankAccountInput('');
      onNotify('success', 'Profile Updated', 'Your operator and payout preferences are saved.');
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `users/${profile.uid}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Identity Summary */}
        <div className="lg:col-span-5 bg-white border border-[#DCE6DE] rounded-xl p-6 space-y-5">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-[#DCFCE7] text-[#15803D] flex items-center justify-center shrink-0">
              <User className="w-6 h-6" />
            </div>
            <div className="min-w-0">
              <h1 className="font-display text-xl font-bold text-[#0F1F16] truncate">
                {profile.name}
              </h1>
              <p className="text-xs font-mono text-[#15803D]">
                {profile.userCode} · {profile.role === 'admin' ? 'Administrator' : 'Verified Operator'}
              </p>
            </div>
          </div>

          <div className="divide-y divide-[#EEF3EF] text-sm">
            <div className="py-3 flex items-center justify-between gap-4">
              <span className="text-[#4A5D52]">User ID</span>
              <span className="font-mono font-semibold text-[#0F1F16]">{profile.userCode}</span>
            </div>
            <div className="py-3 flex items-center justify-between gap-4">
              <span className="text-[#4A5D52]">Mobile Number</span>
              <span className="font-mono text-[#0F1F16] inline-flex items-center gap-1.5">
                +91 {profile.mobile}
                {profile.otpVerified && <CheckCircle2 className="w-3.5 h-3.5 text-[#15803D]" />}
              </span>
            </div>
            <div className="py-3 flex items-center justify-between gap-4">
              <span className="text-[#4A5D52]">Email</span>
              <span className="text-[#0F1F16] truncate max-w-[210px]">{profile.email}</span>
            </div>
            <div className="py-3 flex items-center justify-between gap-4">
              <span className="text-[#4A5D52]">Referral Code</span>
              <span className="font-mono font-semibold text-[#CA8A04]">
                {profile.referralCode}
              </span>
            </div>
            <div className="py-3 flex items-center justify-between gap-4">
              <span className="text-[#4A5D52]">Total Earnings</span>
              <span className="font-mono font-semibold text-[#15803D] tabular-nums">
                {formatINR(profile.totalEarnings)}
              </span>
            </div>
            <div className="py-3 flex items-center justify-between gap-4">
              <span className="text-[#4A5D52]">Total Withdrawals</span>
              <span className="font-mono font-semibold text-[#0F1F16] tabular-nums">
                {formatINR(profile.totalWithdrawn)}
              </span>
            </div>
            <div className="py-3 flex items-center justify-between gap-4">
              <span className="text-[#4A5D52]">Registered Since</span>
              <span className="font-mono text-xs text-[#4A5D52]">
                {formatTimestamp(profile.createdAt)}
              </span>
            </div>
          </div>

          <div className="p-3.5 rounded-lg bg-[#F0F5F1] border border-[#DCE6DE] text-xs text-[#4A5D52] flex items-start gap-2">
            <ShieldCheck className="w-4 h-4 text-[#15803D] shrink-0 mt-0.5" />
            <span>
              Your email, mobile uniqueness registry, and earning balances are protected by
              server-verified security rules.
            </span>
          </div>
        </div>

        {/* Editable Payout & Display Preferences */}
        <div className="lg:col-span-7 bg-white border border-[#DCE6DE] rounded-xl p-6 space-y-5">
          <div>
            <h2 className="font-display text-lg font-bold text-[#0F1F16]">
              Profile &amp; Default Payout Settings
            </h2>
            <p className="text-xs text-[#4A5D52] mt-0.5">
              Save your UPI ID or bank transfer defaults for faster withdrawal requests.
            </p>
          </div>

          <form onSubmit={handleSaveProfile} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-[#4A5D52] mb-1">
                  Display Name
                </label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-3.5 py-2.5 text-sm bg-[#F7FAF7] border border-[#DCE6DE] rounded-lg focus:outline-none focus:border-[#15803D]"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#4A5D52] mb-1">
                  Default UPI ID
                </label>
                <input
                  type="text"
                  value={savedUpiId}
                  onChange={(e) => setSavedUpiId(e.target.value)}
                  placeholder="name@okaxis"
                  className="w-full px-3.5 py-2.5 text-sm font-mono bg-[#F7FAF7] border border-[#DCE6DE] rounded-lg focus:outline-none focus:border-[#15803D]"
                />
              </div>
            </div>

            <div className="pt-3 border-t border-[#EEF3EF] grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-[#4A5D52] mb-1">
                  Bank Account Holder Name
                </label>
                <input
                  type="text"
                  value={savedAccountHolder}
                  onChange={(e) => setSavedAccountHolder(e.target.value)}
                  className="w-full px-3.5 py-2.5 text-sm bg-[#F7FAF7] border border-[#DCE6DE] rounded-lg focus:outline-none focus:border-[#15803D]"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#4A5D52] mb-1">
                  Bank Name
                </label>
                <input
                  type="text"
                  value={savedBankName}
                  onChange={(e) => setSavedBankName(e.target.value)}
                  placeholder="e.g. HDFC Bank"
                  className="w-full px-3.5 py-2.5 text-sm bg-[#F7FAF7] border border-[#DCE6DE] rounded-lg focus:outline-none focus:border-[#15803D]"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#4A5D52] mb-1">
                  Update Bank Account Number {profile.savedAccountNumberMasked ? `(Saved: ${profile.savedAccountNumberMasked})` : ''}
                </label>
                <input
                  type="text"
                  value={bankAccountInput}
                  onChange={(e) => setBankAccountInput(e.target.value.replace(/\D/g, ''))}
                  placeholder="Enter to update masked account"
                  className="w-full px-3.5 py-2.5 text-sm font-mono bg-[#F7FAF7] border border-[#DCE6DE] rounded-lg focus:outline-none focus:border-[#15803D]"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#4A5D52] mb-1">
                  IFSC Code
                </label>
                <input
                  type="text"
                  maxLength={11}
                  value={savedIfsc}
                  onChange={(e) => setSavedIfsc(e.target.value.toUpperCase())}
                  placeholder="HDFC0001234"
                  className="w-full px-3.5 py-2.5 text-sm font-mono uppercase bg-[#F7FAF7] border border-[#DCE6DE] rounded-lg focus:outline-none focus:border-[#15803D]"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={saving}
              className="px-5 py-2.5 rounded-lg bg-[#15803D] text-white text-sm font-semibold hover:bg-[#166534] transition-colors disabled:opacity-50 inline-flex items-center gap-2 whitespace-nowrap shrink-0"
            >
              <Save className="w-4 h-4" />
              <span>{saving ? 'Saving Changes...' : 'Save Profile & Payout Info'}</span>
            </button>
          </form>
        </div>
      </div>

      {/* Help & Support FAQ Link */}
      <div className="bg-white border border-[#DCE6DE] rounded-xl p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-lg bg-[#DCFCE7] text-[#15803D] flex items-center justify-center shrink-0">
            <HelpCircle className="w-5 h-5" />
          </div>
          <div>
            <h2 className="font-display text-base font-bold text-[#0F1F16]">
              Operator Help &amp; Frequently Asked Questions
            </h2>
            <p className="text-xs text-[#4A5D52] mt-0.5">
              Need guidance on daily data entry limits, task verification, referral bonuses, or UPI/bank withdrawals?
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => onNavigate('faq')}
          className="px-4 py-2.5 rounded-lg border border-[#15803D] text-[#15803D] bg-[#F7FAF7] hover:bg-[#DCFCE7]/50 text-xs font-semibold transition-colors inline-flex items-center gap-2 whitespace-nowrap shrink-0 self-start sm:self-auto"
        >
          <span>Browse Tasks, Earnings &amp; Withdrawal FAQ</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};
