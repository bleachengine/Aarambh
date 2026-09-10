import { NextRequest, NextResponse } from 'next/server';
import { uploadPdfToGemini, isGeminiConfigured } from '@/lib/gemini';
import { supabase } from '@/lib/supabase';
import type { ApiError } from '@/lib/types';

// ---- PDF question-paper import (separate feature, additive only) ----
// Step 1 of 3 (upload / status / extract). Split into short, independent
// requests so no single call needs to run anywhere near a serverless
// platform's duration ceiling (e.g. Vercel Hobby's hard 60s cap).
//
// The actual PDF bytes never reach this route as a request body - the
// browser already uploaded the file directly to Supabase Storage (see
// lib/pyq.ts's uploadPdfDirectToStorage), bypassing Vercel's hard ~4.5MB
// request-body limit entirely (confirmed in production: a request that
// never reaches a Vercel function isn't subject to it). This route just
// receives the small storage path reference, pulls the file down
// server-to-server, and hands it to Gemini.

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const PYQ_UPLOADS_BUCKET = 'pyq-uploads';

// No longer bounded by Vercel's request-body limit (see above) - this is
// now just a sane application-level ceiling. Realistic scanned PYQ papers
// are well under this; Supabase Storage's own free-tier per-file limit is
// higher still.
const MAX_PDF_BYTES = 20 * 1024 * 1024; // 20MB

interface UploadPayload {
  storagePath?: string;
  originalFilename?: string;
}

export async function POST(req: NextRequest) {
  let storagePath: string | undefined;
  try {
    if (!isGeminiConfigured()) {
      const body: ApiError = {
        error: 'Gemini API key is not configured.',
        details: 'Add GEMINI_API_KEY (or GOOGLE_API_KEY) to your environment variables to enable PDF import.',
      };
      return NextResponse.json(body, { status: 503 });
    }

    if (!supabase) {
      const body: ApiError = {
        error: 'Supabase is not configured.',
        details: 'PDF import requires Supabase Storage to receive the uploaded file.',
      };
      return NextResponse.json(body, { status: 503 });
    }

    let payload: UploadPayload;
    try {
      payload = (await req.json()) as UploadPayload;
    } catch {
      const body: ApiError = { error: 'Invalid request body. JSON expected.' };
      return NextResponse.json(body, { status: 400 });
    }

    if (typeof payload.storagePath !== 'string' || !payload.storagePath) {
      const body: ApiError = { error: '"storagePath" is required.' };
      return NextResponse.json(body, { status: 400 });
    }
    storagePath = payload.storagePath;
    const originalFilename = payload.originalFilename?.trim() || 'uploaded.pdf';

    const { data: fileBlob, error: downloadError } = await supabase.storage
      .from(PYQ_UPLOADS_BUCKET)
      .download(storagePath);
    if (downloadError || !fileBlob) {
      const body: ApiError = {
        error: 'Could not retrieve the uploaded PDF. Please try uploading again.',
        details: downloadError?.message,
      };
      return NextResponse.json(body, { status: 404 });
    }

    if (fileBlob.size === 0) {
      const body: ApiError = { error: 'The uploaded file is empty.' };
      return NextResponse.json(body, { status: 400 });
    }

    if (fileBlob.size > MAX_PDF_BYTES) {
      const body: ApiError = {
        error: 'PDF is too large.',
        details: `Maximum supported size is ${Math.round(MAX_PDF_BYTES / (1024 * 1024))}MB.`,
      };
      return NextResponse.json(body, { status: 413 });
    }

    const buffer = Buffer.from(await fileBlob.arrayBuffer());

    try {
      const { fileName } = await uploadPdfToGemini(buffer, originalFilename);
      return NextResponse.json({ ok: true, fileName, originalFilename });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const isQuota = message.includes('RESOURCE_EXHAUSTED') || message.includes('"code":429');
      const body: ApiError = {
        error: isQuota ? 'Gemini quota exceeded. Please try again later.' : 'Failed to upload the PDF to Gemini.',
        details: message,
      };
      return NextResponse.json(body, { status: isQuota ? 429 : 502 });
    }
  } catch (err) {
    const body: ApiError = {
      error: 'Failed to upload the PDF.',
      details: err instanceof Error ? err.message : String(err),
    };
    return NextResponse.json(body, { status: 500 });
  } finally {
    // Best-effort cleanup - the Storage copy is only ever a short-lived
    // relay to Gemini, never needed again once this route has run.
    if (storagePath && supabase) {
      supabase.storage.from(PYQ_UPLOADS_BUCKET).remove([storagePath]).catch(() => {});
    }
  }
}
