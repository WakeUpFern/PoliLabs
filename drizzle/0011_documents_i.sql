CREATE TABLE "documents" (
	"id" uuid PRIMARY KEY NOT NULL,
	"laboratory_id" uuid NOT NULL,
	"storage_key" text NOT NULL,
	"title" text,
	"original_name" text NOT NULL,
	"media_type" text NOT NULL,
	"byte_size" integer NOT NULL,
	"sha256" text NOT NULL,
	"uploaded_by" uuid NOT NULL,
	"source" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"space_id" uuid,
	"resource_id" uuid,
	"maintenance_log_id" uuid,
	"archived_at" timestamp with time zone,
	"archived_by" uuid,
	"archive_reason" text,
	CONSTRAINT "documents_association_check" CHECK (num_nonnulls("documents"."resource_id", "documents"."maintenance_log_id") = 1 and ("documents"."resource_id" is null) = ("documents"."space_id" is null)),
	CONSTRAINT "documents_storage_key_check" CHECK ("documents"."storage_key" ~ '^documents/[0-9a-f-]{36}/[0-9a-f-]{36}$' and split_part("documents"."storage_key", '/', 2) = "documents"."laboratory_id"::text),
	CONSTRAINT "documents_media_type_check" CHECK ("documents"."media_type" in ('application/pdf','image/png','image/jpeg','image/webp')),
	CONSTRAINT "documents_byte_size_check" CHECK ("documents"."byte_size" between 1 and 10485760),
	CONSTRAINT "documents_sha256_check" CHECK ("documents"."sha256" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "documents_name_check" CHECK (length(btrim("documents"."original_name")) between 1 and 255 and ("documents"."title" is null or length(btrim("documents"."title")) between 1 and 200)),
	CONSTRAINT "documents_title_resource_check" CHECK ("documents"."title" is null or "documents"."resource_id" is not null),
	CONSTRAINT "documents_source_check" CHECK ("documents"."source" in ('WEB','API','AGENT','SYSTEM')),
	CONSTRAINT "documents_archive_check" CHECK (num_nonnulls("documents"."archived_at", "documents"."archived_by", "documents"."archive_reason") in (0, 3) and ("documents"."archive_reason" is null or length(btrim("documents"."archive_reason")) between 1 and 1000) and ("documents"."archived_at" is null or "documents"."archived_at" >= "documents"."created_at"))
);
--> statement-breakpoint
CREATE UNIQUE INDEX "documents_storage_key_idx" ON "documents" USING btree ("storage_key");--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_laboratory_id_laboratories_id_fk" FOREIGN KEY ("laboratory_id") REFERENCES "public"."laboratories"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_archived_by_users_id_fk" FOREIGN KEY ("archived_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_space_laboratory_fk" FOREIGN KEY ("space_id","laboratory_id") REFERENCES "public"."spaces"("id","laboratory_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_resource_space_fk" FOREIGN KEY ("resource_id","space_id") REFERENCES "public"."resources"("id","space_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_maintenance_log_laboratory_fk" FOREIGN KEY ("maintenance_log_id","laboratory_id") REFERENCES "public"."maintenance_logs"("id","laboratory_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "documents_resource_time_idx" ON "documents" USING btree ("resource_id","created_at");--> statement-breakpoint
CREATE INDEX "documents_maintenance_log_idx" ON "documents" USING btree ("maintenance_log_id");--> statement-breakpoint
CREATE INDEX "documents_laboratory_time_idx" ON "documents" USING btree ("laboratory_id","created_at");--> statement-breakpoint
CREATE FUNCTION documents_preserve_metadata() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  -- Only one logical archive is allowed; every other column is immutable.
  IF OLD.archived_at IS NOT NULL OR NEW.archived_at IS NULL OR
     (to_jsonb(NEW) - ARRAY['archived_at','archived_by','archive_reason'])
       IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['archived_at','archived_by','archive_reason']) THEN
    RAISE EXCEPTION 'document metadata is immutable; only a single archive is allowed' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER documents_immutable BEFORE UPDATE ON documents
FOR EACH ROW EXECUTE FUNCTION documents_preserve_metadata();
--> statement-breakpoint
-- Evidence limit per maintenance log; the log lock serializes concurrent uploads.
-- The log itself is never updated: SELECT ... FOR UPDATE does not fire its triggers.
CREATE FUNCTION documents_limit_evidence() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.maintenance_log_id IS NULL THEN RETURN NEW; END IF;
  PERFORM 1 FROM maintenance_logs WHERE id = NEW.maintenance_log_id FOR UPDATE;
  IF (SELECT count(*) FROM documents
      WHERE maintenance_log_id = NEW.maintenance_log_id AND archived_at IS NULL) >= 10 THEN
    RAISE EXCEPTION 'evidence-limit' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER documents_evidence_limit BEFORE INSERT ON documents
FOR EACH ROW EXECUTE FUNCTION documents_limit_evidence();
--> statement-breakpoint
INSERT INTO permissions (key,name,description) VALUES
 ('document.read','Consultar documentos','Consultar y descargar manuales y documentos de los recursos del laboratorio.'),
 ('document.upload','Subir documentos','Subir manuales a recursos y, con permiso de mantenimiento, evidencia a sus entradas.'),
 ('document.archive','Archivar documentos','Archivar documentos del laboratorio con motivo, sin borrar el archivo ni su historial.') ON CONFLICT (key) DO NOTHING;
--> statement-breakpoint
INSERT INTO role_permissions (role_id,permission_id)
SELECT r.id,p.id FROM roles r CROSS JOIN permissions p
WHERE r.key='laboratory_responsible' AND p.key IN ('document.read','document.upload','document.archive') ON CONFLICT DO NOTHING;
