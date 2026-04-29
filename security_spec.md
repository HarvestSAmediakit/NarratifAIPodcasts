# Security Spec - Narratif

## Data Invariants
1. A **Publisher** must be owned by the user who created it (`ownerId` == `request.auth.uid`).
2. An **Episode** must belong to a valid `publisherId` and its `ownerId` must match the creator.
3. Users can only update their own Publisher profiles and Episodes.
4. Public access: Anyone can read a Publisher profile if `visibility` is "public". Anyone can read an Episode if `isPublic` is true.
5. Listeners can only see their own following list.
6. Stats (`loads`, `plays`, `completions`) can only be incremented, not decremented or reset, by anyone (or maybe better to restrict to specific logic - but for simplicity, we allow increment).

## The Dirty Dozen Payloads

1. **Identity Spoofing**: Create a publisher with `ownerId` of another user.
2. **Resource Poisoning**: Create an episode with 1MB string as `title`.
3. **Privilege Escalation**: Update another user's publisher profile.
4. **State Shortcutting**: Change an episode status from `draft` to `published` without proper fields.
5. **PII Leak**: Read a private listener's profile without being that user.
6. **Orphaned Write**: Create an episode with a `publisherId` that doesn't exist.
7. **Immutability Breach**: Change `createdAt` on an existing episode.
8. **Shadow Update**: Add a `isVerified: true` field to a publisher profile.
9. **Zero-Trust Bypass**: List all episodes regardless of `isPublic` flag.
10. **Resource Exhaustion**: Send a massive array of 1000 tags.
11. **Timestamp Spoofing**: Provide a `createdAt` from the past instead of `request.time`.
12. **Relational Sync Break**: Delete a publisher but leave episodes orphaned (Rules can't fully prevent this without triggers, but can prevent creating orphaned ones).

## Test Runner (Logic Check)
- `PERMISSION_DENIED` on all unauthorized writes.
- `PERMISSION_DENIED` on reading private visibility publishers.
- `PERMISSION_DENIED` on reading private isPublic=false episodes.
