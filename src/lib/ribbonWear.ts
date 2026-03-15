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
  tokenAnchors: TokenAnchor[];
  chunkIndex?: number;
  chunkLineIndex?: number;
  chunkId?: number;
}

interface TokenAnchor {
  hash: number;
  bucket: number;
}

interface ChunkDescriptor {
  hash: number;
  head: string;
  tail: string;
  length: number;
}

interface PersistentChunk {
  id: number;
  descriptor: ChunkDescriptor;
  lastIndex: number;
}

interface ChunkCache {
  nextId: number;
  chunks: PersistentChunk[];
}

export interface RibbonWearState {
  activeRibbon: RibbonKey;
  impressionCount: number;
  lineImpressions: number[];
  lineDescriptors: LineDescriptor[];
  chunkCache: ChunkCache;
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
    chunkCache: { nextId: 1, chunks: [] },
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
}): { lineCount: number; addedImpressionsByLine: Map<number, number>; lineDescriptors: LineDescriptor[]; chunkDescriptors: ChunkDescriptor[] } {
  const { lineByCharIndex, lineCount, lineDescriptors, chunkDescriptors } = buildRenderedLineLayout(text, maxColumns);
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
    chunkDescriptors,
  };
}

function buildRenderedLineLayout(text: string, maxColumns: number): {
  lineByCharIndex: Map<number, number>;
  lineCount: number;
  lineDescriptors: LineDescriptor[];
  chunkDescriptors: ChunkDescriptor[];
} {
  const safeColumns = Math.max(1, maxColumns);
  const lineByCharIndex = new Map<number, number>();
  const lineContentByIndex = new Map<number, string>();
  const lineChunkByIndex = new Map<number, number>();
  let lineIndex = 0;
  let currentLineLength = 0;
  let currentChunkIndex = 0;

  const appendChar = (targetLineIndex: number, char: string) => {
    lineContentByIndex.set(targetLineIndex, (lineContentByIndex.get(targetLineIndex) ?? '') + char);
    if (!lineChunkByIndex.has(targetLineIndex)) {
      lineChunkByIndex.set(targetLineIndex, currentChunkIndex);
    }
  };

  const ensureLineChunk = (targetLineIndex: number) => {
    if (!lineChunkByIndex.has(targetLineIndex)) {
      lineChunkByIndex.set(targetLineIndex, currentChunkIndex);
    }
  };

  ensureLineChunk(lineIndex);

  for (let i = 0; i < text.length; i++) {
    const char = text[i];

    if (char === '\n') {
      lineByCharIndex.set(i, lineIndex);
      ensureLineChunk(lineIndex);
      lineIndex += 1;
      currentLineLength = 0;
      currentChunkIndex += 1;
      ensureLineChunk(lineIndex);
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
        ensureLineChunk(lineIndex);
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
      ensureLineChunk(lineIndex);
    }

    for (let wordIndex = i; wordIndex < wordEnd; wordIndex++) {
      lineByCharIndex.set(wordIndex, lineIndex);
      appendChar(lineIndex, text[wordIndex]);
    }

    currentLineLength += wordLength;
    i = wordEnd - 1;
  }

  const lineCount = lineIndex + 1;
  const chunkLineCounts = new Map<number, number>();
  const lineDescriptors = Array.from({ length: lineCount }, (_, index) => {
    const chunkIndex = lineChunkByIndex.get(index) ?? 0;
    const chunkLineIndex = chunkLineCounts.get(chunkIndex) ?? 0;
    chunkLineCounts.set(chunkIndex, chunkLineIndex + 1);
    return {
      ...toLineDescriptor(lineContentByIndex.get(index) ?? ''),
      chunkIndex,
      chunkLineIndex,
    };
  });

  const chunkDescriptors = text.split('\n').map(chunkText => toLineDescriptor(chunkText));

  return {
    lineByCharIndex,
    lineCount,
    lineDescriptors,
    chunkDescriptors,
  };
}

function toLineDescriptor(lineText: string): LineDescriptor {
  const normalized = lineText.trim();
  return {
    hash: hashText(normalized),
    head: normalized.slice(0, 16),
    tail: normalized.slice(-16),
    length: normalized.length,
    tokenAnchors: buildSparseTokenAnchors(normalized),
  };
}

