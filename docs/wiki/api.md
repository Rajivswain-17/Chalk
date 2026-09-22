# API Reference

Base URL: `http://localhost:3001`

All requests and responses use JSON format. Session management uses httpOnly cookies (`chalk_at`, `chalk_rt`). State-mutating requests (POST, PUT, DELETE) require the double-submit CSRF token passed via the `x-csrf-token` header, matching the value in the `chalk_csrf` cookie.

---

## Health Check Endpoints

### `GET /health/live`
Process liveness check. Always returns 200 while the Node.js process is active.

- **Auth Required**: No
- **Response `200 OK`**:
```json
{
  "status": "ok",
  "service": "chalk-server",
  "timestamp": "2026-09-22T01:00:00.000Z"
}
```

### `GET /health/ready`
System readiness check. Verifies database connectivity and Valkey/Redis responsiveness.

- **Auth Required**: No
- **Response `200 OK`**:
```json
{
  "status": "ready",
  "service": "chalk-server",
  "timestamp": "2026-09-22T01:00:00.000Z"
}
```
- **Response `503 Service Unavailable`**:
```json
{
  "status": "not_ready",
  "error": "connection refused"
}
```

---

## Authentication Endpoints (`/api/auth`)

### `POST /api/auth/signup`
Creates a new account with email and password.

- **Rate Limit**: 20 requests / hour / IP
- **Request Body** (Validated via Zod `signupSchema`):
```json
{
  "name": "Jane Doe",
  "email": "jane@example.com",
  "password": "SecretPassword123"
}
```
- **Response `201 Created`**:
```json
{
  "id": "c1f7b6b0-8c29-4d6c-bb92-5eb3f1e944bc",
  "name": "Jane Doe",
  "email": "jane@example.com",
  "avatarUrl": null
}
```
- **Cookies Set**:
  - `chalk_at` (httpOnly, 15 min): JWT Access Token
  - `chalk_rt` (httpOnly, 30 days): Opaque Refresh Token
  - `chalk_csrf` (readable, 30 days): CSRF Token
- **Errors**: `400 Bad Request` (validation error), `409 Conflict` (email already registered).

---

### `POST /api/auth/login`
Authenticates a user via credentials.

- **Rate Limit**: 20 requests / hour / IP
- **Request Body** (Validated via Zod `loginSchema`):
```json
{
  "email": "jane@example.com",
  "password": "SecretPassword123"
}
```
- **Response `200 OK`**:
```json
{
  "id": "c1f7b6b0-8c29-4d6c-bb92-5eb3f1e944bc",
  "name": "Jane Doe",
  "email": "jane@example.com",
  "avatarUrl": "https://example.com/avatar.jpg"
}
```
- **Cookies Set**: `chalk_at`, `chalk_rt`, `chalk_csrf`.
- **Errors**: `401 Unauthorized` (invalid email or password).

---

### `POST /api/auth/logout`
Revokes the presented refresh token and clears all session cookies.

- **Auth Required**: `requireCsrf` (via `x-csrf-token` header)
- **Response `200 OK`**:
```json
{
  "ok": true
}
```
- **Cookies Cleared**: `chalk_at`, `chalk_rt`, `chalk_csrf`.

---

### `POST /api/auth/refresh`
Rotates the refresh token. Validates the incoming `chalk_rt` cookie, issues a new JWT and refresh token, and revokes the prior token.

- **Auth Required**: `requireCsrf` (via `x-csrf-token` header)
- **Response `200 OK`**:
```json
{
  "ok": true
}
```
- **Security / Token Reuse**: If an already-revoked refresh token is supplied, all active sessions for that user are immediately invalidated.
- **Errors**: `401 Unauthorized` (expired or invalid token).

---

### `GET /api/auth/me`
Retrieves the profile of the currently authenticated user.

- **Auth Required**: `requireAuth` (valid `chalk_at` JWT)
- **Response `200 OK`**:
```json
{
  "id": "c1f7b6b0-8c29-4d6c-bb92-5eb3f1e944bc",
  "name": "Jane Doe",
  "email": "jane@example.com",
  "avatarUrl": "https://example.com/avatar.jpg"
}
```
- **Errors**: `401 Unauthorized` if session is missing or expired.

---

