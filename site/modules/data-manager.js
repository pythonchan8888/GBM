// ===== DATA MANAGER MODULE =====
// Handles all CSV loading, parsing, and data transformation

export class DataManager {
    constructor() {
        this.cache = new Map();
        this.version = (window.__PK_VERSION || 'latest');
    }

    // Data Loading with Caching
    async loadCSV(filename, useCache = true) {
        if (!window.Papa) {
            await new Promise(resolve => {
                const script = document.createElement('script');
                script.src = 'https://unpkg.com/papaparse@5.4.1/papaparse.min.js';
                script.onload = resolve;
                document.head.appendChild(script);
            });
        }
        const cacheKey = `csv_${filename}`;
        
        // If we already have it in-memory, prefer that immediately
        if (useCache && this.cache.has(cacheKey)) {
            return this.cache.get(cacheKey);
        }

        try {
            // Enhanced caching with ETag support for better performance
            const haveInMemory = this.cache.has(cacheKey);
            const headers = useCache && haveInMemory
                ? { 'If-None-Match': localStorage.getItem(`etag_${filename}`) || '' }
                : {};

            let response = await fetch(`${filename}?t=${Date.now()}`, { headers });

            // If server returns 304 but we don't have an in-memory copy (cold load), refetch without ETag
            if (response.status === 304 && !haveInMemory) {
                response = await fetch(`${filename}?t=${Date.now()}`, { cache: 'no-store' });
            }

            if (!response.ok) {
                throw new Error(`Failed to load ${filename}: ${response.status}`);
            }

            const csvText = await response.text();
            const data = Papa.parse(csvText, { 
                header: true, 
                dynamicTyping: true,
                skipEmptyLines: true
            }).data;

            // Cache the data and store ETag for future requests
            this.cache.set(cacheKey, data);
            const etag = response.headers.get('ETag');
            if (etag) {
                localStorage.setItem(`etag_${filename}`, etag);
            }

            return data;
        } catch (error) {
            console.warn(`Failed to load ${filename}:`, error);
            return this.cache.get(cacheKey) || [];
        }
    }

    async loadAllData() {
        try {
            // Load all CSV files in parallel
            const [metrics, pnlByMonth, bankrollSeries, recommendations, roiHeatmap, topSegments, settledBets, parlayWinsCsv, unifiedGames] = await Promise.all([
                this.loadCSV('metrics.csv'),
                this.loadCSV('pnl_by_month.csv'),
                this.loadCSV('bankroll_series_90d.csv'),
                this.loadCSV('latest_recommendations.csv'),
                this.loadCSV('roi_heatmap.csv'),
                this.loadCSV('top_segments.csv'),
                this.loadCSV('settled_bets.csv'),
                this.loadCSV('parlay_wins.csv').catch(() => []),
                this.loadCSV('unified_games.csv').catch((error) => {
                    console.warn('Unified games CSV not available:', error);
                    return [];
                })
            ]);

            // Store data with parsing
            return {
                metrics: this.parseMetrics(metrics),
                pnlByMonth,
                bankrollSeries: this.parseBankrollSeries(bankrollSeries),
                recommendations: this.parseRecommendations(recommendations),
                roiHeatmap,
                topSegments,
                settledBets: this.parseSettledBets(settledBets),
                unifiedGames: this.parseUnifiedGames(unifiedGames),
                parlayWins: this.parseParlayWins(parlayWinsCsv || [])
            };

        } catch (error) {
            console.error('Failed to load data:', error);
            throw new Error('Failed to load dashboard data. Please try refreshing the page.');
        }
    }

    parseMetrics(rawMetrics) {
        const metrics = {};
        if (!Array.isArray(rawMetrics)) return metrics;
        
        rawMetrics.forEach(row => {
            if (row && row.metric && row.value !== null && row.value !== undefined && row.value !== '') {
                metrics[row.metric] = row.value;
            }
        });
        return metrics;
    }

    // Robust date-time parsing for strings like "YYYY-MM-DD HH:MM:SS"
    parseDateTimeSafe(value) {
        if (!value) return null;
        if (value instanceof Date) return isNaN(value) ? null : value;
        try {
            // Try ISO without timezone
            let iso = String(value).replace(' ', 'T');
            let d = new Date(iso);
            if (!isNaN(d)) return d;
            // Try ISO with Z (UTC)
            d = new Date(iso + 'Z');
            if (!isNaN(d)) return d;
            // Manual parse fallback
            const [datePart, timePart] = String(value).split(' ');
            const [y, m, d2] = datePart.split('-').map(Number);
            const [hh = 0, mm = 0, ss = 0] = (timePart || '').split(':').map(Number);
            const local = new Date(y, (m || 1) - 1, d2 || 1, hh, mm, ss);
            return isNaN(local) ? null : local;
        } catch (_) {
            return null;
        }
    }

