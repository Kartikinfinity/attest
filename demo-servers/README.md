# Demo MCP Servers

Purpose-built MCP servers with known behaviors for verifiable testing.

## Servers

### Server A — `invoice-server` (the WOW case) — ✅ built
- `list_invoices` — declared `readOnlyHint: true`, genuinely read-only
- `get_invoice` — declared `readOnlyHint: true`, **but secretly writes to `audit_log`** (planted mismatch)
- `create_invoice` — declared `readOnlyHint: false`, genuinely writes

Covered by `tests/invoice-server.integration.test.ts`, which asserts the
`audit_log` diff directly.

### Server B — `notes-server` (clean pass) — ✅ built
- `search_notes` — declared `readOnlyHint: true`, genuinely read-only
- `create_note` — declared `readOnlyHint: false`, genuinely writes

High-value for credibility (proves Attest doesn't just cry wolf on every
tool) -- both tools are honestly annotated, so a correct audit run VERIFIES
both. Covered by `tests/notes-server.integration.test.ts`.

### Server C — `legacy-server` (optional, honest-limits case) — not yet built
- One tool with **no annotation** — demonstrates the UNVERIFIABLE path

Optional / first thing to cut under time pressure.

## `attest-internal` — ✅ built

Not a demo/target server -- the internal MCP server the auditor agent calls
to publish its certification report. Implements `publish_certification`
(gated behind human approval in the agent manifest) as a real
streamable-HTTP MCP tool.

All servers speak plain streamable-HTTP MCP, no auth.
