/*
# Add question embeddings for semantic duplicate detection

1. Purpose
- When generating a new exam, checks whether a newly generated question is a
  near-duplicate in MEANING (not just wording) of a question already asked
  for the same topic, e.g. "What is the name of the PM of India" vs "Who is
  the prime minister of India" should be caught as duplicates.
- This replaces stuffing the full question history into every generation
  prompt: instead, each question's meaning is stored as a vector, and a
  fast, indexed database lookup checks for near-matches after generation.

2. New Tables
- `question_embeddings`
  - `id` (uuid, primary key)
  - `exam_history_id` (uuid, references exam_history, cascade delete)
  - `topic` (text, the exam topic this question belongs to)
  - `question` (text, the question text, kept for debugging/inspection)
  - `embedding` (vector(768), from Gemini's text-embedding-004 model)
  - `created_at` (timestamptz)

3. Indexes
- HNSW index on `embedding` (cosine distance) for fast similarity search.
- Functional index on `lower(topic)` since matching is case-insensitive.

4. Functions
- `match_question(query_embedding, match_topic, match_threshold)` - returns
  the single closest existing question above the similarity threshold for a
  topic, or no rows if none is close enough. Runs entirely in Postgres so no
  extra network round trip to an LLM is needed to check for duplicates.

5. Security
- RLS enabled. Anon + authenticated may insert and select, matching the
  no-auth single-tenant design of `exam_history`. No update/delete policies
  are needed since rows are write-once.
*/

CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS question_embeddings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_history_id uuid REFERENCES exam_history(id) ON DELETE CASCADE,
  topic text NOT NULL,
  question text NOT NULL,
  embedding vector(768) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS question_embeddings_topic_idx
  ON question_embeddings (lower(topic));

CREATE INDEX IF NOT EXISTS question_embeddings_embedding_idx
  ON question_embeddings USING hnsw (embedding vector_cosine_ops);

ALTER TABLE question_embeddings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_question_embeddings" ON question_embeddings;
CREATE POLICY "anon_select_question_embeddings" ON question_embeddings FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_question_embeddings" ON question_embeddings;
CREATE POLICY "anon_insert_question_embeddings" ON question_embeddings FOR INSERT
  TO anon, authenticated WITH CHECK (true);

CREATE OR REPLACE FUNCTION match_question(
  query_embedding vector(768),
  match_topic text,
  match_threshold double precision DEFAULT 0.86
)
RETURNS TABLE (question text, similarity double precision)
LANGUAGE sql STABLE
AS $$
  SELECT question, 1 - (embedding <=> query_embedding) AS similarity
  FROM question_embeddings
  WHERE lower(topic) = lower(match_topic)
    AND 1 - (embedding <=> query_embedding) > match_threshold
  ORDER BY embedding <=> query_embedding
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION match_question(vector, text, double precision) TO anon, authenticated;