    // Parse a datetime string that represents GMT+8 (dt_gmt8) and return a proper Date
    parseGmt8(value) {
        if (!value) return null;
        try {
            const [datePart, timePart = '00:00:00'] = String(value).split(' ');
            const [y, m, d] = datePart.split('-').map(Number);
            const [hh, mm, ss] = timePart.split(':').map(Number);
            // Convert the GMT+8 wall-clock to UTC milliseconds
            const utcMs = Date.UTC(y, (m || 1) - 1, d || 1, (hh || 0) - 8, mm || 0, ss || 0);
            return new Date(utcMs);
        } catch (_) {
            return this.parseDateTimeSafe(value);
        }
    }

    parseBankrollSeries(rawSeries) {
        if (!Array.isArray(rawSeries)) return [];
        
        return rawSeries
            .filter(row => row && row.dt_gmt8 && row.cum_bankroll !== undefined)
            .map(row => ({
                date: this.parseDateTimeSafe(row.dt_gmt8),
                bankroll: parseFloat(row.cum_bankroll) || 0
            }))
            .sort((a, b) => a.date - b.date);
    }

    parseRecommendations(rawRecs) {
        if (!Array.isArray(rawRecs)) return [];
        
        return rawRecs
            .filter(row => row && row.dt_gmt8 && row.home && row.away)
            .map(row => {
                const dt = this.parseGmt8(row.dt_gmt8) || this.parseDateTimeSafe(row.dt_gmt8);
                if (!dt) {
                    console.warn(`Invalid date for recommendation: ${row.dt_gmt8}`);
                    return null;
                }
                return {
                    datetime: dt,
                    league: row.league || '',
                    home: row.home,
                    away: row.away,
                    recommendation: row.rec_text || row.recommendation || '',
                    line: parseFloat(row.line) || 0,
                    odds: parseFloat(row.odds) || 0,
                    ev: parseFloat(row.ev) || 0,
                    confidence: row.confidence || 'Medium',
                    kingsCall: row.kings_call_insight || 'No additional insights available.'
                };
            })
            .filter(Boolean)
            .sort((a, b) => a.datetime - b.datetime);
    }

    parseSettledBets(rawBets) {
        if (!Array.isArray(rawBets)) return [];
        
        return rawBets
            .filter(row => row && row.home && row.away)
            .map(row => {
                const betType = (row.bet_type_refined_ah || row.bet_type || '').toString();
                const lineVal = parseFloat(row.line_betted_on_refined || row.line || 0);
                const oddsVal = parseFloat(row.odds_betted_on_refined || row.odds || 0);
                const plVal = parseFloat(row.pl || 0);
                const statusTxt = (row.status || '').toString().toLowerCase();
                const isWin = plVal > 0 || statusTxt === 'won' || statusTxt === 'win';
                const isPush = plVal === 0;
                const effOdds = isPush ? 1.0 : (oddsVal || 1.0);
                
                // Build simple recommendation text when not provided
                const side = betType.toLowerCase();
                let recText;
                if (side.includes('away')) {
                    recText = `${row.away} ${(lineVal >= 0 ? '+' : '')}${(isFinite(lineVal) ? lineVal.toFixed(2) : '0.00')}`;
                } else if (side.includes('home')) {
                    recText = `${row.home} ${(lineVal >= 0 ? '+' : '')}${(isFinite(lineVal) ? lineVal.toFixed(2) : '0.00')}`;
                } else if (betType) {
                    recText = `${betType} ${(lineVal >= 0 ? '+' : '')}${(isFinite(lineVal) ? lineVal.toFixed(2) : '0.00')}`;
                } else {
                    recText = `AH ${(lineVal >= 0 ? '+' : '')}${(isFinite(lineVal) ? lineVal.toFixed(2) : '0.00')}`;
                }
                
                return {
                    fixture_id: row.fixture_id,
                    league: row.league || '',
                    home: row.home,
                    away: row.away,
                    home_score: parseInt(row.home_score || 0),
                    away_score: parseInt(row.away_score || 0),
                    bet_type: betType,
                    line: lineVal,
                    odds: oddsVal || 1.0,
                    effectiveOdds: effOdds,
                    stake: parseFloat(row.stake || 0),
                    pl: plVal,
                    isWin,
                    isPush,
                    recommendation: recText,
                    status: row.status || '',
                    datetime: this.parseGmt8(row.dt_gmt8) || this.parseDateTimeSafe(row.dt_gmt8)
                };
            })
            .sort((a, b) => (b.datetime || 0) - (a.datetime || 0));
    }

