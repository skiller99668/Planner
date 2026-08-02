// Schema migrations, applied in order inside transactions.
// PRAGMA user_version tracks the last applied version.
//
// v1 lays down the full planned schema (tasks, recurrence, gym, academics,
// chat, events, career pipeline, reminders, settings) so later feature phases
// mostly ship code, not migrations. Columns follow shared/types.ts; JSON-typed
// fields (tags, details, meta) are stored as JSON text.

export interface Migration {
  version: number
  sql: string
}

export const MIGRATIONS: Migration[] = [
  {
    version: 1,
    sql: `
      -- ---------- tasks ----------
      CREATE TABLE task_series (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        notes TEXT,
        tags TEXT NOT NULL DEFAULT '[]',
        priority INTEGER NOT NULL DEFAULT 0,
        rule TEXT NOT NULL,            -- JSON RecurrenceRule
        start_date TEXT NOT NULL,      -- YYYY-MM-DD
        end_date TEXT,                 -- YYYY-MM-DD or NULL
        due_time TEXT,                 -- HH:mm or NULL (all-day)
        reminder_offset_min INTEGER,
        active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE tasks (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        notes TEXT,
        tags TEXT NOT NULL DEFAULT '[]',
        due_at TEXT,
        all_day INTEGER NOT NULL DEFAULT 1,
        priority INTEGER NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'open',
        done_at TEXT,
        series_id TEXT REFERENCES task_series(id) ON DELETE CASCADE,
        occurrence_date TEXT,
        reminder_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE (series_id, occurrence_date)
      );
      CREATE INDEX idx_tasks_status_due ON tasks (status, due_at);
      CREATE INDEX idx_tasks_series ON tasks (series_id);

      -- ---------- gym ----------
      CREATE TABLE gym_sessions (
        id TEXT PRIMARY KEY,
        date TEXT NOT NULL,            -- YYYY-MM-DD
        type TEXT NOT NULL,            -- push | pull | legs | other
        notes TEXT,
        details TEXT,                  -- JSON sets/reps, optional
        created_at TEXT NOT NULL
      );
      CREATE INDEX idx_gym_date ON gym_sessions (date);

      -- ---------- academics ----------
      CREATE TABLE courses (
        id TEXT PRIMARY KEY,
        code TEXT NOT NULL,
        name TEXT NOT NULL,
        term TEXT NOT NULL,
        color TEXT NOT NULL DEFAULT '#4FB6C4',
        archived INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL
      );

      CREATE TABLE lectures (
        id TEXT PRIMARY KEY,
        course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
        title TEXT NOT NULL,
        lecture_date TEXT NOT NULL,    -- YYYY-MM-DD
        summary TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX idx_lectures_course ON lectures (course_id, lecture_date);

      CREATE TABLE chat_threads (
        id TEXT PRIMARY KEY,
        scope TEXT NOT NULL,           -- lecture | course | general
        ref_id TEXT,
        title TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX idx_threads_scope ON chat_threads (scope, ref_id);

      CREATE TABLE chat_messages (
        id TEXT PRIMARY KEY,
        thread_id TEXT NOT NULL REFERENCES chat_threads(id) ON DELETE CASCADE,
        role TEXT NOT NULL,            -- user | assistant | system
        content TEXT NOT NULL,
        meta TEXT,                     -- JSON provider metadata
        created_at TEXT NOT NULL
      );
      CREATE INDEX idx_messages_thread ON chat_messages (thread_id, created_at);

      -- ---------- events ----------
      CREATE TABLE events (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        kind TEXT NOT NULL,            -- badminton | career | academic | other
        start_at TEXT NOT NULL,
        end_at TEXT,
        location TEXT,
        url TEXT,
        notes TEXT,
        source TEXT NOT NULL DEFAULT 'manual',
        external_uid TEXT UNIQUE,
        reg_opens_at TEXT,
        reg_closes_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX idx_events_start ON events (start_at);

      -- ---------- career ----------
      CREATE TABLE applications (
        id TEXT PRIMARY KEY,
        company TEXT NOT NULL,
        role TEXT NOT NULL,
        track TEXT NOT NULL DEFAULT 'swe',
        status TEXT NOT NULL DEFAULT 'wishlist',
        url TEXT,
        deadline TEXT,
        applied_at TEXT,
        next_action TEXT,
        next_action_date TEXT,
        notes TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX idx_applications_status ON applications (status);

      CREATE TABLE career_logs (
        id TEXT PRIMARY KEY,
        kind TEXT NOT NULL,            -- dsa | networking | project | resume
        date TEXT NOT NULL,
        notes TEXT,
        created_at TEXT NOT NULL
      );
      CREATE INDEX idx_career_logs_date ON career_logs (kind, date);

      -- ---------- reminders ----------
      CREATE TABLE reminders (
        id TEXT PRIMARY KEY,
        kind TEXT NOT NULL,            -- task | event | custom
        ref_id TEXT,
        title TEXT NOT NULL,
        body TEXT,
        fire_at TEXT NOT NULL,
        fired_at TEXT,
        created_at TEXT NOT NULL
      );
      CREATE INDEX idx_reminders_fire ON reminders (fired_at, fire_at);

      -- ---------- settings ----------
      CREATE TABLE settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL            -- JSON
      );
    `
  }
]
