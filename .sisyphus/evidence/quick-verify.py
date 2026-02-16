#!/usr/bin/env python3
"""
Task 5b: Quick Single-Window Verification

Tests with minimal 2-month range to verify system works end-to-end.
"""

import json
import urllib.request
import urllib.error
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
        with urllib.request.urlopen(req, timeout=600) as response:
            return json.loads(response.read().decode('utf-8'))
    except Exception as e:
        print(f"Request failed: {e}")
        return None

def main():
    print("="*70)
    print("Task 5b: Quick Single-Window Verification")
    print("="*70)
    print("\nUsing minimal 2-month range to verify system works\n")
    
    # Small date range for quick test
    print("[1/2] Running analysis (2023-11-01 to 2023-12-31)...")
    analysis_resp = make_request(
        "runFullAnalysis",
        start_date="2023-11-01",
        end_date="2023-12-31"
    )
    
    if not analysis_resp or not analysis_resp.get('success'):
        print("[FAIL] Analysis failed")
        return 1
    
    print("[OK] Analysis completed")
    
    # Check for new fields
    has_realism = 'realism_metrics' in analysis_resp
    has_walk_forward = 'walk_forward' in analysis_resp
    
    print(f"\n[CHECK] realism_metrics present: {has_realism}")
    print(f"[CHECK] walk_forward present: {has_walk_forward}")
    
    if has_realism:
        rm = analysis_resp['realism_metrics']
        print(f"\nRealism Metrics:")
        print(f"  monotonic_flag: {rm.get('monotonic_flag')}")
        print(f"  diff_vol_ratio: {rm.get('diff_vol_ratio', 0):.4f}")
    
    if has_walk_forward:
        wf = analysis_resp['walk_forward']
        print(f"\nWalk-Forward:")
        print(f"  origins: {wf.get('origins')}")
        print(f"  monotonic_rate: {wf.get('monotonic_rate', 0):.4f}")
    
    # Generate forecast
    print(f"\n[2/2] Generating 30-day forecast...")
    forecast_resp = make_request("forecastFuture", days=30)
    
    if not forecast_resp or not forecast_resp.get('success'):
        print("[FAIL] Forecast failed")
        return 1
    
    print("[OK] Forecast generated")
    
    forecast = forecast_resp.get('forecast', {})
    hybrid = forecast.get('hybrid', [])
    
    if not hybrid:
        print("[FAIL] No hybrid values")
        return 1
    
    # Check monotonicity
    diffs = [hybrid[i+1] - hybrid[i] for i in range(len(hybrid)-1)]
    inc = sum(1 for d in diffs if d > 1e-6)
    dec = sum(1 for d in diffs if d < -1e-6)
    is_monotonic = (inc >= len(diffs) * 0.95) or (dec >= len(diffs) * 0.95)
    
    print(f"\nForecast Analysis:")
    print(f"  Points: {len(hybrid)}")
    print(f"  Increasing: {inc}/{len(diffs)} ({inc/len(diffs)*100:.1f}%)")
    print(f"  Decreasing: {dec}/{len(diffs)} ({dec/len(diffs)*100:.1f}%)")
    print(f"  Monotonic: {is_monotonic}")
    
    print(f"\n{'='*70}")
    
    if has_realism and has_walk_forward:
        print("[PASS] Backend changes verified - new fields present")
        if not is_monotonic:
            print("[PASS] Forecast shows direction changes (non-monotonic)")
        else:
            print("[INFO] Forecast is monotonic (may need tuning)")
        return 0
    else:
        print("[FAIL] Missing expected fields")
        return 1

if __name__ == "__main__":
    sys.exit(main())
