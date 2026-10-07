CREATE TABLE "incident_events" (
	"id" uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid() NOT NULL,
	"incident_id" uuid NOT NULL,
	"actor_user_id" uuid NOT NULL,
	"source" text NOT NULL,
	"action" text NOT NULL,
	"note" text NOT NULL,
	"snapshot" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "incident_events_source_check" CHECK ("incident_events"."source" in ('WEB','API','AGENT','SYSTEM')),
	CONSTRAINT "incident_events_note_check" CHECK (length(btrim("incident_events"."note")) between 1 and 5000)
);
--> statement-breakpoint
CREATE TABLE "incident_reports" (
	"id" uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid() NOT NULL,
	"laboratory_id" uuid NOT NULL,
	"target_kind" text NOT NULL,
	"space_id" uuid NOT NULL,
	"resource_id" uuid,
	"session_id" uuid,
	"usage_id" uuid,
	"reported_by" uuid NOT NULL,
	"description" text NOT NULL,
	"severity" text NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"target_snapshot" jsonb NOT NULL,
	"resolution" text,
	"resolved_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "incident_reports_target_check" CHECK (("incident_reports"."target_kind" = 'resource' and "incident_reports"."resource_id" is not null and "incident_reports"."session_id" is null) or ("incident_reports"."target_kind" = 'space' and "incident_reports"."resource_id" is null and "incident_reports"."session_id" is null) or ("incident_reports"."target_kind" = 'session' and "incident_reports"."resource_id" is null and "incident_reports"."session_id" is not null)),
	CONSTRAINT "incident_reports_usage_target_check" CHECK ("incident_reports"."usage_id" is null or "incident_reports"."resource_id" is not null),
	CONSTRAINT "incident_reports_description_check" CHECK (length(btrim("incident_reports"."description")) between 1 and 5000),
	CONSTRAINT "incident_reports_severity_check" CHECK ("incident_reports"."severity" in ('low','medium','high')),
	CONSTRAINT "incident_reports_status_check" CHECK ("incident_reports"."status" in ('open','in_review','resolved')),
	CONSTRAINT "incident_reports_version_check" CHECK ("incident_reports"."version" > 0),
	CONSTRAINT "incident_reports_resolution_check" CHECK (("incident_reports"."status" = 'resolved' and "incident_reports"."resolution" is not null and length(btrim("incident_reports"."resolution")) between 1 and 5000 and "incident_reports"."resolved_at" is not null and isfinite("incident_reports"."resolved_at") and "incident_reports"."resolved_at" >= "incident_reports"."created_at") or ("incident_reports"."status" <> 'resolved' and "incident_reports"."resolution" is null and "incident_reports"."resolved_at" is null))
);
--> statement-breakpoint
ALTER TABLE "incident_events" ADD CONSTRAINT "incident_events_incident_id_incident_reports_id_fk" FOREIGN KEY ("incident_id") REFERENCES "public"."incident_reports"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incident_events" ADD CONSTRAINT "incident_events_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incident_reports" ADD CONSTRAINT "incident_reports_reported_by_users_id_fk" FOREIGN KEY ("reported_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incident_reports" ADD CONSTRAINT "incident_reports_space_laboratory_fk" FOREIGN KEY ("space_id","laboratory_id") REFERENCES "public"."spaces"("id","laboratory_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incident_reports" ADD CONSTRAINT "incident_reports_resource_space_fk" FOREIGN KEY ("resource_id","space_id") REFERENCES "public"."resources"("id","space_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incident_reports" ADD CONSTRAINT "incident_reports_session_space_fk" FOREIGN KEY ("session_id","space_id") REFERENCES "public"."lab_sessions"("id","space_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "resource_usage_id_resource_space_idx" ON "resource_usage" USING btree ("id","resource_id","space_id");
--> statement-breakpoint
ALTER TABLE "incident_reports" ADD CONSTRAINT "incident_reports_usage_resource_space_fk" FOREIGN KEY ("usage_id","resource_id","space_id") REFERENCES "public"."resource_usage"("id","resource_id","space_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "incident_events_incident_time_idx" ON "incident_events" USING btree ("incident_id","created_at");--> statement-breakpoint
CREATE INDEX "incident_reports_laboratory_time_idx" ON "incident_reports" USING btree ("laboratory_id","created_at");--> statement-breakpoint
CREATE INDEX "incident_reports_reporter_idx" ON "incident_reports" USING btree ("reported_by","laboratory_id");--> statement-breakpoint
CREATE INDEX "incident_reports_resource_idx" ON "incident_reports" USING btree ("resource_id");--> statement-breakpoint

--> statement-breakpoint
INSERT INTO permissions (key,name,description) VALUES
 ('incident.create','Reportar incidencias','Reportar problemas sobre recursos, espacios o sesiones autorizadas.'),
 ('incident.read','Consultar incidencias propias','Consultar reportes propios y su seguimiento.'),
 ('incident.review','Revisar incidencias del laboratorio','Consultar reportes y seguimiento del laboratorio.'),
 ('incident.resolve','Gestionar y resolver incidencias','Revisar y resolver incidencias con notas trazables.') ON CONFLICT (key) DO NOTHING;
--> statement-breakpoint
INSERT INTO role_permissions (role_id,permission_id)
SELECT r.id,p.id FROM roles r CROSS JOIN permissions p
WHERE r.key='laboratory_responsible' AND p.key IN ('incident.create','incident.read','incident.review','incident.resolve') ON CONFLICT DO NOTHING;
--> statement-breakpoint
CREATE FUNCTION incidents_preserve_history() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'incident events are immutable' USING ERRCODE='23514'; END;
$$;
--> statement-breakpoint
CREATE TRIGGER incident_events_immutable BEFORE UPDATE ON incident_events FOR EACH ROW EXECUTE FUNCTION incidents_preserve_history();
