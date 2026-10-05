CREATE TABLE "inventory_events" (
	"id" uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid() NOT NULL,
	"item_id" uuid NOT NULL,
	"actor_user_id" uuid NOT NULL,
	"action" text NOT NULL,
	"source" text NOT NULL,
	"snapshot" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "inventory_event_action_check" CHECK ("inventory_events"."action" in ('created','updated','deactivated')),
	CONSTRAINT "inventory_event_source_check" CHECK ("inventory_events"."source" in ('WEB','API','AGENT','SYSTEM'))
);
--> statement-breakpoint
CREATE TABLE "inventory_items" (
	"id" uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid() NOT NULL,
	"laboratory_id" uuid NOT NULL,
	"name" text NOT NULL,
	"type" text NOT NULL,
	"unit" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "inventory_item_name_check" CHECK (length(btrim("inventory_items"."name")) between 1 and 200),
	CONSTRAINT "inventory_item_type_check" CHECK ("inventory_items"."type" in ('consumable', 'reusable_tool')),
	CONSTRAINT "inventory_item_unit_check" CHECK ("inventory_items"."unit" in ('piece', 'metre', 'litre', 'kilogram') and ("inventory_items"."type" <> 'reusable_tool' or "inventory_items"."unit" = 'piece'))
);
--> statement-breakpoint
CREATE TABLE "inventory_movements" (
	"id" uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid() NOT NULL,
	"item_id" uuid NOT NULL,
	"laboratory_id" uuid NOT NULL,
	"location_id" uuid,
	"type" text NOT NULL,
	"quantity" numeric(18, 3) NOT NULL,
	"quantity_before" numeric(18, 3) NOT NULL,
	"quantity_after" numeric(18, 3) NOT NULL,
	"actor_user_id" uuid NOT NULL,
	"source" text NOT NULL,
	"notes" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "inventory_movement_type_check" CHECK ("inventory_movements"."type" in ('initial','purchase','entry','consumption','damage','loss','adjustment_in','adjustment_out')),
	CONSTRAINT "inventory_movement_quantity_check" CHECK ("inventory_movements"."quantity" > 0 and "inventory_movements"."quantity" <> 'NaN'::numeric and "inventory_movements"."quantity_before" >= 0 and "inventory_movements"."quantity_after" >= 0 and "inventory_movements"."quantity_before" <> 'NaN'::numeric and "inventory_movements"."quantity_after" <> 'NaN'::numeric),
	CONSTRAINT "inventory_movement_notes_check" CHECK (length(btrim("inventory_movements"."notes")) between 1 and 1000),
	CONSTRAINT "inventory_movement_source_check" CHECK ("inventory_movements"."source" in ('WEB','API','AGENT','SYSTEM'))
);
--> statement-breakpoint
CREATE TABLE "inventory_stocks" (
	"item_id" uuid PRIMARY KEY NOT NULL,
	"location_id" uuid,
	"quantity" numeric(18, 3) DEFAULT '0' NOT NULL,
	CONSTRAINT "inventory_stock_nonnegative_check" CHECK ("inventory_stocks"."quantity" >= 0 and "inventory_stocks"."quantity" <> 'NaN'::numeric)
);
--> statement-breakpoint
ALTER TABLE "inventory_events" ADD CONSTRAINT "inventory_events_item_id_inventory_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."inventory_items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_events" ADD CONSTRAINT "inventory_events_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_items" ADD CONSTRAINT "inventory_items_laboratory_id_laboratories_id_fk" FOREIGN KEY ("laboratory_id") REFERENCES "public"."laboratories"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "inventory_items_id_lab_idx" ON "inventory_items" USING btree ("id","laboratory_id");--> statement-breakpoint
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movement_item_lab_fk" FOREIGN KEY ("item_id","laboratory_id") REFERENCES "public"."inventory_items"("id","laboratory_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_stocks" ADD CONSTRAINT "inventory_stocks_item_id_inventory_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."inventory_items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_stocks" ADD CONSTRAINT "inventory_stocks_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "inventory_events_item_idx" ON "inventory_events" USING btree ("item_id");--> statement-breakpoint
CREATE INDEX "inventory_items_lab_idx" ON "inventory_items" USING btree ("laboratory_id");--> statement-breakpoint
CREATE INDEX "inventory_movements_item_idx" ON "inventory_movements" USING btree ("item_id","created_at");--> statement-breakpoint
CREATE INDEX "inventory_stocks_location_idx" ON "inventory_stocks" USING btree ("location_id");--> statement-breakpoint
-- Inventory I: one authoritative balance per item, including unlocated stock.
CREATE FUNCTION inventory_lock_item(target_id uuid) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF current_setting('transaction_isolation') <> 'read committed' THEN
    RAISE EXCEPTION 'inventory writes require READ COMMITTED' USING ERRCODE = '23514';
  END IF;
  PERFORM 1 FROM inventory_items WHERE id = target_id FOR UPDATE;
