# Journey System — Complete Frontend Guide (Group Update)

---

## What Changed and Why

The journey system has been rebuilt from a solo-only model to a **group-first model**. Every journey now has a **members subcollection** — even solo journeys. This means progress, status, and completion are all tracked **per person**, not on the journey document itself.

---

## Data Model Changes

### Before (old `Journey` object)

```json
{
  "id": "j1",
  "userId": "firebase-uid",
  "title": "Read: Al-Fatiha",
  "status": "active",
  "totalAyahs": 7,
  "completedAyahs": { "1_1": true, "1_2": true },
  "completedCount": 2,
  "dimensions": ["read"],
  "startSurah": 1, "startAyah": 1,
  "endSurah": 1, "endAyah": 7,
  "startDate": { ... },
  "endDate": { ... },
  "createdAt": { ... },
  "updatedAt": { ... }
}
```

### After (new `Journey` object)

```json
{
  "id": "j1",
  "creatorId": "firebase-uid",
  "title": "Read: Al-Fatiha",
  "status": "active",
  "totalAyahs": 7,
  "allowJoining": true,
  "memberIds": ["uid-alice", "uid-bob"],
  "memberCount": 2,
  "dimensions": ["read"],
  "startSurah": 1, "startAyah": 1,
  "endSurah": 1, "endAyah": 7,
  "startDate": { ... },
  "endDate": { ... },
  "createdAt": { ... },
  "updatedAt": { ... }
}
```

**What disappeared:**
- `userId` → replaced by `creatorId`
- `completedAyahs` → moved to each member's document
- `completedCount` → moved to each member's document

**What was added:**
- `creatorId` — who created the journey
- `allowJoining` — whether companions of the creator can join
- `memberIds` — array of all member user IDs (used for querying)
- `memberCount` — denormalized count of members

### New: `JourneyMember` object

Every person in a journey (including the creator) has their own member document. This is what's returned inside the `members` array on every journey response.

```json
{
  "userId": "firebase-uid",
  "status": "active",
  "completedAyahs": { "1_1": true, "1_2": true },
  "completedCount": 2,
  "joinedAt": { ... },
  "updatedAt": { ... }
}
```

`status` here is the **individual** status for that person. It can be different from the journey's top-level `status`, which is the **aggregate**.

### New: `JourneyDetail` — what every endpoint returns

All journey endpoints now return a `JourneyDetail` object — which is the `Journey` fields plus the full `members` array:

```json
{
  "id": "j1",
  "creatorId": "uid-alice",
  "title": "Read: Al-Fatiha",
  "status": "active",
  "totalAyahs": 7,
  "allowJoining": true,
  "memberIds": ["uid-alice", "uid-bob"],
  "memberCount": 2,
  "dimensions": ["read"],
  "startSurah": 1, "startAyah": 1,
  "endSurah": 1, "endAyah": 7,
  "startDate": { ... },
  "endDate": { ... },
  "createdAt": { ... },
  "updatedAt": { ... },
  "members": [
    {
      "userId": "uid-alice",
      "status": "active",
      "completedAyahs": { "1_1": true, "1_2": true },
      "completedCount": 2,
      "joinedAt": { ... },
      "updatedAt": { ... }
    },
    {
      "userId": "uid-bob",
      "status": "paused",
      "completedAyahs": { "1_1": true },
      "completedCount": 1,
      "joinedAt": { ... },
      "updatedAt": { ... }
    }
  ]
}
```

> **Important:** `completedAyahs` and `completedCount` are on the **member**, not the journey. When you want to show the current user's progress, find their entry in `members` by matching `userId`.

---

## How the Status System Works

### Individual vs Aggregate

Every member has their **own status** (`member.status`). The journey's top-level `status` is the **aggregate** — computed automatically from all members using this rule:

> The journey reflects the **most active** status among all members.

Priority order (highest to lowest):

| Priority | Status | Meaning |
|---|---|---|
| 5 | `active` | At least one member is actively progressing |
| 4 | `delayed` | No one is active, but someone is delayed past deadline |
| 3 | `paused` | Everyone is paused |
| 2 | `completed` | Everyone has completed their journey |
| 1 | `abandoned` | Everyone has abandoned |

**Examples:**

| Member statuses | Aggregate |
|---|---|
| `[active, paused, completed]` | `active` |
| `[delayed, paused]` | `delayed` |
| `[paused, paused, paused]` | `paused` |
| `[completed, completed]` | `completed` |
| `[abandoned, abandoned]` | `abandoned` |
| `[completed, abandoned]` | `completed` (completed beats abandoned) |

### What this means for your UI

- **Use `member.status`** when showing a user their own journey status (e.g. "your progress is paused")
- **Use `journey.status`** when showing a group journey card in a list — it represents the overall health of the journey
- A user can have individually `completed` their journey while the group journey is still `active` (others are still going). Don't hide the journey from them — show it with their completed badge

### Status transitions

Each member controls **only their own status**. Allowed manual transitions:

