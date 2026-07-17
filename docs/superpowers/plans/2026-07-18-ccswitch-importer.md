# CC Switch linux.do Importer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a Tampermonkey userscript that parses selected API-share text on linux.do and opens a CC Switch `ccswitch://` provider import deep link.

**Architecture:** Single userscript with internal modules (detect, parser, classify, deeplink, ui, open). Pure parse/classify/deeplink logic is also loadable under Node for unit tests.

**Tech Stack:** Vanilla JS userscript (Tampermonkey), Node.js for unit tests (`node --test`).

---

### Task 1: Scaffold repository

**Files:**
- Create: `README.md`, `LICENSE`, `.gitignore`, `package.json`

- [ ] Init repo files and commit scaffold

### Task 2: Parser + classify + deeplink (TDD)

**Files:**
- Create: `tests/parser.test.mjs`
- Create: `userscript/lib/core.mjs` (pure functions for Node + to be inlined/copied into userscript)
- Create: `userscript/ccswitch-linuxdo-importer.user.js` (initially may import via duplication — final is self-contained IIFE with same logic)

- [ ] Write failing tests for env / JSON / base64 / mixed CJK / deeplink / classify
- [ ] Implement core pure functions until tests pass
- [ ] Commit

### Task 3: Userscript UI + integration

**Files:**
- Modify: `userscript/ccswitch-linuxdo-importer.user.js`

- [ ] Selection detect + floating button
- [ ] Confirm card + toast
- [ ] Deep link open + clipboard fallback
- [ ] Commit

### Task 4: README install docs + final verification

**Files:**
- Modify: `README.md`

- [ ] Install steps for Tampermonkey
- [ ] Supported formats examples
- [ ] Run `node --test`
- [ ] Final commit

---

## Spec coverage

| Spec item | Task |
|-----------|------|
| Selection trigger | Task 3 |
| Formats A–E | Task 2 |
| Auto app classify | Task 2 |
| ccswitch:// open | Task 2–3 |
| Clipboard fallback | Task 3 |
| Anti CJK noise | Task 2 |
| linux.do only | Task 3 header |
| Shadow/safe UI | Task 3 |
