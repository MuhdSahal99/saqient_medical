-- Saqient database schema (PostgreSQL DDL)
--
-- Generated from the live Floot database for project
-- 43045b76-e4d1-458e-a907-59dfadc89224 on 2026-10-13.
-- Derived from read-only catalog queries (pg_type/pg_enum, pg_attribute,
-- pg_attrdef, pg_constraint, pg_indexes). Integer id columns backed by
-- nextval('<table>_id_seq') sequences are expressed as SERIAL.
-- The TypeScript mirror of this schema is app/helpers/schema.tsx (kysely-codegen).

-- ---------------------------------------------------------------------------
-- Enum types
-- ---------------------------------------------------------------------------

CREATE TYPE agent_name AS ENUM ('redaction', 'extraction', 'coding', 'rules', 'preauth', 'verifier', 'risk');
CREATE TYPE agent_status AS ENUM ('ok', 'skipped', 'failed', 'cached');
CREATE TYPE code_system AS ENUM ('ICD10CM', 'ICD10AM', 'CPT', 'ACHI');
CREATE TYPE encounter_status AS ENUM ('processing', 'needs_review', 'ready', 'approved', 'error');
CREATE TYPE encounter_type AS ENUM ('outpatient', 'inpatient', 'emergency', 'day_case');
CREATE TYPE fact_type AS ENUM ('diagnosis', 'procedure', 'medication', 'lab', 'finding', 'history');
CREATE TYPE line_kind AS ENUM ('diagnosis', 'procedure');
CREATE TYPE line_source AS ENUM ('submitted', 'ai_suggested');
CREATE TYPE line_status AS ENUM ('proposed', 'accepted', 'rejected');
CREATE TYPE market AS ENUM ('DHA', 'DOH', 'KSA');
CREATE TYPE rule_severity AS ENUM ('block', 'warn', 'info');
CREATE TYPE user_role AS ENUM ('user', 'admin');

-- ---------------------------------------------------------------------------
-- Auth tables
-- ---------------------------------------------------------------------------

CREATE TABLE users (
  id           SERIAL PRIMARY KEY,
  email        text NOT NULL UNIQUE,
  display_name text NOT NULL,
  avatar_url   text,
  role         user_role NOT NULL DEFAULT 'user'::user_role,
  created_at   timestamp with time zone DEFAULT now(),
  updated_at   timestamp with time zone DEFAULT now()
);
CREATE INDEX idx_users_email ON users USING btree (email);

CREATE TABLE user_passwords (
  id            SERIAL PRIMARY KEY,
  user_id       integer NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  password_hash text NOT NULL,
  created_at    timestamp with time zone DEFAULT now()
);

CREATE TABLE sessions (
  id            text PRIMARY KEY,
  user_id       integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at    timestamp with time zone DEFAULT now(),
  last_accessed timestamp with time zone DEFAULT now(),
  expires_at    timestamp with time zone NOT NULL
);
CREATE INDEX idx_sessions_expires_at ON sessions USING btree (expires_at);
CREATE INDEX idx_sessions_user_id ON sessions USING btree (user_id);

CREATE TABLE password_reset_codes (
  id         SERIAL PRIMARY KEY,
  user_id    integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code_hash  text NOT NULL,
  expires_at timestamp with time zone NOT NULL,
  attempts   integer NOT NULL DEFAULT 0,
  used_at    timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);
CREATE INDEX password_reset_codes_user_idx ON password_reset_codes USING btree (user_id, created_at DESC);

CREATE TABLE login_attempts (
  id           SERIAL PRIMARY KEY,
  email        character varying(255) NOT NULL,
  attempted_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
  success      boolean DEFAULT false
);
CREATE INDEX login_attempts_cleanup_idx ON login_attempts USING btree (attempted_at) WHERE (attempted_at IS NOT NULL);
CREATE INDEX login_attempts_email_fail_idx ON login_attempts USING btree (lower((email)::text), attempted_at DESC) WHERE (success = false);

-- ---------------------------------------------------------------------------
-- Reference data
-- ---------------------------------------------------------------------------

