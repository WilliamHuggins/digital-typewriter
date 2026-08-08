/**
 * Saving a sheet to the writer's own Google Drive.
 *
 * Scope is `drive.file`, which grants access only to files this app itself
 * creates. It cannot read, list or modify anything else in the writer's Drive.
 * That is the narrowest scope that can still save a document, and it is the
 * right one here: the app has no reason to see the rest of someone's files.
 *
 * The whole feature is optional. Without a configured OAuth client the Drive
 * button never renders and the app behaves exactly as it does today — local
 * export and clipboard remain the primary paths.
 */

const UPLOAD_ENDPOINT = 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink';

export const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';

/**
 * OAuth client ID, supplied at build time.
 *
 * A client ID is not a secret — it is visible in the OAuth redirect of every
 * web app that uses Google sign-in — so shipping it in the bundle is expected.
 * Access is controlled by the authorised-origins list on the client, not by
 * hiding this value.
 */
export function getGoogleClientId(): string | undefined {
  const raw = import.meta.env.VITE_GOOGLE_CLIENT_ID;
  const trimmed = typeof raw === 'string' ? raw.trim() : '';
  return trimmed || undefined;
}

export function isDriveConfigured(): boolean {
  return getGoogleClientId() !== undefined;
}

export interface DriveFile {
  id: string;
  name: string;
  webViewLink?: string;
}

export type DriveSaveError =
  | { kind: 'unauthorized' }
  | { kind: 'forbidden'; message: string }
  | { kind: 'network' }
  | { kind: 'unknown'; message: string };

export type DriveSaveResult =
  | { ok: true; file: DriveFile }
  | { ok: false; error: DriveSaveError };

/**
 * Build the multipart/related body Drive expects for a metadata + content
 * upload in a single request.
 *
 * The boundary is randomised per call so that document text containing a
 * literal boundary string cannot terminate the body early.
 */
export function buildMultipartBody(
  filename: string,
  contents: string,
  boundary: string,
  asGoogleDoc: boolean,
): string {
  const metadata: Record<string, string> = { name: filename };
  if (asGoogleDoc) {
    // Drive converts an uploaded text/plain body into an editable Google Doc
    // when the target mime type asks for one.
    metadata.mimeType = 'application/vnd.google-apps.document';
  }

  return [
    `--${boundary}`,
    'Content-Type: application/json; charset=UTF-8',
    '',
    JSON.stringify(metadata),
    `--${boundary}`,
    'Content-Type: text/plain; charset=UTF-8',
    '',
    contents,
    `--${boundary}--`,
    '',
  ].join('\r\n');
}

export function createBoundary(): string {
  const random = typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36);
  return `aiwr-${random}`;
}

export interface DriveSaveOptions {
  accessToken: string;
  filename: string;
  contents: string;
  /** Upload as an editable Google Doc instead of a plain .txt file */
  asGoogleDoc?: boolean;
  fetchImpl?: typeof fetch;
}

export async function saveToDrive({
  accessToken,
  filename,
  contents,
  asGoogleDoc = false,
  fetchImpl = fetch,
}: DriveSaveOptions): Promise<DriveSaveResult> {
  const boundary = createBoundary();
  const body = buildMultipartBody(filename, contents, boundary, asGoogleDoc);

  let response: Response;
  try {
    response = await fetchImpl(UPLOAD_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': `multipart/related; boundary=${boundary}`,
      },
      body,
    });
  } catch {
    return { ok: false, error: { kind: 'network' } };
  }

  if (response.status === 401) {
    return { ok: false, error: { kind: 'unauthorized' } };
  }

  if (!response.ok) {
    const message = await readErrorMessage(response);
    if (response.status === 403) {
      return { ok: false, error: { kind: 'forbidden', message } };
    }
    return { ok: false, error: { kind: 'unknown', message } };
  }

  try {
    const file = (await response.json()) as DriveFile;
    return { ok: true, file };
  } catch {
    return { ok: false, error: { kind: 'unknown', message: 'Drive returned an unreadable response.' } };
  }
}

async function readErrorMessage(response: Response): Promise<string> {
  try {
    const payload = await response.json();
    const message = payload?.error?.message;
    if (typeof message === 'string' && message) return message;
  } catch {
    // Body was not JSON; fall back to the status line.
  }
  return `Drive responded ${response.status}.`;
}

/** Human-readable text for a failed save, written for the writer, not the log. */
export function describeDriveError(error: DriveSaveError): string {
  switch (error.kind) {
    case 'unauthorized':
      return 'Google sign-in expired. Try saving again to reconnect.';
    case 'forbidden':
      return `Google Drive refused the upload. ${error.message}`;
    case 'network':
      return 'Could not reach Google Drive. Check your connection and try again.';
    default:
      return error.message;
  }
}
