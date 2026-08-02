import { GoogleGenAI } from '@google/genai';

const API_KEY = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
const EMBEDDING_MODEL = 'gemini-embedding-001';
const EMBEDDING_DIMENSIONS = 768;

function getClient(): GoogleGenAI {
  if (!API_KEY) throw new Error('Gemini API key is not configured.');
  return new GoogleGenAI({ apiKey: API_KEY });
}

/** Embeds all given texts in a single API call. Order matches the input order. */
export async function embedTexts(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];
  const client = getClient();
  const response = await client.models.embedContent({
    model: EMBEDDING_MODEL,
    contents: texts,
    config: {
      taskType: 'SEMANTIC_SIMILARITY',
      outputDimensionality: EMBEDDING_DIMENSIONS,
    },
  });
  return (response.embeddings ?? []).map((e) => e.values ?? []);
}
