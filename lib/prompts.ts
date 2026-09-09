import type { GeneratedExam } from './types';

const EXPANSION_GUIDE = [
  'STRICT (expansion 0-20): Only questions directly about the exact requested topic. No tangents.',
  'MODERATE (expansion 21-50): Mostly the exact topic, plus a few prerequisite or foundational concepts a candidate must know.',
  'BROAD (expansion 51-80): The exact topic, prerequisites, advanced applications, related theories, edge cases, and interdisciplinary connections that remain directly relevant.',
  'EXPLORATORY (expansion 81-100): Everything above, plus real-world scenarios, analytical and applied questions, and higher-order synthesis - all still clearly connected to the requested subject.',
];

function expansionLabel(expansion: number): string {
  if (expansion <= 20) return 'STRICT';
  if (expansion <= 50) return 'MODERATE';
  if (expansion <= 80) return 'BROAD';
  return 'EXPLORATORY';
}

export function buildGeneratePrompt(config: {
  topic: string;
  mcqCount: number;
  descriptiveCount: number;
  difficulty: 'Easy' | 'Medium' | 'Hard' | 'Expert';
  expansion: number;
  avoidQuestions?: string[];
}): string {
  const { topic, mcqCount, descriptiveCount, difficulty, expansion, avoidQuestions } = config;
  const label = expansionLabel(expansion);

  const avoidSection =
    avoidQuestions && avoidQuestions.length > 0
      ? `\nPREVIOUSLY ASKED QUESTIONS FOR THIS TOPIC (do not repeat or closely rephrase any of these; cover different angles, sub-topics, or scenarios instead):\n${avoidQuestions.map((q) => `- ${q}`).join('\n')}\n`
      : '';

  return `You are an expert examination author and subject-matter specialist capable of creating assessments for ANY subject, topic, skill, or exam - academic, professional, technical, competitive, or custom. You adapt to the domain the user requests without relying on templates or hardcoded logic.

TASK
Generate a complete, original examination on the following request.

Topic / Subject: "${topic}"
Number of multiple-choice questions (MCQs): ${mcqCount}
Number of descriptive / paragraph questions: ${descriptiveCount}
Difficulty: ${difficulty}
Expansion / Context scope: ${expansion} (${label})

EXPANSION BEHAVIOR (applies to every possible subject)
${EXPANSION_GUIDE.join('\n')}
${avoidSection}
HARD RULES
1. Generate UNIQUE, non-repetitive, high-quality questions. Do not reuse generic stock questions. Vary phrasing, scenarios, and cognitive level.
2. Each MCQ must have EXACTLY 4 options, one correct answer, and a clear explanation of why it is correct.
3. The correct answer for MCQs must be one of the provided options verbatim.
4. Each descriptive question must include key points / marking criteria that a model answer should contain.
5. Assign appropriate marks per question (e.g. 1-2 for MCQs, 5-10 for descriptive). totalMarks must equal the sum of all question marks.
6. Estimate a realistic duration in minutes for the whole exam.
7. Produce a concise exam title and short description.
8. Every question needs a stable string "id" (e.g. "q1", "q2", ...).
9. If the requested counts are 0 for a type, simply omit that type.
10. Do NOT include HTML. Return JSON only.
11. If a "previously asked questions" list is provided above, treat it as off-limits: do not output any question that matches or is a minor variant of one in that list.

OUTPUT JSON SHAPE
{
  "metadata": {
    "title": string,
    "description": string,
    "totalMarks": number,
    "estimatedDurationMinutes": number,
    "difficulty": "Easy" | "Medium" | "Hard" | "Expert",
    "topic": string
  },
  "questions": [
    { "id": "q1", "type": "mcq", "question": string, "options": [string,string,string,string], "correctAnswer": string, "explanation": string, "marks": number },
    { "id": "q2", "type": "descriptive", "question": string, "keyPoints": [string,...], "marks": number }
  ]
}

Return ONLY the JSON object. No markdown, no commentary.`;
}

