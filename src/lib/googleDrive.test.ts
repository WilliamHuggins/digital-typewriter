import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildMultipartBody,
  createBoundary,
  describeDriveError,
  saveToDrive,
} from './googleDrive';

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('buildMultipartBody', () => {
  it('puts metadata first and content second', () => {
    const body = buildMultipartBody('notes.txt', 'hello', 'BOUND', false);
    const parts = body.split('--BOUND');

    assert.match(parts[1], /application\/json/);
    assert.match(parts[1], /"name":"notes\.txt"/);
    assert.match(parts[2], /text\/plain/);
    assert.match(parts[2], /hello/);
  });

  it('uses CRLF line endings as the multipart spec requires', () => {
    const body = buildMultipartBody('a.txt', 'x', 'B', false);
    assert.ok(body.includes('\r\n'));
    assert.ok(!/[^\r]\n/.test(body), 'every LF is preceded by a CR');
  });

  it('terminates with the closing boundary', () => {
    const body = buildMultipartBody('a.txt', 'x', 'B', false);
    assert.ok(body.trimEnd().endsWith('--B--'));
  });

  it('requests a Google Doc only when asked', () => {
    assert.ok(!buildMultipartBody('a.txt', 'x', 'B', false).includes('vnd.google-apps.document'));
    assert.ok(buildMultipartBody('a.txt', 'x', 'B', true).includes('vnd.google-apps.document'));
  });

  it('escapes a filename containing quotes', () => {
    const body = buildMultipartBody('say "hi".txt', 'x', 'B', false);
    assert.ok(body.includes('say \\"hi\\".txt'));
  });
});

describe('createBoundary', () => {
  it('produces a distinct boundary each time', () => {
    assert.notEqual(createBoundary(), createBoundary());
  });
});

describe('saveToDrive', () => {
  const base = { accessToken: 'token', filename: 'sheet.txt', contents: 'words' };

  it('returns the created file on success', async () => {
    const result = await saveToDrive({
      ...base,
      fetchImpl: async () => jsonResponse(200, { id: '1', name: 'sheet.txt', webViewLink: 'https://drive/1' }),
    });

    assert.equal(result.ok, true);
    assert.equal(result.ok && result.file.name, 'sheet.txt');
  });

  it('sends a bearer token and a matching multipart content type', async () => {
    let seen: RequestInit | undefined;
    await saveToDrive({
      ...base,
      fetchImpl: async (_url, init) => {
        seen = init;
        return jsonResponse(200, { id: '1', name: 'sheet.txt' });
      },
    });

    const headers = seen?.headers as Record<string, string>;
    assert.equal(headers.Authorization, 'Bearer token');
    const boundary = headers['Content-Type'].split('boundary=')[1];
    assert.ok(String(seen?.body).includes(`--${boundary}`));
  });

  it('flags an expired token so the caller can re-prompt', async () => {
    const result = await saveToDrive({ ...base, fetchImpl: async () => jsonResponse(401, {}) });
    assert.equal(result.ok, false);
    assert.equal(!result.ok && result.error.kind, 'unauthorized');
  });

  it('surfaces the Drive message on a refusal', async () => {
    const result = await saveToDrive({
      ...base,
      fetchImpl: async () => jsonResponse(403, { error: { message: 'Rate limit exceeded' } }),
    });
    assert.equal(!result.ok && result.error.kind, 'forbidden');
    assert.ok(!result.ok && describeDriveError(result.error).includes('Rate limit exceeded'));
  });

  it('reports a network failure rather than throwing', async () => {
    const result = await saveToDrive({
      ...base,
      fetchImpl: async () => { throw new TypeError('offline'); },
    });
    assert.equal(!result.ok && result.error.kind, 'network');
  });

  it('handles a success status with an unreadable body', async () => {
    const result = await saveToDrive({
      ...base,
      fetchImpl: async () => new Response('<html>', { status: 200 }),
    });
    assert.equal(result.ok, false);
  });

  it('falls back to the status line when the error body is not JSON', async () => {
    const result = await saveToDrive({
      ...base,
      fetchImpl: async () => new Response('gateway down', { status: 502 }),
    });
    assert.ok(!result.ok && describeDriveError(result.error).includes('502'));
  });
});

describe('describeDriveError', () => {
  it('tells the writer what to do next', () => {
    assert.match(describeDriveError({ kind: 'unauthorized' }), /try saving again/i);
    assert.match(describeDriveError({ kind: 'network' }), /connection/i);
  });
});
