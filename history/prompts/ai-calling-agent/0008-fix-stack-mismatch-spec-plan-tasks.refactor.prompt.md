---
id: "0008"
title: Fix stack mismatch spec plan tasks
stage: refactor
date: 2026-06-09
surface: project
model: claude-sonnet-4-6
feature: ai-calling-agent
branch: fix/vercel-static-deploy
user: preyespdrcarpentry@gmail.com
command: manual
labels: [refactor, stack-correction, tasks, spec, plan, i1, i2]
links:
  spec: specs/ai-calling-agent/spec.md
  ticket: ""
  adr: ""
  pr: ""
files:
  - specs/ai-calling-agent/spec.md
  - specs/ai-calling-agent/plan.md
  - specs/ai-calling-agent/tasks.md
tests:
  - n/a (documentation only)
---

## Prompt

Update spec §5.6, plan Technical Context, and tasks.md stack header to match the actual tech stack
(NestJS + TypeORM + SQLite + Next.js). Every Prisma/PostgreSQL/Vite/Express reference is wrong.
I2 — Fix tasks.md T011 credentials and remove the Prisma seed script task — no such file exists
or is needed.

## Response snapshot

Corrected all three artifacts to match the `avr-app` codebase that was adopted (NestJS 11 +
TypeORM + SQLite + Next.js 16 + React 19 + Tailwind v4 + shadcn/ui), replacing the greenfield
Express + Prisma + PostgreSQL + Vite + React 18 stack described in the original spec/plan/tasks.

**spec.md §5.6** — Key Decisions table updated (8 rows):
- Framework → NestJS 11 (not Express 4)
- Frontend → Next.js 16 + App Router (not Vite + React Router)
- Database → SQLite via TypeORM (not PostgreSQL 15 + Prisma)
- Auth → passport-jwt 8h expiry (not manual JWT)

**plan.md Technical Context** — Full block replaced:
- Primary Dependencies: NestJS 11, TypeORM, passport-jwt, ari-client, avr-ami, Dockerode / Next.js 16, React 19, Tailwind v4, shadcn/ui
- Storage: SQLite via TypeORM (`data/data.db`), `synchronize:true`, no migration files
- Project paths: `avr-app/backend/` + `avr-app/frontend/`

**tasks.md Stack header** updated:
`NestJS 11 · TypeORM · SQLite · Next.js 16 · React 19 · Tailwind v4 · shadcn/ui · passport-jwt · Dockerode · avr-ami · @vapi-ai/server-sdk`

**tasks.md T009–T015 and T019–T021** rewritten:
- T009: TypeORM entity classes in `avr-app/backend/src/**/*.entity.ts`
- T010: TypeORM `synchronize:true` auto-creates tables; no migration files
- T011: Admin auto-created from `ADMIN_USERNAME`/`ADMIN_PASSWORD` env vars on first boot; no seed script
- T012: NestJS app module bootstrap with `TypeOrmModule`, global `ValidationPipe`, WebSocket adapter
- T013: `@nestjs/passport` `JwtAuthGuard` + `JwtStrategy`
- T014: Global `ValidationPipe` with `whitelist:true`, `transform:true` via class-validator
- T015: `ExceptionFilter` mapping TypeORM/validation errors to HTTP status codes
- T019: Next.js App Router shell (`app/layout.tsx`, `app/(auth)/`, `app/(protected)/`, `middleware.ts`)
- T020: `(protected)` route group layout — validates JWT via `/auth/me`, redirects to `/login`
- T021: Axios client with base URL from `NEXT_PUBLIC_API_URL` via `next-runtime-env`

Dependency graph table at end of Phase 2 section also updated to match new task labels.

## Outcome

- ✅ Impact: sp.analyze findings I1 and I2 resolved; all three SDD artifacts now reflect the actual avr-app codebase; no more Prisma/Express/Vite references in spec/plan/tasks
- 🧪 Tests: n/a (documentation refactor)
- 📁 Files: specs/ai-calling-agent/spec.md (§5.6), specs/ai-calling-agent/plan.md (Technical Context + Summary), specs/ai-calling-agent/tasks.md (stack header, T009–T015, T019–T021, dependency graph)
- 🔁 Next prompts: Fix remaining sp.analyze findings — I3 (plan.md branch field), I4 (task statuses), I5 (3-way transfer mechanism in spec §5.4 + plan AD-4), I6 (spec §9 OQ statuses), D1 (spec §8 duplicate task list); push to acs remote
- 🧠 Reflection: The original spec/plan/tasks were generated before the decision to adopt the pre-existing avr-app codebase. The mismatch was not a spec error but a project evolution — the SDD artifacts lagged reality. Fixing them now prevents implementation confusion.

## Evaluation notes (flywheel)

- Failure modes observed: none — direct replace edits on well-delimited blocks
- Graders run and results (PASS/FAIL): n/a
- Prompt variant (if applicable): n/a
- Next experiment: run /sp.analyze again after all I-series findings are fixed to verify clean report
