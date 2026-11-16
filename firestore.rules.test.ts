/**
 * Security Rules Verification Suite (Dirty Dozen Adversarial Payloads)
 * References security_spec.md invariants for Solar Power Pvt. Ltd.
 */

export interface SecurityTestCase {
  id: number;
  name: string;
  collection: string;
  expectedResult: 'PERMISSION_DENIED';
  payload: Record<string, unknown>;
  ruleGuard: string;
}

export const dirtyDozenPayloads: SecurityTestCase[] = [
  {
    id: 1,
    name: 'Self-Role Escalation on Signup',
    collection: '/users/user_abc',
    expectedResult: 'PERMISSION_DENIED',
    payload: { uid: 'user_abc', role: 'admin', totalEarnings: 0 },
    ruleGuard: "incoming().role == 'user'",
  },
  {
    id: 2,
    name: 'Balance Injection on Signup',
    collection: '/users/user_abc',
    expectedResult: 'PERMISSION_DENIED',
    payload: { uid: 'user_abc', role: 'user', totalEarnings: 50000 },
    ruleGuard: 'incoming().totalEarnings == 0',
  },
  {
    id: 3,
    name: 'Shadow Field Injection on Profile Update',
    collection: '/users/user_abc',
    expectedResult: 'PERMISSION_DENIED',
    payload: { name: 'Ravi Kumar', isVerified: true, totalEarnings: 9999 },
    ruleGuard: 'isValidUserProfile(incoming()) && affectedKeys().hasOnly(...)',
  },
  {
    id: 4,
    name: 'Unverified Email Admin Spoof',
    collection: '/settings/app',
    expectedResult: 'PERMISSION_DENIED',
    payload: { perPageReward: 500, authToken: { email: 'himanshusaxena1437@gmail.com', email_verified: false } },
    ruleGuard: 'isVerifiedUser() -> request.auth.token.email_verified == true',
  },
  {
    id: 5,
    name: 'Duplicate / Random-ID Submission',
    collection: '/submissions/random_id_123',
    expectedResult: 'PERMISSION_DENIED',
    payload: { userId: 'user_abc', taskId: 'task_001', status: 'Pending' },
    ruleGuard: "submissionId == (request.auth.uid + '_' + incoming().taskId)",
  },
  {
    id: 6,
    name: 'Pre-Verified Task Submission',
    collection: '/submissions/user_abc_task_001',
    expectedResult: 'PERMISSION_DENIED',
    payload: { userId: 'user_abc', taskId: 'task_001', status: 'Verified', creditedAmount: 5 },
    ruleGuard: "incoming().status == 'Pending' && incoming().creditedAmount == 0",
  },
  {
    id: 7,
    name: 'Orphaned Task Submission',
    collection: '/submissions/user_abc_nonexistent',
    expectedResult: 'PERMISSION_DENIED',
    payload: { userId: 'user_abc', taskId: 'nonexistent', status: 'Pending' },
    ruleGuard: 'exists(/databases/$(database)/documents/tasks/$(incoming().taskId))',
  },
  {
    id: 8,
    name: 'Self-Referral Fraud',
    collection: '/referrals/user_abc',
    expectedResult: 'PERMISSION_DENIED',
    payload: { referrerUid: 'user_abc', referredUid: 'user_abc', referralCode: 'SOLAR-SELF' },
    ruleGuard: 'incoming().referrerUid != request.auth.uid',
  },
  {
    id: 9,
    name: 'Under-Minimum Withdrawal',
    collection: '/withdrawals/w_001',
    expectedResult: 'PERMISSION_DENIED',
    payload: { userId: 'user_abc', amount: 50, method: 'UPI' },
    ruleGuard: 'data.amount >= 100',
  },
  {
    id: 10,
    name: 'Unbacked Withdrawal Request',
    collection: '/withdrawals/w_002',
    expectedResult: 'PERMISSION_DENIED',
    payload: { userId: 'user_abc', amount: 500, method: 'UPI', missingBatchUpdate: true },
    ruleGuard: 'hasAtomicWithdrawalReserve(request.auth.uid, incoming().amount)',
  },
  {
    id: 11,
    name: 'PII Blanket Read',
    collection: '/users',
    expectedResult: 'PERMISSION_DENIED',
    payload: { action: 'list', callerRole: 'user' },
    ruleGuard: 'allow list: if isAdmin()',
  },
  {
    id: 12,
    name: 'Resource Poisoning (Oversized ID / String)',
    collection: '/tasks/' + 'x'.repeat(200),
    expectedResult: 'PERMISSION_DENIED',
    payload: { title: 'a'.repeat(500) },
    ruleGuard: 'isValidId(id) && data.title.size() <= 140',
  },
];
