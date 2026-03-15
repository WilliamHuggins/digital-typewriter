import { pseudoRandom } from './utils';
export type RibbonKey = 'black' | 'red' | 'blue' | 'stencil';

interface RibbonPersonality {
  baseInk: number;
  minInk: number;
  maxInk: number;
  wearRate: number;
  lineVariance: number;
  charVariance: number;
  baseContrast: number;
  contrastBias: number;
  rareLightStrike: number;
  rareHeavyStrike: number;
  wornKeys: Record<string, number>;
}

export interface LineDescriptor {
  hash: number;
  head: string;
  tail: string;
  length: number;
}

export interface RibbonWearState {
  activeRibbon: RibbonKey;
  impressionCount: number;
  lineImpressions: number[];
  lineDescriptors: LineDescriptor[];
}

export interface RibbonInkStyle {
  opacity: number;
  contrast: number;
  brightness: number;
}

const RIBBON_PERSONALITIES: Record<RibbonKey, RibbonPersonality> = {
  black: {
    baseInk: 0.93,
    minInk: 0.54,
    maxInk: 0.99,
    wearRate: 0.00042,
    lineVariance: 0.045,
    charVariance: 0.028,
    baseContrast: 1.07,
    contrastBias: 0.03,
    rareLightStrike: -0.06,
    rareHeavyStrike: 0.045,
    wornKeys: { e: -0.03, a: -0.02, o: -0.015 },
  },
  red: {
    baseInk: 0.84,
    minInk: 0.48,
    maxInk: 0.94,
    wearRate: 0.0005,
    lineVariance: 0.055,
    charVariance: 0.035,
    baseContrast: 1.03,
    contrastBias: -0.01,
    rareLightStrike: -0.075,
    rareHeavyStrike: 0.03,
    wornKeys: { s: -0.035, r: -0.025, t: 0.012 },
  },
  blue: {
    baseInk: 0.8,
    minInk: 0.45,
    maxInk: 0.91,
    wearRate: 0.00045,
    lineVariance: 0.042,
    charVariance: 0.03,
    baseContrast: 1,
    contrastBias: -0.02,
    rareLightStrike: -0.05,
    rareHeavyStrike: 0.025,
    wornKeys: { n: -0.02, m: -0.017, i: 0.01 },
  },
  stencil: {
    baseInk: 0.96,
    minInk: 0.8,
    maxInk: 1,
    wearRate: 0,
    lineVariance: 0,
    charVariance: 0,
    baseContrast: 1,
    contrastBias: 0,
    rareLightStrike: 0,
    rareHeavyStrike: 0,
    wornKeys: {},
  },
};

export function createRibbonWearState(ribbon: RibbonKey): RibbonWearState {
  return {
    activeRibbon: ribbon,
    impressionCount: 0,
    lineImpressions: [],
    lineDescriptors: [],
  };
}

function clampToLineCount(lineImpressions: number[], lineCount: number): number[] {
  if (lineCount <= 0) {
    return [];
  }

  const next = lineImpressions.slice(0, lineCount);
  while (next.length < lineCount) {
    next.push(0);
  }

  return next;
}

export function buildLineImpressionLedger({
  text,
  insertedRange,
  maxColumns,
}: {
  text: string;
  insertedRange: { start: number; length: number };
  maxColumns: number;
}): { lineCount: number; addedImpressionsByLine: Map<number, number>; lineDescriptors: LineDescriptor[] } {
  const { lineByCharIndex, lineCount, lineDescriptors } = buildRenderedLineLayout(text, maxColumns);
  const addedImpressionsByLine = new Map<number, number>();
  const insertionStart = Math.max(0, insertedRange.start);
  const insertionEnd = Math.min(text.length, insertionStart + Math.max(0, insertedRange.length));

  for (let i = insertionStart; i < insertionEnd; i++) {
    const char = text[i];
    if (char === '\n') {
      continue;
    }

    const charLineIndex = lineByCharIndex.get(i);
    if (charLineIndex === undefined) {
      continue;
    }

    addedImpressionsByLine.set(charLineIndex, (addedImpressionsByLine.get(charLineIndex) ?? 0) + 1);
  }

  return {
    lineCount,
    addedImpressionsByLine,
    lineDescriptors,
  };
}