function buildSparseTokenAnchors(text: string): TokenAnchor[] {
  if (!text) {
    return [];
  }

  const tokenPattern = /[a-z0-9']+/gi;
  const tokens: Array<{ value: string; start: number }> = [];
  for (const match of text.matchAll(tokenPattern)) {
    const token = match[0]?.toLowerCase();
    const start = match.index ?? -1;
    if (!token || start < 0) {
      continue;
    }
    tokens.push({ value: token, start });
  }

  if (tokens.length === 0) {
    return [];
  }

  const candidateIndices = new Set<number>([
    0,
    Math.floor((tokens.length - 1) / 3),
    Math.floor(((tokens.length - 1) * 2) / 3),
    tokens.length - 1,
  ]);

  if (tokens.length >= 2) {
    candidateIndices.add(Math.floor((tokens.length - 2) / 2));
  }

  const anchors: TokenAnchor[] = [];
  const seen = new Set<string>();
  const pushAnchor = (value: string, start: number) => {
    const bucket = Math.min(3, Math.floor((start / Math.max(1, text.length)) * 4));
    const anchor = { hash: hashText(value), bucket };
    const key = `${anchor.hash}:${anchor.bucket}`;
    if (seen.has(key)) {
      return;
    }
    seen.add(key);
    anchors.push(anchor);
  };

  for (const index of candidateIndices) {
    const token = tokens[index];
    if (!token) {
      continue;
    }
    pushAnchor(token.value, token.start);

    if (anchors.length >= 5) {
      break;
    }
  }

  if (anchors.length < 5 && tokens.length >= 2) {
    const pairStart = Math.floor((tokens.length - 2) / 2);
    const left = tokens[pairStart];
    const right = tokens[pairStart + 1];
    if (left && right) {
      pushAnchor(`${left.value} ${right.value}`, left.start);
    }
  }

  return anchors;
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

  stabilizeByChunkIdentity({
    previousImpressions,
    previousLineDescriptors,
    nextLineDescriptors,
    remapped,
    takenPrevious,
    matchedNext,
  });

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
  const anchorSignal = scoreAnchorSimilarity(previousLine.tokenAnchors, nextLine.tokenAnchors);
  const hashBonus = previousLine.hash === nextLine.hash ? 8 : 0;
  const lengthPenalty = Math.abs(previousLine.length - nextLine.length) * 0.35;
  const indexPenalty = indexDistance * 0.75;
  return hashBonus + anchorSignal * 1.35 + prefixMatches * 0.6 + suffixMatches * 0.45 - lengthPenalty - indexPenalty;
}

function scoreAnchorSimilarity(previousAnchors: TokenAnchor[], nextAnchors: TokenAnchor[]): number {
  if (previousAnchors.length === 0 || nextAnchors.length === 0) {
    return 0;
  }

  let score = 0;
  for (const previous of previousAnchors) {
    for (const next of nextAnchors) {
      if (previous.hash !== next.hash) {
        continue;
      }

      const bucketDistance = Math.abs(previous.bucket - next.bucket);
      score += Math.max(0.25, 1.1 - bucketDistance * 0.3);
      break;
    }
  }

  return score;
}

function stabilizeByChunkIdentity({
  previousImpressions,
  previousLineDescriptors,
  nextLineDescriptors,
  remapped,
  takenPrevious,
  matchedNext,
}: {
  previousImpressions: number[];
  previousLineDescriptors: LineDescriptor[];
  nextLineDescriptors: LineDescriptor[];
  remapped: number[];
  takenPrevious: Set<number>;
  matchedNext: Set<number>;
}) {
  const previousByChunk = new Map<number, number[]>();
  const nextByChunk = new Map<number, number[]>();

  for (let i = 0; i < previousLineDescriptors.length; i++) {
    const chunkId = previousLineDescriptors[i].chunkId;
    if (chunkId === undefined) {
      continue;
    }

    const bucket = previousByChunk.get(chunkId) ?? [];
    bucket.push(i);
    previousByChunk.set(chunkId, bucket);
  }

  for (let i = 0; i < nextLineDescriptors.length; i++) {
    const chunkId = nextLineDescriptors[i].chunkId;
    if (chunkId === undefined) {
      continue;
    }

    const bucket = nextByChunk.get(chunkId) ?? [];
    bucket.push(i);
    nextByChunk.set(chunkId, bucket);
  }

  for (const [chunkId, nextIndices] of nextByChunk.entries()) {
    const previousIndices = previousByChunk.get(chunkId);
    if (!previousIndices || previousIndices.length === 0) {
      continue;
    }

    for (const nextIndex of nextIndices) {
      if (matchedNext.has(nextIndex)) {
        continue;
      }

      const nextLineDescriptor = nextLineDescriptors[nextIndex];
      if (nextLineDescriptor.tokenAnchors.length > 0) {
        let bestAnchoredPrevious = -1;
        let bestAnchoredScore = Number.NEGATIVE_INFINITY;

        for (const previousIndex of previousIndices) {
          if (takenPrevious.has(previousIndex)) {
            continue;
          }

          const previousLineDescriptor = previousLineDescriptors[previousIndex];
          const expectedChunkLine = nextLineDescriptor.chunkLineIndex ?? 0;
          const previousChunkLine = previousLineDescriptor.chunkLineIndex ?? 0;
          const chunkDistance = Math.abs(previousChunkLine - expectedChunkLine);
          const anchoredScore = scoreLineSimilarity(previousLineDescriptor, nextLineDescriptor, chunkDistance);
          if (anchoredScore > bestAnchoredScore) {
            bestAnchoredScore = anchoredScore;
            bestAnchoredPrevious = previousIndex;
          }
        }

        if (bestAnchoredPrevious !== -1 && bestAnchoredScore >= 4) {
          remapped[nextIndex] = previousImpressions[bestAnchoredPrevious] ?? 0;
          takenPrevious.add(bestAnchoredPrevious);
          matchedNext.add(nextIndex);
          continue;
        }
      }

      const expectedChunkLine = nextLineDescriptor.chunkLineIndex ?? 0;
      let bestPreviousIndex = -1;
      let bestDistance = Number.POSITIVE_INFINITY;

      for (const previousIndex of previousIndices) {
        if (takenPrevious.has(previousIndex)) {
          continue;
        }

        const previousChunkLine = previousLineDescriptors[previousIndex].chunkLineIndex ?? 0;
        const distance = Math.abs(previousChunkLine - expectedChunkLine);
        if (distance < bestDistance) {
          bestDistance = distance;
          bestPreviousIndex = previousIndex;
        }
      }

      if (bestPreviousIndex !== -1) {
        remapped[nextIndex] = previousImpressions[bestPreviousIndex] ?? 0;
        takenPrevious.add(bestPreviousIndex);
        matchedNext.add(nextIndex);
      }
    }
  }
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
  lineLedger?: { lineCount: number; addedImpressionsByLine: Map<number, number>; lineDescriptors: LineDescriptor[]; chunkDescriptors: ChunkDescriptor[] }
): RibbonWearState {
  const safeInsertions = Math.max(0, insertedChars);
  const nextLineCount = lineLedger?.lineCount ?? current.lineImpressions.length;

  const { nextChunkCache, lineDescriptorsWithChunkIds } = lineLedger
    ? assignPersistentChunkIds(current.chunkCache, lineLedger)
    : { nextChunkCache: current.chunkCache, lineDescriptorsWithChunkIds: current.lineDescriptors.slice(0, nextLineCount) };

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
      lineDescriptors: lineDescriptorsWithChunkIds,
      chunkCache: nextChunkCache,
    };
  }

  const nextLineImpressions = lineLedger
    ? stabilizeLineImpressions({
      previousImpressions: current.lineImpressions,
      previousLineDescriptors: current.lineDescriptors,
      nextLineDescriptors: lineDescriptorsWithChunkIds,
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
    lineDescriptors: lineDescriptorsWithChunkIds,
    chunkCache: nextChunkCache,
  };
}

