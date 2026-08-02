import { supabase } from './supabase';
import type { ExamHistoryItem, GeneratedExam } from './types';

export async function fetchExamHistory(limit = 50): Promise<ExamHistoryItem[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('exam_history')
    .select('id, topic, difficulty, mcq_count, descriptive_count, status, created_at, evaluated_at, evaluation')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error || !data) return [];
  return data as ExamHistoryItem[];
}

/** Deletes an exam_history row. question_embeddings for it are removed
 * automatically via ON DELETE CASCADE on exam_history_id. */
export async function deleteExamHistoryItem(id: string): Promise<boolean> {
  if (!supabase) return false;
  const { error } = await supabase.from('exam_history').delete().eq('id', id);
  return !error;
}

/** Fetches the full stored exam for one history row - only the columns the
 * list view needs are fetched upfront; this pulls the (larger) exam JSON on
 * demand, e.g. when resuming an unfinished attempt. */
export async function fetchExamById(id: string): Promise<GeneratedExam | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.from('exam_history').select('exam').eq('id', id).single();
  if (error || !data) return null;
  return data.exam as GeneratedExam;
}
