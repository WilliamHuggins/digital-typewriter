export interface CursorLineInfo {
  lineIndex: number;
  lineStart: number;
  lineEnd: number;
  lineLength: number;
  currentColumn: number;
}

export interface BellColumns {
  ringAtColumn: number;
  resetAtColumn: number;
}

export interface BellEvaluation {
  shouldRing: boolean;
  bellArmed: boolean;
  inBellZone: boolean;
  leftBellZone: boolean;
  line: CursorLineInfo;
}

export const clampCursor = (text: string, cursorPos: number) =>
  Math.max(0, Math.min(cursorPos, text.length));

export const getLineInfoAtPosition = (text: string, cursorPos: number): CursorLineInfo => {
  const safePos = clampCursor(text, cursorPos);
  const lineStart = text.lastIndexOf('\n', safePos - 1) + 1;
  const lineEndIndex = text.indexOf('\n', safePos);
  const lineEnd = lineEndIndex === -1 ? text.length : lineEndIndex;

  let lineIndex = 0;
  for (let i = 0; i < lineStart; i++) {
    if (text[i] === '\n') {
      lineIndex++;
    }
  }

  return {
    lineIndex,
    lineStart,
    lineEnd,
    lineLength: lineEnd - lineStart,
    currentColumn: safePos - lineStart
  };
};

export const moveCursorLeft = (text: string, cursorPos: number) => clampCursor(text, cursorPos - 1);

export const moveCursorRight = (text: string, cursorPos: number) => clampCursor(text, cursorPos + 1);

export const moveCursorUp = (text: string, cursorPos: number) => {
  const current = getLineInfoAtPosition(text, cursorPos);
  if (current.lineIndex === 0) {
    return 0;
  }

  const previousLineEnd = Math.max(0, current.lineStart - 1);
  const previous = getLineInfoAtPosition(text, previousLineEnd);
  return previous.lineStart + Math.min(current.currentColumn, previous.lineLength);
};

export const moveCursorDown = (text: string, cursorPos: number) => {
  const current = getLineInfoAtPosition(text, cursorPos);
  if (current.lineEnd >= text.length) {
    return text.length;
  }

  const next = getLineInfoAtPosition(text, current.lineEnd + 1);
  return next.lineStart + Math.min(current.currentColumn, next.lineLength);
};

export const canApplyTextWithinMaxColumns = (text: string, maxColumnsPerLine: number) =>
  text.split('\n').every((line) => line.length <= maxColumnsPerLine);

export const evaluateBellState = (
  text: string,
  cursorPos: number,
  bellArmed: boolean,
  bellColumns: BellColumns
): BellEvaluation => {
  const line = getLineInfoAtPosition(text, cursorPos);
  const inBellZone = line.currentColumn >= bellColumns.ringAtColumn || line.lineLength >= bellColumns.ringAtColumn;
  const leftBellZone = line.currentColumn <= bellColumns.resetAtColumn && line.lineLength <= bellColumns.resetAtColumn;

  const nextBellArmed = leftBellZone ? true : bellArmed;
  const shouldRing = inBellZone && nextBellArmed;

  return {
    shouldRing,
    bellArmed: shouldRing ? false : nextBellArmed,
    inBellZone,
    leftBellZone,
    line
  };
};

export const shouldRearmBellAfterCursorOrEdit = (
  text: string,
  cursorPos: number,
  bellColumns: BellColumns
) => {
  const line = getLineInfoAtPosition(text, cursorPos);
  return line.currentColumn <= bellColumns.resetAtColumn && line.lineLength <= bellColumns.resetAtColumn;
};
