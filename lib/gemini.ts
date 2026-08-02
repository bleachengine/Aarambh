import { GoogleGenAI, Type } from '@google/genai';
import type { GeneratedExam, EvaluationResult } from './types';
import {
  generatedExamSchema,
  evaluationResultSchema,
} from './validation';
import {
  buildGeneratePrompt,
  buildEvaluatePrompt,
} from './prompts';

const API_KEY = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;

export const isGeminiConfigured = (): boolean => Boolean(API_KEY);

const MODEL = 'gemini-flash-lite-latest';

function getClient(): GoogleGenAI {
  if (!API_KEY) throw new Error('Gemini API key is not configured.');
  return new GoogleGenAI({ apiKey: API_KEY });
}


function buildExamResponseSchema() {
  return {
  type: Type.OBJECT,
  properties: {
    metadata: {
      type: Type.OBJECT,
      properties: {
        title: { type: Type.STRING },
        description: { type: Type.STRING },
        totalMarks: { type: Type.NUMBER },
        estimatedDurationMinutes: { type: Type.NUMBER },
        difficulty: { type: Type.STRING, enum: ['Easy', 'Medium', 'Hard', 'Expert'] },
        topic: { type: Type.STRING },
      },
      required: ['title', 'description', 'totalMarks', 'estimatedDurationMinutes', 'difficulty', 'topic'],
    },
    questions: {
      type: Type.ARRAY,
      // NOTE: minItems/maxItems here used to force an exact count, but
      // Gemini's structured-output compiler rejects the request outright
      // (400 INVALID_ARGUMENT) once the array + anyOf item schema gets large
      // enough (confirmed failing at 60 questions, working with them
      // removed). The prompt still explicitly asks for the exact count, and
      // generatedExamSchema (zod) already tolerates any count >= 1, so this
      // just makes actual behavior match what was already validated.
      items: {
        anyOf: [
          {
            type: Type.OBJECT,
            properties: {
              id: { type: Type.STRING },
              type: { type: Type.STRING, enum: ['mcq'] },
              question: { type: Type.STRING },
              options: { type: Type.ARRAY, items: { type: Type.STRING } },
              correctAnswer: { type: Type.STRING },
              explanation: { type: Type.STRING },
              marks: { type: Type.NUMBER },
            },
            required: ['id', 'type', 'question', 'options', 'correctAnswer', 'explanation', 'marks'],
          },
          {
            type: Type.OBJECT,
            properties: {
              id: { type: Type.STRING },
              type: { type: Type.STRING, enum: ['descriptive'] },
              question: { type: Type.STRING },
              keyPoints: { type: Type.ARRAY, items: { type: Type.STRING } },
              marks: { type: Type.NUMBER },
            },
            required: ['id', 'type', 'question', 'keyPoints', 'marks'],
          },
        ],
      },
    },
  },
  required: ['metadata', 'questions'],
  };
}

function buildEvaluationResponseSchema() {
  return {
  type: Type.OBJECT,
  properties: {
    examTitle: { type: Type.STRING },
    totalMarksAwarded: { type: Type.NUMBER },
    totalMarksMax: { type: Type.NUMBER },
    percentage: { type: Type.NUMBER },
    grade: { type: Type.STRING },
    performanceAnalysis: { type: Type.STRING },
    strengths: { type: Type.ARRAY, items: { type: Type.STRING } },
    weaknesses: { type: Type.ARRAY, items: { type: Type.STRING } },
    recommendations: { type: Type.ARRAY, items: { type: Type.STRING } },
    questionResults: {
      type: Type.ARRAY,
      // NOTE: minItems/maxItems here used to force an exact count, but
      // Gemini's structured-output compiler rejects the request outright
      // (400 INVALID_ARGUMENT) once the array + anyOf item schema gets large
      // enough (confirmed failing at 22 questions, working with them removed).
      // normalizeEvaluation() already reconciles against exam.questions by id
      // with an index fallback, so an incomplete AI response degrades
      // gracefully instead of the whole request failing.
      items: {
        anyOf: [
          {
            type: Type.OBJECT,
            properties: {
              id: { type: Type.STRING },
              type: { type: Type.STRING, enum: ['mcq'] },
              correctAnswer: { type: Type.STRING },
              explanation: { type: Type.STRING },
              marksAwarded: { type: Type.NUMBER },
              marksMax: { type: Type.NUMBER },
            },
            required: ['id', 'type', 'correctAnswer', 'explanation', 'marksAwarded', 'marksMax'],
          },
          {
            type: Type.OBJECT,
            properties: {
              id: { type: Type.STRING },
              type: { type: Type.STRING, enum: ['descriptive'] },
              idealAnswer: { type: Type.STRING },
              strengths: { type: Type.ARRAY, items: { type: Type.STRING } },
              weaknesses: { type: Type.ARRAY, items: { type: Type.STRING } },
              improvements: { type: Type.ARRAY, items: { type: Type.STRING } },
              feedback: { type: Type.STRING },
              marksAwarded: { type: Type.NUMBER },
              marksMax: { type: Type.NUMBER },
            },
            required: ['id', 'type', 'idealAnswer', 'feedback', 'marksAwarded', 'marksMax'],
          },
        ],
      },
    },
  },
  required: ['examTitle', 'totalMarksAwarded', 'totalMarksMax', 'percentage', 'grade', 'performanceAnalysis', 'strengths', 'weaknesses', 'recommendations', 'questionResults'],
  };
}