export function buildEvaluatePrompt(
  exam: GeneratedExam,
  answers: Record<string, string | null>,
): string {
  // We send the original exam JSON verbatim so the AI grades the exact exam
  // it created, preserving full context.
  const examJson = JSON.stringify(exam);
  const answersJson = JSON.stringify(answers);

  return `You are an experienced, rigorous examiner and teacher. You previously created the exam below. Now grade the candidate's submission for THAT exact exam.

ORIGINAL EXAM (JSON):
${examJson}

CANDIDATE ANSWERS (JSON, keyed by question id; null/empty means unanswered):
${answersJson}

GRADING INSTRUCTIONS
1. For each MCQ: mark it correct iff the candidate's selected option exactly matches the original correctAnswer. Show the correct answer and the explanation. Award full marks if correct, 0 if incorrect or unanswered.
2. For each descriptive question: evaluate the answer on accuracy, completeness, conceptual understanding, logical reasoning, structure, clarity, and depth. Identify what was correct (strengths), what was missing or wrong (weaknesses), provide an ideal/model answer, suggest specific improvements, and write a short feedback paragraph.
2a. HARD RULE - marks must match your own critique: if the "weaknesses" list for a question is non-empty (you identified ANY missing fact, omission, inaccuracy, or gap - e.g. a missing case name, date, article number, example, or step in the reasoning), marksAwarded MUST be strictly less than marksMax. Never list a flaw and then award full marks - that is a contradiction and is not acceptable. Only award full marks when weaknesses is genuinely empty because the answer is complete and precise with nothing left to add.
2b. Do not reward length or fluent writing on its own. A short, well-organized 4-5 line answer that only covers the general idea is NOT worth full marks merely for sounding correct - grade against how much of the ideal answer's substance (specific facts, examples, named cases/provisions, precision) is actually present. Roughly: full marks only for essentially complete and precise coverage; ~70-85% for a solid answer missing one specific, non-trivial detail; ~40-65% for a generally correct but noticeably incomplete or vague answer; below 40% for thin, generic, or mostly-filler answers; 0 for unanswered or off-topic.
3. Compute totalMarksAwarded = sum of marksAwarded across all questions, and totalMarksMax = sum of all question max marks (must match the original exam's totalMarks).
4. Compute percentage = round((totalMarksAwarded / totalMarksMax) * 1000) / 10.
5. Assign a letter grade: A+ (>=90), A (>=80), B (>=70), C (>=60), D (>=50), F (<50).
6. Write an overall performanceAnalysis paragraph.
7. List overall strengths and weaknesses across the whole exam.
8. Generate actionable study recommendations tailored to this candidate's performance.

OUTPUT JSON SHAPE
{
  "examTitle": string,
  "totalMarksAwarded": number,
  "totalMarksMax": number,
  "percentage": number,
  "grade": string,
  "performanceAnalysis": string,
  "strengths": [string],
  "weaknesses": [string],
  "recommendations": [string],
  "questionResults": [
    { "id": string, "type": "mcq", "userAnswer": string|null, "correct": boolean, "correctAnswer": string, "explanation": string, "marksAwarded": number, "marksMax": number },
    { "id": string, "type": "descriptive", "userAnswer": string, "idealAnswer": string, "strengths": [string], "weaknesses": [string], "improvements": [string], "feedback": string, "marksAwarded": number, "marksMax": number }
  ]
}

The questionResults array must contain one entry per question in the original exam, in the same order. Return ONLY the JSON object. No markdown, no commentary.`;
}

// ---- PDF question-paper import (separate feature, additive only) ----

