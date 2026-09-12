'use client';

import { useState, useCallback } from 'react';
import { ExamSetup } from '@/components/exam-setup';
import { ExamRunner } from '@/components/exam-runner';
import { ExamResults } from '@/components/exam-results';
import { ExamHistory } from '@/components/exam-history';
import { LoadingScreen } from '@/components/loading-screen';
import { PyqSection } from '@/components/pyq-section';
import type { Difficulty, GeneratedExam, EvaluationResult, ExamHistoryItem } from '@/lib/types';

type Phase = 'setup' | 'exam' | 'results' | 'history' | 'pyq';

interface GenerateConfig {
  topic: string;
  mcqCount: number;
  descriptiveCount: number;
  difficulty: Difficulty;
  expansion: number;
}

export default function Home() {
  const [phase, setPhase] = useState<Phase>('setup');
  const [exam, setExam] = useState<GeneratedExam | null>(null);
  const [result, setResult] = useState<EvaluationResult | null>(null);
  const [historyId, setHistoryId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // True only when the current exam/result was opened from the History list
  // (either resumed or viewed) - governs whether "back" returns to History
  // instead of the fresh setup screen.
  const [cameFromHistory, setCameFromHistory] = useState(false);
  // Same idea, for attempts started from the Previous Year Papers section
  // (separate feature, additive) - governs whether "back" returns there.
  const [cameFromPyq, setCameFromPyq] = useState(false);

  const handleGenerate = useCallback(async (config: GenerateConfig) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error || data.details || `Request failed (${res.status})`);
      }
      let exam: GeneratedExam = data.exam;

      // Re-solve every MCQ answer on a dedicated, stronger model before the
      // user ever sees the exam - same accuracy pass used for imported PDF
      // papers. Only worth calling when there's at least one MCQ to check;
      // non-fatal, so any failure just falls back to the generation-pass exam.
      if (exam.questions.some((q) => q.type === 'mcq')) {
        try {
          const verifyRes = await fetch('/api/verify-exam', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ exam, historyId: data.historyId ?? null }),
          });
          const verifyData = await verifyRes.json();
          if (verifyRes.ok && verifyData.ok && verifyData.exam) {
            exam = verifyData.exam;
          }
        } catch {
          /* non-fatal - keep the generation-pass exam */
        }
      }

      setExam(exam);
      setResult(null);
      setHistoryId(data.historyId ?? null);
      setCameFromHistory(false);
      setCameFromPyq(false);
      setPhase('exam');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate exam. Please try again.');
    } finally {
      setLoading(false);
    }
  }, []);

  const handleSubmit = useCallback(
    async (answers: Record<string, string | null>) => {
      if (!exam) return;
      setSubmitting(true);
      setError(null);
      try {
        const res = await fetch('/api/evaluate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ exam, answers, historyId }),
        });
        const data = await res.json();
        if (!res.ok || !data.ok) {
          throw new Error(data.error || data.details || `Request failed (${res.status})`);
        }
        setResult(data.result);
        setPhase('results');
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to evaluate exam. Please try again.');
      } finally {
        setSubmitting(false);
      }
    },
    [exam, historyId],
  );

  const handleBackToSetup = useCallback(() => {
    setPhase('setup');
    setExam(null);
    setResult(null);
    setHistoryId(null);
    setCameFromHistory(false);
    setCameFromPyq(false);
    setError(null);
  }, []);

  const handleRetake = useCallback(() => {
    setPhase('setup');
    setExam(null);
    setResult(null);
    setHistoryId(null);
    setCameFromHistory(false);
    setCameFromPyq(false);
    setError(null);
  }, []);

  const handleViewHistory = useCallback(() => {
    setPhase('history');
  }, []);

  const handleBackToHistory = useCallback(() => {
    setPhase('history');
    setExam(null);
    setResult(null);
    setHistoryId(null);
    setCameFromHistory(false);
    setCameFromPyq(false);
    setError(null);
  }, []);

  const handleSelectHistoryItem = useCallback((item: ExamHistoryItem) => {
    if (item.evaluation) {
      setResult(item.evaluation);
      setExam(null);
      setHistoryId(item.id);
      setCameFromHistory(true);
      setCameFromPyq(false);
      setPhase('results');
    }
  }, []);

  const handleResumeHistoryItem = useCallback((item: ExamHistoryItem, exam: GeneratedExam) => {
    setExam(exam);
    setResult(null);
    setHistoryId(item.id);
    setCameFromHistory(true);
    setCameFromPyq(false);
    setError(null);
    setPhase('exam');
  }, []);

  // ---- Previous-Year Question Paper import (separate feature, additive) ----
  const handleOpenPyq = useCallback(() => {
    setPhase('pyq');
  }, []);

  const handleBackToPyq = useCallback(() => {
    setPhase('pyq');
    setExam(null);
    setResult(null);
    setHistoryId(null);
    setCameFromHistory(false);
    setCameFromPyq(false);
    setError(null);
  }, []);

  const handleStartPyqAttempt = useCallback((newHistoryId: string, pyqExam: GeneratedExam) => {
    setExam(pyqExam);
    setResult(null);
    setHistoryId(newHistoryId);
    setCameFromHistory(false);
    setCameFromPyq(true);
    setError(null);
    setPhase('exam');
  }, []);

  if (loading) {
    return <LoadingScreen />;
  }

  if (submitting) {
    return (
      <LoadingScreen message="Evaluating your answers... this can take a little longer for papers with many questions." />
    );
  }

  if (phase === 'history') {
    return (
      <ExamHistory
        onBack={handleBackToSetup}
        onSelect={handleSelectHistoryItem}
        onResume={handleResumeHistoryItem}
      />
    );
  }

  if (phase === 'pyq') {
    return <PyqSection onBack={handleBackToSetup} onStartAttempt={handleStartPyqAttempt} />;
  }

  if (phase === 'exam' && exam) {
    return (
      <ExamRunner
        exam={exam}
        onSubmit={handleSubmit}
        onBack={cameFromPyq ? handleBackToPyq : cameFromHistory ? handleBackToHistory : handleBackToSetup}
        error={error}
      />
    );
  }

  if (phase === 'results' && result) {
    return (
      <ExamResults
        result={result}
        onRetake={handleRetake}
        onHome={handleBackToSetup}
        onBackToHistory={cameFromPyq ? handleBackToPyq : cameFromHistory ? handleBackToHistory : undefined}
      />
    );
  }

  return (
    <ExamSetup
      onGenerate={handleGenerate}
      error={error}
      onViewHistory={handleViewHistory}
      onOpenPyq={handleOpenPyq}
    />
  );
}
