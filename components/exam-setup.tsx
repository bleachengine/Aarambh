'use client';

import { useState, useCallback } from 'react';
import { SparklesIcon } from '@/components/icons';
import { AppHeader } from '@/components/app-header';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Badge } from '@/components/ui/badge';
import type { Difficulty } from '@/lib/types';

interface ExamSetupProps {
  onGenerate: (config: {
    topic: string;
    mcqCount: number;
    descriptiveCount: number;
    difficulty: Difficulty;
    expansion: number;
  }) => Promise<void>;
  error: string | null;
  onViewHistory: () => void;
  username: string | null;
}

const EXAMPLE_PROMPTS = [
  'Make a test on Indian Heritage and Culture',
  'Create a JavaScript interview test',
  'Test me on Indian Society & Diversity',
  'Generate a Environment and Biodiversity exam',
  'Test me on Indian Economy for UPSC GS',
  'Prepare a UPSC Polity test',
];

const DIFFICULTIES: { value: Difficulty; label: string; desc: string }[] = [
  { value: 'Easy', label: 'Easy', desc: 'Foundational recall & basics' },
  { value: 'Medium', label: 'Medium', desc: 'Application & understanding' },
  { value: 'Hard', label: 'Hard', desc: 'Analysis & problem solving' },
  { value: 'Expert', label: 'Expert', desc: 'Synthesis & edge cases' },
];

const FEATURES = [
  'Any topic, subject, or skill',
  'MCQ + descriptive question mix',
  'Examiner-level, detailed feedback',
];

// The AI prompt only recognizes 4 distinct expansion tiers (see
// lib/prompts.ts EXPANSION_GUIDE) - there is no meaningful difference between
// e.g. 22 and 48, so the slider has exactly 4 stops, one per tier, instead of
// a fake continuous range where most positions look different but behave
// identically. `value` is the number actually sent to the AI for that tier
// (the midpoint of its real 0-100 range).
const EXPANSION_LEVELS = [
  { value: 10, label: 'Strict', desc: 'Only the exact topic - no tangents.' },
  { value: 35, label: 'Focused', desc: 'The topic plus a few core prerequisites.' },
  { value: 65, label: 'Broad', desc: 'Adds advanced applications, related theory, and edge cases.' },
  { value: 90, label: 'Exploratory', desc: 'Adds real-world scenarios and applied, higher-order questions.' },
];

export function ExamSetup({ onGenerate, error, onViewHistory, username }: ExamSetupProps) {
  const [topic, setTopic] = useState('');
  const [mcqCount, setMcqCount] = useState(10);
  const [descriptiveCount, setDescriptiveCount] = useState(3);
  const [difficulty, setDifficulty] = useState<Difficulty>('Medium');
  const [expansionIndex, setExpansionIndex] = useState(1);

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (!topic.trim()) return;
      onGenerate({
        topic: topic.trim(),
        mcqCount,
        descriptiveCount,
        difficulty,
        expansion: EXPANSION_LEVELS[expansionIndex].value,
      });
    },
    [topic, mcqCount, descriptiveCount, difficulty, expansionIndex, onGenerate],
  );

  const applyExample = (p: string) => {
    setTopic(p);
  };

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 sm:py-8 lg:px-8">
      <AppHeader username={username} action={{ type: 'history', onClick: onViewHistory }} />

      <p className="mb-2 text-sm text-muted-foreground">
        Generate a complete, AI-authored exam on any subject - then get it graded with examiner-level feedback.
      </p>

      <div className="mb-6 flex flex-wrap items-center gap-x-6 gap-y-1.5 border-border/60">
        {FEATURES.map((f) => (
          <span key={f} className="inline-flex items-center gap-1.5 text-xs text-foreground/70">
            <SparklesIcon className="h-3.5 w-3.5 text-primary" />
            {f}
          </span>
        ))}
      </div>

      <Card className="animate-slide-up shadow-lg">
        <CardHeader>
          <CardTitle className="text-xl">Create your exam</CardTitle>
          <CardDescription>
            Describe any topic, subject, or skill. The AI adapts to the domain.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-2">
              <label htmlFor="topic" className="text-sm font-medium">
                What do you want to be tested on?
              </label>
              <textarea
                id="topic"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                placeholder="e.g. Make a test on Indian Heritage and Culture"
                maxLength={300}
                rows={2}
                className="flex w-full resize-none rounded-md border border-input bg-background px-4 py-3 text-base shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                autoComplete="off"
              />
              <div className="flex flex-wrap gap-2 pt-1">
                {EXAMPLE_PROMPTS.map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => applyExample(p)}
                    className="rounded-full border border-border bg-accent/40 px-3 py-1 text-xs text-foreground/70 transition-colors hover:border-primary/40 hover:bg-accent/80 hover:text-foreground disabled:opacity-50"
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium">MCQs</label>
                  <Badge variant="secondary" className="tabular-nums">
                    {mcqCount}
                  </Badge>
                </div>
                <Slider
                  value={[mcqCount]}
                  min={0}
                  max={30}
                  step={1}
                  onValueChange={(v) => setMcqCount(v[0])}
                />
                <p className="text-xs text-muted-foreground">Multiple choice (0-30)</p>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium">Descriptive</label>
                  <Badge variant="secondary" className="tabular-nums">
                    {descriptiveCount}
                  </Badge>
                </div>
                <Slider
                  value={[descriptiveCount]}
                  min={0}
                  max={10}
                  step={1}
                  onValueChange={(v) => setDescriptiveCount(v[0])}
                />
                <p className="text-xs text-muted-foreground">Paragraph questions (0-10)</p>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Difficulty</label>
                <Select
                  value={difficulty}
                  onValueChange={(v) => setDifficulty(v as Difficulty)}
                >
                  <SelectTrigger className="h-11">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DIFFICULTIES.map((d) => (
                      <SelectItem key={d.value} value={d.value} description={d.desc}>
                        {d.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {error && (
              <div className="rounded-md border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
                {error}
              </div>
            )}

            <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
              <div className="flex-1 space-y-2 rounded-lg bg-accent/25 p-3">
                <div className="flex items-center justify-between gap-3">
                  <label className="text-sm font-medium">Expansion / Context</label>
                  <p className="text-xs text-muted-foreground text-right">{EXPANSION_LEVELS[expansionIndex].desc}</p>
                </div>
                <Slider
                  value={[expansionIndex]}
                  min={0}
                  max={EXPANSION_LEVELS.length - 1}
                  step={1}
                  onValueChange={(v) => setExpansionIndex(v[0])}
                />
                <div className="flex justify-between text-[11px]">
                  {EXPANSION_LEVELS.map((level, i) => (
                    <span
                      key={level.label}
                      className={i === expansionIndex ? 'font-semibold text-foreground' : 'text-muted-foreground'}
                    >
                      {level.label}
                    </span>
                  ))}
                </div>
              </div>

              <Button
                type="submit"
                size="lg"
                className="h-11 shrink-0 px-6 text-base"
                disabled={!topic.trim() || (mcqCount === 0 && descriptiveCount === 0)}
              >
                <span className="flex items-center gap-2">
                  <SparklesIcon className="h-5 w-5" />
                  Generate Exam
                </span>
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

export default ExamSetup;
