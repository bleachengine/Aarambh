'use client';

import {
  AwardIcon,
  TrendingUpIcon,
  TrendingDownIcon,
  LightbulbIcon,
  CheckCircleIcon,
  XCircleIcon,
  RotateCcwIcon,
  HomeIcon,
  ChevronLeftIcon,
  ChevronDownIcon,
  ChevronUpIcon,
} from '@/components/icons';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import type { EvaluationResult, QuestionEvaluation } from '@/lib/types';

interface ExamResultsProps {
  result: EvaluationResult;
  onRetake: () => void;
  onHome: () => void;
  onBackToHistory?: () => void;
}

function gradeColor(grade: string): string {
  if (grade.startsWith('A')) return 'text-success';
  if (grade.startsWith('B')) return 'text-primary';
  if (grade.startsWith('C')) return 'text-warning';
  return 'text-destructive';
}

function gradeBg(grade: string): string {
  if (grade.startsWith('A')) return 'bg-success/10 ring-success/20';
  if (grade.startsWith('B')) return 'bg-primary/10 ring-primary/20';
  if (grade.startsWith('C')) return 'bg-warning/10 ring-warning/20';
  return 'bg-destructive/10 ring-destructive/20';
}

export function ExamResults({ result, onRetake, onHome, onBackToHistory }: ExamResultsProps) {
  const { percentage, grade, totalMarksAwarded, totalMarksMax } = result;

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 sm:py-10 lg:px-8">
      {onBackToHistory && (
        <button
          onClick={onBackToHistory}
          className="mb-4 inline-flex items-center text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ChevronLeftIcon className="mr-1 h-4 w-4" />
          Back to History
        </button>
      )}
      <div className="mb-8 text-center animate-fade-in">
        <div className="mb-4 text-sm font-medium uppercase tracking-wider text-muted-foreground">
          Your Result
        </div>
        <div
          className={[
            'mx-auto mb-4 flex h-32 w-32 flex-col items-center justify-center rounded-full ring-4',
            gradeBg(grade),
          ].join(' ')}
        >
          <span className={`text-5xl font-bold ${gradeColor(grade)}`}>{grade}</span>
          <span className="mt-1 text-sm font-medium text-muted-foreground">{percentage}%</span>
        </div>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{result.examTitle}</h1>
        <p className="mt-2 text-lg text-muted-foreground">
          You scored{' '}
          <span className="font-semibold text-foreground">
            {totalMarksAwarded}
          </span>{' '}
          out of{' '}
          <span className="font-semibold text-foreground">{totalMarksMax}</span> marks
        </p>
      </div><Card className="mb-6 animate-slide-up shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <AwardIcon className="h-5 w-5 text-primary" />
            Performance Analysis
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm leading-relaxed text-muted-foreground">
            {result.performanceAnalysis}
          </p>
          <div className="mt-4">
            <Progress value={percentage} className="h-2.5" />
          </div>
        </CardContent>
      </Card>{(result.strengths.length > 0 || result.weaknesses.length > 0) && (
      <div className="mb-6 grid gap-4 sm:grid-cols-2">
        {result.strengths.length > 0 && (
          <Card className="animate-slide-up shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base text-success">
                <TrendingUpIcon className="h-5 w-5" />
                Strengths
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <ul className="space-y-2">
                {result.strengths.map((s, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm">
                    <CheckCircleIcon className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                    <span className="leading-relaxed">{s}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}
        {result.weaknesses.length > 0 && (
          <Card className="animate-slide-up shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base text-destructive">
                <TrendingDownIcon className="h-5 w-5" />
                Weaknesses
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <ul className="space-y-2">
                {result.weaknesses.map((w, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm">
                    <XCircleIcon className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                    <span className="leading-relaxed">{w}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}
      </div>
      )}
      {result.recommendations.length > 0 && (
        <Card className="mb-8 animate-slide-up shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-warning">
                <LightbulbIcon className="h-4 w-4 text-black" />
              </span>
              Study Recommendations
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <ul className="space-y-2">
              {result.recommendations.map((r, i) => (
                <li key={i} className="flex items-start gap-2 text-sm">
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-warning/10 text-xs font-semibold text-warning">
                    {i + 1}
                  </span>
                  <span className="leading-relaxed">{r}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}<h2 className="mb-4 text-lg font-semibold">Question Feedback</h2>
      <div className="space-y-4">
        {result.questionResults.map((qr, i) => (
          <QuestionResult key={qr.id} index={i} result={qr} />
        ))}
      </div><div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
        <Button size="lg" variant="default" onClick={onRetake}>
          <RotateCcwIcon className="mr-2 h-4 w-4" />
          New Exam
        </Button>
        <Button size="lg" variant="outline" onClick={onHome}>
          <HomeIcon className="mr-2 h-4 w-4" />
          Home
        </Button>
      </div>
    </div>
  );
}

function QuestionResult({ index, result }: { index: number; result: QuestionEvaluation }) {
  const [expanded, setExpanded] = useState(false);
  const isCorrect = result.type === 'mcq' ? result.correct : result.marksAwarded >= result.marksMax * 0.8;
  const isPartial =
    result.type === 'descriptive' &&
    result.marksAwarded > 0 &&
    result.marksAwarded < result.marksMax;

  const statusColor = isCorrect
    ? 'border-success/40 bg-success/5'
    : isPartial
      ? 'border-warning/40 bg-warning/5'
      : 'border-destructive/40 bg-destructive/5';

  return (
    <Card className={`animate-fade-in shadow-sm ${statusColor}`}>
      <CardHeader className="p-4">
        <button
          onClick={() => setExpanded((e) => !e)}
          className="flex w-full items-start justify-between gap-3 text-left"
        >
          <div className="flex min-w-0 items-start gap-3">
            <span
              className={[
                'mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold',
                isCorrect
                  ? 'bg-success/15 text-success'
                  : isPartial
                    ? 'bg-warning/15 text-warning'
                    : 'bg-destructive/15 text-destructive',
              ].join(' ')}
            >
              {isCorrect ? (
                <CheckCircleIcon className="h-4 w-4" />
              ) : isPartial ? (
                '~'
              ) : (
                <XCircleIcon className="h-4 w-4" />
              )}
            </span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline">Q{index + 1}</Badge>
                <Badge variant="secondary">{result.type.toUpperCase()}</Badge>
                <Badge variant="outline" className="tabular-nums">
                  {result.marksAwarded}/{result.marksMax}
                </Badge>
              </div>
              {result.question && (
                <p className="mt-2 text-sm font-medium leading-relaxed text-foreground">
                  {result.question}
                </p>
              )}
            </div>
          </div>
          {expanded ? (
            <ChevronUpIcon className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
          ) : (
            <ChevronDownIcon className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
          )}
        </button>
      </CardHeader>

      {expanded && (
        <CardContent className="pt-0">
          <QuestionResultDetails result={result} />
        </CardContent>
      )}
    </Card>
  );
}

function QuestionResultDetails({ result }: { result: QuestionEvaluation }) {
  if (result.type === 'mcq') {
    return (
      <div className="space-y-4 text-sm"><div>
          <div className="mb-1 font-medium text-muted-foreground">Your answer</div>
          {result.userAnswer ? (
            <div
              className={[
                'inline-flex items-center gap-2 rounded-md px-3 py-1.5',
                result.correct ? 'bg-success/10 text-success' : 'bg-destructive/10 text-destructive',
              ].join(' ')}
            >
              {result.correct ? (
                <CheckCircleIcon className="h-4 w-4" />
              ) : (
                <XCircleIcon className="h-4 w-4" />
              )}
              {result.userAnswer}
            </div>
          ) : (
            <span className="text-muted-foreground italic">Not answered</span>
          )}
        </div>{!result.correct && (
          <div>
            <div className="mb-1 font-medium text-muted-foreground">Correct answer</div>
            <div className="inline-flex items-center gap-2 rounded-md bg-success/10 px-3 py-1.5 text-success">
              <CheckCircleIcon className="h-4 w-4" />
              {result.correctAnswer}
            </div>
          </div>
        )}<div>
          <div className="mb-1 font-medium text-muted-foreground">Explanation</div>
          <p className="leading-relaxed">{result.explanation}</p>
        </div>
      </div>
    );
  }

  // Descriptive
  return (
    <div className="space-y-4 text-sm"><div>
        <div className="mb-1 font-medium text-muted-foreground">Your answer</div>
        <div className="rounded-md border border-border bg-secondary/30 p-3 leading-relaxed">
          {result.userAnswer || <span className="italic text-muted-foreground">Not answered</span>}
        </div>
      </div>{result.feedback && (
        <div>
          <div className="mb-1 font-medium text-muted-foreground">Examiner feedback</div>
          <p className="leading-relaxed">{result.feedback}</p>
        </div>
      )}{result.idealAnswer && (
        <div>
          <div className="mb-1 font-medium text-muted-foreground">Ideal / model answer</div>
          <div className="rounded-md border border-success/30 bg-success/5 p-3 leading-relaxed">
            {result.idealAnswer}
          </div>
        </div>
      )}{result.strengths.length > 0 && (
        <div>
          <div className="mb-1 font-medium text-success">What you got right</div>
          <ul className="space-y-1">
            {result.strengths.map((s, i) => (
              <li key={i} className="flex items-start gap-2">
                <CheckCircleIcon className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                <span className="leading-relaxed">{s}</span>
              </li>
            ))}
          </ul>
        </div>
      )}{result.weaknesses.length > 0 && (
        <div>
          <div className="mb-1 font-medium text-destructive">What was missing or wrong</div>
          <ul className="space-y-1">
            {result.weaknesses.map((w, i) => (
              <li key={i} className="flex items-start gap-2">
                <XCircleIcon className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                <span className="leading-relaxed">{w}</span>
              </li>
            ))}
          </ul>
        </div>
      )}{result.improvements.length > 0 && (
        <div>
          <div className="mb-1 font-medium text-warning">How to improve</div>
          <ul className="space-y-1">
            {result.improvements.map((imp, i) => (
              <li key={i} className="flex items-start gap-2">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-warning">
                  <LightbulbIcon className="h-3 w-3 text-black" />
                </span>
                <span className="leading-relaxed">{imp}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export default ExamResults;
