#!/usr/bin/env python3
"""
Test script for parlay wins implementation
Tests the bridge logic and parlay construction
"""

import pandas as pd
import numpy as np
from datetime import datetime, timedelta
import itertools
import os

def create_mock_yesterday_data():
    """Create mock yesterday's unified_games.csv with recommendations but no scores"""
    yesterday_games = [
        {
            'datetime_gmt8': '2025-09-14 18:15:00',
            'league': 'Netherlands Eredivisie',
            'home_name': 'Excelsior',
            'away_name': 'Sparta Rotterdam',
            'status': 'complete',  # This game is now complete
            'has_recommendation': True,
            'rec_text': 'Sparta Rotterdam +0.25',
            'line': 0.25,
            'rec_odds': 1.925,
            'home_score': '',  # Empty - scores weren't available yesterday
            'away_score': ''
        },
        {
            'datetime_gmt8': '2025-09-14 20:00:00',
            'league': 'Spain La Liga',
            'home_name': 'Celta de Vigo',
            'away_name': 'Girona FC',
            'status': 'complete',
            'has_recommendation': True,
            'rec_text': 'Celta de Vigo -1.0',
            'line': -1.0,
            'rec_odds': 1.925,
            'home_score': '',
            'away_score': ''
        },
        {
            'datetime_gmt8': '2025-09-14 21:00:00',
            'league': 'England Premier League',
            'home_name': 'Burnley',
            'away_name': 'Liverpool',
            'status': 'complete',
            'has_recommendation': True,
            'rec_text': 'Liverpool -1.5',
            'line': -1.5,
            'rec_odds': 1.925,
            'home_score': '',
            'away_score': ''
        },
        {
            'datetime_gmt8': '2025-09-15 18:00:00',  # Future game
            'league': 'Japan J1 League',
            'home_name': 'Tokyo',
            'away_name': 'Tokyo Verdy',
            'status': 'incomplete',
            'has_recommendation': True,
            'rec_text': 'Tokyo Verdy +0.25',
            'line': 0.25,
            'rec_odds': 1.925,
            'home_score': '',
            'away_score': ''
        }
    ]
    return pd.DataFrame(yesterday_games)

def create_mock_today_data():
    """Create mock today's unified_games.csv with fresh scores"""
    today_games = [
        {
            'datetime_gmt8': '2025-09-14 18:15:00',
            'league': 'Netherlands Eredivisie',
            'home_name': 'Excelsior',
            'away_name': 'Sparta Rotterdam',
            'status': 'complete',
            'home_score': 1,  # Actual result: Excelsior 1-2 Sparta Rotterdam
            'away_score': 2,  # Sparta Rotterdam +0.25 should WIN (away team +0.25 means they win if they don't lose by 1+)
            'has_recommendation': True
        },
        {
            'datetime_gmt8': '2025-09-14 20:00:00',
            'league': 'Spain La Liga',
            'home_name': 'Celta de Vigo',
            'away_name': 'Girona FC',
            'status': 'complete',
            'home_score': 1,  # Actual result: Celta 1-1 Girona
            'away_score': 1,  # Celta -1.0 should LOSE (home team -1.0 means they need to win by 2+)
            'has_recommendation': True
        },
        {
            'datetime_gmt8': '2025-09-14 21:00:00',
            'league': 'England Premier League',
            'home_name': 'Burnley',
            'away_name': 'Liverpool',
            'status': 'complete',
            'home_score': 0,  # Actual result: Burnley 0-3 Liverpool
            'away_score': 3,  # Liverpool -1.5 should WIN (away team -1.5 means they win if they don't lose by 2+)
            'has_recommendation': True
        },
        {
            'datetime_gmt8': '2025-09-15 18:00:00',
            'league': 'Japan J1 League',
            'home_name': 'Tokyo',
            'away_name': 'Tokyo Verdy',
            'status': 'incomplete',  # Still future
            'home_score': '',
            'away_score': '',
            'has_recommendation': True
        }
    ]
    return pd.DataFrame(today_games)

