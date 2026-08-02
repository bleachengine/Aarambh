'use client';

import { useEffect, useState } from 'react';
import { ChevronLeftIcon, ChevronRightIcon, ClockIcon, AwardIcon, TrashIcon, LoaderIcon } from '@/components/icons';
import { AppHeader } from '@/components/app-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { fetchExamHistory, fetchExamById, deleteExamHistoryItem } from '@/lib/history';
import { isSupabaseConfigured } from '@/lib/supabase';
import { LoadingScreen } from '@/components/loading-screen';
import type { ExamHistoryItem, GeneratedExam } from '@/lib/types';

interface ExamHistoryProps {
  onBack: () => void;
  onSelect: (item: ExamHistoryItem) => void;
  onResume: (item: ExamHistoryItem, exam: GeneratedExam) => void;
  username: string | null;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function gradeColor(grade: string): string {
  if (grade.startsWith('A')) return 'text-success';
  if (grade.startsWith('B')) return 'text-primary';
  if (grade.startsWith('C')) return 'text-warning';
  return 'text-destructive';
}

export function ExamHistory({ onBack, onSelect, onResume, username }: ExamHistoryProps) {
  const [items, setItems] = useState<ExamHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<ExamHistoryItem | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [resumingId, setResumingId] = useState<string | null>(null);
  const [resumeError, setResumeError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchExamHistory().then((data) => {
      if (!cancelled) {
        setItems(data);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!pendingDelete) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPendingDelete(null);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [pendingDelete]);

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    const item = pendingDelete;
    setDeleteError(null);
    setDeletingId(item.id);
    setPendingDelete(null);
    const success = await deleteExamHistoryItem(item.id);
    setDeletingId(null);
    if (success) {
      setItems((prev) => prev.filter((i) => i.id !== item.id));
    } else {
      setDeleteError('Failed to delete. Please try again.');
    }
  };

  const handleOpen = async (item: ExamHistoryItem) => {
    if (item.status === 'evaluated' && item.evaluation) {
      onSelect(item);
      return;
    }
    setResumeError(null);
    setResumingId(item.id);
    const exam = await fetchExamById(item.id);
    setResumingId(null);
    if (exam) {
      onResume(item, exam);
    } else {
      setResumeError('Failed to load this exam. Please try again.');
    }
  };

  if (loading) {
    return <LoadingScreen />;
  }

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 sm:py-10 lg:px-10">
      <AppHeader username={username} />

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
          <h2 className="text-sm font-semibold text-foreground">Exam History</h2>
        </div>

        {(deleteError || resumeError) && (
          <div className="mb-4 rounded-md border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
            {deleteError || resumeError}
          </div>
        )}

        {!isSupabaseConfigured ? (
          <Card className="shadow-sm">
            <CardContent className="py-10 text-center text-sm text-muted-foreground">
              History isn&apos;t available - Supabase isn&apos;t configured for this app.
            </CardContent>
          </Card>
        ) : items.length === 0 ? (
          <Card className="shadow-sm">
            <CardContent className="py-10 text-center text-sm text-muted-foreground">
              No exams yet. Generate one to get started.
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
          {items.map((item) => {
            const isEvaluated = item.status === 'evaluated' && item.evaluation;
            const isResuming = resumingId === item.id;
            return (
              <Card
                key={item.id}
                role="button"
                tabIndex={0}
                className="shadow-sm transition-colors cursor-pointer hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                onClick={() => handleOpen(item)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    handleOpen(item);
                  }
                }}
              >
                <CardContent className="flex items-center justify-between gap-4 py-4">
                  <div className="min-w-0">
                    <div className="truncate font-medium">{item.topic}</div>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <span className="inline-flex items-center gap-1">
                        <ClockIcon className="h-3 w-3" />
                        {formatDate(item.created_at)}
                      </span>
                      <Badge variant="outline" className="text-[10px]">
                        {item.difficulty}
                      </Badge>
                      <span>
                        {item.mcq_count} MCQ + {item.descriptive_count} descriptive
                      </span>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {isEvaluated && item.evaluation ? (
                      <>
                        <span className={`flex items-center gap-1 text-sm font-semibold ${gradeColor(item.evaluation.grade)}`}>
                          <AwardIcon className="h-4 w-4" />
                          {item.evaluation.grade}
                        </span>
                        <span className="text-sm text-muted-foreground">{item.evaluation.percentage}%</span>
                      </>
                    ) : (
                      <Badge variant="secondary" className="text-xs">
                        Resume
                      </Badge>
                    )}
                    {isResuming ? (
                      <LoaderIcon className="h-4 w-4 animate-spin text-muted-foreground" />
                    ) : (
                      <ChevronRightIcon className="h-4 w-4 text-muted-foreground" />
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-muted-foreground hover:text-destructive"
                      onClick={(e) => {
                        e.stopPropagation();
                        setDeleteError(null);
                        setPendingDelete(item);
                      }}
                      disabled={deletingId === item.id}
                      aria-label={`Delete exam: ${item.topic}`}
                    >
                      {deletingId === item.id ? (
                        <LoaderIcon className="h-4 w-4 animate-spin" />
                      ) : (
                        <TrashIcon className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
        )}
      </div>

      {pendingDelete && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 animate-fade-in"
          onClick={() => setPendingDelete(null)}
        >
          <Card
            className="w-full max-w-md animate-slide-up shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <CardHeader>
              <CardTitle>Delete this exam?</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                <span className="font-semibold text-foreground">&quot;{pendingDelete.topic}&quot;</span> and its results
                will be permanently removed. This can&apos;t be undone.
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

export default ExamHistory;
