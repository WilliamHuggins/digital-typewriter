/**
 * Getting words back out of the machine.
 *
 * The app could previously only emit a picture of a page (PNG) or a typeset
 * facsimile (PDF). Neither is text a writer can carry into another editor, so
 * this module adds the plain-text paths: download to the device, copy to the
 * clipboard, and — when configured — save to the writer's Google Drive.
 */

/**
 * The typed text is the source of truth for plain-text export.
 *
 * Deliberately not derived from the paginated document model: on this machine
 * the carriage stops at the right margin and the writer supplies every line
 * break, so the raw text already carries their intended line structure. Going
 * through the layout engine would bake page geometry into the prose.
 */
export function toPlainText(text: string): string {
  // Normalise to LF and strip trailing blank lines, keeping the writer's own
  // internal spacing untouched.
  return text.replace(/\r\n?/g, '\n').replace(/[ \t]+$/gm, '').replace(/\n+$/, '') + '\n';
}

/** Turn a document title into a filesystem-safe basename. */
export function toFileBaseName(title: string): string {
  const cleaned = title
    .normalize('NFKD')
    .replace(/[^\w\s.-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[.-]+|[.-]+$/g, '')
    .slice(0, 80);

  return cleaned || 'typewriter-sheet';
}

export interface DocumentStats {
  words: number;
  characters: number;
  lines: number;
}

export function computeStats(text: string): DocumentStats {
  const trimmed = text.trim();
  return {
    words: trimmed ? trimmed.split(/\s+/).length : 0,
    characters: text.length,
    lines: text ? text.split('\n').length : 0,
  };
}

/**
 * Trigger a download of `contents` to the writer's device.
 *
 * Uses an object URL rather than a data URL so that long documents are not
 * capped by the browser's URL-length limit.
 */
export function downloadTextFile(filename: string, contents: string): void {
  const blob = new Blob([contents], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Revoke on the next frame; revoking synchronously can cancel the download
  // in some browsers before it has started reading the blob.
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function copyToClipboard(contents: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(contents);
      return true;
    }
  } catch {
    // Permission denied, or a non-secure context. Fall through.
  }

  // execCommand is deprecated but remains the only fallback on http:// origins
  // and older Safari, where the async clipboard API is unavailable.
  try {
    const area = document.createElement('textarea');
    area.value = contents;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand('copy');
    area.remove();
    return ok;
  } catch {
    return false;
  }
}
