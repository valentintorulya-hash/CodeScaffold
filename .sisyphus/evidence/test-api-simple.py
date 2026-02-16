#!/usr/bin/env python3
"""Quick test to verify API is working"""

import json
import urllib.request
import urllib.error

API_URL = "http://localhost:3000/api/ml"

def test_api():
    print("Testing API with small date range...")
    
    payload = {
        "action": "runFullAnalysis",
        "startDate": "2023-11-01",
        "endDate": "2023-12-01"
    }
    
    data = json.dumps(payload).encode('utf-8')
    req = urllib.request.Request(
        API_URL,
        data=data,
        headers={'Content-Type': 'application/json'}
    )
    
    try:
        print(f"Sending request... (timeout=300s)")
        with urllib.request.urlopen(req, timeout=300) as response:
            result = json.loads(response.read().decode('utf-8'))
            print(f"\n[OK] Got response:")
            print(f"  Success: {result.get('success')}")
            if result.get('success'):
                data = result.get('data', {})
                print(f"  Has realism_metrics: {'realism_metrics' in data}")
                print(f"  Has walk_forward: {'walk_forward' in data}")
                if 'realism_metrics' in data:
                    print(f"  Realism metrics: {json.dumps(data['realism_metrics'], indent=2)}")
            return True
    except urllib.error.HTTPError as e:
        print(f"\n[FAIL] HTTP Error {e.code}: {e.reason}")
        print(e.read().decode('utf-8'))
        return False
    except Exception as e:
        print(f"\n[FAIL] Request failed: {e}")
        return False

if __name__ == "__main__":
    test_api()
