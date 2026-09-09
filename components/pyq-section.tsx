'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ChevronLeftIcon,
  ClockIcon,
  ListChecksIcon,
  TrashIcon,
  LoaderIcon,
  UploadIcon,
  FileTextIcon,
  AlertCircleIcon,
} from '@/components/icons';
import { AppHeader } from '@/components/app-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { fetchPyqPapers, deletePyqPaper, startPyqAttempt } from '@/lib/pyq';
import { isSupabaseConfigured } from '@/lib/supabase';
import type { PYQPaper, GeneratedExam } from '@/lib/types';

// ---- Previous-Year Question Paper import (separate feature, additive only) ----
// Entirely self-contained: does not import or modify ExamSetup, ExamRunner,
// ExamResults, ExamHistory, or LoadingScreen. Starting a paper hands control
// back to page.tsx via onStartAttempt, which routes into the EXISTING
// ExamRunner exactly like a freshly generated exam.

interface PyqSectionProps {
  onBack: () => void;
  onStartAttempt: (historyId: string, exam: GeneratedExam) => void;
}

// These 3 stages map directly to the 3 real network requests below (upload /
// poll status / extract) - each one only advances when its corresponding
// request actually starts, not on a simulated timer.
const IMPORT_STAGES = [
  'Uploading question paper...',
  'Reading scanned pages...',
  'Extracting questions and saving paper...',
];

const POLL_INTERVAL_MS = 3000;
const MAX_POLL_MS = 8 * 60 * 1000; // 8 minutes - generous, since each poll is its own fast request

/** Full-screen import progress. Visually matches LoadingScreen's loader.gif
 * treatment (same background color, same asset) but is implemented locally
 * so LoadingScreen itself is never touched. */
function ImportProgress({ stageIndex }: { stageIndex: number }) {
  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-3 bg-[#e6f7ff] px-4 text-center">
      {/* eslint-disable-next-line @next/next/no-img-element -- animated gif, unoptimized passthrough */}
      <img src="/loader.gif" alt="Loading" width={320} height={240} className="h-auto w-full max-w-80" />
      <p className="text-sm font-medium text-foreground/80">{IMPORT_STAGES[stageIndex]}</p>
      <p className="text-xs text-muted-foreground">
        This usually takes 30 seconds to 2 minutes - large scanned papers can take 3-4 minutes. Please keep this
        tab open; it will not fail just because it&apos;s taking a while.
      </p>
    </div>
  );
}

