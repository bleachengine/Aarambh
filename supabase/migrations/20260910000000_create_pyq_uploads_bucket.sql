/*
# Create pyq-uploads storage bucket

1. Purpose
- Lets the browser upload a PDF DIRECTLY to Supabase Storage via a signed
  upload URL, bypassing this app's Vercel serverless functions entirely for
  the large file transfer. Vercel enforces a hard ~4.5MB request body limit
  at the infrastructure level (confirmed in production) - routing the file
  through Supabase Storage instead removes that ceiling, since the server
  only ever handles a small JSON path reference, then downloads the file
  server-to-server (an outbound fetch, not an inbound request body, so the
  same limit does not apply).

2. New bucket
- `pyq-uploads` (private, not publicly listable/downloadable without RLS)
- Files are named `${uuid}.pdf` and are short-lived: the server deletes each
  one immediately after downloading it during import.

3. Security
- RLS on storage.objects is already enabled by default in every Supabase
  project (not touched here). This migration only adds policies scoped to
  this one bucket, matching the same fully-open anon-access pattern already
  used by exam_history and pyq_papers (single-tenant, no-auth app).
*/

insert into storage.buckets (id, name, public)
values ('pyq-uploads', 'pyq-uploads', false)
on conflict (id) do nothing;

DROP POLICY IF EXISTS "anon_insert_pyq_uploads" ON storage.objects;
CREATE POLICY "anon_insert_pyq_uploads" ON storage.objects FOR INSERT
  TO anon, authenticated WITH CHECK (bucket_id = 'pyq-uploads');

DROP POLICY IF EXISTS "anon_select_pyq_uploads" ON storage.objects;
CREATE POLICY "anon_select_pyq_uploads" ON storage.objects FOR SELECT
  TO anon, authenticated USING (bucket_id = 'pyq-uploads');

DROP POLICY IF EXISTS "anon_delete_pyq_uploads" ON storage.objects;
CREATE POLICY "anon_delete_pyq_uploads" ON storage.objects FOR DELETE
  TO anon, authenticated USING (bucket_id = 'pyq-uploads');
