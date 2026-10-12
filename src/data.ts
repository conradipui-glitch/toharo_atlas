import Database from '@tauri-apps/plugin-sql';
import { isTauri } from '@tauri-apps/api/core';
import type { Bookmark } from './types';

const DB_PATH = 'sqlite:atlas.db';
const LOCAL_KEY = 'toharo.atlas.bookmarks.v1';
const PREF_PREFIX = 'toharo.atlas.prefs.';
let dbPromise: Promise<Database> | undefined;

function database(): Promise<Database> {
  if (!dbPromise) dbPromise = Database.load(DB_PATH);
  return dbPromise;
}

export const desktop = isTauri();

function parseBookmark(value: unknown): Bookmark {
  const item = value as Record<string, unknown>;
  let tags: string[] = [];
  try { tags = Array.isArray(item.tags) ? item.tags as string[] : JSON.parse(String(item.tags || '[]')); }
  catch { tags = []; }
  return { ...(item as unknown as Bookmark), tags };
}

function browserRead(): Bookmark[] {
  try { return (JSON.parse(localStorage.getItem(LOCAL_KEY) || '[]') as unknown[]).map(parseBookmark); }
  catch { return []; }
}

export async function loadBookmarks(): Promise<Bookmark[]> {
  if (!desktop) return browserRead().sort((a, b) => b.created_at.localeCompare(a.created_at));
  const db = await database();
  const rows = await db.select<Record<string, unknown>[]>('SELECT * FROM bookmarks ORDER BY created_at DESC');
  return rows.map(parseBookmark);
}

export async function saveBookmark(item: Bookmark): Promise<void> {
  if (!desktop) {
    const all = browserRead().filter(b => b.id !== item.id && b.url !== item.url);
    localStorage.setItem(LOCAL_KEY, JSON.stringify([item, ...all]));
    return;
  }
  const db = await database();
  await db.execute(
    'INSERT INTO bookmarks (id,url,title,author,source,category,description,notes,tags,ai_summary,color,demo,created_at,updated_at) ' +
    'VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) ' +
    'ON CONFLICT(id) DO UPDATE SET url=excluded.url,title=excluded.title,author=excluded.author,source=excluded.source,' +
    'category=excluded.category,description=excluded.description,notes=excluded.notes,tags=excluded.tags,' +
    'ai_summary=excluded.ai_summary,color=excluded.color,demo=excluded.demo,updated_at=excluded.updated_at',
    [item.id,item.url,item.title,item.author,item.source,item.category,item.description,item.notes,
     JSON.stringify(item.tags),item.ai_summary,item.color,item.demo,item.created_at,item.updated_at]
  );
}

export async function deleteBookmark(id: string): Promise<void> {
  if (!desktop) { localStorage.setItem(LOCAL_KEY, JSON.stringify(browserRead().filter(b => b.id !== id))); return; }
  (await database()).execute('DELETE FROM bookmarks WHERE id = $1', [id]);
}

export async function deleteDemoBookmarks(): Promise<void> {
  if (!desktop) { localStorage.setItem(LOCAL_KEY, JSON.stringify(browserRead().filter(b => !b.demo))); return; }
  await (await database()).execute('DELETE FROM bookmarks WHERE demo = 1');
}

export async function getPref(key: string, fallback = ''): Promise<string> {
  if (!desktop) return localStorage.getItem(PREF_PREFIX + key) ?? fallback;
  const rows = await (await database()).select<{value: string}[]>('SELECT value FROM preferences WHERE key = $1', [key]);
  return rows[0]?.value ?? fallback;
}

export async function setPref(key: string, value: string): Promise<void> {
  if (!desktop) { localStorage.setItem(PREF_PREFIX + key, value); return; }
  await (await database()).execute(
    'INSERT INTO preferences(key,value) VALUES($1,$2) ON CONFLICT(key) DO UPDATE SET value=excluded.value',
    [key,value]
  );
}

export function classifySource(link: string): string {
  const host = new URL(link).hostname.toLowerCase();
  if (host.includes('instagram.com')) return 'Instagram';
  if (host.includes('youtube.com') || host.includes('youtu.be')) return 'YouTube';
  if (host.includes('github.com')) return 'GitHub';
  if (host.includes('tiktok.com')) return 'TikTok';
  return 'Сайт';
}

export function normalizeUrl(raw: string): string {
  const supplied = raw.trim();
  const url = new URL(/^https?:\/\//i.test(supplied) ? supplied : 'https://' + supplied);
  if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new Error('Допустимы только http и https');
  if (!url.hostname.includes('.')) throw new Error('Некорректный адрес');
  url.hash = '';
  return url.toString();
}

const samples = [
  ['https://www.figma.com/', 'Дизайн-системы и компоненты', 'Figma', 'Дизайн & UI', 'Сборка интерфейсов и дизайн-систем.', 'coral', ['UI', 'Компоненты']],
  ['https://openrouter.ai/', 'Каталог AI-моделей и API', 'OpenRouter', 'AI & Разработка', 'Сравнение моделей и единый доступ через API.', 'violet', ['LLM', 'API']],
  ['https://developer.mozilla.org/', 'Frontend: справочник для разработки', 'MDN Web Docs', 'AI & Разработка', 'Справочник по HTML, CSS и JavaScript.', 'mint', ['Frontend', 'Web']],
  ['https://www.are.na/', 'Исследования, мудборды и коллекции', 'Are.na', 'Идеи', 'Инструмент для коллекционирования визуальных идей.', 'blue', ['Research', 'Creative']],
  ['https://www.behance.net/', 'Галерея визуальных проектов', 'Behance', 'Дизайн & UI', 'Референсы по графике, сайтам и брендингу.', 'amber', ['Вдохновение', 'Дизайн']],
  ['https://github.com/', 'Репозитории и полезные разработки', 'GitHub', 'Полезные инструменты', 'Библиотека открытых проектов.', 'rose', ['Код', 'Инструменты']]
] as const;

export async function seedDemoIfNew(): Promise<void> {
  const seeded = await getPref('demoInitialized');
  if (seeded) return;
  if ((await loadBookmarks()).length === 0) {
    for (let i = 0; i < samples.length; i++) {
      const [url, title, author, category, description, color, tags] = samples[i];
      await saveBookmark({
        id: 'demo-' + i, url, title, author, source: classifySource(url),
        category, description, notes: '', tags: [...tags], ai_summary: '',
        color, demo: 1,
        created_at: new Date(Date.now() - i * 90000000).toISOString(),
        updated_at: new Date().toISOString()
      });
    }
  }
  await setPref('demoInitialized', 'yes');
}

export function createBookmark(url: string, title: string, category: string, author: string, notes: string): Bookmark {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(), url, title, author, source: classifySource(url),
    category, description: '', notes, tags: [], ai_summary: '',
    color: ['violet', 'coral', 'mint', 'blue', 'amber', 'rose'][Math.floor(Math.random() * 6)] as Bookmark['color'],
    demo: 0, created_at: now, updated_at: now
  };
}