export function PyqSection({ onBack, onStartAttempt }: PyqSectionProps) {
  const [view, setView] = useState<'list' | 'import'>('list');
  const [papers, setPapers] = useState<PYQPaper[]>([]);
  const [loading, setLoading] = useState(true);

  const [importing, setImporting] = useState(false);
  const [importStage, setImportStage] = useState(0);
  const [importError, setImportError] = useState<string | null>(null);
  const [importWarnings, setImportWarnings] = useState<string[]>([]);
  const [selectedFileName, setSelectedFileName] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [startingId, setStartingId] = useState<string | null>(null);
  const [startError, setStartError] = useState<string | null>(null);

  const [pendingDelete, setPendingDelete] = useState<PYQPaper | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchPyqPapers().then((data) => {
      if (!cancelled) {
        setPapers(data);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleImport = useCallback(async () => {
    const file = fileInputRef.current?.files?.[0];
    if (!file) {
      setImportError('Please choose a PDF file first.');
      return;
    }
    setImportError(null);
    setImportWarnings([]);
    setImportStage(0);
    setImporting(true);
    try {
      // Step 1: upload. Split into its own short request so no single call
      // needs to run anywhere near a serverless platform's duration ceiling
      // (e.g. Vercel Hobby's 60s cap) - see lib/gemini.ts for the full
      // rationale. The browser waits as long as it takes either way; only
      // individual requests are kept short.
      const formData = new FormData();
      formData.append('file', file);
      const uploadRes = await fetch('/api/import-pdf/upload', { method: 'POST', body: formData });
      const uploadData = await uploadRes.json();
      if (!uploadRes.ok || !uploadData.ok) {
        throw new Error(uploadData.error || uploadData.details || `Upload failed (${uploadRes.status})`);
      }
      const fileName: string = uploadData.fileName;
      const originalFilename: string = uploadData.originalFilename ?? file.name;

      // Step 2: poll status every few seconds until Gemini finishes
      // processing the file. Each poll is its own fast, independent request.
      // A single flaky poll (dropped connection, momentary 5xx) must not
      // abort an otherwise-healthy import - only give up after several
      // consecutive failures in a row, not the first one. A genuine FAILED
      // processing state is NOT transient though, and must fail immediately
      // rather than being retried.
      setImportStage(1);
      const pollStart = Date.now();
      let consecutiveFailures = 0;
      const MAX_CONSECUTIVE_FAILURES = 5;
      for (;;) {
        let terminalError: Error | null = null;
        try {
          const statusRes = await fetch('/api/import-pdf/status', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ fileName }),
          });
          const statusData = await statusRes.json();
          if (!statusRes.ok || !statusData.ok) {
            throw new Error(statusData.error || statusData.details || `Status check failed (${statusRes.status})`);
          }
          consecutiveFailures = 0;
          if (statusData.state === 'ACTIVE') break;
          if (statusData.state === 'FAILED') {
            terminalError = new Error('Gemini failed to process the uploaded PDF (it may be corrupted or unreadable).');
          }
        } catch (pollErr) {
          consecutiveFailures += 1;
          if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
            throw pollErr instanceof Error
              ? pollErr
              : new Error('Lost connection while checking the PDF processing status.');
          }
        }
        // Thrown outside the try/catch above so a genuine FAILED state is
        // never absorbed into the transient-failure retry counting.
        if (terminalError) throw terminalError;

        if (Date.now() - pollStart > MAX_POLL_MS) {
          throw new Error('Timed out waiting for the PDF to finish processing. Please try again.');
        }
        await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
      }

      // Step 3: extract every question and save the paper.
      setImportStage(2);
      const extractRes = await fetch('/api/import-pdf/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileName, originalFilename }),
      });
      const extractData = await extractRes.json();
      if (!extractRes.ok || !extractData.ok) {
        throw new Error(extractData.error || extractData.details || `Extraction failed (${extractRes.status})`);
      }

      setImportWarnings(Array.isArray(extractData.warnings) ? extractData.warnings : []);
      setPapers((prev) => [extractData.paper as PYQPaper, ...prev]);
      setView('list');
      setSelectedFileName(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
    } catch (err) {
      setImportError(err instanceof Error ? err.message : 'Failed to import the PDF. Please try again.');
    } finally {
      setImporting(false);
    }
  }, []);

  const handleStart = useCallback(
    async (paper: PYQPaper) => {
      setStartError(null);
      setStartingId(paper.id);
      const result = await startPyqAttempt(paper);
      setStartingId(null);
      if (result) {
        onStartAttempt(result.historyId, result.exam);
      } else {
        setStartError('Failed to start this paper. Please try again.');
      }
    },
    [onStartAttempt],
  );

  const confirmDelete = useCallback(async () => {
    if (!pendingDelete) return;
    const item = pendingDelete;
    setDeleteError(null);
    setDeletingId(item.id);
    setPendingDelete(null);
    const success = await deletePyqPaper(item.id);
    setDeletingId(null);
    if (success) {
      setPapers((prev) => prev.filter((p) => p.id !== item.id));
    } else {
      setDeleteError('Failed to delete. Please try again.');
    }
  }, [pendingDelete]);

  if (importing) {
    return <ImportProgress stageIndex={importStage} />;
  }

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 sm:py-10 lg:px-10">
      <AppHeader />

      <div className="mx-auto max-w-4xl">
        <div className="mb-6 flex items-center gap-2">
          <button
            onClick={onBack}
            className="inline-flex items-center text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <ChevronLeftIcon className="mr-1 h-4 w-4" />
            Back
          </button>
          <span className="text-muted-foreground">/</span>
          <h2 className="text-sm font-semibold text-foreground">Previous Year Papers</h2>
        </div>

        {!isSupabaseConfigured ? (
          <Card className="shadow-sm">
            <CardContent className="py-10 text-center text-sm text-muted-foreground">
              Previous year papers aren&apos;t available - Supabase isn&apos;t configured for this app.
            </CardContent>
          </Card>
        ) : view === 'import' ? (
          <Card className="animate-slide-up shadow-lg">
            <CardHeader>
              <CardTitle className="text-xl">Import Question Paper</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Upload a scanned previous-year question paper (PDF). It will read every page - including
                scanned/image-only pages - and extract all the MCQ questions in one pass.
              </p>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex w-full flex-col items-center gap-1.5 rounded-lg border-2 border-dashed border-border px-6 py-8 text-center transition-colors hover:border-primary/40 hover:bg-accent/20"
              >
                <FileTextIcon className="h-7 w-7 text-muted-foreground" />
                {selectedFileName ? (
                  <p className="max-w-full truncate text-sm font-medium text-foreground">{selectedFileName}</p>
                ) : (
                  <p className="text-sm">
                    <span className="font-medium text-primary">Click to choose a PDF</span>
                  </p>
                )}
                <p className="text-xs text-muted-foreground">PDF only, up to 25MB.</p>
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="application/pdf,.pdf"
                className="hidden"
                onChange={(e) => setSelectedFileName(e.target.files?.[0]?.name ?? null)}
              />

              {importError && (
                <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
                  <AlertCircleIcon className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{importError}</span>
                </div>
              )}

              <div className="flex justify-end gap-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    setView('list');
                    setSelectedFileName(null);
                    if (fileInputRef.current) fileInputRef.current.value = '';
                  }}
                >
                  Cancel
                </Button>
                <Button onClick={handleImport} disabled={!selectedFileName}>
                  <UploadIcon className="mr-1.5 h-4 w-4" />
                  Extract &amp; Import
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : (
          <>
            <div className="mb-4 flex items-center justify-between gap-3">
              <p className="text-sm text-muted-foreground">
                Papers imported from previous-year PDF question papers.
              </p>
              <Button onClick={() => setView('import')}>
                <UploadIcon className="mr-1.5 h-4 w-4" />
                Import Paper
              </Button>
            </div>

            {importWarnings.length > 0 && (
              <div className="mb-4 rounded-md border border-warning/40 bg-warning/10 px-4 py-3 text-sm text-foreground">
                <p className="mb-1 font-medium">
                  Imported with {importWarnings.length} question{importWarnings.length === 1 ? '' : 's'} skipped:
                </p>
                <ul className="list-inside list-disc space-y-0.5 text-xs text-muted-foreground">
                  {importWarnings.slice(0, 10).map((w, i) => (
                    <li key={i}>{w}</li>
                  ))}
                  {importWarnings.length > 10 && <li>...and {importWarnings.length - 10} more.</li>}
                </ul>
              </div>
            )}

            {(deleteError || startError) && (
              <div className="mb-4 rounded-md border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
                {deleteError || startError}
              </div>
            )}

            {loading ? (
              <p className="text-sm text-muted-foreground">Loading...</p>
            ) : papers.length === 0 ? (
              <Card className="shadow-sm">
                <CardContent className="py-10 text-center text-sm text-muted-foreground">
                  No papers imported yet. Import a PDF to get started.
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-3">
                {papers.map((paper) => (
                  <Card key={paper.id} className="shadow-sm transition-colors hover:border-primary/40">
                    <CardContent className="flex items-center justify-between gap-4 py-4">
                      <div className="min-w-0">
                        <div className="truncate font-medium">{paper.title}</div>
                        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                          {paper.exam_name && <Badge variant="outline">{paper.exam_name}</Badge>}
                          {paper.year && <Badge variant="outline">{paper.year}</Badge>}
                          {paper.has_answer_key ? (
                            <Badge variant="secondary" className="text-success">
                              Answers verified from source
                            </Badge>
                          ) : (
                            <Badge variant="secondary" className="text-success">
                              AI-determined answers
                            </Badge>
                          )}
                          <span className="inline-flex items-center gap-1">
                            <ListChecksIcon className="h-3 w-3" />
                            {paper.question_count} questions
                          </span>
                          <span className="inline-flex items-center gap-1">
                            <ClockIcon className="h-3 w-3" />
                            {new Date(paper.created_at).toLocaleDateString()}
                          </span>
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <Button
                          size="sm"
                          onClick={() => handleStart(paper)}
                          disabled={startingId === paper.id}
                        >
                          {startingId === paper.id ? (
                            <LoaderIcon className="h-4 w-4 animate-spin" />
                          ) : (
                            'Start Test'
                          )}
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-muted-foreground hover:text-destructive"
                          onClick={() => setPendingDelete(paper)}
                          disabled={deletingId === paper.id}
                          aria-label={`Delete paper: ${paper.title}`}
                        >
                          {deletingId === paper.id ? (
                            <LoaderIcon className="h-4 w-4 animate-spin" />
                          ) : (
                            <TrashIcon className="h-4 w-4" />
                          )}
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {pendingDelete && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 animate-fade-in"
          onClick={() => setPendingDelete(null)}
        >
          <Card className="w-full max-w-md animate-slide-up shadow-xl" onClick={(e) => e.stopPropagation()}>
            <CardHeader>
              <CardTitle>Delete this paper?</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                <span className="font-semibold text-foreground">&quot;{pendingDelete.title}&quot;</span> will be
                permanently removed. This can&apos;t be undone. Past attempts already in your exam history are not
                affected.
              </p>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setPendingDelete(null)}>
                  Cancel
                </Button>
                <Button variant="destructive" onClick={confirmDelete}>
                  Delete
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

export default PyqSection;
