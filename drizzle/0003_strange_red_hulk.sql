CREATE TABLE "locations" (
	"id" uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid() NOT NULL,
	"space_id" uuid NOT NULL,
	"parent_id" uuid,
	"name" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "locations_not_own_parent_check" CHECK ("locations"."parent_id" is null or "locations"."parent_id" <> "locations"."id"),
	CONSTRAINT "locations_name_not_blank_check" CHECK (btrim("locations"."name") <> '')
);
--> statement-breakpoint
CREATE TABLE "resources" (
	"id" uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid() NOT NULL,
	"space_id" uuid NOT NULL,
	"location_id" uuid,
	"name" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "resources_name_not_blank_check" CHECK (btrim("resources"."name") <> '')
);
--> statement-breakpoint
CREATE UNIQUE INDEX "locations_id_space_unique_idx" ON "locations" USING btree ("id","space_id");--> statement-breakpoint
ALTER TABLE "locations" ADD CONSTRAINT "locations_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "locations" ADD CONSTRAINT "locations_parent_same_space_fk" FOREIGN KEY ("parent_id","space_id") REFERENCES "public"."locations"("id","space_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resources" ADD CONSTRAINT "resources_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resources" ADD CONSTRAINT "resources_location_same_space_fk" FOREIGN KEY ("location_id","space_id") REFERENCES "public"."locations"("id","space_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "locations_space_idx" ON "locations" USING btree ("space_id");--> statement-breakpoint
CREATE INDEX "locations_parent_idx" ON "locations" USING btree ("parent_id");--> statement-breakpoint
CREATE INDEX "resources_space_idx" ON "resources" USING btree ("space_id");--> statement-breakpoint
CREATE INDEX "resources_location_idx" ON "resources" USING btree ("location_id");--> statement-breakpoint
CREATE FUNCTION "prevent_location_cycle"() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
	PERFORM pg_advisory_xact_lock(hashtextextended(NEW.space_id::text, 0));
	IF NEW.parent_id IS NULL THEN
		RETURN NEW;
	END IF;
	IF EXISTS (
		WITH RECURSIVE ancestors AS (
			SELECT "id", "parent_id"
			FROM "locations"
			WHERE "id" = NEW.parent_id AND "space_id" = NEW.space_id
			UNION ALL
			SELECT parent."id", parent."parent_id"
			FROM "locations" parent
			INNER JOIN ancestors child ON parent."id" = child."parent_id"
			WHERE parent."space_id" = NEW.space_id
		)
		SELECT 1 FROM ancestors WHERE "id" = NEW.id
	) THEN
		RAISE EXCEPTION 'location hierarchy cannot contain a cycle'
			USING ERRCODE = '23514';
	END IF;
	RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER "locations_prevent_cycle_trigger"
BEFORE INSERT OR UPDATE OF "parent_id", "space_id" ON "locations"
FOR EACH ROW EXECUTE FUNCTION "prevent_location_cycle"();--> statement-breakpoint
INSERT INTO "permissions" ("key", "name", "description")
VALUES
	('location.read', 'Consultar ubicaciones', 'Permite consultar las ubicaciones activas de los espacios del laboratorio autorizado.'),
	('location.manage', 'Administrar ubicaciones', 'Permite crear, editar y desactivar ubicaciones de los espacios del laboratorio autorizado.'),
	('resource.read', 'Consultar recursos', 'Permite consultar los recursos físicos activos de los espacios del laboratorio autorizado.'),
	('resource.manage', 'Administrar recursos', 'Permite crear, editar y desactivar recursos físicos de los espacios del laboratorio autorizado.')
ON CONFLICT ("key") DO NOTHING;--> statement-breakpoint
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT "roles"."id", "permissions"."id"
FROM "roles"
CROSS JOIN "permissions"
WHERE "roles"."key" = 'laboratory_responsible'
	AND "permissions"."key" IN (
		'location.read',
		'location.manage',
		'resource.read',
		'resource.manage'
	)
ON CONFLICT DO NOTHING;