def resolve_ah_bet_profit(home_goals, away_goals, line_betted_on_team, side_betted, odds, stake=1.0):
    """Calculate profit for Asian Handicap bet"""
    # Calculate effective goals for the side we bet on
    if side_betted.lower() == 'home':
        effective_goals = home_goals + line_betted_on_team
        won = effective_goals > away_goals
    else:  # away
        effective_goals = away_goals - line_betted_on_team  # Note: for away bets, line is already negated
        won = effective_goals > home_goals

    if won:
        return (odds - 1.0) * stake
    else:
        return -stake

def test_bridge_logic():
    """Test the bridge logic that converts recommendations to settled bets"""
    print("🧪 Testing Bridge Logic: Recommendations → Settled Bets")
    print("=" * 60)

    # Create mock data
    yesterday_df = create_mock_yesterday_data()
    today_df = create_mock_today_data()

    # Create lookup for today's games
    current_games_dict = {}
    for _, game in today_df.iterrows():
        game_key = f"{game['datetime_gmt8']}_{game['home_name']}_{game['away_name']}"
        current_games_dict[game_key] = game.to_dict()

    # Filter yesterday's completed recommendations
    yesterday_recs = yesterday_df[
        (yesterday_df['status'] == 'complete') &
        (yesterday_df['has_recommendation'] == True)
    ].to_dict('records')

    print(f"📊 Found {len(yesterday_recs)} completed recommendations from yesterday")

    # Process into settled bets
    settled_bets = []
    for rec in yesterday_recs:
        try:
            # Get actual result - try yesterday's data first, then fetch fresh results
            home_score = rec.get('home_score', rec.get('homeGoalCount'))
            away_score = rec.get('away_score', rec.get('awayGoalCount'))

            # If scores missing, try today's data
            if not home_score or not away_score or str(home_score).strip() == '' or str(away_score).strip() == '':
                game_key = f"{rec['datetime_gmt8']}_{rec['home_name']}_{rec['away_name']}"
                if game_key in current_games_dict:
                    fresh_game = current_games_dict[game_key]
                    home_score = fresh_game.get('home_score', fresh_game.get('homeGoalCount'))
                    away_score = fresh_game.get('away_score', fresh_game.get('awayGoalCount'))
                    print(f"📊 Fetched fresh scores for {rec['home_name']} vs {rec['away_name']}: {home_score}-{away_score}")

            if not home_score or not away_score:
                print(f"⚠️ No scores available for {rec['home_name']} vs {rec['away_name']}")
                continue

            home_score = float(home_score)
            away_score = float(away_score)

            # Parse recommendation
            rec_text = rec.get('rec_text', '')
            line = float(rec.get('line', 0))
            odds = float(rec.get('rec_odds', 1.925))

            # Determine bet side
            is_home_bet = rec['home_name'].lower() in rec_text.lower()
            is_away_bet = rec['away_name'].lower() in rec_text.lower()

            if is_home_bet:
                side = 'home'
                expected_outcome = f"Home -{abs(line)}" if line < 0 else f"Home +{line}"
            elif is_away_bet:
                side = 'away'
                expected_outcome = f"Away -{abs(line)}" if line < 0 else f"Away +{line}"
            else:
                continue

            # Calculate profit
            profit = resolve_ah_bet_profit(
                int(home_score), int(away_score), line, side, odds, 1.0
            )

            settled_bets.append({
                'fixture_id': f"{rec['datetime_gmt8']}_{rec['home_name']}_{rec['away_name']}",
                'league': rec.get('league', ''),
                'home': rec.get('home_name', ''),
                'away': rec.get('away_name', ''),
                'home_score': int(home_score),
                'away_score': int(away_score),
                'line_betted_on_refined': line,
                'bet_type_refined_ah': 'bet_home_refined_ah' if is_home_bet else 'bet_away_refined_ah',
                'odds_betted_on_refined': odds,
                'stake': 1.0,
                'pl': profit,
                'status': 'settled',
                'dt_gmt8': rec.get('datetime_gmt8', ''),
                'expected': expected_outcome,
                'actual': f"{int(home_score)}-{int(away_score)}",
                'won': profit > 0
            })

        except Exception as e:
            print(f"⚠️ Error processing {rec.get('home_name', '')} vs {rec.get('away_name', '')}: {e}")
            continue

    # Results
    if settled_bets:
        settled_df = pd.DataFrame(settled_bets)
        print(f"\n✅ Created {len(settled_bets)} settled bets:")
        for bet in settled_bets:
            status = "✅ WON" if bet['won'] else "❌ LOST"
            print(f"  {bet['home']} vs {bet['away']} ({bet['league']}): {bet['expected']} → {bet['actual']} | {status} | P/L: {bet['pl']:+.2f}")

        return settled_df
    else:
        print("❌ No settled bets created")
        return pd.DataFrame()

