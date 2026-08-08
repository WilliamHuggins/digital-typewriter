/**
 * Machine and ribbon definitions.
 *
 * These live in `lib` rather than in the toolbar component because they are
 * domain constants, not UI: the renderer, the PDF exporter, the audio engine
 * and the persistence layer all key off them.
 */

/** CSS pixels per inch at standard web resolution. */
const PX_PER_INCH = 96;

/**
 * Typebar pitch, in characters per inch.
 *
 * The two pitches typewriters actually shipped with. Pica is the wider, more
 * common one; elite squeezes two more characters into every inch. On paper the
 * difference is unmistakable — 63 characters to a line versus 76 — and it is
 * the single most legible way two machines differ.
 */
export const PICA = 10;
export const ELITE = 12;

export interface MachineDef {
  /** Display name shown in the machine selector */
  name: string;
  /** Tailwind font-family utility used to render this machine's type */
  font: string;
  /** 0–1 strike irregularity; drives jitter, ink fade and line wobble */
  wear: number;
  /** Characters per inch — PICA or ELITE */
  pitch: number;
  /** Rendered type size in px, matched to the pitch so glyphs fill their cell */
  fontSize: number;
  /** Single-spaced line advance in px */
  lineHeight: number;
  /** Short period description shown under the machine name */
  era: string;
}

export const MODELS = {
  remington: {
    name: 'Remington Noiseless',
    font: 'font-special-elite',
    wear: 0.8,
    pitch: PICA,
    fontSize: 15,
    lineHeight: 24,
    era: '1930s portable · black crinkle',
  },
  underwood: {
    name: 'Underwood No. 5',
    font: 'font-cutive-mono',
    wear: 0.5,
    pitch: PICA,
    fontSize: 16,
    lineHeight: 25,
    era: '1915 desk standard · japanned black',
  },
  royal: {
    name: 'Royal Quiet De Luxe',
    font: 'font-courier-prime',
    wear: 0.2,
    pitch: PICA,
    fontSize: 15,
    lineHeight: 24,
    era: '1948 portable · grey-green',
  },
  olivetti: {
    name: 'Olivetti Lettera 22',
    font: 'font-space-mono',
    wear: 0.1,
    pitch: ELITE,
    fontSize: 13,
    lineHeight: 22,
    era: '1950 portable · elite pitch',
  },
  ibm: {
    name: 'IBM Executive',
    font: 'font-cousine',
    wear: 0.05,
    pitch: ELITE,
    fontSize: 13,
    lineHeight: 21,
    era: '1950s electric · elite pitch',
  },
} as const satisfies Record<string, MachineDef>;

export type ModelKey = keyof typeof MODELS;

/** Width of one character cell in px, derived from the machine's pitch. */
export function charWidthFor(model: ModelKey): number {
  return PX_PER_INCH / MODELS[model].pitch;
}

/** CSS font-family stack for a machine, for measuring its true glyph advance. */
export const MODEL_FONT_STACKS: Record<ModelKey, string> = {
  remington: '"Special Elite", monospace',
  underwood: '"Cutive Mono", monospace',
  royal: '"Courier Prime", monospace',
  olivetti: '"Space Mono", monospace',
  ibm: '"Cousine", monospace',
};

/** The page geometry a machine imposes: cell width, line advance, type size. */
export function typeMetricsFor(model: ModelKey): {
  charWidth: number;
  baseLineHeight: number;
  fontSize: number;
} {
  const def = MODELS[model];
  return {
    charWidth: charWidthFor(model),
    baseLineHeight: def.lineHeight,
    fontSize: def.fontSize,
  };
}

/** Ribbon key → the CSS class that colours struck characters. */
export const RIBBONS = {
  black: 'text-ink-black',
  red: 'text-ink-red',
  blue: 'text-ink-blue',
  stencil: 'ink-stencil',
} as const;

export type RibbonKey = keyof typeof RIBBONS;

