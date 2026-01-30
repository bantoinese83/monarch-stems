/**
 * Node/browser client for Stem-Separator-API.
 * Wraps the FastAPI stem separation API (Spleeter) for easy use.
 * @see https://github.com/bantoinese83/Stem-Separator-API
 */

import type { Readable } from 'stream';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Default base URL for the public Stem-Separator-API on Railway */
export const DEFAULT_BASE_URL = 'https://stem-separator-api-production.up.railway.app';

/** Default request timeout for separate/download (5 min) */
export const DEFAULT_TIMEOUT_MS = 300_000;

/** Timeout for health check */
export const HEALTH_TIMEOUT_MS = 10_000;

/** API path for separate endpoint (no leading slash; appended to baseUrl) */
export const API_PATH_SEPARATE = '/api/v1/separate';

/** API path template for download: /api/v1/separate/:jobId/download/:filename */
export const API_PATH_DOWNLOAD = '/api/v1/separate';

/** API path for health */
export const API_PATH_HEALTH = '/health';

/** Default filename when not provided */
export const DEFAULT_FILENAME = 'audio';

/** Valid stems query values */
export const VALID_STEMS = ['2stems', '4stems', '5stems'] as const;

/** Valid format query values */
export const VALID_FORMATS = ['wav', 'mp3', 'flac', 'm4a', 'aac', 'ogg'] as const;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface StemSeparatorClientOptions {
  /** API base URL (no trailing slash). Defaults to public Railway deployment. */
  baseUrl?: string;
  /** Optional API key for Authorization: Bearer (if your deployment uses it) */
  apiKey?: string;
  /** Request timeout in ms. Default 300000 (5 min) for long-running separation. */
  timeout?: number;
}

/** Stems option: 2 (vocals + accompaniment), 4, or 5 stems. */
export type StemsOption = (typeof VALID_STEMS)[number];

/** Output format for separated stems. */
export type FormatOption = (typeof VALID_FORMATS)[number];

export interface SeparateOptions {
  /** Filename sent in the multipart form (default: "audio"). */
  filename?: string;
  /** Number of stems. Default "2stems". */
  stems?: StemsOption;
  /** Output bitrate (e.g. "320k"). Default "320k". */
  bitrate?: string;
  /** Output format. Default "wav". */
  format?: FormatOption;
}

/** Response from POST /api/v1/separate. */
export interface SeparateResponse {
  success: boolean;
  message: string;
  job_id: string;
  stems: StemsOption;
  output_files: string[];
  processing_time: number;
}

/**
 * Accepted input for `separate()`: browser (File | Blob), Node (path string | Buffer | Readable stream).
 */
export type SeparateInput = File | Blob | Buffer | string | Readable;

/** Health check response. */
export interface HealthResponse {
  status: string;
  version?: string;
  service?: string;
}

/** Form-like interface for browser FormData or Node form-data package */
interface FormLike {
  append(name: string, value: unknown, options?: string | { filename?: string }): void;
  getHeaders?(): Record<string, string>;
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

/**
 * Stable error codes for StemSeparatorError. Use these to handle errors programmatically.
 *
 * - INVALID_ARGUMENT: Bad file, baseUrl, jobId, filename, or timeout.
 * - API_ERROR: API returned non-2xx or error payload; check err.status.
 * - NETWORK_ERROR: Request failed (e.g. connection refused, CORS).
 * - TIMEOUT: Request exceeded timeout ms.
 * - INVALID_RESPONSE: Response was not valid JSON or missing job_id/output_files.
 */
export const ErrorCode = {
  INVALID_ARGUMENT: 'INVALID_ARGUMENT',
  API_ERROR: 'API_ERROR',
  NETWORK_ERROR: 'NETWORK_ERROR',
  TIMEOUT: 'TIMEOUT',
  INVALID_RESPONSE: 'INVALID_RESPONSE',
} as const;

export type ErrorCodeType = (typeof ErrorCode)[keyof typeof ErrorCode];

/**
 * Error thrown by the client with a stable code for programmatic handling.
 *
 * Use `err.code` to branch: `ErrorCode.TIMEOUT`, `ErrorCode.API_ERROR`, etc.
 * For API errors, `err.status` is the HTTP status (e.g. 400, 413, 500).
 *
 * @example
 * try {
 *   await client.separate(file);
 * } catch (err) {
 *   if (err instanceof StemSeparatorError && err.code === ErrorCode.TIMEOUT) {
 *     console.log('Increase timeout or use a shorter file');
 *   }
 * }
 */
export class StemSeparatorError extends Error {
  readonly code: ErrorCodeType;
  readonly status?: number;
  readonly cause?: unknown;

