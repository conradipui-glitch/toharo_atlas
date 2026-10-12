use std::time::{Duration, Instant};
use serde_json::{json, Value};
use tauri_plugin_sql::{Migration, MigrationKind};

const API_ROOT: &str = "https://openrouter.ai/api/v1";
const KEY_SERVICE: &str = "lab.toharo.atlas";
const KEY_NAME: &str = "openrouter";

fn credential() -> Result<keyring::Entry, String> {
    keyring::Entry::new(KEY_SERVICE, KEY_NAME).map_err(|e| e.to_string())
}

fn api_key() -> Result<String, String> {
    // For optional CI smoke checks. This environment variable is not read by Vite
    // and must never be set through the frontend.
    if let Ok(secret) = std::env::var("OONR_API") {
        if !secret.trim().is_empty() { return Ok(secret); }
    }
    credential()?.get_password().map_err(|_| "OpenRouter API key не настроен".into())
}

fn client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .timeout(Duration::from_secs(45))
        .build()
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn save_openrouter_key(secret: String) -> Result<(), String> {
    if secret.trim().is_empty() { return Err("Введите API-ключ".into()); }
    credential()?.set_password(secret.trim()).map_err(|e| e.to_string())
}

#[tauri::command]
fn openrouter_key_status() -> bool {
    api_key().is_ok()
}

#[tauri::command]
fn delete_openrouter_key() -> Result<(), String> {
    credential()?.delete_credential().map_err(|e| e.to_string())
}

#[tauri::command]
async fn list_openrouter_models() -> Result<Value, String> {
    let mut request = client()?.get(format!("{}/models", API_ROOT))
        .header("HTTP-Referer", "https://github.com/conradipui-glitch/toharo_atlas")
        .header("X-Title", "TOHARO Atlas");
    if let Ok(key) = api_key() {
        request = request.bearer_auth(key);
    }
    let response = request.send().await.map_err(|e| format!("Каталог недоступен: {}", e))?;
    let status = response.status();
    let payload: Value = response.json().await.map_err(|e| e.to_string())?;
    if !status.is_success() {
        return Err(format!("OpenRouter HTTP {}: {}", status, payload));
    }
    Ok(payload)
}

async fn completion(model: &str, system: &str, user: &str, max_tokens: u32) -> Result<Value, String> {
    if model.trim().is_empty() { return Err("Не выбрана модель".into()); }
    let response = client()?.post(format!("{}/chat/completions", API_ROOT))
        .bearer_auth(api_key()?)
        .header("HTTP-Referer", "https://github.com/conradipui-glitch/toharo_atlas")
        .header("X-Title", "TOHARO Atlas")
        .json(&json!({
            "model": model,
            "max_tokens": max_tokens,
            "messages": [
                {"role": "system", "content": system},
                {"role": "user", "content": user}
            ]
        }))
        .send().await.map_err(|e| format!("Ошибка сети: {}", e))?;
    let status = response.status();
    let payload: Value = response.json().await.map_err(|e| format!("Некорректный ответ: {}", e))?;
    if !status.is_success() {
        let detail = payload.pointer("/error/message").and_then(Value::as_str).unwrap_or("Неизвестная ошибка API");
        return Err(format!("HTTP {}: {}", status, detail));
    }
    Ok(payload)
}

#[tauri::command]
async fn test_openrouter_model(model: String) -> Result<Value, String> {
    let started = Instant::now();
    let payload = completion(&model, "Reply with one short word.", "Say OK.", 16).await?;
    Ok(json!({
        "elapsed_ms": started.elapsed().as_millis() as u64,
        "reply": payload.pointer("/choices/0/message/content").and_then(Value::as_str).unwrap_or(""),
        "usage": payload.get("usage")
    }))
}

#[tauri::command]
async fn analyze_bookmark(model: String, title: String, url: String, notes: String) -> Result<Value, String> {
    let system = "You categorize personal bookmarks. Return ONLY valid JSON: {\"summary\":\"one or two sentences in Russian\",\"tags\":[\"tag1\",\"tag2\"]}. Use only supplied evidence. Do not invent what a video contains when only its URL is provided. Max 5 short tags.";
    let user = format!("Title: {}\nURL: {}\nUser notes: {}", title, url, notes);
    let payload = completion(&model, system, &user, 420).await?;
    let raw = payload.pointer("/choices/0/message/content")
        .and_then(Value::as_str)
        .ok_or("Модель вернула пустой ответ")?
        .trim();
    let clean = raw.trim_start_matches("```json").trim_start_matches("```").trim_end_matches("```").trim();
    let parsed: Value = serde_json::from_str(clean)
        .map_err(|_| "Модель вернула некорректный JSON; попробуйте ещё раз".to_string())?;
    let summary = parsed.get("summary").and_then(Value::as_str).ok_or("Нет описания")?;
    let tags = parsed.get("tags").and_then(Value::as_array).ok_or("Нет тегов")?;
    Ok(json!({
        "summary": summary,
        "tags": tags.iter().filter_map(Value::as_str).take(5).collect::<Vec<_>>(),
        "usage": payload.get("usage")
    }))
}

const SCHEMA: &str = r#"
CREATE TABLE IF NOT EXISTS bookmarks (
    id TEXT PRIMARY KEY NOT NULL,
    url TEXT NOT NULL UNIQUE,
    title TEXT NOT NULL,
    author TEXT NOT NULL DEFAULT '',
    source TEXT NOT NULL DEFAULT 'web',
    category TEXT NOT NULL DEFAULT 'Все находки',
    description TEXT NOT NULL DEFAULT '',
    notes TEXT NOT NULL DEFAULT '',
    tags TEXT NOT NULL DEFAULT '[]',
    ai_summary TEXT NOT NULL DEFAULT '',
    color TEXT NOT NULL DEFAULT 'violet',
    demo INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_bookmarks_category ON bookmarks(category);
CREATE INDEX IF NOT EXISTS idx_bookmarks_created ON bookmarks(created_at);
CREATE TABLE IF NOT EXISTS preferences (
    key TEXT PRIMARY KEY NOT NULL,
    value TEXT NOT NULL
);
"#;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let migrations = vec![Migration {
        version: 1,
        description: "Initial bookmark and preference tables",
        sql: SCHEMA,
        kind: MigrationKind::Up
    }];
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_sql::Builder::default()
            .add_migrations("sqlite:atlas.db", migrations)
            .build())
        .invoke_handler(tauri::generate_handler![
            save_openrouter_key,
            openrouter_key_status,
            delete_openrouter_key,
            list_openrouter_models,
            test_openrouter_model,
            analyze_bookmark
        ])
        .run(tauri::generate_context!())
        .expect("Error while running TOHARO Atlas");
}