| From | To | Action |
|---|---|---|
| `active` | `paused` | User pauses |
| `delayed` | `paused` | User pauses a delayed journey |
| `paused` | `active` | User resumes |
| `active` or `paused` or `delayed` | `abandoned` | User abandons |

`completed` and `delayed` are **system-managed** — they cannot be manually set:
- `completed` is set automatically when `completedCount` reaches `totalAyahs`
- `delayed` is set lazily when the `endDate` passes and the member is still `active` or `paused`

---

## How Progress Works

Progress is **per-member** and **non-linear**. Each member tracks their own `completedAyahs` map.

When you call the progress endpoint, it only updates **your own** member document. Other members' progress is completely unaffected.

Marking progress on a paused journey **auto-resumes** it to `active` (or `delayed` if past deadline).

When your `completedCount` reaches `totalAyahs`, your status automatically becomes `completed`. This triggers:
1. Your member document status → `completed`
2. The aggregate journey status recomputed (may or may not change depending on others)
3. A push notification sent to you: *"A journey fulfilled"*

---

## How Group Journeys Work

### Creating a group journey

Add `allowJoining: true` to the create request. This is the only difference from creating a solo journey.

```dart
final response = await http.post(
  Uri.parse('$baseUrl/journeys'),
  headers: { 'Authorization': 'Bearer $token', 'Content-Type': 'application/json' },
  body: jsonEncode({
    'dimensions': ['read'],
    'startSurah': 1, 'startAyah': 1,
    'endSurah': 2, 'endAyah': 286,
    'startDate': '2026-04-01T00:00:00Z',
    'endDate': '2026-05-01T00:00:00Z',
    'allowJoining': true,
  }),
);
```

The creator is automatically the first member. Their member document is created with `status: active`, `completedAyahs: {}`, `completedCount: 0`.

### Who can join

Only people who are **companions of the creator** can join. Not companions of other members — specifically the creator. And `allowJoining` must be `true` on the journey at the time of joining.

### Joining a journey

```dart
final response = await http.post(
  Uri.parse('$baseUrl/journeys/$journeyId/join'),
  headers: { 'Authorization': 'Bearer $token' },
);
// Returns: JourneyDetail with members array updated
```

**Errors:**

| HTTP | Code | Meaning |
|---|---|---|
| `403` | — | Journey not open for joining, or you're not a companion of the creator |
| `409` | `ALREADY_MEMBER` | You're already in this journey |
| `409` | `MAX_ACTIVE_JOURNEYS` | Joining counts toward your 5-journey cap |

> Joining **counts toward the 5 active journey cap**. The design is intentional — encourage focus over breadth.

### Late joiners start fresh

If someone joins a journey that has been running for weeks, they start at zero. Everyone else's progress is completely unaffected. The late joiner's `completedAyahs: {}` and `completedCount: 0`.

### Leaving a journey

```dart
await http.delete(
  Uri.parse('$baseUrl/journeys/$journeyId/leave'),
  headers: { 'Authorization': 'Bearer $token' },
);
// 204 No content
```

- All of the leaving member's progress is **permanently deleted**
- Remaining members are notified with a push notification
- The leaving member also receives a notification
- The aggregate status is recomputed — if they were the only active member and others are paused, the journey may become `paused`
- The creator **can** leave their own journey — it continues without an owner after that

### Creator removing a member

```dart
await http.delete(
  Uri.parse('$baseUrl/journeys/$journeyId/members/$memberId'),
  headers: { 'Authorization': 'Bearer $token' },
);
// Returns: updated JourneyDetail
```

- Only the creator can call this
- The removed person's progress is permanently deleted
- The removed person receives a notification
- Remaining members receive a notification
- Creator cannot remove themselves with this endpoint — they must use `leave` instead

### Closing a journey to new joiners

```dart
await http.patch(
  Uri.parse('$baseUrl/journeys/$journeyId/settings'),
  headers: { 'Authorization': 'Bearer $token', 'Content-Type': 'application/json' },
  body: jsonEncode({ 'allowJoining': false }),
);
// Returns: updated JourneyDetail
```

Only the creator can update settings. This simply flips the `allowJoining` flag.

### Nudging a member

Any member can nudge any other member — including the creator.

```dart
await http.post(
  Uri.parse('$baseUrl/journeys/$journeyId/members/$memberId/nudge'),
  headers: { 'Authorization': 'Bearer $token' },
);
// 204 No content
```

The target receives a push notification: *"[Your name] calls you back to the path"*. Nothing else happens — it's purely a notification trigger.

---

## Endpoints — Full Reference

### Unchanged endpoints (behavior updated, same URL)

| Method | Path | What changed |
|---|---|---|
| `POST /journeys` | Create journey | Add `allowJoining` field; returns `JourneyDetail` instead of `Journey` |
| `GET /journeys` | My journeys | Now returns journeys I'm a **member of** (not just ones I created); returns `JourneyDetail[]` |
| `GET /journeys/:id` | Get journey | Returns `JourneyDetail` with full `members` array |
| `POST /journeys/:id/progress` | Update progress | Updates **your** member document only; others unaffected |
| `PATCH /journeys/:id/status` | Update status | Updates **your** member status; recomputes aggregate |
| `GET /users/:userId/journeys` | Someone's journeys | Returns `JourneyDetail[]` — journeys they're a member of |

