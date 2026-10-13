# Saqient: architecture plan

Saqient is an AI revenue cycle engine for GCC healthcare providers. It turns physician notes into clean, compliant claims, predicts denials before submission, validates prior authorization, and keeps an audit trail for every decision.

This document covers the full target architecture and what the first build (the Floot prototype in this repo) already implements.

## 1. Design principles

1. **Rules decide, AI suggests, people approve.** Deterministic, versioned payer rules have the final say on pass or fail. Language models extract, suggest and explain. A coder approves every claim.
2. **Evidence or nothing.** Every AI fact and code must quote the note word for word. Anything without a verifiable quote is discarded, not shown.
3. **Narrow agents, supervised pipeline.** Each agent has one job, a strict output schema and a guardrail that checks its output. A fixed orchestrator runs them; agents never call each other freely.
4. **Data stays in-country.** Real patient data is processed only on UAE-hosted (or, for Saudi customers, in-Kingdom) infrastructure, including model inference.
5. **Cheap by default.** Deterministic code first, small fast models for easy work, judge models for yes/no checks, retrieval instead of whole code sets, and caching.

## 2. Should this be multi-agent?

Yes, but as a **supervised pipeline**, not a swarm of autonomous agents.

| Approach | Accuracy | Auditability | Cost and latency | Verdict |
| --- | --- | --- | --- | --- |
| One big prompt | Lower; one model does everything | Hard to see why a code was chosen | Low | Not enough for claims |
| Free-roaming agents that talk to each other | Can be high | Poor; paths differ per claim and are hard to replay | High and unpredictable | Not suitable for regulated billing |
| **Supervised pipeline of specialist agents** (chosen) | High; each agent is narrow and checked | Every step logged with inputs, model, version and output | Predictable | Best fit |

The pipeline is fixed: redaction, extraction, coding, verification, pre-authorization, rules, risk. Each step is logged in `agent_runs` so any claim can be replayed for an auditor. A later version can add a bounded "repair loop" (for example, re-ask the coding agent once when the verifier rejects a code), but it never becomes open-ended.

## 3. System overview

```
EMR / HIS export, FHIR R4, HL7 v2, flat files
            │
            ▼
┌──────────────────────────┐
│ Ingest + PHI redaction   │  deterministic; raw identifiers never stored
└──────────────────────────┘
            │
            ▼
┌────────────────────────────────────────────────────────────────┐
│ Agent pipeline (orchestrator)                                   │
│  1 Redaction guard   deterministic re-check before any model    │
│  2 Extraction agent  LLM, facts + verbatim evidence              │
│  3 Coding agent      LLM, restricted to retrieved candidate codes│
│  4 Verifier agent    judge model, independent second opinion     │
│  5 Pre-auth agent    judge model, necessity + approval checks    │
│  6 Rules engine      deterministic, versioned payer rule packs   │
│  7 Risk model        v0 logistic, v1 gradient-boosted trees      │
└────────────────────────────────────────────────────────────────┘
            │
            ▼
┌──────────────────────────┐     ┌───────────────────────────┐
│ Coder review queue        │ ──▶ │ Clean-claim pack + audit  │ ──▶ existing billing system
│ evidence highlights,      │     │ trail (JSON today; DHA /  │     → eClaimLink / Shafafiya /
│ accept / reject / approve │     │ DoH XML, NPHIES FHIR next)│       NPHIES
└──────────────────────────┘     └───────────────────────────┘
            ▲                                   │
            └──── remittances + denial codes ◀──┘  feedback loop retrains the risk model
```

## 4. The agents in detail

| # | Agent | Type | Input | Output | Guardrail |
| --- | --- | --- | --- | --- | --- |
| 1 | Redaction | Deterministic regex + dictionaries | Raw note | De-identified note, count by type | Runs at ingest and again before any model call; pseudonymous patient reference is checked too |
| 2 | Extraction | LLM, strict JSON schema | De-identified note (budgeted) | Facts: type, normalized text, verbatim evidence, negated flag | Facts whose evidence is not found in the note are dropped |
| 3 | Coding | LLM, strict JSON schema | Facts, note, 20 to 30 retrieved candidate codes, codes already on the claim | Codes with evidence, rationale, confidence, primary flag | Code must be in the candidate list; evidence must be in the note; one primary; duplicates removed |
| 4 | Verifier | Judge model (yes/no probabilities) | Note + each AI code | Support probability per code | Codes under 0.5 raise a rule hit and need explicit coder review |
| 5 | Pre-auth | Judge model | Note + procedures that need approval | Necessity documented? Approval number present? Checklist | Feeds the rules engine; never approves anything itself |
| 6 | Rules engine | Deterministic | Claim lines, code index, pre-auth state, rule library | Rule hits with severity, fix and source | Rules are data: versioned, cited, admin-only changes, audited |
| 7 | Risk model | Deterministic v0 | Payer base rate, rule hits, code denial weights | Denial probability, readiness, top reasons | Transparent weights; v1 trained model sits behind the same interface |

## 5. The medical intelligence layer and fine-tuning

