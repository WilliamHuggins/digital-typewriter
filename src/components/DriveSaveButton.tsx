import React, { useState } from 'react';
import { useGoogleLogin } from '@react-oauth/google';
import { Cloud, Loader2 } from 'lucide-react';
import { DRIVE_SCOPE, describeDriveError, saveToDrive } from '../lib/googleDrive';

interface DriveSaveButtonProps {
  /** Called to produce the file contents at the moment of saving */
  getContents: () => string;
  getFilename: () => string;
  onResult: (message: string, tone: 'ok' | 'error') => void;
  compact?: boolean;
}

/**
 * Saves the current sheet to the writer's Google Drive.
 *
 * Rendered only when an OAuth client is configured — see `isDriveConfigured`.
 * The token is requested at save time and never stored: this is an implicit
 * flow with no refresh token, so closing the tab ends the grant.
 */
export function DriveSaveButton({ getContents, getFilename, onResult, compact }: DriveSaveButtonProps) {
  const [saving, setSaving] = useState(false);

  const requestToken = useGoogleLogin({
    flow: 'implicit',
    scope: DRIVE_SCOPE,
    onSuccess: async (response) => {
      const result = await saveToDrive({
        accessToken: response.access_token,
        filename: getFilename(),
        contents: getContents(),
      });

      setSaving(false);

      if (result.ok) {
        onResult(`Saved “${result.file.name}” to Google Drive.`, 'ok');
      } else {
        onResult(describeDriveError(result.error), 'error');
      }
    },
    onError: () => {
      setSaving(false);
      onResult('Google sign-in was cancelled or refused.', 'error');
    },
    onNonOAuthError: () => {
      setSaving(false);
      // Fired when the consent popup is dismissed or blocked by the browser.
      onResult('The Google sign-in window did not open. Check your popup blocker.', 'error');
    },
  });

  return (
    <button
      type="button"
      onClick={() => {
        setSaving(true);
        requestToken();
      }}
      disabled={saving}
      className={
        compact
          ? 'rounded border border-zinc-700 bg-zinc-800 px-3 py-2 text-left disabled:opacity-60'
          : 'inline-flex items-center gap-1.5 rounded border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-sm hover:bg-zinc-700 disabled:opacity-60'
      }
      title="Save this sheet to your Google Drive"
    >
      {saving
        ? <Loader2 size={16} className="animate-spin" aria-hidden="true" />
        : <Cloud size={16} aria-hidden="true" />}
      {saving ? 'Saving…' : 'Drive'}
    </button>
  );
}