export function buildPdfExtractionPrompt(): string {
  return `You are extracting questions from a previous-year examination paper PDF.

The PDF may be a normal digital document with selectable text, or it may be a scanned document where every page is effectively an image with no text layer at all - you are not told which in advance. Handle both correctly: if a text layer exists, use it for accuracy; if a page is scanned/image-based, read it visually like a human would. Every page must be read in full either way - never skip a page because it looks image-based.

Extract EVERY actual question from the paper. The paper contains MCQ (multiple-choice) questions only.

Ignore general exam instructions, headings, page numbers, decorative text, and other non-question content. Focus on the actual questions regardless of where they appear on a page - do not assume questions only appear in a particular position.

Preserve the original question wording as accurately as possible. Do NOT change, rewrite, summarize, simplify, or modify the original questions.

Do not solve the questions beyond determining the correct option (see ANSWER KEY rule below). Do not create new questions. Do not skip questions.

For every question:
- Preserve the original question number if printed.
- Extract Hindi text when present (questionHindi).
- Extract English text when present (questionEnglish). A question may have only one language present - that is fine, leave the other blank.
- Extract every answer option in order, as an array of plain strings (without leading "A.", "1)", etc. labels).
- Preserve mathematical expressions, symbols, units, and formulas exactly as written (plain text/unicode, no LaTeX).
- Preserve tables when they are part of a question by describing them as clear structured text within the question.
- Preserve information from diagrams when necessary to understand a question, by describing the relevant diagram content in the question text.
- Preserve important formatting and context (e.g. "assertion/reason" pairs, passage-based question groups, or "which of the following" style lead-ins) as part of the question text.
- If a question continues onto another page, combine it correctly into one entry.
- Do not treat exam instructions, section headings, or page numbers as questions.
- Do not guess missing text. If something is genuinely unreadable, mark that part as [UNCLEAR].

ANSWER KEY
- First, check the ENTIRE document (including the last pages) for an official answer key.
- If an official answer key exists and covers a question, use it as ground truth for that question: set "correctAnswer" to the exact text of the option it points to, and write a brief "explanation" of why that option is correct.
- If an answer key exists but only covers SOME questions (a partial key), use it for the questions it covers, and apply the rigorous self-reasoning process below only for the remaining questions it does not cover.
- Set the top-level "hasAnswerKey" field to true if you found and used an official answer key for at least one question (including a partial key), and false only if the document contains no answer key at all and every "correctAnswer" was determined by your own reasoning.
- For any question NOT covered by an official answer key, you must determine the correct option yourself - but do this rigorously, not as a quick guess:
  1. Read the question carefully and restate to yourself what it is actually asking.
  2. Evaluate each of the 4 options individually against your own verified subject-matter knowledge - for each option, judge specifically whether it is correct or incorrect and why.
  3. Eliminate options you are confident are wrong before settling on the one you are confident is right.
  4. Only select an option you have high confidence in from verified knowledge. Do not pick an option merely because it "sounds right" or is the most detailed-sounding choice.
  5. Write the "explanation" as the specific fact or reasoning that makes your chosen option correct (not a vague restatement of the question).
  This applies per-question - some questions in a paper without a general answer key may still be ones you are less certain about; still give your single best, most rigorously-reasoned answer for every question. Never leave "correctAnswer" blank.
- "correctAnswer" must always be the exact text of one of the options, verbatim.

PAPER METADATA
- Determine "title", "examName" (e.g. the name of the exam this paper is from), and "year" from the paper itself where visible (e.g. a cover page, header, or footer). Leave a field blank rather than guessing if it is not clearly stated.

Return ONLY valid JSON, using exactly this shape:
{
  "title": string,
  "examName": string,
  "year": string,
  "hasAnswerKey": boolean,
  "questions": [
    {
      "number": number,
      "questionHindi": string,
      "questionEnglish": string,
      "options": [string, ...],
      "correctAnswer": string,
      "explanation": string
    }
  ]
}

Make sure every MCQ in the paper is included exactly once, in order. There is no limit on the number of questions - extract all of them, whether there are 10 or 200. Return ONLY the JSON object. No markdown, no commentary.`;
}
