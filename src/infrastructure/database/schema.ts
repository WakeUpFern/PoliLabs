export * from "@/modules/identity/infrastructure/auth-schema";
export * from "@/modules/identity/infrastructure/access-schema";
export * from "@/modules/spatial/infrastructure/spatial-schema";

// Each business module exports only the tables introduced by its approved
// increment and migration.

export * from "@/modules/reservations/infrastructure/reservation-schema";

export * from "@/modules/inventory/infrastructure/inventory-schema";

export * from "@/modules/academic/infrastructure/academic-schema";

export * from "@/modules/attendance/infrastructure/attendance-schema";
