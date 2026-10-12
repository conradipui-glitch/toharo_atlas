# TOHARO Atlas

**Local-first desktop research library** — save useful posts, creators, videos and links; turn scattered bookmarks into searchable insights.

## Atlas Foundation (v0.1)

- Tauri 2 desktop shell for Windows, with custom window controls.
- React / TypeScript UI and SQLite persistence in the Windows app.
- Search, collections, creator grouping, bookmarks, editing and removal.
- OpenRouter Model Manager with live catalog refresh, free-only filter, model selection, latency tests and AI-assisted bookmark tagging.
- OpenRouter key stored in Windows Credential Manager. A key is **never** committed or stored in a browser database.
- Web preview uses the browser's localStorage and does not offer secret-bearing AI features.

### Local development

Requires **Node.js 20+**, **Rust toolchain** (for desktop), **Microsoft C++ Build Tools** and **WebView2** on Windows.

```bash
npm install
npm run dev           # web-only preview (persistent localStorage, AI unavailable)
npm run tauri dev     # real SQLite + OpenRouter integrations
npm run build         # TypeScript / frontend check
npm run tauri build   # Windows installer
```

### GitHub secret for integration smoke testing

Set repository Actions secret `OONR_API`. The secret is only injected into the explicitly triggered OpenRouter smoke workflow. It is never exposed to Vite or included in distribution bundles. The smoke test makes a small paid API request when enabled.

Recommended model: `anthropic/claude-haiku-5.5`. Other models are chosen from the **live catalog**, not hardcoded.

### What this first slice does not do

It does not import Instagram saved folders, download private Reels, fetch arbitrary sites, read DMs, crawl comments or auto-complete Instagram funnels. Only supplied URL/title/notes are provided to AI. The app does **not** pretend it analyzed video content when it has not.

### Data & privacy

SQLite is stored in Tauri's application data directory. Browser preview uses localStorage for bookmarks and preferences. Keys go to Windows Credential Manager; never to SQL/localStorage. The app makes AI requests only after a key and model have been selected and the user explicitly requests a test or an analysis. No telemetry.

## Next steps

1. Browser extension / Share-to-Atlas.
2. Proper content extraction (with platform rules), metadata previews and source-backed citations.
3. Collection import/export, backups and semantic search.