### `GET /api/auth/providers`
Returns which third-party OAuth providers are configured on the server.

- **Auth Required**: No
- **Response `200 OK`**:
```json
{
  "google": true,
  "github": false
}
```

---

### `GET /api/auth/oauth/:provider`
Initiates OAuth flow by redirecting the client to Google or GitHub authorization screens.

- **Path Parameters**: `:provider` = `"google"` | `"github"`
- **Query Parameters**: `?next=/generate` (optional return path)
- **Response**: `302 Redirect` to OAuth provider endpoint.

---

### `GET /api/auth/oauth/:provider/callback`
Handles OAuth provider callback, exchanges authorization code, creates or links account, issues cookies, and redirects user to frontend.

- **Response**: `302 Redirect` to `${CLIENT_URL}${next}`.
- **Errors**: `302 Redirect` to `/login?error=oauth` or `/login?error=no_email`.

---

## Visualization Endpoint (`/api/visualize`)

### `POST /api/visualize`
Generates step-by-step interactive visualization state using OpenAI Structured Outputs.

- **System Prompt** (`visualize.service.ts`): 3-phase pedagogical flow — **Phase 1** (step 1) is the question breakdown (plain-English rules + inputs + real-world intuition + the core constraint), **Phase 2** (step 2) is two worked examples with explicit arithmetic, **Phase 3** (steps 3..N) is the visual algorithm execution (one logical change per step, `active`/`compare`/`found`/`visited` states, causal explanations), and the final step summarizes the answer with its time complexity (e.g. `O(N * log(max(piles)))`). Explanations are 2–4 warm, causal sentences ("why" not just "what"), capped at 600 characters by the schema. Produces 6–10 steps (schema allows 6–12). Tree elements must be listed in heap order (root `0`, children `2i+1`/`2i+2`) for `TreeStage` positioning.
- **Phase 1 contract** (drives the client's persistent `ProblemBanner`, which reads `steps[0]`): `title` = `Problem Breakdown: <Topic Name>` (the client strips that prefix and a trailing `Problem`), `subtitle` = the short real goal (rendered as the `Goal:` pill), `explanation` = problem in simple terms → inputs + core constraint, and `elements` = the ORIGINAL input in its given order (rendered as the `Input: nums = [...]` pill). The constraint badge comes from a `variables` entry whose name contains `target`, else the first non-pointer variable.
- **`calculation` field**: the LLM plan schema declares it **required** (`z.string()`, `""` on steps with no arithmetic) so the strict JSON schema stays conformant, while `visualStepSchema` declares it **optional** (`z.string().max(400).optional()`) so a response whose model output omitted the field still validates; the client's `VisualStep` mirrors it as optional, so old cached sessions simply render without a badge. `generateVisualization` maps a blank value to `undefined` before validation. The client renders it in the `LiveMathBadge` below the canvas: a trailing `(verdict)` group becomes a pass/fail pill; when that group is absent, an equation fallback derives a pill only from the formula's last `==`/`!=` comparison (see `components.md` → `VariableBadges.tsx`), never from relational operators. Example values: `hours = ceil(3/4) + ceil(6/4) + ceil(7/4) + ceil(11/4) = 1 + 2 + 2 + 3 = 8 <= 8 (valid)`, `nums[i] + nums[j] + nums[left] + nums[right] = -2 + (-1) + 1 + 2 = 0 == target (match found)`, `nums[mid] = 7 > target = 5 (too large, move right)`.
- **Auth Required**: `requireAuth` + `requireCsrf`
- **Rate Limit**: **250 requests / hour / IP** outside production (`NODE_ENV !== "production"`); **10 requests / hour / IP** in production. Client-side localStorage step caching (`ChatSession.steps`) prevents refreshes from consuming this budget at all.
- **Request Body** (Validated via Zod `visualizeRequestSchema`):
```json
{
  "prompt": "Explain Binary Search with target 7 in [1, 3, 5, 7, 9, 11]"
}
```
- **Response `200 OK`**:
```json
{
  "steps": [
    {
      "stepIndex": 0,
      "title": "Initialize Pointers",
      "subtitle": "Set low and high bounds",
      "stageType": "array",
      "elements": [
        { "id": "el-0", "value": "1", "indexLabel": "[0]", "state": "default", "pointer": "low" },
        { "id": "el-1", "value": "3", "indexLabel": "[1]", "state": "default" },
        { "id": "el-2", "value": "5", "indexLabel": "[2]", "state": "default" },
        { "id": "el-3", "value": "7", "indexLabel": "[3]", "state": "default" },
        { "id": "el-4", "value": "9", "indexLabel": "[4]", "state": "default" },
        { "id": "el-5", "value": "11", "indexLabel": "[5]", "state": "default", "pointer": "high" }
      ],
      "codeLines": [
        "low = 0",
        "high = len(arr) - 1",
        "while low <= high:",
        "    mid = (low + high) // 2",
        "    if arr[mid] == target: return mid"
      ],
      "activeLine": 0,
      "variables": [
        { "name": "low", "value": "0" },
        { "name": "high", "value": "5" }
      ],
      "explanation": "We initialize two pointers: low at index 0 and high at index 5.",
      "calculation": "low = 0, high = 5 (valid)"
    }
  ]
}
```

### Type Definitions

- **`StageType`**: `"array" | "tree" | "cards" | "flow"`
- **`ElementState`**: `"default" | "active" | "compare" | "found" | "visited" | "path"`
- **Error Codes**:
  - `400 Bad Request`: Prompt length outside 10-1000 characters.
  - `401 Unauthorized`: Missing or invalid session cookie.
  - `403 Forbidden`: CSRF token mismatch.
  - `429 Too Many Requests`: Exceeded the hourly limit (250 non-production / 10 production).
  - `502 Bad Gateway`: OpenAI response validation failure (`VISUAL_INVALID`).
  - `503 Service Unavailable`: OpenAI request timed out (`VISUAL_TIMEOUT`).

---

## ElevenLabs Integration (`services/voice/elevenlabs.ts`)

Chalk integrates with the ElevenLabs Text-to-Speech API for generating synchronized speech narration with exact word/character timestamp alignments.

### Function: `synthesizeVoice()`

```typescript
export async function synthesizeVoice(
  text: string,
  sceneIndex: number,
  jobId: string,
  attempt: number
): Promise<{
  audioPath: string;
  rawTimestamps: Array<{
    character: string;
    start_time: number;
    end_time: number;
  }>;
}>
```

### Upstream ElevenLabs API Details
- **Endpoint**: `POST https://api.elevenlabs.io/v1/text-to-speech/{voice_id}/with-timestamps`
- **Voice ID**: Set via `ELEVENLABS_VOICE_ID` (default: `21m00Tcm4TlvDq8ikWAM` - Rachel)
- **Model**: `eleven_multilingual_v2`
- **Output Format**: `mp3_44100_128`
- **Headers**:
  - `xi-api-key`: Processed from `ELEVENLABS_API_KEY` via `requireSecret()`
  - `Content-Type`: `application/json`
- **Request Payload**:
```json
{
  "text": "We start by comparing the target with the middle element.",
  "model_id": "eleven_multilingual_v2",
  "voice_settings": {
    "stability": 0.5,
    "similarity_boost": 0.75
  }
}
```

### Timestamp Alignment Parsing
The response contains base64 audio and an alignment payload parsed with Zod:
```typescript
const alignmentSchema = z.object({
  characters: z.array(z.string()),
  character_start_times_seconds: z.array(z.number().finite().nonnegative()),
  character_end_times_seconds: z.array(z.number().finite().nonnegative()),
});
```
The service verifies non-empty character sequences, verifies chronological monotonic start times (`start >= previousStart`), decodes base64 audio to binary buffer, and saves atomic files to:
`${jobAttemptDir}/audio/scene_001.mp3`

---

## Cookie Specification

| Cookie Name | httpOnly | Client Readable | Max-Age | Purpose |
|-------------|----------|-----------------|---------|---------|
| `chalk_at` | Yes | No | 15 minutes | JWT access token storing user ID |
| `chalk_rt` | Yes | No | 30 days | Opaque refresh token validated against DB hash |
| `chalk_csrf` | No | Yes | 30 days | Double-submit CSRF cookie echoed in `x-csrf-token` header |
| `chalk_oauth`| Yes | No | 10 minutes | Temporary state nonce and `next` path during OAuth handshakes |

Policy: `SameSite=Lax`, `Path=/`, `Secure` (in production).
