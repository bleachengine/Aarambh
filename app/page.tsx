'use client';

import { useState, useCallback } from 'react';
import { ExamSetup } from '@/components/exam-setup';
import { ExamRunner } from '@/components/exam-runner';
import { ExamResults } from '@/components/exam-results';
import { ExamHistory } from '@/components/exam-history';
import { LoadingScreen } from '@/components/loading-screen';
import type { Difficulty, GeneratedExam, EvaluationResult, ExamHistoryItem } from '@/lib/types';

type Phase = 'setup' | 'exam' | 'results' | 'history';

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
      setExam(data.exam);
      setResult(null);
      setHistoryId(data.historyId ?? null);
      setCameFromHistory(false);
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
    setError(null);
  }, []);

  const handleRetake = useCallback(() => {
    setPhase('setup');
    setExam(null);
    setResult(null);
    setHistoryId(null);
    setCameFromHistory(false);
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
    setError(null);
  }, []);

  const handleSelectHistoryItem = useCallback((item: ExamHistoryItem) => {
    if (item.evaluation) {
      setResult(item.evaluation);
      setExam(null);
      setHistoryId(item.id);
      setCameFromHistory(true);
      setPhase('results');
    }
  }, []);

  const handleResumeHistoryItem = useCallback((item: ExamHistoryItem, exam: GeneratedExam) => {
    setExam(exam);
    setResult(null);
    setHistoryId(item.id);
    setCameFromHistory(true);
    setError(null);
    setPhase('exam');
  }, []);

  if (loading || submitting) {
    return <LoadingScreen />;
  }

  if (phase === 'history') {
    return <ExamHistory onBack={handleBackToSetup} onSelect={handleSelectHistoryItem} onResume={handleResumeHistoryItem} />;
  }

  if (phase === 'exam' && exam) {
    return (
      <ExamRunner
        exam={exam}
        onSubmit={handleSubmit}
        onBack={cameFromHistory ? handleBackToHistory : handleBackToSetup}
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
        onBackToHistory={cameFromHistory ? handleBackToHistory : undefined}
      />
    );
  }

  return (
    <ExamSetup
      onGenerate={handleGenerate}
      error={error}
      onViewHistory={handleViewHistory}
    />
  );
}
