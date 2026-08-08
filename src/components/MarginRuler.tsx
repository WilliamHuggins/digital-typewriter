import React, { useCallback, useEffect, useRef, useState } from 'react';
import { cn } from '../lib/utils';
import { MIN_MARGIN, PX_PER_INCH, pxToInches, type PaperSize } from '../lib/documentModel';

interface MarginRulerProps {
  paper: PaperSize;
  marginLeft: number;
  marginRight: number;
  /** Width of one character cell, so the ruler can report column positions */
  charWidth: number;
  /** Page scale applied by the responsive fitter */
  scale: number;
  onChange: (next: { marginLeft: number; marginRight: number }) => void;
}

type Stop = 'left' | 'right';

/** Smallest usable printing width, in px — roughly two inches. */
const MIN_PRINTING_WIDTH = 192;
/** Nudge per arrow key, in px. Shift moves a whole inch. */
const NUDGE_PX = 8;

/**
 * The margin scale, with a sliding stop at each end.
 *
 * Margins were four number inputs in inches, which is how a word processor asks
 * the question, not how a typewriter does. On the machine you push a stop along
 * the scale until it sits where you want the carriage to halt — you set the
 * margin by pointing at it. This does the same, and it doubles as the readout
 * that tells you where the printing line begins and ends.
 *
 * Draggable with a pointer, and operable from the keyboard: each stop is a
 * slider that takes arrows, Home/End, and Shift+arrow for inch steps.
 */
export function MarginRuler({ paper, marginLeft, marginRight, charWidth, scale, onChange }: MarginRulerProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState<Stop | null>(null);

  const width = paper.width;
  const rightEdge = width - marginRight;

  const clampLeft = useCallback(
    (px: number) => Math.round(Math.min(Math.max(px, MIN_MARGIN), width - marginRight - MIN_PRINTING_WIDTH)),
    [width, marginRight],
  );
  const clampRight = useCallback(
    (px: number) => Math.round(Math.min(Math.max(px, MIN_MARGIN), width - marginLeft - MIN_PRINTING_WIDTH)),
    [width, marginLeft],
  );

  const moveStop = useCallback(
    (stop: Stop, pagePx: number) => {
      if (stop === 'left') {
        onChange({ marginLeft: clampLeft(pagePx), marginRight });
      } else {
        onChange({ marginLeft, marginRight: clampRight(width - pagePx) });
      }
    },
    [clampLeft, clampRight, marginLeft, marginRight, onChange, width],
  );

  // Pointer drag is tracked on the window so the stop keeps following the
  // pointer after it leaves the ruler, which is what makes dragging feel solid.
  useEffect(() => {
    if (!dragging) return;

    const onMove = (event: PointerEvent) => {
      const track = trackRef.current;
      if (!track) return;
      const rect = track.getBoundingClientRect();
      moveStop(dragging, (event.clientX - rect.left) / scale);
    };
    const stop = () => setDragging(null);

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', stop);
    window.addEventListener('pointercancel', stop);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', stop);
      window.removeEventListener('pointercancel', stop);
    };
  }, [dragging, moveStop, scale]);

  const onStopKeyDown = (stop: Stop) => (event: React.KeyboardEvent) => {
    const step = event.shiftKey ? PX_PER_INCH : NUDGE_PX;
    const current = stop === 'left' ? marginLeft : marginRight;
    let next: number | null = null;

    switch (event.key) {
      case 'ArrowLeft':
        next = stop === 'left' ? current - step : current + step;
        break;
      case 'ArrowRight':
        next = stop === 'left' ? current + step : current - step;
        break;
      case 'Home':
        next = MIN_MARGIN;
        break;
      case 'End':
        next = (stop === 'left' ? width - marginRight : width - marginLeft) - MIN_PRINTING_WIDTH;
        break;
      default:
        return;
    }

    event.preventDefault();
    if (stop === 'left') {
      onChange({ marginLeft: clampLeft(next), marginRight });
    } else {
      onChange({ marginLeft, marginRight: clampRight(next) });
    }
  };

  // A tick every half inch, taller on the inch.
  const ticks: React.ReactNode[] = [];
  for (let px = 0; px <= width; px += PX_PER_INCH / 2) {
    const isInch = Math.round(px) % PX_PER_INCH === 0;
    ticks.push(
      <span
        key={px}
        className={cn('margin-ruler-tick', isInch && 'margin-ruler-tick-inch')}
        style={{ left: `${(px / width) * 100}%` }}
      />,
    );
  }

  const columns = Math.floor((width - marginLeft - marginRight) / charWidth);

  const stopButton = (stop: Stop) => {
    const px = stop === 'left' ? marginLeft : marginRight;
    const position = stop === 'left' ? marginLeft : rightEdge;
    return (
      <button
        type="button"
        role="slider"
        aria-label={stop === 'left' ? 'Left margin stop' : 'Right margin stop'}
        aria-valuemin={pxToInches(MIN_MARGIN)}
        aria-valuemax={pxToInches(width - MIN_PRINTING_WIDTH)}
        aria-valuenow={pxToInches(px)}
        aria-valuetext={`${pxToInches(px)} inches`}
        className={cn('margin-ruler-stop', `margin-ruler-stop-${stop}`, dragging === stop && 'margin-ruler-stop-dragging')}
        style={{ left: `${(position / width) * 100}%` }}
        onPointerDown={(event) => {
          event.preventDefault();
          (event.target as HTMLElement).focus();
          setDragging(stop);
        }}
        onKeyDown={onStopKeyDown(stop)}
      >
        <span className="margin-ruler-stop-tab" />
      </button>
    );
  };

  return (
    <div className="margin-ruler" style={{ width: `${width * scale}px` }}>
      <div ref={trackRef} className="margin-ruler-track">
        <div className="margin-ruler-dead" style={{ width: `${(marginLeft / width) * 100}%`, left: 0 }} />
        <div className="margin-ruler-dead" style={{ width: `${(marginRight / width) * 100}%`, right: 0 }} />
        {ticks}
        {stopButton('left')}
        {stopButton('right')}
      </div>
      <p className="margin-ruler-readout">
        <span>{pxToInches(marginLeft)}&Prime;</span>
        <span className="margin-ruler-readout-columns">{columns} columns</span>
        <span>{pxToInches(marginRight)}&Prime;</span>
      </p>
    </div>
  );
}
