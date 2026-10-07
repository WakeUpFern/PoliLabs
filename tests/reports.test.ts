import { test } from "node:test";
import assert from "node:assert/strict";
import { PDFDocument } from "pdf-lib";
import {
  describePeriod,
  formatReportTime,
  MAX_REPORT_ROWS,
  REPORT_LIST,
  ReportError,
  reportFileName,
  reportFormat,
  reportKey,
  reportPeriod,
  type ReportTable,
} from "../src/modules/reports/domain/reports";
import { toCsv } from "../src/modules/reports/domain/csv";
import {
  attentionReason,
  project,
  type LoanRow,
} from "../src/modules/reports/domain/report-tables";
import { ReportService } from "../src/modules/reports/application/reports";
import type {
  ReportStore,
  ReportTransaction,
} from "../src/modules/reports/application/report-store";
import { renderReportPdf } from "../src/modules/reports/infrastructure/pdf-renderer";
import { ReportsWeb } from "../src/modules/reports/web/reports-web";
import { AuthorizationDeniedError } from "../src/modules/identity/domain/access-errors";

const actor = "11111111-1111-1111-1111-111111111111";
const lab = "22222222-2222-2222-2222-222222222222";
const now = new Date("2026-10-07T18:00:00Z");
const rejected = (code: string) => (error: unknown) =>
  error instanceof ReportError && error.code === code;

test("report keys and formats are closed lists", () => {
  assert.equal(reportKey("loans"), "loans");
  assert.throws(() => reportKey("users"), rejected("not-found"));
  assert.equal(reportFormat("pdf"), "pdf");
  for (const value of ["xlsx", "", null, undefined])
    assert.throws(() => reportFormat(value), rejected("input"));
});

test("periods need offsets, positive length and at most 366 days", () => {
  const period = reportPeriod(
    "2026-10-01T00:00:00-06:00",
    "2026-10-08T00:00:00-06:00",
  );
  assert.equal(period.from.toISOString(), "2026-10-01T06:00:00.000Z");
  assert.equal(
    describePeriod(period),
    "2026-10-01 a 2026-10-07 (America/Mexico_City)",
  );
  reportPeriod("2025-10-01T00:00:00Z", "2026-10-02T00:00:00Z");
  for (const [from, to] of [
    ["2026-10-01T00:00", "2026-10-02T00:00:00Z"],
    ["2026-10-02T00:00:00Z", "2026-10-02T00:00:00Z"],
    ["2026-10-03T00:00:00Z", "2026-10-02T00:00:00Z"],
    ["2025-10-01T00:00:00Z", "2026-10-03T00:00:00Z"],
    [null, "2026-10-02T00:00:00Z"],
  ])
    assert.throws(() => reportPeriod(from, to), rejected("input"));
});

test("times are shown as sortable wall time of the laboratory", () => {
  assert.equal(formatReportTime(now), "2026-10-07 12:00");
  assert.equal(formatReportTime(null), null);
});

test("CSV quotes per RFC 4180 and neutralizes user formulas", () => {
  const csv = toCsv({
    columns: [
      { header: "Notas", kind: "text", width: 1 },
      { header: "Cantidad", kind: "number", width: 1 },
    ],
    rows: [
      ['Dijo "hola", y\nsalió', "3.000"],
      ['=HYPERLINK("x")', null],
      ["-1+1", "-2.000"],
      ["Pinzas ñandú", "1.000"],
    ],
  });
  assert.ok(csv.startsWith("﻿"));
  assert.equal(
    csv.slice(1),
    'Notas,Cantidad\r\n"Dijo ""hola"", y\nsalió",3.000\r\n"\'=HYPERLINK(""x"")",\r\n\'-1+1,-2.000\r\nPinzas ñandú,1.000\r\n',
  );
});

const loan: LoanRow = {
  loanedAt: new Date("2026-10-01T15:00:00Z"),
  itemName: "Pinzas",
  borrowerName: "Alumno sintético",
  quantity: "3.000",
  outstanding: "2.000",
  status: "active",
  dueAt: new Date("2026-10-05T15:00:00Z"),
  closedAt: null,
  sessionLabel: null,
  actorName: "Responsable",
  returnedGood: "1.000",
  returnedDamaged: "0.000",
  returnedLost: "0.000",
  notes: null,
};

