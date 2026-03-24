# Changelog

## 1.0.9 (2026-03-24)

### Fixes

- Ship and load the compiled `dist/` extension output for local-link and published installs
- Read the displayed plugin version from `package.json` at runtime instead of a hardcoded string
- Send `Authorization: Bearer <apiKey>` alongside legacy `X-Api-Key` for current HippoDid servers
- Accept camelCase tier feature fields such as `autoRecallAvailable` and `autoCaptureAvailable`
- Accept camelCase sync payload fields such as `filePath` and `fileContent`
- Keep file sync active when auto-capture is configured but not mounted for the current tier
- Register lifecycle hooks with the current OpenClaw event API for compaction, session start/end, recall, and capture
- Add `/hippodid ...` plugin command registration for command-routed OpenClaw chat surfaces

### Notes

- Slash commands are handled by OpenClaw's command router on real chat/channel surfaces.
- Direct `openclaw agent --message "/hippodid ..."` runs bypass that router and should use the tool forms instead: `hippodid:status`, `hippodid:sync`, `hippodid:import`.

## 1.0.0 (2026-03-22)

### Features

- Initial release
- File watcher with SHA-256 diff and debounced cloud sync
- Pre-compaction flush hook (memory survives context compaction)
- Session-start hydration from cloud
- Auto-detect OpenClaw workspace memory directory
- Free tier: file sync, session hydration, pre-compaction flush
- Paid tier: auto-recall (inject relevant memories before each turn)
- Paid tier: auto-capture (extract and store facts after each turn)
- CLI commands: hippodid:status, hippodid:sync, hippodid:import
