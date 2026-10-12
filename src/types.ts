export type View = 'all' | 'authors' | 'videos' | 'resources' | 'insights' | 'collection';
export type Tone = 'violet' | 'coral' | 'mint' | 'blue' | 'amber' | 'rose';
export interface Bookmark {
  id: string;
  url: string;
  title: string;
  author: string;
  source: string;
  category: string;
  description: string;
  notes: string;
  tags: string[];
  ai_summary: string;
  color: Tone;
  demo: number;
  created_at: string;
  updated_at: string;
}
export interface ModelInfo {
  id: string;
  name: string;
  context_length: number;
  pricing?: { prompt?: string; completion?: string };
  architecture?: { input_modalities?: string[]; output_modalities?: string[] };
  supported_parameters?: string[];
}
export interface ModelTest { elapsed_ms?: number; error?: string; reply?: string; }
export const CATEGORIES = ['Все находки', 'AI & Разработка', 'Дизайн & UI', 'Маркетинг', 'Идеи', 'Полезные инструменты'];
export const TONES: Tone[] = ['violet', 'coral', 'mint', 'blue', 'amber', 'rose'];
