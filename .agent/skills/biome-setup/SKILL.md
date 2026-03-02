---
name: biome-setup
description: Configure Biome linter and formatter for the @oclaw monorepo. Use when setting up Biome, updating lint/format rules, adding check scripts, troubleshooting biome config, running biome in CI, or adding editor integration.
---

# Biome Setup

Biome is the single tool for linting, formatting, and import organization across all `@oclaw/*` packages. It replaces ESLint and Prettier.

## Root Config (`biome.json`)

Place at the repo root. Every package inherits it automatically (Biome walks up to find the nearest config).

```json
{
  "$schema": "https://biomejs.dev/schemas/1.9.4/schema.json",
  "vcs": {
    "enabled": true,
    "clientKind": "git",
    "useIgnoreFile": true
  },
  "files": {
    "ignoreUnknown": false,
    "ignore": ["**/dist/**", "**/node_modules/**", "**/*.d.ts"]
  },
  "organizeImports": { "enabled": true },
  "linter": {
    "enabled": true,
    "rules": {
      "recommended": true,
      "correctness": {
        "noUnusedImports": "error",
        "noUnusedVariables": "error"
      },
      "style": {
        "useImportType": "error"
      }
    }
  },
  "formatter": {
    "enabled": true,
    "indentStyle": "tab",
    "lineWidth": 100
  },
  "javascript": {
    "formatter": {
      "quoteStyle": "single",
      "semicolons": "asNeeded",
      "trailingCommas": "all"
    }
  }
}
```

> `vcs.useIgnoreFile: true` tells Biome to respect `.gitignore`, so you rarely need to duplicate ignore entries.

## Package-Level Override

Only needed if a package has different requirements. Create `packages/<name>/biome.json`:

```json
{
  "extends": ["../../biome.json"]
}
```

## Scripts

Add to every `packages/<name>/package.json`:

```json
{
  "scripts": {
    "lint": "biome lint --write src",
    "format": "biome format --write src",
    "check": "biome check --write src"
  }
}
```

Root `package.json` for running across all packages at once:

```json
{
  "scripts": {
    "lint": "biome lint --write packages",
    "format": "biome format --write packages",
    "check": "biome check --write packages",
    "ci:check": "biome ci ."
  }
}
```

`biome check` = lint + format + organize imports in one pass. Prefer it over running each separately.

## CLI Reference

```bash
# Auto-fix everything (lint + format + imports)
biome check --write .

# Lint only
biome lint --write src/

# Format only
biome format --write src/

# CI — no writes, exits non-zero on any issue, GitHub-compatible annotations
biome ci .
```

## Editor Integration (Cursor / VS Code)

Install the Biome extension: `biomejs.biome`

Add to `.vscode/settings.json`:

```json
{
  "[typescript]": {
    "editor.defaultFormatter": "biomejs.biome",
    "editor.formatOnSave": true
  },
  "[javascript]": {
    "editor.defaultFormatter": "biomejs.biome",
    "editor.formatOnSave": true
  },
  "editor.codeActionsOnSave": {
    "quickfix.biome": "explicit",
    "source.organizeImports.biome": "explicit"
  }
}
```

## Inline Rule Suppression

When a specific violation must be suppressed:

```typescript
// biome-ignore lint/suspicious/noExplicitAny: external SDK response type
const raw: any = response.data

// biome-ignore lint/complexity/noForEach: required for side-effect ordering
items.forEach((item) => process(item))
```

Format: `biome-ignore <category>/<ruleName>: <reason>`

## Key Style Conventions

From the formatter config above, all project code should follow:

| Convention | Value |
| ---------- | ----- |
| Indent | Tab |
| Line width | 100 |
| Quotes | Single |
| Semicolons | As needed (omit where ASI is safe) |
| Trailing commas | All (functions, arrays, objects) |
| Import type | `import type` for type-only imports |

## Code Generation

The Cursor rule at `.cursor/rules/code-style.mdc` (glob `**/*.ts,**/*.tsx`) ensures the AI generates code in this style automatically — no reformatting needed after the fact. The key conventions it enforces: tabs, single quotes, no statement semicolons, trailing commas, and `import type`.

## Installation

```bash
# turbo
pnpm add -D @biomejs/biome@^1
```

Biome ships as a single binary — no peer dependencies.
