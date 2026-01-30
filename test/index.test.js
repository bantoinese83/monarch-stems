'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert');
const {
  StemSeparatorClient,
  StemSeparatorError,
  ErrorCode,
  DEFAULT_BASE_URL,
  API_PATH_SEPARATE,
  API_PATH_DOWNLOAD,
  API_PATH_HEALTH,
  VALID_STEMS,
  VALID_FORMATS,
} = require('../dist/index.js');

describe('StemSeparatorClient constructor', () => {
  it('creates client with default options', () => {
    const client = new StemSeparatorClient();
    assert.strictEqual(
      client.getStemDownloadUrl('job-1', 'vocals.wav').startsWith(DEFAULT_BASE_URL),
      true
    );
  });

  it('throws INVALID_ARGUMENT when baseUrl is empty', () => {
    assert.throws(
      () => new StemSeparatorClient({ baseUrl: '' }),
      (err) =>
        err instanceof StemSeparatorError && err.code === ErrorCode.INVALID_ARGUMENT
    );
  });

  it('throws INVALID_ARGUMENT when baseUrl is whitespace', () => {
    assert.throws(
      () => new StemSeparatorClient({ baseUrl: '   ' }),
      (err) =>
        err instanceof StemSeparatorError && err.code === ErrorCode.INVALID_ARGUMENT
    );
  });

  it('throws INVALID_ARGUMENT when timeout is not a positive number', () => {
    assert.throws(
      () => new StemSeparatorClient({ baseUrl: 'https://api.example.com', timeout: 0 }),
      (err) =>
        err instanceof StemSeparatorError && err.code === ErrorCode.INVALID_ARGUMENT
    );
    assert.throws(
      () => new StemSeparatorClient({ baseUrl: 'https://api.example.com', timeout: -1 }),
      (err) =>
        err instanceof StemSeparatorError && err.code === ErrorCode.INVALID_ARGUMENT
    );
  });

  it('normalizes baseUrl by stripping trailing slashes', () => {
    const client = new StemSeparatorClient({ baseUrl: 'https://api.example.com///' });
    const url = client.getStemDownloadUrl('job-1', 'vocals.wav');
    assert.ok(url.startsWith('https://api.example.com/'));
    assert.ok(!url.includes('///'));
  });
});

describe('getStemDownloadUrl', () => {
  const client = new StemSeparatorClient({ baseUrl: 'https://api.example.com' });

  it('throws INVALID_ARGUMENT when jobId is empty', () => {
    assert.throws(
      () => client.getStemDownloadUrl('', 'vocals.wav'),
      (err) =>
        err instanceof StemSeparatorError && err.code === ErrorCode.INVALID_ARGUMENT
    );
  });

  it('throws INVALID_ARGUMENT when jobId contains path segments', () => {
    assert.throws(
      () => client.getStemDownloadUrl('../job', 'vocals.wav'),
      (err) =>
        err instanceof StemSeparatorError && err.code === ErrorCode.INVALID_ARGUMENT
    );
    assert.throws(
      () => client.getStemDownloadUrl('job/id', 'vocals.wav'),
      (err) =>
        err instanceof StemSeparatorError && err.code === ErrorCode.INVALID_ARGUMENT
    );
  });

  it('throws INVALID_ARGUMENT when filename is empty', () => {
    assert.throws(
      () => client.getStemDownloadUrl('job-1', ''),
      (err) => err.code === ErrorCode.INVALID_ARGUMENT
    );
  });

  it('throws INVALID_ARGUMENT when filename contains path traversal', () => {
    assert.throws(
      () => client.getStemDownloadUrl('job-1', '../vocals.wav'),
      (err) => err.code === ErrorCode.INVALID_ARGUMENT
    );
  });

  it('returns URL with encoded jobId and filename', () => {
    const url = client.getStemDownloadUrl('job-1', 'vocals.wav');
    assert.ok(url.includes(API_PATH_DOWNLOAD));
    assert.ok(url.includes('job-1'));
    assert.ok(url.includes('vocals.wav'));
    assert.ok(url.includes('/download/'));
  });
});

