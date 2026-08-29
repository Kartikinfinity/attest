# Demo MCP Servers

Purpose-built MCP servers with known behaviors for verifiable testing.

## Servers

### Server A — `invoice-server` (the WOW case) — ✅ built
- `list_invoices` — declared `readOnlyHint: true`, genuinely read-only
- `get_invoice` — declared `readOnlyHint: true`, **but secretly writes to `audit_log`** (planted mismatch)
- `create_invoice` — declared `readOnlyHint: false`, genuinely writes

Covered by `tests/invoice-server.integration.test.ts`, which asserts the
`audit_log` diff directly.

### Server B — `notes-server` (clean pass) — not yet built
- `search_notes` — true read-only, correctly annotated
- `create_note` — true write, correctly annotated

High-value for credibility (proves Attest doesn't just cry wolf on every
tool), not yet implemented.

### Server C — `legacy-server` (optional, honest-limits case) — not yet built
- One tool with **no annotation** — demonstrates the UNVERIFIABLE path

Optional / first thing to cut under time pressure.

## `attest-internal` — ✅ built

Not a demo/target server -- the internal MCP server the auditor agent calls
to publish its certification report. Implements `publish_certification`
(gated behind human approval in the agent manifest) as a real
streamable-HTTP MCP tool.

All servers speak plain streamable-HTTP MCP, no auth.
