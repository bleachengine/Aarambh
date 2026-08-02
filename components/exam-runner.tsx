'use client';

import { useState, useMemo, useCallback, useEffect } from 'react';
import {
  ClockIcon,
  ListChecksIcon,
  AwardIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  SendIcon,
  AlertCircleIcon,
} from '@/components/icons';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import type { GeneratedExam, ExamQuestion } from '@/lib/types';

interface ExamRunnerProps {
  exam: GeneratedExam;
  onSubmit: (answers: Record<string, string | null>) => Promise<void>;
  onBack: () => void;
  error: string | null;
}

export function ExamRunner({ exam, onSubmit, onBack, error }: ExamRunnerProps) {
  const [answers, setAnswers] = useState<Record<string, string | null>>({});
  const [currentIdx, setCurrentIdx] = useState(0);
  const [showSubmitConfirm, setShowSubmitConfirm] = useState(false);

  const totalQuestions = exam.questions.length;
  const answeredCount = useMemo(
    () =>
      exam.questions.filter((q) => {
        const a = answers[q.id];
        return a != null && a.trim() !== '';
      }).length,
    [answers, exam.questions],
  );
  const progress = totalQuestions > 0 ? (answeredCount / totalQuestions) * 100 : 0;

  const current = exam.questions[currentIdx];

  const setAnswer = useCallback((id: string, value: string | null) => {
    setAnswers((prev) => ({ ...prev, [id]: value }));
  }, []);

  const goNext = useCallback(() => {
    setCurrentIdx((i) => Math.min(i + 1, totalQuestions - 1));
  }, [totalQuestions]);

  const goPrev = useCallback(() => {
    setCurrentIdx((i) => Math.max(i - 1, 0));
  }, []);

  // keyboard navigation
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      // Skip when typing, or when arrow keys are being used by the radio
      // group to move between MCQ options (it also uses left/right arrows).
      if (target?.tagName === 'TEXTAREA' || target?.tagName === 'INPUT' || target?.getAttribute('role') === 'radio') return;
      if (e.key === 'ArrowRight') goNext();
      if (e.key === 'ArrowLeft') goPrev();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [goNext, goPrev]);

  // Warn before leaving the tab if answers exist, so an accidental
  // refresh/close doesn't silently lose progress.
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (answeredCount > 0) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [answeredCount]);

  useEffect(() => {
    if (!showSubmitConfirm) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShowSubmitConfirm(false);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [showSubmitConfirm]);

  const handleSubmit = useCallback(async () => {
    setShowSubmitConfirm(false);
    await onSubmit(answers);
  }, [answers, onSubmit]);

  if (!current) return null;

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 sm:py-10 lg:px-8">
      <div className="mb-6 animate-fade-in">
        <button
          onClick={onBack}
          className="mb-4 inline-flex items-center text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ChevronLeftIcon className="mr-1 h-4 w-4" />
          Back to setup
        </button>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{exam.metadata.title}</h1>
            <p className="mt-1 text-sm text-muted-foreground">{exam.metadata.description}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge variant="secondary" className="gap-1.5">
              <ClockIcon className="h-3.5 w-3.5" />
              {exam.metadata.estimatedDurationMinutes} min
            </Badge>
            <Badge variant="secondary" className="gap-1.5">
              <ListChecksIcon className="h-3.5 w-3.5" />
              {totalQuestions} questions
            </Badge>
            <Badge variant="secondary" className="gap-1.5">
              <AwardIcon className="h-3.5 w-3.5" />
              {exam.metadata.totalMarks} marks
            </Badge>
            <Badge variant="outline">{exam.metadata.difficulty}</Badge>
          </div>
        </div>
      </div>

      <div className="mb-6">
        <div className="mb-2 flex items-center justify-between text-sm">
          <span className="text-muted-foreground">
            {answeredCount} of {totalQuestions} answered
          </span>
          <span className="font-medium tabular-nums">{Math.round(progress)}%</span>
        </div>
        <Progress value={progress} className="h-2" />
      </div>

      <div className="grid gap-8 lg:grid-cols-[1fr_300px]">
        <div className="min-w-0">
          <Card className="animate-fade-in shadow-sm" key={current.id}>
            <CardHeader>
              <div className="flex items-center justify-between">
                <Badge variant="outline">
                  Question {currentIdx + 1} / {totalQuestions}
                </Badge>
                <div className="flex items-center gap-2">
                  {current.type === 'mcq' ? (
                    <Badge variant="secondary">MCQ</Badge>
                  ) : (
                    <Badge variant="secondary">Descriptive</Badge>
                  )}
                  <Badge variant="outline" className="tabular-nums">
                    {current.marks} {current.marks === 1 ? 'mark' : 'marks'}
                  </Badge>
                </div>
              </div>
              <CardTitle className="pr-2 text-lg font-semibold leading-relaxed sm:text-xl">
                {current.question}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <QuestionInput
                question={current}
                value={answers[current.id] ?? null}
                onChange={(v) => setAnswer(current.id, v)}
              />
            </CardContent>
          </Card>

          <div className="mt-5 flex items-center justify-between">
            <Button
              variant="outline"
              onClick={goPrev}
              disabled={currentIdx === 0}
            >
              <ChevronLeftIcon className="mr-1 h-4 w-4" />
              Previous
            </Button>
            {currentIdx < totalQuestions - 1 ? (
              <Button onClick={goNext}>
                Next
                <ChevronRightIcon className="ml-1 h-4 w-4" />
              </Button>
            ) : (
              <Button onClick={() => setShowSubmitConfirm(true)}>
                <SendIcon className="mr-1.5 h-4 w-4" />
                Submit Exam
              </Button>
            )}
          </div>

          {error && (
            <div className="mt-4 flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
              <AlertCircleIcon className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}
        </div>

        <div className="lg:sticky lg:top-6 lg:self-start">
          <Card className="shadow-sm">
            <CardHeader className="rounded-t-lg bg-accent/25 pb-3">
              <CardTitle className="text-sm font-semibold">Navigator</CardTitle>
            </CardHeader>
            <CardContent className="pt-4">
              <div className="grid grid-cols-6 gap-2 sm:grid-cols-8 lg:grid-cols-6">
                {exam.questions.map((q, i) => {
                  const a = answers[q.id];
                  const isAnswered = a != null && a.trim() !== '';
                  const isCurrent = i === currentIdx;
                  return (
                    <button
                      key={q.id}
                      onClick={() => setCurrentIdx(i)}
                      className={[
                        'relative flex h-9 w-9 items-center justify-center rounded-md border text-xs font-medium transition-all',
                        isCurrent
                          ? 'border-primary bg-primary text-primary-foreground ring-2 ring-primary/30'
                          : isAnswered
                            ? 'border-success/40 bg-success/10 text-success-foreground hover:border-success/60'
                            : 'border-border bg-background text-muted-foreground hover:border-primary/40 hover:text-foreground',
                      ].join(' ')}
                      aria-label={`Question ${i + 1}${isAnswered ? ' (answered)' : ''}`}
                    >
                      {i + 1}
                    </button>
                  );
                })}
              </div>
              <div className="mt-4 flex items-center gap-4 text-xs text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <span className="h-3 w-3 rounded-sm border border-success/40 bg-success/10" />
                  Answered
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="h-3 w-3 rounded-sm border border-primary bg-primary" />
                  Current
                </span>
              </div>
              <Button
                className="mt-4 w-full"
                variant="default"
                onClick={() => setShowSubmitConfirm(true)}
              >
                <SendIcon className="mr-1.5 h-4 w-4" />
                Submit
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>

      {showSubmitConfirm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 animate-fade-in"
          onClick={() => setShowSubmitConfirm(false)}
        >
          <Card
            className="w-full max-w-md animate-slide-up shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <CardHeader>
              <CardTitle>Submit your exam?</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                You have answered{' '}
                <span className="font-semibold text-foreground">{answeredCount}</span> of{' '}
                <span className="font-semibold text-foreground">{totalQuestions}</span> questions.
                {answeredCount < totalQuestions && (
                  <span className="block mt-1 text-warning">
                    {totalQuestions - answeredCount} unanswered question(s) will be marked as blank.
                  </span>
                )}
              </p>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setShowSubmitConfirm(false)}>
                  Keep editing
                </Button>
                <Button onClick={handleSubmit}>Submit & Evaluate</Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

function QuestionInput({
  question,
  value,
  onChange,
}: {
  question: ExamQuestion;
  value: string | null;
  onChange: (v: string | null) => void;
}) {
  if (question.type === 'mcq') {
    return (
      <RadioGroup value={value ?? ''} onValueChange={(v) => onChange(v)} className="space-y-3">
        {question.options.map((opt, i) => {
          const letter = String.fromCharCode(65 + i);
          return (
            <label
              key={i}
              className={[
                'flex cursor-pointer items-start gap-3 rounded-lg border p-3.5 transition-all',
                value === opt
                  ? 'border-primary bg-primary/5 ring-1 ring-primary/30'
                  : 'border-border hover:border-primary/40 hover:bg-secondary/50',
              ].join(' ')}
            >
              <RadioGroupItem value={opt} id={`${question.id}-${i}`} className="mt-0.5" />
              <span className="text-sm leading-relaxed">
                <span className="mr-2 font-semibold text-muted-foreground">{letter}.</span>
                {opt}
              </span>
            </label>
          );
        })}
      </RadioGroup>
    );
  }

  return (
    <Textarea
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value)}
      placeholder="Write your answer here. Be thorough - the AI evaluates accuracy, completeness, reasoning, structure, and depth."
      className="min-h-[200px] resize-y text-sm leading-relaxed"
    />
  );
}

export default ExamRunner;
