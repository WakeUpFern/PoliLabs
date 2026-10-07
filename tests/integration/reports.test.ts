import { test } from "node:test";
import assert from "node:assert/strict";
import { ReportService } from "../../src/modules/reports/application/reports";
import { DrizzleReportStore } from "../../src/modules/reports/infrastructure/report-store";
import {
  addDays,
  reportDate,
  type ReportTable,
} from "../../src/modules/reports/domain/reports";
import { CreateInventoryItem } from "../../src/modules/inventory/application/inventory";
import { DrizzleInventoryStore } from "../../src/modules/inventory/infrastructure/inventory-store";
import { LoanService } from "../../src/modules/loans/application/loans";
import { DrizzleLoanStore } from "../../src/modules/loans/infrastructure/loan-store";
import { MaintenanceService } from "../../src/modules/maintenance/application/maintenance";
import { DrizzleMaintenanceStore } from "../../src/modules/maintenance/infrastructure/maintenance-store";
import { IncidentService } from "../../src/modules/incidents/application/incidents";
import { DrizzleIncidentStore } from "../../src/modules/incidents/infrastructure/incident-store";
import { AuthorizationDeniedError } from "../../src/modules/identity/domain/access-errors";
import { operationFixture } from "./operation-fixture";

// Cells keyed by column header, without the time zone suffix.
function records(table: ReportTable) {
  const headers = table.columns.map((c) =>
    c.header.replace(" (America/Mexico_City)", ""),
  );
  return table.rows.map((row) =>
    Object.fromEntries(row.map((cell, i) => [headers[i], cell])),
  );
}

test("Reports I exports laboratory-scoped data in PostgreSQL", async (t) => {
  const f = await operationFixture();
  const { db, actor, student, userIds, labIds, resourceRows } = f;
  const reports = new ReportService(new DrizzleReportStore(db));
  const create = new CreateInventoryItem(new DrizzleInventoryStore(db));
  const loans = new LoanService(new DrizzleLoanStore(db));
  const maintenance = new MaintenanceService(new DrizzleMaintenanceStore(db));
  const incidents = new IncidentService(new DrizzleIncidentStore(db));
  const item = (
    name: string,
    type: "consumable" | "reusable_tool",
    unit: string,
    initialQuantity: string,
    laboratoryId = actor.laboratoryId,
  ) =>
    create.execute({
      ...actor,
      laboratoryId,
      name,
      type,
      unit,
      initialQuantity,
      notes: "Existencia sintética",
    });
  const period = {
    from: new Date(Date.now() - 86400000).toISOString(),
    to: new Date(Date.now() + 86400000).toISOString(),
  };
  const generate = (report: string, context = actor) =>
    reports.generate({ ...context, report, ...period });
  try {
    const oil = await item("Aceite", "consumable", "litre", "5");
    const pliers = await item("Pinzas", "reusable_tool", "piece", "4");
    await item("Ajena", "consumable", "piece", "9", labIds[1]);
    const loan = await loans.lend({
      ...actor,
      itemId: pliers.id,
      borrowerUserId: userIds[1],
      quantity: "3",
    });
    await loans.registerReturn({
      ...actor,
      loanId: loan.id,
      quantity: "1",
      condition: "good",
    });
    await incidents.report({
      ...student,
      targetKind: "resource",
      targetId: resourceRows[0].id,
      description: "=Fuga observada",
      severity: "high",
    });
    const performedAt = new Date(Date.now() - 1800000).toISOString();
    const today = reportDate(new Date());
    await maintenance.record({
      ...actor,
      resourceId: resourceRows[0].id,
      type: "corrective",
      description: "Cambio de sello",
      statusAfter: "out_of_service",
      performedAt,
      materials: [{ itemId: oil.id, quantity: "1.5" }],
    });
    await maintenance.record({
      ...actor,
      resourceId: resourceRows[1].id,
      type: "preventive",
      description: "Revisión",
      statusAfter: "operational",
      performedAt,
      nextDueOn: addDays(today, 10),
    });

    await t.test(
      "stock subtracts outstanding loans per laboratory",
      async () => {
        const table = await reports.generate({
          ...actor,
          report: "inventory-stock",
        });
        assert.equal(table.laboratoryName, "Lab 0");
        assert.equal(table.generatedBy, "Operational 0");
        assert.deepEqual(
          records(table).map((r) => [
            r["Artículo"],
            r.Existencia,
            r.Prestado,
            r.Disponible,
          ]),
          [
            ["Aceite", "3.500", "0.000", "3.500"],
            ["Pinzas", "4.000", "2.000", "2.000"],
          ],
        );
      },
    );

    await t.test(
      "movements, loans and maintenance read the period",
      async () => {
        const movements = records(await generate("inventory-movements"));
        assert.deepEqual(
          movements.map((r) => [r["Artículo"], r.Movimiento, r.Cantidad]),
          [
            ["Aceite", "Existencia inicial", "5.000"],
            ["Pinzas", "Existencia inicial", "4.000"],
            ["Aceite", "Consumo", "1.500"],
          ],
        );
        const [lent] = records(await generate("loans"));
        assert.equal(lent.Prestatario, "Operational 1");
        assert.equal(lent.Pendiente, "2.000");
        assert.equal(lent["Devuelto bien"], "1.000");
        assert.equal(lent.Estado, "Activo");
        const logs = records(await generate("maintenance"));
        assert.deepEqual(
          logs.map((r) => [r.Espacio, r["Estado resultante"], r.Materiales]),
          [
            ["Room A", "Fuera de servicio", "Aceite 1.500 L"],
            ["Room B", "En operación", null],
          ],
        );
        const [incident] = records(await generate("incidents"));
        assert.equal(incident["Reportó"], "Operational 1");
        assert.equal(incident.Estado, "Abierta");
        assert.equal(incident["Descripción"], "=Fuga observada");
        const past = await reports.generate({
          ...actor,
          report: "inventory-movements",
          from: "2026-01-01T00:00:00Z",
          to: "2026-01-02T00:00:00Z",
        });
        assert.equal(past.rows.length, 0);
      },
    );

    await t.test(
      "attention lists out of service and soon-due resources",
      async () => {
        const table = await reports.generate({
          ...actor,
          report: "resource-attention",
        });
        assert.deepEqual(
          records(table).map((r) => [r.Espacio, r.Motivo]),
          [
            ["Room A", "Fuera de servicio"],
            ["Room B", "Mantenimiento próximo"],
          ],
        );
      },
    );

    await t.test("another laboratory sees only its own rows", async () => {
      const other = { ...actor, laboratoryId: labIds[1] };
      const stock = await reports.generate({
        ...other,
        report: "inventory-stock",
      });
      assert.deepEqual(
        records(stock).map((r) => r["Artículo"]),
        ["Ajena"],
      );
      assert.equal((await generate("loans", other)).rows.length, 0);
      assert.equal((await generate("maintenance", other)).rows.length, 0);
      assert.equal((await generate("incidents", other)).rows.length, 0);
    });

    await t.test("members without read permissions cannot export", async () => {
      assert.deepEqual(await reports.catalog(student), []);
      assert.equal((await reports.catalog(actor)).length, 6);
      for (const report of ["inventory-stock", "loans", "incidents"])
        await assert.rejects(
          generate(report, student),
          AuthorizationDeniedError,
        );
    });
  } finally {
    await f.cleanup();
  }
});
