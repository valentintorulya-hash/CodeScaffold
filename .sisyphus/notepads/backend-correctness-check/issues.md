# Issues

- `python3` command alias is missing (`python` exists and resolves to Python 3.13.7).
- `caddy` is missing from PATH (`caddy version` and `which caddy` both failed).

- Task 1 remained static-only by design; runtime proxy verification remains pending and still depends on resolving missing `caddy` in PATH.

- Task 2 runbook confirms the same blocker remains active: required startup order cannot be fully executed because `caddy` is not available in PATH on this machine.

- Prod safety risk: if `ALLOW_PYTHON_FALLBACK` is left unset, fallback remains enabled by default; prod mode requires explicit `ALLOW_PYTHON_FALLBACK=false` (with `USE_FASTAPI_SERVICE=true`) to enforce FastAPI-required behavior.
- `DATABASE_URL` is mandatory for Prisma datasource and has no schema-level default; missing env value will break Prisma-dependent operations.

- Task 4 runtime proxy validation remains blocked because `caddy` is still missing from PATH (`which caddy` returned no match), so this step is limited to static `Caddyfile` audit evidence.

- Task 5 caveat: standalone-related shell orchestration in `.zscripts/*.sh` assumes POSIX shell tooling on Windows; reliable standalone execution path is Bun/Node scripts after build artifacts exist.

- Task 6 standalone TS signal check failed (`bunx tsc --noEmit`, exit status `2`): unresolved modules reported for websocket example files (`socket.io-client`, `socket.io`).
- This entry is diagnostic-only for backend-correctness signaling; no type-error remediation was performed as part of Task 6.

- Task 7 FastAPI PTY startup failed with bind error on `127.0.0.1:8000` (`WinError 10048`), indicating port 8000 was already occupied by another process.
- Because the spawned PTY process exited during boot, this run cannot prove that this specific start command instance reached serving state; evidence recorded as FAIL despite `/health` returning 200.

- Root cause for Task 7 failure was a stale prior `scripts/ml_service.py` process (PID 50816) still listening on port 8000; this is an operational cleanup issue between verification runs.
- Mitigation used in-task: detect listener (`netstat -ano`), identify owner (`Get-CimInstance Win32_Process`), terminate stale PID, then run controlled PTY instance and stop it gracefully.

- Task 8 startup shows a non-blocking Next.js warning about inferred Turbopack root due to multiple lockfiles; server still reached Ready state and `/api` verification passed.
- Ctrl+C shutdown of `bun run dev` reports script exit code `58` in PTY output; treated as expected interrupt behavior after successful verification, not a startup failure.

- Task 9 remains blocked by missing Caddy binary: PTY startup `cmd /c caddy run --config Caddyfile` exited with code 1 and command-not-found output (`"caddy" не является внутренней или внешней командой...`).
- Missing-binary evidence reconfirmed by both resolvers (`where.exe caddy` -> not found, `which caddy` -> no caddy in PATH); proxy check `curl -i --max-time 10 http://127.0.0.1:81/api` failed with connection error to port 81.

- Task 10 runtime probe in this run failed for both endpoints: direct `:3000` and via-Caddy `:81` each returned `curl: (7) Failed to connect` (no listener reachable).

- Task 10 controlled rerun still shows proxy blocker unchanged: `curl -i --max-time 10 http://127.0.0.1:81/api` failed with `curl: (7) Failed to connect` while direct `:3000` passed.

- Task 11 via-Caddy healthCheck remains blocked: `curl -i -X POST http://127.0.0.1:81/api/ml ...` failed with `curl: (7) Failed to connect to 127.0.0.1 port 81`.
- Task 12 used direct endpoint http://127.0.0.1:3000/api/ml because Caddy :81 is unavailable in this environment.

- [2026-02-17 12:56:57] Task 13 used direct endpoint http://127.0.0.1:3000/api/ml because Caddy (:81) is unavailable in this environment.

- Task 14/15/16/17 were executed against direct host paths (`:3000` and temporary `:3001`) due persistent Caddy unavailability in this environment.
- Task 18 standalone verification showed a nested `.next/standalone/...` layout (repo path embedded) rather than a flat root-level `server.js`; checks must account for Next 16 output shape.
- Task 19 confirms Caddy-path verification is still blocked (`curl :81` connect failure and `caddy` executable missing), even though direct standalone runtime endpoints are reachable.
