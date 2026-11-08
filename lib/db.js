const { neon } = require('@neondatabase/serverless');

let sqlClient = null;
let schemaReady = null;

function getSql() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    const error = new Error('DATABASE_URL is not set');
    error.code = 'NO_DATABASE';
    throw error;
  }
  if (!sqlClient) sqlClient = neon(url);
  return sqlClient;
}

async function ensureSchema(sql) {
  if (!schemaReady) {
    schemaReady = applySchema(sql).catch((error) => {
      schemaReady = null;
      throw error;
    });
  }
  await schemaReady;
}

async function applySchema(sql) {
  await sql`
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
    )
  `;
  await sql`
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
    $fn$
  `;
  await sql`DROP TRIGGER IF EXISTS monty_lock_winning_door ON monty_rounds`;
  await sql`
    CREATE TRIGGER monty_lock_winning_door
    BEFORE UPDATE ON monty_rounds
    FOR EACH ROW
    EXECUTE FUNCTION monty_lock_winning_door()
  `;
}

module.exports = { getSql, ensureSchema };
