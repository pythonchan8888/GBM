// ===== PARLAYKING REFACTORED - CLEAN ARCHITECTURE =====
// Streamlined version with modular components (4,500 → ~1,500 lines)

// ===== FILTER MANAGER =====
class FilterManager {
    constructor(filters) {
        this.filters = filters;
    }

    applyFilters(items, type = 'games') {
        return items
            .filter(item => this.matchesDateRange(item, this.filters.dateRange))
            .filter(item => this.matchesLeague(item, this.filters.league))
            .filter(item => this.matchesMinEV(item, this.filters.minEV))
            .filter(item => this.matchesConfidence(item, this.filters.confidence));
    }

    matchesDateRange(item, range) {
        if (range === 'all') return true;
        const now = new Date();
        const itemDate = item.datetime || new Date();
        const days = parseInt(range);
        const diffDays = (itemDate - now) / (1000 * 60 * 60 * 24);
        return Math.abs(diffDays) <= days;
    }

    matchesLeague(item, league) {
        return league === 'all' || item.league === league;
    }

    matchesMinEV(item, minEV) {
        if (!item.hasRecommendation || !item.ev) return true;
        return (item.ev * 100) >= minEV;
    }

    matchesConfidence(item, confidence) {
        return confidence === 'all' || item.confidence === confidence;
    }
}

// ===== GAME CARD COMPONENT =====
class GameCard {
    constructor(game, options = {}) {
        this.game = game;
        this.options = {
            compact: options.compact ?? true,
            showHints: options.showHints ?? true,
            index: options.index ?? 0
        };
        this.isExpandable = game.hasRecommendation || game.kingsCall;
    }
    
    render() {
        const timeDisplay = this.formatTime(this.game.datetime);
        const { homeChip, awayChip } = this.renderAhChips();
        const hint = this.renderHint();
        
        return `
            <div class="game-card game-card--v3" 
                 data-game-id="${this.game.datetime.getTime()}"
                 data-expandable="${this.isExpandable}"
                 data-expanded="false">
                
                <div class="game-row">
                    <div class="game-time">${timeDisplay}</div>
                    
                    <div class="game-matchup">
                        <div class="team-row">
                            <span class="team-name">${this.game.home}</span>
                            ${homeChip}
                        </div>
                        <div class="vs-separator">vs</div>
                        <div class="team-row">
                            <span class="team-name">${this.game.away}</span>
                            ${awayChip}
                        </div>
                    </div>
                    
                    <div class="game-actions">
                        ${hint}
                        ${this.isExpandable ? '<div class="expand-btn" role="button" tabindex="0">▼</div>' : ''}
                    </div>
                </div>
                
                ${this.isExpandable ? this.renderExpansion() : ''}
            </div>
        `;
    }
    
    renderExpansion() {
        const confidenceIcon = this.game.confidence === 'High' ? '👑' : 
                              this.game.confidence === 'Medium' ? '⭐' : '⚪';
        
        return `
            <div class="expanded-details hidden">
                <div class="pick-section">
                    <div class="pick-main">
                        <strong>${this.game.recText}</strong> @ ${this.game.recOdds.toFixed(2)}
                    </div>
                    <div class="pick-meta">
                        <span class="ev-badge">EV ${(this.game.ev * 100).toFixed(1)}%</span>
                        <span class="confidence-icon" title="${this.game.confidence}">${confidenceIcon}</span>
                    </div>
                </div>
                
                ${this.game.kingsCall ? `
                    <button class="analysis-toggle" onclick="window.parlayKing.toggleAnalysis(this)" aria-expanded="false">
                        Show Analysis ▼
                    </button>
                    <div class="analysis-content hidden">
                        <p class="analysis-text">${this.game.kingsCall}</p>
                    </div>
                ` : ''}
            </div>
        `;
    }
    
