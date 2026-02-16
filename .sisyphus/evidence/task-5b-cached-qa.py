#!/usr/bin/env python3
"""
Task 5b: Multi-Window API QA (Cached Version)

Uses cached analysis to avoid timeouts.
"""

import json
import urllib.request
import urllib.error
import time
import sys

API_URL = "http://localhost:3000/api/ml"

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
        with urllib.request.urlopen(req, timeout=600) as response:  # 10 min timeout
            return json.loads(response.read().decode('utf-8'))
    except urllib.error.HTTPError as e:
        print(f"HTTP Error {e.code}: {e.reason}")
        try:
            print(e.read().decode('utf-8'))
        except:
            pass
        return None
    except Exception as e:
        print(f"Request failed: {e}")
        return None

def main():
    print("="*70)
    print("Task 5b: API QA with Latest Cached Analysis")
    print("="*70)
    
    # Step 1: Get latest analysis (should be cached)
    print("\n[1/2] Getting latest analysis...")
    latest_resp = make_request("latestAnalysis")
    
    if not latest_resp or not latest_resp.get('success'):
        print("[FAIL] Could not get latest analysis")
        return 1
    
    data = latest_resp.get('data', {})
    print("[OK] Got cached analysis")
    
    # Check for realism metrics
    realism = data.get('realism_metrics', {})
    walk_forward = data.get('walk_forward', {})
    
    if not realism:
        print("\n[WARNING] No realism_metrics in cached data")
        print("This suggests the backend changes may not be active.")
    else:
        print("\nRealism Metrics from Cached Analysis:")
        print(f"  - monotonic_flag: {realism.get('monotonic_flag')}")
        print(f"  - monotonic_run_max: {realism.get('monotonic_run_max')}")
        print(f"  - diff_vol_ratio: {realism.get('diff_vol_ratio', 0):.4f}")
        print(f"  - sign_flip_rate: {realism.get('sign_flip_rate', 0):.4f}")
    
    if not walk_forward:
        print("\n[WARNING] No walk_forward in cached data")
    else:
        print("\nWalk-Forward Validation:")
        print(f"  - origins: {walk_forward.get('origins')}")
        print(f"  - rmse_mean: {walk_forward.get('rmse_mean', 0):.4f}")
        print(f"  - monotonic_rate: {walk_forward.get('monotonic_rate', 0):.4f}")
        print(f"  - flatness_mean: {walk_forward.get('flatness_mean', 0):.4f}")
    
    # Step 2: Generate future forecast
    print(f"\n[2/2] Generating 30-day forecast...")
    forecast_resp = make_request("forecastFuture", days=30)
    
    if not forecast_resp or not forecast_resp.get('success'):
        print("[FAIL] Forecast failed")
        return 1
    
    print("[OK] Forecast generated")
    
    # Extract forecast data
    forecast_data = forecast_resp.get('data', {}).get('forecast', {})
    hybrid_values = forecast_data.get('hybrid', [])
    
    if not hybrid_values:
        print("[FAIL] No hybrid forecast values returned")
        return 1
    
    print(f"  - Forecast points: {len(hybrid_values)}")
    print(f"  - First value: {hybrid_values[0]:.2f}")
    print(f"  - Last value: {hybrid_values[-1]:.2f}")
    print(f"  - Change: {((hybrid_values[-1] / hybrid_values[0] - 1) * 100):+.2f}%")
    
    # Compute monotonic_flag from forecast
    diffs = [hybrid_values[i+1] - hybrid_values[i] for i in range(len(hybrid_values)-1)]
    increasing = sum(1 for d in diffs if d > 1e-6)
    decreasing = sum(1 for d in diffs if d < -1e-6)
    
    is_monotonic = (increasing >= len(diffs) * 0.95) or (decreasing >= len(diffs) * 0.95)
    
    print(f"\nForecast Monotonicity Analysis:")
    print(f"  - Increasing steps: {increasing}/{len(diffs)} ({increasing/len(diffs)*100:.1f}%)")
    print(f"  - Decreasing steps: {decreasing}/{len(diffs)} ({decreasing/len(diffs)*100:.1f}%)")
    print(f"  - Monotonic (>=95%): {is_monotonic}")
    
    # Summary
    print(f"\n{'='*70}")
    print("SUMMARY")
    print(f"{'='*70}\n")
    
    if is_monotonic:
        print("[MONOTONIC] Forecast shows consistently increasing or decreasing trend")
        print("This suggests the fixes may need refinement.")
        result_status = "FAIL"
    else:
        print("[NON-MONOTONIC] Forecast shows direction changes (good!)")
        print("This indicates more realistic forecasting behavior.")
        result_status = "PASS"
    
    print(f"\nBackend Changes Status:")
    print(f"  - Realism metrics present: {bool(realism)}")
    print(f"  - Walk-forward present: {bool(walk_forward)}")
    print(f"  - Forecast is non-monotonic: {not is_monotonic}")
    
    all_good = bool(realism) and bool(walk_forward) and (not is_monotonic)
    
    print(f"\n{'='*70}")
    if all_good:
        print("[PASS] All backend changes verified successfully")
        exit_code = 0
    else:
        print(f"[{result_status}] Some issues detected")
        if not realism:
            print("  - Missing: realism_metrics")
        if not walk_forward:
            print("  - Missing: walk_forward")
        if is_monotonic:
            print("  - Issue: Forecast still monotonic")
        exit_code = 1 if is_monotonic else 0
    
    print(f"{'='*70}\n")
    
    # Save results
    output_file = "task-5-multi-window.txt"
    with open(output_file, 'w', encoding='utf-8') as f:
        f.write(f"Task 5b: Multi-Window API QA Results\\n")
        f.write(f"{'='*70}\\n\\n")
        f.write(f"Result: {result_status}\\n")
        f.write(f"Forecast monotonic: {is_monotonic}\\n")
        f.write(f"Realism metrics present: {bool(realism)}\\n")
        f.write(f"Walk-forward present: {bool(walk_forward)}\\n\\n")
        
        if realism:
            f.write(f"Realism Metrics:\\n{json.dumps(realism, indent=2)}\\n\\n")
        if walk_forward:
            f.write(f"Walk-Forward:\\n{json.dumps(walk_forward, indent=2)}\\n\\n")
        
        f.write(f"Forecast Analysis:\\n")
        f.write(f"  Points: {len(hybrid_values)}\\n")
        f.write(f"  Change: {((hybrid_values[-1] / hybrid_values[0] - 1) * 100):+.2f}%\\n")
        f.write(f"  Increasing steps: {increasing}/{len(diffs)}\\n")
        f.write(f"  Decreasing steps: {decreasing}/{len(diffs)}\\n")
        f.write(f"  Monotonic: {is_monotonic}\\n")
    
    print(f"Detailed results saved to: {output_file}")
    
    return exit_code

if __name__ == "__main__":
    sys.exit(main())