// The control is already labelled "Ribbon", so the value does not repeat it.
export const RIBBON_LABELS: Record<RibbonKey, string> = {
  black: 'Black',
  red: 'Red',
  blue: 'Blue',
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
// Chassis identity
// ---------------------------------------------------------------------------

/**
 * What each machine physically looks like.
 *
 * The previous chassis differentiated the five machines by a gradient hue
 * alone — measured pixel-for-pixel, any two of them differed by under 2%. These
 * are the real finishes: japanned gloss black on the Underwood, wrinkle-painted
 * black on the Remington, the Royal's grey-green, the Lettera's famous pale
 * putty, and IBM's office grey. A light Olivetti next to a black Underwood
 * should never be mistakable.
 */
export interface ChassisDef {
  /** Main body colour */
  body: string;
  /** Shadowed edge of the body */
  bodyShade: string;
  /** Lit top edge of the body */
  bodyHighlight: string;
  /** Platen rubber */
  platen: string;
  /** Platen knobs and levers */
  knob: string;
  /** Trim: chrome, nickel or painted */
  trim: string;
  /** Colour of the nameplate lettering */
  plateInk: string;
  /** Surface treatment, which drives the body texture overlay */
  finish: 'crinkle' | 'gloss' | 'satin';
  /** Platen diameter in px — desk standards carried fatter rollers */
  platenHeight: number;
  /** Width of the carriage side rails in px */
  railWidth: number;
  /** Body corner rounding in px; portables were rounder than desk machines */
  radius: number;
  /** Text struck into the front nameplate */
  nameplate: string;
}

export const CHASSIS: Record<ModelKey, ChassisDef> = {
  remington: {
    body: '#2f2c28',
    bodyShade: '#171513',
    bodyHighlight: '#4a4640',
    platen: '#3a352f',
    knob: '#221f1c',
    trim: '#9a8f7a',
    plateInk: '#c8b98f',
    finish: 'crinkle',
    platenHeight: 34,
    railWidth: 54,
    radius: 14,
    nameplate: 'Remington',
  },
  underwood: {
    body: '#191715',
    bodyShade: '#0a0908',
    bodyHighlight: '#413b34',
    platen: '#2c2823',
    knob: '#12100e',
    trim: '#b9a878',
    plateInk: '#d4c08a',
    finish: 'gloss',
    platenHeight: 40,
    railWidth: 62,
    radius: 6,
    nameplate: 'Underwood',
  },
  royal: {
    body: '#4b5148',
    bodyShade: '#2b302a',
    bodyHighlight: '#6d7466',
    platen: '#38352f',
    knob: '#2a2e28',
    trim: '#c3c7c2',
    plateInk: '#e4e6e0',
    finish: 'satin',
    platenHeight: 32,
    railWidth: 50,
    radius: 20,
    nameplate: 'Royal',
  },
  olivetti: {
    body: '#9ba295',
    bodyShade: '#6f7669',
    bodyHighlight: '#c3c8bd',
    platen: '#4a463f',
    knob: '#7c8276',
    trim: '#e8eae4',
    plateInk: '#3d423a',
    finish: 'satin',
    platenHeight: 27,
    railWidth: 42,
    radius: 24,
    nameplate: 'Olivetti',
  },
  ibm: {
    body: '#6c7075',
    bodyShade: '#45484c',
    bodyHighlight: '#8f9399',
    platen: '#33363a',
    knob: '#54585d',
    trim: '#d6d9dc',
    plateInk: '#eef0f2',
    finish: 'satin',
    platenHeight: 29,
    railWidth: 58,
    radius: 4,
    nameplate: 'IBM',
  },
};

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
  /**
   * A second glyph struck into the same cell.
   *
   * Carries both the X of a cancelled word and the composite punctuation older
   * machines had no key for — an exclamation mark is an apostrophe with a full
   * stop struck under it.
   */
  overstrike?: string;
  /** Painted out with correction fluid; the glyph beneath barely shows. */
  corrected?: boolean;
}

export const DEFAULT_EMPHASIS: CharEmphasis = { strikeCount: 1, underline: false };

// ---------------------------------------------------------------------------
// Keyboards
// ---------------------------------------------------------------------------

/**
 * What each machine's keyboard could and could not do.
 *
 * Early typewriters shipped fewer keys than a modern one, and typists worked
 * around the gaps with substitutions everybody knew: the Underwood No. 5 has no
 * figure 1, so you strike a lowercase L, and no exclamation mark, so you strike
 * an apostrophe, backspace, and strike a full stop underneath it. Those habits
 * are the reason old manuscripts look the way they do, and modelling them costs
 * almost nothing.
 *
 * The keyboard fills out as the machines get younger, which is roughly how it
 * happened: the exclamation mark did not become standard until the 1970s.
 */
export interface KeyboardDef {
  /** Glyph the machine lacks → the glyph a typist struck instead */
  substitutions: Record<string, string>;
  /** Glyph the machine lacks → two glyphs struck into one cell */
  composites: Record<string, { base: string; over: string }>;
}

const NO_EXCLAMATION: KeyboardDef['composites'] = {
  '!': { base: "'", over: '.' },
};

export const KEYBOARDS: Record<ModelKey, KeyboardDef> = {
  // 1915 desk standard: no figure 1, no exclamation mark.
  underwood: {
    substitutions: { '1': 'l' },
    composites: NO_EXCLAMATION,
  },
  // 1930s portable: figures are complete by now, punctuation is not.
  remington: {
    substitutions: {},
    composites: NO_EXCLAMATION,
  },
  royal: {
    substitutions: {},
    composites: NO_EXCLAMATION,
  },
  // Post-war machines carry the full keyboard.
  olivetti: { substitutions: {}, composites: {} },
  ibm: { substitutions: {}, composites: {} },
};

export interface StruckKey {
  /** The glyph that actually lands on the paper */
  char: string;
  /** A second glyph struck into the same cell, if this is a composite */
  overstrike?: string;
  /** Set when the machine had no key for what was typed */
  substitutedFor?: string;
}

/** Resolve a keypress against a machine's actual keyboard. */
export function resolveKeystroke(model: ModelKey, key: string): StruckKey {
  const keyboard = KEYBOARDS[model];

  const composite = keyboard.composites[key];
  if (composite) {
    return { char: composite.base, overstrike: composite.over, substitutedFor: key };
  }

  const substitute = keyboard.substitutions[key];
  if (substitute) {
    return { char: substitute, substitutedFor: key };
  }

  return { char: key };
}

/** One-line explanation of a substitution, shown the first time it happens. */
export function describeSubstitution(model: ModelKey, key: string): string | null {
  const machine = MODELS[model];
  const keyboard = KEYBOARDS[model];

  if (keyboard.composites[key]) {
    const { base, over } = keyboard.composites[key];
    return `The ${machine.name} has no ${key} key — struck ${base} over ${over}, the way typists made one.`;
  }

  const substitute = keyboard.substitutions[key];
  if (substitute) {
    return `The ${machine.name} has no ${key} key — struck ${substitute} instead, as typists did.`;
  }

  return null;
}