def test_parlay_construction(settled_bets_df):
    """Test the parlay construction with league/tier prioritization"""
    print("\n🧪 Testing Parlay Construction Logic")
    print("=" * 60)

    if settled_bets_df.empty:
        print("❌ No settled bets to build parlays from")
        return []

    # League tier mapping
    LEAGUE_TIERS = {
        'England Premier League': 1, 'Spain La Liga': 1, 'Germany Bundesliga': 1,
        'Italy Serie A': 1, 'France Ligue 1': 1,
        'England Championship': 2, 'Netherlands Eredivisie': 2, 'Portugal Liga NOS': 2,
        'Belgium Pro League': 2, 'Scotland Premiership': 2,
    }

    # Process bets
    bets = []
    for _, row in settled_bets_df.iterrows():
        if row['pl'] <= 0:  # Only winning bets
            continue

        league = row['league']
        tier = LEAGUE_TIERS.get(league, 4)

        bets.append({
            'dt': pd.to_datetime(row['dt_gmt8']),
            'home': row['home'],
            'away': row['away'],
            'odds': float(row['odds_betted_on_refined']),
            'rec': f"{row['home']} vs {row['away']} | {row['expected']}@{row['odds_betted_on_refined']:.2f}",
            'league': league,
            'tier': tier
        })

    print(f"📊 Processing {len(bets)} winning bets for parlay construction")

    # Smart parlay construction with league/tier prioritization
    results = []

    # Group by 6-hour windows
    buckets = {}
    for bet in bets:
        # Create a simple time bucket (for testing, just put all in one bucket)
        bucket_key = "test_window"
        if bucket_key not in buckets:
            buckets[bucket_key] = []
        buckets[bucket_key].append(bet)

    # Process each time window
    for window_start, legs in buckets.items():
        if len(legs) < 3:  # Need at least 3 legs
            continue

        legs = sorted(legs, key=lambda x: x['dt'])[:12]  # Limit to 12 legs max

        # PRIORITY 1: Same-league parlays (3-5 legs)
        league_groups = {}
        for leg in legs:
            league = leg['league']
            if league not in league_groups:
                league_groups[league] = []
            league_groups[league].append(leg)

        for league, league_legs in league_groups.items():
            if len(league_legs) >= 3:
                # Create same-league parlays
                for size in range(3, min(6, len(league_legs) + 1)):
                    scored = []
                    for combo in itertools.combinations(league_legs, size):
                        prod = 1.0
                        for lg in combo:
                            prod *= float(lg['odds'] or 1.0)
                        # Bonus for same-league combos
                        same_league_bonus = 1.05 if size >= 4 else 1.0
                        adjusted_prod = prod * same_league_bonus
                        scored.append((adjusted_prod, combo))
                    scored.sort(key=lambda x: x[0], reverse=True)
                    for prod, combo in scored[:1]:  # Take top 1 per size per league
                        stake = 100.0
                        payout = stake * prod
                        profit = payout - stake
                        start = min(l['dt'] for l in combo)
                        end = max(l['dt'] for l in combo)
                        results.append([
                            start.strftime('%Y-%m-%d %H:%M:%S'), end.strftime('%Y-%m-%d %H:%M:%S'),
                            len(combo), round(prod, 4), stake, round(payout, 2), round(profit, 2),
                            f"[SAME LEAGUE - {league}] " + " || ".join([l['rec'] for l in combo])
                        ])

        # PRIORITY 2: Same-tier cross-league parlays (3-4 legs)
        tier_groups = {}
        for leg in legs:
            tier = leg['tier']
            if tier not in tier_groups:
                tier_groups[tier] = []
            tier_groups[tier].append(leg)

        for tier, tier_legs in tier_groups.items():
            # Remove legs already used in same-league parlays
            available_legs = [leg for leg in tier_legs if len([r for r in results if leg['home'] in r[-1] and leg['away'] in r[-1]]) == 0]
            if len(available_legs) >= 3:
                for size in range(3, min(5, len(available_legs) + 1)):
                    scored = []
                    for combo in itertools.combinations(available_legs, size):
                        prod = 1.0
                        for lg in combo:
                            prod *= float(lg['odds'] or 1.0)
                        scored.append((prod, combo))
                    scored.sort(key=lambda x: x[0], reverse=True)
                    for prod, combo in scored[:1]:  # Take top 1 per size per tier
                        stake = 100.0
                        payout = stake * prod
                        profit = payout - stake
                        start = min(l['dt'] for l in combo)
                        end = max(l['dt'] for l in combo)
                        results.append([
                            start.strftime('%Y-%m-%d %H:%M:%S'), end.strftime('%Y-%m-%d %H:%M:%S'),
                            len(combo), round(prod, 4), stake, round(payout, 2), round(profit, 2),
                            f"[TIER {tier}] " + " || ".join([l['rec'] for l in combo])
                        ])

        # PRIORITY 3: Mixed-tier parlays (3 legs only, as fallback)
        available_legs = [leg for leg in legs if len([r for r in results if leg['home'] in r[-1] and leg['away'] in r[-1]]) == 0]
        if len(available_legs) >= 3:
            scored = []
            for combo in itertools.combinations(available_legs, 3):
                prod = 1.0
                for lg in combo:
                    prod *= float(lg['odds'] or 1.0)
                scored.append((prod, combo))
            scored.sort(key=lambda x: x[0], reverse=True)
            for prod, combo in scored[:1]:  # Take top 1 mixed parlay
                stake = 100.0
                payout = stake * prod
                profit = payout - stake
                start = min(l['dt'] for l in combo)
                end = max(l['dt'] for l in combo)
                results.append([
                    start.strftime('%Y-%m-%d %H:%M:%S'), end.strftime('%Y-%m-%d %H:%M:%S'),
                    len(combo), round(prod, 4), stake, round(payout, 2), round(profit, 2),
                    "[MIXED] " + " || ".join([l['rec'] for l in combo])
                ])

    # Results
    print(f"✅ Built {len(results)} parlay combinations")
    if results:
        print(f"💰 Best parlay payout: ${max(r[5] for r in results):.0f}")
        parlay_types = set(r[7].split(']')[0] + ']' for r in results)
        print(f"🏆 Parlay types created: {list(parlay_types)}")

        # Show top parlay
        top_parlay = max(results, key=lambda x: x[6])
        print("\n🥇 Top Parlay:")
        print(f"  Legs: {top_parlay[2]} | Odds: {top_parlay[3]} | Payout: ${top_parlay[5]} | Profit: ${top_parlay[6]}")
        print(f"  Type: {top_parlay[7].split(']')[0]}]")
        print(f"  Bets: {top_parlay[7].split(']')[1].strip()[:100]}...")

    return results

def main():
    print("🚀 Testing Parlay Wins Implementation")
    print("=" * 60)

    # Test 1: Bridge Logic
    settled_bets_df = test_bridge_logic()

    # Test 2: Parlay Construction
    if not settled_bets_df.empty:
        parlay_results = test_parlay_construction(settled_bets_df)

        print(f"\n🎉 Test Complete!")
        print(f"   - Settled bets created: {len(settled_bets_df)}")
        print(f"   - Parlays constructed: {len(parlay_results)}")
        print(f"   - Win rate: {settled_bets_df['won'].mean()*100:.1f}%")
    else:
        print("❌ Bridge logic test failed - no settled bets created")

if __name__ == "__main__":
    main()
