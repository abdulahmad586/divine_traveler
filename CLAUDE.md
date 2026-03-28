# Quran Recitation Contribution Backend (Node.js + Firebase)

## Overview

This backend supports a decentralized system where users:

- Train and map Qur'an recitations (audio + ayah timestamps)
- Upload files to their own Google Drive
- Share files publicly (via consent)
- Register contributions in the system for others to use

The backend:

- Stores metadata only
- Does not store audio files
- Indexes, validates, and serves contributions

## Architecture

### Stack

- **Backend:** Node.js (Express or Fastify)
- **Database:** Firebase Firestore
- **Auth:** Firebase Authentication (Google Sign-In)
- **Optional:** Cloud Functions (for async tasks)

### Core Flow

1. User authenticates with Google
2. User trains recitation (Flutter app)
3. Files uploaded to Google Drive:
   - Audio file
   - Timing JSON
4. Files made public (anyone: reader)
5. App sends metadata to backend
6. Backend validates + stores
7. Other users fetch and use

## Data Models

### 1. Contribution

```json
{
  "id": "auto_generated",
  "reciterName": "string",
  "surah": 1,
  "audioFileId": "string",
  "timingFileId": "string",
  "audioHash": "string",
  "createdBy": "userId",
  "createdAt": "timestamp",
  "status": "pending | approved | rejected",
  "downloads": 0,
  "likes": 0
}
```

### 2. User

```json
{
  "id": "firebase_uid",
  "name": "string",
  "email": "string",
  "createdAt": "timestamp"
}
```

### 3. Optional: Contribution Versions

```json
{
  "reciterName": "string",
  "surah": 1,
  "versions": [
    {
      "audioFileId": "...",
      "timingFileId": "...",
      "qualityScore": 0.9,
      "createdAt": "timestamp"
    }
  ]
}
```

## Validation Rules

### Required

- `reciterName` must not be empty
- `surah` must be between 1–114
- `audioFileId` and `timingFileId` must exist
- Files must be publicly accessible

### Duplicate Prevention

- **Exact duplicate:** check `audioHash`
- **Logical duplicate:** enforce soft uniqueness on `(reciterName + surah)`

## File Access Pattern

Use `fileId` instead of storing raw links.

Download URL format:
```
https://drive.google.com/uc?id=FILE_ID&export=download
```

## API Endpoints

### Auth

Handled by Firebase (no custom endpoint required).

### Submit Contribution

`POST /contributions`

Request body:
```json
{
  "reciterName": "string",
  "surah": 1,
  "audioFileId": "string",
  "timingFileId": "string",
  "audioHash": "string"
}
```

Behavior:
- Validate input
- Check for duplicate hash
- Store as `pending` or `approved`

### Get Contributions (by Surah)

`GET /contributions?surah=1`

Response:
```json
[
  {
    "id": "...",
    "reciterName": "...",
    "audioFileId": "...",
    "timingFileId": "...",
    "downloads": 10,
    "likes": 5
  }
]
```

### Get Contribution by ID

`GET /contributions/:id`

### Like Contribution

`POST /contributions/:id/like`

### Increment Download Count

`POST /contributions/:id/download`

### Delete Contribution (Owner only)

`DELETE /contributions/:id`

## Middleware

### Auth Middleware

- Verify Firebase ID token
- Attach `userId` to request

### Validation Middleware

- Validate request body
- Ensure required fields

## Optional Enhancements

1. **Health Check Endpoint** — `GET /health`
2. **Broken Link Detection** — Periodically check file accessibility; mark invalid contributions
3. **Ranking System** — Sort contributions by likes, downloads, recency
4. **Moderation Flow** — `pending → approved`; admin-only endpoints

## Important Constraints

- Backend does not store files
- Files depend on user's Google Drive
- Links may break if the user deletes a file or changes permissions

## Design Principles

- Decentralized storage
- User ownership of data
- Minimal backend responsibility
- Extensible for future moderation and ranking
