import { Type } from "@google/genai";

export interface WordExplanation {
  word: string;
  reading: string;
  meaning: string;
  category: string;
}

export interface GrammarPoint {
  point: string;
  explanation: string;
}

export interface SentenceExplanation {
  grammar: GrammarPoint[];
  vocabulary: WordExplanation[];
}

export interface Subtitle {
  timestamp: string;
  text: string;
  isLearned?: boolean;
}

export interface VideoData {
  id: string;
  name: string;
  transcription: Subtitle[];
  created_at: string;
}

export interface ArchiveEntry {
  id: number;
  video_id: string;
  timestamp: string;
  content: SentenceExplanation;
  created_at: string;
}
