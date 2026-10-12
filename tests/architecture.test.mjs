import { readFileSync, existsSync } from 'node:fs';
import assert from 'node:assert/strict';
import test from 'node:test';

test('API key cannot be bundled through frontend env', () => {
  const src = readFileSync('src/models.ts', 'utf8');
  const rust = readFileSync('src-tauri/src/lib.rs', 'utf8');
  const ignore = readFileSync('.gitignore', 'utf8');
  assert.ok(!src.includes('OONR_API'));
  assert.ok(rust.includes('keyring::Entry'));
  assert.ok(ignore.includes('.env'));
});
test('Tauri database and frontend schema agree', () => {
  const rust = readFileSync('src-tauri/src/lib.rs', 'utf8');
  const store = readFileSync('src/data.ts', 'utf8');
  for (const field of ['id','url','title','author','source','category','description','notes','tags','ai_summary','color','demo','created_at','updated_at']) {
    assert.ok(rust.includes(field), field);
    assert.ok(store.includes(field), field);
  }
});
test('App assets exist', () => {
  for (const file of ['src/App.tsx', 'src/styles.css', 'src/main.tsx', 'src-tauri/tauri.conf.json']) assert.ok(existsSync(file));
});
