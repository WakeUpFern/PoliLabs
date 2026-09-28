CREATE TABLE "spaces" (
	"id" uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid() NOT NULL,
	"laboratory_id" uuid NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"capacity" integer,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "spaces_slug_format_check" CHECK ("spaces"."slug" ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
	CONSTRAINT "spaces_capacity_positive_check" CHECK ("spaces"."capacity" is null or "spaces"."capacity" > 0),
	CONSTRAINT "spaces_name_not_blank_check" CHECK (btrim("spaces"."name") <> '')
);
--> statement-breakpoint
ALTER TABLE "spaces" ADD CONSTRAINT "spaces_laboratory_id_laboratories_id_fk" FOREIGN KEY ("laboratory_id") REFERENCES "public"."laboratories"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "spaces_laboratory_slug_unique_idx" ON "spaces" USING btree ("laboratory_id","slug");--> statement-breakpoint
CREATE INDEX "spaces_laboratory_idx" ON "spaces" USING btree ("laboratory_id");--> statement-breakpoint
INSERT INTO "permissions" ("key", "name", "description")
VALUES
	('space.read', 'Consultar espacios', 'Permite consultar los espacios activos del laboratorio autorizado.'),
	('space.manage', 'Administrar espacios', 'Permite crear, editar y desactivar espacios del laboratorio autorizado.')
ON CONFLICT ("key") DO NOTHING;--> statement-breakpoint
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT "roles"."id", "permissions"."id"
FROM "roles"
CROSS JOIN "permissions"
WHERE "roles"."key" = 'laboratory_responsible'
	AND "permissions"."key" IN ('space.read', 'space.manage')
ON CONFLICT DO NOTHING;
