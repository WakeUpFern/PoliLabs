# Labora / PoliLabs — Project instructions

## Context and sources

Labora manages academic and operational laboratory processes. PoliLabs is the repository name; the initial setting is Laboratorio de Pesados, UPIITA-IPN, Mexico, for university social service. Keep the core extensible to other laboratories.

The authoritative SRS is **`docs/srs/PoliLabs-SRS.tex`** (actual case-sensitive path). The previously referenced `docs/srs/labora-srs.tex` does not exist. Read relevant requirements before domain work; do not move, edit or duplicate the original SRS without authorization. Do not implement the full SRS at once or invent institutional requirements/integrations.

Before significant changes, read `docs/architecture/README.md` and applicable ADRs in `docs/decisions/`. Explain conflicts or ambiguities before implementing incompatible changes.

## Agreed architecture

Use TypeScript, Next.js App Router/React, PostgreSQL and Drizzle in a modular monolith. Tailwind is configured; add UI libraries only for concrete needs. AWS is the eventual target, S3 the intended object store, and Bedrock the future AI provider. Local development must work without AWS. Do not provision paid resources or add infrastructure without task authorization and a concrete need.

Keep domain rules independent of React, HTTP, persistence and AI SDKs. Add `domain/` and `application/` within each module as needed; application services own validation, authorization and transaction coordination. UI and AI reuse those services. Avoid generic repositories, empty abstractions and microservices. PostgreSQL is authoritative; protect inventory and reservations against concurrent writes with appropriate database constraints and transactions.

## Giussepe and security

Giussepe is an additional interface, never an operational authority. Tools invoke application services under the authenticated user's permissions; no direct tables, generated SQL execution or privileged bypass. Resolve real identifiers and relations, revalidate critical conditions before writes, confirm sensitive actions appropriately and audit their origin. Never infer stock or availability from language or memory.

Never commit secrets or real personal data in fixtures. Document variable names in `.env.example`; keep actual values in ignored environment files. Do not log connection URLs. Separate authentication from domain authorization. Never store institutional passwords or assume authorized IPN integrations. Destructive database operations require explicit approval.

## Incremental workflow and validation

Implement only the requested scope and explain significant architectural changes first. Consult requirements, architecture and ADRs; implement domain/application behavior with validation and suitable tests; integrate UI when needed. Do not modify unrelated modules.

Use `pnpm`, Node.js 24 and the committed lockfile. Run `pnpm check` and `pnpm build` for applicable changes. Use unit tests for rules and validation, integration tests against PostgreSQL for transactions/constraints/concurrency, and end-to-end tests for implemented user flows. Never describe unexecuted checks as passed. No placeholder tests merely to fill module directories.

Review generated SQL before applying migrations; version migrations with the feature. Do not use schema push as a substitute for migrations or run destructive operations without explicit approval.

Maintain architecture documentation in the same changeset as material architectural changes. ADRs use consecutive numbers and include title, status (Propuesta/Aceptada/Reemplazada/Rechazada), context, decision, alternatives, consequences and SRS references. Accept only explicit SRS/project decisions or user approvals; keep pending choices proposed. Add replacement ADRs and cross-link old decisions; preserve history and update the index. Do not write an ADR for every implementation detail.

Communicate in Spanish; use English code identifiers. Report changes, actual validation outcomes, limitations and pending decisions clearly. Product scope remains under the developer's control.