### New endpoints

| Method | Path | Auth | Purpose |
|---|---|---|---|
| `POST` | `/journeys/:id/join` | required | Join a group journey (must be companion of creator) |
| `DELETE` | `/journeys/:id/leave` | required | Leave a journey (any member, including creator) |
| `DELETE` | `/journeys/:id/members/:memberId` | required | Creator removes a member |
| `POST` | `/journeys/:id/members/:memberId/nudge` | required | Nudge a member to continue |
| `PATCH` | `/journeys/:id/settings` | required | Creator toggles `allowJoining` |

### Removed/obsolete

Nothing was removed. All old endpoint URLs still work. The response shapes changed (see above).

---

## Finding Your Own Progress

Since `completedAyahs` and `completedCount` are now on the member, not the journey, here's the pattern:

```dart
final myUserId = FirebaseAuth.instance.currentUser!.uid;

// After fetching a journey:
final journey = /* decoded JourneyDetail */;
final myMember = (journey['members'] as List)
  .firstWhere((m) => m['userId'] == myUserId, orElse: () => null);

final myProgress = myMember?['completedCount'] ?? 0;
final myStatus = myMember?['status'] ?? 'unknown';
final myCompletedAyahs = myMember?['completedAyahs'] ?? {};
```

---

## Push Notifications — New Events

In addition to the existing `JOURNEY_CREATED` and `JOURNEY_COMPLETED` notifications, the group system adds:

| `type` value | Who receives it | When |
|---|---|---|
| `MEMBER_JOINED` | All existing members (not the joiner) | Someone joins the journey |
| `MEMBER_LEFT` | All remaining members + the leaver | Someone leaves voluntarily |
| `MEMBER_REMOVED` | The removed person + remaining members | Creator removes someone |
| `NUDGE` | The nudged member only | Any member nudges another |

All notifications include `{ journeyId, type }` in the data payload.

### Handling new notification types

```dart
FirebaseMessaging.onMessageOpenedApp.listen((message) {
  final type = message.data['type'];
  final journeyId = message.data['journeyId'];

  switch (type) {
    case 'JOURNEY_CREATED':
    case 'JOURNEY_COMPLETED':
    case 'MEMBER_JOINED':
    case 'MEMBER_LEFT':
    case 'MEMBER_REMOVED':
    case 'NUDGE':
      // All of these deep-link to the journey detail screen
      Navigator.pushNamed(context, '/journeys/$journeyId');
      break;
  }
});
```

---

## UI Considerations

### Journey list card

Each card in the journey list now needs to show:
- **Your own progress** — read from `members` array (find your userId)
- **Member count** — `journey.memberCount`
- **Group indicator** — if `memberCount > 1` or `allowJoining == true`, show a group badge
- **Aggregate status** — `journey.status` (reflects the whole group)
- **Your status** — `myMember.status` (may differ from aggregate)

### Journey detail screen

For the full detail view:
- Show **your progress bar** from your member document
- Show **companions' progress** from their member documents
- For each companion's progress ring/bar, use `member.completedCount / journey.totalAyahs`
- Show a **nudge button** next to each companion (not yourself)
- If you are the creator, show a **remove member** button
- If `allowJoining`, show an **"Open to companions"** indicator; show a toggle to close it (creator only)
- If you have not joined yet and you're a companion of the creator and `allowJoining` is true, show a **Join** button

### Profile screen

The `GET /users/:username` response's `journeys` field (shown to companions) now returns `JourneyDetail[]` — full member maps included. You can show the user's progress on each active journey using the same member-lookup pattern.

### Checking if a journey is yours

Old code checked `journey.userId === myUserId`. Update this to `journey.creatorId === myUserId`.

### The 5-journey cap

The cap now counts **active memberships**, not created journeys. A user who joined 4 journeys and created 1 has hit the cap. Display this correctly in the UI — "You are in 5 active journeys" rather than "You have created 5 journeys".

---

## Quick Cheat Sheet

```dart
// Am I a member of this journey?
final isMember = (journey['memberIds'] as List).contains(myUserId);

// Am I the creator?
final isCreator = journey['creatorId'] == myUserId;

// My personal progress
final me = (journey['members'] as List)
  .firstWhere((m) => m['userId'] == myUserId, orElse: () => null);

// Is this journey open for me to join?
// (requires knowing if I'm a companion of the creator — check profile relationship)
final canJoin = journey['allowJoining'] == true && !isMember;

// Overall journey health (group status)
final groupStatus = journey['status'];

// My individual status
final myStatus = me?['status'];

// Should I show a nudge button for a given member?
final canNudge = isMember && member['userId'] != myUserId;

// Can I remove this member?
final canRemove = isCreator && member['userId'] != myUserId;

// Can I toggle allowJoining?
final canEditSettings = isCreator;
```
