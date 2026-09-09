import { NextRequest, NextResponse } from 'next/server';
import { uploadPdfToGemini, isGeminiConfigured } from '@/lib/gemini';
import type { ApiError } from '@/lib/types';

// ---- PDF question-paper import (separate feature, additive only) ----
// Step 1 of 3 (upload / status / extract). Split into short, independent
// requests so no single call needs to run anywhere near a serverless
// platform's duration ceiling (e.g. Vercel Hobby's hard 60s cap) - the
// client polls status across several fast requests instead of the server
// blocking on one long one. This route only uploads the file; it does not
// wait for Gemini to finish processing it.

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Application-level sanity cap. Note: this does not override whatever raw
// request-body limit your hosting platform enforces at the infrastructure
// level (e.g. Vercel serverless functions have historically capped request
// bodies well below this) - that limit, if any, is outside this code's
// control and rejects oversized uploads before this route ever runs.
const MAX_PDF_BYTES = 25 * 1024 * 1024; // 25MB

export async function POST(req: NextRequest) {
  try {
    if (!isGeminiConfigured()) {
      const body: ApiError = {
        error: 'Gemini API key is not configured.',
        details: 'Add GEMINI_API_KEY (or GOOGLE_API_KEY) to your environment variables to enable PDF import.',
      };
      return NextResponse.json(body, { status: 503 });
    }

    let formData: FormData;
    try {
      formData = await req.formData();
    } catch {
      const body: ApiError = { error: 'Invalid upload. Expected multipart form data.' };
      return NextResponse.json(body, { status: 400 });
    }

    const file = formData.get('file');
    if (!(file instanceof File)) {
      const body: ApiError = { error: 'No PDF file was provided.' };
      return NextResponse.json(body, { status: 400 });
    }

    const looksLikePdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
    if (!looksLikePdf) {
      const body: ApiError = { error: 'Only PDF files are supported.' };
      return NextResponse.json(body, { status: 400 });
    }

    if (file.size === 0) {
      const body: ApiError = { error: 'The uploaded file is empty.' };
      return NextResponse.json(body, { status: 400 });
    }

    if (file.size > MAX_PDF_BYTES) {
      const body: ApiError = {
        error: 'PDF is too large.',
        details: `Maximum supported size is ${Math.round(MAX_PDF_BYTES / (1024 * 1024))}MB.`,
      };
      return NextResponse.json(body, { status: 413 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());

    try {
      const { fileName } = await uploadPdfToGemini(buffer, file.name);
      return NextResponse.json({ ok: true, fileName, originalFilename: file.name });
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
  }
}
