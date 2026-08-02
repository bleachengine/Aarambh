/*
# Create exam_history table (single-tenant, no auth)

1. Purpose
- Stores generated exams and their evaluation results so users can revisit
  past tests, review feedback, and track progress over time. The app has no
  sign-in screen, so rows are intentionally public/shared and accessible by
  the anon-key frontend.

2. New Tables
- `exam_history`
  - `id` (uuid, primary key)
  - `topic` (text, the original prompt/topic)
  - `difficulty` (text, Easy|Medium|Hard|Expert)
  - `mcq_count` (int)
  - `descriptive_count` (int)
  - `expansion` (int)
  - `exam` (jsonb, the full GeneratedExam JSON)
  - `answers` (jsonb, the user's answers keyed by question id)
  - `evaluation` (jsonb, the EvaluationResult JSON, null until graded)
  - `status` (text, 'generated' | 'evaluated')
  - `created_at` (timestamptz)
  - `evaluated_at` (timestamptz, null until graded)

3. Security
- Enable RLS on `exam_history`.
- Allow anon + authenticated full CRUD because the data is intentionally
  shared/public (no-auth single-tenant app).
*/

CREATE TABLE IF NOT EXISTS exam_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  topic text NOT NULL,
  difficulty text NOT NULL,
  mcq_count int NOT NULL DEFAULT 0,
  descriptive_count int NOT NULL DEFAULT 0,
  expansion int NOT NULL DEFAULT 0,
  exam jsonb NOT NULL,
  answers jsonb,
  evaluation jsonb,
  status text NOT NULL DEFAULT 'generated',
  created_at timestamptz NOT NULL DEFAULT now(),
  evaluated_at timestamptz
);

CREATE INDEX IF NOT EXISTS exam_history_created_at_idx ON exam_history (created_at DESC);
CREATE INDEX IF NOT EXISTS exam_history_topic_idx ON exam_history (topic);

ALTER TABLE exam_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_exam_history" ON exam_history;
CREATE POLICY "anon_select_exam_history" ON exam_history FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_exam_history" ON exam_history;
CREATE POLICY "anon_insert_exam_history" ON exam_history FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_exam_history" ON exam_history;
CREATE POLICY "anon_update_exam_history" ON exam_history FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_exam_history" ON exam_history;
CREATE POLICY "anon_delete_exam_history" ON exam_history FOR DELETE
  TO anon, authenticated USING (true);
