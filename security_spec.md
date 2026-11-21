# DevMind Studio — Firestore Security Specification (Phase 0)

## 1. Data Invariants

1. **PII Isolation**: Every `/users/{userId}` document contains PII (`email`, `displayName`, `photoURL`) and is strictly restricted to the verified owner (`request.auth.uid == userId && request.auth.token.email_verified == true`). Blanket `isSignedIn()` reads are forbidden.
2. **Master Gate Relational Sync**: Every subcollection document under `/users/{userId}/extensions/{extensionDocId}`, `/users/{userId}/taskRecords/{taskId}`, and `/users/{userId}/savedProjects/{projectId}` requires the parent `/users/{userId}` document to exist via `get()` on single-document operations and `ownerId == request.auth.uid && ownerId == userId`.
3. **Immutable Ownership & Timestamps**: `uid`, `ownerId`, and `createdAt` can never be mutated after creation. `createdAt == request.time` on create and `updatedAt == request.time` on both create and update.
4. **No Secret Storage & No Shadow Fields**: Strict `hasAll` + `hasOnly` allowlists reject any unexpected or shadow keys (such as `role`, `isAdmin`, `apiKey`, `secret`).
5. **Terminal State Locking**: Once a `UserTaskRecord` reaches a terminal status (`completed`, `failed`, or `cancelled`), its `status` field can never be modified back to an active state.
6. **Path ID & Size Hardening**: Every single-document path variable (`userId`, `extensionDocId`, `taskId`, `projectId`) is checked against `isValidId(id)` (`^[a-zA-Z0-9_\-]+$`, max 128 chars), and every string field enforces explicit `.size()` boundaries matching `firebase-blueprint.json`.

## 2. The "Dirty Dozen" Adversarial Payloads (Must Return PERMISSION_DENIED)

1. **Cross-User PII Read**: Authenticated User B performs `get` on `/users/userA`.
2. **Unverified Email Spoof**: Authenticated user with `email_verified: false` attempts `create` on `/users/userA`.
3. **Shadow Privilege Field on Create**: User A attempts `create` on `/users/userA` including ghost field `isAdmin: true` or `role: "admin"`.
4. **Owner Spoofing on Subcollection Create**: User A attempts `create` on `/users/userA/taskRecords/task_1` with `ownerId: "userB"`.
5. **Orphaned Subcollection Write**: User A attempts `create` on `/users/userA/extensions/devmind_ast-core` before `/users/userA` exists (Master Gate violation).
6. **Backdated Timestamp Tampering**: User A attempts `create` on `/users/userA/savedProjects/proj_1` with client-forged `createdAt` not equal to `request.time`.
7. **Immutable Field Overwrite**: User A attempts `update` on `/users/userA` modifying `uid` or `createdAt`.
8. **Value Poisoning on Allowed Key**: User A attempts `update` on `/users/userA` setting `theme: "rainbow_neon"` (outside enum) or `preferredModel` > 120 chars.
9. **Terminal Task State Reversal**: User A attempts `update` on a `UserTaskRecord` whose existing `status == 'completed'` to change `status` back to `'running'`.
10. **Path ID Poisoning**: User A attempts `create` on `/users/userA/taskRecords/<200-char-invalid-id!@#$>`.
11. **Unscoped List Scraping**: User B attempts `list` on `/users/userA/taskRecords` or `/users` root collection.
12. **Ghost Field Shadow Update**: User A attempts `update` on `/users/userA/extensions/devmind_todo` adding `apiKey: "sk-leaked"` alongside `enabled: false`.
