#!/usr/bin/env python3
"""
Standalone bet settlement module to avoid importing the main pipeline.
This prevents the 5+ hour hang caused by the main pipeline re-executing on import.
"""

import os
import requests
import pandas as pd
import numpy as np
from datetime import datetime, timedelta
import psycopg2
import logging

def _normalize_team_name(name: str) -> str:
    """Normalize team name for matching"""
    try:
        return str(name or "").strip().lower()
    except Exception:
        return ""

def get_season_ids_for_league(api_key, league_name_to_match, past_seasons=None):
    """Get season IDs for a league from football-data-api.com"""
    url = f"https://api.football-data-api.com/league-list?key={api_key}"
    try:
        response = requests.get(url, timeout=10)
        response.raise_for_status()
        data = response.json()
        if not data or 'data' not in data:
            print(f"  Warning: No data returned from football-data-api.com for league-list. League: {league_name_to_match}")
            return []
    except requests.exceptions.RequestException as e:
        print(f"  Error fetching season IDs for '{league_name_to_match}': {e}")
        return []
    except ValueError as e:
        print(f"  Error decoding JSON for '{league_name_to_match}': {e}")
        return []

    df = pd.json_normalize(data['data'])
    if df.empty or 'season' not in df.columns or 'name' not in df.columns:
        print(f"  Warning: football-data-api.com league-list response not in expected format or empty for league: {league_name_to_match}.")
        return []

    df_exploded = df.explode('season')
    df_exploded['name_processed'] = df_exploded['name'].astype(str).str.strip().str.lower()
    league_name_processed_to_match = league_name_to_match.strip().lower()
    league_df = df_exploded[df_exploded['name_processed'] == league_name_processed_to_match]

    if league_df.empty or league_df['season'].isnull().all():
        print(f"  Warning: League '{league_name_to_match}' not found in football-data-api.com list or no seasons available.")
        return []

    valid_seasons_mask = league_df['season'].apply(lambda x: isinstance(x, dict))
    if not valid_seasons_mask.any():
        print(f"  Warning: No valid season data (dict type) to normalize for league '{league_name_to_match}'.")
        return []

    season_df = pd.json_normalize(league_df.loc[valid_seasons_mask, 'season'].tolist())
    if 'year' not in season_df.columns or 'id' not in season_df.columns:
        print(f"  Warning: 'year' or 'id' column missing in season data for league '{league_name_to_match}'.")
        return []

    season_df = season_df.sort_values('year', ascending=False)
    if past_seasons is not None:
        season_df = season_df.head(past_seasons)
    season_ids = season_df['id'].tolist()
    if not season_ids: 
        print(f"  No season IDs found for '{league_name_to_match}' after filtering.")
    return season_ids

def get_league_match_data(api_key, season_id_from_api, league_name_for_df):
    """Get match data for a specific season from FootyStats API"""
    url = f"https://api.footystats.org/league-matches?key={api_key}&season_id={season_id_from_api}&include=stats"
    try:
        response = requests.get(url, timeout=15)
        response.raise_for_status()
        data = response.json()
        if not data or 'data' not in data or not data['data']:
            print(f"    Warning: No match data returned from FootyStats for season_id: {season_id_from_api}. League: {league_name_for_df}")
            return pd.DataFrame()
    except requests.exceptions.RequestException as e:
        print(f"    Error fetching match data for season_id {season_id_from_api} ({league_name_for_df}): {e}")
        return pd.DataFrame()
    except ValueError as e:
        print(f"    Error decoding JSON for match data, season_id {season_id_from_api} ({league_name_for_df}): {e}")
        return pd.DataFrame()

    df = pd.json_normalize(data['data'])
    if df.empty: 
        return pd.DataFrame()

    df['season_id_fetched'] = season_id_from_api
    df['league'] = league_name_for_df

    if 'stats' in df.columns and not df['stats'].isnull().all():
        valid_stats_mask = df['stats'].apply(lambda x: isinstance(x, dict))
        if valid_stats_mask.any():
            stats_list = df.loc[valid_stats_mask, 'stats'].tolist()
            if stats_list:
                df_stats = pd.json_normalize(stats_list)
                if not df_stats.empty:
                    df_stats.index = df.loc[valid_stats_mask].index
                    df = pd.concat([df.drop('stats', axis=1), df_stats], axis=1)
                else: 
                    df = df.drop(columns=['stats'], errors='ignore')
            else: 
                df = df.drop(columns=['stats'], errors='ignore')
        else: 
            df = df.drop(columns=['stats'], errors='ignore')
    elif 'stats' in df.columns: 
        df = df.drop(columns=['stats'], errors='ignore')
    return df

