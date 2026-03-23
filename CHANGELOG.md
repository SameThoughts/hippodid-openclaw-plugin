# Changelog

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
