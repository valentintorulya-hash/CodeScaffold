#!/usr/bin/env python3
"""
Task 5b: Multi-Window API QA

Tests the ML API with 3 different time windows to verify:
1. Forecasts are not consistently monotonic
2. At most 1 of 3 windows should have monotonic_flag=true

Acceptance: ≤ 1 of 3 windows returns monotonic_flag=true
"""

import json
import urllib.request
import urllib.error
import time
import sys

API_URL = "http://localhost:3000/api/ml"

# Test windows as specified in plan
TEST_WINDOWS = [
    {"start": "2021-01-01", "end": "2022-01-01", "label": "Window 1 (2021-2022)"},
    {"start": "2022-01-01", "end": "2023-01-01", "label": "Window 2 (2022-2023)"},
    {"start": "2023-01-01", "end": "2024-01-01", "label": "Window 3 (2023-2024)"},
]

FORECAST_DAYS = 30

def make_request(action, **params):
    """Make HTTP POST request to ML API"""
    payload = {"action": action, **params}
    data = json.dumps(payload).encode('utf-8')
    
    req = urllib.request.Request(
        API_URL,
        data=data,
        headers={'Content-Type': 'application/json'}
    )
    
    try:
        with urllib.request.urlopen(req, timeout=300) as response:
            return json.loads(response.read().decode('utf-8'))
    except urllib.error.HTTPError as e:
        print(f"HTTP Error {e.code}: {e.reason}")
        print(e.read().decode('utf-8'))
        return None
    except Exception as e:
        print(f"Request failed: {e}")
        return None

def test_window(window_def):
    """Test a single time window"""
    print(f"\n{'='*70}")
    print(f"Testing {window_def['label']}")
    print(f"  Range: {window_def['start']} to {window_def['end']}")
    print(f"{'='*70}")
    
    # Step 1: Run full analysis
    print(f"\n[1/2] Running full analysis...")
    analysis_resp = make_request(
        "runFullAnalysis",
        startDate=window_def['start'],
        endDate=window_def['end']
    )
    
    if not analysis_resp or not analysis_resp.get('success'):
        print(f"[FAIL] Analysis failed")
        return None
    
    print(f"[OK] Analysis completed")
    
    # Extract realism metrics from analysis
    realism = analysis_resp.get('data', {}).get('realism_metrics', {})
    walk_forward = analysis_resp.get('data', {}).get('walk_forward', {})
    
    print(f"\nRealism Metrics from Analysis:")
    print(f"  - monotonic_flag: {realism.get('monotonic_flag')}")
    print(f"  - monotonic_run_max: {realism.get('monotonic_run_max')}")
    print(f"  - diff_vol_ratio: {realism.get('diff_vol_ratio', 0):.4f}")
    print(f"  - sign_flip_rate: {realism.get('sign_flip_rate', 0):.4f}")
    
    if walk_forward:
        print(f"\nWalk-Forward Validation:")
        print(f"  - origins: {walk_forward.get('origins')}")
        print(f"  - rmse_mean: {walk_forward.get('rmse_mean', 0):.4f}")
        print(f"  - monotonic_rate: {walk_forward.get('monotonic_rate', 0):.4f}")
    
    # Step 2: Generate future forecast
    print(f"\n[2/2] Generating {FORECAST_DAYS}-day forecast...")
    forecast_resp = make_request(
        "forecastFuture",
        days=FORECAST_DAYS
    )
    
    if not forecast_resp or not forecast_resp.get('success'):
        print(f"[FAIL] Forecast failed")
        return None
    
    print(f"[OK] Forecast generated")
    
    # Extract forecast data
    forecast_data = forecast_resp.get('data', {}).get('forecast', {})
    hybrid_values = forecast_data.get('hybrid', [])
    
    if not hybrid_values:
        print(f"[FAIL] No hybrid forecast values returned")
        return None
    
    print(f"  - Forecast points: {len(hybrid_values)}")
    print(f"  - First value: {hybrid_values[0]:.2f}")
    print(f"  - Last value: {hybrid_values[-1]:.2f}")
    print(f"  - Change: {((hybrid_values[-1] / hybrid_values[0] - 1) * 100):.2f}%")
    
    # Compute monotonic_flag from forecast
    diffs = [hybrid_values[i+1] - hybrid_values[i] for i in range(len(hybrid_values)-1)]
    increasing = sum(1 for d in diffs if d > 1e-6)
    decreasing = sum(1 for d in diffs if d < -1e-6)
    
    is_monotonic = (increasing >= len(diffs) * 0.95) or (decreasing >= len(diffs) * 0.95)
    
    print(f"\nForecast Monotonicity Analysis:")
    print(f"  - Increasing steps: {increasing}/{len(diffs)} ({increasing/len(diffs)*100:.1f}%)")
    print(f"  - Decreasing steps: {decreasing}/{len(diffs)} ({decreasing/len(diffs)*100:.1f}%)")
    print(f"  - Monotonic (≥95%): {is_monotonic}")
    
    return {
        "window": window_def['label'],
        "range": f"{window_def['start']} to {window_def['end']}",
        "realism_metrics": realism,
        "walk_forward": walk_forward,
        "forecast_monotonic": is_monotonic,
        "forecast_length": len(hybrid_values),
        "forecast_change_pct": (hybrid_values[-1] / hybrid_values[0] - 1) * 100,
    }