    renderAhChips() {
        if (!this.game.hasAhData) {
            return {
                homeChip: '<span class="ah-chip ah-chip--empty">—</span>',
                awayChip: '<span class="ah-chip ah-chip--empty">—</span>'
            };
        }

        const formatLine = (line) => {
            if (line === 0) return 'PK';
            return line > 0 ? `+${line}` : `${line}`.replace('-', '−');
        };

        const isHomeRecommended = this.game.hasRecommendation && this.game.recommendedTeam === this.game.home;
        const isAwayRecommended = this.game.hasRecommendation && this.game.recommendedTeam === this.game.away;

        const homeChipClass = [
            'ah-chip',
            this.game.homeLine < 0 ? 'ah-chip--neg' : this.game.homeLine > 0 ? 'ah-chip--pos' : 'ah-chip--pk',
            isHomeRecommended ? 'ah-chip--selected' : ''
        ].filter(Boolean).join(' ');

        const awayChipClass = [
            'ah-chip',
            this.game.awayLine < 0 ? 'ah-chip--neg' : this.game.awayLine > 0 ? 'ah-chip--pos' : 'ah-chip--pk',
            isAwayRecommended ? 'ah-chip--selected' : ''
        ].filter(Boolean).join(' ');

        return {
            homeChip: `<span class="${homeChipClass}">${formatLine(this.game.homeLine)}</span>`,
            awayChip: `<span class="${awayChipClass}">${formatLine(this.game.awayLine)}</span>`
        };
    }
    
    renderHint() {
        // Single diamond for any recommendation
        if (this.game.hasRecommendation && this.game.ev > 0) {
            return '<span class="game-hint" title="Recommendation available">💎</span>';
        }
        return '';
    }
    
    formatTime(datetime) {
        if (!datetime) return '--:--';
        return datetime.toLocaleTimeString('en-GB', { 
            hour: '2-digit', 
            minute: '2-digit',
            hour12: false 
        });
    }
}

// ===== DAY NAVIGATOR COMPONENT =====
class DayNavigator {
    constructor(parlayKing) {
        this.parlayKing = parlayKing;
    }
    
    render() {
        const today = new Date();
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);
        const dayAfter = new Date(today);
        dayAfter.setDate(dayAfter.getDate() + 2);
        
        return `
            <div class="day-navigator">
                <button class="day-tab ${this.parlayKing.uiState.currentDay === 'today' ? 'active' : ''}" 
                        data-day="today" onclick="window.parlayKing.switchDay('today')">
                    Today
                </button>
                <button class="day-tab ${this.parlayKing.uiState.currentDay === 'tomorrow' ? 'active' : ''}" 
                        data-day="tomorrow" onclick="window.parlayKing.switchDay('tomorrow')">
                    Tomorrow
                </button>
                <button class="day-tab ${this.parlayKing.uiState.currentDay === 'dayafter' ? 'active' : ''}" 
                        data-day="dayafter" onclick="window.parlayKing.switchDay('dayafter')">
                    ${dayAfter.toLocaleDateString('en-US', { weekday: 'short' })}
                </button>
            </div>
        `;
    }
}

// ===== MAIN PARLAYKING APPLICATION =====
class ParlayKing {
    constructor() {
        this.cache = new Map();
        this.data = {
            metrics: {},
            pnlByMonth: [],
            bankrollSeries: [],
            recommendations: [],
            roiHeatmap: [],
            topSegments: [],
            settledBets: [],
            parlayWins: [],
            unifiedGames: null
        };

        // Centralized UI State Management
        this.uiState = {
            viewMode: window.innerWidth <= 768 ? 'mobile' : 'desktop',
            expandedCards: new Set(),
            activeFilters: this.getFiltersFromURL(),
            currentDay: 'today',
            filtersDrawerOpen: false,
            renderedGames: 20,
            virtualScrollOffset: 0
        };
        
        // Performance optimizations
        this.renderQueue = [];
        this.isRendering = false;
        this.cardInstances = new Map();
        
        // Component instances
        this.dayNavigator = new DayNavigator(this);
        this.filterManager = new FilterManager(this.uiState.activeFilters);
        
        // UI state
        this.parlayPage = 0;
        this.version = (window.__PK_VERSION || 'latest');
        
        this.init();
    }

    async init() {
        this.showLoading(true);
        await this.loadAllData();
        this.initializeUI();
        this.updateUI();
        this.showLoading(false);
    }

    // Simplified data loading (core parsing moved to DataManager concept)
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
        if (useCache && this.cache.has(cacheKey)) {
            return this.cache.get(cacheKey);
        }