test("loan status is derived at generation time", () => {
  const table = project(
    "loans",
    [
      loan,
      { ...loan, dueAt: null },
      { ...loan, status: "returned", outstanding: "0.000" },
    ],
    now,
  );
  assert.deepEqual(
    table.rows.map((row) => row[5]),
    ["Vencido", "Activo", "Devuelto"],
  );
  assert.equal(table.rows[0][0], "2026-10-01 09:00");
  assert.equal(table.columns.length, table.rows[0].length);
});

test("attention reasons combine operational status and due dates", () => {
  const resource = {
    spaceName: "Nave",
    resourceName: "Torno",
    lastPerformedAt: null,
    lastType: null,
  };
  assert.equal(
    attentionReason(
      { ...resource, operationalStatus: "out_of_service", nextDueOn: null },
      "2026-10-07",
    ),
    "Fuera de servicio",
  );
  assert.equal(
    attentionReason(
      {
        ...resource,
        operationalStatus: "operational",
        nextDueOn: "2026-10-06",
      },
      "2026-10-07",
    ),
    "Mantenimiento vencido",
  );
  assert.equal(
    attentionReason(
      {
        ...resource,
        operationalStatus: "in_maintenance",
        nextDueOn: "2026-10-07",
      },
      "2026-10-07",
    ),
    "En mantenimiento; Mantenimiento próximo",
  );
});

function fakeStore(granted: string[], rows: unknown[] = []) {
  const calls: { permission: string; method: string; args: unknown[] }[] = [];
  const store: ReportStore = {
    async run(_context, permission, operation) {
      if (!granted.includes(permission)) throw new AuthorizationDeniedError();
      const tx = new Proxy({} as ReportTransaction, {
        get:
          (_target, method: string) =>
          async (...args: unknown[]) => {
            calls.push({ permission, method, args });
            return method === "header"
              ? { laboratoryName: "Lab sintético", actorName: "Responsable" }
              : rows;
          },
      });
      return operation(tx, granted);
    },
  };
  return { store, calls };
}

test("the catalog lists only reports whose permission is held", async () => {
  const { store } = fakeStore(["laboratory.read", "inventory.read"]);
  const reports = await new ReportService(store).catalog({
    actorUserId: actor,
    laboratoryId: lab,
  });
  assert.deepEqual(
    reports.map((r) => r.key),
    ["inventory-stock", "inventory-movements"],
  );
  assert.equal(REPORT_LIST.length, 6);
});

test("each report authorizes its own read permission", async () => {
  const { store, calls } = fakeStore(["maintenance.read"]);
  const service = new ReportService(store, () => now);
  const table = await service.generate({
    actorUserId: actor,
    laboratoryId: lab,
    report: "resource-attention",
  });
  assert.equal(table.generatedBy, "Responsable");
  assert.equal(table.period, null);
  // Horizon of 30 local days from 2026-10-07.
  assert.deepEqual(calls[0], {
    permission: "maintenance.read",
    method: "resourceAttention",
    args: ["2026-11-06", MAX_REPORT_ROWS + 1],
  });
  await assert.rejects(
    service.generate({
      actorUserId: actor,
      laboratoryId: lab,
      report: "incidents",
      from: "2026-10-01T00:00:00Z",
      to: "2026-10-02T00:00:00Z",
    }),
    AuthorizationDeniedError,
  );
});

test("period reports are validated before reading and oversize is rejected", async () => {
  const { store, calls } = fakeStore(
    ["inventory.read"],
    Array.from({ length: MAX_REPORT_ROWS + 1 }, () => ({})),
  );
  const service = new ReportService(store, () => now);
  const input = { actorUserId: actor, laboratoryId: lab };
  await assert.rejects(
    service.generate({ ...input, report: "inventory-movements" }),
    rejected("input"),
  );
  assert.equal(calls.length, 0);
  await assert.rejects(
    service.generate({ ...input, report: "inventory-stock" }),
    rejected("too-large"),
  );
  await assert.rejects(
    service.generate({
      ...input,
      actorUserId: "nope",
      report: "inventory-stock",
    }),
    rejected("input"),
  );
});