/** Retrying a quota-exceeded call is pointless - it will fail again
 * immediately and just delays the error for no benefit. Only genuine
 * validation/parsing hiccups are worth retrying. */
function isQuotaExceededError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return message.includes('RESOURCE_EXHAUSTED') || message.includes('"code":429');
}

function stripFences(raw: string): string {
  let s = raw.trim();
  // Remove leading ```json or ``` and trailing ```
  if (s.startsWith('```')) {
    s = s.replace(/^```(?:json)?\s*/i, '');
    s = s.replace(/```\s*$/i, '');
  }
  return s.trim();
}

function parseJsonLoose<T>(text: string): T {
  const cleaned = stripFences(text);
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    // Try to locate the first { and last } as a last resort.
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start !== -1 && end !== -1 && end > start) {
      return JSON.parse(cleaned.slice(start, end + 1)) as T;
    }
    throw new Error('AI returned a response that could not be parsed as JSON.');
  }
}

export async function generateExam(
  config: {
    topic: string;
    mcqCount: number;
    descriptiveCount: number;
    difficulty: 'Easy' | 'Medium' | 'Hard' | 'Expert';
    expansion: number;
    avoidQuestions?: string[];
  },
  maxRetries = 2,
): Promise<GeneratedExam> {
  const client = getClient();
  const prompt = buildGeneratePrompt(config);
  const responseSchema = buildExamResponseSchema();

  let lastError: unknown;
  let attemptsMade = 0;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    attemptsMade++;
    try {
      const response = await client.models.generateContent({
        model: MODEL,
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
          responseSchema,
          temperature: 0.9, // encourage unique questions across runs
        },
      });

      const text = response.text ?? '';
      if (!text) throw new Error('Empty response from AI.');

      const parsed = parseJsonLoose<unknown>(text);
      const normalized = normalizeExam(parsed, config);
      const validated = generatedExamSchema.parse(normalized);
      return validated as GeneratedExam;
    } catch (err) {
      lastError = err;
      if (isQuotaExceededError(err)) break; // retrying won't help - fail fast
    }
  }
  throw new Error(
    `Failed to generate a valid exam after ${attemptsMade} attempt(s). ${
      lastError instanceof Error ? lastError.message : ''
    }`.trim(),
  );
}

export async function evaluateExam(
  exam: GeneratedExam,
  answers: Record<string, string | null>,
  maxRetries = 2,
): Promise<EvaluationResult> {
  const client = getClient();
  const prompt = buildEvaluatePrompt(exam, answers);
  const responseSchema = buildEvaluationResponseSchema();

  let lastError: unknown;
  let attemptsMade = 0;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    attemptsMade++;
    try {
      const response = await client.models.generateContent({
        model: MODEL,
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
          responseSchema,
          temperature: 0.2, // deterministic grading
        },
      });

      const text = response.text ?? '';
      if (!text) throw new Error('Empty response from AI.');

      const parsed = parseJsonLoose<unknown>(text);
      const normalized = normalizeEvaluation(parsed, exam, answers);
      const validated = evaluationResultSchema.parse(normalized);
      return validated as EvaluationResult;
    } catch (err) {
      lastError = err;
      if (isQuotaExceededError(err)) break; // retrying won't help - fail fast
    }
  }
  throw new Error(
    `Failed to evaluate the exam after ${attemptsMade} attempt(s). ${
      lastError instanceof Error ? lastError.message : ''
    }`.trim(),
  );
}

function genId(prefix: string, i: number): string {
  return `${prefix}-${i + 1}`;
}

