# Learnings

## 2026-02-14 baseline (pre-change)

base_url: http://localhost:3001

runFullAnalysis (fixed payload: start_date=2023-01-01, end_date=2024-01-01, look_back=60, lstm_units=[50,50], epochs=30, batch_size=32)
- successful durations_ms: [148076, 148790, 146467, 152958, 155883]
- avg_ms: 150435
- p50_ms: 148790
- p95_ms: 155298

forecastFuture days=30
- duration_ms: 7

invalid action (unknownAction)
- status: 400
- duration_ms: 10

notes
- Port 3000 was busy; used port 3001.
- Two runFullAnalysis attempts failed due to dev server crash mid-request; restarted dev server and continued until 5 successful runs collected.
- Evidence JSON: .sisyphus/evidence/perf-baseline.json
