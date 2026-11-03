import { timingSafeEqual } from "node:crypto";
import { readDocumentStorageConfig } from "@/config/document-storage-env";
import { getDatabase } from "@/infrastructure/database/client";
import { createObjectStorage } from "@/modules/documents/infrastructure/object-storage-factory";
import { sweepOrphanObjects } from "@/modules/documents/infrastructure/orphan-sweep";

export const dynamic = "force-dynamic";

// Daily Vercel cron (vercel.json, ADR 0024): deletes stored objects whose
// upload never committed. Vercel sends `Authorization: Bearer $CRON_SECRET`;
// without that secret configured the route does not exist.
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || secret.length < 32) return new Response(null, { status: 404 });
  const expected = Buffer.from(`Bearer ${secret}`);
  const given = Buffer.from(request.headers.get("authorization") ?? "");
  if (given.length !== expected.length || !timingSafeEqual(given, expected))
    return new Response(null, { status: 401 });

  const deleted = await sweepOrphanObjects(
    getDatabase(),
    createObjectStorage(readDocumentStorageConfig(process.env)),
    { apply: true },
  );
  return Response.json({ deleted: deleted.length });
}
