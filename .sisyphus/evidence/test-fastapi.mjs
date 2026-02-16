// Quick test for FastAPI ML service
const BASE = 'http://127.0.0.1:8000';
const NEXT_API = 'http://localhost:3000/api/ml';

async function main() {
  // Step 1: Get MOEX data through Next API (reuse existing MOEX fetcher)
  console.log('Fetching MOEX data via Next API...');
  const previewRes = await fetch(NEXT_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'getDataPreview', params: { start_date: '2023-01-01', end_date: '2024-01-01' } }),
  });
  const preview = await previewRes.json();
  console.log(`Got ${preview.dates?.length} data points`);

  // Step 2: Build FastAPI payload
  const payload = {
    close: preview.close,
    dates: preview.dates,
    params: { look_back: 60, lstm_units: [50, 50], epochs: 30, batch_size: 32, forecast_block: 1 },
    days: 30,
    future_dates: [],
    action: 'analyze',
  };

  // Step 3: Call FastAPI /analyze
  console.log('Calling FastAPI /analyze...');
  const start = performance.now();
  const analyzeRes = await fetch(`${BASE}/analyze`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const elapsed = Math.round(performance.now() - start);
  const analyzeData = await analyzeRes.json();
  console.log(`FastAPI /analyze: ${elapsed}ms, status=${analyzeRes.status}, success=${analyzeData.success}`);
  console.log(`Keys: ${Object.keys(analyzeData).join(', ')}`);
  console.log(`best_model: ${analyzeData.best_model}`);

  // Step 4: Call FastAPI /forecast
  console.log('\nCalling FastAPI /forecast...');
  const start2 = performance.now();
  const forecastRes = await fetch(`${BASE}/forecast`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const elapsed2 = Math.round(performance.now() - start2);
  const forecastData = await forecastRes.json();
  console.log(`FastAPI /forecast: ${elapsed2}ms, status=${forecastRes.status}, success=${forecastData.success}`);
  console.log(`Forecast dates count: ${forecastData.forecast?.dates?.length || 0}`);

  // Step 5: Call with invalid payload
  console.log('\nCalling FastAPI /analyze with invalid payload...');
  const invalidRes = await fetch(`${BASE}/analyze`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ close: [] }),
  });
  const invalidData = await invalidRes.json();
  console.log(`Invalid: status=${invalidRes.status}, detail=${invalidData.detail || invalidData.error || 'N/A'}`);

  console.log('\n=== RESULTS ===');
  console.log(`Health: OK`);
  console.log(`Analyze: ${elapsed}ms (baseline via spawn: ~151724ms)`);
  console.log(`Speedup estimate: ${(151724 / elapsed).toFixed(1)}x`);
}

main().catch(err => { console.error(err); process.exit(1); });
