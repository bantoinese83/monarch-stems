# monarch-stems

[![CI](https://github.com/bantoinese83/monarch-stems/workflows/CI/badge.svg)](https://github.com/bantoinese83/monarch-stems/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/monarch-stems.svg)](https://www.npmjs.com/package/monarch-stems)
[![npm downloads](https://img.shields.io/npm/dm/monarch-stems.svg)](https://www.npmjs.com/package/monarch-stems)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/node-%3E%3D16-green.svg)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue.svg)](https://www.typescriptlang.org/)

Node and browser client for [Stem-Separator-API](https://github.com/bantoinese83/Stem-Separator-API) — separate audio into stems (vocals, drums, bass, etc.) using Spleeter.

- **API**: Production FastAPI app for stem separation; supports 2, 4, or 5 stems.
- **Live API**: [stem-separator-api-production.up.railway.app](https://stem-separator-api-production.up.railway.app) (used by default).

---

## Table of contents

- [Install](#install)
- [Quick start](#quick-start)
- [Prerequisites](#prerequisites)
- [Examples](#examples)
- [Use cases](#use-cases)
- [Usage](#usage)
- [API reference](#api-reference)
- [Error handling](#error-handling)
- [Troubleshooting](#troubleshooting)
- [Quality & testing](#quality--testing)
- [License](#license)

---

## Install

```bash
npm install monarch-stems
```

---

## Quick start

**Node** — separate by file path, then download the first stem:

```js
const { StemSeparatorClient } = require('monarch-stems');
const fs = require('fs');

const client = new StemSeparatorClient();
const result = await client.separate('/path/to/song.mp3', { stems: '2stems' });
const buffer = await client.downloadStem(result.job_id, result.output_files[0]);
fs.writeFileSync('vocals.wav', Buffer.from(buffer));
```

**Browser** — separate a file from an `<input type="file">`:

```js
import { StemSeparatorClient } from 'monarch-stems';

const client = new StemSeparatorClient();
const file = document.querySelector('input[type=file]').files[0];
const result = await client.separate(file, { stems: '2stems', format: 'mp3' });
const url = client.getStemDownloadUrl(result.job_id, result.output_files[0]);
window.open(url, '_blank');
```

---

## Prerequisites

| Environment | Requirement                                                                                                              |
| ----------- | ------------------------------------------------------------------------------------------------------------------------ |
| **Node**    | 18+ for native `fetch` and `FormData`. On Node 16 or older, install `form-data` and `axios` as dependencies.             |
| **Browser** | Any modern browser with `fetch` and `FormData`.                                                                          |
| **API**     | Default client uses the public Railway API. For self-hosted, set `baseUrl` (and optionally `apiKey`) in the constructor. |

**Supported audio formats** (by the API): MP3, WAV, FLAC, M4A, AAC, OGG.  
**File size**: The public API may enforce a max upload size (e.g. 100MB). See the [API repo](https://github.com/bantoinese83/Stem-Separator-API) for `MAX_UPLOAD_SIZE` and limits.

---

## Examples

### ESM (Node)

```js
import { StemSeparatorClient } from 'monarch-stems';
import fs from 'fs';

const client = new StemSeparatorClient();
const result = await client.separate('./song.mp3', { stems: '2stems', format: 'wav' });
for (const name of result.output_files) {
  const buf = await client.downloadStem(result.job_id, name);
  fs.writeFileSync(name, Buffer.from(buf));
}
```

### 4 stems (vocals, drums, bass, other)

```js
const { StemSeparatorClient } = require('monarch-stems');
const fs = require('fs');

const client = new StemSeparatorClient();
const result = await client.separate('/path/to/track.mp3', {
  stems: '4stems',
  format: 'mp3',
  bitrate: '320k',
});
console.log('Stems:', result.output_files); // e.g. ['vocals.mp3', 'drums.mp3', 'bass.mp3', 'other.mp3']
for (const name of result.output_files) {
  const buffer = await client.downloadStem(result.job_id, name);
  fs.writeFileSync(name, Buffer.from(buffer));
}
```

### 5 stems (vocals, drums, bass, piano, other)

```js
const result = await client.separate('/path/to/track.wav', {
  stems: '5stems',
  format: 'wav',
});
```

### Custom base URL and API key (self-hosted)

```js
const client = new StemSeparatorClient({
  baseUrl: 'https://your-stem-api.example.com',
  apiKey: process.env.STEM_API_KEY,
  timeout: 600000, // 10 min
});
const result = await client.separate('/path/to/audio.flac', { stems: '2stems' });
```

### Check health before separating

```js
const client = new StemSeparatorClient();
const health = await client.checkHealth();
if (health.status !== 'healthy') {
  console.error('API is not healthy:', health);
  process.exit(1);
}
const result = await client.separate(file, { stems: '2stems' });
```

### Error handling with retry (timeout)

```js
const { StemSeparatorClient, StemSeparatorError, ErrorCode } = require('monarch-stems');

const client = new StemSeparatorClient({ timeout: 300000 });
let lastErr;
for (let attempt = 1; attempt <= 2; attempt++) {
  try {
    const result = await client.separate(file);
    console.log('Job ID:', result.job_id);
    break;
  } catch (err) {
    lastErr = err;
    if (err instanceof StemSeparatorError && err.code === ErrorCode.TIMEOUT) {
      console.log(`Attempt ${attempt} timed out, retrying...`);
      continue;
    }
    throw err;
  }
}
if (lastErr) throw lastErr;
```

### Get download URL only (no fetch)

```js
const result = await client.separate(file, { stems: '2stems' });
const vocalsUrl = client.getStemDownloadUrl(result.job_id, result.output_files[0]);
// Use in <a href="...">, window.open(), or pass to another service
console.log('Download:', vocalsUrl);
```

---

## Use cases

| Use case              | Description                                                                                                                          |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| **CLI / script**      | Separate files from disk and save stems (Node with `require` or ESM).                                                                |
| **Web app**           | User uploads a file; separate and offer stems as download links or play in-browser.                                                  |
| **Batch processing**  | Loop over many files, call `separate()` for each, then `downloadStem()` for each output file.                                        |
| **Self-hosted API**   | Point `baseUrl` and optional `apiKey` at your own [Stem-Separator-API](https://github.com/bantoinese83/Stem-Separator-API) instance. |
| **Serverless / edge** | Use in serverless functions (e.g. Vercel, Netlify) with timeout and size limits in mind.                                             |
| **Karaoke / remix**   | Get `vocals` and `accompaniment` (2stems) or full stems (4/5) for remixing or karaoke.                                               |

### Example: simple CLI script

```js
#!/usr/bin/env node
const { StemSeparatorClient } = require('monarch-stems');
const fs = require('fs');
const path = process.argv[2];
if (!path) {
  console.error('Usage: node separate.js <audio-file>');
  process.exit(1);
}
const client = new StemSeparatorClient();
const result = await client.separate(path, { stems: '2stems', format: 'mp3' });
for (const name of result.output_files) {
  const buf = await client.downloadStem(result.job_id, name);
  fs.writeFileSync(name, Buffer.from(buf));
  console.log('Wrote', name);
}
```

### Example: batch (multiple files)

```js
const { StemSeparatorClient } = require('monarch-stems');
const fs = require('fs');
const path = require('path');

const client = new StemSeparatorClient();
const files = ['track1.mp3', 'track2.mp3'];
for (const file of files) {
  const result = await client.separate(file, { stems: '2stems' });
  const outDir = `stems_${result.job_id}`;
  fs.mkdirSync(outDir, { recursive: true });
  for (const name of result.output_files) {
    const buf = await client.downloadStem(result.job_id, name);
    fs.writeFileSync(path.join(outDir, name), Buffer.from(buf));
  }
  console.log('Done', file, '->', outDir);
}
```

---

## Usage

### Node

```js
const { StemSeparatorClient } = require('monarch-stems');

const client = new StemSeparatorClient();
// Optional: { baseUrl: 'https://your-api.example', apiKey: '...', timeout: 300000 }

(async () => {
  const result = await client.separate('/path/to/song.mp3', {
    stems: '2stems', // '2stems' | '4stems' | '5stems'
    format: 'wav', // wav, mp3, flac, m4a, aac, ogg
    bitrate: '320k',
  });
  console.log('Job ID:', result.job_id);
  console.log('Output files:', result.output_files);

  const url = client.getStemDownloadUrl(result.job_id, result.output_files[0]);
  const buffer = await client.downloadStem(result.job_id, result.output_files[0]);
  require('fs').writeFileSync('vocals.wav', Buffer.from(buffer));
})();
```

### Browser

```js
import { StemSeparatorClient } from 'monarch-stems';

const client = new StemSeparatorClient();
const fileInput = document.querySelector('input[type=file]');
const file = fileInput.files[0];

const result = await client.separate(file, { stems: '2stems', format: 'mp3' });
const url = client.getStemDownloadUrl(result.job_id, result.output_files[0]);
window.open(url, '_blank');

// Or get bytes
const arrayBuffer = await client.downloadStem(result.job_id, result.output_files[0]);
const blob = new Blob([arrayBuffer], { type: 'audio/mpeg' });
```

---

## API reference

| Method / constructor                         | Description                                                           |
| -------------------------------------------- | --------------------------------------------------------------------- |
| `new StemSeparatorClient(options?)`          | Create a client. Options: `baseUrl`, `apiKey`, `timeout` (ms).        |
| `client.separate(file, options?)`            | Upload audio and run separation. Returns `Promise<SeparateResponse>`. |
| `client.getStemDownloadUrl(jobId, filename)` | Return URL to download one stem file.                                 |
| `client.downloadStem(jobId, filename)`       | Fetch stem file as `Promise<ArrayBuffer>`.                            |
| `client.checkHealth()`                       | `Promise<HealthResponse>`.                                            |

**`separate(file, options?)`**

- **file**: Browser: `File` or `Blob`. Node: file path string, `Buffer`, or `Readable` stream.
- **options**: `stems` (`'2stems'` \| `'4stems'` \| `'5stems'`), `format` (`'wav'` \| `'mp3'` \| …), `bitrate` (e.g. `'320k'`), `filename` (form field name).

**Response** (`SeparateResponse`): `success`, `message`, `job_id`, `stems`, `output_files` (array of filenames), `processing_time`.

---

## Error handling

All errors thrown by the client are instances of **`StemSeparatorError`** with:

- **`code`** — Stable string for handling (see below).
- **`message`** — Human-readable description.
- **`status`** — Set for `API_ERROR` (HTTP status code).
- **`cause`** — Original error when available.

**Error codes**

| Code               | Meaning                                                                                                                          |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------- |
| `INVALID_ARGUMENT` | Bad input: missing/empty `file`, `baseUrl`, `jobId`, or `filename`; invalid `timeout`; or path characters in `jobId`/`filename`. |
| `API_ERROR`        | API returned an error or non-2xx status. Check `err.status` and `err.message`.                                                   |
| `NETWORK_ERROR`    | Request failed (e.g. connection refused, DNS, CORS in browser).                                                                  |
| `TIMEOUT`          | Request took longer than `timeout` ms.                                                                                           |
| `INVALID_RESPONSE` | Response was not valid JSON or missing required fields (e.g. `job_id`, `output_files`).                                          |

**Example**

```js
const { StemSeparatorClient, StemSeparatorError, ErrorCode } = require('monarch-stems');

const client = new StemSeparatorClient();

try {
  const result = await client.separate(file);
} catch (err) {
  if (err instanceof StemSeparatorError) {
    if (err.code === ErrorCode.TIMEOUT) {
      console.log('Timed out — try a smaller file or increase timeout');
    } else if (err.code === ErrorCode.API_ERROR) {
      console.log('API error:', err.status, err.message);
    } else if (err.code === ErrorCode.INVALID_ARGUMENT) {
      console.log('Bad input:', err.message);
    }
  }
  throw err;
}
```

---

## Troubleshooting

Use this section to fix most issues without opening a GitHub issue.

### 1. "file is required" or "file path cannot be empty"

- **Cause**: `separate()` was called with `null`, `undefined`, or an empty string path.
- **Fix**: Ensure you pass a valid `File`/`Blob` (browser) or a non-empty path string / `Buffer` / `Readable` (Node). Check that the user actually selected a file before calling `separate`.

### 2. TIMEOUT — request takes too long

- **Cause**: Separation can take 1–5+ minutes for large files; default timeout is 5 minutes.
- **Fix**:
  - Use a shorter clip (e.g. 1–2 minutes) to test.
  - Increase timeout: `new StemSeparatorClient({ timeout: 600000 })` (10 min).
  - If the API is under heavy load, retry later.

### 3. API_ERROR with status 413 (Payload Too Large)

- **Cause**: File exceeds the API’s max upload size.
- **Fix**: Use a smaller file or a shorter segment. For self-hosted API, increase `MAX_UPLOAD_SIZE` in the server config (see [Stem-Separator-API](https://github.com/bantoinese83/Stem-Separator-API)).

### 4. API_ERROR with status 400 (Bad Request)

- **Cause**: Unsupported format, invalid options, or corrupt file.
- **Fix**: Use a supported format (MP3, WAV, FLAC, M4A, AAC, OGG). Ensure `stems` is `'2stems'`, `'4stems'`, or `'5stems'` and `format` is one of the allowed values. Try another file to rule out corruption.

### 5. NETWORK_ERROR or "Failed to fetch" in the browser

- **Cause**: Wrong `baseUrl`, API down, or CORS.
- **Fix**:
  - Call `await client.checkHealth()` first. If it fails, the API is unreachable or the URL is wrong.
  - For the **public Railway API**, use the default client (no `baseUrl`). If you use a custom `baseUrl`, the server must allow your origin (CORS).
  - For **Node**, check connectivity (e.g. `curl` the `baseUrl/health`).

### 6. INVALID_RESPONSE — "API response missing job_id" / "missing output_files"

- **Cause**: API returned unexpected JSON (e.g. different API version or an HTML error page).
- **Fix**: Ensure the API is [Stem-Separator-API](https://github.com/bantoinese83/Stem-Separator-API) and that the endpoint is `/api/v1/separate`. If you self-host, pull the latest API code and redeploy.

### 7. Node 16 or older — "fetch is not defined" or FormData issues

- **Cause**: Native `fetch` and `FormData` are available in Node 18+.
- **Fix**: Install `form-data` and `axios` in your project. The client will use them when `fetch` is not available.

### 8. "filename is required" or "jobId must not contain path segments"

- **Cause**: Security checks: `jobId` and `filename` must not contain `..` or path separators.
- **Fix**: Use the exact `job_id` and `output_files[n]` returned by `separate()`. Do not construct them from user input without sanitizing.

### 9. Self-hosted API — 401 or 403

- **Cause**: Your deployment requires an API key.
- **Fix**: Pass it in the client: `new StemSeparatorClient({ baseUrl: 'https://your-api.example', apiKey: 'your-key' })`. How to obtain the key depends on your deployment (env var, dashboard, etc.).

### 10. CORS in production (browser)

- **Cause**: Your frontend domain is not allowed by the API’s CORS policy.
- **Fix**: Use the default Railway API (it allows common origins), or configure your self-hosted [Stem-Separator-API](https://github.com/bantoinese83/Stem-Separator-API) to allow your origin. Alternatively, call the API from your own backend and have the browser talk to your backend.

### 11. File path does not exist (Node)

- **Cause**: You passed a string path that doesn’t exist or isn’t readable.
- **Fix**: Use `fs.existsSync(path)` before calling `separate(path)`, or catch the error (the API or Node may throw when reading the file).

### 12. Debugging checklist

- Run **`await client.checkHealth()`**. If it fails, the problem is connectivity or base URL.
- Log **`err.code`** and **`err.status`** (and `err.message`) when catching `StemSeparatorError`.
- For **browser**: open DevTools → Network, retry, and inspect the failing request (URL, status, response body).
- For **Node**: ensure the file path exists and is readable; try a small file first.

---

## Quality & testing

- **TypeScript** — Strict mode, declaration emit, `noUncheckedIndexedAccess`.
- **ESLint** — TypeScript recommended + Prettier; zero errors, zero warnings.
- **Prettier** — Consistent formatting; `npm run format:check` in CI.

**Scripts**: `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm run check` (all three), `npm test`.

**Tests**: 21 unit tests cover validation, error codes, constructor behavior, and path-traversal safety. No network calls in tests.

```bash
npm test
```

Runs `npm run build` then Node’s built-in test runner (`node --test test/index.test.js`). CI runs `npm test` before publish (see `.github/workflows/publish.yml`).

---

## License

MIT
