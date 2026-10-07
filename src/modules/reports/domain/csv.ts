import type { ColumnKind, ReportCell, ReportTable } from "./reports";

// Spreadsheets evaluate text starting with these characters as formulas.
const FORMULA_START = /^[=+\-@\t\r]/;

// Only user-entered text can carry a formula; headers, numbers and dates are ours.
function cell(value: ReportCell, kind: ColumnKind | "header") {
  if (value === null) return "";
  const safe =
    kind === "text" && FORMULA_START.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe;
}

// RFC 4180 with CRLF and a UTF-8 BOM so spreadsheets keep accents. The first
// row is the header; report metadata travels in the file name and the PDF.
export function toCsv(table: Pick<ReportTable, "columns" | "rows">) {
  const lines = [
    table.columns.map((c) => cell(c.header, "header")),
    ...table.rows.map((row) =>
      row.map((v, i) => cell(v, table.columns[i].kind)),
    ),
  ];
  return `﻿${lines.map((line) => line.join(",")).join("\r\n")}\r\n`;
}
