import { jsPDF } from 'jspdf';
import type { DocLine, DocumentModel, Token } from './documentModel';

const PDF_FONT_SIZE = 15;
const PDF_FONT_FAMILY = 'courier';

function lineTextFromTokens(tokens: Token[]): string {
  return tokens
    .map((token) => {
      if (token.type === 'word') return token.text;
      if (token.type === 'space') return ' ';
      return '';
    })
    .join('');
}

function drawLine(pdf: jsPDF, line: DocLine, x: number, y: number) {
  const lineText = lineTextFromTokens(line.tokens);
  if (!lineText) return;

  pdf.text(lineText, x, y, { baseline: 'top' });
}

export function exportDocumentToPdf(doc: DocumentModel): void {
  const { spec, metrics } = doc;

  const pdf = new jsPDF({
    orientation: 'portrait',
    unit: 'px',
    format: [spec.paper.width, spec.paper.height],
  });

  pdf.setFont(PDF_FONT_FAMILY, 'normal');
  pdf.setFontSize(PDF_FONT_SIZE);

  doc.pages.forEach((page, pageIndex) => {
    if (pageIndex > 0) {
      pdf.addPage([spec.paper.width, spec.paper.height], 'portrait');
      pdf.setFont(PDF_FONT_FAMILY, 'normal');
      pdf.setFontSize(PDF_FONT_SIZE);
    }

    page.lines.forEach((line, lineIndex) => {
      const x = spec.marginLeft;
      const y = spec.marginTop + lineIndex * metrics.lineHeight;
      drawLine(pdf, line, x, y);
    });
  });

  pdf.save(`typewriter-document-${Date.now()}.pdf`);
}
