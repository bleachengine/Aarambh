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