function normalizeExam(raw: unknown, config: { difficulty: string; topic: string }): unknown {
  const obj = (raw ?? {}) as Record<string, any>;
  const metadata = obj.metadata ?? {};
  const questions = Array.isArray(obj.questions) ? obj.questions : [];

  const normalizedQuestions = questions.map((q: any, i: number) => {
    const type = q.type === 'descriptive' ? 'descriptive' : 'mcq';
    if (type === 'mcq') {
      return {
        id: q.id ?? genId('q', i),
        type: 'mcq',
        question: q.question ?? '',
        options: Array.isArray(q.options) ? q.options : [],
        correctAnswer: q.correctAnswer ?? '',
        explanation: q.explanation ?? '',
        marks: q.marks ?? 1,
      };
    }
    return {
      id: q.id ?? genId('q', i),
      type: 'descriptive',
      question: q.question ?? '',
      keyPoints: Array.isArray(q.keyPoints) ? q.keyPoints : [],
      marks: q.marks ?? 5,
    };
  });

  // Compute totalMarks ourselves rather than trusting the AI's self-reported
  // figure - it must always equal the actual sum of question marks.
  const totalMarks = normalizedQuestions.reduce((sum: number, q: any) => sum + (Number(q.marks) || 0), 0);

  return {
    metadata: {
      title: metadata.title ?? `Exam: ${config.topic}`,
      description: metadata.description ?? '',
      totalMarks,
      estimatedDurationMinutes: metadata.estimatedDurationMinutes ?? 30,
      difficulty: metadata.difficulty ?? config.difficulty,
      topic: metadata.topic ?? config.topic,
    },
    questions: normalizedQuestions,
  };
}

function normalizeEvaluation(raw: unknown, exam: GeneratedExam, answers: Record<string, string | null>): unknown {
  const obj = (raw ?? {}) as Record<string, any>;
  const questionResults = Array.isArray(obj.questionResults) ? obj.questionResults : [];

  // Reconcile against the original exam so IDs/counts always match.
  const reconciled = exam.questions.map((q, i) => {
    const matched = questionResults.find((r: any) => r.id === q.id) ?? questionResults[i];
    const userAnswer = answers[q.id] ?? null;
    if (q.type === 'mcq') {
      // MCQ correctness is a deterministic string comparison we can compute
      // ourselves - never trust the AI's judgment for this over ground truth.
      const correct = userAnswer != null && userAnswer === q.correctAnswer;
      return {
        id: q.id,
        type: 'mcq',
        userAnswer,
        correct,
        correctAnswer: q.correctAnswer,
        explanation: matched?.explanation ?? q.explanation,
        marksAwarded: correct ? q.marks : 0,
        marksMax: q.marks,
      };
    }
    const weaknesses = Array.isArray(matched?.weaknesses) ? matched.weaknesses : [];
    const rawMarksAwarded = Math.max(0, Math.min(q.marks, Number(matched?.marksAwarded ?? 0)));
    // Safety net for the prompt's "don't list a flaw and still award full
    // marks" rule: the AI won't always follow it perfectly, so if it names a
    // specific weakness yet still gave full marks, cap it at 90% here rather
    // than trust that contradiction.
    const marksAwarded =
      weaknesses.length > 0 && rawMarksAwarded >= q.marks
        ? Math.min(rawMarksAwarded, Math.floor(q.marks * 0.9))
        : rawMarksAwarded;
    return {
      id: q.id,
      type: 'descriptive',
      userAnswer: userAnswer ?? '',
      idealAnswer: matched?.idealAnswer ?? '',
      strengths: Array.isArray(matched?.strengths) ? matched.strengths : [],
      weaknesses,
      improvements: Array.isArray(matched?.improvements) ? matched.improvements : [],
      feedback: matched?.feedback ?? '',
      marksAwarded,
      marksMax: q.marks,
    };
  });

  const totalMarksMax = exam.metadata.totalMarks;
  const totalMarksAwarded = reconciled.reduce(
    (sum: number, r: any) => sum + (Number(r.marksAwarded) || 0),
    0,
  );
  const percentage = totalMarksMax > 0 ? Math.round((totalMarksAwarded / totalMarksMax) * 1000) / 10 : 0;

  return {
    examTitle: obj.examTitle ?? exam.metadata.title,
    totalMarksAwarded,
    totalMarksMax,
    percentage,
    grade: obj.grade ?? gradeFor(percentage),
    performanceAnalysis: obj.performanceAnalysis ?? '',
    strengths: Array.isArray(obj.strengths) ? obj.strengths : [],
    weaknesses: Array.isArray(obj.weaknesses) ? obj.weaknesses : [],
    recommendations: Array.isArray(obj.recommendations) ? obj.recommendations : [],
    questionResults: reconciled,
  };
}

function gradeFor(pct: number): string {
  if (pct >= 90) return 'A+';
  if (pct >= 80) return 'A';
  if (pct >= 70) return 'B';
  if (pct >= 60) return 'C';
  if (pct >= 50) return 'D';
  return 'F';
}
