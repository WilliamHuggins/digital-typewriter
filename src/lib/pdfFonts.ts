import { jsPDF } from 'jspdf';

/**
 * PDF font registry: maps typewriter model keys to embedded font definitions.
 *
 * Each entry carries the jsPDF font-family name used after registration,
 * the filename stored in jsPDF's virtual file system, and a lazy loader
 * that returns the base-64 TTF data.  Lazy loading keeps the main bundle
 * small – font data is only pulled in when a PDF export actually needs it.
 */

export interface PdfFontDef {
  /** jsPDF font-family name (used with pdf.setFont) */
  family: string;
  /** Style passed to pdf.addFont / pdf.setFont */
  style: string;
  /** Virtual filename for jsPDF VFS */
  vfsFilename: string;
  /** Lazy loader – returns base-64 encoded TTF */
  loadBase64: () => Promise<string>;
}

export type TypewriterModelKey =
  | 'remington'
  | 'underwood'
  | 'royal'
  | 'olivetti'
  | 'ibm';

const FONT_DEFS: Record<TypewriterModelKey, PdfFontDef> = {
  remington: {
    family: 'SpecialElite',
    style: 'normal',
    vfsFilename: 'SpecialElite-Regular.ttf',
    loadBase64: () => import('../fonts/SpecialElite-Regular').then((m) => m.default),
  },
  underwood: {
    family: 'CutiveMono',
    style: 'normal',
    vfsFilename: 'CutiveMono-Regular.ttf',
    loadBase64: () => import('../fonts/CutiveMono-Regular').then((m) => m.default),
  },
  royal: {
    family: 'CourierPrime',
    style: 'normal',
    vfsFilename: 'CourierPrime-Regular.ttf',
    loadBase64: () => import('../fonts/CourierPrime-Regular').then((m) => m.default),
  },
  olivetti: {
    family: 'SpaceMono',
    style: 'normal',
    vfsFilename: 'SpaceMono-Regular.ttf',
    loadBase64: () => import('../fonts/SpaceMono-Regular').then((m) => m.default),
  },
  ibm: {
    family: 'Cousine',
    style: 'normal',
    vfsFilename: 'Cousine-Regular.ttf',
    loadBase64: () => import('../fonts/Cousine-Regular').then((m) => m.default),
  },
};

/** Courier fallback – always available in jsPDF without embedding */
export const COURIER_FONT: PdfFontDef = {
  family: 'courier',
  style: 'normal',
  vfsFilename: '',
  loadBase64: async () => '',
};

/**
 * Look up the embedded font definition for a given typewriter model.
 * Returns undefined when the model key is not recognised.
 */
export function getFontDefForModel(
  modelKey: string | undefined,
): PdfFontDef | undefined {
  if (!modelKey) return undefined;
  return FONT_DEFS[modelKey as TypewriterModelKey];
}

/**
 * Register an embedded TTF font into a jsPDF instance.
 *
 * Returns the font definition on success so callers can setFont().
 * Returns `undefined` if loading or registration fails – callers
 * should fall back to Courier.
 */
export async function registerEmbeddedFont(
  pdf: jsPDF,
  fontDef: PdfFontDef,
): Promise<PdfFontDef | undefined> {
  try {
    const base64 = await fontDef.loadBase64();
    if (!base64 || base64.length < 100) return undefined;

    pdf.addFileToVFS(fontDef.vfsFilename, base64);
    pdf.addFont(fontDef.vfsFilename, fontDef.family, fontDef.style);
    return fontDef;
  } catch {
    return undefined;
  }
}

/**
 * Resolve which PDF font to use for export.
 *
 * 1. If a modelKey is supplied, try to load & register the matching
 *    embedded font.
 * 2. If that fails (or no modelKey), fall back to built-in Courier.
 *
 * Always returns a usable PdfFontDef.
 */
export async function resolvePdfFont(
  pdf: jsPDF,
  modelKey?: string,
): Promise<PdfFontDef> {
  const def = getFontDefForModel(modelKey);
  if (def) {
    const registered = await registerEmbeddedFont(pdf, def);
    if (registered) return registered;
  }
  return COURIER_FONT;
}
