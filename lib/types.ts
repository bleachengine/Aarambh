export type Difficulty = 'Easy' | 'Medium' | 'Hard' | 'Expert';

export interface MCQQuestion {
  id: string;
  type: 'mcq';
  question: string;
  options: string[];
  correctAnswer: string;
  explanation: string;
  marks: number;
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