function table(rows: number): ReportTable {
  return {
    key: "inventory-movements",
    title: "Movimientos de inventario",
    laboratoryName: "Lab sintético",
    generatedAt: now,
    generatedBy: "Responsable",
    period: "2026-10-01 a 2026-10-07 (America/Mexico_City)",
    notes: ["Nota"],
    columns: [
      { header: "Artículo", kind: "text", width: 2 },
      { header: "Notas", kind: "text", width: 3 },
      { header: "Cantidad", kind: "number", width: 1 },
    ],
    rows: Array.from({ length: rows }, (_, i) => [
      `Artículo ${i} − “especial” 🔧`,
      "Texto largo ".repeat(40),
      "1.000",
    ]),
  };
}

test("the PDF paginates, repeats headers and survives non-WinAnsi text", async () => {
  const bytes = await renderReportPdf(table(60));
  assert.equal(new TextDecoder().decode(bytes.slice(0, 5)), "%PDF-");
  const pdf = await PDFDocument.load(bytes);
  assert.ok(pdf.getPageCount() > 1);
  assert.equal(pdf.getTitle(), "Movimientos de inventario — Lab sintético");
  const empty = await PDFDocument.load(await renderReportPdf(table(0)));
  assert.equal(empty.getPageCount(), 1);
  assert.equal(
    reportFileName(table(0), "pdf"),
    "inventory-movements-2026-10-07.pdf",
  );
});

function web(granted: string[]) {
  const generated: Record<string, unknown>[] = [];
  const reports = new ReportService(fakeStore(granted).store, () => now);
  const generate = reports.generate.bind(reports);
  reports.generate = (input) => {
    generated.push(input);
    return generate(input);
  };
  return {
    generated,
    web: new ReportsWeb({
      currentActor: async () => ({ actorUserId: actor }),
      laboratory: { execute: async () => ({ id: lab }) as never },
      reports,
      renderPdf: async () => new Uint8Array([37, 80, 68, 70]),
      clock: () => now,
    }),
  };
}

test("the web adapter converts inclusive local dates and sets download headers", async () => {
  const { web: adapter, generated } = web([
    "laboratory.read",
    "inventory.read",
  ]);
  const response = await adapter.download(
    "lab",
    "inventory-movements",
    new URLSearchParams({
      format: "csv",
      from: "2026-10-01",
      to: "2026-10-07",
    }),
  );
  assert.equal(generated[0].from, "2026-10-01T06:00:00.000Z");
  assert.equal(generated[0].to, "2026-10-08T06:00:00.000Z");
  assert.equal(response.headers.get("Content-Type"), "text/csv; charset=utf-8");
  assert.equal(
    response.headers.get("Content-Disposition"),
    'attachment; filename="inventory-movements-2026-10-07.csv"',
  );
  assert.equal(response.headers.get("Cache-Control"), "private, no-store");
  const bytes = new Uint8Array(await response.arrayBuffer());
  // The UTF-8 BOM survives on the wire; text() would strip it.
  assert.deepEqual([...bytes.slice(0, 3)], [0xef, 0xbb, 0xbf]);
  assert.match(
    new TextDecoder().decode(bytes),
    /^Fecha \(America\/Mexico_City\),/,
  );
  for (const query of [
    { format: "csv", from: "2026-10-01", to: "2026-02-30" },
    { format: "csv", from: "01/10/2026", to: "2026-10-07" },
    { format: "csv", from: "2026-10-01" },
    { format: "docx", from: "2026-10-01", to: "2026-10-07" },
  ] as Record<string, string>[])
    await assert.rejects(
      adapter.download(
        "lab",
        "inventory-movements",
        new URLSearchParams(query),
      ),
      rejected("input"),
    );
  const page = await adapter.page("lab");
  assert.deepEqual(page.defaults, { from: "2026-09-08", to: "2026-10-07" });
  const pdf = await adapter.download(
    "lab",
    "inventory-stock",
    new URLSearchParams({ format: "pdf" }),
  );
  assert.equal(pdf.headers.get("Content-Type"), "application/pdf");
});
