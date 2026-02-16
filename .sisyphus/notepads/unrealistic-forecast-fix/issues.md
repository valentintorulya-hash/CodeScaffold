# Issues

Append-only. Track blockers, errors, and their resolutions.

## 2026-02-14 - Verification tool limitations

- Project-level LSP diagnostics: tool error "No LSP server configured for extension" when running diagnostics on `.`.
- Python LSP: server `basedpyright` configured but not installed: "Command not found: basedpyright-langserver".
- TS/JS LSP: `biome` binary not found on Windows (diagnostics limited).
- Tests: `bun test` reports "0 test files matching ..." (no test suite configured).
- Build: `bun run build` succeeds.
- Python compile check: `python -m py_compile scripts/ml_backend.py` succeeds.
