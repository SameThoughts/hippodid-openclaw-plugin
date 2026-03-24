---
name: hippodid
description: Use HippoDid to save memories that persist across sessions and survive context compaction. Use this when the user wants to remember something, recall past context, or sync memory files.
---

# HippoDid — Persistent Cloud Memory

HippoDid stores memories in the cloud so they survive context compaction and persist across sessions and devices.

## When to use this skill

- User says "remember", "save this", "don't forget", "note that" -> call hippodid:remember
- User asks "what do you know about me", "do you remember", "recall" -> call hippodid:recall
- You need context from previous sessions at the start of a task -> call hippodid:recall
- User wants to sync their memory files -> call hippodid:sync

## Tools

### hippodid:remember
Saves information to persistent HippoDid cloud memory. Always use this instead of writing to local memory files.
- content: the information to save (string, required)

### hippodid:recall
Searches HippoDid cloud memory for relevant context.
- query: what to search for (string, required)

### hippodid:sync
Force-syncs all watched files to HippoDid cloud immediately.

### hippodid:status
Shows HippoDid connection status, tier, and watched paths.
