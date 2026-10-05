import "server-only";
import { getDatabase } from "@/infrastructure/database/client";
import { AcademicService } from "../application/academic";
import { DrizzleAcademicStore } from "./academic-store";
export const academicService = new AcademicService(
  new DrizzleAcademicStore(getDatabase()),
);
