/*
# Create tasks table with soft-delete support

## Overview
Adds the core `tasks` table for the CRUD task-manager app. Every record carries
the standard audit columns (id, created_at, updated_at, deleted_at) and is never
hard-deleted: deletion sets `deleted_at = now()` and `updated_at = now()`.

## 1. New Tables
- `tasks`
  - `id` (uuid, primary key, auto-generated)
  - `title` (text, not null) — short task name
  - `description` (text, nullable) — longer notes
  - `status` (text, not null, default 'todo') — one of 'todo' | 'in_progress' | 'done'
  - `created_at` (timestamptz, default now())
  - `updated_at` (timestamptz, default now())
  - `deleted_at` (timestamptz, nullable) — non-null means soft-deleted

## 2. Constraints
- `tasks_status_check` — status must be one of 'todo', 'in_progress', 'done'
- `tasks_title_length_check` — title cannot be empty/whitespace-only

## 3. Functions
- `set_updated_at()` — trigger function that sets `updated_at = now()` on every
  UPDATE, so callers never have to set it manually.
- `soft_delete_task()` — trigger function that runs BEFORE DELETE and converts
  a hard DELETE into a soft delete (sets deleted_at + updated_at, then returns
  NULL to cancel the actual row removal).

## 4. Triggers
- `tasks_set_updated_at` — fires BEFORE UPDATE on `tasks`, calls `set_updated_at()`.
- `tasks_soft_delete` — fires BEFORE DELETE on `tasks`, calls `soft_delete_task()`.

## 5. Indexes
- `tasks_created_at_idx` — speeds up "newest first" listing queries.
- `tasks_deleted_at_idx` — speeds up filtering active vs. soft-deleted rows.

## 6. Security (RLS)
- RLS enabled on `tasks`.
- Four policies (select/insert/update/delete) scoped to `anon, authenticated`
  because this is a single-tenant app with no sign-in screen; the anon-key
  frontend must be able to read and write its own shared data.

## 7. Important Notes
1. Hard DELETE statements are intercepted by the `tasks_soft_delete` trigger and
   converted to soft deletes, so `supabase.from('tasks').delete()` is safe — it
   will never remove a row, only mark it deleted.
2. To list active tasks, filter `deleted_at IS NULL`. To include trashed tasks,
   filter `deleted_at IS NOT NULL`.
3. The `updated_at` column is maintained automatically by trigger; application
   code does not need to set it on updates.
*/

-- =========================================================
-- 1. Table
-- =========================================================
CREATE TABLE IF NOT EXISTS tasks (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title       text        NOT NULL,
  description text,
  status      text        NOT NULL DEFAULT 'todo',
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  deleted_at  timestamptz,
  CONSTRAINT tasks_status_check
    CHECK (status IN ('todo', 'in_progress', 'done')),
  CONSTRAINT tasks_title_length_check
    CHECK (btrim(title) <> '')
);

-- =========================================================
-- 2. Indexes
-- =========================================================
CREATE INDEX IF NOT EXISTS tasks_created_at_idx ON tasks (created_at DESC);
CREATE INDEX IF NOT EXISTS tasks_deleted_at_idx ON tasks (deleted_at);

-- =========================================================
-- 3. Functions
-- =========================================================

-- Auto-maintain updated_at on every UPDATE.
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- Convert hard DELETE into a soft delete: set deleted_at + updated_at,
-- then return NULL so the actual row removal is skipped.
CREATE OR REPLACE FUNCTION soft_delete_task()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE tasks
     SET deleted_at = now(),
         updated_at = now()
   WHERE id = OLD.id
     AND deleted_at IS NULL;
  RETURN NULL;  -- cancels the DELETE
END;
$$;

-- =========================================================
-- 4. Triggers
-- =========================================================
DROP TRIGGER IF EXISTS tasks_set_updated_at ON tasks;
CREATE TRIGGER tasks_set_updated_at
  BEFORE UPDATE ON tasks
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS tasks_soft_delete ON tasks;
CREATE TRIGGER tasks_soft_delete
  BEFORE DELETE ON tasks
  FOR EACH ROW
  EXECUTE FUNCTION soft_delete_task();

-- =========================================================
-- 5. Row Level Security
-- =========================================================
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;

-- SELECT: anyone (anon + authenticated) can read all rows.
DROP POLICY IF EXISTS "anon_select_tasks" ON tasks;
CREATE POLICY "anon_select_tasks"
  ON tasks FOR SELECT
  TO anon, authenticated
  USING (true);

-- INSERT: anyone can create tasks.
DROP POLICY IF EXISTS "anon_insert_tasks" ON tasks;
CREATE POLICY "anon_insert_tasks"
  ON tasks FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

-- UPDATE: anyone can update tasks (incl. soft-delete via deleted_at).
DROP POLICY IF EXISTS "anon_update_tasks" ON tasks;
CREATE POLICY "anon_update_tasks"
  ON tasks FOR UPDATE
  TO anon, authenticated
  USING (true) WITH CHECK (true);

-- DELETE: anyone can issue a DELETE (the trigger converts it to a soft delete).
DROP POLICY IF EXISTS "anon_delete_tasks" ON tasks;
CREATE POLICY "anon_delete_tasks"
  ON tasks FOR DELETE
  TO anon, authenticated
  USING (true);
