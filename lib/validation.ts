import { z } from 'zod';

const difficultySchema = z.enum(['Easy', 'Medium', 'Hard', 'Expert']);

export const mcqQuestionSchema = z.object({
  id: z.string(),
  type: z.literal('mcq'),
  question: z.string().min(1),
  options: z.array(z.string().min(1)).length(4),
  correctAnswer: z.string().min(1),
  explanation: z.string().min(1),
  marks: z.number().int().positive(),
  // Optional - only ever set for imported PDF papers (see lib/gemini.ts
  // normalizePdfExtraction). AI-generated exams simply omit it, which zod
  // treats as valid, so this is fully backward-compatible.
  number: z.number().int().optional(),
});

export const descriptiveQuestionSchema = z.object({
  id: z.string(),
  type: z.literal('descriptive'),
  question: z.string().min(1),
  keyPoints: z.array(z.string().min(1)).min(1),
  marks: z.number().int().positive(),
});

export const examQuestionSchema = z.discriminatedUnion('type', [
  mcqQuestionSchema,
  descriptiveQuestionSchema,
]);

export const examMetadataSchema = z.object({
  title: z.string().min(1),
  description: z.string(),
  totalMarks: z.number().int().positive(),
  estimatedDurationMinutes: z.number().int().positive(),
  difficulty: difficultySchema,
  topic: z.string().min(1),
});

export const generatedExamSchema = z.object({
  metadata: examMetadataSchema,
  questions: z.array(examQuestionSchema).min(1),
});

export const mcqEvaluationSchema = z.object({
  id: z.string(),
  type: z.literal('mcq'),
  userAnswer: z.string().nullable(),
  correct: z.boolean(),
  correctAnswer: z.string().min(1),
  explanation: z.string().min(1),
  marksAwarded: z.number().min(0),
  marksMax: z.number().int().positive(),
});

export const descriptiveEvaluationSchema = z.object({
  id: z.string(),
  type: z.literal('descriptive'),
  userAnswer: z.string(),
  idealAnswer: z.string().min(1),
  strengths: z.array(z.string()),
  weaknesses: z.array(z.string()),
  improvements: z.array(z.string()),
  feedback: z.string().min(1),
  marksAwarded: z.number().min(0),
  marksMax: z.number().int().positive(),
});

export const questionEvaluationSchema = z.discriminatedUnion('type', [
  mcqEvaluationSchema,
  descriptiveEvaluationSchema,
]);

export const evaluationResultSchema = z.object({
  examTitle: z.string().min(1),
  totalMarksAwarded: z.number().min(0),
  totalMarksMax: z.number().int().positive(),
  percentage: z.number().min(0).max(100),
  grade: z.string().min(1),
  performanceAnalysis: z.string().min(1),
  strengths: z.array(z.string()),
  weaknesses: z.array(z.string()),
  recommendations: z.array(z.string()),
  questionResults: z.array(questionEvaluationSchema).min(1),
});

export const examConfigSchema = z.object({
  topic: z.string().trim().min(2).max(300),
  mcqCount: z.number().int().min(0).max(30),
  descriptiveCount: z.number().int().min(0).max(10),
  difficulty: difficultySchema,
  expansion: z.number().min(0).max(100),
});

export const submittedAnswersSchema = z.record(z.string(), z.string().nullable());

// ---- PDF question-paper import (separate feature, additive only) ----
// Deliberately loose: this validates Gemini's raw PDF-extraction output
// before it gets normalized and re-validated against the existing, strict
// `generatedExamSchema` above - mirrors how normalizeExam() already handles
// the raw generation response defensively before final validation.

export const pdfExtractedQuestionSchema = z.object({
  number: z.number().optional(),
  questionHindi: z.string().optional(),
  questionEnglish: z.string().optional(),
  options: z.array(z.string()).optional(),
  correctAnswer: z.string().optional(),
  explanation: z.string().optional(),
});

export const pdfExtractionResultSchema = z.object({
  title: z.string().optional(),
  examName: z.string().optional(),
  year: z.string().optional(),
  hasAnswerKey: z.boolean().optional(),
  questions: z.array(pdfExtractedQuestionSchema).optional(),
});
