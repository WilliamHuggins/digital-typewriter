/**
 * Machine and ribbon definitions.
 *
 * These live in `lib` rather than in the toolbar component because they are
 * domain constants, not UI: the renderer, the PDF exporter, the audio engine
 * and the persistence layer all key off them.
 */

export interface MachineDef {
  /** Display name shown in the machine selector */
  name: string;
  /** Tailwind font-family utility used to render this machine's type */
  font: string;
  /** 0–1 strike irregularity; drives jitter, ink fade and line wobble */
  wear: number;
}

export const MODELS = {
  remington: { name: 'Remington Noiseless', font: 'font-special-elite', wear: 0.8 },
  underwood: { name: 'Underwood No. 5', font: 'font-cutive-mono', wear: 0.5 },
  royal: { name: 'Royal Quiet De Luxe', font: 'font-courier-prime', wear: 0.2 },
  olivetti: { name: 'Olivetti Lettera 22', font: 'font-space-mono', wear: 0.1 },
  ibm: { name: 'IBM Executive', font: 'font-cousine', wear: 0.05 },
} as const satisfies Record<string, MachineDef>;

export type ModelKey = keyof typeof MODELS;

/** Ribbon key → the CSS class that colours struck characters. */
export const RIBBONS = {
  black: 'text-ink-black',
  red: 'text-ink-red',
  blue: 'text-ink-blue',
  stencil: 'ink-stencil',
} as const;

export type RibbonKey = keyof typeof RIBBONS;

export const RIBBON_LABELS: Record<RibbonKey, string> = {
  black: 'Black Ribbon',
  red: 'Red Ribbon',
  blue: 'Blue Ribbon',
  stencil: 'Stencil',
};

export const MODEL_KEYS = Object.keys(MODELS) as ModelKey[];
export const RIBBON_KEYS = Object.keys(RIBBONS) as RibbonKey[];

export function isModelKey(value: unknown): value is ModelKey {
  return typeof value === 'string' && value in MODELS;
}

export function isRibbonKey(value: unknown): value is RibbonKey {
  return typeof value === 'string' && value in RIBBONS;
}

// ---------------------------------------------------------------------------
// Per-character styling carried alongside the document text
// ---------------------------------------------------------------------------

/** Which machine and ribbon were mounted when this character was struck. */
export interface CharFormat {
  model: ModelKey;
  ribbon: RibbonKey;
}

/** Overstrike emphasis: repeated strikes darken, `_` overstrikes underline. */
export interface CharEmphasis {
  strikeCount: number;
  underline: boolean;
}

export const DEFAULT_EMPHASIS: CharEmphasis = { strikeCount: 1, underline: false };
