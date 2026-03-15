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

export interface RibbonWearState {
  activeRibbon: RibbonKey;
  impressionCount: number;
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
  };
}

export function incrementRibbonWear(
  current: RibbonWearState,
  insertedChars: number,
  activeRibbon: RibbonKey
): RibbonWearState {
  const safeInsertions = Math.max(0, insertedChars);

  if (current.activeRibbon !== activeRibbon) {
    return {
      activeRibbon,
      impressionCount: safeInsertions,
    };
  }

  return {
    ...current,
    impressionCount: current.impressionCount + safeInsertions,
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
  const wearPenalty = Math.min(0.36, activeWear * profile.wearRate);

  const lineShift = (pseudoRandom((lineIndex + 1) * 811 + activeWear * 0.17) - 0.5) * profile.lineVariance;
  const charShift = (pseudoRandom((charIndex + 1) * 193 + char.charCodeAt(0) * 17) - 0.5) * profile.charVariance;
  const wornKeyShift = profile.wornKeys[charKey] ?? 0;

  const strikeSeed = pseudoRandom((charIndex + 1) * 29 + (lineIndex + 1) * 997);
  const strikeShift = strikeSeed > 0.985
    ? profile.rareLightStrike
    : strikeSeed < 0.015
      ? profile.rareHeavyStrike
      : 0;

  const opacity = clamp(profile.baseInk - wearPenalty + lineShift + charShift + wornKeyShift + strikeShift, profile.minInk, profile.maxInk);
  const contrast = clamp(
    profile.baseContrast + profile.contrastBias - wearPenalty * 0.32 + charShift * 0.65,
    0.88,
    1.14
  );
  const brightness = clamp(1 - wearPenalty * 0.22 + lineShift * 0.4, 0.9, 1.07);

  return { opacity, contrast, brightness };
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
