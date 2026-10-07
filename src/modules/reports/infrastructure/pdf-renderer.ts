import {
  PDFDocument,
  rgb,
  StandardFonts,
  type PDFFont,
  type PDFPage,
} from "pdf-lib";
import {
  formatReportTime,
  REPORT_TIME_ZONE,
  type ReportTable,
} from "../domain/reports";

// US Letter landscape, in points.
const PAGE = { width: 792, height: 612, margin: 36 };
const BODY = 7;
const LINE = BODY * 1.25;
const PAD = 3;
const MAX_CELL_LINES = 8;
const INK = rgb(0.1, 0.1, 0.1);
const MUTED = rgb(0.4, 0.4, 0.4);
const RULE = rgb(0.8, 0.8, 0.8);
const HEADER_FILL = rgb(0.92, 0.9, 0.88);

// Standard fonts only encode WinAnsi; anything else prints as "?".
function sanitizer(font: PDFFont) {
  const supported = new Set(font.getCharacterSet());
  return (value: string) =>
    Array.from(value, (char) =>
      supported.has(char.codePointAt(0)!) ? char : "?",
    ).join("");
}

function wrap(text: string, font: PDFFont, size: number, width: number) {
  const fits = (value: string) => font.widthOfTextAtSize(value, size) <= width;
  const lines: string[] = [];
  for (const paragraph of text.split(/\r?\n/)) {
    let line = "";
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      const candidate = line ? `${line} ${word}` : word;
      if (fits(candidate)) {
        line = candidate;
        continue;
      }
      if (line) lines.push(line);
      // Break words longer than the column.
      line = "";
      for (const char of word) {
        if (fits(line + char)) line += char;
        else {
          lines.push(line);
          line = char;
        }
      }
    }
    lines.push(line);
  }
  if (lines.length <= MAX_CELL_LINES) return lines;
  const kept = lines.slice(0, MAX_CELL_LINES);
  let last = kept[MAX_CELL_LINES - 1];
  while (last && !fits(`${last}…`)) last = last.slice(0, -1);
  kept[MAX_CELL_LINES - 1] = `${last}…`;
  return kept;
}

export async function renderReportPdf(table: ReportTable) {
  const pdf = await PDFDocument.create();
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const clean = sanitizer(regular);
  pdf.setTitle(clean(`${table.title} — ${table.laboratoryName}`));
  pdf.setCreator("Labora");
  pdf.setProducer("Labora");
  pdf.setCreationDate(table.generatedAt);
  pdf.setModificationDate(table.generatedAt);

  const usable = PAGE.width - PAGE.margin * 2;
  const totalWeight = table.columns.reduce((sum, c) => sum + c.width, 0);
  const widths = table.columns.map((c) => (c.width / totalWeight) * usable);
  const bottom = PAGE.margin + 18;
  let page: PDFPage;
  let y = 0;

  const text = (
    value: string,
    x: number,
    size: number,
    font = regular,
    color = INK,
  ) => page.drawText(clean(value), { x, y, size, font, color });

  function layout(cells: (string | null)[], font: PDFFont) {
    const lines = cells.map((cell, i) =>
      wrap(clean(cell ?? ""), font, BODY, widths[i] - PAD * 2),
    );
    const height = Math.max(...lines.map((l) => l.length)) * LINE + PAD * 2;
    return { lines, height };
  }
  function drawRow(
    row: ReturnType<typeof layout>,
    font: PDFFont,
    fill?: typeof HEADER_FILL,
  ) {
    if (fill)
      page.drawRectangle({
        x: PAGE.margin,
        y: y - row.height,
        width: usable,
        height: row.height,
        color: fill,
      });
    let x = PAGE.margin;
    row.lines.forEach((lines, i) => {
      const numeric = !fill && table.columns[i].kind === "number";
      lines.forEach((line, n) => {
        const width = font.widthOfTextAtSize(line, BODY);
        page.drawText(line, {
          x: numeric ? x + widths[i] - PAD - width : x + PAD,
          y: y - PAD - BODY - n * LINE + 1,
          size: BODY,
          font,
          color: INK,
        });
      });
      x += widths[i];
    });
    y -= row.height;
    page.drawLine({
      start: { x: PAGE.margin, y },
      end: { x: PAGE.width - PAGE.margin, y },
      thickness: 0.5,
      color: RULE,
    });
  }

  const columnHeader = layout(
    // The time zone is stated once in the metadata, not in every header.
    table.columns.map((c) => c.header.replace(` (${REPORT_TIME_ZONE})`, "")),
    bold,
  );
  function newPage(first: boolean) {
    page = pdf.addPage([PAGE.width, PAGE.height]);
    y = PAGE.height - PAGE.margin - 14;
    text(table.title, PAGE.margin, 14, bold);
    y -= 16;
    text(table.laboratoryName, PAGE.margin, 9, regular, MUTED);
    if (first) {
      const meta = [
        table.period ? `Periodo: ${table.period}` : null,
        `Generado: ${formatReportTime(table.generatedAt)} por ${table.generatedBy}. Fechas y horas en ${REPORT_TIME_ZONE}.`,
        `Registros: ${table.rows.length}`,
        ...table.notes,
      ].filter((line): line is string => line !== null);
      for (const line of meta) {
        y -= 12;
        text(line, PAGE.margin, 8, regular, MUTED);
      }
    }
    y -= 10;
    drawRow(columnHeader, bold, HEADER_FILL);
  }

  newPage(true);
  if (!table.rows.length) {
    y -= 14;
    text("Sin registros para los criterios seleccionados.", PAGE.margin, 9);
  }
  for (const cells of table.rows) {
    const row = layout(cells, regular);
    if (y - row.height < bottom) newPage(false);
    drawRow(row, regular);
  }

  const pages = pdf.getPages();
  pages.forEach((p, i) => {
    const label = `Página ${i + 1} de ${pages.length}`;
    p.drawText(label, {
      x: PAGE.width - PAGE.margin - regular.widthOfTextAtSize(label, 8),
      y: PAGE.margin,
      size: 8,
      font: regular,
      color: MUTED,
    });
  });
  return pdf.save();
}
