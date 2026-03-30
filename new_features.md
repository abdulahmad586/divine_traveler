# Frontend Integration Guide — Companionships & Notifications

---

## How the system works (big picture)

Every user gets a **username** automatically when they first sign in (derived from their email). They can change it later. Usernames are how users find and interact with each other — not by user ID.

All authenticated requests require a Firebase ID token in the header:
```
Authorization: Bearer <firebase_id_token>
```

Get it in Flutter with:
```dart
final token = await FirebaseAuth.instance.currentUser!.getIdToken();
```

---

## 1. Current User (`/me`)

This is the authenticated user's own data. Fetch it on login and cache it in state.

### Fetch current user
```
GET /me
Auth: required
```
```dart
final response = await http.get(
  Uri.parse('$baseUrl/me'),
  headers: { 'Authorization': 'Bearer $token' },
);
// { id, name, email, username, allowFriendRequests, fcmToken?, createdAt, updatedAt }
```

---

### Change username
```
PATCH /me/username
Auth: required
Body: { "username": "new_name" }
```

Rules: 3–40 chars, lowercase letters/numbers/dots/underscores/hyphens, must start and end with a letter or number.

```dart
final response = await http.patch(
  Uri.parse('$baseUrl/me/username'),
  headers: { 'Authorization': 'Bearer $token', 'Content-Type': 'application/json' },
  body: jsonEncode({ 'username': 'new_name' }),
);

if (response.statusCode == 409) {
  // code: 'USERNAME_TAKEN' — show "This username is already taken"
}
// 200 → updated User object
```

---

### Toggle companion request preference
```
PATCH /me/settings
Auth: required
Body: { "allowFriendRequests": true | false }
```

When `false`, no one can send this user a companion request — your UI should reflect this on the profile screen (hide or disable the "Add Companion" button).

```dart
await http.patch(
  Uri.parse('$baseUrl/me/settings'),
  headers: { 'Authorization': 'Bearer $token', 'Content-Type': 'application/json' },
  body: jsonEncode({ 'allowFriendRequests': false }),
);
// 200 → updated User object
```

---

## 2. Viewing Profiles (`/users/:username`)

This is the public profile page for any user. It's the hub for all relationship actions.

```
GET /users/:username
Auth: optional (include token to get relationship context)
```

**Without auth** — returns name, username, stats only:
```json
{
  "id": "...",
  "name": "Bob",
  "username": "bob",
  "createdAt": { ... },
  "stats": { "totalCompanions": 12, "completedAyahs": 340 }
}
```

**With auth** — also includes `relationship` and, if already companions, their active journeys:
```json
{
  "...",
  "relationship": {
    "isCompanion": false,
    "sentRequest": true,
    "receivedRequest": false,
    "isBlocked": false
  },
  "journeys": [ ]
}
```

> `journeys` is only present when `isCompanion: true`.

Use `relationship` to decide what button to show on the profile screen:

| State | Show |
|---|---|
| `isCompanion: true` | "Remove Companion" |
| `sentRequest: true` | "Request Sent" (disabled/cancel) |
| `receivedRequest: true` | "Accept Request" |
| `isBlocked: true` | "Unblock" |
| none of the above | "Add Companion" (unless target has `allowFriendRequests: false`) |

---

## 3. Companion Requests

### Send a request
```
POST /companions/requests
Auth: required
Body: { "username": "bob" }
```

Two possible success responses:

**`201`** — Request sent, waiting for Bob to accept:
```json
{ "autoAccepted": false, "request": { "id": "req123", "..." } }
```

**`200`** — Bob had already sent you a request, so it auto-accepted and you're now companions immediately:
```json
{ "autoAccepted": true, "companionship": { "id": "ship123", "userIds": ["...", "..."], "..." } }
```

**Errors to handle:**
- `403` — Bob doesn't accept requests, or one of you blocked the other
- `409 ALREADY_COMPANIONS` — Already companions
- `409 REQUEST_ALREADY_SENT` — You already have a pending request to them

```dart
final response = await http.post(
  Uri.parse('$baseUrl/companions/requests'),
  headers: { 'Authorization': 'Bearer $token', 'Content-Type': 'application/json' },
  body: jsonEncode({ 'username': 'bob' }),
);

final body = jsonDecode(response.body);
if (response.statusCode == 200 && body['autoAccepted'] == true) {
  // Instant companions! Show success state
} else if (response.statusCode == 201) {
  // Show "Request sent"
}
```

---

### View incoming requests (notification inbox)
```
GET /companions/requests/incoming
Auth: required
```

Returns requests other people sent to you. Show a badge/count on the notifications tab.

```dart
// Response: array of { id, fromUserId, fromUsername, toUserId, toUsername, createdAt }
```

---

### View outgoing requests
```
GET /companions/requests/outgoing
Auth: required
```

Returns requests you sent that are still pending.

---

### Accept a request
```
POST /companions/requests/:requestId/accept
Auth: required (must be the recipient)
```
```dart
await http.post(
  Uri.parse('$baseUrl/companions/requests/$requestId/accept'),
  headers: { 'Authorization': 'Bearer $token' },
);
// 200 → Companionship object
```

