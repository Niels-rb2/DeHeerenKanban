-- ════════════════════════════════════════════════════════════════════════════
-- Café De Heeren — Feestje Dashboard
-- Supabase Schema
-- ════════════════════════════════════════════════════════════════════════════

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ─── USERS ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name  TEXT,
  email TEXT UNIQUE NOT NULL,
  role  TEXT NOT NULL DEFAULT 'staff',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── THREADS ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS threads (
  id                        UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  gmail_thread_id           TEXT UNIQUE NOT NULL,
  subject                   TEXT NOT NULL,
  contact_name              TEXT,
  contact_email             TEXT NOT NULL,
  last_message_at           TIMESTAMPTZ NOT NULL,
  status                    TEXT NOT NULL DEFAULT 'TODO_REPLY'
                              CHECK (status IN (
                                'TODO_REPLY',
                                'REPLIED_NO_APPOINTMENT',
                                'APPOINTMENT_SET',
                                'CANCELLED',
                                'ARCHIVE'
                              )),
  has_unread                BOOLEAN NOT NULL DEFAULT true,
  assigned_to               UUID REFERENCES users(id) ON DELETE SET NULL,
  extracted_summary         TEXT,
  extracted_appointment_json JSONB,
  conversion                BOOLEAN NOT NULL DEFAULT false,
  notes                     TEXT,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── PRIVATE EVENT REQUESTS ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS private_event_requests (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  gmail_thread_id  TEXT UNIQUE NOT NULL,
  sender_name      TEXT NOT NULL DEFAULT '',
  sender_email     TEXT NOT NULL,
  occasion_type    TEXT,
  event_date       DATE,
  start_time       TEXT,
  end_time         TEXT,
  guest_count      INTEGER,
  special_notes    TEXT,
  ai_summary       TEXT,
  status           TEXT NOT NULL DEFAULT 'TO_ANSWER'
                     CHECK (status IN (
                       'TO_ANSWER',
                       'ANSWERED',
                       'CONSULTATION_PLANNED',
                       'GO',
                       'NO_GO',
                       'ARCHIVE'
                     )),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  archived_at      TIMESTAMPTZ
);

-- ─── MESSAGES ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS messages (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  thread_id        UUID NOT NULL,  -- references threads(id) OR private_event_requests(id)
  gmail_message_id TEXT UNIQUE NOT NULL,
  from_name        TEXT NOT NULL DEFAULT '',
  from_email       TEXT NOT NULL,
  to_emails        TEXT[] NOT NULL DEFAULT '{}',
  date             TIMESTAMPTZ NOT NULL,
  snippet          TEXT NOT NULL DEFAULT '',
  body_plain       TEXT,
  body_html        TEXT,
  direction        TEXT NOT NULL DEFAULT 'INBOUND'
                     CHECK (direction IN ('INBOUND', 'OUTBOUND')),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── INDEXES ─────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_threads_status          ON threads(status);
CREATE INDEX IF NOT EXISTS idx_threads_last_message    ON threads(last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_threads_conversion      ON threads(conversion);
CREATE INDEX IF NOT EXISTS idx_threads_has_unread      ON threads(has_unread);
CREATE INDEX IF NOT EXISTS idx_threads_contact_email   ON threads(contact_email);
CREATE INDEX IF NOT EXISTS idx_private_events_status    ON private_event_requests(status);
CREATE INDEX IF NOT EXISTS idx_private_events_email     ON private_event_requests(sender_email);
CREATE INDEX IF NOT EXISTS idx_private_events_gmail_tid ON private_event_requests(gmail_thread_id);
CREATE INDEX IF NOT EXISTS idx_messages_thread_id       ON messages(thread_id);
CREATE INDEX IF NOT EXISTS idx_messages_date           ON messages(date);
CREATE INDEX IF NOT EXISTS idx_messages_direction      ON messages(direction);

-- ─── ROW LEVEL SECURITY ──────────────────────────────────────────────────────
ALTER TABLE threads                ENABLE ROW LEVEL SECURITY;
ALTER TABLE private_event_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages               ENABLE ROW LEVEL SECURITY;
ALTER TABLE users                  ENABLE ROW LEVEL SECURITY;

-- Service role heeft volledige toegang (server-side via SUPABASE_SERVICE_ROLE_KEY)
-- De API routes gebruiken altijd de service role key, dus geen extra policies nodig.
-- Wil je toch RLS per gebruiker: uncomment en pas aan:

-- CREATE POLICY "Alleen ingelogde gebruikers kunnen threads lezen"
--   ON threads FOR SELECT
--   USING (auth.role() = 'authenticated');

-- CREATE POLICY "Alleen ingelogde gebruikers kunnen threads bijwerken"
--   ON threads FOR UPDATE
--   USING (auth.role() = 'authenticated')
--   WITH CHECK (auth.role() = 'authenticated');

-- ─── UPDATED_AT trigger ──────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER threads_updated_at
  BEFORE UPDATE ON threads
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER private_event_requests_updated_at
  BEFORE UPDATE ON private_event_requests
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
