# Architecture

## Structure

This codebase is organized by feature slices under `src/features/*`. Each feature owns UI, use cases, domain types/schemas, infra, and adapters. Shared concerns live in `src/platform/*`.

```
src/app/**
  -> src/features/*/adapters/next
     -> src/features/*/useCases
        -> src/features/*/ports.ts
           -> src/features/*/infra
```

## Feature slice layout

```
src/features/<feature>/
  ui/
    root/           (public UI barrel)
  useCases/         (app logic)
  domain/           (types + schemas)
  infra/            (I/O)
  adapters/next     (Next.js handlers)
  ports.ts          (interfaces)
  deps.ts           (wiring)
```

## Operating rules

- App routes are thin; no business logic there.
- Next.js specifics stay in adapters.
- Use cases depend only on ports, not platform or Next.
- UI imports go through `ui/root`.
- Parse requests/responses at the edge with Zod.
- Platform owns DB, logging, and HTTP utilities.
- Tests use `tests/fixtures/*` helpers; no direct `@/platform/db` imports in tests.

## Design principles

- Keep changes inside the owning feature slice.
- Keep I/O in infra and logic in use cases.
- Keep domain types consistent across UI/useCases/infra.
- Avoid cross-feature imports in use cases.
- Prefer small, explicit components over shared generic layers.
- Avoid unused abstractions (KISS/YAGNI).
