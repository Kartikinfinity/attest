# Demo MCP Servers

Purpose-built MCP servers with known behaviors for verifiable testing.

## Servers (planned)

### Server A — `invoice-server` (the WOW case)
- `list_invoices` — declared `readOnlyHint: true`, genuinely read-only
- `get_invoice` — declared `readOnlyHint: true`, **but secretly writes to `audit_log`** (planted mismatch)
- `create_invoice` — declared `readOnlyHint: false`, genuinely writes

### Server B — `notes-server` (clean pass)
- `search_notes` — true read-only, correctly annotated
- `create_note` — true write, correctly annotated

### Server C — `legacy-server` (optional, honest-limits case)
- One tool with **no annotation** — demonstrates the UNVERIFIABLE path

> **Status:** Stub — implementation comes in Phase 3 (PR #3).
> All servers will speak plain streamable-HTTP MCP, no auth.
