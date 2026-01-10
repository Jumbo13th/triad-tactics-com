# Feature slice conventions

This repo is organized as **vertical slices** under `src/features/*`.

## Goals

- Each feature owns its UI, use-cases, and HTTP adapters.
- Next.js routing (`src/app/**`) stays thin: it should only forward to a feature adapter.
- Business logic lives in `useCases/` and is reusable across adapters.

## Recommended layout (per feature)

```
src/features/<feature>/
  ui/                 # React components
  useCases/            # application logic; depends on ports, not infra
  domain/              # (optional) pure domain types/rules
  infra/               # (optional) external I/O implementations (HTTP, DB glue, etc)
  adapters/
    next/              # Next.js App Router route handlers (glue)
  ports.ts             # dependency contracts used by useCases
  deps.ts              # concrete deps wiring (bind ports -> infra)
  schema.ts            # (optional) validation schema
```

## Rule of thumb

- `src/app/api/**/route.ts` should be a 1–3 line wrapper.
- Any Next-specific things (cookies, headers, redirects) belong in `adapters/next/*`.
- `useCases/*` should avoid importing Next.js types and `@/platform/*` (infra); inject via `ports.ts`/`deps.ts`.

