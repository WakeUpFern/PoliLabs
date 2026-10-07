import {
  addDays,
  assertWithinLimit,
  describePeriod,
  MAINTENANCE_HORIZON_DAYS,
  MAX_REPORT_ROWS,
  REPORT_LIST,
  REPORTS,
  reportDate,
  reportKey,
  reportPeriod,
  reportUuid,
  type ReportContext,
  type ReportKey,
  type ReportPeriod,
  type ReportTable,
} from "../domain/reports";
import { project, type ReportRows } from "../domain/report-tables";
import type { ReportStore, ReportTransaction } from "./report-store";

// One extra row tells an oversized export apart from one that fits exactly.
const LIMIT = MAX_REPORT_ROWS + 1;
function read(
  tx: ReportTransaction,
  key: ReportKey,
  period: ReportPeriod | null,
  now: Date,
): Promise<ReportRows[ReportKey][]> {
  const range = period as ReportPeriod;
  switch (key) {
    case "inventory-stock":
      return tx.inventoryStock(LIMIT);
    case "inventory-movements":
      return tx.inventoryMovements(range, LIMIT);
    case "loans":
      return tx.loans(range, LIMIT);
    case "maintenance":
      return tx.maintenance(range, LIMIT);
    case "incidents":
      return tx.incidents(range, LIMIT);
    case "resource-attention":
      return tx.resourceAttention(
        addDays(reportDate(now), MAINTENANCE_HORIZON_DAYS),
        LIMIT,
      );
  }
}

export class ReportService {
  constructor(
    private readonly store: ReportStore,
    private readonly clock: () => Date = () => new Date(),
  ) {}
  private context(context: ReportContext) {
    return {
      actorUserId: reportUuid(context.actorUserId),
      laboratoryId: reportUuid(context.laboratoryId),
    };
  }
  // Reports whose read permission the actor holds in this laboratory.
  async catalog(context: ReportContext) {
    return this.store.run(
      this.context(context),
      "laboratory.read",
      async (_tx, keys) =>
        REPORT_LIST.filter((report) => keys.includes(report.permission)),
    );
  }
  async generate(
    input: ReportContext & {
      report: string;
      from?: string | null;
      to?: string | null;
    },
  ): Promise<ReportTable> {
    const definition = REPORTS[reportKey(input.report)];
    const period = definition.period
      ? reportPeriod(input.from, input.to)
      : null;
    return this.store.run(
      this.context(input),
      definition.permission,
      async (tx) => {
        const now = this.clock();
        const rows = assertWithinLimit(
          await read(tx, definition.key, period, now),
        );
        const header = await tx.header();
        return {
          key: definition.key,
          title: definition.title,
          laboratoryName: header.laboratoryName,
          generatedAt: now,
          generatedBy: header.actorName,
          period: period ? describePeriod(period) : null,
          ...project(definition.key, rows, now),
        };
      },
    );
  }
}
