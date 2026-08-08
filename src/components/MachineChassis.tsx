import React from 'react';
import { cn } from '../lib/utils';
import { CHASSIS, MODELS, type ModelKey, type RibbonKey } from '../lib/machines';

interface MachineChassisProps {
  model: ModelKey;
  ribbon: RibbonKey;
  /** Paper width in px, before scaling */
  paperWidth: number;
  /** Distance from the top of the typing area to the printing line, in px */
  printingLineY: number;
  /** Height of one line at the current spacing, in px */
  lineHeight: number;
  /** Horizontal position of the strike point within the page, in px */
  strikeX: number;
  /** Page scale factor applied by the responsive fitter */
  scale: number;
  /**
   * How far the carriage has travelled, in px.
   *
   * The platen, knobs, rails and paper are all carried by the carriage, so they
   * move together — the sheet does not slide past its own rollers. Only the
   * type guide is bolted to the machine body and stays at the strike point.
   */
  carriageX: number;
  /** Nudge applied by machine recoil, in px */
  offsetX: number;
  offsetY: number;
  /** Advances the ribbon spools by one notch on each keystroke */
  ribbonTurn: number;
  /** Drops the platen furniture back on small screens */
  compact: boolean;
  reducedMotion: boolean;
}

const RIBBON_INK: Record<RibbonKey, string> = {
  black: '#1c1c22',
  red: '#7e211c',
  blue: '#1d3572',
  stencil: '#8d8778',
};

/**
 * The machine around the page.
 *
 * The previous chassis stacked eight translucent dark panels *on top of* the
 * sheet, which cost the paper about a third of its brightness — it measured
 * rgb(166,163,157) against a declared rgb(243,239,229). Nothing here covers the
 * writing surface except the platen assembly, which is opaque and belongs in
 * front of the paper exactly as it does on a real machine: the sheet wraps the
 * platen, passes under the bail rollers, and is struck at the type guide.
 *
 * Everything else — the carriage rails, the knobs, the front apron — sits
 * outside the sheet's own width.
 */
export function MachineChassis({
  model,
  ribbon,
  paperWidth,
  printingLineY,
  lineHeight,
  strikeX,
  scale,
  carriageX,
  offsetX,
  offsetY,
  ribbonTurn,
  compact,
  reducedMotion,
}: MachineChassisProps) {
  const chassis = CHASSIS[model];
  const machine = MODELS[model];
  const ink = RIBBON_INK[ribbon];

  const railWidth = compact ? Math.round(chassis.railWidth * 0.55) : chassis.railWidth;
  const platenHeight = compact ? Math.round(chassis.platenHeight * 0.7) : chassis.platenHeight;
  const knobSize = Math.round(platenHeight * 1.5);

  // The platen sits above the printing line with a gap for the bail: the sheet
  // wraps the roller, passes under the bail rollers, and is struck below both.
  const platenTop = printingLineY - platenHeight - 22;

  const style = {
    '--body': chassis.body,
    '--body-shade': chassis.bodyShade,
    '--body-highlight': chassis.bodyHighlight,
    '--platen': chassis.platen,
    '--knob': chassis.knob,
    '--trim': chassis.trim,
    '--plate-ink': chassis.plateInk,
    '--radius': `${chassis.radius}px`,
    '--ribbon-ink': ink,
  } as React.CSSProperties;

  return (
    <div className="pointer-events-none absolute inset-0 z-20 overflow-hidden" aria-hidden="true" style={style}>
      {/* The carriage: rails, platen, knobs and spools travel with the sheet. */}
      <div
        className="machine-carriage absolute left-1/2 top-0 h-full"
        style={{
          width: `${paperWidth * scale}px`,
          transform: `translateX(-50%) translateX(${carriageX + offsetX}px)`,
        }}
      >
        <div
          className={cn('machine-rail machine-rail-left', `machine-finish-${chassis.finish}`)}
          style={{ width: `${railWidth}px`, left: `${-railWidth}px` }}
        />
        <div
          className={cn('machine-rail machine-rail-right', `machine-finish-${chassis.finish}`)}
          style={{ width: `${railWidth}px`, right: `${-railWidth}px` }}
        />

        {/* Platen assembly — the one part that belongs in front of the sheet */}
        <div
          className="absolute"
          style={{
            top: `${platenTop + offsetY}px`,
            left: `${-railWidth * 0.55}px`,
            right: `${-railWidth * 0.55}px`,
            height: `${platenHeight + 8}px`,
          }}
        >
          <div className="machine-platen" style={{ height: `${platenHeight}px` }}>
            <div className="machine-platen-sheen" />
            <div className="machine-platen-grain" />
          </div>

          {/* Paper bail: the bar that holds the sheet flat against the platen */}
          <div className="machine-bail" style={{ top: `${platenHeight * 0.62}px` }}>
            <span className="machine-bail-roller" style={{ left: '14%' }} />
            <span className="machine-bail-roller" style={{ left: '48%' }} />
            <span className="machine-bail-roller" style={{ left: '82%' }} />
          </div>

          {/* Knobs at both ends of the roller */}
          <div
            className="machine-knob"
            style={{
              width: `${knobSize}px`,
              height: `${knobSize}px`,
              left: `${-knobSize * 0.62}px`,
              top: `${(platenHeight - knobSize) / 2}px`,
            }}
          >
            <span className="machine-knob-face" />
          </div>
          <div
            className="machine-knob"
            style={{
              width: `${knobSize}px`,
              height: `${knobSize}px`,
              right: `${-knobSize * 0.62}px`,
              top: `${(platenHeight - knobSize) / 2}px`,
            }}
          >
            <span className="machine-knob-face" />
          </div>

          {/* Shadow the platen casts down onto the sheet. A narrow gradient at
              the roller's edge, not a wash over the whole page. */}
          <div className="machine-platen-shadow" style={{ top: `${platenHeight}px` }} />
        </div>

        {!compact && (
          <>
            {/* Ribbon spools, which advance a notch on every strike */}
            <div
              className="machine-spool"
              style={{
                top: `${platenTop - 26 + offsetY}px`,
                left: `${-railWidth * 0.1}px`,
                transform: reducedMotion ? undefined : `rotate(${ribbonTurn * 11}deg)`,
              }}
            >
              <span className="machine-spool-hub" />
            </div>
            <div
              className="machine-spool"
              style={{
                top: `${platenTop - 26 + offsetY}px`,
                right: `${-railWidth * 0.1}px`,
                transform: reducedMotion ? undefined : `rotate(${ribbonTurn * -11}deg)`,
              }}
            >
              <span className="machine-spool-hub" />
            </div>
          </>
        )}

        {/* Type guide: the small forked bracket the typebar strikes through */}
        <div
          className="machine-type-guide"
          style={{
            left: `${strikeX * scale}px`,
            top: `${printingLineY - 3 + offsetY}px`,
            height: `${Math.max(10, lineHeight * 0.6)}px`,
          }}
        >
          <span className="machine-type-guide-jaw machine-type-guide-jaw-left" />
          <span className="machine-type-guide-jaw machine-type-guide-jaw-right" />
        </div>
      </div>

      {/* Front apron, docked to the bottom of the view so it never covers page */}
      <div className={cn('machine-apron', `machine-finish-${chassis.finish}`, compact && 'machine-apron-compact')}>
        <div className="machine-apron-lip" />
        <div className="machine-nameplate">
          <span className="machine-nameplate-mark">{chassis.nameplate}</span>
          {!compact && <span className="machine-nameplate-era">{machine.era}</span>}
        </div>
      </div>
    </div>
  );
}