CREATE TABLE payers (
  id               SERIAL PRIMARY KEY,
  code             text NOT NULL UNIQUE,
  name             text NOT NULL,
  market           market NOT NULL,
  platform         text NOT NULL,
  base_denial_rate real NOT NULL DEFAULT 0.1,
  created_at       timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE code_sets (
  id               SERIAL PRIMARY KEY,
  system           code_system NOT NULL,
  code             text NOT NULL,
  description      text NOT NULL,
  keywords         text NOT NULL DEFAULT ''::text,
  denial_weight    real NOT NULL DEFAULT 0,
  requires_preauth boolean NOT NULL DEFAULT false,
  CONSTRAINT code_sets_system_code_key UNIQUE (system, code)
);

CREATE TABLE payer_rules (
  id          SERIAL PRIMARY KEY,
  rule_key    text NOT NULL UNIQUE,
  name        text NOT NULL,
  description text NOT NULL,
  market      market,
  payer_id    integer REFERENCES payers(id),
  rule_type   text NOT NULL,
  severity    rule_severity NOT NULL,
  params      jsonb NOT NULL DEFAULT '{}'::jsonb,
  reference   text NOT NULL DEFAULT ''::text,
  active      boolean NOT NULL DEFAULT true,
  version     integer NOT NULL DEFAULT 1,
  updated_at  timestamp with time zone NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- Claims workflow
-- ---------------------------------------------------------------------------

CREATE TABLE encounters (
  id              SERIAL PRIMARY KEY,
  created_by      integer NOT NULL REFERENCES users(id),
  patient_ref     text NOT NULL,
  payer_id        integer NOT NULL REFERENCES payers(id),
  plan_name       text NOT NULL DEFAULT ''::text,
  market          market NOT NULL,
  encounter_type  encounter_type NOT NULL,
  specialty       text NOT NULL,
  encounter_date  date NOT NULL,
  billed_amount   numeric(12,2) NOT NULL DEFAULT 0,
  note_text       text NOT NULL,
  redaction_count integer NOT NULL DEFAULT 0,
  status          encounter_status NOT NULL DEFAULT 'processing'::encounter_status,
  risk_score      integer,
  readiness_score integer,
  risk_reasons    jsonb NOT NULL DEFAULT '[]'::jsonb,
  preauth         jsonb,
  pipeline_error  text,
  ai_credits      real NOT NULL DEFAULT 0,
  approved_by     integer REFERENCES users(id),
  approved_at     timestamp with time zone,
  processed_at    timestamp with time zone,
  created_at      timestamp with time zone NOT NULL DEFAULT now(),
  updated_at      timestamp with time zone NOT NULL DEFAULT now()
);
CREATE INDEX encounters_created_idx ON encounters USING btree (created_at DESC);
CREATE INDEX encounters_status_idx ON encounters USING btree (status);

CREATE TABLE claim_lines (
  id             SERIAL PRIMARY KEY,
  encounter_id   integer NOT NULL REFERENCES encounters(id) ON DELETE CASCADE,
  kind           line_kind NOT NULL,
  system         code_system NOT NULL,
  code           text NOT NULL,
  description    text NOT NULL,
  source         line_source NOT NULL,
  status         line_status NOT NULL DEFAULT 'proposed'::line_status,
  is_primary     boolean NOT NULL DEFAULT false,
  confidence     real,
  verifier_score real,
  evidence       text,
  rationale      text,
  created_at     timestamp with time zone NOT NULL DEFAULT now()
);
CREATE INDEX claim_lines_encounter_idx ON claim_lines USING btree (encounter_id);

CREATE TABLE extracted_facts (
  id           SERIAL PRIMARY KEY,
  encounter_id integer NOT NULL REFERENCES encounters(id) ON DELETE CASCADE,
  fact_type    fact_type NOT NULL,
  text         text NOT NULL,
  evidence     text NOT NULL,
  negated      boolean NOT NULL DEFAULT false
);
CREATE INDEX extracted_facts_encounter_idx ON extracted_facts USING btree (encounter_id);

CREATE TABLE rule_hits (
  id           SERIAL PRIMARY KEY,
  encounter_id integer NOT NULL REFERENCES encounters(id) ON DELETE CASCADE,
  rule_key     text NOT NULL,
  rule_name    text NOT NULL,
  severity     rule_severity NOT NULL,
  message      text NOT NULL,
  fix          text NOT NULL DEFAULT ''::text,
  reference    text NOT NULL DEFAULT ''::text,
  code         text
);
CREATE INDEX rule_hits_encounter_idx ON rule_hits USING btree (encounter_id);

CREATE TABLE agent_runs (
  id           SERIAL PRIMARY KEY,
  encounter_id integer NOT NULL REFERENCES encounters(id) ON DELETE CASCADE,
  agent        agent_name NOT NULL,
  model        text NOT NULL DEFAULT 'deterministic'::text,
  status       agent_status NOT NULL,
  duration_ms  integer NOT NULL DEFAULT 0,
  credits      real NOT NULL DEFAULT 0,
  input_chars  integer NOT NULL DEFAULT 0,
  summary      text NOT NULL DEFAULT ''::text,
  created_at   timestamp with time zone NOT NULL DEFAULT now()
);
CREATE INDEX agent_runs_encounter_idx ON agent_runs USING btree (encounter_id);

CREATE TABLE audit_log (
  id           SERIAL PRIMARY KEY,
  encounter_id integer REFERENCES encounters(id) ON DELETE SET NULL,
  user_id      integer REFERENCES users(id),
  action       text NOT NULL,
  detail       jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at   timestamp with time zone NOT NULL DEFAULT now()
);
CREATE INDEX audit_log_encounter_idx ON audit_log USING btree (encounter_id);

CREATE TABLE llm_cache (
  cache_key  text PRIMARY KEY,
  agent      agent_name NOT NULL,
  response   jsonb NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);
