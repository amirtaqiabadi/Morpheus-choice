-- The winning door is inserted with the round and cannot be changed afterwards.
CREATE TABLE IF NOT EXISTS monty_rounds (
  id uuid PRIMARY KEY,
  winning_box smallint NOT NULL CHECK (winning_box BETWEEN 0 AND 8),
  prize_idx smallint NOT NULL CHECK (prize_idx BETWEEN 0 AND 2),
  first_pick smallint CHECK (first_pick BETWEEN 0 AND 8),
  final_pick smallint CHECK (final_pick BETWEEN 0 AND 8),
  removed_boxes smallint[] NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'picked', 'resolved')),
  won boolean,
  created_at timestamptz NOT NULL DEFAULT now(),
  picked_at timestamptz,
  resolved_at timestamptz
);

CREATE OR REPLACE FUNCTION monty_lock_winning_door()
RETURNS trigger
LANGUAGE plpgsql
AS $fn$
BEGIN
  IF NEW.winning_box IS DISTINCT FROM OLD.winning_box THEN
    RAISE EXCEPTION 'winning door is immutable';
  END IF;
  IF NEW.winning_box = ANY(NEW.removed_boxes) THEN
    RAISE EXCEPTION 'host cannot remove the winning door';
  END IF;
  IF NEW.first_pick IS NOT NULL AND NEW.first_pick = ANY(NEW.removed_boxes) THEN
    RAISE EXCEPTION 'host cannot remove the first pick';
  END IF;
  RETURN NEW;
END;
$fn$;

CREATE TABLE IF NOT EXISTS app_users (
  telegram_id bigint PRIMARY KEY,
  username text,
  first_name text,
  last_name text,
  photo_url text,
  referral_code text NOT NULL UNIQUE,
  gems integer NOT NULL DEFAULT 0 CHECK (gems >= 0),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS referrals (
  invitee_id bigint PRIMARY KEY REFERENCES app_users (telegram_id),
  inviter_id bigint NOT NULL REFERENCES app_users (telegram_id),
  gems_awarded integer NOT NULL DEFAULT 3 CHECK (gems_awarded > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (invitee_id <> inviter_id)
);

CREATE INDEX IF NOT EXISTS referrals_inviter_idx ON referrals (inviter_id);

ALTER TABLE monty_rounds ADD COLUMN IF NOT EXISTS telegram_id bigint;

CREATE TABLE IF NOT EXISTS wheel_spins (
  id uuid PRIMARY KEY,
  telegram_id bigint NOT NULL REFERENCES app_users (telegram_id),
  prize_id text NOT NULL CHECK (prize_id IN ('sp', 'p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS wheel_spins_recent_idx ON wheel_spins (created_at DESC);

DO $schema$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'monty_lock_winning_door'
      AND tgrelid = 'monty_rounds'::regclass
  ) THEN
    CREATE TRIGGER monty_lock_winning_door
    BEFORE UPDATE ON monty_rounds
    FOR EACH ROW
    EXECUTE FUNCTION monty_lock_winning_door();
  END IF;
END
$schema$;
