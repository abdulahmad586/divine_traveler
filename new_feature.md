# Learning Journey — Frontend Implementation Guide

## Local Data the Frontend Must Embed

The frontend **cannot rely on the backend** to validate ayah references before submitting — it needs to do this locally to give instant feedback. Embed the same ayah counts table:

```dart
const List<int> ayahCounts = [
  0,   // unused
  7, 286, 200, 176, 120, 165, 206, 75, 129, 109,  // 1–10
  123, 111, 43, 52, 99, 128, 111, 110, 98, 135,   // 11–20
  112, 78, 118, 64, 77, 227, 93, 88, 69, 60,      // 21–30
  34, 30, 73, 54, 45, 83, 182, 88, 75, 85,        // 31–40
  54, 53, 89, 59, 37, 35, 38, 29, 18, 45,         // 41–50
  60, 49, 62, 55, 78, 96, 29, 22, 24, 13,         // 51–60
  14, 11, 11, 18, 12, 12, 30, 52, 52, 44,         // 61–70
  28, 28, 20, 56, 40, 31, 50, 40, 46, 42,         // 71–80
  29, 19, 36, 25, 22, 17, 19, 26, 30, 20,         // 81–90
  15, 21, 11, 8, 8, 19, 5, 8, 8, 11,              // 91–100
  11, 8, 3, 9, 5, 4, 7, 3, 6, 3, 5, 4, 5, 6,     // 101–114
];
```

You also need surah names (Arabic and transliterated) to display in the picker — the API returns only numbers.

---

## Data Model

Map every field from the API response. Key things to note:

```dart
class Journey {
  final String id;
  final String userId;
  final String title;
  final List<String> dimensions;   // "read" | "memorize" | "translate" | "commentary"
  final int startSurah;
  final int startAyah;
  final int endSurah;
  final int endAyah;
  final DateTime startDate;        // convert from Firestore Timestamp {seconds, nanoseconds}
  final DateTime endDate;
  final String status;             // "active" | "paused" | "delayed" | "completed" | "abandoned"
  final int totalAyahs;
  final Map<String, bool> completedAyahs;  // keys like "2_50" → true
  final int completedCount;
  final DateTime createdAt;
  final DateTime updatedAt;
}
```

**Timestamp parsing** — the API returns Firestore timestamps as `{ "_seconds": 1234, "_nanoseconds": 0 }`, not ISO strings. Parse them as:
```dart
DateTime.fromMillisecondsSinceEpoch(json['endDate']['_seconds'] * 1000)
```

**Checking if an ayah is done** — use `completedAyahs["${surah}_${ayah}"] == true`.

**Progress percentage** — `completedCount / totalAyahs * 100`. Do not recompute from `completedAyahs.length`; use `completedCount`.

---

## Screens Required

### 1. Journey List Screen

Displays the authenticated user's own journeys. Entry point for the feature.

**What to fetch:** `GET /journeys` with auth token. Fetch on screen load and on return from any child screen (journey may have been modified).

**What to show per journey card:**
- Title
- Dimensions as chips/tags
- Progress bar: `completedCount / totalAyahs`
- `completedCount` / `totalAyahs` ayahs label
- Status badge with distinct visual treatment per status:
  - `active` → green
  - `paused` → grey
  - `delayed` → orange/amber — **important**: this tells the user they are behind schedule
  - `completed` → blue/teal
  - `abandoned` → red/muted
- Date range: `startDate → endDate`
- For `delayed` status specifically: show how many days overdue (`DateTime.now().difference(endDate).inDays` days past deadline)

**Sorting:** The API returns newest first. Do not re-sort on the client.

**Empty state:** Show a call-to-action to create a first journey.

**Cap warning:** If the user has 5 journeys with `active`, `paused`, or `delayed` status, disable the "Create Journey" button and show a tooltip: "You have 5 active journeys. Complete or abandon one to create a new one." Count this on the client from the fetched list — do not wait for the API to reject.

**Actions from list:**
- Tap card → Journey Detail Screen
- FAB / button → Create Journey Screen (disabled if at cap)

---

### 2. Create Journey Screen

A form. All validation should happen **on the client before the API call** to give instant feedback.

#### Fields

**Title (optional)**
- Text input, placeholder: "e.g. Ramadan 2026 Plan"
- If left blank, show a preview of the auto-generated title beneath the field as the user fills in the other fields. Auto-title format: `"[Dimensions]: Surah X:Y → Surah A:B"`. Update this preview reactively as other fields change.

**Dimensions (required, multi-select)**
- Four toggleable options: Read, Memorize, Translate, Commentary
- At least one must be selected. Show inline error if user tries to submit with none selected.

