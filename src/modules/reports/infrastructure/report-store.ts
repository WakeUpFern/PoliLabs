import {
  and,
  asc,
  desc,
  eq,
  gte,
  inArray,
  lt,
  lte,
  ne,
  or,
  sql,
} from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import {
  authorizeLocked,
  type OperationDatabase,
  type OperationTransaction,
} from "@/modules/identity/infrastructure/authorize-locked";
import type { PermissionKey } from "@/modules/identity/domain/access-catalog";
import { users } from "@/modules/identity/infrastructure/auth-schema";
import { laboratories } from "@/modules/identity/infrastructure/access-schema";
import {
  locations,
  resources,
  spaces,
} from "@/modules/spatial/infrastructure/spatial-schema";
import {
  labSessions,
  practices,
} from "@/modules/academic/infrastructure/academic-schema";
import {
  inventoryItems,
  inventoryMovements,
  inventoryStocks,
} from "@/modules/inventory/infrastructure/inventory-schema";
import {
  inventoryLoanReturns,
  inventoryLoans,
} from "@/modules/loans/infrastructure/loan-schema";
import {
  maintenanceLogs,
  maintenanceMaterials,
} from "@/modules/maintenance/infrastructure/maintenance-schema";
import { incidentReports } from "@/modules/incidents/infrastructure/incident-schema";
import type { ReportContext, ReportPeriod } from "../domain/reports";
import type {
  ReportStore,
  ReportTransaction,
} from "../application/report-store";

const borrowers = alias(users, "report_borrowers");
const quantity = (value: unknown) =>
  sql<string>`(${value})::numeric(18,3)::text`;

