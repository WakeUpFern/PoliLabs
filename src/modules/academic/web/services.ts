import "server-only";
import { requireCurrentActor } from "@/app/_lib/current-actor";
import { getLaboratoryBySlug } from "@/modules/identity/infrastructure/services";
import { AuthorizationService } from "@/modules/identity/application/authorization-service";
import { DrizzleAuthorizationReader } from "@/modules/identity/infrastructure/access-repository";
import { getDatabase } from "@/infrastructure/database/client";
import { academicService } from "../infrastructure/services";
import { AcademicWeb } from "./academic-web";
export const academicWeb = new AcademicWeb({
  currentActor: requireCurrentActor,
  laboratory: getLaboratoryBySlug,
  authorization: new AuthorizationService(
    new DrizzleAuthorizationReader(getDatabase()),
  ),
  academic: academicService,
});
