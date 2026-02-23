---
name: creating-package
description: Scaffolds a new @oclaw/xxx package in the monorepo with standard package.json, tsconfig, tsup, and vitest config. Use whenever any phase requires creating a new packages/* directory.
---

# Creating a Monorepo Package

Standard scaffold for every `packages/xxx` in this project.

## Steps

```bash
# turbo
mkdir -p packages/<name>/src
```

### `packages/<name>/package.json`

```json
{
  "name": "@oclaw/<name>",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsup",
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc --noEmit"
  }
}
```

### `packages/<name>/tsconfig.json`

```json
{
  "extends": "../../tsconfig.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src", "test"]
}
```

### `packages/<name>/tsup.config.ts`

```typescript
import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  dts: true,
  clean: true,
  sourcemap: true,
})
```

### `packages/<name>/vitest.config.ts`

```typescript
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
  },
})
```

### `packages/<name>/src/index.ts`

Start with empty exports; fill in as you implement.

```typescript
export {}
```

## Adding to Workspace

After creating the package, add it as a dependency wherever it's consumed:

```bash
# turbo
pnpm --filter @oclaw/<consumer> add @oclaw/<name>@workspace:*
```

## Notes

- Always use `"type": "module"` — the project is fully ESM
- `tsup` outputs to `dist/`; never import `src/` from other packages
- Add `@oclaw/shared` as a dependency if the package uses shared types or the logger: `pnpm --filter @oclaw/<name> add @oclaw/shared@workspace:*`
