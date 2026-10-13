# Saqient

AI revenue cycle engine for healthcare providers in the UAE and Saudi Arabia. It turns physician notes into clean, compliant claims, predicts denial risk before submission, checks pre-authorization, and handles multiple payers and markets (DHA/eClaimLink, DoH/Shafafiya, CHI/NPHIES).

**Rules decide, AI suggests, a human coder approves every claim.**

## What's here

| Path | Contents |
|---|---|
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | Full architecture plan: multi-agent design, medical LLM and UAE/Saudi fine-tuning, guardrails, token optimization, data residency, production target, roadmap |
| `app/` | Source of the working prototype, built on [Floot](https://floot.com) (React + TypeScript, serverless endpoints, Postgres) |
| `db/` | Database schema and demo reference data |

## How the prototype works

1. A coder pastes a clinical note and picks a payer. PHI is redacted before anything is stored.
2. A supervised pipeline of agents runs: Redaction → Extraction (LLM, with evidence quotes) → Coding (LLM, restricted to retrieved codes from the code table) → Verifier (judge model) → Pre-auth → Payer rules engine (deterministic) → Denial risk score.
3. The coder reviews AI-suggested codes with highlighted evidence, fixes issues, and approves. Approval is blocked while blockers or unreviewed AI codes remain. Every action is in the audit log.

Main source files: `app/helpers/agentPipeline.tsx` (orchestration), `app/helpers/rulesEngine.tsx`, `app/helpers/riskModel.tsx`, `app/helpers/phiRedaction.tsx`, `app/helpers/aiClient.tsx` (caching and structured output).

## Data

Synthetic or de-identified data only. Payers in the demo are fictional. Real PHI must be processed in UAE/KSA-hosted infrastructure (see section 9 of the architecture plan). Code sets such as CPT, ICD-10-AM/ACHI and SNOMED CT need licenses before production use.
