import type { Timestamp } from 'firebase/firestore';

export type AccountStatus = 'active' | 'suspended';
export type UserRole = 'user' | 'admin';
export type TaskCategory =
  | 'Verification'
  | 'Reading'
  | 'Correction'
  | 'Inverter Telemetry'
  | 'Customer Billing'
  | 'Panel Inspection'
  | 'Grid Feed-In'
  | 'Subsidy Record';
export type SubmissionStatus = 'Pending' | 'Verified' | 'Rejected';
export type ReferralStatus = 'Pending Eligibility' | 'Eligible' | 'Credited' | 'Rejected';
export type WithdrawalMethod = 'UPI' | 'Bank Transfer';
export type WithdrawalStatus = 'Pending' | 'Approved' | 'Rejected' | 'Paid';
export type TransactionType = 'task_credit' | 'referral_bonus' | 'withdrawal_paid';

export interface AppSettings {
  companyName: string;
  dailyPageLimit: number;
  perPageReward: number;
  referralReward: number;
  referralEligibilityPages: number;
  minWithdrawal: number;
  withdrawalProcessingHours: string;
  taskTimerSeconds?: number;
  updatedAt?: Timestamp;
}

export interface UserProfile {
  uid: string;
  userCode: string;
  name: string;
  email: string;
  mobile: string;
  otpVerified: boolean;
  referralCode: string;
  referredByCode: string;
  referredByUid: string;
  accountStatus: AccountStatus;
  role: UserRole;
  totalEarnings: number;
  taskEarnings: number;
  referralEarnings: number;
  totalWithdrawn: number;
  pendingWithdrawalAmount: number;
  verifiedPagesCount: number;
  savedUpiId?: string;
  savedBankName?: string;
  savedAccountHolder?: string;
  savedAccountNumberMasked?: string;
  savedIfsc?: string;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface DataEntryTask {
  id: string;
  title: string;
  category: TaskCategory;
  pageNumber: number;
  rewardAmount: number;
  isActive: boolean;
  sourceRecordId: string;
  sourceCustomerName: string;
  sourceSiteLocation: string;
  sourceMeterNumber: string;
  sourceKwhReading: string;
  sourceBillingDate: string;
  sourceNotes: string;
  createdBy: string;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface TaskSubmission {
  id: string;
  userId: string;
  userName: string;
  userCode: string;
  taskId: string;
  taskTitle: string;
  taskCategory: string;
  pageNumber: number;
  dateKey: string;
  enteredRecordId: string;
  enteredCustomerName: string;
  enteredSiteLocation: string;
  enteredMeterNumber: string;
  enteredKwhReading: string;
  enteredBillingDate: string;
  rewardAmount: number;
  creditedAmount: number;
  status: SubmissionStatus;
  rejectionReason?: string;
  verifiedBy?: string;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface ReferralRecord {
  id: string;
  referrerUid: string;
  referrerName: string;
  referralCode: string;
  referredUid: string;
  referredName: string;
  referredUserCode: string;
  eligibilityTargetPages: number;
  referredVerifiedPages: number;
  rewardAmount: number;
  status: ReferralStatus;
  adminNotes?: string;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface WithdrawalRequest {
  id: string;
  userId: string;
  userName: string;
  userCode: string;
  amount: number;
  method: WithdrawalMethod;
  upiId?: string;
  accountHolder: string;
  bankName?: string;
  accountNumber?: string;
  ifscCode?: string;
  status: WithdrawalStatus;
  paymentReference?: string;
  rejectionReason?: string;
  processedBy?: string;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface EarningTransaction {
  id: string;
  userId: string;
  type: TransactionType;
  amount: number;
  description: string;
  referenceId: string;
  createdBy: string;
  createdAt?: Timestamp;
}

export interface LeaderboardEntry {
  id: string;
  userId: string;
  userName: string;
  userCode: string;
  monthKey: string;
  approvedCount: number;
  updatedAt?: Timestamp;
}

export interface ToastNotice {
  id: string;
  tone: 'success' | 'error' | 'info';
  title: string;
  detail?: string;
}

export type ActiveTab =
  | 'dashboard'
  | 'work'
  | 'referrals'
  | 'withdrawals'
  | 'profile'
  | 'faq'
  | 'admin';
