CREATE TABLE "maintenance_logs" (
	"id" uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid() NOT NULL,
	"laboratory_id" uuid NOT NULL,
	"space_id" uuid NOT NULL,
	"resource_id" uuid NOT NULL,
	"performed_by" uuid NOT NULL,
	"maintenance_type" text NOT NULL,
	"description" text NOT NULL,
	"status_before" text NOT NULL,
	"status_after" text NOT NULL,
	"performed_at" timestamp with time zone NOT NULL,
	"next_maintenance_due" date,
	"incident_id" uuid,
	"source" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "maintenance_logs_type_check" CHECK ("maintenance_logs"."maintenance_type" in ('preventive','corrective','inspection','other')),
	CONSTRAINT "maintenance_logs_status_check" CHECK ("maintenance_logs"."status_before" in ('operational','in_maintenance','out_of_service') and "maintenance_logs"."status_after" in ('operational','in_maintenance','out_of_service')),
	CONSTRAINT "maintenance_logs_description_check" CHECK (length(btrim("maintenance_logs"."description")) between 1 and 5000),
	CONSTRAINT "maintenance_logs_source_check" CHECK ("maintenance_logs"."source" in ('WEB','API','AGENT','SYSTEM')),
	CONSTRAINT "maintenance_logs_time_check" CHECK (isfinite("maintenance_logs"."performed_at") and "maintenance_logs"."performed_at" <= "maintenance_logs"."created_at" and ("maintenance_logs"."next_maintenance_due" is null or (isfinite("maintenance_logs"."next_maintenance_due") and "maintenance_logs"."next_maintenance_due" >= ("maintenance_logs"."performed_at" at time zone 'UTC')::date)))
);--> statement-breakpoint
CREATE TABLE "maintenance_materials" (
	"id" uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid() NOT NULL,
	"maintenance_log_id" uuid NOT NULL,
	"laboratory_id" uuid NOT NULL,
	"movement_id" uuid NOT NULL
);--> statement-breakpoint
ALTER TABLE "resources" ADD COLUMN "operational_status" text DEFAULT 'operational' NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "maintenance_logs_id_laboratory_idx" ON "maintenance_logs" USING btree ("id","laboratory_id");--> statement-breakpoint
CREATE UNIQUE INDEX "inventory_movements_id_lab_idx" ON "inventory_movements" USING btree ("id","laboratory_id");--> statement-breakpoint
CREATE UNIQUE INDEX "incident_reports_id_resource_idx" ON "incident_reports" USING btree ("id","resource_id");--> statement-breakpoint
ALTER TABLE "maintenance_logs" ADD CONSTRAINT "maintenance_logs_performed_by_users_id_fk" FOREIGN KEY ("performed_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maintenance_logs" ADD CONSTRAINT "maintenance_logs_space_laboratory_fk" FOREIGN KEY ("space_id","laboratory_id") REFERENCES "public"."spaces"("id","laboratory_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maintenance_logs" ADD CONSTRAINT "maintenance_logs_resource_space_fk" FOREIGN KEY ("resource_id","space_id") REFERENCES "public"."resources"("id","space_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maintenance_logs" ADD CONSTRAINT "maintenance_logs_incident_resource_fk" FOREIGN KEY ("incident_id","resource_id") REFERENCES "public"."incident_reports"("id","resource_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maintenance_materials" ADD CONSTRAINT "maintenance_materials_log_laboratory_fk" FOREIGN KEY ("maintenance_log_id","laboratory_id") REFERENCES "public"."maintenance_logs"("id","laboratory_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maintenance_materials" ADD CONSTRAINT "maintenance_materials_movement_laboratory_fk" FOREIGN KEY ("movement_id","laboratory_id") REFERENCES "public"."inventory_movements"("id","laboratory_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "maintenance_logs_resource_time_idx" ON "maintenance_logs" USING btree ("resource_id","performed_at");--> statement-breakpoint
CREATE INDEX "maintenance_logs_laboratory_time_idx" ON "maintenance_logs" USING btree ("laboratory_id","created_at");--> statement-breakpoint
CREATE INDEX "maintenance_logs_incident_idx" ON "maintenance_logs" USING btree ("incident_id");--> statement-breakpoint
CREATE UNIQUE INDEX "maintenance_materials_movement_idx" ON "maintenance_materials" USING btree ("movement_id");--> statement-breakpoint
CREATE INDEX "maintenance_materials_log_idx" ON "maintenance_materials" USING btree ("maintenance_log_id");--> statement-breakpoint
ALTER TABLE "resources" ADD CONSTRAINT "resources_operational_status_check" CHECK ("resources"."operational_status" in ('operational','in_maintenance','out_of_service'));
--> statement-breakpoint
-- Maintenance I: operational status changes only through an immutable log entry.
CREATE FUNCTION maintenance_apply_status() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE target resources%ROWTYPE;
BEGIN
  IF current_setting('transaction_isolation') <> 'read committed' THEN
    RAISE EXCEPTION 'maintenance writes require READ COMMITTED' USING ERRCODE = '23514';
  END IF;
  SELECT * INTO target FROM resources WHERE id = NEW.resource_id AND space_id = NEW.space_id FOR UPDATE;
  IF NOT FOUND OR NOT target.is_active THEN
    RAISE EXCEPTION 'maintenance requires an active resource' USING ERRCODE = '23503';
  END IF;
  NEW.status_before := target.operational_status;
  UPDATE resources SET operational_status = NEW.status_after, updated_at = clock_timestamp() WHERE id = NEW.resource_id;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER maintenance_logs_apply_status BEFORE INSERT ON maintenance_logs
FOR EACH ROW EXECUTE FUNCTION maintenance_apply_status();
--> statement-breakpoint
CREATE FUNCTION resources_guard_operational_status() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.operational_status <> 'operational' THEN
    RAISE EXCEPTION 'new resources start operational' USING ERRCODE = '23514';
  END IF;
  -- Depth 1 is a direct statement; maintenance_apply_status updates at depth 2.
  IF TG_OP = 'UPDATE' AND NEW.operational_status IS DISTINCT FROM OLD.operational_status AND pg_trigger_depth() < 2 THEN
    RAISE EXCEPTION 'operational status changes require a maintenance log' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER resources_operational_status_guard BEFORE INSERT OR UPDATE ON resources
FOR EACH ROW EXECUTE FUNCTION resources_guard_operational_status();
--> statement-breakpoint
CREATE FUNCTION maintenance_validate_material() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM inventory_movements m JOIN maintenance_logs l ON l.id = NEW.maintenance_log_id
    WHERE m.id = NEW.movement_id AND m.type = 'consumption' AND m.actor_user_id = l.performed_by
  ) THEN
    RAISE EXCEPTION 'maintenance material must be a consumption by the same actor' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER maintenance_materials_validate BEFORE INSERT ON maintenance_materials
FOR EACH ROW EXECUTE FUNCTION maintenance_validate_material();
--> statement-breakpoint
CREATE FUNCTION maintenance_preserve_history() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'maintenance history is immutable' USING ERRCODE = '23514'; END;
$$;
--> statement-breakpoint
CREATE TRIGGER maintenance_logs_immutable BEFORE UPDATE ON maintenance_logs
FOR EACH ROW EXECUTE FUNCTION maintenance_preserve_history();
--> statement-breakpoint
CREATE TRIGGER maintenance_materials_immutable BEFORE UPDATE ON maintenance_materials
FOR EACH ROW EXECUTE FUNCTION maintenance_preserve_history();
--> statement-breakpoint
-- RB5: new usage requires an operational resource; the lock serializes with status changes.
CREATE FUNCTION usage_require_operational_resource() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM 1 FROM resources WHERE id = NEW.resource_id FOR SHARE;
  IF NOT EXISTS (SELECT 1 FROM resources WHERE id = NEW.resource_id AND operational_status = 'operational') THEN
    RAISE EXCEPTION 'resource-unavailable' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER resource_usage_require_operational BEFORE INSERT ON resource_usage
FOR EACH ROW EXECUTE FUNCTION usage_require_operational_resource();
--> statement-breakpoint
-- RB5 for reservations: same function as 0004 plus the operational status of selected resources.
CREATE OR REPLACE FUNCTION "validate_reservation"() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE target_id uuid; target reservations%ROWTYPE; has_resources boolean;
BEGIN
  IF TG_TABLE_NAME = 'reservations' THEN
    target_id := NEW.id;
  ELSIF TG_OP = 'DELETE' THEN
    target_id := OLD.reservation_id;
  ELSE
    target_id := NEW.reservation_id;
  END IF;
  SELECT * INTO target FROM reservations WHERE id = target_id;
  -- Allows fixture cleanup in one transaction, without cascading production deletes.
  IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT EXISTS(SELECT 1 FROM reservation_resources WHERE reservation_id = target_id) INTO has_resources;
  IF target.is_exclusive = has_resources THEN
    RAISE EXCEPTION 'choose exclusive space or one or more resources' USING ERRCODE = '23514';
  END IF;
  IF target.status = 'cancelled' THEN RETURN NULL; END IF;
  IF NOT EXISTS (SELECT 1 FROM spaces WHERE id = target.space_id AND is_active) THEN
    RAISE EXCEPTION 'space is inactive' USING ERRCODE = '23503';
  END IF;
  -- Lock resource state against deactivation until commit, in stable UUID order.
  PERFORM r.id FROM resources r JOIN reservation_resources rr ON rr.resource_id = r.id
    WHERE rr.reservation_id = target_id ORDER BY r.id FOR SHARE OF r;
  IF EXISTS (
    SELECT 1 FROM reservation_resources rr JOIN resources r ON r.id = rr.resource_id
    WHERE rr.reservation_id = target_id AND (NOT r.is_active OR r.operational_status <> 'operational' OR r.space_id <> target.space_id)
  ) THEN
    RAISE EXCEPTION 'resource is inactive, not operational or belongs to another space' USING ERRCODE = '23503';
  END IF;
  IF EXISTS (
    SELECT 1 FROM reservations other
    WHERE other.id <> target_id AND other.space_id = target.space_id AND other.status = 'confirmed'
      AND tstzrange(other.starts_at, other.ends_at, '[)') && tstzrange(target.starts_at, target.ends_at, '[)')
      AND (target.is_exclusive OR other.is_exclusive OR EXISTS (
        SELECT 1 FROM reservation_resources a JOIN reservation_resources b ON a.resource_id = b.resource_id
        WHERE a.reservation_id = target_id AND b.reservation_id = other.id
      ))
  ) THEN
    RAISE EXCEPTION 'reservation conflict' USING ERRCODE = '23P01';
  END IF;
  RETURN NULL;
END;
$$;
--> statement-breakpoint
INSERT INTO permissions (key,name,description) VALUES
 ('maintenance.read','Consultar mantenimiento','Consultar estado operativo y bitácoras de mantenimiento del laboratorio.'),
 ('maintenance.create','Registrar mantenimiento','Registrar entradas de mantenimiento y el estado operativo resultante de recursos.') ON CONFLICT (key) DO NOTHING;
--> statement-breakpoint
INSERT INTO role_permissions (role_id,permission_id)
SELECT r.id,p.id FROM roles r CROSS JOIN permissions p
WHERE r.key='laboratory_responsible' AND p.key IN ('maintenance.read','maintenance.create') ON CONFLICT DO NOTHING;
