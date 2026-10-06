CREATE TABLE "resource_usage" (
	"id" uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"resource_id" uuid NOT NULL,
	"space_id" uuid NOT NULL,
	"session_id" uuid,
	"reservation_id" uuid,
	"started_at" timestamp with time zone NOT NULL,
	"ended_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "resource_usage_context_check" CHECK (("resource_usage"."session_id" is not null) <> ("resource_usage"."reservation_id" is not null)),
	CONSTRAINT "resource_usage_interval_check" CHECK (isfinite("resource_usage"."started_at") and ("resource_usage"."ended_at" is null or (isfinite("resource_usage"."ended_at") and "resource_usage"."ended_at" >= "resource_usage"."started_at")))
);
--> statement-breakpoint
CREATE TABLE "usage_events" (
	"id" uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid() NOT NULL,
	"usage_id" uuid NOT NULL,
	"actor_user_id" uuid NOT NULL,
	"source" text NOT NULL,
	"action" text NOT NULL,
	"snapshot" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "usage_events_source_check" CHECK ("usage_events"."source" in ('WEB','API','AGENT','SYSTEM'))
);
--> statement-breakpoint
ALTER TABLE "resource_usage" ADD CONSTRAINT "resource_usage_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resource_usage" ADD CONSTRAINT "resource_usage_resource_space_fk" FOREIGN KEY ("resource_id","space_id") REFERENCES "public"."resources"("id","space_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resource_usage" ADD CONSTRAINT "resource_usage_session_space_fk" FOREIGN KEY ("session_id","space_id") REFERENCES "public"."lab_sessions"("id","space_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resource_usage" ADD CONSTRAINT "resource_usage_participant_fk" FOREIGN KEY ("session_id","user_id") REFERENCES "public"."session_participants"("session_id","user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resource_usage" ADD CONSTRAINT "resource_usage_reservation_space_fk" FOREIGN KEY ("reservation_id","space_id") REFERENCES "public"."reservations"("id","space_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_events" ADD CONSTRAINT "usage_events_usage_id_resource_usage_id_fk" FOREIGN KEY ("usage_id") REFERENCES "public"."resource_usage"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_events" ADD CONSTRAINT "usage_events_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "resource_usage_active_user_resource_idx" ON "resource_usage" USING btree ("user_id","resource_id") WHERE "resource_usage"."ended_at" is null;--> statement-breakpoint
CREATE INDEX "resource_usage_resource_time_idx" ON "resource_usage" USING btree ("resource_id","started_at");--> statement-breakpoint
CREATE INDEX "resource_usage_user_idx" ON "resource_usage" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "usage_events_usage_idx" ON "usage_events" USING btree ("usage_id");
--> statement-breakpoint
INSERT INTO permissions (key,name,description) VALUES
 ('usage.read','Consultar uso propio','Consultar el historial propio de uso efectivo.'),
 ('usage.record','Registrar uso propio','Iniciar y terminar uso propio en un contexto autorizado.'),
 ('usage.trace','Consultar trazabilidad de uso','Consultar usos previos de recursos del laboratorio sin inferir responsabilidad.') ON CONFLICT (key) DO NOTHING;
--> statement-breakpoint
INSERT INTO role_permissions (role_id,permission_id)
SELECT r.id,p.id FROM roles r CROSS JOIN permissions p
WHERE r.key='laboratory_responsible' AND p.key IN ('usage.read','usage.record','usage.trace') ON CONFLICT DO NOTHING;
--> statement-breakpoint
CREATE FUNCTION usage_preserve_history() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'usage events are immutable' USING ERRCODE='23514'; END;
$$;
--> statement-breakpoint
CREATE TRIGGER usage_events_immutable BEFORE UPDATE ON usage_events FOR EACH ROW EXECUTE FUNCTION usage_preserve_history();