describe('separate() validation', () => {
  const client = new StemSeparatorClient({ baseUrl: 'https://api.example.com' });

  it('throws INVALID_ARGUMENT when file is null', async () => {
    await assert.rejects(
      () => client.separate(null),
      (err) =>
        err instanceof StemSeparatorError && err.code === ErrorCode.INVALID_ARGUMENT
    );
  });

  it('throws INVALID_ARGUMENT when file is undefined', async () => {
    await assert.rejects(
      () => client.separate(undefined),
      (err) =>
        err instanceof StemSeparatorError && err.code === ErrorCode.INVALID_ARGUMENT
    );
  });

  it('throws INVALID_ARGUMENT when file path is empty string', async () => {
    await assert.rejects(
      () => client.separate(''),
      (err) =>
        err instanceof StemSeparatorError && err.code === ErrorCode.INVALID_ARGUMENT
    );
  });

  it('throws INVALID_ARGUMENT when file path is whitespace', async () => {
    await assert.rejects(
      () => client.separate('   '),
      (err) =>
        err instanceof StemSeparatorError && err.code === ErrorCode.INVALID_ARGUMENT
    );
  });
});

describe('downloadStem() validation', () => {
  const client = new StemSeparatorClient({ baseUrl: 'https://api.example.com' });

  it('throws INVALID_ARGUMENT when jobId is empty', async () => {
    await assert.rejects(
      () => client.downloadStem('', 'vocals.wav'),
      (err) =>
        err instanceof StemSeparatorError && err.code === ErrorCode.INVALID_ARGUMENT
    );
  });

  it('throws INVALID_ARGUMENT when filename contains path traversal', async () => {
    await assert.rejects(
      () => client.downloadStem('job-1', '../vocals.wav'),
      (err) => err.code === ErrorCode.INVALID_ARGUMENT
    );
  });
});

describe('StemSeparatorError', () => {
  it('has name StemSeparatorError and preserves code, status, cause', () => {
    const cause = new Error('underlying');
    const err = new StemSeparatorError('test', {
      code: ErrorCode.API_ERROR,
      status: 400,
      cause,
    });
    assert.strictEqual(err.name, 'StemSeparatorError');
    assert.strictEqual(err.message, 'test');
    assert.strictEqual(err.code, ErrorCode.API_ERROR);
    assert.strictEqual(err.status, 400);
    assert.strictEqual(err.cause, cause);
    assert.ok(err instanceof StemSeparatorError);
    assert.ok(err instanceof Error);
  });
});

describe('ErrorCode', () => {
  it('exposes all expected codes', () => {
    assert.strictEqual(ErrorCode.INVALID_ARGUMENT, 'INVALID_ARGUMENT');
    assert.strictEqual(ErrorCode.API_ERROR, 'API_ERROR');
    assert.strictEqual(ErrorCode.NETWORK_ERROR, 'NETWORK_ERROR');
    assert.strictEqual(ErrorCode.TIMEOUT, 'TIMEOUT');
    assert.strictEqual(ErrorCode.INVALID_RESPONSE, 'INVALID_RESPONSE');
  });
});

describe('Constants', () => {
  it('DEFAULT_BASE_URL is the Railway API', () => {
    assert.ok(DEFAULT_BASE_URL.startsWith('https://'));
    assert.ok(DEFAULT_BASE_URL.includes('railway'));
  });

  it('API paths are non-empty and start with /', () => {
    assert.strictEqual(API_PATH_SEPARATE, '/api/v1/separate');
    assert.ok(API_PATH_DOWNLOAD.startsWith('/'));
    assert.strictEqual(API_PATH_HEALTH, '/health');
  });

  it('VALID_STEMS and VALID_FORMATS are arrays', () => {
    assert.ok(Array.isArray(VALID_STEMS));
    assert.ok(Array.isArray(VALID_FORMATS));
    assert.ok(VALID_STEMS.includes('2stems'));
    assert.ok(VALID_FORMATS.includes('wav'));
  });
});