        try {
            const response = await fetch(`${filename}?t=${Date.now()}`);
            if (!response.ok) {
                throw new Error(`Failed to load ${filename}: ${response.status}`);
            }

            const csvText = await response.text();
            const data = Papa.parse(csvText, { 
                header: true, 
                dynamicTyping: true,
                skipEmptyLines: true
            }).data;

            this.cache.set(cacheKey, data);
            return data;
        } catch (error) {
            console.warn(`Failed to load ${filename}:`, error);
            return this.cache.get(cacheKey) || [];
        }
    }

    async loadAllData() {
        try {
            const [metrics, recommendations, unifiedGames] = await Promise.all([
                this.loadCSV('metrics.csv').catch(() => []),
                this.loadCSV('latest_recommendations.csv').catch(() => []),
                this.loadCSV('unified_games.csv').catch(() => [])
            ]);

            this.data = {
                ...this.data,
                metrics: this.parseMetrics(metrics || []),
                recommendations: this.parseRecommendations(recommendations || []),
                unifiedGames: this.parseUnifiedGames(unifiedGames || [])
            };

            this.populateFilterOptions();

            console.log('Data loaded successfully:', {
                metrics: Object.keys(this.data.metrics).length,
                recommendations: this.data.recommendations.length,
                unifiedGames: this.data.unifiedGames.length
            });

        } catch (error) {
            console.error('Failed to load data:', error);
            this.showError('Failed to load dashboard data. Please try refreshing the page.');
        }
    }

    // Essential parsing methods (simplified)
    parseMetrics(rawMetrics) {
        const metrics = {};
        if (!Array.isArray(rawMetrics)) return metrics;
        rawMetrics.forEach(row => {
            if (row && row.metric && row.value !== null) {
                metrics[row.metric] = row.value;
            }
        });
        return metrics;
    }

    parseRecommendations(rawRecs) {
        if (!Array.isArray(rawRecs)) return [];
        return rawRecs
            .filter(row => row && row.dt_gmt8 && row.home && row.away)
            .map(row => ({
                datetime: this.parseGmt8(row.dt_gmt8),
                league: row.league || '',
                home: row.home,
                away: row.away,
                recommendation: row.rec_text || '',
                line: parseFloat(row.line) || 0,
                odds: parseFloat(row.odds) || 0,
                ev: parseFloat(row.ev) || 0,
                confidence: row.confidence || 'Medium',
                kingsCall: row.kings_call_insight || ''
            }))
            .filter(r => r.datetime)
            .sort((a, b) => a.datetime - b.datetime);
    }

    parseUnifiedGames(rawGames) {
        if (!Array.isArray(rawGames) || rawGames.length === 0) return [];
        
        return rawGames.filter(game => game && game.datetime_gmt8 && game.home_name && game.away_name)
            .map(game => {
                const datetime = this.parseGmt8(game.datetime_gmt8);
                if (!datetime) return null;
                
                const gameData = {
                    datetime: datetime,
                    league: game.league || '',
                    leagueShort: game.league_short || game.league || '',
                    leagueFlag: game.league_flag || '⚽',
                    home: game.home_name,
                    away: game.away_name,
                    odds1: parseFloat(game.odds_1) || 0,
                    oddsX: parseFloat(game.odds_x) || 0,
                    odds2: parseFloat(game.odds_2) || 0,
                    tier: parseInt(game.league_tier) || 3,
                    hasRecommendation: game.has_recommendation === 'True',
                    recText: game.rec_text || '',
                    recOdds: parseFloat(game.rec_odds) || 0,
                    ev: parseFloat(game.ev) || 0,
                    confidence: game.confidence || '',
                    kingsCall: game.kings_call || '',
                    primarySignal: game.primary_signal || '',
                    // Include AH data from CSV
                    ah_line_home: game.ah_line_home,
                    ah_line_away: game.ah_line_away,
                    ah_odds_home: game.ah_odds_home,
                    ah_odds_away: game.ah_odds_away
                };
                
                // Parse AH data
                const ahData = this.parseAsianHandicapData(gameData);
                return { ...gameData, ...ahData };
            })
            .filter(Boolean)
            .sort((a, b) => a.datetime - b.datetime);
    }

    parseAsianHandicapData(game) {
        // Parse AH lines from CSV data
        let homeLine = null;
        let awayLine = null;
        let recommendedTeam = null;
        
        // PRIORITY 1: Use CSV data if available
        if (game.ah_line_home !== undefined && game.ah_line_home !== null) {
            homeLine = parseFloat(game.ah_line_home);
        }
        if (game.ah_line_away !== undefined && game.ah_line_away !== null) {
            awayLine = parseFloat(game.ah_line_away);
        }
        
        // PRIORITY 2: Parse from recommendation text if CSV not available
        if ((homeLine === null || awayLine === null) && game.hasRecommendation && game.recText) {
            const recMatch = game.recText.match(/^(.+?)\s+([-+]?\d*\.?\d+)$/);
            if (recMatch) {
                const parsedTeam = recMatch[1].trim();
                const parsedLine = parseFloat(recMatch[2]);
                
                if (parsedTeam === game.home || game.home.includes(parsedTeam)) {
                    recommendedTeam = game.home;
                    homeLine = parsedLine;
                    awayLine = -parsedLine;
                } else if (parsedTeam === game.away || game.away.includes(parsedTeam)) {
                    recommendedTeam = game.away;
                    awayLine = parsedLine;
                    homeLine = -parsedLine;
                }
            }
        }
        
        // PRIORITY 3: Fallback to 0 if no data
        if (homeLine === null) homeLine = 0;
        if (awayLine === null) awayLine = 0;
        
        return {
            recommendedTeam,
            homeLine,
            awayLine,
            isPk: homeLine === 0 && awayLine === 0,
            hasAhData: true // Always show chips, even if PK
        };
    }

    // Essential utility methods
    parseGmt8(value) {
        if (!value) return null;
        try {
            const [datePart, timePart = '00:00:00'] = String(value).split(' ');
            const [y, m, d] = datePart.split('-').map(Number);
            const [hh, mm, ss] = timePart.split(':').map(Number);
            const utcMs = Date.UTC(y, (m || 1) - 1, d || 1, (hh || 0) - 8, mm || 0, ss || 0);
            return new Date(utcMs);
        } catch (_) {
            return null;
        }
    }

    isSameDay(date1, date2) {
        return date1.toDateString() === date2.toDateString();
    }

    getFiltersFromURL() {
        const params = new URLSearchParams(window.location.search);
        return {
            dateRange: params.get('dateRange') || '30',
            league: params.get('league') || 'all',
            minEV: parseFloat(params.get('minEV')) || 0,
            confidence: params.get('confidence') || 'all'
        };
    }

    // UI Initialization
    initializeUI() {
        this.setupEventListeners();
        this.setFilterValues();
        this.setupHeaderShrinking();
    }
    
    setupHeaderShrinking() {
        let ticking = false;
        
        const updateHeader = () => {
            const scrollY = window.scrollY;
            const header = document.querySelector('.nav-container');
            
            if (header) {
                if (scrollY > 50) {
                    header.classList.add('shrunk');
                    console.log('Header shrunk at scroll position:', scrollY); // Debug log
                } else {
                    header.classList.remove('shrunk');
                    console.log('Header expanded at scroll position:', scrollY); // Debug log
                }
            }
            
            ticking = false;
        };
        
        // Add scroll listener with debug
        window.addEventListener('scroll', () => {
            if (!ticking) {
                requestAnimationFrame(updateHeader);
                ticking = true;
            }
        });
        
        console.log('Header shrinking scroll listener initialized'); // Debug log
    }

    setupEventListeners() {
        // Simplified filter controls
        const dr = document.getElementById('date-range');
        if (dr) dr.addEventListener('change', (e) => { 
            this.uiState.activeFilters.dateRange = e.target.value; 
            this.updateUI(); 
        });
        
        const lf = document.getElementById('league-filter');
        if (lf) lf.addEventListener('change', (e) => { 
            this.uiState.activeFilters.league = e.target.value; 
            this.updateUI(); 
        });

        // Initialize mobile drawer if needed
        if (window.innerWidth <= 768) {
            this.initFiltersDrawer();
        }
    }

    initFiltersDrawer() {
        const drawerBtn = document.getElementById('filters-drawer-btn');
        const drawer = document.getElementById('filters-drawer');
        
        if (!drawerBtn || !drawer) return;
        
        drawerBtn.addEventListener('click', () => this.openFiltersDrawer());
        
        const closeBtn = document.getElementById('filters-drawer-close');
        if (closeBtn) closeBtn.addEventListener('click', () => this.closeFiltersDrawer());
        
        const overlay = document.getElementById('filters-drawer-overlay');
        if (overlay) overlay.addEventListener('click', () => this.closeFiltersDrawer());
    }

    openFiltersDrawer() {
        const drawer = document.getElementById('filters-drawer');
        if (drawer) {
            drawer.classList.add('open');
            this.uiState.filtersDrawerOpen = true;
            document.body.style.overflow = 'hidden';
        }
    }

    closeFiltersDrawer() {
        const drawer = document.getElementById('filters-drawer');
        if (drawer) {
            drawer.classList.remove('open');
            this.uiState.filtersDrawerOpen = false;
            document.body.style.overflow = '';
        }
    }

    setFilterValues() {
        const dr = document.getElementById('date-range'); 
        if (dr) dr.value = this.uiState.activeFilters.dateRange;
        const lf = document.getElementById('league-filter'); 
        if (lf) lf.value = this.uiState.activeFilters.league;
    }

    populateFilterOptions() {
        const leagues = [...new Set(this.data.recommendations.map(r => r.league))].filter(Boolean).sort();
        const leagueSelect = document.getElementById('league-filter');
        
        if (leagueSelect) {
            while (leagueSelect.children.length > 1) {
                leagueSelect.removeChild(leagueSelect.lastChild);
            }
            
            leagues.forEach(league => {
                const option = document.createElement('option');
                option.value = league;
                option.textContent = league;
                leagueSelect.appendChild(option);
            });
        }
    }

    // UI Updates - Streamlined
    updateUI() {
        this.updateKPIs();
        this.renderUnifiedSchedule();
        this.updateLastRunStatus();
    }

    updateKPIs() {
        try {
            // Simplified KPI update with error handling
            const backtestROI = 23.81;
            const backtestWinRate = 64.91;
            const backtestNonLosingRate = 68.15;
            
            const winRateEl = document.getElementById('win-rate');
            if (winRateEl) winRateEl.textContent = `${backtestWinRate.toFixed(1)}%`;
            
            const roiEl = document.getElementById('roi-performance');
            if (roiEl) roiEl.textContent = `+${backtestROI.toFixed(1)}%`;
            
            const nonLosingEl = document.getElementById('non-losing-rate');
            if (nonLosingEl) nonLosingEl.textContent = `${backtestNonLosingRate.toFixed(1)}%`;

            const totalBetsEl = document.getElementById('total-bets');
            if (totalBetsEl) totalBetsEl.textContent = this.data.recommendations?.length || 0;
        } catch (error) {
            console.warn('Error updating KPIs:', error);
        }
    }

    renderUnifiedSchedule() {
        try {
            const container = document.getElementById('unified-games-container');
            if (!container) {
                console.warn('Unified games container not found');
                return;
            }

            // Add day navigator if not present
            const scheduleSection = container.closest('.unified-schedule-section');
            if (scheduleSection && !scheduleSection.querySelector('.day-navigator')) {
                const dayNavHtml = this.dayNavigator.render();
                scheduleSection.insertAdjacentHTML('afterbegin', dayNavHtml);
            }

            if (!this.data.unifiedGames || this.data.unifiedGames.length === 0) {
                container.innerHTML = '<div class="no-games">No games available.</div>';
                return;
            }

            const games = this.getFilteredGamesByDay();
            
            if (games.length === 0) {
                container.innerHTML = '<div class="no-games">No games found for the selected day.</div>';
                return;
            }

            const groupedGames = this.groupGamesByLeague(games);
            container.innerHTML = this.renderLeagueGroups(groupedGames);
            this.initGameCardInteractions();
        } catch (error) {
            console.error('Error rendering schedule:', error);
        }
    }

    getFilteredGamesByDay() {
        let filtered = [...(this.data.unifiedGames || [])];
        
        // Filter by current day
        filtered = this.filterByDay(filtered, this.uiState.currentDay);
        
        // Apply other filters
        filtered = this.filterManager.applyFilters(filtered, 'games');
        
        return filtered.sort((a, b) => a.datetime - b.datetime);
    }
    
    filterByDay(games, day) {
        const today = new Date();
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);
        const dayAfter = new Date(today);
        dayAfter.setDate(dayAfter.getDate() + 2);
        
        switch (day) {
            case 'today':
                return games.filter(g => this.isSameDay(g.datetime, today));
            case 'tomorrow':
                return games.filter(g => this.isSameDay(g.datetime, tomorrow));
            case 'dayafter':
                return games.filter(g => this.isSameDay(g.datetime, dayAfter));
            default:
                return games;
        }
    }

    groupGamesByLeague(games) {
        const groups = {};
        
        const leagues = [...new Set(games.map(g => g.league))].sort((a, b) => {
            if (a === 'England Premier League') return -1;
            if (b === 'England Premier League') return 1;
            const tierA = games.find(g => g.league === a)?.tier || 3;
            const tierB = games.find(g => g.league === b)?.tier || 3;
            if (tierA !== tierB) return tierA - tierB;
            return a.localeCompare(b);
        });
        
        leagues.forEach(league => {
            groups[league] = games.filter(g => g.league === league).sort((a, b) => a.datetime - b.datetime);
        });
        
        return groups;
    }
    
    renderLeagueGroups(groupedGames) {
        return Object.entries(groupedGames)
            .map(([league, leagueGames]) => this.renderTierGroup(league, leagueGames))
            .join('');
    }

    renderTierGroup(tierGroup, games) {
        const leagueFlag = this.getLeagueFlag(tierGroup);
        return `
            <div class="tier-group">
                <div class="tier-group-header">
                    <h4>${leagueFlag} ${tierGroup}</h4>
                    <span class="game-count">${games.length} games</span>
                </div>
                <div class="games-list">
                    ${games.map((game, index) => this.renderGameCard(game, index)).join('')}
                </div>
            </div>
        `;
    }
    
    getLeagueFlag(league) {
        const flags = {
            'England Premier League': '🇬🇧',
            'Spain La Liga': '🇪🇸',
            'Italy Serie A': '🇮🇹',
            'Germany Bundesliga': '🇩🇪',
            'France Ligue 1': '🇫🇷',
            'Netherlands Eredivisie': '🇳🇱',
            'Portugal Primeira Liga': '🇵🇹',
            'Belgium Pro League': '🇧🇪',
            'Scotland Premiership': '🏴󠁧󠁢󠁳󠁣󠁴󠁿',
            'Turkey Super Lig': '🇹🇷',
            'Brazil Serie A': '🇧🇷',
            'Argentina Primera Division': '🇦🇷',
            'Mexico Liga MX': '🇲🇽',
            'USA MLS': '🇺🇸',
            'Japan J1 League': '🇯🇵',
            'South Korea K League 1': '🇰🇷',
            'Australia A-League': '🇦🇺'
        };
        return flags[league] || '⚽';
    }

    renderGameCard(game, index) {
        const cardInstance = new GameCard(game, {
            compact: this.uiState.viewMode === 'mobile',
            showHints: true,
            index: index
        });
        
        this.cardInstances.set(`${game.datetime.getTime()}-${index}`, cardInstance);
        return cardInstance.render();
    }

    // Day navigation
    switchDay(day) {
        this.uiState.currentDay = day;
        
        document.querySelectorAll('.day-tab').forEach(tab => {
            tab.classList.toggle('active', tab.dataset.day === day);
        });
        
        const container = document.getElementById('unified-games-container');
        if (container) {
            container.style.opacity = '0.5';
            container.style.transform = 'translateY(10px)';
            
            setTimeout(() => {
                this.renderUnifiedSchedule();
                container.style.opacity = '1';
                container.style.transform = 'translateY(0)';
            }, 150);
        }
    }
    
    // Analysis toggle for expanded cards
    toggleAnalysis(button) {
        const content = button.nextElementSibling; // .analysis-content
        const isExpanded = button.getAttribute('aria-expanded') === 'true';
        
        // Toggle visibility (removes/adds display: none via .hidden class)
        content.classList.toggle('hidden', isExpanded);
        button.setAttribute('aria-expanded', !isExpanded);
        button.innerHTML = isExpanded ? 'Show Analysis ▼' : 'Hide Analysis ▲';

        // FIX: Recalculate the parent container's height.
        const expandedDetails = button.closest('.expanded-details');
        const card = button.closest('.game-card');

        // Check if the card is expanded and if maxHeight is being used for animation control
        if (expandedDetails && card && card.getAttribute('data-expanded') === 'true' && expandedDetails.style.maxHeight) {
            
            // Use requestAnimationFrame to ensure the layout engine has updated the scrollHeight 
            // after the 'hidden' class change took effect.
            requestAnimationFrame(() => {
                // Update the maxHeight to the new scrollHeight. CSS transition handles the animation.
                expandedDetails.style.maxHeight = expandedDetails.scrollHeight + 'px';
            });
        }
    }
    
    // Card expansion with smooth animation
    toggleGameExpansion(card) {
        const gameId = card.dataset.gameId;
        const expandedDetails = card.querySelector('.expanded-details');
        const expandBtn = card.querySelector('.expand-btn');
        
        if (!expandedDetails || !expandBtn) return;
        
        const isCurrentlyExpanded = this.uiState.expandedCards.has(gameId);
        
        if (!isCurrentlyExpanded) {
            this.uiState.expandedCards.add(gameId);
            expandedDetails.classList.remove('hidden');
            expandBtn.textContent = '▲';
            card.setAttribute('data-expanded', 'true');
            
            // Smooth animation
            expandedDetails.style.maxHeight = '0';
            requestAnimationFrame(() => {
                expandedDetails.style.maxHeight = expandedDetails.scrollHeight + 'px';
            });
        } else {
            this.uiState.expandedCards.delete(gameId);
            expandedDetails.style.maxHeight = '0';
            expandBtn.textContent = '▼';
            card.setAttribute('data-expanded', 'false');
            
            setTimeout(() => {
                expandedDetails.classList.add('hidden');
                expandedDetails.style.maxHeight = '';
            }, 200);
        }
    }

    initGameCardInteractions() {
        setTimeout(() => {
            document.querySelectorAll('.game-card--v3[data-expandable="true"]').forEach(card => {
                card.addEventListener('click', (e) => {
                    if (e.target.closest('.ah-chip') || 
                        e.target.closest('.game-hint') ||
                        e.target.closest('.analysis-toggle')) return;
                    
                    this.toggleGameExpansion(card);
                });
            });
        }, 100);
    }

    updateLastRunStatus() {
        // Last run indicator removed from UI - log to console instead
        const lastUpdate = this.data.metrics.finished_at || this.data.metrics.started_at;
        if (lastUpdate) {
            console.log(`Last run: ${this.formatTimeAgo(lastUpdate)}`);
        }
    }

    // Essential utility methods
    formatTimeAgo(dateStr) {
        if (!dateStr) return '--';
        const date = new Date(dateStr);
        const now = new Date();
        const diffMs = now - date;
        const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
        
        if (diffHours < 1) return 'Just now';
        if (diffHours < 24) return `${diffHours}h ago`;
        
        const diffDays = Math.floor(diffHours / 24);
        return `${diffDays}d ago`;
    }

    showLoading(show) {
        const overlay = document.getElementById('loading-overlay');
        if (overlay) {
            if (show) {
                overlay.classList.remove('hidden');
            } else {
                overlay.classList.add('hidden');
            }
        }
    }

    showError(message) {
        console.error(message);
    }

    // Game sharing
    shareGame(gameTimestamp) {
        const game = this.data.unifiedGames.find(g => g.datetime.getTime() === gameTimestamp);
        if (!game) return;

        const shareText = game.hasRecommendation 
            ? `🎯 ${game.recText} @ ${game.recOdds.toFixed(2)} odds (EV: ${(game.ev * 100).toFixed(1)}%) - ${game.home} vs ${game.away}`
            : `⚽ ${game.home} vs ${game.away}`;

        if (navigator.share) {
            navigator.share({
                title: 'ParlayKing Betting Pick',
                text: shareText,
                url: window.location.href
            });
        } else {
            navigator.clipboard.writeText(shareText);
        }
    }
}

// Initialize application
document.addEventListener('DOMContentLoaded', () => {
    window.parlayKing = new ParlayKing();
});

// Handle page visibility changes
document.addEventListener('visibilitychange', () => {
    if (!document.hidden && window.parlayKing) {
        setTimeout(() => {
            window.parlayKing.loadAllData();
        }, 1000);
    }
});
