/*
# Add UPDATE policy to pyq_papers

1. Purpose
- The answer-verification pass re-solves a freshly imported paper's answers
  on a stronger model and writes the corrections back into the paper's
  `exam` jsonb. That UPDATE was silently blocked: the original pyq_papers
  migration created SELECT/INSERT/DELETE policies but no UPDATE policy, so
  RLS rejected the write (0 rows affected), surfacing as a "Cannot coerce
  the result to a single JSON object" error on the `.select().single()`.

2. Changes
- Adds an UPDATE policy scoped to pyq_papers, matching the same fully-open
  anon-access pattern used by the table's other policies (single-tenant,
  no-auth app).
*/

DROP POLICY IF EXISTS "anon_update_pyq_papers" ON pyq_papers;
CREATE POLICY "anon_update_pyq_papers" ON pyq_papers FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);