    parseUnifiedGames(rawGames) {
        if (!Array.isArray(rawGames) || rawGames.length === 0) {
            console.log('No unified games data available - will use fallback recommendations');
            return [];
        }
        
        return rawGames.filter(game => game && game.datetime_gmt8 && game.home_name && game.away_name).map(game => {
            const datetime = this.parseGmt8(game.datetime_gmt8) || this.parseDateTimeSafe(game.datetime_gmt8);
            if (!datetime) {
                console.warn('Invalid date for game: ' + game.datetime_gmt8);
                return null;
            }
            
            return {
                datetime: datetime,
                league: game.league || '',
                leagueShort: game.league_short || game.league || '',
                leagueFlag: game.league_flag || '⚽',
                leagueColor: game.league_color || '#666666',
                home: game.home_name,
                away: game.away_name,
                odds1: parseFloat(game.odds_1) || 0,
                oddsX: parseFloat(game.odds_x) || 0,
                odds2: parseFloat(game.odds_2) || 0,
                tier: parseInt(game.league_tier) || 3,
                competitionType: game.competition_type || 'league',
                isFuture: game.is_future === 'True' || game.is_future === true || game.is_future === 'true',
                status: game.status || '',
                
                // Recommendation data
                hasRecommendation: game.has_recommendation === 'True' || game.has_recommendation === true || game.has_recommendation === 'true',
                recText: game.rec_text || '',
                line: parseFloat(game.line) || 0,
                recOdds: parseFloat(game.rec_odds) || 0,
                ev: parseFloat(game.ev) || 0,
                confidence: game.confidence || '',
                kingsCall: game.kings_call || '',
                kingsCallAgreement: game.kings_call_agreement || '',
                
                // Signal data
                primarySignal: game.primary_signal || '',
                secondarySignal: game.secondary_signal || ''
            };
        }).filter(Boolean).map(game => {
            // Enhanced AH logic parsing
            const ahData = this.parseAsianHandicapData(game);
            return { ...game, ...ahData };
        }).sort((a, b) => a.datetime - b.datetime);
    }

