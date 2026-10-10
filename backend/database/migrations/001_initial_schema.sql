CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name TEXT NOT NULL CHECK (length(trim(full_name)) BETWEEN 1 AND 160),
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('citizen', 'department_officer', 'administrator')),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE departments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL UNIQUE,
  description TEXT NOT NULL DEFAULT '',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE user_departments (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  department_id UUID NOT NULL REFERENCES departments(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, department_id)
);

CREATE TABLE grievances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tracking_id TEXT NOT NULL UNIQUE,
  citizen_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  subject TEXT NOT NULL CHECK (length(trim(subject)) BETWEEN 5 AND 200),
  description TEXT NOT NULL CHECK (length(trim(description)) BETWEEN 10 AND 10000),
  citizen_category TEXT,
  location JSONB,
  affected_people_estimate INTEGER NOT NULL DEFAULT 1 CHECK (affected_people_estimate BETWEEN 1 AND 1000000),
  ongoing_incident BOOLEAN NOT NULL DEFAULT FALSE,
  status TEXT NOT NULL DEFAULT 'submitted' CHECK (
    status IN ('submitted', 'under_review', 'classified', 'assigned', 'in_progress',
      'awaiting_information', 'resolved', 'rejected', 'reopened')
  ),
  priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'critical')),
  priority_reason TEXT NOT NULL DEFAULT 'Initial submission',
  priority_updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  due_at TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE grievance_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  grievance_id UUID NOT NULL REFERENCES grievances(id) ON DELETE CASCADE,
  original_name TEXT NOT NULL,
  storage_name TEXT NOT NULL UNIQUE,
  storage_path TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size_bytes BIGINT NOT NULL CHECK (size_bytes > 0),
  sha256 TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE grievance_classifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  grievance_id UUID NOT NULL REFERENCES grievances(id) ON DELETE CASCADE,
  primary_department_id UUID REFERENCES departments(id) ON DELETE SET NULL,
  secondary_department_ids UUID[] NOT NULL DEFAULT '{}',
  predicted_category TEXT NOT NULL,
  urgency TEXT NOT NULL CHECK (urgency IN ('low', 'medium', 'high', 'critical')),
  confidence NUMERIC(5, 4) NOT NULL CHECK (confidence BETWEEN 0 AND 1),
  explanation TEXT NOT NULL,
  suggested_keywords TEXT[] NOT NULL DEFAULT '{}',
  requires_human_review BOOLEAN NOT NULL DEFAULT TRUE,
  method TEXT NOT NULL CHECK (method IN ('rules', 'provider')),
  provider TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE grievance_routes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  grievance_id UUID NOT NULL REFERENCES grievances(id) ON DELETE CASCADE,
  classification_id UUID REFERENCES grievance_classifications(id) ON DELETE SET NULL,
  routing_method TEXT NOT NULL,
  confidence NUMERIC(5, 4) CHECK (confidence BETWEEN 0 AND 1),
  explanation TEXT NOT NULL,
  selected_department_ids UUID[] NOT NULL DEFAULT '{}',
  actor_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE grievance_department_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  grievance_id UUID NOT NULL REFERENCES grievances(id) ON DELETE CASCADE,
  department_id UUID NOT NULL REFERENCES departments(id) ON DELETE RESTRICT,
  assigned_by UUID REFERENCES users(id) ON DELETE SET NULL,
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'cancelled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (grievance_id, department_id)
);

CREATE TABLE root_cause_clusters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'suspected' CHECK (state IN ('suspected', 'confirmed', 'rejected')),
  evidence JSONB NOT NULL DEFAULT '[]',
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  reviewed_by UUID REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE cluster_members (
  cluster_id UUID NOT NULL REFERENCES root_cause_clusters(id) ON DELETE CASCADE,
  grievance_id UUID NOT NULL REFERENCES grievances(id) ON DELETE CASCADE,
  similarity NUMERIC(5, 4) NOT NULL CHECK (similarity BETWEEN 0 AND 1),
  evidence JSONB NOT NULL DEFAULT '[]',
  added_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (cluster_id, grievance_id)
);

CREATE TABLE grievance_status_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  grievance_id UUID NOT NULL REFERENCES grievances(id) ON DELETE CASCADE,
  previous_status TEXT,
  new_status TEXT NOT NULL,
  actor_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  explanation TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id UUID,
  changes JSONB NOT NULL DEFAULT '{}',
  request_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  grievance_id UUID REFERENCES grievances(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  message TEXT NOT NULL,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX grievances_citizen_created_idx ON grievances (citizen_id, created_at DESC);
CREATE INDEX grievances_status_priority_idx ON grievances (status, priority, created_at);
CREATE INDEX grievances_due_at_idx ON grievances (due_at) WHERE due_at IS NOT NULL;
CREATE INDEX classifications_grievance_created_idx ON grievance_classifications (grievance_id, created_at DESC);
CREATE INDEX assignments_department_status_idx ON grievance_department_assignments (department_id, status);
CREATE INDEX assignments_grievance_idx ON grievance_department_assignments (grievance_id);
CREATE INDEX clusters_state_created_idx ON root_cause_clusters (state, created_at DESC);
CREATE INDEX cluster_members_grievance_idx ON cluster_members (grievance_id);
CREATE INDEX status_history_grievance_created_idx ON grievance_status_history (grievance_id, created_at);
CREATE INDEX audit_logs_created_idx ON audit_logs (created_at DESC);
CREATE INDEX audit_logs_entity_idx ON audit_logs (entity_type, entity_id, created_at DESC);
CREATE INDEX notifications_user_created_idx ON notifications (user_id, created_at DESC);
