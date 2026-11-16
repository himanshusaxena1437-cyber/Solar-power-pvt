import React, { useMemo, useState } from 'react';
import { collection, doc, serverTimestamp, writeBatch } from 'firebase/firestore';
import {
  Building2,
  CheckCircle2,
  Clock,
  ShieldCheck,
  Smartphone,
  Wallet,
  XCircle,
} from 'lucide-react';
import { db, handleFirestoreError, OperationType } from '../firebase';
import type {
  AppSettings,
  UserProfile,
  WithdrawalMethod,
  WithdrawalRequest,
  WithdrawalStatus,
} from '../types';
import { formatINR, formatTimestamp, maskAccountNumber } from '../utils/solarData';

interface WithdrawalViewProps {
  profile: UserProfile;
  settings: AppSettings;
  withdrawals: WithdrawalRequest[];
  onNotify: (tone: 'success' | 'error' | 'info', title: string, detail?: string) => void;
}

export const WithdrawalView: React.FC<WithdrawalViewProps> = ({
  profile,
  settings,
  withdrawals,
  onNotify,
}) => {
  const availableBalance = Math.max(
    0,
    profile.totalEarnings - profile.totalWithdrawn - profile.pendingWithdrawalAmount
  );

  const [method, setMethod] = useState<WithdrawalMethod>('UPI');
  const [amountInput, setAmountInput] = useState<string>('');
  const [upiId, setUpiId] = useState<string>(profile.savedUpiId || '');
  const [accountHolder, setAccountHolder] = useState<string>(
    profile.savedAccountHolder || profile.name
  );
  const [bankName, setBankName] = useState<string>(profile.savedBankName || '');
  const [accountNumber, setAccountNumber] = useState<string>('');
  const [ifscCode, setIfscCode] = useState<string>(profile.savedIfsc || '');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<'All' | WithdrawalStatus>('All');

  const filteredWithdrawals = useMemo(() => {
    if (statusFilter === 'All') return withdrawals;
    return withdrawals.filter((w) => w.status === statusFilter);
  }, [withdrawals, statusFilter]);

  const handleRequestWithdrawal = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (profile.accountStatus !== 'active') {
      setFormError('Your account is suspended. Withdrawals are temporarily disabled.');
      return;
    }

    const amount = Number(amountInput);
    if (!Number.isFinite(amount) || amount < settings.minWithdrawal) {
      setFormError(`Minimum withdrawal amount is ${formatINR(settings.minWithdrawal)}.`);
      return;
    }
    if (amount > availableBalance) {
      setFormError(
        `Insufficient available balance. Maximum withdrawable amount is ${formatINR(availableBalance)}.`
      );
      return;
    }

    const cleanHolder = accountHolder.trim();
    if (cleanHolder.length < 2) {
      setFormError('Please enter the account holder name.');
      return;
    }

    if (method === 'UPI') {
      const cleanUpi = upiId.trim();
      if (!cleanUpi.includes('@') || cleanUpi.length < 5) {
        setFormError('Please enter a valid UPI ID (e.g. name@oksbi).');
        return;
      }
    } else {
      if (bankName.trim().length < 2) {
        setFormError('Please enter your bank name.');
        return;
      }
      if (accountNumber.replace(/\s+/g, '').length < 8) {
        setFormError('Please enter a valid bank account number.');
        return;
      }
      if (ifscCode.trim().length < 8) {
        setFormError('Please enter a valid 11-character IFSC code.');
        return;
      }
    }

    setSubmitting(true);
    const withdrawalRef = doc(collection(db, 'withdrawals'));
    try {
      const batch = writeBatch(db);
      const maskedAcc =
        method === 'Bank Transfer' ? maskAccountNumber(accountNumber) : '';

      batch.set(withdrawalRef, {
        userId: profile.uid,
        userName: profile.name,
        userCode: profile.userCode,
        amount,
        method,
        upiId: method === 'UPI' ? upiId.trim() : '',
        accountHolder: cleanHolder,
        bankName: method === 'Bank Transfer' ? bankName.trim() : '',
        accountNumber: method === 'Bank Transfer' ? maskedAcc : '',
        ifscCode: method === 'Bank Transfer' ? ifscCode.trim().toUpperCase() : '',
        status: 'Pending',
        paymentReference: '',
        rejectionReason: '',
        processedBy: '',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      batch.update(doc(db, 'users', profile.uid), {
        pendingWithdrawalAmount: profile.pendingWithdrawalAmount + amount,
        updatedAt: serverTimestamp(),
      });

      await batch.commit();
      setAmountInput('');
      setAccountNumber('');
      onNotify(
        'success',
        'Withdrawal Request Submitted',
        `${formatINR(amount)} via ${method} is pending administrator approval.`
      );
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `withdrawals/${withdrawalRef.id}`);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Balance Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white border border-[#DCE6DE] rounded-xl p-5">
          <p className="text-xs font-medium text-[#4A5D52]">Available to Withdraw</p>
          <p className="font-mono text-2xl font-bold text-[#15803D] mt-1.5 tabular-nums">
            {formatINR(availableBalance)}
          </p>
          <p className="text-xs text-[#4A5D52] mt-1">
            Minimum: {formatINR(settings.minWithdrawal)}
          </p>
        </div>

        <div className="bg-white border border-[#DCE6DE] rounded-xl p-5">
          <p className="text-xs font-medium text-[#4A5D52]">Pending Approval / Payout</p>
          <p className="font-mono text-2xl font-bold text-[#CA8A04] mt-1.5 tabular-nums">
            {formatINR(profile.pendingWithdrawalAmount)}
          </p>
          <p className="text-xs text-[#4A5D52] mt-1">Reserved awaiting settlement</p>
        </div>

        <div className="bg-white border border-[#DCE6DE] rounded-xl p-5">
          <p className="text-xs font-medium text-[#4A5D52]">Total Paid Withdrawals</p>
          <p className="font-mono text-2xl font-bold text-[#0F1F16] mt-1.5 tabular-nums">
            {formatINR(profile.totalWithdrawn)}
          </p>
          <p className="text-xs text-[#4A5D52] mt-1">Settled to your accounts</p>
        </div>
      </div>

      {/* Request Form + Clear Rules */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-7 bg-white border border-[#DCE6DE] rounded-xl p-6 space-y-5">
          <div>
            <h1 className="font-display text-lg font-bold text-[#0F1F16]">
              Request Withdrawal
            </h1>
            <p className="text-xs text-[#4A5D52] mt-0.5">
              Choose UPI or Bank Transfer. All payouts require admin verification before settlement.
            </p>
          </div>

          {formError && (
            <div className="p-3.5 rounded-lg bg-red-50 border border-red-200 text-xs text-red-800">
              {formError}
            </div>
          )}

          <div className="flex items-center gap-1 p-1 bg-[#F0F5F1] rounded-lg w-fit">
            <button
              type="button"
              onClick={() => setMethod('UPI')}
              className={`px-4 py-2 text-xs font-semibold rounded-md transition-colors inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 ${
                method === 'UPI'
                  ? 'bg-white text-[#0F1F16] shadow-xs'
                  : 'text-[#4A5D52] hover:text-[#0F1F16]'
              }`}
            >
              <Smartphone className="w-3.5 h-3.5 text-[#15803D]" />
              UPI Transfer
            </button>
            <button
              type="button"
              onClick={() => setMethod('Bank Transfer')}
              className={`px-4 py-2 text-xs font-semibold rounded-md transition-colors inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 ${
                method === 'Bank Transfer'
                  ? 'bg-white text-[#0F1F16] shadow-xs'
                  : 'text-[#4A5D52] hover:text-[#0F1F16]'
              }`}
            >
              <Building2 className="w-3.5 h-3.5 text-[#15803D]" />
              Bank Transfer
            </button>
          </div>

          <form onSubmit={handleRequestWithdrawal} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-[#4A5D52] mb-1">
                  Withdrawal Amount (₹)
                </label>
                <input
                  type="number"
                  min={settings.minWithdrawal}
                  step="1"
                  required
                  value={amountInput}
                  onChange={(e) => setAmountInput(e.target.value)}
                  placeholder={`Min ${settings.minWithdrawal}`}
                  className="w-full px-3.5 py-2.5 text-sm font-mono bg-[#F7FAF7] border border-[#DCE6DE] rounded-lg focus:outline-none focus:border-[#15803D]"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#4A5D52] mb-1">
                  Account Holder Name
                </label>
                <input
                  type="text"
                  required
                  value={accountHolder}
                  onChange={(e) => setAccountHolder(e.target.value)}
                  placeholder="Full name on bank / UPI"
                  className="w-full px-3.5 py-2.5 text-sm bg-[#F7FAF7] border border-[#DCE6DE] rounded-lg focus:outline-none focus:border-[#15803D]"
                />
              </div>
            </div>

            {method === 'UPI' ? (
              <div>
                <label className="block text-xs font-medium text-[#4A5D52] mb-1">
                  UPI ID
                </label>
                <input
                  type="text"
                  required
                  value={upiId}
                  onChange={(e) => setUpiId(e.target.value)}
                  placeholder="e.g. operator@okhdfcbank"
                  className="w-full px-3.5 py-2.5 text-sm font-mono bg-[#F7FAF7] border border-[#DCE6DE] rounded-lg focus:outline-none focus:border-[#15803D]"
                />
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-medium text-[#4A5D52] mb-1">
                    Bank Name
                  </label>
                  <input
                    type="text"
                    required
                    value={bankName}
                    onChange={(e) => setBankName(e.target.value)}
                    placeholder="e.g. State Bank of India"
                    className="w-full px-3.5 py-2.5 text-sm bg-[#F7FAF7] border border-[#DCE6DE] rounded-lg focus:outline-none focus:border-[#15803D]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#4A5D52] mb-1">
                    Account Number
                  </label>
                  <input
                    type="text"
                    required
                    value={accountNumber}
                    onChange={(e) => setAccountNumber(e.target.value.replace(/\D/g, ''))}
                    placeholder="Enter account number"
                    className="w-full px-3.5 py-2.5 text-sm font-mono bg-[#F7FAF7] border border-[#DCE6DE] rounded-lg focus:outline-none focus:border-[#15803D]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#4A5D52] mb-1">
                    IFSC Code
                  </label>
                  <input
                    type="text"
                    required
                    maxLength={11}
                    value={ifscCode}
                    onChange={(e) => setIfscCode(e.target.value.toUpperCase())}
                    placeholder="SBIN0001234"
                    className="w-full px-3.5 py-2.5 text-sm font-mono uppercase bg-[#F7FAF7] border border-[#DCE6DE] rounded-lg focus:outline-none focus:border-[#15803D]"
                  />
                </div>
              </div>
            )}

            <button
              type="submit"
              disabled={submitting || availableBalance < settings.minWithdrawal}
              className="px-5 py-2.5 rounded-lg bg-[#15803D] text-white text-sm font-semibold hover:bg-[#166534] transition-colors disabled:opacity-50 inline-flex items-center gap-2 whitespace-nowrap shrink-0"
            >
              <Wallet className="w-4 h-4" />
              <span>{submitting ? 'Submitting Request...' : 'Submit Withdrawal Request'}</span>
            </button>
          </form>
        </div>

        <div className="lg:col-span-5 bg-white border border-[#DCE6DE] rounded-xl p-6 space-y-4">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-[#15803D]" />
            <h2 className="font-display text-lg font-semibold text-[#0F1F16]">
              Withdrawal Rules &amp; Settlement
            </h2>
          </div>

          <div className="divide-y divide-[#EEF3EF] text-sm">
            <div className="py-3 flex items-center justify-between gap-4">
              <span className="text-[#4A5D52]">Minimum Withdrawal</span>
              <span className="font-mono font-semibold text-[#0F1F16] tabular-nums">
                {formatINR(settings.minWithdrawal)}
              </span>
            </div>
            <div className="py-3 flex items-center justify-between gap-4">
              <span className="text-[#4A5D52]">Supported Methods</span>
              <span className="font-medium text-[#0F1F16]">UPI &amp; Bank Transfer</span>
            </div>
            <div className="py-3 flex items-center justify-between gap-4">
              <span className="text-[#4A5D52]">Processing Time</span>
              <span className="font-medium text-[#0F1F16] text-right">
                {settings.withdrawalProcessingHours}
              </span>
            </div>
            <div className="py-3 flex items-center justify-between gap-4">
              <span className="text-[#4A5D52]">Approval Gate</span>
              <span className="font-medium text-[#15803D]">Mandatory Admin Review</span>
            </div>
          </div>

          <p className="text-xs text-[#4A5D52] leading-relaxed pt-1">
            When you submit a payout request, funds move to Pending Approval. If a request is
            rejected by an administrator, the full requested amount is immediately restored to your
            available withdrawal balance. Account numbers are stored masked for operator protection.
          </p>
        </div>
      </div>

      {/* Withdrawal History */}
      <div className="bg-white border border-[#DCE6DE] rounded-xl p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <h2 className="font-display text-lg font-semibold text-[#0F1F16]">
            Withdrawal History
          </h2>
          <div className="flex flex-wrap items-center gap-1 p-1 bg-[#F0F5F1] rounded-lg w-fit">
            {(['All', 'Pending', 'Approved', 'Paid', 'Rejected'] as const).map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setStatusFilter(tab)}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                  statusFilter === tab
                    ? 'bg-white text-[#0F1F16] shadow-xs'
                    : 'text-[#4A5D52] hover:text-[#0F1F16]'
                }`}
              >
                {tab}
              </button>
            ))}
          </div>
        </div>

        {filteredWithdrawals.length === 0 ? (
          <div className="py-10 text-center text-sm text-[#4A5D52]">
            No withdrawal requests found for this filter.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="border-b border-[#DCE6DE] text-xs font-medium text-[#4A5D52]">
                  <th className="py-2.5 pr-4">Date</th>
                  <th className="py-2.5 px-4">Method &amp; Destination</th>
                  <th className="py-2.5 px-4">Reference / Note</th>
                  <th className="py-2.5 px-4">Status</th>
                  <th className="py-2.5 pl-4 text-right">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#EEF3EF]">
                {filteredWithdrawals.map((w) => (
                  <tr key={w.id} className="hover:bg-[#F7FAF7]">
                    <td className="py-3 pr-4 font-mono text-xs text-[#4A5D52] whitespace-nowrap">
                      {formatTimestamp(w.createdAt)}
                    </td>
                    <td className="py-3 px-4">
                      <p className="font-medium text-[#0F1F16]">{w.method}</p>
                      <p className="text-xs font-mono text-[#4A5D52]">
                        {w.method === 'UPI'
                          ? w.upiId
                          : `${w.bankName} · ${w.accountNumber} · ${w.ifscCode}`}
                      </p>
                    </td>
                    <td className="py-3 px-4 text-xs text-[#4A5D52]">
                      {w.paymentReference ? (
                        <span className="font-mono text-[#0F1F16]">UTR: {w.paymentReference}</span>
                      ) : w.rejectionReason ? (
                        <span className="text-[#DC2626]">{w.rejectionReason}</span>
                      ) : (
                        <span>Awaiting processing</span>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      {w.status === 'Paid' && (
                        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#15803D]">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          Paid
                        </span>
                      )}
                      {w.status === 'Approved' && (
                        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#15803D]">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          Approved
                        </span>
                      )}
                      {w.status === 'Pending' && (
                        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#CA8A04]">
                          <Clock className="w-3.5 h-3.5" />
                          Pending
                        </span>
                      )}
                      {w.status === 'Rejected' && (
                        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#DC2626]">
                          <XCircle className="w-3.5 h-3.5" />
                          Rejected
                        </span>
                      )}
                    </td>
                    <td className="py-3 pl-4 text-right font-mono font-semibold tabular-nums text-[#0F1F16]">
                      {formatINR(w.amount)}
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
