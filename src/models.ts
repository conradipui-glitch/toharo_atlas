import { invoke } from '@tauri-apps/api/core';
import { desktop } from './data';
import type { ModelInfo, ModelTest } from './types';

export const PREFERRED_MODEL = 'anthropic/claude-haiku-5.5';

export function isFree(m: ModelInfo): boolean {
  return (m.id.endsWith(':free') || (Number(m.pricing?.prompt ?? NaN) === 0 && Number(m.pricing?.completion ?? NaN) === 0));
}

export function costPerMillion(price: string | undefined): string {
  if (price === undefined) return '—';
  return '$' + (Number(price) * 1_000_000).toLocaleString('en-US', { maximumFractionDigits: 3 });
}

export async function fetchModels(): Promise<ModelInfo[]> {
  if (!desktop) throw new Error('Подключение OpenRouter доступно в установленном Windows-приложении.');
  const payload = await invoke<{data: ModelInfo[]}>('list_openrouter_models');
  if (!Array.isArray(payload.data)) throw new Error('Каталог вернул неожиданный формат.');
  return payload.data.sort((a, b) => a.name.localeCompare(b.name));
}
export async function saveKey(secret: string): Promise<void> {
  if (!desktop) throw new Error('API-ключ настраивается в приложении для Windows.');
  await invoke('save_openrouter_key', { secret });
}
export async function keyIsReady(): Promise<boolean> {
  return desktop ? invoke<boolean>('openrouter_key_status') : false;
}
export async function deleteKey(): Promise<void> {
  if (desktop) await invoke('delete_openrouter_key');
}
export async function testModel(model: string): Promise<ModelTest> {
  return invoke<ModelTest>('test_openrouter_model', { model });
}
export async function analyze(model: string, title: string, url: string, notes: string): Promise<{summary: string; tags: string[]}> {
  return invoke('analyze_bookmark', { model, title, url, notes });
}
