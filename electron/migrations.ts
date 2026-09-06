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
  },
  {
    version: 2,
    sql: `
      -- Track whether the user has registered for an event (badminton
      -- tournaments): silences the "registration closes soon" reminder.
      ALTER TABLE events ADD COLUMN registered INTEGER NOT NULL DEFAULT 0;
    `
  },
  {
    version: 3,
    sql: `
      -- Tags were implicit: they existed only as strings inside tasks.tags.
      -- This table lets a tag exist on its own (created ahead of any task)
      -- and lets one be deleted deliberately rather than vanishing when the
      -- last task using it goes away. The live vocabulary is this table
      -- UNION the tags currently in use.
      CREATE TABLE tags (
        name TEXT PRIMARY KEY,
        created_at TEXT NOT NULL
      );
    `
  },
  {
    version: 4,
    sql: `
      -- Per-tag colour. NULL means "never chosen", which resolves to a stable
      -- colour derived from the name, so existing tags look intentional
      -- without anyone having to pick.
      ALTER TABLE tags ADD COLUMN color TEXT;
    `
  },
  {
    version: 5,
    sql: `
      -- LeetCode tracker: one row per solved problem. Drives the Career page's
      -- weekly "dsa" count. Rows come from manual entry or best-effort sync of
      -- a LeetCode username; the partial unique index keeps repeated syncs from
      -- inserting the same problem/day twice (manual rows are unconstrained).
      CREATE TABLE leetcode_problems (
        id TEXT PRIMARY KEY,
        date TEXT NOT NULL,            -- YYYY-MM-DD (solve date)
        title TEXT NOT NULL,
        slug TEXT,                     -- leetcode titleSlug
        difficulty TEXT NOT NULL,      -- easy | medium | hard
        topic TEXT,
        url TEXT,
        notes TEXT,
        source TEXT NOT NULL,          -- manual | leetcode
        created_at TEXT NOT NULL
      );
      CREATE INDEX idx_leetcode_date ON leetcode_problems (date);
      CREATE UNIQUE INDEX idx_leetcode_sync
        ON leetcode_problems (slug, date) WHERE source = 'leetcode';
    `
  },
  {
    version: 6,
    sql: `
      -- Hand-placed order, written by dragging a task within its section on
      -- the Tasks page. NULL means the task has never been placed by hand and
      -- sorts by due date/priority as before. REAL rather than INTEGER so a
      -- row can later be slotted between two others without renumbering.
      ALTER TABLE tasks ADD COLUMN sort_order REAL;
    `
  },
  {
    version: 7,
    sql: `
      -- Checklist steps under a task. A separate table rather than a parent_id
      -- on tasks: subtasks carry none of a task's machinery (due dates,
      -- reminders, tags, recurrence), and keeping them out of the tasks table
      -- means no existing query has to learn to filter children out.
      -- ON DELETE CASCADE is live — db.ts sets PRAGMA foreign_keys = ON.
      CREATE TABLE subtasks (
        id TEXT PRIMARY KEY,
        task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
        title TEXT NOT NULL,
        done INTEGER NOT NULL DEFAULT 0,
        sort_order REAL NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL
      );
      CREATE INDEX idx_subtasks_task ON subtasks (task_id, sort_order);
    `
  },
  {
    version: 8,
    sql: `
      -- Terms become real rows instead of a free-text string on each course.
      -- A term the user made is a place things go: it can be renamed, given a
      -- colour, collapsed, archived and reordered, and it survives having no
      -- courses in it -- none of which a string repeated across course rows
      -- can do. courses.term is backfilled into one term row per distinct
      -- string, then dropped (legal: it carries no index).
      --
      -- ON DELETE SET NULL rather than CASCADE on both new links: deleting a
      -- term must not take a semester of lectures and chats with it, and
      -- deleting a course must not delete the exam you put on the calendar.
      CREATE TABLE terms (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        color TEXT NOT NULL,
        archived INTEGER NOT NULL DEFAULT 0,
        sort_order REAL NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL
      );

      ALTER TABLE courses ADD COLUMN term_id TEXT REFERENCES terms(id) ON DELETE SET NULL;
      ALTER TABLE courses ADD COLUMN sort_order REAL NOT NULL DEFAULT 0;

      -- An event can belong to a course, which is what makes a midterm show up
      -- in the course's colour on the calendar.
      ALTER TABLE events ADD COLUMN course_id TEXT REFERENCES courses(id) ON DELETE SET NULL;

      INSERT INTO terms (id, name, color, archived, sort_order, created_at)
        SELECT lower(hex(randomblob(16))), TRIM(c.term), '#5B9CFF', 0, 0, MIN(c.created_at)
        FROM courses c WHERE TRIM(c.term) <> '' GROUP BY TRIM(c.term);

      -- Oldest term first, and each gets a different swatch so a backfilled
      -- shelf doesn't come out five shades of the same blue.
      UPDATE terms SET
        sort_order = 1 + (
          SELECT COUNT(*) FROM terms t2
          WHERE t2.created_at < terms.created_at
             OR (t2.created_at = terms.created_at AND t2.name < terms.name)
        ),
        color = CASE ((
          SELECT COUNT(*) FROM terms t2
          WHERE t2.created_at < terms.created_at
             OR (t2.created_at = terms.created_at AND t2.name < terms.name)
        ) % 5)
          WHEN 0 THEN '#5B9CFF'
          WHEN 1 THEN '#A78BFA'
          WHEN 2 THEN '#4FD6AC'
          WHEN 3 THEN '#F5C56B'
          ELSE '#3FD0C9'
        END;

      UPDATE courses SET term_id = (SELECT id FROM terms WHERE terms.name = TRIM(courses.term));

      UPDATE courses SET sort_order = 1 + (
        SELECT COUNT(*) FROM courses c2
        WHERE IFNULL(c2.term_id, '') = IFNULL(courses.term_id, '')
          AND (c2.created_at < courses.created_at
               OR (c2.created_at = courses.created_at AND c2.id < courses.id))
      );

      ALTER TABLE courses DROP COLUMN term;

      CREATE INDEX idx_courses_term ON courses (term_id, sort_order);
      CREATE INDEX idx_events_course ON events (course_id);
    `
  },
  {
    version: 9,
    sql: `
      -- Courses used to cycle a six-colour palette of their own, none of whose
      -- swatches exist in TAG_COLORS — which is the palette the colour picker
      -- now offers. Left alone, every course made before v8 would open that
      -- picker with nothing selected, as if it had no colour at all. Mapped
      -- once to the nearest swatch that is on the palette.
      --
      -- Frozen on purpose: if TAG_COLORS is ever re-tuned this must NOT be
      -- "corrected" to match, or a migrated database and a fresh one disagree
      -- about what colour a course already had.
      UPDATE courses SET color = CASE color
        WHEN '#F2A93B' THEN '#F5C56B'  -- amber  -> gold
        WHEN '#56C1D6' THEN '#4FC3F7'  -- cyan   -> sky
        WHEN '#57C785' THEN '#4FD6AC'  -- green  -> mint
        WHEN '#C792EA' THEN '#C88BF5'  -- lilac  -> orchid
        WHEN '#E5484D' THEN '#FF6B72'  -- red    -> coral
        WHEN '#7C8BA1' THEN '#93A4C8'  -- grey   -> slate
        WHEN '#4FB6C4' THEN '#3FD0C9'  -- teal   -> teal
        ELSE color
      END;
    `
  },
  {
    version: 10,
    sql: `
      -- ---------- repeating events + per-event reminder offsets ----------
      --
      -- Recurrence mirrors task_series exactly: the rule lives on the series
      -- and every occurrence is a real events row, keyed
      -- UNIQUE(series_id, occurrence_date). Everything downstream — the month
      -- and week grids, the dashboard, search, the reminder scheduler — goes
      -- on reading plain events and never learns that recurrence exists.
      CREATE TABLE event_series (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        kind TEXT NOT NULL,
        course_id TEXT REFERENCES courses(id) ON DELETE SET NULL,
        rule TEXT NOT NULL,            -- JSON RecurrenceRule
        start_date TEXT NOT NULL,      -- YYYY-MM-DD
        end_date TEXT,                 -- inclusive last date, or NULL
        time TEXT,                     -- HH:mm or NULL (all-day)
        end_time TEXT,                 -- HH:mm or NULL
        span_days INTEGER NOT NULL DEFAULT 0,  -- extra days each one covers
        location TEXT,
        url TEXT,
        notes TEXT,
        auto_reg_window INTEGER NOT NULL DEFAULT 0,
        reminder_offsets TEXT NOT NULL DEFAULT '[]',  -- JSON minutes-before
        active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      ALTER TABLE events ADD COLUMN series_id TEXT
        REFERENCES event_series(id) ON DELETE CASCADE;
      ALTER TABLE events ADD COLUMN occurrence_date TEXT;
      -- A deleted occurrence stays as a tombstone instead of going away: the
      -- unique key below is what stops the next rollover regenerating it.
      ALTER TABLE events ADD COLUMN skipped INTEGER NOT NULL DEFAULT 0;
      -- Existing events keep the day-before nudge they already had.
      ALTER TABLE events ADD COLUMN reminder_offsets TEXT NOT NULL DEFAULT '[1440]';

      CREATE UNIQUE INDEX idx_events_occurrence ON events (series_id, occurrence_date);
      CREATE INDEX idx_events_series ON events (series_id);
    `
  },
  {
    version: 11,
    sql: `
      -- ---------- monthly goals ----------
      --
      -- A goal is a month-scoped intention with a bar. Three kinds share one
      -- table because everything about them except four lines of arithmetic is
      -- the same — a title, a month, a colour, a hand-placed order, steps, a
      -- card — and three tables would mean three of every query and three ways
      -- for the Goals page and the Today section to disagree.
      --
      -- Nothing here caches progress: there is deliberately no current_value.
      -- A stored "best" goes stale the moment a measurement is corrected or a
      -- goal is retargeted downward (target below start = losing weight, where
      -- "best" means the lowest), and an auto-linked goal has no local rows to
      -- stamp it onto at all — so half the kinds would be stored and half
      -- derived, which is two code paths for one number.
      --
      -- Carrying a goal into the next month MOVES this row; it is never
      -- copied. A copy forks the measurement log, and two rows each holding
      -- half a bench log cannot agree on a personal best. created_at is
      -- therefore the goal's real birthday, which is what the carried card
      -- reads to say "since July".
      CREATE TABLE goals (
        id TEXT PRIMARY KEY,
        month TEXT NOT NULL,           -- YYYY-MM; a goal lives in exactly one
        title TEXT NOT NULL,
        kind TEXT NOT NULL,            -- number | checklist | counter
        -- number only: the baseline the bar runs FROM, which is not the same
        -- as the first measurement. Without it "bench 190" reads 92% full the
        -- moment you log a real lift, answering the wrong question. NULL means
        -- "not set yet" — the first entry logged is stamped in here.
        start_value REAL,
        unit TEXT,                     -- 'lbs', '$', '%'; NULL on a bare count
        -- number: the number you want. counter: how many. Unused by a
        -- checklist, whose steps ARE its target — NOT NULL with a default so
        -- no read has to branch on kind before looking at the column.
        target_value REAL NOT NULL DEFAULT 0,
        -- counter only, and NULL means "I tap +1 myself". When set, the count
        -- is borrowed from a table the app already fills in, scoped to month.
        source TEXT,                   -- applications | gym | leetcode | tasks
        source_tag TEXT,               -- source='tasks': the tag to count
        color TEXT NOT NULL,           -- hex from TAG_COLORS
        -- Archive, not delete: "I gave up on this in July" is information, and
        -- Drop on the carried-over shelf must not be the same gesture as the
        -- delete in the ... menu.
        archived INTEGER NOT NULL DEFAULT 0,
        sort_order REAL NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX idx_goals_month ON goals (month, sort_order);

      -- Deliverables under a goal. Identical in shape to subtasks and
      -- deliberately not subtasks: a step here has no parent task, and
      -- borrowing the tasks table would put untimed, untagged, undated rows
      -- into every query the Tasks page, search and the scheduler already run
      -- — a lot of new ways to break for something that is a checklist.
      CREATE TABLE goal_steps (
        id TEXT PRIMARY KEY,
        goal_id TEXT NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
        title TEXT NOT NULL,
        done INTEGER NOT NULL DEFAULT 0,
        sort_order REAL NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL
      );
      CREATE INDEX idx_goal_steps_goal ON goal_steps (goal_id, sort_order);

      -- One dated data point: a measurement on a number goal (185 on the 3rd,
      -- 190 on the 12th), or one tally step on a manual counter.
      --
      -- The date is the entire point of this table. Without it a bad day would
      -- have to overwrite the number, and a 178 logged after a 190 would erase
      -- the PR — which is the one thing the direction-aware "best" rule exists
      -- to prevent. It is also what lets a carried goal keep its history: the
      -- rows hang off goal_id, which a carry never changes.
      CREATE TABLE goal_entries (
        id TEXT PRIMARY KEY,
        goal_id TEXT NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
        date TEXT NOT NULL,            -- YYYY-MM-DD, local
        value REAL NOT NULL,           -- the measurement, or the tally step
        note TEXT,
        created_at TEXT NOT NULL
      );
      CREATE INDEX idx_goal_entries_goal ON goal_entries (goal_id, date);
    `
  }
]
