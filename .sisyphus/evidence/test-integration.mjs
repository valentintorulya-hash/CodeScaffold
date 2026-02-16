// Integration test: runFullAnalysis through Next.js API → FastAPI
const API = 'http://localhost:3000/api/ml';

async function test() {
  console.log('=== Integration Test: runFullAnalysis (consolidated) ===\n');

  const t0 = Date.now();
  const res = await fetch(API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'runFullAnalysis',
      params: {
        start_date: '2023-01-01',
        look_back: 60,
        lstm_units: [50, 50],
        epochs: 50,
        batch_size: 32,
      },
    }),
  });

  const elapsed = Date.now() - t0;
  const data = await res.json();

  console.log(`HTTP status: ${res.status}`);
  console.log(`Time: ${elapsed}ms (${(elapsed / 1000).toFixed(1)}s)`);
  console.log(`success: ${data.success}`);

  if (!data.success) {
    console.log(`ERROR: ${data.error}`);
    process.exit(1);
  }

  // Check consolidated fields
  const checks = {
    data_info: !!data.data_info,
    comparison_table: Array.isArray(data.comparison_table),
    best_model: typeof data.best_model === 'string',
    predictions: !!data.predictions && Array.isArray(data.predictions.dates),
    stationarity: !!data.stationarity && !!data.stationarity.adf,
    forecast: !!data.forecast && Array.isArray(data.forecast.dates),
    dates: Array.isArray(data.dates) && data.dates.length > 0,
    close: Array.isArray(data.close) && data.close.length > 0,
    avg_price: Array.isArray(data.avg_price) && data.avg_price.length > 0,
  };

  console.log('\n--- Consolidated field checks ---');
  let allPass = true;
  for (const [key, ok] of Object.entries(checks)) {
    const icon = ok ? '✓' : '✗';
    console.log(`  ${icon} ${key}`);
    if (!ok) allPass = false;
  }

  console.log(`\ndata_info: ${JSON.stringify(data.data_info)}`);
  console.log(`best_model: ${data.best_model}`);
  console.log(`comparison_table models: ${data.comparison_table?.map(m => m.Model).join(', ')}`);
  console.log(`predictions.dates length: ${data.predictions?.dates?.length}`);
  console.log(`stationarity.stationarity_type: ${data.stationarity?.stationarity_type}`);
  console.log(`forecast.dates length: ${data.forecast?.dates?.length}`);
  console.log(`dates length: ${data.dates?.length}`);
  console.log(`close length: ${data.close?.length}`);
  console.log(`avg_price length: ${data.avg_price?.length}`);

  if (allPass) {
    console.log('\n✅ ALL CHECKS PASSED — consolidated response works!');
  } else {
    console.log('\n❌ SOME CHECKS FAILED');
    process.exit(1);
  }

  // Also test forecastFuture (should hit cache from consolidated)
  console.log('\n=== Test forecastFuture(30) from cache ===');
  const t1 = Date.now();
  const res2 = await fetch(API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'forecastFuture', params: { days: 30 } }),
  });
  const data2 = await res2.json();
  const elapsed2 = Date.now() - t1;
  console.log(`HTTP status: ${res2.status}, Time: ${elapsed2}ms`);
  console.log(`success: ${data2.success}, forecast.dates length: ${data2.forecast?.dates?.length}`);

  console.log('\n=== DONE ===');
}

test().catch(e => { console.error(e); process.exit(1); });