**Range — Start**
- Two-part picker: Surah (1–114) + Ayah (1–N where N = `ayahCounts[selectedSurah]`)
- When the user changes the surah, reset the ayah picker to 1 and clamp the max to that surah's ayah count
- Display the surah name alongside the number

**Range — End**
- Same two-part picker
- Ayah picker max = `ayahCounts[selectedSurah]`
- **Validate in real time**: if end position ≤ start position, show an inline error: "End must come after the start"
- A linear index comparison is needed — end is "after" start if `toLinearIndex(endSurah, endAyah) > toLinearIndex(startSurah, startAyah)`

```dart
int toLinearIndex(int surah, int ayah) {
  int index = 0;
  for (int s = 1; s < surah; s++) index += ayahCounts[s];
  return index + ayah;
}
```

**Show a computed summary** once both ends are valid: "This journey covers X ayahs across Y surahs."

**Start Date (required)**
- Date picker. Default to today.

**End Date (required)**
- Date picker. Must be after start date. If user picks a date ≤ start date, show inline error.

#### Submission

Run all validations before calling the API:
1. At least one dimension selected
2. Start ayah exists: `ayah >= 1 && ayah <= ayahCounts[surah]`
3. End ayah exists: same check
4. End is after start: linear index comparison
5. End date is after start date

On submit → `POST /journeys`.

