export type Difficulty = 'Easy' | 'Medium' | 'Hard' | 'Expert';

export interface MCQQuestion {
  id: string;
  type: 'mcq';
  question: string;
  options: string[];
  correctAnswer: string;
  explanation: string;
  marks: number;
  /** Optional - the question's original printed number, when known (e.g.
   * from an imported PDF paper). Undefined for AI-generated exams. */
  number?: number;
}

export interface DescriptiveQuestion {
  id: string;
  type: 'descriptive';
  question: string;
  keyPoints: string[];
  marks: number;
}

export type ExamQuestion = MCQQuestion | DescriptiveQuestion;

export interface ExamMetadata {
  title: string;
  description: string;
  totalMarks: number;
  estimatedDurationMinutes: number;
  difficulty: Difficulty;
  topic: string;
}

export interface GeneratedExam {
  metadata: ExamMetadata;
  questions: ExamQuestion[];
}

// ---- Evaluation ----

export interface MCQEvaluation {
  id: string;
  type: 'mcq';
  userAnswer: string | null;
  correct: boolean;
  correctAnswer: string;
  explanation: string;
  marksAwarded: number;
  marksMax: number;
}

export interface DescriptiveEvaluation {
  id: string;
  type: 'descriptive';
  userAnswer: string;
  idealAnswer: string;
  strengths: string[];
  weaknesses: string[];
  improvements: string[];
  feedback: string;
  marksAwarded: number;
  marksMax: number;
}

export type QuestionEvaluation = MCQEvaluation | DescriptiveEvaluation;

export interface EvaluationResult {
  examTitle: string;
  totalMarksAwarded: number;
  totalMarksMax: number;
  percentage: number;
  grade: string;
  performanceAnalysis: string;
  strengths: string[];
  weaknesses: string[];
  recommendations: string[];
  questionResults: QuestionEvaluation[];
}

export interface ExamHistoryItem {
  id: string;
  topic: string;
  difficulty: Difficulty;
  mcq_count: number;
  descriptive_count: number;
  status: 'generated' | 'evaluated';
  created_at: string;
  evaluated_at: string | null;
  evaluation: EvaluationResult | null;
}

export interface ApiError {
  error: string;
  details?: string;
}

// ---- Previous-Year Question Paper import (separate feature, additive only) ----

/** A reusable paper template extracted from an uploaded PDF. `exam` is the
 * exact same GeneratedExam shape used everywhere else, so it can be started
 * as an attempt (a fresh exam_history row) with zero changes to the existing
 * exam runner/evaluation pipeline. */
export interface PYQPaper {
  id: string;
  title: string;
  exam_name: string | null;
  year: string | null;
  description: string | null;
  question_count: number;
  source_filename: string | null;
  /** True if an official answer key was found in the source PDF and used;
   * false means every correctAnswer was determined by Gemini itself. */
  has_answer_key: boolean;
  exam: GeneratedExam;
  created_at: string;
}
