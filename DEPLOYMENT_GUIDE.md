# 🚀 ParlayKing Deployment Guide

Complete guide to deploy and maintain the ParlayKing football betting analytics dashboard.

## 🎯 Overview

ParlayKing consists of:
- **Backend**: ML model pipeline (Python)
- **Database**: Supabase PostgreSQL
- **Frontend**: Custom dashboard (HTML/CSS/JS)
- **Hosting**: GitHub Pages
- **Automation**: GitHub Actions (daily/weekly)

## 📋 Pre-Deployment Checklist

### 1. 🔐 GitHub Repository Secrets

Configure these secrets in **GitHub → Settings → Secrets and variables → Actions**:

```
FOOTYSTATS_API_KEY=76b520495072b8f1b1f6ca6a379f51d5dfab642f38f6f5f5d1f9f543378400fd
DATABASE_URL=postgresql://postgres:[PASSWORD]@db.ocfzwtvfaaxsdtiidgmy.supabase.co:6543/postgres
GBM_QUICK=1
```

**⚠️ Important**: Use the **Session Pooler** connection string (port `:6543`) for GitHub Actions IPv4 compatibility.

### 2. 🗄️ Supabase Database Setup

**Tables Required:**
```sql
-- Runs table
CREATE TABLE runs (
    run_id VARCHAR PRIMARY KEY,
    started_at TIMESTAMP,
    finished_at TIMESTAMP,
    train_rows INTEGER,
    test_rows INTEGER,
    poisson_home_loss DECIMAL,
    poisson_away_loss DECIMAL
);

-- Bets table  
CREATE TABLE bets (
    id SERIAL PRIMARY KEY,
    dt_gmt8 TIMESTAMP,
    league VARCHAR,
    home_team VARCHAR,
    away_team VARCHAR,
    rec_text VARCHAR,
    line DECIMAL,
    odds DECIMAL,
    stake DECIMAL,
    pl DECIMAL,
    status VARCHAR,
    confidence VARCHAR,
    settled_at TIMESTAMP
);

-- Recommendations table
CREATE TABLE recommendations (
    id SERIAL PRIMARY KEY,
    dt_gmt8 TIMESTAMP,
    league VARCHAR,
    home VARCHAR,
    away VARCHAR,
    rec_text VARCHAR,
    line DECIMAL,
    odds DECIMAL,
    ev DECIMAL,
    confidence VARCHAR
);
```

### 3. 📱 GitHub Pages Setup

1. Go to **Repository Settings → Pages**
2. Source: **GitHub Actions**  
3. Save settings

## 🔄 Deployment Process

### Step 1: Verify All Files

Run the deployment checker:
```bash
python deployment_check.py
```

**Required files:**
- ✅ `gbm_dc_ev_model.py` - Main ML pipeline
- ✅ `index.html` - Dashboard homepage  
- ✅ `styles.css` - Dashboard styling
- ✅ `app.js` - Dashboard logic
- ✅ `requirements.txt` - Python dependencies
- ✅ `.github/workflows/daily.yml` - Daily automation
- ✅ `.github/workflows/weekly.yml` - Weekly automation

### Step 2: Test Manual Run

Test the pipeline locally:
```bash
# Set environment variables
export FOOTYSTATS_API_KEY='your_api_key'
export GBM_QUICK='1'
export DATABASE_URL='your_supabase_url'

# Run the model
python gbm_dc_ev_model.py
```

**Expected outputs:**
- `artifacts/latest/recommendations_YYYYMMDD_HHMMSS.csv`
- `artifacts/latest/report_YYYYMMDD_HHMMSS.html`
- Console output showing model training and backtesting results

### Step 3: Test GitHub Actions

1. **Trigger daily workflow manually**:
   - GitHub → Actions → `daily-predict` → Run workflow

2. **Check workflow logs**:
   - Verify all steps complete successfully
   - Check for database connection issues
   - Confirm CSV files are generated

