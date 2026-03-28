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
