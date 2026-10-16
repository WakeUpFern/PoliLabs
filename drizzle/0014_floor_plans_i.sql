CREATE TABLE "floor_plans" (
	"id" uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid() NOT NULL,
	"space_id" uuid NOT NULL,
	"name" text NOT NULL,
	"width" integer NOT NULL,
	"height" integer NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "floor_plans_name_check" CHECK (btrim("floor_plans"."name") <> '' and char_length("floor_plans"."name") <= 120),
	CONSTRAINT "floor_plans_size_check" CHECK ("floor_plans"."width" between 1 and 100 and "floor_plans"."height" between 1 and 100)
);
--> statement-breakpoint
CREATE UNIQUE INDEX "floor_plans_id_space_unique_idx" ON "floor_plans" USING btree ("id","space_id");
--> statement-breakpoint
CREATE TABLE "floor_plan_elements" (
	"id" uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid() NOT NULL,
	"floor_plan_id" uuid NOT NULL,
	"space_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"resource_id" uuid,
	"location_id" uuid,
	"label" text,
	"x" integer NOT NULL,
	"y" integer NOT NULL,
	"width" integer NOT NULL,
	"height" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "floor_plan_elements_target_check" CHECK (("floor_plan_elements"."kind" = 'resource' and "floor_plan_elements"."resource_id" is not null and "floor_plan_elements"."location_id" is null and "floor_plan_elements"."label" is null)
        or ("floor_plan_elements"."kind" = 'location' and "floor_plan_elements"."location_id" is not null and "floor_plan_elements"."resource_id" is null and "floor_plan_elements"."label" is null)
        or ("floor_plan_elements"."kind" = 'label' and "floor_plan_elements"."resource_id" is null and "floor_plan_elements"."location_id" is null and btrim("floor_plan_elements"."label") <> '' and char_length("floor_plan_elements"."label") <= 80)),
	CONSTRAINT "floor_plan_elements_box_check" CHECK ("floor_plan_elements"."x" >= 0 and "floor_plan_elements"."y" >= 0 and "floor_plan_elements"."width" >= 1 and "floor_plan_elements"."height" >= 1)
);
--> statement-breakpoint
ALTER TABLE "floor_plan_elements" ADD CONSTRAINT "floor_plan_elements_plan_same_space_fk" FOREIGN KEY ("floor_plan_id","space_id") REFERENCES "public"."floor_plans"("id","space_id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "floor_plan_elements" ADD CONSTRAINT "floor_plan_elements_resource_same_space_fk" FOREIGN KEY ("resource_id","space_id") REFERENCES "public"."resources"("id","space_id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "floor_plan_elements" ADD CONSTRAINT "floor_plan_elements_location_same_space_fk" FOREIGN KEY ("location_id","space_id") REFERENCES "public"."locations"("id","space_id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "floor_plans" ADD CONSTRAINT "floor_plans_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "floor_plan_elements_plan_idx" ON "floor_plan_elements" USING btree ("floor_plan_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "floor_plan_elements_plan_resource_unique_idx" ON "floor_plan_elements" USING btree ("floor_plan_id","resource_id") WHERE "floor_plan_elements"."resource_id" is not null;
--> statement-breakpoint
CREATE UNIQUE INDEX "floor_plan_elements_plan_location_unique_idx" ON "floor_plan_elements" USING btree ("floor_plan_id","location_id") WHERE "floor_plan_elements"."location_id" is not null;
--> statement-breakpoint
CREATE INDEX "floor_plan_elements_resource_idx" ON "floor_plan_elements" USING btree ("resource_id");
--> statement-breakpoint
CREATE INDEX "floor_plan_elements_location_idx" ON "floor_plan_elements" USING btree ("location_id");
--> statement-breakpoint
CREATE INDEX "floor_plans_space_idx" ON "floor_plans" USING btree ("space_id");
--> statement-breakpoint
-- Bounds are an invariant between two rows. Element writes lock the plan row
-- (FOR SHARE) and plan resizes take its row lock, so the checks below see the
-- latest committed counterpart in READ COMMITTED.
CREATE FUNCTION "floor_plan_element_within_plan"() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE plan floor_plans%ROWTYPE;
BEGIN
  SELECT * INTO plan FROM floor_plans WHERE id = NEW.floor_plan_id FOR SHARE;
  IF FOUND AND (NEW.x + NEW.width > plan.width OR NEW.y + NEW.height > plan.height) THEN
    RAISE EXCEPTION 'floor plan element out of bounds' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER floor_plan_elements_within_plan BEFORE INSERT OR UPDATE ON floor_plan_elements
FOR EACH ROW EXECUTE FUNCTION floor_plan_element_within_plan();
--> statement-breakpoint
CREATE FUNCTION "floor_plan_keeps_elements"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM floor_plan_elements e
    WHERE e.floor_plan_id = NEW.id AND (e.x + e.width > NEW.width OR e.y + e.height > NEW.height)
  ) THEN
    RAISE EXCEPTION 'floor plan element out of bounds' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER floor_plans_keep_elements BEFORE UPDATE OF width, height ON floor_plans
FOR EACH ROW EXECUTE FUNCTION floor_plan_keeps_elements();
