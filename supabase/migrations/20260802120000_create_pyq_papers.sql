/*
# Create pyq_papers table (imported previous-year question papers)

1. Purpose
- Stores reusable "paper templates" extracted from uploaded scanned PDFs via
  Gemini. This is intentionally SEPARATE from `exam_history`: a paper here
  can be attempted multiple times, whereas an `exam_history` row represents
  one specific attempt (exactly like a freshly AI-generated exam already
  does). No existing table is modified by this migration.

2. New Tables
- `pyq_papers`
  - `id` (uuid, primary key)
  - `title` (text, paper title as determined from the PDF)
  - `exam_name` (text, nullable - e.g. "SSC CGL", detected from the PDF)
  - `year` (text, nullable - detected from the PDF)
  - `description` (text, nullable)
  - `question_count` (int)
  - `source_filename` (text, nullable - original uploaded filename)
  - `exam` (jsonb, the full GeneratedExam-shaped {metadata, questions} JSON -
    identical shape to what `exam_history.exam` already stores, so it can be
    fed directly into the existing ExamRunner/evaluate pipeline unchanged)
  - `created_at` (timestamptz)

3. Attempts
- Starting a test on an imported paper simply inserts a new row into the
  EXISTING `exam_history` table (topic = paper title, exam = paper.exam,
  status = 'generated'), exactly like a fresh AI generation. This means
  every attempt automatically gets full history/resume/delete support with
  zero changes to exam_history or its RLS policies, and each "Start Test"
  click always creates a brand-new row - never reusing a previous attempt's
  answers.

4. Security
- Enable RLS on `pyq_papers`.
- Allow anon + authenticated full CRUD, matching the existing exam_history
  policy pattern (this is a single-tenant, no-auth app by design).
*/

CREATE TABLE IF NOT EXISTS pyq_papers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  exam_name text,
  year text,
  description text,
  question_count int NOT NULL DEFAULT 0,
  source_filename text,
  exam jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS pyq_papers_created_at_idx ON pyq_papers (created_at DESC);

ALTER TABLE pyq_papers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_pyq_papers" ON pyq_papers;
CREATE POLICY "anon_select_pyq_papers" ON pyq_papers FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_pyq_papers" ON pyq_papers;
CREATE POLICY "anon_insert_pyq_papers" ON pyq_papers FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_pyq_papers" ON pyq_papers;
CREATE POLICY "anon_delete_pyq_papers" ON pyq_papers FOR DELETE
  TO anon, authenticated USING (true);
