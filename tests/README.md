# Tests

Integration and end-to-end tests for Attest.

- `invoice-server.integration.test.ts` — spins up the real `demo-servers/invoice-server`
  against a disposable fixture and calls all three tools, asserting the planted
  mismatch: `audit_log` goes from 3 rows to 4 after `get_invoice`, even though
  the tool declares `readOnlyHint: true`. This is the core "WOW case" the whole
  product exists to catch.
- Unit tests for the deterministic verdict logic live separately, in
  `packages/verdict-engine/src/derive-verdict.test.ts`.

Run with `npm test` from the repo root (runs both the verdict-engine unit tests
and this integration test via Vitest).