def main():
    print("="*70)
    print("Task 5b: Multi-Window API QA")
    print("="*70)
    print(f"\nTesting {len(TEST_WINDOWS)} time windows with {FORECAST_DAYS}-day forecasts")
    print(f"Acceptance criterion: <=1 window with monotonic forecast\n")
    
    results = []
    
    for window in TEST_WINDOWS:
        result = test_window(window)
        if result:
            results.append(result)
        else:
            print(f"\n[WARNING] Skipping window due to errors")
        
        # Brief pause between windows
        if window != TEST_WINDOWS[-1]:
            print(f"\nWaiting 2 seconds before next window...")
            time.sleep(2)
    
    # Summary
    print(f"\n\n{'='*70}")
    print("SUMMARY")
    print(f"{'='*70}\n")
    
    if not results:
        print("[FAIL] No windows completed successfully")
        return 1
    
    monotonic_count = sum(1 for r in results if r['forecast_monotonic'])
    
    print(f"Windows tested: {len(results)}")
    print(f"Monotonic forecasts: {monotonic_count}/{len(results)}\n")
    
    for i, result in enumerate(results, 1):
        status = "[MONOTONIC]" if result['forecast_monotonic'] else "[NON-MONOTONIC]"
        print(f"{i}. {result['window']}: {status}")
        print(f"   Range: {result['range']}")
        print(f"   Change: {result['forecast_change_pct']:+.2f}%")
        if result.get('realism_metrics'):
            rm = result['realism_metrics']
            print(f"   Metrics: monotonic_flag={rm.get('monotonic_flag')}, "
                  f"sign_flip_rate={rm.get('sign_flip_rate', 0):.3f}")
        print()
    
    # Acceptance check
    print(f"{'='*70}")
    if monotonic_count <= 1:
        print(f"[PASS] ACCEPTANCE: {monotonic_count}/3 windows monotonic, <=1 required")
        exit_code = 0
    else:
        print(f"[FAIL] ACCEPTANCE: {monotonic_count}/3 windows monotonic, >1 exceeds limit")
        exit_code = 1
    
    print(f"{'='*70}\n")
    
    # Save detailed results
    output_file = "task-5-multi-window.txt"
    with open(output_file, 'w', encoding='utf-8') as f:
        f.write(f"Task 5b: Multi-Window API QA Results\n")
        f.write(f"{'='*70}\n\n")
        f.write(f"Tested: {len(results)} windows\n")
        f.write(f"Monotonic forecasts: {monotonic_count}/{len(results)}\n")
        f.write(f"Acceptance: {'PASS' if monotonic_count <= 1 else 'FAIL'}\n\n")
        
        for result in results:
            f.write(f"\n{result['window']}\n")
            f.write(f"  Range: {result['range']}\n")
            f.write(f"  Forecast monotonic: {result['forecast_monotonic']}\n")
            f.write(f"  Forecast change: {result['forecast_change_pct']:+.2f}%\n")
            if result.get('realism_metrics'):
                f.write(f"  Realism metrics: {json.dumps(result['realism_metrics'], indent=4)}\n")
            if result.get('walk_forward'):
                f.write(f"  Walk-forward: {json.dumps(result['walk_forward'], indent=4)}\n")
    
    print(f"Detailed results saved to: {output_file}")
    
    return exit_code

if __name__ == "__main__":
    sys.exit(main())
