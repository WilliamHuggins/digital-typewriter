/**
 * Local persistence for the current sheet.
 *
 * An earlier revision deliberately removed persistence so that a refresh
 * cleared the pages. For a writing tool that is a data-loss bug rather than a
 * feature: work typed into the machine has to survive a reload, a crash, and a
 * closed tab.
 *
 * Everything is stored in `localStorage` under a versioned key. Nothing leaves
 * the device unless the writer explicitly exports or saves to Drive.
 */

import {
  isModelKey,
  isRibbonKey,
  type CharEmphasis,
  type CharFormat,
  type ModelKey,
  type RibbonKey,
} from './machines';

export const STORAGE_KEY = 'aiwr-typewriter/sheet/v1';

export interface PersistedSheet {
  version: 1;
  /** Writer-supplied document name, used for export filenames */
  title: string;
  text: string;
  charFormats: CharFormat[];
  charEmphasis: CharEmphasis[];
  model: ModelKey;
  ribbon: RibbonKey;
  lineSpacing: number;
  paperSize: string;
  marginPreset: string;
  customMargins: { marginTop: number; marginBottom: number; marginLeft: number; marginRight: number };
  /** Epoch ms of the last write */
  savedAt: number;
}

export const DEFAULT_TITLE = 'Untitled sheet';

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/**
 * Validate an untrusted parsed blob into a sheet.
 *
 * `localStorage` is writable by anything running on the origin and survives
 * across deploys, so a stored sheet is untrusted input: a stale or hand-edited
 * record must not be able to crash the renderer. Anything malformed returns
 * null and the app opens a fresh sheet.
 */
export function parseSheet(raw: unknown): PersistedSheet | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;

  if (o.version !== 1) return null;
  if (typeof o.text !== 'string') return null;

  // Bind after the guard so the narrowed types survive into the mapping below.
  const sheetModel = o.model;
  const sheetRibbon = o.ribbon;
  if (!isModelKey(sheetModel) || !isRibbonKey(sheetRibbon)) return null;

  const text = o.text;

  // The format and emphasis arrays are indexed by character position. If they
  // have drifted out of step with the text, rebuild rather than reject — the
  // writer's words matter more than their ink.
  const formats: CharFormat[] = Array.isArray(o.charFormats)
    ? (o.charFormats as unknown[]).slice(0, text.length).map((entry): CharFormat => {
        const e = entry as Record<string, unknown> | null;
        const entryModel = e?.model;
        const entryRibbon = e?.ribbon;
        return {
          model: isModelKey(entryModel) ? entryModel : sheetModel,
          ribbon: isRibbonKey(entryRibbon) ? entryRibbon : sheetRibbon,
        };
      })
    : [];

  const emphasis: CharEmphasis[] = Array.isArray(o.charEmphasis)
    ? (o.charEmphasis as unknown[]).slice(0, text.length).map((entry): CharEmphasis => {
        const e = entry as Record<string, unknown> | null;
        const strikes = e?.strikeCount;
        const over = e?.overstrike;
        return {
          strikeCount: isFiniteNumber(strikes) ? Math.max(1, Math.floor(strikes)) : 1,
          underline: Boolean(e?.underline),
          // An overstrike is a single glyph; anything longer is not one.
          overstrike: typeof over === 'string' && over.length === 1 ? over : undefined,
          corrected: Boolean(e?.corrected),
        };
      })
    : [];

  const margins = (o.customMargins ?? {}) as Record<string, unknown>;
  const margin = (key: string, fallback: number) =>
    isFiniteNumber(margins[key]) ? (margins[key] as number) : fallback;

  return {
    version: 1,
    title: typeof o.title === 'string' && o.title.trim() ? o.title : DEFAULT_TITLE,
    text,
    charFormats: formats,
    charEmphasis: emphasis,
    model: sheetModel,
    ribbon: sheetRibbon,
    lineSpacing: isFiniteNumber(o.lineSpacing) ? o.lineSpacing : 1,
    paperSize: typeof o.paperSize === 'string' ? o.paperSize : 'letter',
    marginPreset: typeof o.marginPreset === 'string' ? o.marginPreset : 'normal',
    customMargins: {
      marginTop: margin('marginTop', 122),
      marginBottom: margin('marginBottom', 104),
      marginLeft: margin('marginLeft', 104),
      marginRight: margin('marginRight', 104),
    },
    savedAt: isFiniteNumber(o.savedAt) ? o.savedAt : 0,
  };
}

export function loadSheet(storage: Storage | undefined = safeStorage()): PersistedSheet | null {
  if (!storage) return null;
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return parseSheet(JSON.parse(raw));
  } catch {
    // Corrupt JSON, or storage blocked mid-session. Open a fresh sheet.
    return null;
  }
}

export type SaveResult = { ok: true } | { ok: false; reason: 'unavailable' | 'quota' | 'error' };

export function saveSheet(
  sheet: Omit<PersistedSheet, 'version' | 'savedAt'>,
  storage: Storage | undefined = safeStorage(),
): SaveResult {
  if (!storage) return { ok: false, reason: 'unavailable' };

  const payload: PersistedSheet = { ...sheet, version: 1, savedAt: Date.now() };
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(payload));
    return { ok: true };
  } catch (error) {
    const quotaExceeded = error instanceof DOMException
      && (error.name === 'QuotaExceededError' || error.name === 'NS_ERROR_DOM_QUOTA_REACHED');
    return { ok: false, reason: quotaExceeded ? 'quota' : 'error' };
  }
}

export function clearSheet(storage: Storage | undefined = safeStorage()): void {
  if (!storage) return;
  try {
    storage.removeItem(STORAGE_KEY);
  } catch {
    // Nothing useful to do — the next save will surface the failure.
  }
}

/**
 * `localStorage` throws on access (not just on write) in some privacy modes,
 * so probe it once rather than assuming the property exists.
 */
export function safeStorage(): Storage | undefined {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return undefined;
    const probe = '__aiwr_probe__';
    window.localStorage.setItem(probe, '1');
    window.localStorage.removeItem(probe);
    return window.localStorage;
  } catch {
    return undefined;
  }
}
