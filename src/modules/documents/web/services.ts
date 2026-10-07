import "server-only";
import { requireCurrentActor } from "@/app/_lib/current-actor";
import { getLaboratoryBySlug } from "@/modules/identity/infrastructure/services";
import { documentService } from "../infrastructure/services";
import { DocumentsWeb } from "./documents-web";
export const documentsWeb = new DocumentsWeb({
  currentActor: requireCurrentActor,
  laboratory: getLaboratoryBySlug,
  documents: documentService,
});