### 5.1 Recommended path

Do not start by training your own medical LLM. Start with a strong general model plus retrieval and rules, collect labelled data from real use, then fine-tune.

| Phase | Intelligence layer | Why |
| --- | --- | --- |
| Now (prototype) | General LLM for extraction and coding, judge model for verification, retrieval over code tables, deterministic rules | Works without training data; every output is checked |
| Pilot | Same, deployed in a UAE region; add a vector index of code descriptions, payer policies and coding guidelines (RAG) | Better candidate retrieval and policy grounding |
| After 10k to 50k reviewed claims | Fine-tune a smaller open model (for example a 7B to 14B medical or general model) with LoRA on coder-approved examples | Lower cost, runs in-country, learns local documentation style |
| Mature | Separate UAE and Saudi adapters on one base model, plus a trained denial model per payer | Captures market-specific coding families and payer behaviour |

### 5.2 UAE and Saudi models

Use **one base model with two LoRA adapters** rather than two separate models:

- **UAE adapter:** ICD-10-CM, CPT, DHA and DoH drug and service codes, eClaimLink and Shafafiya denial codes, DHA/DoH adjudication rules.
- **Saudi adapter:** ICD-10-AM, ACHI, Saudi Billing System (SBS), Australian Coding Standards, AR-DRG, NPHIES rejection codes, CHI policies.

The router picks the adapter from the payer's market. Shared clinical understanding stays in the base model.

### 5.3 Training data

| Source | Use | Notes |
| --- | --- | --- |
| Coder accept/reject decisions with reasons | Supervised fine-tuning pairs (note → approved codes + evidence) | Generated by the product itself; the most valuable data |
| Remittance advice and denial codes | Labels for the denial model | From eClaimLink, Shafafiya, NPHIES via the provider |
| Appeal outcomes | Labels for which fixes work | Feeds the rule library too |
| Code tables and guidelines | Retrieval index | Licensing required (see 5.4) |
| Payer circulars and policies | Rules and retrieval | Track versions and effective dates |

All training data is de-identified, stays in-country, and is used under a data processing agreement with each provider.

### 5.4 Licensing

Code sets are licensed products. Budget for them before production:

- **CPT:** American Medical Association licence.
- **ICD-10-AM, ACHI, ACS:** Independent Health and Aged Care Pricing Authority (Australia) licence; Saudi SBS through CHI.
- **SNOMED CT:** SNOMED International membership or affiliate licence, depending on country.
- **ICD-10-CM:** public domain (US), but local DHA/DoH versions and mappings must be tracked.

The prototype ships a small demo subset of codes and no ACHI pack, and says so in the app.

## 6. Guardrails and safety

| Risk | Guardrail | Where |
| --- | --- | --- |
| PHI reaches storage or a model | Deterministic redaction at ingest and before every pipeline run; pseudonymous patient reference enforced | `helpers/phiRedaction.tsx`, `create_POST`, `agentPipeline` |
| Model invents a code | Codes must come from the retrieved candidate list and the active code table | `agentPipeline` coding step, `CODE_VALID` rule |
| Model invents a clinical fact | Evidence must be a verbatim quote found in the note | `evidenceIsInNote` |
| Wrong code family for the market | `MARKET_SYSTEM` rule blocks ICD-10-CM on NPHIES and ICD-10-AM on eClaimLink | Rules engine |
| Weakly supported suggestion | Independent verifier model; low scores raise a rule hit | Verifier agent, `AI_EVIDENCE` rule |
| AI decides pass/fail | Only deterministic rules decide; AI output is advisory | Rules engine, risk model |
| Unreviewed claim goes out | Approval refused while blockers or unreviewed AI codes remain; approved claims are locked | `approve_POST`, `update_line_POST` |
| Prompt injection inside a note | Notes are passed as data; output is schema-constrained and every output is checked against the note and code tables; agents have no tools | Pipeline design |
| Silent model or prompt change | Prompt version is part of the cache key; model name, duration and credits logged per agent run | `aiClient`, `agent_runs` |
| Unauthorised access | Session auth on every endpoint; admin-only rule changes; full audit log | `withAuth`, `audit_log` |
| Medical device classification | Positioned as a billing and documentation tool; no diagnostic claims | Product scope |

## 7. LLM token and cost optimization

| Technique | Effect | Status |
| --- | --- | --- |
| Deterministic first (redaction, rules, scoring) | Most of the pipeline uses no model | Built |
| Retrieval of 20 to 30 candidate codes instead of the full code set | Coding prompt stays small even with 70k+ ICD codes | Built (lexical); vector retrieval next |
| Note budget (6,000 characters, whitespace compacted) | Caps input tokens per call | Built |
| Strict JSON schema outputs, low reasoning effort, capped output tokens | No wasted prose, predictable output size | Built |
| Fast, cheap model for extraction and coding; judge model (no text generated) for yes/no checks | Lowest-cost model that does the job | Built |
| Content-hash cache (prompt version + model + input) | Re-running an unchanged claim costs nothing | Built (`llm_cache`) |
| Batch verifier questions in one call | One call per claim instead of one per code | Built |
| Prompt caching of the static instruction prefix | Cuts repeated system prompt cost on providers that support it | Next |
| Section-aware note chunking (assessment and plan first) | Keeps the most relevant text inside the budget for long notes | Next |
| Small fine-tuned in-country model | Lowest marginal cost at scale | Later |