    // Parse Asian Handicap data from game information
    parseAsianHandicapData(game) {
        let recommendedTeam = null;
        let homeLine = null;
        let awayLine = null;
        let isPk = false;
        
        // PRIORITY 1: Use authoritative CSV data (backend computed)
        if (game.ah_line_home !== undefined && game.ah_line_away !== undefined) {
            homeLine = parseFloat(game.ah_line_home);
            awayLine = parseFloat(game.ah_line_away);
            
            // Determine recommended team from rec_text if available
            if (game.hasRecommendation && game.recText) {
                const recMatch = game.recText.match(/^(.+?)\s+([-+]?\d*\.?\d+)$/);
                if (recMatch) {
                    const parsedTeam = recMatch[1].trim();
                    const parsedLine = parseFloat(recMatch[2]);
                    
                    // Match team and verify line consistency
                    if (parsedTeam === game.home && Math.abs(parsedLine - homeLine) < 0.01) {
                        recommendedTeam = game.home;
                    } else if (parsedTeam === game.away && Math.abs(parsedLine - awayLine) < 0.01) {
                        recommendedTeam = game.away;
                    } else {
                        // Try partial name matching
                        if ((game.home.includes(parsedTeam) || parsedTeam.includes(game.home)) && 
                            Math.abs(parsedLine - homeLine) < 0.01) {
                            recommendedTeam = game.home;
                        } else if ((game.away.includes(parsedTeam) || parsedTeam.includes(game.away)) && 
                                   Math.abs(parsedLine - awayLine) < 0.01) {
                            recommendedTeam = game.away;
                        }
                    }
                }
            }
        }
        // PRIORITY 2: Parse from rec_text if CSV data not available
        else if (game.hasRecommendation && game.recText) {
            const recMatch = game.recText.match(/^(.+?)\s+([-+]?\d*\.?\d+)$/);
            if (recMatch) {
                recommendedTeam = recMatch[1].trim();
                const parsedLine = parseFloat(recMatch[2]);
                
                // Determine home/away lines based on recommended team
                if (recommendedTeam === game.home) {
                    homeLine = parsedLine;
                    awayLine = -parsedLine;
                } else if (recommendedTeam === game.away) {
                    awayLine = parsedLine;
                    homeLine = -parsedLine;
                } else {
                    // Fallback: try to match partial names
                    if (game.home.includes(recommendedTeam) || recommendedTeam.includes(game.home)) {
                        homeLine = parsedLine;
                        awayLine = -parsedLine;
                        recommendedTeam = game.home;
                    } else if (game.away.includes(recommendedTeam) || recommendedTeam.includes(game.away)) {
                        awayLine = parsedLine;
                        homeLine = -parsedLine;
                        recommendedTeam = game.away;
                    }
                }
            }
        }
        // PRIORITY 3: Last resort - estimate from 1X2 odds (fallback only)
        else if (game.odds1 > 0 && game.oddsX > 0 && game.odds2 > 0) {
            console.warn('Using 1X2 estimation for AH lines - CSV data should be authoritative');
            
            // Convert odds to implied probabilities
            const prob1 = 1 / game.odds1;
            const probX = 1 / game.oddsX;
            const prob2 = 1 / game.odds2;
            const totalProb = prob1 + probX + prob2;
            
            // Normalize probabilities
            const normProb1 = prob1 / totalProb;
            const normProb2 = prob2 / totalProb;
            
            // Estimate goal difference (simplified model)
            const goalDiff = (normProb1 - normProb2) * 2.5;
            
            // Map to closest quarter line (same logic as backend)
            if (goalDiff > 1.875) homeLine = -2.0;
            else if (goalDiff > 1.625) homeLine = -1.75;
            else if (goalDiff > 1.375) homeLine = -1.5;
            else if (goalDiff > 1.125) homeLine = -1.25;
            else if (goalDiff > 0.875) homeLine = -1.0;
            else if (goalDiff > 0.625) homeLine = -0.75;
            else if (goalDiff > 0.375) homeLine = -0.5;
            else if (goalDiff > 0.125) homeLine = -0.25;
            else if (goalDiff > -0.125) homeLine = 0.0;
            else if (goalDiff > -0.375) homeLine = 0.25;
            else if (goalDiff > -0.625) homeLine = 0.5;
            else if (goalDiff > -0.875) homeLine = 0.75;
            else if (goalDiff > -1.125) homeLine = 1.0;
            else if (goalDiff > -1.375) homeLine = 1.25;
            else if (goalDiff > -1.625) homeLine = 1.5;
            else if (goalDiff > -1.875) homeLine = 1.75;
            else homeLine = 2.0;
            
            awayLine = -homeLine;
        }
        
        // Handle edge cases and formatting
        if (homeLine !== null && awayLine !== null) {
            isPk = (homeLine === 0 && awayLine === 0);
            
            // Round to nearest 0.25
            homeLine = Math.round(homeLine * 4) / 4;
            awayLine = Math.round(awayLine * 4) / 4;
        }
        
        return {
            recommendedTeam,
            homeLine,
            awayLine,
            isPk,
            hasAhData: homeLine !== null && awayLine !== null
        };
    }

    // Parse server-provided parlay_wins.csv (optional dataset)
    parseParlayWins(rows) {
        if (!Array.isArray(rows) || rows.length === 0) return [];
        return rows.map(r => {
            const stake = parseFloat(r.stake || 100);
            const totalOdds = parseFloat(r.total_odds || r.odds || 1);
            const totalPayout = parseFloat(r.payout || (stake * totalOdds));
            const profit = parseFloat(r.profit || (totalPayout - stake));
            const legsStr = (r.legs || r.legs_str || '').toString();
            const legs = legsStr.split(' || ').filter(Boolean).map(s => {
                const [matchPart, right] = s.split(' | ');
                const [home, away] = (matchPart || '').split(' vs ').map(x => (x || '').trim());
                let recommendation = right || '';
                let odds = 1.0;
                const atIdx = recommendation.lastIndexOf('@');
                if (atIdx !== -1) {
                    odds = parseFloat(recommendation.slice(atIdx + 1)) || 1.0;
                    recommendation = recommendation.slice(0, atIdx).trim();
                }
                return { home, away, recommendation, odds };
            });
            const start = this.parseDateTimeSafe(r.window_start || r.start_dt || r.start);
            const end = this.parseDateTimeSafe(r.window_end || r.end_dt || r.end);
            return {
                legs,
                legCount: parseInt(r.leg_count || legs.length || 0),
                totalOdds,
                stake,
                totalPayout,
                profit,
                returnPercent: (profit / Math.max(stake, 1)) * 100,
                dateRange: (start && end)
                    ? (this.isSameDay(start, end) ? this.formatDate(start) : `${this.formatDate(start)} - ${this.formatDate(end)}`)
                    : '--',
                startDate: start || null,
                endDate: end || null
            };
        });
    }

    isSameDay(date1, date2) {
        return date1.toDateString() === date2.toDateString();
    }

    formatDate(date) {
        const d = date instanceof Date ? date : this.parseDateTimeSafe(date);
        if (!d) return '--';
        return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'Asia/Singapore' }).format(d);
    }
}
