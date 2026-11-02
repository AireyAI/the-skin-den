<!-- SPECKIT START -->
For additional context about technologies to be used, project structure,
shell commands, and other important information, read the current plan
<!-- SPECKIT END -->

# The Skin Den Claude Code guide

Use `.specify/memory/constitution.md` for current client/design rules. `docs/PROJECT_CONTEXT.md` is a dated handoff: verify details in current source before relying on it. This folder is the canonical Skin Den website and its tenant-specific `platform-api`; do not share its API, data, or credentials with Kettle Kulture. The website uses the existing static HTML/CSS/JS and Tailwind build; preserve its components, warm cream/taupe/charcoal palette, real client-approved media and white-label identity. Keep content and prices sourced from current approved files. Small edits do not need a new Spec-Kit cycle; use a current spec/plan when one exists for larger work. Keep `.env`, local credentials, account data and ignored provisioning files private. Preserve booking/payment providers; never enable payments or alter live accounts without approval. No deploy or DNS changes without approval.

Local preview: run `node preview-safe.mjs` at http://127.0.0.1:4318. It serves tracked public HTML/assets plus generated dist/styles.css, denies private directories and binds only to loopback. New public files must be deliberately included before they appear. Do not use the old serve.mjs.

For websites, backend features and staff dashboards apply `.claude/reference/product-delivery.md` proportionally. Use automatic designer routing on this Mac; report missing designer/skills in hosted environments instead of silently substituting.

For substantial design use the research handoff in `.claude/reference/design-search.md`: parent → design-researcher (Sonnet/medium) → parent → designer (Opus/xhigh). Use Haiku for bounded official-document fact extraction. Reuse existing research on small changes.
