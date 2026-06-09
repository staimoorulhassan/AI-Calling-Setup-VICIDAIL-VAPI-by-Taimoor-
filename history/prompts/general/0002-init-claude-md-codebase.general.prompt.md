---
id: "0002"
title: Init CLAUDE.md codebase documentation
stage: general
date: 2026-06-09
surface: agent
model: claude-sonnet-4-6
feature: none
branch: fix/vercel-static-deploy
user: Taimoor
command: /init
labels: ["init","claude-md","documentation","architecture"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
  - CLAUDE.md
tests:
  - none
---

## Prompt

Please analyze this codebase and create a CLAUDE.md file, which will be given to future instances of Claude Code to operate in this repository.

What to add:
1. Commands that will be commonly used, such as how to build, lint, and run tests. Include the necessary commands to develop in this codebase, such as how to run a single test.
2. High-level code architecture and structure so that future instances can be productive more quickly. Focus on the "big picture" architecture that requires reading multiple files to understand.

## Response snapshot

Updated CLAUDE.md with:
- Required `# CLAUDE.md` prefix and intro line
- Project overview: ViciDial + VAPI + AVR + avr-app architecture
- Repository layout explaining each top-level directory
- Development commands for backend (NestJS/jest) and frontend (Next.js/vitest) including single-test invocations
- Architecture section covering NestJS module structure, Next.js App Router layout, AVR audio pipeline flow diagram, and key env vars
- Preserved all existing SDD process rules (PHR workflow, ADR suggestions, execution contract, default policies)

## Outcome

- ✅ Impact: Future Claude Code instances have actionable dev commands and architectural context for the ACS project
- 🧪 Tests: none run (documentation-only change)
- 📁 Files: CLAUDE.md updated
- 🔁 Next prompts: `/sp.constitution` to fill in the project constitution template; `/sp.specify` to refine the ai-calling-agent spec
- 🧠 Reflection: The existing CLAUDE.md was entirely SDD process rules with no codebase-specific content — the init command's value here was adding the missing development and architecture sections

## Evaluation notes (flywheel)

- Failure modes observed: none
- Graders run and results (PASS/FAIL): n/a
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): n/a
