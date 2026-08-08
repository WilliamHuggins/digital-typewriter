/**
 * Match rendered glyph advance to the machine's pitch.
 *
 * The layout engine wraps text on `charWidth` — 9.6px for pica, 8px for elite —
 * but a font renders at whatever advance its own metrics dictate, which is not
 * that number. The two have always disagreed slightly, and the margin guides,
 * carriage cue and type guide all drifted from the text as a result.
 *
 * Now that pitch is a per-machine property, that drift would be visible as an
 * outright bug: an elite machine has to actually put 12 characters in an inch.
 * So measure what the font really does and close the gap with letter-spacing.
 */

import { useEffect, useState } from 'react';

const PROBE_TEXT = 'MMMMMMMMMMMMMMMMMMMM';

export interface TypePitchCalibration {
  /** Letter-spacing in px to add to each glyph so advance equals charWidth */
  letterSpacing: number;
  /** The advance actually measured, for diagnostics */
  measuredAdvance: number;
}

/**
 * @param fontFamily CSS font-family stack for the active machine
 * @param fontSize   rendered type size in px
 * @param charWidth  the cell width the layout engine assumes, in px
 */
export function useTypePitch(
  fontFamily: string,
  fontSize: number,
  charWidth: number,
): TypePitchCalibration {
  const [calibration, setCalibration] = useState<TypePitchCalibration>({
    letterSpacing: 0,
    measuredAdvance: charWidth,
  });

  useEffect(() => {
    if (typeof document === 'undefined') return;

    let cancelled = false;

    const measure = () => {
      if (cancelled) return;

      const probe = document.createElement('span');
      probe.textContent = PROBE_TEXT;
      probe.style.cssText = [
        'position:absolute',
        'visibility:hidden',
        'white-space:pre',
        'letter-spacing:0',
        'pointer-events:none',
        'left:-9999px',
        `font-family:${fontFamily}`,
        `font-size:${fontSize}px`,
      ].join(';');

      document.body.appendChild(probe);
      const advance = probe.getBoundingClientRect().width / PROBE_TEXT.length;
      probe.remove();

      if (advance > 0) {
        setCalibration({ letterSpacing: charWidth - advance, measuredAdvance: advance });
      }
    };

    // Measure once now, then again once the webfont has actually loaded —
    // the first measurement would otherwise capture the fallback face.
    measure();
    if (document.fonts?.ready) {
      document.fonts.ready.then(measure).catch(() => {
        // Font loading API unavailable or rejected; the first measure stands.
      });
    }

    return () => {
      cancelled = true;
    };
  }, [fontFamily, fontSize, charWidth]);

  return calibration;
}
