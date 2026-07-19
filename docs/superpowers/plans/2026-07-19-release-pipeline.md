# Release Pipeline Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Stop auto-publishing userscripts from every main push; build with esbuild IIFE; publish only on tags to a `release` branch.

**Architecture:** `main` holds source only. `scripts/build.mjs` uses esbuild to bundle ESM entry `userscript/ui-main.js` into an IIFE userscript with header `@updateURL`/`@downloadURL` pointing at the `release` branch. A tag-triggered Action builds, pushes the artifact to `release`, and creates a GitHub Release.

**Tech Stack:** Node ≥18, esbuild, GitHub Actions

## Global Constraints

- No push to remote in this session (local commits OK if needed; default: leave uncommitted or commit locally only as user prefers — currently: implement, do not push).
- Keep unit tests importing `userscript/lib/*.mjs` unchanged.
- Do not invent product features beyond release pipeline.

---

### Task 1: esbuild IIFE build

**Files:**
- Modify: `package.json`, `scripts/build.mjs`, `userscript/ui-main.js`
- Create: (none)
- Test: `npm test`, `npm run build`

- [ ] Convert `ui-main.js` to ESM entry with explicit imports; drop outer IIFE; use `__SCRIPT_VERSION__`.
- [ ] Rewrite `build.mjs` with esbuild IIFE + userscript banner; raw URLs → `release` branch.
- [ ] Add `esbuild` devDependency; drop regex `stripExports`.
- [ ] Verify build output has no bare `export` and header points at release.

### Task 2: Source-only main + CI

**Files:**
- Modify: `.gitignore`, `.github/workflows/ci.yml`, `package.json` scripts
- Delete from tracking: `userscript/ccswitch-linuxdo-importer.user.js` (gitignored)

- [ ] Gitignore built userscript; stop requiring committed artifact in `check`/CI.
- [ ] CI still runs test + build.

### Task 3: Tag release workflow

**Files:**
- Create: `.github/workflows/release.yml`

- [ ] On `v*` tags: install, test, build, push artifact to `release` branch, create GH Release asset.

### Task 4: Docs + version

**Files:**
- Modify: `README.md`, `package.json` version

- [ ] Install links → release branch raw URL; document tag release flow; bump to 1.2.0.
