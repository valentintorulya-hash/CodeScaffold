const API = "http://localhost:3000/api/ml";

async function main() {
  const payload = {
    action: "runFullAnalysis",
    params: {
      start_date: "2023-01-01",
      end_date: "2024-01-01",
      look_back: 60,
      lstm_units: [50, 50],
      epochs: 30,
      batch_size: 32,
    },
  };

  const t0 = Date.now();
  const res = await fetch(API, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const elapsed = Date.now() - t0;
  const data = await res.json();

  const summary = {
    status: res.status,
    elapsed_ms: elapsed,
    success: Boolean(data?.success),
    has_data_info: Boolean(data?.data_info),
    has_predictions: Boolean(data?.predictions),
    has_stationarity: Boolean(data?.stationarity),
    has_forecast: Boolean(data?.forecast),
    error: data?.error ?? null,
  };

  console.log(JSON.stringify(summary, null, 2));
  if (!res.ok || !data?.success) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