function assignPersistentChunkIds(
  previousCache: ChunkCache,
  lineLedger: { lineDescriptors: LineDescriptor[]; chunkDescriptors: ChunkDescriptor[] }
): { nextChunkCache: ChunkCache; lineDescriptorsWithChunkIds: LineDescriptor[] } {
  const takenPrevious = new Set<number>();
  let nextId = previousCache.nextId;
  const assignedChunkIds = lineLedger.chunkDescriptors.map((nextChunk, nextChunkIndex) => {
    let bestPreviousIndex = -1;
    let bestScore = Number.NEGATIVE_INFINITY;

    for (let previousIndex = 0; previousIndex < previousCache.chunks.length; previousIndex++) {
      if (takenPrevious.has(previousIndex)) {
        continue;
      }

      const previousChunk = previousCache.chunks[previousIndex];
      const score = scoreChunkSimilarity(previousChunk, nextChunk, nextChunkIndex);
      if (score > bestScore) {
        bestScore = score;
        bestPreviousIndex = previousIndex;
      }
    }

    if (bestPreviousIndex !== -1 && bestScore >= 4.5) {
      takenPrevious.add(bestPreviousIndex);
      return previousCache.chunks[bestPreviousIndex].id;
    }

    const createdId = nextId;
    nextId += 1;
    return createdId;
  });

  const nextChunks = lineLedger.chunkDescriptors.map((descriptor, chunkIndex) => ({
    id: assignedChunkIds[chunkIndex],
    descriptor,
    lastIndex: chunkIndex,
  }));

  const lineDescriptorsWithChunkIds = lineLedger.lineDescriptors.map(line => ({
    ...line,
    chunkId: line.chunkIndex === undefined ? undefined : assignedChunkIds[line.chunkIndex],
  }));

  return {
    nextChunkCache: {
      nextId,
      chunks: nextChunks,
    },
    lineDescriptorsWithChunkIds,
  };
}

function scoreChunkSimilarity(previousChunk: PersistentChunk, nextChunk: ChunkDescriptor, nextChunkIndex: number): number {
  const hashBonus = previousChunk.descriptor.hash === nextChunk.hash ? 10 : 0;
  const prefixMatches = sharedPrefixLength(previousChunk.descriptor.head, nextChunk.head);
  const suffixMatches = sharedSuffixLength(previousChunk.descriptor.tail, nextChunk.tail);
  const lengthPenalty = Math.abs(previousChunk.descriptor.length - nextChunk.length) * 0.25;
  const indexPenalty = Math.abs(previousChunk.lastIndex - nextChunkIndex) * 1.15;
  return hashBonus + prefixMatches * 0.7 + suffixMatches * 0.55 - lengthPenalty - indexPenalty;
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
