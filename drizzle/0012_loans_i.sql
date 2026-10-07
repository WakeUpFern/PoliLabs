CREATE TABLE "inventory_loan_returns" (
	"id" uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid() NOT NULL,
	"loan_id" uuid NOT NULL,
	"laboratory_id" uuid NOT NULL,
	"quantity" numeric(18, 3) NOT NULL,
	"condition" text NOT NULL,
	"notes" text,
	"movement_id" uuid,
	"actor_user_id" uuid NOT NULL,
	"source" text NOT NULL,
	"returned_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "inventory_loan_returns_quantity_check" CHECK ("inventory_loan_returns"."quantity" > 0 and "inventory_loan_returns"."quantity" = trunc("inventory_loan_returns"."quantity")),
	CONSTRAINT "inventory_loan_returns_condition_check" CHECK (("inventory_loan_returns"."condition" = 'good' and "inventory_loan_returns"."movement_id" is null) or ("inventory_loan_returns"."condition" in ('damaged','lost') and "inventory_loan_returns"."movement_id" is not null and "inventory_loan_returns"."notes" is not null)),
	CONSTRAINT "inventory_loan_returns_notes_check" CHECK ("inventory_loan_returns"."notes" is null or length(btrim("inventory_loan_returns"."notes")) between 1 and 1000),
	CONSTRAINT "inventory_loan_returns_source_check" CHECK ("inventory_loan_returns"."source" in ('WEB','API','AGENT','SYSTEM'))
);
--> statement-breakpoint
CREATE TABLE "inventory_loans" (
	"id" uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid() NOT NULL,
	"laboratory_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"borrower_user_id" uuid NOT NULL,
	"session_id" uuid,
	"quantity" numeric(18, 3) NOT NULL,
	"returned_quantity" numeric(18, 3) DEFAULT '0' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"loaned_at" timestamp with time zone DEFAULT now() NOT NULL,
	"due_at" timestamp with time zone,
	"closed_at" timestamp with time zone,
	"actor_user_id" uuid NOT NULL,
	"source" text NOT NULL,
	"notes" text,
	CONSTRAINT "inventory_loans_quantity_check" CHECK ("inventory_loans"."quantity" > 0 and "inventory_loans"."quantity" = trunc("inventory_loans"."quantity") and "inventory_loans"."returned_quantity" >= 0 and "inventory_loans"."returned_quantity" <= "inventory_loans"."quantity" and "inventory_loans"."returned_quantity" = trunc("inventory_loans"."returned_quantity")),
	CONSTRAINT "inventory_loans_status_check" CHECK (("inventory_loans"."status" = 'active' and "inventory_loans"."returned_quantity" < "inventory_loans"."quantity" and "inventory_loans"."closed_at" is null) or ("inventory_loans"."status" = 'returned' and "inventory_loans"."returned_quantity" = "inventory_loans"."quantity" and "inventory_loans"."closed_at" is not null)),
	CONSTRAINT "inventory_loans_time_check" CHECK (isfinite("inventory_loans"."loaned_at") and ("inventory_loans"."due_at" is null or (isfinite("inventory_loans"."due_at") and "inventory_loans"."due_at" > "inventory_loans"."loaned_at")) and ("inventory_loans"."closed_at" is null or "inventory_loans"."closed_at" >= "inventory_loans"."loaned_at")),
	CONSTRAINT "inventory_loans_notes_check" CHECK ("inventory_loans"."notes" is null or length(btrim("inventory_loans"."notes")) between 1 and 1000),
	CONSTRAINT "inventory_loans_source_check" CHECK ("inventory_loans"."source" in ('WEB','API','AGENT','SYSTEM'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX "inventory_loans_id_laboratory_idx" ON "inventory_loans" USING btree ("id","laboratory_id");--> statement-breakpoint
ALTER TABLE "inventory_loan_returns" ADD CONSTRAINT "inventory_loan_returns_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_loan_returns" ADD CONSTRAINT "inventory_loan_returns_loan_laboratory_fk" FOREIGN KEY ("loan_id","laboratory_id") REFERENCES "public"."inventory_loans"("id","laboratory_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_loan_returns" ADD CONSTRAINT "inventory_loan_returns_movement_laboratory_fk" FOREIGN KEY ("movement_id","laboratory_id") REFERENCES "public"."inventory_movements"("id","laboratory_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_loans" ADD CONSTRAINT "inventory_loans_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_loans" ADD CONSTRAINT "inventory_loans_item_laboratory_fk" FOREIGN KEY ("item_id","laboratory_id") REFERENCES "public"."inventory_items"("id","laboratory_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_loans" ADD CONSTRAINT "inventory_loans_borrower_laboratory_fk" FOREIGN KEY ("borrower_user_id","laboratory_id") REFERENCES "public"."laboratory_memberships"("user_id","laboratory_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_loans" ADD CONSTRAINT "inventory_loans_session_laboratory_fk" FOREIGN KEY ("session_id","laboratory_id") REFERENCES "public"."lab_sessions"("id","laboratory_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "inventory_loan_returns_loan_idx" ON "inventory_loan_returns" USING btree ("loan_id");--> statement-breakpoint
CREATE UNIQUE INDEX "inventory_loan_returns_movement_idx" ON "inventory_loan_returns" USING btree ("movement_id");--> statement-breakpoint
CREATE INDEX "inventory_loans_active_item_idx" ON "inventory_loans" USING btree ("item_id") WHERE "inventory_loans"."status" = 'active';--> statement-breakpoint
CREATE INDEX "inventory_loans_laboratory_status_idx" ON "inventory_loans" USING btree ("laboratory_id","status","due_at");--> statement-breakpoint
CREATE INDEX "inventory_loans_borrower_idx" ON "inventory_loans" USING btree ("borrower_user_id","laboratory_id");
--> statement-breakpoint
-- Loans I: temporary custody of reusable tools. Stock keeps the owned total;
-- availability = stock − outstanding active loans (RB4, §14.5). Inventory I functions are not redefined.
CREATE FUNCTION inventory_loan_apply() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE target inventory_items%ROWTYPE; balance numeric; loaned numeric; session_status text;
BEGIN
  -- Same lock order as the service: session (SHARE), borrower (SHARE), then item (UPDATE).
  IF NEW.session_id IS NOT NULL THEN
    SELECT status INTO session_status FROM lab_sessions
      WHERE id = NEW.session_id AND laboratory_id = NEW.laboratory_id FOR SHARE;
    IF session_status IS NULL OR session_status NOT IN ('scheduled','open') THEN
      RAISE EXCEPTION 'loan-session' USING ERRCODE = '23503';
    END IF;
  END IF;
  PERFORM 1 FROM laboratory_memberships m JOIN users u ON u.id = m.user_id
    WHERE m.user_id = NEW.borrower_user_id AND m.laboratory_id = NEW.laboratory_id
      AND m.is_active AND u.is_active
    FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'loan-borrower' USING ERRCODE = '23503'; END IF;
  PERFORM inventory_lock_item(NEW.item_id);
  SELECT * INTO target FROM inventory_items WHERE id = NEW.item_id AND laboratory_id = NEW.laboratory_id;
  IF NOT FOUND OR NOT target.is_active OR target.type <> 'reusable_tool' THEN
    RAISE EXCEPTION 'loan-tool' USING ERRCODE = '23514';
  END IF;
  SELECT quantity INTO balance FROM inventory_stocks WHERE item_id = NEW.item_id;
  SELECT coalesce(sum(quantity - returned_quantity), 0) INTO loaned
    FROM inventory_loans WHERE item_id = NEW.item_id AND status = 'active';
  IF NEW.quantity > balance - loaned THEN
    RAISE EXCEPTION 'loan-unavailable' USING ERRCODE = '23514';
  END IF;
  NEW.returned_quantity := 0;
  NEW.status := 'active';
  NEW.closed_at := NULL;
  NEW.loaned_at := clock_timestamp();
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER inventory_loans_apply BEFORE INSERT ON inventory_loans
FOR EACH ROW EXECUTE FUNCTION inventory_loan_apply();
--> statement-breakpoint
CREATE FUNCTION inventory_loan_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  -- Depth 1 is a direct statement; inventory_loan_return_apply updates at depth 2.
  IF pg_trigger_depth() < 2 THEN
    RAISE EXCEPTION 'loan changes require a return' USING ERRCODE = '23514';
  END IF;
  IF NEW.id <> OLD.id OR NEW.laboratory_id <> OLD.laboratory_id OR NEW.item_id <> OLD.item_id
    OR NEW.borrower_user_id <> OLD.borrower_user_id OR NEW.session_id IS DISTINCT FROM OLD.session_id
    OR NEW.quantity <> OLD.quantity OR NEW.loaned_at <> OLD.loaned_at OR NEW.due_at IS DISTINCT FROM OLD.due_at
    OR NEW.actor_user_id <> OLD.actor_user_id OR NEW.source <> OLD.source OR NEW.notes IS DISTINCT FROM OLD.notes THEN
    RAISE EXCEPTION 'loan identity is immutable' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER inventory_loans_guard BEFORE UPDATE ON inventory_loans
FOR EACH ROW EXECUTE FUNCTION inventory_loan_guard();
--> statement-breakpoint
CREATE FUNCTION inventory_loan_return_apply() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE target inventory_loans%ROWTYPE; movement inventory_movements%ROWTYPE; expected text;
BEGIN
  SELECT * INTO target FROM inventory_loans WHERE id = NEW.loan_id AND laboratory_id = NEW.laboratory_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'loan-not-found' USING ERRCODE = '23503'; END IF;
  -- Item before loan, as in the service; the item lock serializes with movements and new loans.
  PERFORM inventory_lock_item(target.item_id);
  SELECT * INTO target FROM inventory_loans WHERE id = NEW.loan_id FOR UPDATE;
  IF target.status <> 'active' THEN RAISE EXCEPTION 'loan-closed' USING ERRCODE = '23514'; END IF;
  IF NEW.quantity > target.quantity - target.returned_quantity THEN
    RAISE EXCEPTION 'loan-excess-return' USING ERRCODE = '23514';
  END IF;
  IF NEW.movement_id IS NOT NULL THEN
    expected := CASE NEW.condition WHEN 'damaged' THEN 'damage' WHEN 'lost' THEN 'loss' END;
    SELECT * INTO movement FROM inventory_movements WHERE id = NEW.movement_id;
    IF NOT FOUND OR movement.item_id <> target.item_id OR movement.quantity <> NEW.quantity
      OR movement.actor_user_id <> NEW.actor_user_id
      OR movement.type IS DISTINCT FROM expected THEN
      RAISE EXCEPTION 'loan return movement must match the return' USING ERRCODE = '23514';
    END IF;
  END IF;
  NEW.returned_at := clock_timestamp();
  UPDATE inventory_loans SET
    returned_quantity = returned_quantity + NEW.quantity,
    status = CASE WHEN returned_quantity + NEW.quantity = quantity THEN 'returned' ELSE 'active' END,
    closed_at = CASE WHEN returned_quantity + NEW.quantity = quantity THEN NEW.returned_at END
  WHERE id = target.id;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER inventory_loan_returns_apply BEFORE INSERT ON inventory_loan_returns
FOR EACH ROW EXECUTE FUNCTION inventory_loan_return_apply();
--> statement-breakpoint
CREATE TRIGGER inventory_loan_returns_immutable BEFORE UPDATE ON inventory_loan_returns
FOR EACH ROW EXECUTE FUNCTION inventory_immutable_history();
--> statement-breakpoint
-- Deferred invariant: stock >= outstanding loans and returned_quantity = sum(returns).
-- Any movement, adjustment or deactivation path reaches inventory_stocks, so the stock
-- trigger covers them without redefining inventory_apply_movement or inventory_guard_item.
CREATE FUNCTION inventory_loans_reconcile() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE target_item uuid; target_loan uuid; balance numeric; loaned numeric;
BEGIN
  IF TG_TABLE_NAME = 'inventory_stocks' THEN
    target_item := NEW.item_id;
  ELSIF TG_TABLE_NAME = 'inventory_loans' THEN
    IF TG_OP = 'DELETE' THEN target_loan := OLD.id; target_item := OLD.item_id;
    ELSE target_loan := NEW.id; target_item := NEW.item_id; END IF;
  ELSE
    IF TG_OP = 'DELETE' THEN target_loan := OLD.loan_id; ELSE target_loan := NEW.loan_id; END IF;
    SELECT item_id INTO target_item FROM inventory_loans WHERE id = target_loan;
  END IF;
  -- History may only disappear together with its item (synthetic fixture teardown).
  IF target_item IS NULL OR NOT EXISTS(SELECT 1 FROM inventory_items WHERE id = target_item) THEN
    RETURN NULL;
  END IF;
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'loan history cannot be deleted' USING ERRCODE = '23514';
  END IF;
  IF target_loan IS NOT NULL AND EXISTS(
    SELECT 1 FROM inventory_loans l WHERE l.id = target_loan AND l.returned_quantity <>
      (SELECT coalesce(sum(r.quantity), 0) FROM inventory_loan_returns r WHERE r.loan_id = l.id)
  ) THEN
    RAISE EXCEPTION 'loan requires matching returns' USING ERRCODE = '23514';
  END IF;
  SELECT quantity INTO balance FROM inventory_stocks WHERE item_id = target_item;
  SELECT coalesce(sum(quantity - returned_quantity), 0) INTO loaned
    FROM inventory_loans WHERE item_id = target_item AND status = 'active';
  IF balance IS NULL OR balance < loaned THEN
    RAISE EXCEPTION 'loaned-stock' USING ERRCODE = '23514';
  END IF;
  RETURN NULL;
END;
$$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER inventory_stocks_loans_reconcile AFTER UPDATE ON inventory_stocks
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION inventory_loans_reconcile();
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER inventory_loans_reconcile AFTER INSERT OR UPDATE OR DELETE ON inventory_loans
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION inventory_loans_reconcile();
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER inventory_loan_returns_reconcile AFTER INSERT OR DELETE ON inventory_loan_returns
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION inventory_loans_reconcile();
--> statement-breakpoint
INSERT INTO permissions (key, name, description) VALUES
 ('inventory.loan', 'Registrar préstamos', 'Registrar préstamos y devoluciones de herramientas y consultar los préstamos del laboratorio.'),
 ('inventory.loan.read', 'Consultar préstamos propios', 'Consultar únicamente los préstamos propios.')
ON CONFLICT (key) DO NOTHING;
--> statement-breakpoint
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permissions p
WHERE r.key = 'laboratory_responsible' AND p.key IN ('inventory.loan','inventory.loan.read')
ON CONFLICT DO NOTHING;
