/*
# Add has_answer_key to pyq_papers

1. Purpose
- Tracks whether an official answer key was found in the source PDF and
  used (true), versus every correctAnswer being determined by Gemini's own
  reasoning because no key was present in the source (false). Lets the UI
  transparently flag AI-determined papers instead of presenting them with
  the same confidence as source-verified ones.

2. Changes
- `pyq_papers.has_answer_key` (boolean, NOT NULL, default false)
- No other table is touched.
*/

ALTER TABLE pyq_papers ADD COLUMN IF NOT EXISTS has_answer_key boolean NOT NULL DEFAULT false;
