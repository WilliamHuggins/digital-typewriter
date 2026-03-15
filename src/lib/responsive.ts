export type ResponsiveTier = 'mobile' | 'tablet' | 'desktop';

export const RESPONSIVE_BREAKPOINTS = {
  tablet: 768,
  desktop: 1280,
} as const;

export function resolveResponsiveTier(width: number): ResponsiveTier {
  if (width >= RESPONSIVE_BREAKPOINTS.desktop) return 'desktop';
  if (width >= RESPONSIVE_BREAKPOINTS.tablet) return 'tablet';
  return 'mobile';
}