  constructor(
    message: string,
    options: {
      code: ErrorCodeType;
      status?: number;
      cause?: unknown;
    }
  ) {
    super(message);
    this.name = 'StemSeparatorError';
    this.code = options.code;
    this.status = options.status;
    this.cause = options.cause;
    Object.setPrototypeOf(this, StemSeparatorError.prototype);
  }
}

// ---------------------------------------------------------------------------
// Validation (single responsibility: reject invalid input before I/O)
// ---------------------------------------------------------------------------

function assertValidFileInput(file: SeparateInput): void {
  if (file == null) {
    throw new StemSeparatorError('file is required', {
      code: ErrorCode.INVALID_ARGUMENT,
    });
  }
  if (typeof file === 'string') {
    const trimmed = file.trim();
    if (trimmed.length === 0) {
      throw new StemSeparatorError('file path cannot be empty', {
        code: ErrorCode.INVALID_ARGUMENT,
      });
    }
  }
}

function normalizeBaseUrl(baseUrl: string): string {
  const trimmed = baseUrl.trim();
  if (trimmed.length === 0) {
    throw new StemSeparatorError('baseUrl is required', {
      code: ErrorCode.INVALID_ARGUMENT,
    });
  }
  return trimmed.replace(/\/+$/, '');
}

function assertValidJobId(jobId: string): void {
  const trimmed = jobId?.trim();
  if (!trimmed || trimmed.length === 0) {
    throw new StemSeparatorError('jobId is required', {
      code: ErrorCode.INVALID_ARGUMENT,
    });
  }
  // Prevent path traversal when jobId is used in URL path
  if (/\.\.|\/|\\/.test(trimmed)) {
    throw new StemSeparatorError('jobId must not contain path segments', {
      code: ErrorCode.INVALID_ARGUMENT,
    });
  }
}

function sanitizeFilename(filename: string): string {
  // Reject path traversal in input (e.g. ../vocals.wav)
  if (filename.includes('..')) {
    throw new StemSeparatorError('filename must not contain ..', {
      code: ErrorCode.INVALID_ARGUMENT,
    });
  }
  const base = filename.replace(/^.*[/\\]/, '').trim();
  if (base.length === 0) {
    throw new StemSeparatorError('filename is required and must not be empty', {
      code: ErrorCode.INVALID_ARGUMENT,
    });
  }
  return base;
}

function buildSeparateQueryString(options: SeparateOptions): string {
  const params = new URLSearchParams();
  if (options.stems && VALID_STEMS.includes(options.stems)) {
    params.set('stems', options.stems);
  }
  if (options.bitrate && options.bitrate.trim().length > 0) {
    params.set('bitrate', options.bitrate.trim());
  }
  if (options.format && VALID_FORMATS.includes(options.format)) {
    params.set('format', options.format);
  }
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

function getAuthHeaders(apiKey: string): Record<string, string> {
  const headers: Record<string, string> = {};
  if (apiKey && apiKey.trim().length > 0) {
    headers['Authorization'] = `Bearer ${apiKey.trim()}`;
  }
  return headers;
}

/** Parse and validate API JSON; throw StemSeparatorError on failure or malformed shape. */
function parseSeparateResponse(body: unknown): SeparateResponse {
  if (body == null || typeof body !== 'object') {
    throw new StemSeparatorError('API response is not an object', {
      code: ErrorCode.INVALID_RESPONSE,
    });
  }
  const obj = body as Record<string, unknown>;
  const success = obj.success;
  const jobId = obj.job_id;
  const outputFiles = obj.output_files;

  // Explicit failure from API (e.g. processing error)
  if (success === false) {
    const message = typeof obj.message === 'string' ? obj.message : 'Separation failed';
    throw new StemSeparatorError(message, {
      code: ErrorCode.API_ERROR,
      status: typeof obj.status === 'number' ? obj.status : undefined,
    });
  }
  if (success !== true) {
    throw new StemSeparatorError('API response missing success: true', {
      code: ErrorCode.INVALID_RESPONSE,
    });
  }

  // Required fields for a successful separation response
  if (typeof jobId !== 'string' || jobId.trim().length === 0) {
    throw new StemSeparatorError('API response missing valid job_id', {
      code: ErrorCode.INVALID_RESPONSE,
    });
  }
  if (!Array.isArray(outputFiles)) {
    throw new StemSeparatorError('API response missing output_files array', {
      code: ErrorCode.INVALID_RESPONSE,
    });
  }

  const stems =
    typeof obj.stems === 'string' && VALID_STEMS.includes(obj.stems as StemsOption)
      ? (obj.stems as StemsOption)
      : '2stems';

  return {
    success: true,
    message: typeof obj.message === 'string' ? obj.message : '',
    job_id: jobId,
    stems,
    output_files: outputFiles.filter(
      (f): f is string => typeof f === 'string' && f.length > 0
    ),
    processing_time:
      typeof obj.processing_time === 'number' && obj.processing_time >= 0
        ? obj.processing_time
        : 0,
  };
}

// ---------------------------------------------------------------------------
// Form building (Node vs browser: FormData global vs form-data package)
// ---------------------------------------------------------------------------

/**
 * Build multipart form for the file. Browser: native FormData. Node 18+: global FormData
 * or path/stream; Node before 18: require('form-data') and optionally getHeaders() for Content-Type.
 */
function createForm(
  file: SeparateInput,
  filename: string
): { form: FormLike; formHeaders: Record<string, string> } {
  const isBrowserFormData =
    typeof FormData !== 'undefined' && (file instanceof File || file instanceof Blob);

  if (isBrowserFormData) {
    const form = new FormData();
    form.append('file', file as File | Blob, filename);
    return { form, formHeaders: {} };
  }

  if (typeof FormData !== 'undefined' && typeof file === 'string') {
    const form = new FormData() as FormLike;
    const fs = require('fs') as typeof import('fs');
    const path = require('path') as typeof import('path');
    const streamName = path.basename(file) || filename;
    form.append('file', fs.createReadStream(file), streamName);
    return { form, formHeaders: {} };
  }

  if (typeof FormData !== 'undefined') {
    const form = new FormData() as FormLike;
    form.append('file', file as Buffer | Readable, filename);
    return { form, formHeaders: {} };
  }

  // Node without global FormData: use form-data package (adds getHeaders() for multipart boundary)
  const FormDataNode = require('form-data') as new () => FormLike;
  const form = new FormDataNode();
  if (typeof file === 'string') {
    const fs = require('fs') as typeof import('fs');
    const path = require('path') as typeof import('path');
    const streamName = path.basename(file) || filename;
    form.append('file', fs.createReadStream(file), { filename: streamName });
  } else {
    form.append('file', file, { filename });
  }
  const formHeaders = form.getHeaders ? form.getHeaders() : {};
  return { form, formHeaders };
}

// ---------------------------------------------------------------------------
// Error mapping (Node axios → StemSeparatorError)
// ---------------------------------------------------------------------------

function throwAxiosError(
  err: unknown,
  messages: { onTimeout: string; onNetwork: string }
): never {
  const axiosErr = err as {
    response?: { status?: number; data?: unknown };
    message?: string;
  };
  if (axiosErr?.response != null) {
    const status = axiosErr.response.status;
    const data = axiosErr.response.data;
    const message =
      typeof data === 'object' && data != null && 'detail' in data
        ? String((data as { detail: unknown }).detail)
        : `API error: ${status}`;
    throw new StemSeparatorError(message, {
      code: ErrorCode.API_ERROR,
      status,
      cause: err,
    });
  }
  if (axiosErr?.message?.includes('timeout')) {
    throw new StemSeparatorError(messages.onTimeout, {
      code: ErrorCode.TIMEOUT,
      cause: err,
    });
  }
  throw new StemSeparatorError(axiosErr?.message ?? messages.onNetwork, {
    code: ErrorCode.NETWORK_ERROR,
    cause: err,
  });
}

// ---------------------------------------------------------------------------
// Fetch with timeout (browser only; Node path uses axios which has built-in timeout)
// ---------------------------------------------------------------------------

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      ...init,
      signal: controller.signal,
    });
    return res;
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new StemSeparatorError(`Request timed out after ${timeoutMs}ms`, {
        code: ErrorCode.TIMEOUT,
        cause: err,
      });
    }
    throw new StemSeparatorError(
      err instanceof Error ? err.message : 'Network request failed',
      { code: ErrorCode.NETWORK_ERROR, cause: err }
    );
  } finally {
    clearTimeout(timeoutId);
  }
}

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