3. **Verify site deployment**:
   - Visit: `https://pythonchan8888.github.io/GBM/`
   - Check data loads correctly
   - Test parlay wins section

### Step 4: Set Up Automated Scheduling

**Daily workflow** runs automatically at:
- **12:00 UTC** (8:00 PM GMT+8) - Daily predictions
- **18:00 UTC** (2:00 AM GMT+8) - Late games update

**Weekly workflow** runs:
- **Sunday 02:00 UTC** - Full model retraining

## 📊 Data Flow Verification

### Backend → Database
1. Model generates predictions
2. Settlement function updates P&L
3. Metrics are calculated and stored

### Database → CSV Export  
1. Workflow queries database
2. Exports to CSV files in `site/` folder
3. Includes win rates, ROI, parlay data

### CSV → Frontend
1. Dashboard fetches CSV files from GitHub raw URLs
2. Displays KPIs, charts, and parlay wins
3. Updates automatically with fresh data

## 🔧 Troubleshooting

### Common Issues

**1. Database Connection Failed**
```
Error: invalid dsn: invalid URI query parameter: "pgbouncer"
```
**Fix**: Use Session Pooler URL without `?pgbouncer=true` parameter

**2. CSV Files Not Found**
```
Error: Failed to load metrics.csv: 404
```
**Fix**: Check that database export step runs successfully and CSV files are copied to `site/`

**3. Dashboard Not Loading**
```
TypeError: Cannot read property 'textContent' of null
```
**Fix**: Verify all HTML element IDs match between `index.html` and `app.js`

**4. GitHub Pages Not Updating**
```
Pages deployment successful but showing old content
```
**Fix**: Check browser cache, wait 5-10 minutes, or force refresh

### Diagnostic Commands

```bash
# Check local CSV data
ls -la site/*.csv

# Test database connection
python -c "import psycopg2; print('DB OK')" 

# Verify API key
curl -H "X-API-KEY: $FOOTYSTATS_API_KEY" https://api.footystats.org/leagues

# Test GitHub Pages
curl -I https://pythonchan8888.github.io/GBM/
```

## 📈 Monitoring & Maintenance

### Daily Monitoring
- ✅ Check workflow run status
- ✅ Verify CSV data freshness  
- ✅ Monitor dashboard metrics
- ✅ Review any error logs

### Weekly Maintenance
- 🔄 Review model performance metrics
- 📊 Analyze parlay win calculations
- 🗄️ Clean up old database records
- 📈 Update marketing metrics

### Monthly Reviews
- 📋 Performance analysis
- 🎯 User engagement metrics
- 🔧 System optimizations
- 📱 Dashboard improvements

## 🎯 Success Metrics

**Deployment is successful when:**
- ✅ Daily workflows run without errors
- ✅ Database stores and retrieves data correctly
- ✅ CSV files update with fresh data
- ✅ Dashboard loads and displays metrics
- ✅ Parlay wins showcase real data
- ✅ All KPIs show compelling numbers (62%+ win rate, 17%+ ROI)

## 🆘 Emergency Procedures

**If daily workflow fails:**
1. Check GitHub Actions logs
2. Verify secrets are still valid
3. Test database connectivity
4. Run manual pipeline locally
5. Push fixed workflow file

**If dashboard shows no data:**
1. Check CSV file accessibility
2. Verify CORS settings
3. Test with browser dev tools
4. Check for JavaScript errors

**If database is unavailable:**
1. Workflow will create fallback CSV files
2. Dashboard will show cached data
3. Fix database connection when possible
4. Backfill missing data

## 📞 Support

For technical issues:
1. Check this deployment guide
2. Run `deployment_check.py`
3. Review GitHub Actions logs
4. Check Supabase dashboard
5. Test individual components

**Remember**: The system is designed to be resilient - even if the database fails, the workflow will continue and generate fallback data files.
