-- Broker Relationship Management (v1)
-- Activity log + next steps + lightweight linking to person/team/org.

CREATE TABLE IF NOT EXISTS broker_activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  occurred_at TIMESTAMP NOT NULL DEFAULT now(),
  activity_type TEXT NOT NULL,
  summary TEXT NOT NULL,
  tags JSONB NOT NULL DEFAULT '[]'::jsonb,

  -- Primary subject (v1: start with person; allow team later)
  subject_type TEXT NOT NULL DEFAULT 'person',
  subject_id UUID NOT NULL,

  -- Optional next step/reminder
  next_step TEXT,
  next_step_due_at TIMESTAMP,
  next_step_status TEXT NOT NULL DEFAULT 'open', -- open|done|snoozed

  created_by TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT now(),
  updated_at TIMESTAMP NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_broker_activities_subject ON broker_activities(subject_type, subject_id);
CREATE INDEX IF NOT EXISTS idx_broker_activities_occurred_at ON broker_activities(occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_broker_activities_next_step ON broker_activities(next_step_due_at) WHERE next_step_due_at IS NOT NULL;

CREATE OR REPLACE FUNCTION update_broker_activities_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS broker_activities_updated_at ON broker_activities;
CREATE TRIGGER broker_activities_updated_at
  BEFORE UPDATE ON broker_activities
  FOR EACH ROW
  EXECUTE FUNCTION update_broker_activities_timestamp();


CREATE TABLE IF NOT EXISTS broker_activity_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  activity_id UUID NOT NULL REFERENCES broker_activities(id) ON DELETE CASCADE,
  linked_type TEXT NOT NULL, -- team|org|employment|submission
  linked_id UUID NOT NULL,
  link_reason TEXT NOT NULL DEFAULT 'auto',
  created_at TIMESTAMP NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_broker_activity_links ON broker_activity_links(activity_id, linked_type, linked_id);
CREATE INDEX IF NOT EXISTS idx_broker_activity_links_linked ON broker_activity_links(linked_type, linked_id);