class DrizzleReportTransaction implements ReportTransaction {
  constructor(
    private readonly tx: OperationTransaction,
    private readonly context: ReportContext,
  ) {}
  async header() {
    const [row] = await this.tx
      .select({ laboratoryName: laboratories.name, actorName: users.name })
      .from(laboratories)
      .innerJoin(users, eq(users.id, this.context.actorUserId))
      .where(eq(laboratories.id, this.context.laboratoryId));
    return row;
  }
  inventoryStock(limit: number) {
    // Same snapshot for stock and outstanding loans (repeatable read).
    const loaned = this.tx
      .select({
        itemId: inventoryLoans.itemId,
        value:
          sql<string>`sum(${inventoryLoans.quantity} - ${inventoryLoans.returnedQuantity})`.as(
            "value",
          ),
      })
      .from(inventoryLoans)
      .where(
        and(
          eq(inventoryLoans.laboratoryId, this.context.laboratoryId),
          eq(inventoryLoans.status, "active"),
        ),
      )
      .groupBy(inventoryLoans.itemId)
      .as("report_loaned");
    const outstanding = sql`coalesce(${loaned.value}, 0)`;
    return this.tx
      .select({
        itemName: inventoryItems.name,
        itemType: inventoryItems.type,
        unit: inventoryItems.unit,
        spaceName: spaces.name,
        locationName: locations.name,
        stock: inventoryStocks.quantity,
        loaned: quantity(outstanding),
        available: quantity(sql`${inventoryStocks.quantity} - ${outstanding}`),
      })
      .from(inventoryItems)
      .innerJoin(inventoryStocks, eq(inventoryStocks.itemId, inventoryItems.id))
      .leftJoin(locations, eq(locations.id, inventoryStocks.locationId))
      .leftJoin(spaces, eq(spaces.id, locations.spaceId))
      .leftJoin(loaned, eq(loaned.itemId, inventoryItems.id))
      .where(
        and(
          eq(inventoryItems.laboratoryId, this.context.laboratoryId),
          eq(inventoryItems.isActive, true),
        ),
      )
      .orderBy(sql`lower(${inventoryItems.name})`, asc(inventoryItems.id))
      .limit(limit);
  }
  inventoryMovements(period: ReportPeriod, limit: number) {
    return this.tx
      .select({
        createdAt: inventoryMovements.createdAt,
        itemName: inventoryItems.name,
        unit: inventoryItems.unit,
        type: inventoryMovements.type,
        quantity: inventoryMovements.quantity,
        quantityBefore: inventoryMovements.quantityBefore,
        quantityAfter: inventoryMovements.quantityAfter,
        actorName: users.name,
        source: inventoryMovements.source,
        notes: inventoryMovements.notes,
      })
      .from(inventoryMovements)
      .innerJoin(
        inventoryItems,
        eq(inventoryItems.id, inventoryMovements.itemId),
      )
      .innerJoin(users, eq(users.id, inventoryMovements.actorUserId))
      .where(
        and(
          eq(inventoryMovements.laboratoryId, this.context.laboratoryId),
          gte(inventoryMovements.createdAt, period.from),
          lt(inventoryMovements.createdAt, period.to),
        ),
      )
      .orderBy(asc(inventoryMovements.createdAt), asc(inventoryMovements.id))
      .limit(limit);
  }
  loans(period: ReportPeriod, limit: number) {
    const returned = (condition: string) =>
      sql`coalesce(sum(${inventoryLoanReturns.quantity}) filter (where ${inventoryLoanReturns.condition} = ${condition}), 0)`;
    const totals = this.tx
      .select({
        loanId: inventoryLoanReturns.loanId,
        good: quantity(returned("good")).as("good"),
        damaged: quantity(returned("damaged")).as("damaged"),
        lost: quantity(returned("lost")).as("lost"),
      })
      .from(inventoryLoanReturns)
      .where(eq(inventoryLoanReturns.laboratoryId, this.context.laboratoryId))
      .groupBy(inventoryLoanReturns.loanId)
      .as("report_returns");
    const none = quantity(sql`0`);
    return this.tx
      .select({
        loanedAt: inventoryLoans.loanedAt,
        itemName: inventoryItems.name,
        borrowerName: borrowers.name,
        quantity: inventoryLoans.quantity,
        outstanding: quantity(
          sql`${inventoryLoans.quantity} - ${inventoryLoans.returnedQuantity}`,
        ),
        status: inventoryLoans.status,
        dueAt: inventoryLoans.dueAt,
        closedAt: inventoryLoans.closedAt,
        sessionLabel: practices.title,
        actorName: users.name,
        returnedGood: sql<string>`coalesce(${totals.good}, ${none})`,
        returnedDamaged: sql<string>`coalesce(${totals.damaged}, ${none})`,
        returnedLost: sql<string>`coalesce(${totals.lost}, ${none})`,
        notes: inventoryLoans.notes,
      })
      .from(inventoryLoans)
      .innerJoin(inventoryItems, eq(inventoryItems.id, inventoryLoans.itemId))
      .innerJoin(borrowers, eq(borrowers.id, inventoryLoans.borrowerUserId))
      .innerJoin(users, eq(users.id, inventoryLoans.actorUserId))
      .leftJoin(labSessions, eq(labSessions.id, inventoryLoans.sessionId))
      .leftJoin(practices, eq(practices.id, labSessions.practiceId))
      .leftJoin(totals, eq(totals.loanId, inventoryLoans.id))
      .where(
        and(
          eq(inventoryLoans.laboratoryId, this.context.laboratoryId),
          gte(inventoryLoans.loanedAt, period.from),
          lt(inventoryLoans.loanedAt, period.to),
        ),
      )
      .orderBy(asc(inventoryLoans.loanedAt), asc(inventoryLoans.id))
      .limit(limit);
  }
  async maintenance(period: ReportPeriod, limit: number) {
    const logs = await this.tx
      .select({
        id: maintenanceLogs.id,
        performedAt: maintenanceLogs.performedAt,
        spaceName: spaces.name,
        resourceName: resources.name,
        type: maintenanceLogs.type,
        statusBefore: maintenanceLogs.statusBefore,
        statusAfter: maintenanceLogs.statusAfter,
        performerName: users.name,
        nextDueOn: maintenanceLogs.nextDueOn,
        incidentId: maintenanceLogs.incidentId,
        description: maintenanceLogs.description,
      })
      .from(maintenanceLogs)
      .innerJoin(resources, eq(resources.id, maintenanceLogs.resourceId))
      .innerJoin(spaces, eq(spaces.id, maintenanceLogs.spaceId))
      .innerJoin(users, eq(users.id, maintenanceLogs.performedBy))
      .where(
        and(
          eq(maintenanceLogs.laboratoryId, this.context.laboratoryId),
          gte(maintenanceLogs.performedAt, period.from),
          lt(maintenanceLogs.performedAt, period.to),
        ),
      )
      // Grouped by resource within its space, chronological within each one.
      .orderBy(
        sql`lower(${spaces.name})`,
        sql`lower(${resources.name})`,
        asc(resources.id),
        asc(maintenanceLogs.performedAt),
        asc(maintenanceLogs.id),
      )
      .limit(limit);
    const materials = logs.length
      ? await this.tx
          .select({
            logId: maintenanceMaterials.maintenanceLogId,
            itemName: inventoryItems.name,
            quantity: inventoryMovements.quantity,
            unit: inventoryItems.unit,
          })
          .from(maintenanceMaterials)
          .innerJoin(
            inventoryMovements,
            eq(inventoryMovements.id, maintenanceMaterials.movementId),
          )
          .innerJoin(
            inventoryItems,
            eq(inventoryItems.id, inventoryMovements.itemId),
          )
          .where(
            and(
              eq(maintenanceMaterials.laboratoryId, this.context.laboratoryId),
              inArray(
                maintenanceMaterials.maintenanceLogId,
                logs.map((log) => log.id),
              ),
            ),
          )
          .orderBy(asc(inventoryItems.name), asc(maintenanceMaterials.id))
      : [];
    return logs.map(({ id, incidentId, ...log }) => ({
      ...log,
      linkedIncident: incidentId !== null,
      materials: materials
        .filter((m) => m.logId === id)
        .map(({ logId: _logId, ...m }) => {
          void _logId;
          return m;
        }),
    }));
  }
  async incidents(period: ReportPeriod, limit: number) {
    const rows = await this.tx
      .select({
        createdAt: incidentReports.createdAt,
        targetKind: incidentReports.targetKind,
        snapshot: incidentReports.targetSnapshot,
        severity: incidentReports.severity,
        status: incidentReports.status,
        reporterName: users.name,
        resolvedAt: incidentReports.resolvedAt,
        resolution: incidentReports.resolution,
        description: incidentReports.description,
      })
      .from(incidentReports)
      .innerJoin(users, eq(users.id, incidentReports.reportedBy))
      .where(
        and(
          eq(incidentReports.laboratoryId, this.context.laboratoryId),
          gte(incidentReports.createdAt, period.from),
          lt(incidentReports.createdAt, period.to),
        ),
      )
      .orderBy(asc(incidentReports.createdAt), asc(incidentReports.id))
      .limit(limit);
    return rows.map(({ snapshot, ...row }) => ({
      ...row,
      targetName: snapshot.name,
      spaceName: snapshot.spaceName,
    }));
  }
  resourceAttention(dueBy: string, limit: number) {
    const latest = this.tx
      .selectDistinctOn([maintenanceLogs.resourceId], {
        resourceId: maintenanceLogs.resourceId,
        performedAt: maintenanceLogs.performedAt,
        type: maintenanceLogs.type,
        nextDueOn: maintenanceLogs.nextDueOn,
      })
      .from(maintenanceLogs)
      .where(eq(maintenanceLogs.laboratoryId, this.context.laboratoryId))
      .orderBy(
        maintenanceLogs.resourceId,
        desc(maintenanceLogs.performedAt),
        desc(maintenanceLogs.createdAt),
        desc(maintenanceLogs.id),
      )
      .as("report_latest_maintenance");
    return this.tx
      .select({
        spaceName: spaces.name,
        resourceName: resources.name,
        operationalStatus: resources.operationalStatus,
        lastPerformedAt: latest.performedAt,
        lastType: latest.type,
        nextDueOn: latest.nextDueOn,
      })
      .from(resources)
      .innerJoin(spaces, eq(spaces.id, resources.spaceId))
      .leftJoin(latest, eq(latest.resourceId, resources.id))
      .where(
        and(
          eq(spaces.laboratoryId, this.context.laboratoryId),
          eq(spaces.isActive, true),
          eq(resources.isActive, true),
          or(
            ne(resources.operationalStatus, "operational"),
            lte(latest.nextDueOn, dueBy),
          ),
        ),
      )
      .orderBy(
        sql`lower(${spaces.name})`,
        sql`lower(${resources.name})`,
        asc(resources.id),
      )
      .limit(limit);
  }
}

export class DrizzleReportStore implements ReportStore {
  constructor(private readonly db: OperationDatabase) {}
  run<T>(
    context: ReportContext,
    permission: PermissionKey,
    operation: (
      tx: ReportTransaction,
      permissionKeys: readonly string[],
    ) => Promise<T>,
  ): Promise<T> {
    // Repeatable read: every query of one export sees the same snapshot.
    return this.db.transaction(
      async (tx) => {
        const grant = await authorizeLocked(tx, context, permission);
        return operation(
          new DrizzleReportTransaction(tx, context),
          grant.permissionKeys,
        );
      },
      { isolationLevel: "repeatable read" },
    );
  }
}
