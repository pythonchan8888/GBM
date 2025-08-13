#!/usr/bin/env python3
"""
ParlayKing Deployment Verification Script

This script checks all components of the ParlayKing system:
- GitHub secrets configuration
- CSV file accessibility  
- Database connectivity
- Frontend functionality
- Workflow status
"""

import os
import sys
import requests
import json
from datetime import datetime

class ParlayKingDeploymentChecker:
    def __init__(self):
        self.checks = []
        self.errors = []
        self.warnings = []
        
    def log_check(self, check_name, status, message="", level="info"):
        """Log a check result"""
        self.checks.append({
            'name': check_name,
            'status': status,
            'message': message,
            'level': level,
            'timestamp': datetime.now().isoformat()
        })
        
        if status == 'FAIL':
            self.errors.append(f"{check_name}: {message}")
        elif level == "warning":
            self.warnings.append(f"{check_name}: {message}")
            
        # Print immediately for real-time feedback
        status_icon = "✅" if status == "PASS" else "❌" if status == "FAIL" else "⚠️"
        print(f"{status_icon} {check_name}: {message}")

    def check_github_secrets(self):
        """Check if required environment variables are set"""
        required_secrets = [
            'FOOTYSTATS_API_KEY',
            'DATABASE_URL', 
            'GBM_QUICK'
        ]
        
        print("\n🔐 Checking GitHub Secrets Configuration...")
        
        for secret in required_secrets:
            value = os.environ.get(secret)
            if value:
                # Mask sensitive values
                display_value = f"{value[:8]}..." if len(value) > 8 else "***"
                self.log_check(f"Secret {secret}", "PASS", f"Set ({display_value})")
            else:
                self.log_check(f"Secret {secret}", "FAIL", "Not set in environment")

    def check_csv_accessibility(self):
        """Check if CSV files are accessible from GitHub Pages"""
        print("\n📊 Checking CSV File Accessibility...")
        
        base_url = "https://raw.githubusercontent.com/pythonchan8888/GBM/main"
        csv_files = [
            "artifacts/latest/recommendations_latest.csv",
            "site/metrics.csv",
            "site/pnl_by_month.csv", 
            "site/bankroll_series_90d.csv",
            "site/roi_heatmap.csv",
            "site/top_segments.csv"
        ]
        
        for csv_file in csv_files:
            try:
                response = requests.get(f"{base_url}/{csv_file}", timeout=10)
                if response.status_code == 200:
                    lines = len(response.text.split('\n'))
                    self.log_check(f"CSV {csv_file}", "PASS", f"Accessible ({lines} lines)")
                elif response.status_code == 404:
                    self.log_check(f"CSV {csv_file}", "FAIL", "File not found (404)")
                else:
                    self.log_check(f"CSV {csv_file}", "FAIL", f"HTTP {response.status_code}")
            except requests.RequestException as e:
                self.log_check(f"CSV {csv_file}", "FAIL", f"Network error: {e}")

    def check_dashboard_accessibility(self):
        """Check if ParlayKing dashboard is accessible"""
        print("\n🎨 Checking Dashboard Accessibility...")
        
        dashboard_urls = [
            "https://pythonchan8888.github.io/GBM/",
            "https://raw.githubusercontent.com/pythonchan8888/GBM/main/index.html",
            "https://raw.githubusercontent.com/pythonchan8888/GBM/main/styles.css",
            "https://raw.githubusercontent.com/pythonchan8888/GBM/main/app.js"
        ]
        
        for url in dashboard_urls:
            try:
                response = requests.get(url, timeout=10)
                if response.status_code == 200:
                    size_kb = len(response.content) / 1024
                    self.log_check(f"Dashboard {url.split('/')[-1]}", "PASS", f"Accessible ({size_kb:.1f}KB)")
                else:
                    self.log_check(f"Dashboard {url.split('/')[-1]}", "FAIL", f"HTTP {response.status_code}")
            except requests.RequestException as e:
                self.log_check(f"Dashboard {url.split('/')[-1]}", "FAIL", f"Network error: {e}")

    def check_database_connectivity(self):
        """Check database connectivity"""
        print("\n🗄️ Checking Database Connectivity...")
        
        db_url = os.environ.get('DATABASE_URL')
        if not db_url:
            self.log_check("Database Connection", "FAIL", "DATABASE_URL not set")
            return
            
        try:
            import psycopg2
            conn = psycopg2.connect(db_url)
            cur = conn.cursor()
            
            # Test basic connectivity
            cur.execute("SELECT 1")
            cur.fetchone()
            self.log_check("Database Connection", "PASS", "Successfully connected")
            
            # Check if required tables exist
            required_tables = ['runs', 'bets', 'recommendations']
            for table in required_tables:
                cur.execute(f"SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = '{table}')")
                exists = cur.fetchone()[0]
                if exists:
                    cur.execute(f"SELECT COUNT(*) FROM {table}")
                    count = cur.fetchone()[0]
                    self.log_check(f"Table {table}", "PASS", f"Exists ({count} rows)")
                else:
                    self.log_check(f"Table {table}", "FAIL", "Table does not exist")
            
            cur.close()
            conn.close()
            
        except ImportError:
            self.log_check("Database Connection", "FAIL", "psycopg2 not installed")
        except Exception as e:
            self.log_check("Database Connection", "FAIL", f"Connection error: {e}")

    def check_github_workflows(self):
        """Check GitHub Actions workflow status"""
        print("\n⚙️ Checking GitHub Workflows...")
        
        # This would require GitHub API access token for real implementation
        # For now, just check if workflow files exist locally
        workflow_files = [
            '.github/workflows/daily.yml',
            '.github/workflows/weekly.yml'
        ]
        
        for workflow_file in workflow_files:
            if os.path.exists(workflow_file):
                with open(workflow_file, 'r') as f:
                    content = f.read()
                    lines = len(content.split('\n'))
                    self.log_check(f"Workflow {workflow_file}", "PASS", f"File exists ({lines} lines)")
            else:
                self.log_check(f"Workflow {workflow_file}", "FAIL", "File not found")

    def check_local_files(self):
        """Check if all required local files exist"""
        print("\n📁 Checking Local Files...")
        
        required_files = [
            'gbm_dc_ev_model.py',
            'requirements.txt',
            'index.html',
            'styles.css', 
            'app.js',
            'DASHBOARD_CSV_INTEGRATION.md'
        ]
        
        for file_path in required_files:
            if os.path.exists(file_path):
                size_kb = os.path.getsize(file_path) / 1024
                self.log_check(f"File {file_path}", "PASS", f"Exists ({size_kb:.1f}KB)")
            else:
                self.log_check(f"File {file_path}", "FAIL", "File not found")

    def run_all_checks(self):
        """Run all deployment checks"""
        print("🚀 ParlayKing Deployment Verification")
        print("=" * 50)
        
        self.check_local_files()
        self.check_github_secrets()
        self.check_csv_accessibility()
        self.check_dashboard_accessibility()
        self.check_database_connectivity()
        self.check_github_workflows()
        
        # Summary
        print("\n" + "=" * 50)
        print("📋 DEPLOYMENT SUMMARY")
        print("=" * 50)
        
        total_checks = len(self.checks)
        passed_checks = len([c for c in self.checks if c['status'] == 'PASS'])
        failed_checks = len([c for c in self.checks if c['status'] == 'FAIL'])
        
        print(f"✅ Passed: {passed_checks}/{total_checks}")
        print(f"❌ Failed: {failed_checks}")
        print(f"⚠️ Warnings: {len(self.warnings)}")
        
        if self.errors:
            print("\n🚨 CRITICAL ISSUES TO FIX:")
            for error in self.errors:
                print(f"  • {error}")
                
        if self.warnings:
            print("\n⚠️ WARNINGS:")
            for warning in self.warnings:
                print(f"  • {warning}")
                
        if failed_checks == 0:
            print("\n🎉 ALL CHECKS PASSED! ParlayKing is ready for deployment!")
            return True
        else:
            print(f"\n❌ {failed_checks} issues need to be resolved before deployment.")
            return False

    def export_report(self, filename="deployment_report.json"):
        """Export detailed report to JSON"""
        report = {
            'timestamp': datetime.now().isoformat(),
            'summary': {
                'total_checks': len(self.checks),
                'passed': len([c for c in self.checks if c['status'] == 'PASS']),
                'failed': len([c for c in self.checks if c['status'] == 'FAIL']),
                'warnings': len(self.warnings)
            },
            'checks': self.checks,
            'errors': self.errors,
            'warnings': self.warnings
        }
        
        with open(filename, 'w') as f:
            json.dump(report, f, indent=2)
        
        print(f"\n📄 Detailed report saved to {filename}")

if __name__ == "__main__":
    checker = ParlayKingDeploymentChecker()
    success = checker.run_all_checks()
    checker.export_report()
    
    # Exit with appropriate code
    sys.exit(0 if success else 1)