END;
$$;
--> statement-breakpoint
CREATE FUNCTION inventory_validate_stock() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE target inventory_items%ROWTYPE; location_space uuid; space_lab uuid; enabled boolean;
BEGIN
  PERFORM inventory_lock_item(NEW.item_id);
  SELECT * INTO target FROM inventory_items WHERE id = NEW.item_id;
  IF TG_OP = 'UPDATE' AND NEW.item_id <> OLD.item_id THEN
    RAISE EXCEPTION 'stock identity is immutable' USING ERRCODE = '23514';
  END IF;
  IF target.unit = 'piece' AND NEW.quantity <> trunc(NEW.quantity) THEN
    RAISE EXCEPTION 'fractional pieces' USING ERRCODE = '23514';
  END IF;
  IF NOT target.is_active AND NEW.quantity <> 0 THEN
    RAISE EXCEPTION 'inactive' USING ERRCODE = '23514';
  END IF;
  IF NEW.location_id IS NOT NULL THEN
    SELECT space_id INTO location_space FROM locations WHERE id = NEW.location_id;
    SELECT laboratory_id, is_active INTO space_lab, enabled FROM spaces WHERE id = location_space FOR SHARE;
    IF space_lab IS DISTINCT FROM target.laboratory_id OR NOT coalesce(enabled, false) THEN
      RAISE EXCEPTION 'invalid inventory space' USING ERRCODE = '23503';
    END IF;
    SELECT is_active INTO enabled FROM locations WHERE id = NEW.location_id AND space_id = location_space FOR SHARE;
    IF NOT coalesce(enabled, false) THEN
      -- Permit zero stock to retain an already deactivated historical location.
      IF TG_OP = 'INSERT' OR NEW.location_id IS DISTINCT FROM OLD.location_id OR NEW.quantity <> 0 THEN
        RAISE EXCEPTION 'invalid inventory location' USING ERRCODE = '23503';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER inventory_stock_validate BEFORE INSERT OR UPDATE ON inventory_stocks
FOR EACH ROW EXECUTE FUNCTION inventory_validate_stock();
--> statement-breakpoint
CREATE FUNCTION inventory_apply_movement() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE target inventory_items%ROWTYPE; current_stock inventory_stocks%ROWTYPE; delta numeric;
BEGIN
  PERFORM inventory_lock_item(NEW.item_id);
  SELECT * INTO target FROM inventory_items WHERE id = NEW.item_id;
  IF NOT FOUND OR target.laboratory_id <> NEW.laboratory_id THEN
    RAISE EXCEPTION 'invalid inventory item' USING ERRCODE = '23503';
  END IF;
  IF NOT target.is_active THEN RAISE EXCEPTION 'inactive' USING ERRCODE = '23514'; END IF;
  IF target.type = 'reusable_tool' AND NEW.type = 'consumption' THEN
    RAISE EXCEPTION 'tool-consumption' USING ERRCODE = '23514';
  END IF;
  IF target.unit = 'piece' AND NEW.quantity <> trunc(NEW.quantity) THEN
    RAISE EXCEPTION 'fractional pieces' USING ERRCODE = '23514';
  END IF;
  IF NEW.type = 'initial' AND EXISTS(SELECT 1 FROM inventory_movements WHERE item_id = NEW.item_id) THEN
    RAISE EXCEPTION 'initial movement must be first' USING ERRCODE = '23514';
  END IF;
  SELECT * INTO current_stock FROM inventory_stocks WHERE item_id = NEW.item_id;
  IF NOT FOUND OR NEW.location_id IS DISTINCT FROM current_stock.location_id THEN
    RAISE EXCEPTION 'invalid stock location' USING ERRCODE = '23503';
  END IF;
  delta := CASE WHEN NEW.type IN ('consumption','damage','loss','adjustment_out') THEN -NEW.quantity ELSE NEW.quantity END;
  NEW.quantity_before := current_stock.quantity;
  NEW.quantity_after := current_stock.quantity + delta;
  IF NEW.quantity_after < 0 THEN RAISE EXCEPTION 'insufficient-stock' USING ERRCODE = '23514'; END IF;
  UPDATE inventory_stocks SET quantity = NEW.quantity_after WHERE item_id = NEW.item_id;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER inventory_movement_apply BEFORE INSERT ON inventory_movements