/**
 * Client for the Stem-Separator-API. Use default constructor to hit the public Railway API,
 * or pass `baseUrl` (and optionally `apiKey`) for self-hosted instances.
 *
 * @example
 * const client = new StemSeparatorClient();
 * const result = await client.separate('/path/to/song.mp3', { stems: '2stems' });
 * const buffer = await client.downloadStem(result.job_id, result.output_files[0]);
 */
export class StemSeparatorClient {
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly timeout: number;

  constructor(options: StemSeparatorClientOptions = {}) {
    const baseUrl = normalizeBaseUrl(options.baseUrl?.trim() ?? DEFAULT_BASE_URL);
    this.baseUrl = baseUrl;
    this.apiKey = options.apiKey ?? '';
    const timeout = options.timeout ?? DEFAULT_TIMEOUT_MS;
    if (typeof timeout !== 'number' || timeout < 1) {
      throw new StemSeparatorError('timeout must be a positive number', {
        code: ErrorCode.INVALID_ARGUMENT,
      });
    }
    this.timeout = timeout;
  }

  /**
   * Separate an audio file into stems (vocals, drums, bass, etc.).
   * Accepts: File/Blob (browser), Buffer/Readable/file path (Node).
   *
   * @param file - Audio: File or Blob (browser), or path string, Buffer, or Readable (Node).
   * @param options - Optional: stems ('2stems'|'4stems'|'5stems'), format, bitrate, filename.
   * @returns SeparateResponse with job_id and output_files; use getStemDownloadUrl or downloadStem to fetch stems.
   * @throws {StemSeparatorError} INVALID_ARGUMENT if file is null/empty; API_ERROR/TIMEOUT/NETWORK_ERROR/INVALID_RESPONSE on failure.
   */
  async separate(
    file: SeparateInput,
    options: SeparateOptions = {}
  ): Promise<SeparateResponse> {
    assertValidFileInput(file);
    const filename =
      options.filename?.trim() && options.filename.trim().length > 0
        ? sanitizeFilename(options.filename.trim())
        : DEFAULT_FILENAME;

    const queryString = buildSeparateQueryString(options);
    const url = `${this.baseUrl}${API_PATH_SEPARATE}${queryString}`;
    const headers = getAuthHeaders(this.apiKey);
    const { form, formHeaders } = createForm(file, filename);
    Object.assign(headers, formHeaders);

    if (typeof fetch === 'undefined') {
      const axios = require('axios') as import('axios').AxiosStatic;
      try {
        const res = await axios.post<unknown>(url, form, {
          headers,
          timeout: this.timeout,
          responseType: 'json',
          maxContentLength: Infinity,
          maxBodyLength: Infinity,
        });
        return parseSeparateResponse(res.data);
      } catch (err) {
        throwAxiosError(err, {
          onTimeout: `Request timed out after ${this.timeout}ms`,
          onNetwork: 'Request failed',
        });
      }
    }

    const res = await fetchWithTimeout(
      url,
      { method: 'POST', headers, body: form as BodyInit },
      this.timeout
    );
    let body: unknown;
    try {
      body = await res.json();
    } catch {
      const text = await res.text();
      throw new StemSeparatorError(
        `API error: ${res.status} ${res.statusText} - ${text}`,
        { code: ErrorCode.API_ERROR, status: res.status }
      );
    }
    if (!res.ok) {
      throw new StemSeparatorError(
        typeof body === 'object' && body != null && 'detail' in body
          ? String((body as { detail: unknown }).detail)
          : `API error: ${res.status} ${res.statusText}`,
        { code: ErrorCode.API_ERROR, status: res.status }
      );
    }
    return parseSeparateResponse(body);
  }