**Error handling:**
- `400 VALIDATION_ERROR` — display the `error` message inline (this shouldn't happen if client validation is correct, but handle it as a generic form error)
- `409 MAX_ACTIVE_JOURNEYS` — show a dialog: "You've reached the maximum of 5 active journeys. Complete or abandon one first." This can happen if another device created a journey between the cap check and the submit.

On success → pop screen, return to list. The list screen must re-fetch.

---

### 3. Journey Detail Screen

Shows all information about a single journey. Accessible by the owner and by any user viewing someone else's journey.

**What to fetch:** `GET /journeys/:id`. Fetch on load.

**Sections to display:**

**Header:**
- Title
- Status badge
- For `delayed`: "X days past deadline"
- Dimensions list

**Progress section:**
- Large circular or linear progress indicator: `completedCount / totalAyahs`
- Text: "X of Y ayahs completed (Z%)"

**Range:**
- "Surah [name] [number], Ayah [startAyah] → Surah [name] [number], Ayah [endAyah]"

**Timeline:**
- Start date
- Target end date
- "Created on" date

**Completed ayahs view** (optional but useful):
- A scrollable list or grid grouped by surah
- Each surah shows which ayahs are done (green) and which are not
- For large ranges (hundreds of ayahs), consider a compact grid representation rather than listing every ayah individually

**Owner-only actions** (hide entirely if `userId !== currentUser.uid`):
- **Update Progress button** → opens Update Progress sheet (see below). Disabled if status is `completed` or `abandoned`.
- **Pause / Resume toggle:**
  - Show "Pause" if status is `active` or `delayed`
  - Show "Resume" if status is `paused`
  - Hidden if status is `completed` or `abandoned`
- **Abandon button:** Only show if status is not `completed` or `abandoned`. Always show a confirmation dialog before calling the API: "Are you sure you want to abandon this journey? This cannot be undone."

---

### 4. Update Progress — Bottom Sheet or Modal

Opened from the Journey Detail screen. Two modes the user chooses between:

**Mode A — Mark a single ayah**
- Surah picker (only surahs within the journey range)
- Ayah picker (only ayahs within that surah and within the journey range)
  - For the first surah in the range: min ayah = `startAyah`
  - For the last surah in the range: max ayah = `endAyah`
  - For surahs in between: min = 1, max = `ayahCounts[surah]`
- If the selected ayah is already in `completedAyahs`, show a subtle indicator: "Already marked as done"
- Submitting an already-completed ayah is valid (idempotent) — the backend silently skips it. But it's good UX to warn the user.

**Mode B — Mark entire surah as done**
- Surah picker (only surahs that overlap with the journey range)
- Show how many ayahs will be marked: "This will mark X ayahs in Surah [name] as done"
- For a surah that is partially complete, show: "X of Y ayahs in this surah are already marked. Y-X new ayahs will be added."
- This count can be computed locally from `completedAyahs`

**Submission:**
- Mode A → `POST /journeys/:id/progress` with `{ surah, ayah }`
- Mode B → `POST /journeys/:id/progress` with `{ surah }` (no `ayah` field)

**After success:**
- Update the local journey state with the returned journey object
- If the returned `status` is `completed`, close the sheet and show a celebration/completion UI on the detail screen
- If status changed from `paused` to `active`, reflect that in the status badge without a separate message (it's expected behavior)

**Error handling:**
- `400` with a message about being outside range — this should not happen if the picker is constrained correctly. Show as a snackbar if it does.
- `409 JOURNEY_COMPLETED` — dismiss the sheet, update the status badge to completed
- `409 JOURNEY_ABANDONED` — dismiss the sheet, update the status badge

---

### 5. Other User's Journey Screen

Navigated to from a user profile or a shared link. Uses `GET /journeys/:id` (single) or `GET /users/:userId/journeys` (list).

**Same layout as Journey Detail Screen** but with all owner-only action buttons hidden. Read-only.

---

## State Management

**What to hold in local state:**

After a successful progress update, the API returns the full updated journey object. **Replace the local journey object entirely** with the response. Do not attempt to merge `completedAyahs` manually — the server is the source of truth.

**Optimistic UI (optional but recommended for progress updates):**
If you implement it, immediately mark the ayah as done in local state and roll back if the API call fails. This matters most for users on slow connections. Key point: if you do this, the `completedCount` must also be incremented locally before the response comes back.

**Status transitions to handle reactively:**
- When status becomes `completed`, immediately hide the progress update button and show a completion banner
- When status becomes `abandoned`, immediately hide all action buttons
- When `delayed`, show the overdue indicator

**The `completedAyahs` map can be large** (up to 6,236 entries for a full Quran journey). Avoid rebuilding the entire progress grid widget on every state change — use keys to rebuild only the affected ayah cell.

---

## Client-Side Validations Summary

These must all be enforced **before any API call**:

| Check | Rule |
|-------|------|
| Ayah exists | `ayah >= 1 && ayah <= ayahCounts[surah]` |
| Range order | `toLinearIndex(endSurah, endAyah) > toLinearIndex(startSurah, startAyah)` |
| Date order | `endDate > startDate` |
| Dimensions | At least one selected, no duplicates |
| Journey cap | Count local journeys with status `active`, `paused`, or `delayed` < 5 |
| Progress ayah in range | `toLinearIndex(surah, ayah) >= toLinearIndex(startSurah, startAyah)` and `<= toLinearIndex(endSurah, endAyah)` |
| Progress surah in range | `surah >= startSurah && surah <= endSurah` |

---

## All API Error Codes the Frontend Must Handle

| Code | Where it can appear | What to show |
|------|---------------------|--------------|
| `VALIDATION_ERROR` | Create, progress | Inline form error with `error` message |
| `UNAUTHORIZED` | Any authenticated call | Redirect to login, token may have expired |
| `FORBIDDEN` | Progress, status update | "You don't have permission to do this" |
| `NOT_FOUND` | Any `:id` endpoint | "Journey not found" with a back button |
| `MAX_ACTIVE_JOURNEYS` | Create | Dialog explaining the 5-journey cap |
| `JOURNEY_COMPLETED` | Progress, status update | Dismiss action UI, mark as completed |
| `JOURNEY_ABANDONED` | Progress, status update | Dismiss action UI, mark as abandoned |

---

## Edge Cases to Handle

**Journey becomes `delayed` between navigations.** The backend applies `delayed` lazily on fetch. When the user opens the journey detail, the status badge might change from what was shown on the list. This is normal — just reflect what the API returns.

**Marking an already-completed ayah.** The backend is idempotent (silently skips it). The frontend should allow this without showing an error, but can optionally show a subtle "already done" indicator in the picker.

**Marking an entire surah where all ayahs are already done.** The backend will process it and return the same `completedCount`. Show no error. Optionally detect this on the client and show "All ayahs in this surah are already completed."

**Journey auto-completes from progress update.** The `POST /journeys/:id/progress` response will have `status: "completed"`. The frontend must detect this in the response and transition the UI to a completed state — do not wait for a subsequent fetch.

**5-journey cap race condition.** User has 4 active journeys on two devices and creates one on each simultaneously. One will get `409 MAX_ACTIVE_JOURNEYS` from the server. Handle it gracefully with a dialog even if the local count said it was safe.

**Token expiry during a long session.** Any API call can return `401`. Refresh the token with `FirebaseAuth.instance.currentUser!.getIdToken(true)` and retry once before showing a login prompt.

**Very large `completedAyahs` maps.** A Surah 2 journey has 286 ayahs. Rendering 286 individual widgets is fine. A full Quran journey has 6,236. Use a virtualized/lazy list for the completed ayahs grid when `totalAyahs > 500`.

---

## What Is NOT Needed Yet

- Tests/quizzes (future addition)
- Any admin moderation of journeys
- Push notifications for deadline reminders (would require a separate background job)
- Journey sharing via deep link (would need the `GET /journeys/:id` URL to be shareable — that's a routing concern in the app)
