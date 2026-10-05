CREATE TABLE "reservation_resources" (
	"reservation_id" uuid NOT NULL,
	"space_id" uuid NOT NULL,
	"resource_id" uuid NOT NULL,
	CONSTRAINT "reservation_resources_reservation_id_resource_id_pk" PRIMARY KEY("reservation_id","resource_id")
);
--> statement-breakpoint
CREATE TABLE "reservations" (
	"id" uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid() NOT NULL,
	"space_id" uuid NOT NULL,
	"created_by" uuid NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"is_exclusive" boolean NOT NULL,
	"status" text DEFAULT 'confirmed' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"cancelled_at" timestamp with time zone,
	CONSTRAINT "reservations_interval_check" CHECK (isfinite("reservations"."starts_at") and isfinite("reservations"."ends_at") and "reservations"."starts_at" < "reservations"."ends_at"),
	CONSTRAINT "reservations_status_check" CHECK (("reservations"."status" = 'confirmed' and "reservations"."cancelled_at" is null) or ("reservations"."status" = 'cancelled' and "reservations"."cancelled_at" is not null))
);
--> statement-breakpoint
CREATE UNIQUE INDEX "reservations_id_space_unique_idx" ON "reservations" USING btree ("id","space_id");--> statement-breakpoint
CREATE UNIQUE INDEX "resources_id_space_unique_idx" ON "resources" USING btree ("id","space_id");--> statement-breakpoint
ALTER TABLE "reservation_resources" ADD CONSTRAINT "reservation_resources_reservation_space_fk" FOREIGN KEY ("reservation_id","space_id") REFERENCES "public"."reservations"("id","space_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservation_resources" ADD CONSTRAINT "reservation_resources_resource_space_fk" FOREIGN KEY ("resource_id","space_id") REFERENCES "public"."resources"("id","space_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "reservation_resources_resource_idx" ON "reservation_resources" USING btree ("resource_id");--> statement-breakpoint
CREATE INDEX "reservations_creator_idx" ON "reservations" USING btree ("created_by");--> statement-breakpoint
CREATE INDEX "reservations_space_interval_idx" ON "reservations" USING btree ("space_id","starts_at","ends_at");--> statement-breakpoint
CREATE FUNCTION "lock_reservation_space"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF current_setting('transaction_isolation') <> 'read committed' THEN
    RAISE EXCEPTION 'reservation writes require READ COMMITTED' USING ERRCODE = '23514';
  END IF;
  IF TG_OP = 'UPDATE' AND (
    NEW.space_id <> OLD.space_id OR NEW.created_by <> OLD.created_by OR
    NEW.starts_at <> OLD.starts_at OR NEW.ends_at <> OLD.ends_at OR
    NEW.is_exclusive <> OLD.is_exclusive OR NEW.created_at <> OLD.created_at OR
    NEW.id <> OLD.id OR (OLD.status = 'cancelled' AND NEW IS DISTINCT FROM OLD)
  ) THEN
    RAISE EXCEPTION 'reservation is immutable except cancellation' USING ERRCODE = '23514';
  END IF;
  PERFORM 1 FROM spaces WHERE id = NEW.space_id FOR UPDATE;
  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'confirmed' OR NEW.starts_at <= clock_timestamp() THEN
      RAISE EXCEPTION 'new reservation requires future start and confirmed status' USING ERRCODE = '23514';
    END IF;
  ELSIF OLD.status = 'confirmed' AND NEW.status = 'cancelled' AND OLD.starts_at <= clock_timestamp() THEN
    RAISE EXCEPTION 'started reservation cannot be cancelled' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER "reservations_lock_space" BEFORE INSERT OR UPDATE ON "reservations"
FOR EACH ROW EXECUTE FUNCTION "lock_reservation_space"();
--> statement-breakpoint
CREATE FUNCTION "lock_reservation_resource_space"() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE target_space uuid;
BEGIN
  IF current_setting('transaction_isolation') <> 'read committed' THEN
    RAISE EXCEPTION 'reservation writes require READ COMMITTED' USING ERRCODE = '23514';
  END IF;
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'reservation resource links cannot be updated' USING ERRCODE = '23514';
  END IF;
  target_space := CASE WHEN TG_OP = 'DELETE' THEN OLD.space_id ELSE NEW.space_id END;
  PERFORM 1 FROM spaces WHERE id = target_space FOR UPDATE;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER "reservation_resources_lock_space" BEFORE INSERT OR UPDATE OR DELETE ON "reservation_resources"
FOR EACH ROW EXECUTE FUNCTION "lock_reservation_resource_space"();
--> statement-breakpoint
CREATE FUNCTION "validate_reservation"() RETURNS trigger LANGUAGE plpgsql AS $$
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
    WHERE rr.reservation_id = target_id AND (NOT r.is_active OR r.space_id <> target.space_id)
  ) THEN
    RAISE EXCEPTION 'resource is inactive or belongs to another space' USING ERRCODE = '23503';
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
CREATE CONSTRAINT TRIGGER "reservations_validate" AFTER INSERT OR UPDATE ON "reservations"
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION "validate_reservation"();
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER "reservation_resources_validate" AFTER INSERT OR UPDATE OR DELETE ON "reservation_resources"
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION "validate_reservation"();
--> statement-breakpoint
INSERT INTO "permissions" ("key", "name", "description") VALUES
 ('reservation.read', 'Consultar reservaciones propias', 'Consultar disponibilidad y reservaciones propias del laboratorio.'),
 ('reservation.create', 'Crear reservaciones', 'Crear reservaciones individuales del laboratorio.'),
 ('reservation.cancel', 'Cancelar reservaciones propias', 'Cancelar reservaciones propias antes de su inicio.')
ON CONFLICT ("key") DO NOTHING;
--> statement-breakpoint
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT r.id, p.id FROM roles r CROSS JOIN permissions p
WHERE r.key = 'laboratory_responsible' AND p.key IN ('reservation.read', 'reservation.create', 'reservation.cancel')
ON CONFLICT DO NOTHING;