  /**
   * Returns the URL to download a stem file for a completed job.
   * Use the exact job_id and filename from separate()'s response (e.g. result.output_files[0]).
   *
   * @param jobId - From SeparateResponse.job_id.
   * @param filename - From SeparateResponse.output_files (e.g. 'vocals.wav').
   * @throws {StemSeparatorError} INVALID_ARGUMENT if jobId or filename is empty or contains path segments.
   */
  getStemDownloadUrl(jobId: string, filename: string): string {
    assertValidJobId(jobId);
    const safeName = sanitizeFilename(filename);
    const encodedJob = encodeURIComponent(jobId);
    const encodedFile = encodeURIComponent(safeName);
    return `${this.baseUrl}${API_PATH_DOWNLOAD}/${encodedJob}/download/${encodedFile}`;
  }

  /**
   * Downloads a stem file. Returns the file body as ArrayBuffer.
   * In Node, use Buffer.from(arrayBuffer) to get a Buffer for writing to disk.
   *
   * @param jobId - From SeparateResponse.job_id.
   * @param filename - From SeparateResponse.output_files.
   * @throws {StemSeparatorError} INVALID_ARGUMENT, API_ERROR, TIMEOUT, or NETWORK_ERROR.
   */
  async downloadStem(jobId: string, filename: string): Promise<ArrayBuffer> {
    assertValidJobId(jobId);
    sanitizeFilename(filename);
    const url = this.getStemDownloadUrl(jobId, filename);
    const headers = getAuthHeaders(this.apiKey);

    if (typeof fetch === 'undefined') {
      const axios = require('axios') as import('axios').AxiosStatic;
      try {
        const res = await axios.get<ArrayBuffer>(url, {
          headers,
          timeout: this.timeout,
          responseType: 'arraybuffer',
        });
        return res.data;
      } catch (err) {
        throwAxiosError(err, {
          onTimeout: `Download timed out after ${this.timeout}ms`,
          onNetwork: 'Download failed',
        });
      }
    }

    const res = await fetchWithTimeout(url, { method: 'GET', headers }, this.timeout);
    if (!res.ok) {
      const text = await res.text();
      throw new StemSeparatorError(
        `Download error: ${res.status} ${res.statusText} - ${text}`,
        { code: ErrorCode.API_ERROR, status: res.status }
      );
    }
    return res.arrayBuffer();
  }

  /**
   * Check API health. Returns service status (no auth required for public API).
   * Call this first when debugging connectivity issues.
   *
   * @returns HealthResponse with status, version?, service?.
   * @throws {StemSeparatorError} API_ERROR or NETWORK_ERROR if the API is unreachable.
   */
  async checkHealth(): Promise<HealthResponse> {
    const url = `${this.baseUrl}${API_PATH_HEALTH}`;
    if (typeof fetch === 'undefined') {
      const axios = require('axios') as import('axios').AxiosStatic;
      try {
        const res = await axios.get<HealthResponse>(url, {
          timeout: HEALTH_TIMEOUT_MS,
          responseType: 'json',
        });
        return res.data;
      } catch (err) {
        throwAxiosError(err, {
          onTimeout: 'Health check failed',
          onNetwork: 'Health check failed',
        });
      }
    }
    const res = await fetchWithTimeout(url, { method: 'GET' }, HEALTH_TIMEOUT_MS);
    if (!res.ok) {
      throw new StemSeparatorError(`Health check failed: ${res.status}`, {
        code: ErrorCode.API_ERROR,
        status: res.status,
      });
    }
    const data = (await res.json()) as HealthResponse;
    return data;
  }
}

export { StemSeparatorClient as default };