def resolve_ah_bet_profit(home_goals, away_goals, line_betted_on_team, side_betted, odds, stake=1.0):
    """Calculate profit/loss for an Asian Handicap bet"""
    if pd.isna(home_goals) or pd.isna(away_goals) or pd.isna(line_betted_on_team) or pd.isna(odds) or odds <= 0: 
        return 0.0
    
    margin = home_goals - away_goals
    if side_betted == 'home': 
        effective_score_for_bet = margin + line_betted_on_team
    elif side_betted == 'away': 
        effective_score_for_bet = (-margin) + line_betted_on_team
    else: 
        return 0.0
    
    if effective_score_for_bet > 0.25: 
        return (odds * stake) - stake
    elif effective_score_for_bet == 0.25: 
        return ((odds * stake) - stake) / 2
    elif effective_score_for_bet == 0: 
        return 0.0
    elif effective_score_for_bet == -0.25: 
        return -stake / 2
    else: 
        return -stake

def settle_open_bets(footystats_api_key: str, db_url: str, hours_buffer: int = 2) -> None:
    """Settle open bets in the Postgres `bets` table using FootyStats final scores."""
    print("🔄 Starting bet settlement process...")
    
    if not db_url:
        print("Settlement skipped: DATABASE_URL not provided.")
        return
    if not footystats_api_key:
        print("Settlement skipped: FOOTYSTATS_API_KEY not provided.")
        return

    try:
        conn = psycopg2.connect(db_url)
        cur = conn.cursor()
        
        # Fetch open bets older than buffer window
        cur.execute(
            """
            SELECT 
              CAST(bet_id AS TEXT) AS bet_key,
              dt_gmt8, league, home, away,
              COALESCE(line_betted_on_refined, line) AS line_val,
              COALESCE(odds_betted_on_refined, odds) AS odds_val,
              COALESCE(stake, 1.0) AS stake_val,
              COALESCE(bet_type_refined_ah, side) AS side_val
            FROM bets
            WHERE (status IS NULL OR status = 'open')
              AND dt_gmt8 < NOW() - INTERVAL '%s hours'
            ORDER BY dt_gmt8 ASC
            """,
            (hours_buffer,)
        )
        rows = cur.fetchall()
        
        if not rows:
            print("No open bets to settle.")
            cur.close(); conn.close()
            return

        print(f"Found {len(rows)} open bets to settle")
        
        open_df = pd.DataFrame(rows, columns=[
            'bet_key','dt_gmt8','league','home','away','line_val','odds_val','stake_val','side_val'
        ])

        # Build a cache of recent matches per league
        league_to_matches = {}
        unique_leagues = sorted([l for l in open_df['league'].dropna().unique()])
        print(f"Processing {len(unique_leagues)} leagues: {unique_leagues}")

        for i, league_name in enumerate(unique_leagues):
            print(f"[{i+1}/{len(unique_leagues)}] Fetching data for {league_name}...")
            try:
                season_ids = get_season_ids_for_league(footystats_api_key, league_name, past_seasons=1)
                
                league_matches = []
                for s_id in season_ids:
                    m = get_league_match_data(footystats_api_key, s_id, league_name)
                    if m is not None and not m.empty:
                        league_matches.append(m)
                
                league_df = pd.concat(league_matches, ignore_index=True) if league_matches else pd.DataFrame()
                
                # Normalize names and timestamps for matching
                if not league_df.empty:
                    for col in ['home_name','away_name','homeTeam','awayTeam','home','away']:
                        if col in league_df.columns:
                            league_df[col+'_norm'] = league_df[col].astype(str).str.strip().str.lower()
                    
                    # Unify goal columns
                    if 'homeGoalCount' not in league_df.columns:
                        if 'home_goals' in league_df.columns:
                            league_df['homeGoalCount'] = pd.to_numeric(league_df['home_goals'], errors='coerce')
                    if 'awayGoalCount' not in league_df.columns:
                        if 'away_goals' in league_df.columns:
                            league_df['awayGoalCount'] = pd.to_numeric(league_df['away_goals'], errors='coerce')
                    
                    # Unify datetime
                    dt_col = None
                    for c in ['datetime_gmt8','date_unix','date']:
                        if c in league_df.columns:
                            dt_col = c; break
                    if dt_col is not None:
                        try:
                            league_df['dt'] = pd.to_datetime(league_df[dt_col], errors='coerce', utc=True).tz_localize(None)
                        except Exception:
                            league_df['dt'] = pd.NaT
                
                league_to_matches[league_name] = league_df
                print(f"  ✅ {league_name}: {len(league_df)} matches")
                
            except Exception as e:
                print(f"  ❌ {league_name}: {e}")
                league_to_matches[league_name] = pd.DataFrame()

        # Process individual bets
        print(f"Processing {len(open_df)} individual bets...")
        settled = 0
        
        for idx, r in open_df.iterrows():
            if idx % 50 == 0:
                print(f"  Progress: {idx+1}/{len(open_df)} bets processed...")
                
            bet_id = r['bet_key']
            league = r['league']
            home = _normalize_team_name(r['home'])
            away = _normalize_team_name(r['away'])
            side_raw = str(r['side_val'] or '').lower()
            side = 'home' if 'home' in side_raw else ('away' if 'away' in side_raw else None)
            line = r['line_val']
            odds = r['odds_val']
            stake = r['stake_val']
            dt_bet = pd.to_datetime(r['dt_gmt8'], errors='coerce', utc=True).tz_localize(None)

            if bet_id is None or league not in league_to_matches or side is None:
                continue

            league_df = league_to_matches.get(league, pd.DataFrame())
            if league_df is None or league_df.empty:
                continue

            # Find closest match by date and team names
            candidates = league_df.copy()
            home_cols = [c for c in candidates.columns if c.endswith('_norm') and c.startswith('home')]
            away_cols = [c for c in candidates.columns if c.endswith('_norm') and c.startswith('away')]
            
            match_found = False
            match_row = None
            
            for hc in home_cols:
                for ac in away_cols:
                    mask = (candidates[hc] == home) & (candidates[ac] == away)
                    if mask.any():
                        sub = candidates.loc[mask].copy()
                        if 'dt' in sub.columns and pd.notna(dt_bet):
                            sub['abs_dt_diff'] = (sub['dt'] - dt_bet).abs()
                            sub = sub.sort_values('abs_dt_diff')
                        match_row = sub.iloc[0]
                        match_found = True
                        break
                if match_found:
                    break
                    
            if not match_found or match_row is None:
                continue

            try:
                hg = float(match_row.get('homeGoalCount', np.nan))
                ag = float(match_row.get('awayGoalCount', np.nan))
                if not np.isfinite(hg) or not np.isfinite(ag):
                    continue
                    
                profit = resolve_ah_bet_profit(int(hg), int(ag), float(line), side, float(odds), float(stake))
                
                cur.execute(
                    """
                    UPDATE bets
                    SET pl = %s, status = 'settled', settled_at = NOW()
                    WHERE CAST(bet_id AS TEXT) = %s
                    """,
                    (profit, str(bet_id))
                )
                settled += 1
                
            except Exception as e:
                print(f"Settlement warning: bet {bet_id} update failed: {e}")

        conn.commit()
        cur.close(); conn.close()
        print(f"✅ Settled {settled} bets successfully")
        
    except Exception as e:
        print(f"Settlement error: {e}")

if __name__ == "__main__":
    # When run directly, get credentials from environment
    api_key = os.environ.get('FOOTYSTATS_API_KEY', '')
    db_url = os.environ.get('DATABASE_URL', '')
    settle_open_bets(api_key, db_url)
