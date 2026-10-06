CREATE UNIQUE INDEX "lab_sessions_id_space_idx" ON "lab_sessions" USING btree ("id","space_id");
--> statement-breakpoint
CREATE TABLE "attendance" (
	"id" uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"space_id" uuid NOT NULL,
	"check_in_at" timestamp with time zone,
	"location_id" uuid,
	"status" text NOT NULL,
	"recorded_by" uuid NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "attendance_status_check" CHECK ("attendance"."status" in ('present','late','absent')),
	CONSTRAINT "attendance_time_check" CHECK ("attendance"."check_in_at" is null or isfinite("attendance"."check_in_at")),
	CONSTRAINT "attendance_version_check" CHECK ("attendance"."version" > 0)
);
--> statement-breakpoint
CREATE TABLE "attendance_events" (
	"id" uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid() NOT NULL,
	"attendance_id" uuid NOT NULL,
	"actor_user_id" uuid NOT NULL,
	"source" text NOT NULL,
	"action" text NOT NULL,
	"reason" text,
	"snapshot" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "attendance_events_source_check" CHECK ("attendance_events"."source" in ('WEB','API','AGENT','SYSTEM'))
);
--> statement-breakpoint
ALTER TABLE "attendance" ADD CONSTRAINT "attendance_recorded_by_users_id_fk" FOREIGN KEY ("recorded_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance" ADD CONSTRAINT "attendance_participant_fk" FOREIGN KEY ("session_id","user_id") REFERENCES "public"."session_participants"("session_id","user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance" ADD CONSTRAINT "attendance_session_space_fk" FOREIGN KEY ("session_id","space_id") REFERENCES "public"."lab_sessions"("id","space_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance" ADD CONSTRAINT "attendance_location_space_fk" FOREIGN KEY ("location_id","space_id") REFERENCES "public"."locations"("id","space_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_events" ADD CONSTRAINT "attendance_events_attendance_id_attendance_id_fk" FOREIGN KEY ("attendance_id") REFERENCES "public"."attendance"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_events" ADD CONSTRAINT "attendance_events_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "attendance_session_user_idx" ON "attendance" USING btree ("session_id","user_id");--> statement-breakpoint
CREATE INDEX "attendance_user_idx" ON "attendance" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "attendance_events_attendance_idx" ON "attendance_events" USING btree ("attendance_id");--> statement-breakpoint

--> statement-breakpoint
INSERT INTO permissions (key,name,description) VALUES
 ('attendance.read','Consultar asistencia propia','Consultar únicamente la asistencia propia.'),
 ('attendance.checkin','Registrar asistencia propia','Confirmar asistencia propia en sesiones abiertas.'),
 ('attendance.manage','Gestionar asistencia','Consultar y corregir asistencia sin intervenir en sesiones propias.')
ON CONFLICT (key) DO NOTHING;
--> statement-breakpoint
INSERT INTO role_permissions (role_id,permission_id)
SELECT r.id,p.id FROM roles r CROSS JOIN permissions p
WHERE r.key='laboratory_responsible' AND p.key IN ('attendance.read','attendance.checkin','attendance.manage') ON CONFLICT DO NOTHING;
--> statement-breakpoint
CREATE FUNCTION attendance_preserve_history() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'attendance events are immutable' USING ERRCODE='23514'; END;
$$;
--> statement-breakpoint
CREATE TRIGGER attendance_events_immutable BEFORE UPDATE ON attendance_events FOR EACH ROW EXECUTE FUNCTION attendance_preserve_history();
