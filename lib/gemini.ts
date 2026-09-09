import { GoogleGenAI, Type, FileState, createPartFromUri, createUserContent } from '@google/genai';
import type { GeneratedExam, EvaluationResult, MCQQuestion } from './types';
import {
  generatedExamSchema,
  evaluationResultSchema,
  mcqQuestionSchema,
  pdfExtractionResultSchema,
} from './validation';
import {
  buildGeneratePrompt,
  buildEvaluatePrompt,
  buildPdfExtractionPrompt,
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
  const resultsById = new Map(questionResults.map((r: any) => [r.id, r]));

  // Reconcile against the original exam so IDs/counts always match.
  const reconciled = exam.questions.map((q, i) => {
    const matched = resultsById.get(q.id) ?? questionResults[i];
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

// ---- PDF question-paper import (separate feature, additive only) ----
// Everything below is new and does not alter any of the generation/
// evaluation logic above. It reuses getClient(), MODEL, parseJsonLoose() and
// genId() from this same file. No retry loop here (unlike generateExam/
// evaluateExam) - a single request per PDF as required, and quota errors are
// classified and surfaced by the API route instead of being retried.

export interface PdfExtractionResult {
  exam: GeneratedExam;
  examName: string | null;
  year: string | null;
  /** True only if Gemini found and used an official answer key in the
   * source document; false means every correctAnswer was determined by
   * Gemini's own reasoning and should be treated with proportionally less
   * confidence than a source-verified answer. */
  hasAnswerKey: boolean;
  warnings: string[];
}

function buildPdfExtractionResponseSchema() {
  return {
    type: Type.OBJECT,
    properties: {
      title: { type: Type.STRING },
      examName: { type: Type.STRING },
      year: { type: Type.STRING },
      hasAnswerKey: { type: Type.BOOLEAN },
      questions: {
        type: Type.ARRAY,
        // NOTE: deliberately no minItems/maxItems - see the same note on
        // buildExamResponseSchema/buildEvaluationResponseSchema above.
        // Gemini's structured-output compiler rejects large arrays outright
        // once the constraint + item schema gets big enough, and PDF papers
        // here can have 150+ questions.
        items: {
          type: Type.OBJECT,
          properties: {
            number: { type: Type.NUMBER },
            questionHindi: { type: Type.STRING },
            questionEnglish: { type: Type.STRING },
            options: { type: Type.ARRAY, items: { type: Type.STRING } },
            correctAnswer: { type: Type.STRING },
            explanation: { type: Type.STRING },
          },
          required: ['options', 'correctAnswer', 'explanation'],
        },
      },
    },
    required: ['questions', 'hasAnswerKey'],
  };
}

function normalizePdfExtraction(loose: ReturnType<typeof pdfExtractionResultSchema.parse>): PdfExtractionResult {
  const warnings: string[] = [];
  const rawQuestions = loose.questions ?? [];

  const mcqs: MCQQuestion[] = [];
  for (let i = 0; i < rawQuestions.length; i++) {
    const q = rawQuestions[i];
    const label = q.number != null ? `Question ${q.number}` : `Question at position ${i + 1}`;

    const hindi = (q.questionHindi ?? '').trim();
    const english = (q.questionEnglish ?? '').trim();
    const questionText = [english, hindi].filter(Boolean).join(' | ');
    if (!questionText) {
      warnings.push(`${label} skipped: no question text could be extracted.`);
      continue;
    }

    const options = (q.options ?? []).map((o) => o.trim()).filter(Boolean);
    if (options.length !== 4) {
      warnings.push(`${label} skipped: expected exactly 4 options, found ${options.length}.`);
      continue;
    }

    const correctAnswer = (q.correctAnswer ?? '').trim();
    if (!correctAnswer || !options.includes(correctAnswer)) {
      warnings.push(`${label} skipped: extracted answer did not match any option verbatim.`);
      continue;
    }

    const candidate = {
      id: genId('pyq', mcqs.length),
      type: 'mcq' as const,
      question: questionText,
      options,
      correctAnswer,
      explanation: (q.explanation ?? '').trim() || 'No explanation was available for this question.',
      marks: 1,
      // Rounded defensively so a stray floating-point artifact from the AI
      // can never fail mcqQuestionSchema's `.int()` check and needlessly
      // discard an otherwise-valid question over a purely informational field.
      ...(typeof q.number === 'number' && Number.isFinite(q.number) ? { number: Math.round(q.number) } : {}),
    };

    const check = mcqQuestionSchema.safeParse(candidate);
    if (!check.success) {
      warnings.push(`${label} skipped: ${check.error.issues[0]?.message ?? 'failed validation'}.`);
      continue;
    }
    mcqs.push(check.data as MCQQuestion);
  }

  if (mcqs.length === 0) {
    throw new Error('No valid MCQ questions could be extracted from this PDF.');
  }

  const totalMarks = mcqs.reduce((sum, q) => sum + q.marks, 0);
  const title = loose.title?.trim() || 'Imported Question Paper';
  const exam = {
    metadata: {
      title,
      description: 'Imported from a previous-year question paper PDF.',
      totalMarks,
      estimatedDurationMinutes: Math.max(10, mcqs.length),
      difficulty: 'Medium' as const,
      topic: loose.examName?.trim() || title,
    },
    questions: mcqs,
  };

  const validated = generatedExamSchema.parse(exam);
  return {
    exam: validated as GeneratedExam,
    examName: loose.examName?.trim() || null,
    year: loose.year?.trim() || null,
    hasAnswerKey: loose.hasAnswerKey ?? false,
    warnings,
  };
}

// Split into 3 independent, individually-short steps (upload / poll status /
// extract) instead of one long blocking call. This exists specifically so no
// single HTTP request needs to run anywhere close to a serverless platform's
// duration ceiling (e.g. Vercel Hobby's hard 60s cap) - the client polls
// status across several fast requests instead of the server blocking on one
// long one. Reliability note: the underlying @google/genai client already
// retries transient failures (network errors, 408/429/500/502/503/504) with
// exponential backoff by default (5 attempts) - no need to duplicate that.

export interface UploadedPdfFile {
  fileName: string;
}

/** Step 1: upload the PDF to Gemini's Files API. Typically fast (seconds),
 * bounded mainly by the file's own size/bandwidth, not by AI processing. */
export async function uploadPdfToGemini(pdfBuffer: Buffer, filename: string): Promise<UploadedPdfFile> {
  const client = getClient();
  const blob = new Blob([new Uint8Array(pdfBuffer)], { type: 'application/pdf' });
  const uploaded = await client.files.upload({
    file: blob,
    config: { mimeType: 'application/pdf', displayName: filename },
  });
  if (!uploaded.name) throw new Error('Gemini did not return a file reference for the upload.');
  return { fileName: uploaded.name };
}

export type PdfFileState = 'PROCESSING' | 'ACTIVE' | 'FAILED' | 'UNKNOWN';

/** Step 2: a single, near-instant status check (no internal waiting/polling
 * loop) - the caller (the API route, driven by the client) is responsible
 * for calling this repeatedly until it returns ACTIVE or FAILED. */
export async function checkPdfFileStatus(fileName: string): Promise<PdfFileState> {
  const client = getClient();
  const file = await client.files.get({ name: fileName });
  if (file.state === FileState.ACTIVE) return 'ACTIVE';
  if (file.state === FileState.FAILED) return 'FAILED';
  if (file.state === FileState.PROCESSING) return 'PROCESSING';
  return 'UNKNOWN';
}

/** Step 3: once the file is ACTIVE, run the actual extraction. This is the
 * one step that cannot be split further (a single generateContent call), but
 * measured timings (10-25s for 20-80 questions) comfortably fit even a 60s
 * ceiling for realistic paper sizes since it's no longer sharing that budget
 * with upload/processing-wait time. Deletes the uploaded file afterward
 * either way (best-effort - Gemini also auto-expires files after 48h). */
export async function extractQuestionsFromUploadedPdf(fileName: string): Promise<PdfExtractionResult> {
  const client = getClient();
  try {
    const file = await client.files.get({ name: fileName });
    if (file.state !== FileState.ACTIVE) {
      throw new Error(`PDF is not ready for extraction yet (state: ${file.state ?? 'unknown'}).`);
    }
    if (!file.uri || !file.mimeType) {
      throw new Error('Gemini did not return a usable reference for the uploaded PDF.');
    }

    const prompt = buildPdfExtractionPrompt();
    const filePart = createPartFromUri(file.uri, file.mimeType);
    const contents = createUserContent([prompt, filePart]);

    const response = await client.models.generateContent({
      model: MODEL,
      contents,
      config: {
        responseMimeType: 'application/json',
        responseSchema: buildPdfExtractionResponseSchema(),
        temperature: 0.1, // faithful extraction, not creative generation
      },
    });

    const text = response.text ?? '';
    if (!text) throw new Error('Empty response from AI while reading the PDF.');

    const parsed = parseJsonLoose<unknown>(text);
    const loose = pdfExtractionResultSchema.parse(parsed);
    return normalizePdfExtraction(loose);
  } finally {
    client.files.delete({ name: fileName }).catch(() => {});
  }
}
