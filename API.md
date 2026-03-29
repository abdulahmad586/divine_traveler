# Divine Traveler — API Reference

## Base URL

```
http://localhost:3000        # development
https://<your-cloud-run-url> # production
```

---

## Authentication

Most write endpoints require a Firebase ID token. Obtain it from the Firebase Auth SDK after Google Sign-In, then include it in every authenticated request:

```
Authorization: Bearer <firebase_id_token>
```

The token is verified server-side on every request. If missing or expired, the server returns `401`.

---

## Error Format

All errors follow this shape:

```json
{
  "error": "Human-readable message",
  "code": "MACHINE_READABLE_CODE"
}
```

| HTTP | Code | Meaning |
|------|------|---------|
| 400 | `VALIDATION_ERROR` | Missing or invalid field in request body or query |
| 401 | `UNAUTHORIZED` | Missing, invalid, or expired Firebase token |
| 403 | `FORBIDDEN` | Authenticated but not allowed (e.g. deleting another user's contribution) |
| 404 | `NOT_FOUND` | Resource does not exist |
| 409 | `DUPLICATE_HASH` | An identical audio file has already been submitted |
| 409 | `DUPLICATE_RECITER_SURAH` | This reciter already has a contribution for this surah — re-submit with `force: true` to override |
| 500 | `INTERNAL_ERROR` | Unexpected server error |

---

## Endpoints

### Health Check

#### `GET /health`

No auth required.

**Response `200`**
```json
{
  "status": "ok",
  "timestamp": "2026-03-28T18:00:00.000Z"
}
```

---

### Contributions

#### `POST /contributions` — Submit a contribution

**Auth required.**

**Request body**
```json
{
  "reciterName": "Sheikh Sudais",
  "surah": 1,
  "audioFileId": "1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs",
  "timingFileId": "1EiMVs0XRA5nFMdKvBdBZjgmUUqptlbs",
  "audioHash": "sha256:<hash-of-audio-file>",
  "force": false
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `reciterName` | string | yes | Non-empty display name of the reciter |
| `surah` | integer | yes | Surah number, 1–114 |
| `audioFileId` | string | yes | Google Drive file ID of the audio file |
| `timingFileId` | string | yes | Google Drive file ID of the timing JSON |
| `audioHash` | string | yes | Hash of the audio file for duplicate detection |
| `force` | boolean | no | Default `false`. Set to `true` to bypass the reciter+surah soft duplicate check |

**Response `201`** — Contribution created
```json
{
  "id": "abc123",
  "reciterName": "Sheikh Sudais",
  "surah": 1,
  "audioFileId": "1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs",
  "timingFileId": "1EiMVs0XRA5nFMdKvBdBZjgmUUqptlbs",
  "audioHash": "sha256:abc...",
  "createdBy": "firebase-uid-of-submitter",
  "createdAt": { "_seconds": 1743184800, "_nanoseconds": 0 },
  "status": "pending",
  "downloads": 0,
  "likes": 0
}
```

**Duplicate handling flow**

```
Submit
  │
  ├─ audioHash already exists? → 409 DUPLICATE_HASH (hard block, no override)
  │
  ├─ reciterName + surah already exists AND force=false? → 409 DUPLICATE_RECITER_SURAH
  │     └─ Show user: "You already have a submission for this surah. Submit anyway?"
  │           └─ Re-submit with force=true → proceeds
  │
  └─ No duplicates → 201 Created
```

---

#### `GET /contributions?surah=<number>` — List contributions for a surah

No auth required.

**Query params**

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `surah` | integer | yes | Surah number, 1–114 |

**Response `200`**
```json
[
  {
    "id": "abc123",
    "reciterName": "Sheikh Sudais",
    "surah": 1,
    "audioFileId": "1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs",
    "timingFileId": "1EiMVs0XRA5nFMdKvBdBZjgmUUqptlbs",
    "audioHash": "sha256:abc...",
    "createdBy": "firebase-uid",
    "createdAt": { "_seconds": 1743184800, "_nanoseconds": 0 },
    "status": "approved",
    "downloads": 42,
    "likes": 17
  }
]
```

> Returns only `approved` contributions, sorted by `createdAt` descending (newest first). Returns `[]` if none exist.

---

#### `GET /contributions/:id` — Get a single contribution

No auth required.

**Response `200`** — same shape as a single item from the list above.

**Response `404`**
```json
{ "error": "Contribution <id> not found", "code": "NOT_FOUND" }
```

---

#### `POST /contributions/:id/like` — Like a contribution

**Auth required.**

Increments the `likes` counter by 1. No body required.

**Response `204`** — No content.

---

#### `POST /contributions/:id/download` — Record a download

**Auth required.**

Call this when the user downloads the audio file. Increments the `downloads` counter by 1. No body required.

**Response `204`** — No content.

---

#### `DELETE /contributions/:id` — Delete a contribution

**Auth required.** Only the original submitter can delete their own contribution.

**Response `204`** — No content.

**Response `403`**
```json
{ "error": "You can only delete your own contributions", "code": "FORBIDDEN" }
```

---

## File Access

Files are stored on the submitter's Google Drive. To construct a download URL from a `fileId`:

```
https://drive.google.com/uc?id=<fileId>&export=download
```

> These links may break if the user deletes the file or changes its sharing permissions. Always handle download failures gracefully on the client.

---

## Contribution Statuses

| Status | Meaning |
|--------|---------|
| `pending` | Newly submitted, awaiting review |
| `approved` | Visible in listings |
| `rejected` | Hidden from listings |
| `broken` | File is no longer accessible on Google Drive |

The `GET /contributions` list only returns `approved` contributions.

---

## Typical Flutter Usage

### Submit a contribution
```dart
final token = await FirebaseAuth.instance.currentUser!.getIdToken();

final response = await http.post(
  Uri.parse('$baseUrl/contributions'),
  headers: {
    'Authorization': 'Bearer $token',
    'Content-Type': 'application/json',
  },
  body: jsonEncode({
    'reciterName': reciterName,
    'surah': surahNumber,
    'audioFileId': audioFileId,
    'timingFileId': timingFileId,
    'audioHash': audioHash,
  }),
);

if (response.statusCode == 409) {
  final body = jsonDecode(response.body);
  if (body['code'] == 'DUPLICATE_RECITER_SURAH') {
    // Prompt user: "You already submitted this surah. Submit anyway?"
    // If yes, re-POST with force: true
  }
}
```

### Fetch contributions for a surah
```dart
final response = await http.get(
  Uri.parse('$baseUrl/contributions?surah=$surahNumber'),
);
final List contributions = jsonDecode(response.body);
```

### Like a contribution
```dart
final token = await FirebaseAuth.instance.currentUser!.getIdToken();

await http.post(
  Uri.parse('$baseUrl/contributions/$id/like'),
  headers: { 'Authorization': 'Bearer $token' },
);
```

---

## Learning Journeys

A journey tracks a user's progress through a range of Quran ayahs across one or more learning dimensions (read, memorize, translate, commentary).

### Journey Object

```json
{
  "id": "abc123",
  "userId": "firebase-uid",
  "title": "Read & Memorize: Surah 1:1 → Surah 2:286",
  "dimensions": ["read", "memorize"],
  "startSurah": 1,
  "startAyah": 1,
  "endSurah": 2,
  "endAyah": 286,
  "startDate": { "_seconds": 1743184800, "_nanoseconds": 0 },
  "endDate": { "_seconds": 1774720800, "_nanoseconds": 0 },
  "status": "active",
  "totalAyahs": 293,
  "completedAyahs": { "1_1": true, "1_2": true },
  "completedCount": 2,
  "createdAt": { "_seconds": 1743184800, "_nanoseconds": 0 },
  "updatedAt": { "_seconds": 1743184800, "_nanoseconds": 0 }
}
```

### Journey Statuses

| Status | Meaning |
|--------|---------|
| `active` | In progress |
| `paused` | Manually paused by the user |
| `delayed` | End date has passed but not yet completed (auto-set lazily) |
| `completed` | All ayahs in range marked as done (auto-set) |
| `abandoned` | Manually abandoned by the user |

> `active`, `paused`, and `delayed` all count toward the **5-journey active limit**.

### Progress tracking

- Progress is **non-linear** — ayahs can be marked in any order.
- Marking progress on a surah/ayah outside the journey range returns `400`.
- When `completedCount` reaches `totalAyahs`, the journey auto-completes.
- Submitting a progress update on a `paused` journey automatically resumes it.

---

### `POST /journeys` — Create a journey

**Auth required.**

**Request body**

```json
{
  "title": "My Ramadan Plan",
  "dimensions": ["read", "memorize"],
  "startSurah": 1,
  "startAyah": 1,
  "endSurah": 2,
  "endAyah": 286,
  "startDate": "2026-03-01T00:00:00Z",
  "endDate": "2026-04-30T00:00:00Z"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `title` | string | no | Auto-generated from range + dimensions if omitted |
| `dimensions` | array | yes | One or more of `read`, `memorize`, `translate`, `commentary` |
| `startSurah` | integer | yes | 1–114 |
| `startAyah` | integer | yes | Must be a valid ayah in that surah |
| `endSurah` | integer | yes | 1–114 |
| `endAyah` | integer | yes | Must be a valid ayah in that surah |
| `startDate` | ISO 8601 string | yes | Journey start date |
| `endDate` | ISO 8601 string | yes | Journey target completion date |

**Validations:**
- Start position must come before end position
- `startDate` must be before `endDate`
- Ayah references are validated against actual Quran ayah counts
- Max 5 active (non-completed, non-abandoned) journeys per user

**Response `201`** — Journey object (see above).

**Error codes**

| Code | Meaning |
|------|---------|
| `MAX_ACTIVE_JOURNEYS` | User already has 5 active journeys |

---

### `GET /journeys` — List my journeys

**Auth required.** Returns the authenticated user's journeys, newest first.

**Response `200`** — Array of Journey objects.

---

### `GET /journeys/:id` — Get a journey

No auth required.

**Response `200`** — Journey object.

**Response `404`** — Journey not found.

---

### `POST /journeys/:id/progress` — Update progress

**Auth required.** Owner only.

Mark a single ayah or an entire surah as done within the journey's range.

**Request body — mark a single ayah**
```json
{ "surah": 1, "ayah": 5 }
```

**Request body — mark entire surah**
```json
{ "surah": 1 }
```

When marking an entire surah, only the ayahs that fall within the journey's range are marked. For example, if the journey starts at Surah 2 Ayah 100, marking Surah 2 will only mark ayahs 100–286.

**Behaviour:**
- Ayahs already marked as done are silently skipped (idempotent)
- Submitting on a `paused` journey auto-resumes it to `active` (or `delayed` if past deadline)
- Journey auto-completes when all ayahs are covered

**Response `200`** — Updated Journey object.

**Error codes**

| Code | Meaning |
|------|---------|
| `JOURNEY_COMPLETED` | Journey is already completed |
| `JOURNEY_ABANDONED` | Journey has been abandoned |

---

### `PATCH /journeys/:id/status` — Update journey status

**Auth required.** Owner only.

Manually pause, resume, or abandon a journey.

**Request body**
```json
{ "status": "paused" }
```

| Allowed value | Description |
|---------------|-------------|
| `paused` | Pause an active or delayed journey |
| `active` | Resume a paused journey |
| `abandoned` | Abandon the journey permanently |

> Cannot manually set status to `completed` or `delayed` — those are system-managed.

**Response `200`** — Updated Journey object.

---

### `GET /users/:userId/journeys` — List another user's journeys

No auth required. Returns all journeys for the given user, newest first.

**Response `200`** — Array of Journey objects.

---

### Typical Flutter Usage — Journeys

#### Create a journey
```dart
final token = await FirebaseAuth.instance.currentUser!.getIdToken();

final response = await http.post(
  Uri.parse('$baseUrl/journeys'),
  headers: {
    'Authorization': 'Bearer $token',
    'Content-Type': 'application/json',
  },
  body: jsonEncode({
    'dimensions': ['read', 'memorize'],
    'startSurah': 1,
    'startAyah': 1,
    'endSurah': 2,
    'endAyah': 286,
    'startDate': '2026-03-01T00:00:00Z',
    'endDate': '2026-04-30T00:00:00Z',
  }),
);
```

#### Mark progress on an ayah
```dart
final token = await FirebaseAuth.instance.currentUser!.getIdToken();

await http.post(
  Uri.parse('$baseUrl/journeys/$journeyId/progress'),
  headers: {
    'Authorization': 'Bearer $token',
    'Content-Type': 'application/json',
  },
  body: jsonEncode({ 'surah': 1, 'ayah': 5 }),
);
```

#### Mark an entire surah as done
```dart
await http.post(
  Uri.parse('$baseUrl/journeys/$journeyId/progress'),
  headers: {
    'Authorization': 'Bearer $token',
    'Content-Type': 'application/json',
  },
  body: jsonEncode({ 'surah': 1 }),
);
```

#### Pause a journey
```dart
await http.patch(
  Uri.parse('$baseUrl/journeys/$journeyId/status'),
  headers: {
    'Authorization': 'Bearer $token',
    'Content-Type': 'application/json',
  },
  body: jsonEncode({ 'status': 'paused' }),
);
```
