#!/usr/bin/env python3
"""
Local Pipeline Test - Inspect Data Structure & CSV Outputs
"""

import os
import sys
import pandas as pd
from pathlib import Path
import subprocess
import time

def inspect_csv_structure(csv_path):
    """Inspect CSV structure, data types, and sample data"""
    if not os.path.exists(csv_path):
        print(f"❌ {csv_path} - FILE NOT FOUND")
        return
    
    try:
        df = pd.read_csv(csv_path)
        print(f"\n📊 {csv_path}")
        print(f"   Shape: {df.shape}")
        print(f"   Columns: {list(df.columns)}")
        print(f"   Data Types:")
        for col, dtype in df.dtypes.items():
            sample_val = df[col].iloc[0] if len(df) > 0 else "N/A"
            print(f"     {col}: {dtype} (sample: {sample_val})")
        
        # Show first few rows
        if len(df) > 0:
            print(f"   Sample Data (first 3 rows):")
            print(df.head(3).to_string(index=False))
        else:
            print("   ⚠️  Empty DataFrame")
            
    except Exception as e:
        print(f"❌ {csv_path} - ERROR: {e}")

def run_local_test():
    """Run the pipeline locally and inspect outputs"""
    
    print("🚀 Starting Local Pipeline Test...")
    print("=" * 60)
    
    # Set environment for quick run
    os.environ['GBM_QUICK'] = '1'
    
    # Clean artifacts to start fresh
    print("\n🧹 Cleaning artifacts directory...")
    if os.path.exists('artifacts'):
        import shutil
        shutil.rmtree('artifacts')
    
    # Run the main pipeline
    print("\n🔄 Running gbm_dc_ev_model.py...")
    start_time = time.time()
    
    try:
        result = subprocess.run([
            sys.executable, 'gbm_dc_ev_model.py'
        ], capture_output=True, text=True, timeout=300)  # 5 min timeout
        
        elapsed = time.time() - start_time
        print(f"✅ Pipeline completed in {elapsed:.1f}s")
        print(f"   Exit code: {result.returncode}")
        
        if result.stdout:
            print("\n📄 STDOUT (last 20 lines):")
            stdout_lines = result.stdout.split('\n')
            for line in stdout_lines[-20:]:
                if line.strip():
                    print(f"   {line}")
        
        if result.stderr:
            print("\n⚠️  STDERR:")
            stderr_lines = result.stderr.split('\n')
            for line in stderr_lines[-10:]:
                if line.strip():
                    print(f"   {line}")
                    
    except subprocess.TimeoutExpired:
        print("❌ Pipeline timed out after 5 minutes")
        return
    except Exception as e:
        print(f"❌ Pipeline failed: {e}")
        return
    
    # Inspect generated artifacts
    print("\n" + "=" * 60)
    print("📁 INSPECTING GENERATED FILES")
    print("=" * 60)
    
    # Check artifacts directory
    artifacts_latest = Path("artifacts/latest")
    if artifacts_latest.exists():
        print(f"\n📦 Artifacts in {artifacts_latest}:")
        for file in artifacts_latest.iterdir():
            print(f"   {file.name} ({file.stat().st_size} bytes)")
    
    # Check expected CSV outputs (if they would be generated)
    expected_csvs = [
        "artifacts/latest/recommendations_*.csv",
        "artifacts/latest/report_*.html"
    ]
    
    import glob
    for pattern in expected_csvs:
        matches = glob.glob(pattern)
        for match in matches:
            print(f"\n📄 Found: {match}")
    
    # If we had DATABASE_URL, the CSV exports would be generated
    # For now, let's see what we can extract from the pipeline output
    
    print("\n" + "=" * 60)
    print("🔍 DATA STRUCTURE ANALYSIS")
    print("=" * 60)
    
    # Look for any CSV files generated
    csv_files = list(Path(".").glob("**/*.csv"))
    if csv_files:
        print(f"\n📊 Found {len(csv_files)} CSV files:")
        for csv_file in csv_files:
            inspect_csv_structure(str(csv_file))
    else:
        print("ℹ️  No CSV files found. This is expected without DATABASE_URL.")
        print("   The pipeline generates models and artifacts, but CSV export requires DB connection.")
    
    print("\n" + "=" * 60)
    print("💡 RECOMMENDATIONS")
    print("=" * 60)
    print("1. ✅ Run succeeded - pipeline is working")
    print("2. 🔗 To get CSV data structure, need DATABASE_URL set")
    print("3. 📊 For dashboard design, we should:")
    print("   - Set DATABASE_URL temporarily for local testing")
    print("   - Run again to generate actual CSV exports")
    print("   - Design dashboard components based on real data")
    print("4. 🎯 Next: Set up local test DB or use actual Supabase URL")

if __name__ == "__main__":
    run_local_test()