function buildRenderedLineLayout(text: string, maxColumns: number): {
  lineByCharIndex: Map<number, number>;
  lineCount: number;
  lineDescriptors: LineDescriptor[];
} {
  const safeColumns = Math.max(1, maxColumns);
  const lineByCharIndex = new Map<number, number>();
  const lineContentByIndex = new Map<number, string>();
  let lineIndex = 0;
  let currentLineLength = 0;

  const appendChar = (targetLineIndex: number, char: string) => {
    lineContentByIndex.set(targetLineIndex, (lineContentByIndex.get(targetLineIndex) ?? '') + char);
  };

  for (let i = 0; i < text.length; i++) {
    const char = text[i];

    if (char === '\n') {
      lineByCharIndex.set(i, lineIndex);
      lineIndex += 1;
      currentLineLength = 0;
      continue;
    }

    if (char === ' ') {
      lineByCharIndex.set(i, lineIndex);
      appendChar(lineIndex, ' ');
      if (currentLineLength + 1 <= safeColumns) {
        currentLineLength += 1;
      } else {
        lineIndex += 1;
        currentLineLength = 0;
      }
      continue;
    }

    let wordEnd = i;
    while (wordEnd < text.length && text[wordEnd] !== ' ' && text[wordEnd] !== '\n') {
      wordEnd += 1;
    }

    const wordLength = wordEnd - i;
    if (currentLineLength !== 0 && currentLineLength + wordLength > safeColumns) {
      lineIndex += 1;
      currentLineLength = 0;
    }

    for (let wordIndex = i; wordIndex < wordEnd; wordIndex++) {
      lineByCharIndex.set(wordIndex, lineIndex);
      appendChar(lineIndex, text[wordIndex]);
    }

    currentLineLength += wordLength;
    i = wordEnd - 1;
  }

  const lineCount = lineIndex + 1;
  const lineDescriptors = Array.from(
    { length: lineCount },
    (_, index) => toLineDescriptor(lineContentByIndex.get(index) ?? '')
  );

  return {
    lineByCharIndex,
    lineCount,
    lineDescriptors,
  };
}

function toLineDescriptor(lineText: string): LineDescriptor {
  const normalized = lineText.trim();
  return {
    hash: hashText(normalized),
    head: normalized.slice(0, 16),
    tail: normalized.slice(-16),
    length: normalized.length,
  };
}

