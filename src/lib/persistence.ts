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

// ---------------------------------------------------------------------------
// Run-length encoding for the per-character arrays
//
// Format and emphasis are stored one entry per character. Written out plainly,
// a 350-line sheet came to 1.78 MB — against a localStorage quota that is
// typically 5 MB, so a long short story would simply fail to save. In practice
// those arrays are enormously repetitive: most documents are one machine, one
// ribbon, and no corrections from end to end. Runs collapse that to a handful
// of entries.
// ---------------------------------------------------------------------------

/** `[runLength, model, ribbon]` */
export type FormatRun = [number, ModelKey, RibbonKey];
/** `[runLength, strikeCount, underline, overstrike, corrected]` */
export type EmphasisRun = [number, number, 0 | 1, string | 0, 0 | 1];

export function encodeFormats(formats: CharFormat[]): FormatRun[] {
  const runs: FormatRun[] = [];
  for (const entry of formats) {
    const last = runs[runs.length - 1];
    if (last && last[1] === entry.model && last[2] === entry.ribbon) {
      last[0]++;
    } else {
      runs.push([1, entry.model, entry.ribbon]);
    }
  }
  return runs;
}

export function encodeEmphasis(emphasis: CharEmphasis[]): EmphasisRun[] {
  const runs: EmphasisRun[] = [];
  for (const entry of emphasis) {
    const strike = entry.strikeCount;
    const under: 0 | 1 = entry.underline ? 1 : 0;
    const over = entry.overstrike ?? 0;
    const corrected: 0 | 1 = entry.corrected ? 1 : 0;

    const last = runs[runs.length - 1];
    if (last && last[1] === strike && last[2] === under && last[3] === over && last[4] === corrected) {
      last[0]++;
    } else {
      runs.push([1, strike, under, over, corrected]);
    }
  }
  return runs;
}

/** Expand runs, stopping at `limit` so a corrupt count cannot allocate wildly. */
function expandRuns<T>(runs: unknown, limit: number, decode: (run: unknown[]) => T | null): T[] | null {
  if (!Array.isArray(runs)) return null;

  const out: T[] = [];
  for (const run of runs) {
    if (!Array.isArray(run) || !isFiniteNumber(run[0])) return null;
    const value = decode(run);
    if (value === null) return null;

    const count = Math.min(Math.max(0, Math.floor(run[0])), limit - out.length);
    for (let i = 0; i < count; i++) out.push(value);
    if (out.length >= limit) break;
  }
  return out;
}

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
  //
  // Two shapes are accepted: runs (what this version writes) and the older
  // one-entry-per-character arrays, so a sheet saved before run-length encoding
  // still opens.
  const formats: CharFormat[] = expandRuns<CharFormat>(o.charFormats, text.length, (run) => {
    const [, runModel, runRibbon] = run;
    return {
      model: isModelKey(runModel) ? runModel : sheetModel,
      ribbon: isRibbonKey(runRibbon) ? runRibbon : sheetRibbon,
    };
  }) ?? readLegacyFormats(o.charFormats, text.length, sheetModel, sheetRibbon);

  const emphasis: CharEmphasis[] = expandRuns<CharEmphasis>(o.charEmphasis, text.length, (run) => {
    const [, strikes, under, over, corrected] = run;
    return {
      strikeCount: isFiniteNumber(strikes) ? Math.max(1, Math.floor(strikes)) : 1,
      underline: Boolean(under),
      // An overstrike is a single glyph; anything longer is not one.
      overstrike: typeof over === 'string' && over.length === 1 ? over : undefined,
      corrected: Boolean(corrected),
    };
  }) ?? readLegacyEmphasis(o.charEmphasis, text.length);

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

/** Reader for sheets saved before run-length encoding. */
function readLegacyFormats(
  raw: unknown,
  limit: number,
  fallbackModel: ModelKey,
  fallbackRibbon: RibbonKey,
): CharFormat[] {
  if (!Array.isArray(raw)) return [];
  return raw.slice(0, limit).map((entry): CharFormat => {
    const e = entry as Record<string, unknown> | null;
    const entryModel = e?.model;
    const entryRibbon = e?.ribbon;
    return {
      model: isModelKey(entryModel) ? entryModel : fallbackModel,
      ribbon: isRibbonKey(entryRibbon) ? entryRibbon : fallbackRibbon,
    };
  });
}

function readLegacyEmphasis(raw: unknown, limit: number): CharEmphasis[] {
  if (!Array.isArray(raw)) return [];
  return raw.slice(0, limit).map((entry): CharEmphasis => {
    const e = entry as Record<string, unknown> | null;
    const strikes = e?.strikeCount;
    const over = e?.overstrike;
    return {
      strikeCount: isFiniteNumber(strikes) ? Math.max(1, Math.floor(strikes)) : 1,
      underline: Boolean(e?.underline),
      overstrike: typeof over === 'string' && over.length === 1 ? over : undefined,
      corrected: Boolean(e?.corrected),
    };
  });
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

  try {
    const payload = {
      ...sheet,
      version: 1 as const,
      savedAt: Date.now(),
      charFormats: encodeFormats(sheet.charFormats),
      charEmphasis: encodeEmphasis(sheet.charEmphasis),
    };
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