FOR EACH ROW EXECUTE FUNCTION inventory_apply_movement();
--> statement-breakpoint
CREATE FUNCTION inventory_reconcile() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE target_id uuid; balance numeric; ledger numeric;
BEGIN
  IF TG_TABLE_NAME = 'inventory_items' THEN target_id := NEW.id;
  ELSIF TG_OP = 'DELETE' THEN target_id := OLD.item_id;
  ELSE target_id := NEW.item_id; END IF;
  IF NOT EXISTS(SELECT 1 FROM inventory_items WHERE id = target_id) THEN RETURN NULL; END IF;
  SELECT quantity INTO balance FROM inventory_stocks WHERE item_id = target_id;
  SELECT coalesce(sum(CASE WHEN type IN ('consumption','damage','loss','adjustment_out') THEN -quantity ELSE quantity END), 0)
    INTO ledger FROM inventory_movements WHERE item_id = target_id;
  IF balance IS NULL OR balance <> ledger THEN
    RAISE EXCEPTION 'stock requires matching ledger' USING ERRCODE = '23514';
  END IF;
  IF TG_OP = 'DELETE' AND TG_TABLE_NAME IN ('inventory_movements', 'inventory_events') THEN
    RAISE EXCEPTION 'inventory history cannot be deleted' USING ERRCODE = '23514';
  END IF;
  RETURN NULL;
END;
$$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER inventory_items_reconcile AFTER INSERT OR UPDATE ON inventory_items
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION inventory_reconcile();
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER inventory_stocks_reconcile AFTER INSERT OR UPDATE OR DELETE ON inventory_stocks
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION inventory_reconcile();
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER inventory_movements_reconcile AFTER INSERT OR DELETE ON inventory_movements
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION inventory_reconcile();
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER inventory_events_preserve AFTER DELETE ON inventory_events
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION inventory_reconcile();
--> statement-breakpoint
CREATE FUNCTION inventory_immutable_history() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'inventory history is immutable' USING ERRCODE = '23514';
END;
$$;
--> statement-breakpoint
CREATE TRIGGER inventory_movements_immutable BEFORE UPDATE ON inventory_movements
FOR EACH ROW EXECUTE FUNCTION inventory_immutable_history();
--> statement-breakpoint
CREATE TRIGGER inventory_events_immutable BEFORE UPDATE ON inventory_events
FOR EACH ROW EXECUTE FUNCTION inventory_immutable_history();
--> statement-breakpoint
CREATE FUNCTION inventory_guard_item() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.id <> OLD.id OR NEW.laboratory_id <> OLD.laboratory_id OR NEW.created_at <> OLD.created_at THEN
    RAISE EXCEPTION 'inventory identity is immutable' USING ERRCODE = '23514';
  END IF;
  IF (NEW.unit <> OLD.unit OR NEW.type <> OLD.type) AND EXISTS(SELECT 1 FROM inventory_movements WHERE item_id = OLD.id) THEN
    RAISE EXCEPTION 'immutable-unit' USING ERRCODE = '23514';
  END IF;
  IF NOT NEW.is_active AND EXISTS(SELECT 1 FROM inventory_stocks WHERE item_id = OLD.id AND quantity <> 0) THEN
    RAISE EXCEPTION 'has-stock' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER inventory_items_guard BEFORE UPDATE ON inventory_items
FOR EACH ROW EXECUTE FUNCTION inventory_guard_item();
--> statement-breakpoint
CREATE FUNCTION inventory_guard_spatial_deactivation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.is_active AND NOT NEW.is_active AND EXISTS(
    SELECT 1 FROM inventory_stocks st JOIN locations l ON l.id = st.location_id
    WHERE st.quantity > 0 AND CASE WHEN TG_TABLE_NAME = 'locations' THEN l.id = OLD.id ELSE l.space_id = OLD.id END
  ) THEN
    RAISE EXCEPTION 'location or space has inventory stock' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER locations_inventory_guard BEFORE UPDATE ON locations
FOR EACH ROW EXECUTE FUNCTION inventory_guard_spatial_deactivation();
--> statement-breakpoint
CREATE TRIGGER spaces_inventory_guard BEFORE UPDATE ON spaces
FOR EACH ROW EXECUTE FUNCTION inventory_guard_spatial_deactivation();
--> statement-breakpoint
INSERT INTO permissions (key, name, description) VALUES
 ('inventory.read', 'Consultar inventario', 'Consultar artículos, existencias e historial del laboratorio.'),
 ('inventory.manage', 'Administrar artículos', 'Crear, editar y desactivar artículos del laboratorio.'),
 ('inventory.adjust', 'Registrar movimientos', 'Registrar entradas, consumos, daños, pérdidas y ajustes del laboratorio.')
ON CONFLICT (key) DO NOTHING;
--> statement-breakpoint
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permissions p
WHERE r.key = 'laboratory_responsible' AND p.key IN ('inventory.read','inventory.manage','inventory.adjust')
ON CONFLICT DO NOTHING;
