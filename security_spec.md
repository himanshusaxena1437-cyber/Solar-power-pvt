# Security Specification — Solar Power Pvt. Ltd.

## 1. Data Invariants
1. **Identity & Privilege Integrity**: Every user document in `/users/{userId}` must have `uid == request.auth.uid` on creation, `role == 'user'`, `accountStatus == 'active'`, and all financial balances (`totalEarnings`, `taskEarnings`, `referralEarnings`, `totalWithdrawn`, `pendingWithdrawalAmount`, `verifiedPagesCount`) initialized to `0`. Users can never elevate `role`, change `accountStatus`, or directly credit financial balances.
2. **One Account Per User & Mobile Uniqueness**: Firebase Auth enforces one UID/email per Google account, and `/mobileRegistry/{mobile}` enforces one registered mobile number per UID.
3. **No Duplicate Task Submissions**: `/submissions/{submissionId}` requires deterministic IDs formatted as `${request.auth.uid}_${taskId}` and verifies the referenced task exists in `/tasks/{taskId}` and the user's account is `'active'`. Once submitted with `status: 'Pending'`, users cannot edit or re-submit the same task.
4. **Verified-Only Earnings**: Users can never write `status: 'Verified'` or `creditedAmount > 0` on submissions, nor write to `/transactions`. Only verified administrators (`isAdmin()`) can verify submissions, credit `₹5` per page, approve/credit `₹250` referrals, or mark withdrawals `Approved`/`Paid`.
5. **Atomic Withdrawal Reservation**: Creating a `/withdrawals/{withdrawalId}` request requires `amount >= 100`, `status == 'Pending'`, and atomically increments `/users/{uid}.pendingWithdrawalAmount` by the exact withdrawal `amount` (verified via `getAfter()`), bounded by `totalEarnings - totalWithdrawn`.
6. **PII Isolation & Query Enforcement**: `/users/{userId}`, `/submissions/{submissionId}`, `/withdrawals/{withdrawalId}`, `/referrals/{referralId}`, and `/transactions/{txId}` restrict `get` and `list` strictly to the owning `userId` (or `referrerUid`/`referredUid`) or `isAdmin()`, never permitting blanket `isSignedIn()` reads.
7. **Email Verification Gate**: All authenticated writes and admin privilege checks enforce `request.auth.token.email_verified == true`.

## 2. The "Dirty Dozen" Adversarial Payloads
1. **Self-Role Escalation on Signup**: User creates `/users/{uid}` with `role: "admin"` -> **DENIED**.
2. **Balance Injection on Signup**: User creates `/users/{uid}` with `totalEarnings: 50000` -> **DENIED**.
3. **Shadow Field Injection on Profile Update**: User updates `/users/{uid}` with `{ name: "Ravi", totalEarnings: 9999 }` -> **DENIED**.
4. **Unverified Email Admin Spoof**: Token with `email: "himanshusaxena1437@gmail.com"` and `email_verified: false` attempts admin write -> **DENIED**.
5. **Duplicate / Random-ID Submission**: User creates `/submissions/random_id_123` instead of `${uid}_${taskId}` -> **DENIED**.
6. **Pre-Verified Task Submission**: User creates `/submissions/${uid}_${taskId}` with `status: "Verified"` and `creditedAmount: 5` -> **DENIED**.
7. **Orphaned Task Submission**: User submits against non-existent `/tasks/fake_task_999` -> **DENIED**.
8. **Self-Referral Fraud**: User creates `/referrals/{uid}` where `referrerUid == request.auth.uid` -> **DENIED**.
9. **Under-Minimum Withdrawal**: User creates `/withdrawals/w1` with `amount: 50` (< ₹100) -> **DENIED**.
10. **Unbacked / Over-Balance Withdrawal**: User creates `/withdrawals/w2` without atomically incrementing `pendingWithdrawalAmount`, or exceeding `totalEarnings - totalWithdrawn` -> **DENIED**.
11. **PII Blanket Read**: Non-admin user attempts `list` on `/users` or `get` on another user's `/users/{otherUid}` -> **DENIED**.
12. **Resource Poisoning (Oversized ID / String)**: Request uses a 500-character document ID or 10KB string field -> **DENIED**.