---

### Cancel / reject a request
```
DELETE /companions/requests/:requestId
Auth: required (sender can cancel, recipient can reject)
```
```dart
await http.delete(
  Uri.parse('$baseUrl/companions/requests/$requestId'),
  headers: { 'Authorization': 'Bearer $token' },
);
// 204 → No content
```

---

## 4. Companions List

### Fetch companions
```
GET /companions
Auth: required
```

Returns an array of full User objects (companions' profiles).

---

### Remove a companion
```
DELETE /companions/:companionUserId
Auth: required
```

Note: this takes the **user ID**, not username. You'll have the ID from the companions list or the profile response.

```dart
await http.delete(
  Uri.parse('$baseUrl/companions/$companionUserId'),
  headers: { 'Authorization': 'Bearer $token' },
);
// 204 → No content
```

---

## 5. Blocking

### Block a user
```
POST /blocks
Auth: required
Body: { "username": "spammer" }
```

Blocking automatically removes any existing companionship and cancels any pending requests in either direction. You don't need to do that cleanup manually.

```dart
await http.post(
  Uri.parse('$baseUrl/blocks'),
  headers: { 'Authorization': 'Bearer $token', 'Content-Type': 'application/json' },
  body: jsonEncode({ 'username': 'spammer' }),
);
// 204 → No content
// 409 ALREADY_BLOCKED → already blocked
```

---

### List blocked users
```
GET /blocks
Auth: required
```

Returns `[{ id, blockerUserId, blockedUserId, createdAt }]`. You'll need to look up usernames separately if you want to display them.

---

### Unblock a user
```
DELETE /blocks/:blockedUserId
Auth: required
```

Takes the **user ID** of the blocked person.

---

## 6. Push Notifications (FCM)

### How it works

- The app registers an FCM token with the server on login (and whenever the token refreshes)
- The server sends push notifications for two journey events:
  - **Journey created** → `type: "JOURNEY_CREATED"`
  - **Journey completed** → `type: "JOURNEY_COMPLETED"`
- Both include `journeyId` in the data payload so you can deep-link to the right screen

### Step 1 — Register the token after login
```
PATCH /me/fcm-token
Auth: required
Body: { "fcmToken": "<token>" }
```

```dart
Future<void> registerFcmToken(String idToken) async {
  final fcmToken = await FirebaseMessaging.instance.getToken();
  if (fcmToken == null) return;

  await http.patch(
    Uri.parse('$baseUrl/me/fcm-token'),
    headers: {
      'Authorization': 'Bearer $idToken',
      'Content-Type': 'application/json',
    },
    body: jsonEncode({ 'fcmToken': fcmToken }),
  );
}
```

Call this right after the user signs in:
```dart
final idToken = await user.getIdToken();
await registerFcmToken(idToken);
```

### Step 2 — Re-register when the token refreshes

FCM tokens can change. Listen for refreshes and re-register:
```dart
FirebaseMessaging.instance.onTokenRefresh.listen((newToken) async {
  final idToken = await FirebaseAuth.instance.currentUser?.getIdToken();
  if (idToken != null) await registerFcmToken(idToken);
});
```

### Step 3 — Handle notification taps

When the user taps a notification and opens the app:
```dart
// App opened from a notification
FirebaseMessaging.onMessageOpenedApp.listen((message) {
  final type = message.data['type'];
  final journeyId = message.data['journeyId'];

  if (type == 'JOURNEY_CREATED' || type == 'JOURNEY_COMPLETED') {
    Navigator.pushNamed(context, '/journeys/$journeyId');
  }
});

// App was terminated and opened via a notification
final initialMessage = await FirebaseMessaging.instance.getInitialMessage();
if (initialMessage != null) {
  // Same routing logic as above
}
```

### Step 4 — Request notification permission (iOS)

On iOS, you must request permission before notifications will be delivered:
```dart
await FirebaseMessaging.instance.requestPermission(
  alert: true,
  badge: true,
  sound: true,
);
```

Do this after login, before calling `registerFcmToken`.

---

## Quick Reference — All Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/me` | required | Current user |
| `PATCH` | `/me/username` | required | Change username |
| `PATCH` | `/me/settings` | required | Toggle allowFriendRequests |
| `PATCH` | `/me/fcm-token` | required | Register push token |
| `GET` | `/users/:username` | optional | Public profile + relationship |
| `GET` | `/companions` | required | My companions list |
| `DELETE` | `/companions/:userId` | required | Remove companion |
| `GET` | `/companions/requests/incoming` | required | Requests sent to me |
| `GET` | `/companions/requests/outgoing` | required | Requests I sent |
| `POST` | `/companions/requests` | required | Send request |
| `POST` | `/companions/requests/:id/accept` | required | Accept request |
| `DELETE` | `/companions/requests/:id` | required | Cancel or reject request |
| `GET` | `/blocks` | required | My block list |
| `POST` | `/blocks` | required | Block a user |
| `DELETE` | `/blocks/:userId` | required | Unblock a user |