function hashText(text: string): number {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function stabilizeLineImpressions({
  previousImpressions,
  previousLineDescriptors,
  nextLineDescriptors,
}: {
  previousImpressions: number[];
  previousLineDescriptors: LineDescriptor[];
  nextLineDescriptors: LineDescriptor[];
}): number[] {
  if (nextLineDescriptors.length === 0) {
    return [];
  }

  const naive = clampToLineCount(previousImpressions, nextLineDescriptors.length);
  if (previousLineDescriptors.length === 0) {
    return naive;
  }

  const remapped = Array.from({ length: nextLineDescriptors.length }, () => 0);
  const takenPrevious = new Set<number>();
  const matchedNext = new Set<number>();
  const searchRadius = 4;

  for (let nextIndex = 0; nextIndex < nextLineDescriptors.length; nextIndex++) {
    const nextLine = nextLineDescriptors[nextIndex];
    let bestPreviousIndex = -1;
    let bestScore = Number.NEGATIVE_INFINITY;

    const start = Math.max(0, nextIndex - searchRadius);
    const end = Math.min(previousLineDescriptors.length - 1, nextIndex + searchRadius);
    for (let previousIndex = start; previousIndex <= end; previousIndex++) {
      if (takenPrevious.has(previousIndex)) {
        continue;
      }

      const score = scoreLineSimilarity(previousLineDescriptors[previousIndex], nextLine, Math.abs(previousIndex - nextIndex));
      if (score > bestScore) {
        bestScore = score;
        bestPreviousIndex = previousIndex;
      }
    }

    if (bestPreviousIndex !== -1 && bestScore >= 3) {
      remapped[nextIndex] = previousImpressions[bestPreviousIndex] ?? 0;
      takenPrevious.add(bestPreviousIndex);
      matchedNext.add(nextIndex);
    }
  }

  for (let nextIndex = 0; nextIndex < nextLineDescriptors.length; nextIndex++) {
    if (matchedNext.has(nextIndex)) {
      continue;
    }

    if (!takenPrevious.has(nextIndex)) {
      remapped[nextIndex] = naive[nextIndex] ?? 0;
    }
  }

  return remapped;
}

function scoreLineSimilarity(previousLine: LineDescriptor, nextLine: LineDescriptor, indexDistance: number): number {
  const prefixMatches = sharedPrefixLength(previousLine.head, nextLine.head);
  const suffixMatches = sharedSuffixLength(previousLine.tail, nextLine.tail);
  const hashBonus = previousLine.hash === nextLine.hash ? 8 : 0;
  const lengthPenalty = Math.abs(previousLine.length - nextLine.length) * 0.35;
  const indexPenalty = indexDistance * 0.75;
  return hashBonus + prefixMatches * 0.6 + suffixMatches * 0.45 - lengthPenalty - indexPenalty;
}

function sharedPrefixLength(a: string, b: string): number {
  const length = Math.min(a.length, b.length);
  let matches = 0;
  while (matches < length && a[matches] === b[matches]) {
    matches += 1;
  }
  return matches;
}

function sharedSuffixLength(a: string, b: string): number {
  const length = Math.min(a.length, b.length);
  let matches = 0;
  while (matches < length && a[a.length - 1 - matches] === b[b.length - 1 - matches]) {
    matches += 1;
  }
  return matches;
}

export function incrementRibbonWear(
  current: RibbonWearState,
  insertedChars: number,
  activeRibbon: RibbonKey,
  lineLedger?: { lineCount: number; addedImpressionsByLine: Map<number, number>; lineDescriptors: LineDescriptor[] }
): RibbonWearState {
  const safeInsertions = Math.max(0, insertedChars);
  const nextLineCount = lineLedger?.lineCount ?? current.lineImpressions.length;

  if (current.activeRibbon !== activeRibbon) {
    const nextLineImpressions = clampToLineCount([], nextLineCount);
    if (lineLedger) {
      for (const [lineIndex, addedImpressions] of lineLedger.addedImpressionsByLine.entries()) {
        nextLineImpressions[lineIndex] = (nextLineImpressions[lineIndex] ?? 0) + addedImpressions;
      }
    }

    return {
      activeRibbon,
      impressionCount: safeInsertions,
      lineImpressions: nextLineImpressions,
      lineDescriptors: lineLedger?.lineDescriptors ?? [],
    };
  }

  const nextLineImpressions = lineLedger
    ? stabilizeLineImpressions({
      previousImpressions: current.lineImpressions,
      previousLineDescriptors: current.lineDescriptors,
      nextLineDescriptors: lineLedger.lineDescriptors,
    })
    : clampToLineCount(current.lineImpressions, nextLineCount);

  if (lineLedger) {
    for (const [lineIndex, addedImpressions] of lineLedger.addedImpressionsByLine.entries()) {
      nextLineImpressions[lineIndex] = (nextLineImpressions[lineIndex] ?? 0) + addedImpressions;
    }
  }

  return {
    ...current,
    impressionCount: current.impressionCount + safeInsertions,
    lineImpressions: nextLineImpressions,
    lineDescriptors: lineLedger?.lineDescriptors ?? current.lineDescriptors.slice(0, nextLineCount),
  };
}

export function calculateRibbonInkStyle({
  state,
  ribbon,
  char,
  charIndex,
  lineIndex,
}: {
  state: RibbonWearState;
  ribbon: RibbonKey;
  char: string;
  charIndex: number;
  lineIndex: number;
}): RibbonInkStyle {
  const profile = RIBBON_PERSONALITIES[ribbon];
  const charKey = char.toLowerCase();
  const activeWear = ribbon === state.activeRibbon ? state.impressionCount : 0;
  const lineWear = ribbon === state.activeRibbon ? (state.lineImpressions[lineIndex] ?? 0) : 0;
  const wearPenalty = Math.min(0.36, activeWear * profile.wearRate);
  const lineWearPenalty = Math.min(0.12, lineWear * profile.wearRate * 2.4);

  const lineShift = (pseudoRandom((lineIndex + 1) * 811 + activeWear * 0.17) - 0.5) * profile.lineVariance;
  const charShift = (pseudoRandom((charIndex + 1) * 193 + char.charCodeAt(0) * 17) - 0.5) * profile.charVariance;
  const wornKeyShift = profile.wornKeys[charKey] ?? 0;

  const strikeSeed = pseudoRandom((charIndex + 1) * 29 + (lineIndex + 1) * 997);
  const strikeShift = strikeSeed > 0.985
    ? profile.rareLightStrike
    : strikeSeed < 0.015
      ? profile.rareHeavyStrike
      : 0;

  const opacity = clamp(profile.baseInk - wearPenalty - lineWearPenalty + lineShift + charShift + wornKeyShift + strikeShift, profile.minInk, profile.maxInk);
  const contrast = clamp(
    profile.baseContrast + profile.contrastBias - wearPenalty * 0.32 - lineWearPenalty * 0.28 + charShift * 0.65,
    0.88,
    1.14
  );
  const brightness = clamp(1 - wearPenalty * 0.22 - lineWearPenalty * 0.18 + lineShift * 0.4, 0.9, 1.07);

  return { opacity, contrast, brightness };
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
