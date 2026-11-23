ALTER TABLE "documents" DROP CONSTRAINT "documents_association_check";--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "note" text;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "inventory_item_id" uuid;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_inventory_item_laboratory_fk" FOREIGN KEY ("inventory_item_id","laboratory_id") REFERENCES "public"."inventory_items"("id","laboratory_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "documents_inventory_item_time_idx" ON "documents" USING btree ("inventory_item_id","created_at");--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_note_check" CHECK ("documents"."note" is null or length(btrim("documents"."note")) between 1 and 1000);--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_inventory_item_image_check" CHECK ("documents"."inventory_item_id" is null or "documents"."media_type" <> 'application/pdf');--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_association_check" CHECK (num_nonnulls("documents"."resource_id", "documents"."maintenance_log_id", "documents"."inventory_item_id") = 1 and ("documents"."resource_id" is null) = ("documents"."space_id" is null));--> statement-breakpoint
-- Same limit for inventory photos; the item lock serializes concurrent uploads
-- like the log lock does for evidence. Stock rows and movements are untouched.
CREATE OR REPLACE FUNCTION documents_limit_evidence() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.maintenance_log_id IS NOT NULL THEN
    PERFORM 1 FROM maintenance_logs WHERE id = NEW.maintenance_log_id FOR UPDATE;
    IF (SELECT count(*) FROM documents
        WHERE maintenance_log_id = NEW.maintenance_log_id AND archived_at IS NULL) >= 10 THEN
      RAISE EXCEPTION 'evidence-limit' USING ERRCODE = '23514';
    END IF;
  ELSIF NEW.inventory_item_id IS NOT NULL THEN
    PERFORM 1 FROM inventory_items WHERE id = NEW.inventory_item_id FOR UPDATE;
    IF (SELECT count(*) FROM documents
        WHERE inventory_item_id = NEW.inventory_item_id AND archived_at IS NULL) >= 10 THEN
      RAISE EXCEPTION 'photo-limit' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