Each agent run records its model, duration, credits and whether it came from cache, and the dashboard shows totals.

## 8. Data model (prototype)

| Table | Purpose |
| --- | --- |
| `payers` | Payer, market (DHA, DOH, KSA), submission platform, base denial rate |
| `code_sets` | Codes per system (ICD10CM, ICD10AM, CPT, ACHI) with retrieval keywords, denial weight, pre-auth flag |
| `payer_rules` | Rule library: type, severity, params (JSON), source reference, version, active flag |
| `encounters` | One claim: de-identified note, payer, market, scores, pre-auth state, status, approval |
| `claim_lines` | Codes on the claim: source (submitted or AI), status, primary flag, evidence, confidence, verifier score |
| `extracted_facts` | Facts with verbatim evidence and negation |
| `rule_hits` | Current rule results per claim |
| `agent_runs` | One row per agent per run: model, status, duration, credits, summary |
| `llm_cache` | Content-hash cache of model outputs |
| `audit_log` | Every create, run, accept, reject, approve and rule change, with user and time |

## 9. Compliance and data residency

| Rule | Requirement | Production design |
| --- | --- | --- |
| UAE Federal Law No. 2 of 2019 (ICT in Health) and Ministerial Decision 51 of 2021 | Health data stored and processed in the UAE; records kept at least 25 years | UAE-region database, storage, logs, backups and model inference |
| UAE PDPL (Federal Decree-Law 45 of 2021) | Health data is sensitive personal data | Purpose limitation, DPIA, consent records |
| DoH ADHICS (Abu Dhabi) | Binding health cybersecurity standard | Map controls before the first Abu Dhabi customer |
| DoH AI policy (2018) and Responsible AI Standard (2025); DHA AI policy (2021) | Transparency, accountability, audit, safe shutdown | Evidence per suggestion, human approval, model and prompt versioning, kill switch per agent |
| Federal Decree-Law 38 of 2024 (medical products incl. software) | Medical-device software needs MOHAP registration | Stay a billing/documentation tool |
| Saudi PDPL (enforced 14 Sep 2024) and CHI rules | Sensitive data controls; transfers outside the Kingdom restricted | Separate in-Kingdom deployment for Saudi customers |

**Important:** the Floot prototype is for synthetic or de-identified data only. Before real patient data, run the same design on UAE-hosted infrastructure (for example Azure UAE North, AWS Middle East (UAE), Oracle Cloud UAE, or Core42) with an in-region model, and an in-Kingdom deployment for Saudi customers.

## 10. Production architecture (target)

| Layer | Prototype (Floot) | Production |
| --- | --- | --- |
| Web app | React + TypeScript pages | Same code, hosted in-region |
| API | Floot serverless endpoints | Same endpoints on in-region containers or functions |
| Database | Floot Postgres | Managed Postgres in UAE / KSA region, encrypted, point-in-time recovery |
| Models | Floot AI (gpt-6-luna for generation, Jev judge for yes/no) | In-region hosted model or self-hosted open model with LoRA adapters |
| Retrieval | Lexical scoring over `code_sets` | pgvector or a vector store in-region |
| Denial model | Logistic v0 in TypeScript | Gradient-boosted trees (Python) behind a small in-region API |
| Integrations | Paste note, JSON claim pack | FHIR R4 / HL7 v2 ingest; DHA/DoH claim XML; NPHIES FHIR bundles via a licensed partner |
| Identity | Email and password with roles | SSO (Entra ID / UAE PASS for staff where relevant), per-tenant isolation |
| Observability | Agent trace and audit log in the app | Central logging in-region, alerting, model drift dashboards |

## 11. Roadmap

| Phase | Weeks | Scope | Gate to move on |
| --- | --- | --- | --- |
| 1. Validate | 1 to 4 | One provider, 90 days of de-identified claims and remittances, retrospective denial study | Preventable denials shown in their own data |
| 2. Build MVP | 5 to 12 | This app plus claims/remittance file upload, denial analytics dashboard, one specialty, one or two payers | Works on the pilot's real (de-identified) claims |
| 3. Shadow pilot | 13 to 24 | Runs beside coders without changing claims; measure accept rate, false blockers, minutes per claim | Measured lift and a paid contract |
| 4. Assist and scale | Months 7 to 12 | In-region production, trained risk model, more payers and specialties, Saudi pack | Second customer live |

## 12. What is in this repository

- `docs/ARCHITECTURE.md` — this plan.
- `app/` — source of the Floot prototype (pages, components, helpers, endpoints). The app is built and hosted in Floot; this folder mirrors it for review and version history. Floot's stock UI kit and auth boilerplate are not copied.
- `db/` — database schema and the demo reference data (fictional payers, code examples, payer rules). No patient data.
