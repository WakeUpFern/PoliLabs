CREATE TABLE "academic_events" (
	"id" uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid() NOT NULL,
	"laboratory_id" uuid NOT NULL,
	"practice_id" uuid NOT NULL,
	"session_id" uuid,
	"actor_user_id" uuid NOT NULL,
	"action" text NOT NULL,
	"source" text NOT NULL,
	"snapshot" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "academic_events_source_check" CHECK ("academic_events"."source" in ('WEB','API','AGENT','SYSTEM'))
);
--> statement-breakpoint
CREATE TABLE "lab_sessions" (
	"id" uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid() NOT NULL,
	"laboratory_id" uuid NOT NULL,
	"practice_id" uuid NOT NULL,
	"space_id" uuid NOT NULL,
	"teacher_user_id" uuid NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"status" text DEFAULT 'scheduled' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "lab_sessions_interval_check" CHECK (isfinite("lab_sessions"."starts_at") and isfinite("lab_sessions"."ends_at") and "lab_sessions"."starts_at" < "lab_sessions"."ends_at"),
	CONSTRAINT "lab_sessions_status_check" CHECK ("lab_sessions"."status" in ('scheduled','open','closed','cancelled'))
);
--> statement-breakpoint
CREATE TABLE "practices" (
	"id" uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid() NOT NULL,
	"laboratory_id" uuid NOT NULL,
	"title" text NOT NULL,
	"instructions" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "practices_title_check" CHECK (length(btrim("practices"."title")) between 1 and 200),
	CONSTRAINT "practices_instructions_check" CHECK (length(btrim("practices"."instructions")) between 1 and 20000),
	CONSTRAINT "practices_status_check" CHECK ("practices"."status" in ('draft','published','closed'))
);
--> statement-breakpoint
CREATE TABLE "session_participants" (
	"session_id" uuid NOT NULL,
	"laboratory_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "session_participants_pk" PRIMARY KEY("session_id","user_id")
);
--> statement-breakpoint
CREATE INDEX "academic_events_practice_idx" ON "academic_events" USING btree ("practice_id","created_at");
--> statement-breakpoint
CREATE UNIQUE INDEX "lab_sessions_id_laboratory_idx" ON "lab_sessions" USING btree ("id","laboratory_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "lab_sessions_id_practice_laboratory_idx" ON "lab_sessions" USING btree ("id","practice_id","laboratory_id");
--> statement-breakpoint
CREATE INDEX "lab_sessions_practice_idx" ON "lab_sessions" USING btree ("practice_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "practices_id_laboratory_idx" ON "practices" USING btree ("id","laboratory_id");
--> statement-breakpoint
CREATE INDEX "practices_laboratory_idx" ON "practices" USING btree ("laboratory_id");
--> statement-breakpoint
CREATE INDEX "session_participants_user_idx" ON "session_participants" USING btree ("user_id","laboratory_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "spaces_id_laboratory_unique_idx" ON "spaces" USING btree ("id","laboratory_id");
--> statement-breakpoint
ALTER TABLE "academic_events" ADD CONSTRAINT "academic_events_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "academic_events" ADD CONSTRAINT "academic_events_practice_laboratory_fk" FOREIGN KEY ("practice_id","laboratory_id") REFERENCES "public"."practices"("id","laboratory_id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "academic_events" ADD CONSTRAINT "academic_events_session_practice_fk" FOREIGN KEY ("session_id","practice_id","laboratory_id") REFERENCES "public"."lab_sessions"("id","practice_id","laboratory_id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "lab_sessions" ADD CONSTRAINT "lab_sessions_practice_laboratory_fk" FOREIGN KEY ("practice_id","laboratory_id") REFERENCES "public"."practices"("id","laboratory_id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "lab_sessions" ADD CONSTRAINT "lab_sessions_space_laboratory_fk" FOREIGN KEY ("space_id","laboratory_id") REFERENCES "public"."spaces"("id","laboratory_id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "lab_sessions" ADD CONSTRAINT "lab_sessions_teacher_laboratory_fk" FOREIGN KEY ("teacher_user_id","laboratory_id") REFERENCES "public"."laboratory_memberships"("user_id","laboratory_id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "practices" ADD CONSTRAINT "practices_laboratory_id_laboratories_id_fk" FOREIGN KEY ("laboratory_id") REFERENCES "public"."laboratories"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "practices" ADD CONSTRAINT "practices_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "session_participants" ADD CONSTRAINT "session_participants_session_laboratory_fk" FOREIGN KEY ("session_id","laboratory_id") REFERENCES "public"."lab_sessions"("id","laboratory_id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "session_participants" ADD CONSTRAINT "session_participants_member_laboratory_fk" FOREIGN KEY ("user_id","laboratory_id") REFERENCES "public"."laboratory_memberships"("user_id","laboratory_id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
INSERT INTO permissions (key, name, description) VALUES
 ('academic.read', 'Consultar prácticas y sesiones', 'Consultar prácticas publicadas y sesiones propias del laboratorio.'),
 ('academic.manage', 'Administrar prácticas y sesiones', 'Gestionar prácticas, sesiones y participantes sin modificar la propia participación.')
ON CONFLICT (key) DO NOTHING;
--> statement-breakpoint
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permissions p
WHERE r.key = 'laboratory_responsible' AND p.key IN ('academic.read','academic.manage')
ON CONFLICT DO NOTHING;
--> statement-breakpoint
CREATE FUNCTION academic_preserve_history() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'academic history is immutable' USING ERRCODE = '23514';
END;
$$;
--> statement-breakpoint
CREATE TRIGGER academic_events_immutable BEFORE UPDATE ON academic_events
FOR EACH ROW EXECUTE FUNCTION academic_preserve_history();
