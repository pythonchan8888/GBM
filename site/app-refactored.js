// ===== PARLAYKING MAIN APPLICATION =====
// Streamlined main controller - orchestrates modules and components

import { DataManager } from './modules/data-manager.js';
import { AnalyticsManager } from './modules/analytics-manager.js';
import { ScheduleRenderer } from './modules/schedule-renderer.js';
import { Utils } from './modules/utils.js';

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
        return this.options.compact ? this.renderCompact() : this.renderExpanded();
    }
    
    renderCompact() {
        const timeDisplay = Utils.formatGameTime(this.game.datetime);
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
        // Core data storage
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
            activeFilters: Utils.getFiltersFromURL(),
            currentDay: 'today',
            filtersDrawerOpen: false,
            renderedGames: 20,
            virtualScrollOffset: 0
        };
        
        // Performance optimizations
        this.renderQueue = [];
        this.isRendering = false;
        this.cardInstances = new Map();
        
        // Module instances
        this.dataManager = new DataManager();
        this.analyticsManager = new AnalyticsManager(this.data);
        this.filterManager = new FilterManager(this.uiState.activeFilters);
        this.scheduleRenderer = new ScheduleRenderer(this.uiState, this.filterManager);
        this.dayNavigator = new DayNavigator(this);
        
        // UI state
        this.parlayPage = 0;
        
        this.init();
    }

    async init() {
        Utils.showLoading(true);
        await this.loadAllData();
        this.initializeUI();
        this.updateUI();
        Utils.showLoading(false);
    }

    async loadAllData() {
        try {
            this.data = await this.dataManager.loadAllData();
            
            // Update analytics manager with fresh data
            this.analyticsManager = new AnalyticsManager(this.data);
            
            // Populate filter options
            this.populateFilterOptions();
            
            document.querySelectorAll('.lazy-load').forEach(el => {
                el.classList.add('loaded');
            });

        } catch (error) {
            console.error('Failed to load data:', error);
            Utils.showError('Failed to load dashboard data. Please try refreshing the page.');
        }
    }

    populateFilterOptions() {
        const leagues = [...new Set(this.data.recommendations.map(r => r.league))].filter(Boolean).sort();
        const leagueSelect = document.getElementById('league-filter');
        
        if (leagueSelect) {
            // Clear existing options except "All leagues"
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

    // UI Initialization
    initializeUI() {
        this.setupEventListeners();
        this.setFilterValues();
        this.setupChartResize();
    }

    setupEventListeners() {
        // Filter controls
        const dr = document.getElementById('date-range');
        if (dr) dr.addEventListener('change', (e) => { 
            this.uiState.activeFilters.dateRange = e.target.value; 
            Utils.updateURL(this.uiState.activeFilters); 
            this.updateUI(); 
        });
        
        const lf = document.getElementById('league-filter');
        if (lf) lf.addEventListener('change', (e) => { 
            this.uiState.activeFilters.league = e.target.value; 
            Utils.updateURL(this.uiState.activeFilters); 
            this.updateUI(); 
        });
        
        const me = document.getElementById('min-ev');
        if (me) me.addEventListener('input', (e) => { 
            this.uiState.activeFilters.minEV = parseFloat(e.target.value) || 0; 
            Utils.updateURL(this.uiState.activeFilters); 
            this.updateUI(); 
        });
        
        const cf = document.getElementById('confidence-filter');
        if (cf) cf.addEventListener('change', (e) => { 
            this.uiState.activeFilters.confidence = e.target.value; 
            Utils.updateURL(this.uiState.activeFilters); 
            this.updateUI(); 
        });
        
        const rf = document.getElementById('reset-filters');
        if (rf) rf.addEventListener('click', () => { this.resetFilters(); });

        // Chart controls
        document.querySelectorAll('.toggle-btn[data-mode]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                document.querySelectorAll('.toggle-btn[data-mode]').forEach(b => b.classList.remove('active'));
                e.target.classList.add('active');
                this.updateChart();
            });
        });

        document.querySelectorAll('.range-btn[data-range]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                document.querySelectorAll('.range-btn[data-range]').forEach(b => b.classList.remove('active'));
                e.target.classList.add('active');
                this.updateChart();
            });
        });

        // Export functionality
        const exportBtn = document.getElementById('export-recommendations');
        if (exportBtn) {
            exportBtn.addEventListener('click', () => {
                this.exportFilteredRecommendations();
            });
        }

        // Schedule filter functionality
        this.initScheduleFilters();
    }

    initScheduleFilters() {
        const scheduleContainer = document.getElementById('unified-games-container');
        if (!scheduleContainer) return;
        
        // Initialize filters drawer on mobile
        const isMobile = window.innerWidth <= 768;
        if (isMobile) {
            this.initFiltersDrawer();
        }
    }

    initFiltersDrawer() {
        const drawerBtn = document.getElementById('filters-drawer-btn');
        const drawer = document.getElementById('filters-drawer');
        const overlay = document.getElementById('filters-drawer-overlay');
        const closeBtn = document.getElementById('filters-drawer-close');
        
        if (!drawerBtn || !drawer) return;
        
        drawerBtn.addEventListener('click', () => this.openFiltersDrawer());
        if (closeBtn) closeBtn.addEventListener('click', () => this.closeFiltersDrawer());
        if (overlay) overlay.addEventListener('click', () => this.closeFiltersDrawer());
        
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.uiState.filtersDrawerOpen) {
                this.closeFiltersDrawer();
            }
        });
        
        this.syncDrawerFilters();
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

    syncDrawerFilters() {
        const drawerDateRange = document.getElementById('drawer-date-range');
        const drawerLeague = document.getElementById('drawer-league');
        const drawerMinEv = document.getElementById('drawer-min-ev');
        const drawerConfidence = document.getElementById('drawer-confidence');
        
        if (drawerDateRange) drawerDateRange.value = this.uiState.activeFilters.dateRange;
        if (drawerLeague) drawerLeague.value = this.uiState.activeFilters.league;
        if (drawerMinEv) drawerMinEv.value = this.uiState.activeFilters.minEV;
        if (drawerConfidence) drawerConfidence.value = this.uiState.activeFilters.confidence;
        
        this.updateRangeValue();
        
        const applyBtn = document.getElementById('drawer-apply-filters');
        if (applyBtn) {
            applyBtn.addEventListener('click', () => this.applyDrawerFilters());
        }
        
        const resetBtn = document.getElementById('drawer-reset-filters');
        if (resetBtn) {
            resetBtn.addEventListener('click', () => this.resetDrawerFilters());
        }
    }

    updateRangeValue() {
        const rangeInput = document.getElementById('drawer-min-ev');
        const valueDisplay = document.getElementById('drawer-min-ev-value');
        if (rangeInput && valueDisplay) {
            valueDisplay.textContent = `${rangeInput.value}%`;
        }
    }

    applyDrawerFilters() {
        const drawerDateRange = document.getElementById('drawer-date-range');
        const drawerLeague = document.getElementById('drawer-league');
        const drawerMinEv = document.getElementById('drawer-min-ev');
        const drawerConfidence = document.getElementById('drawer-confidence');
        
        if (drawerDateRange) this.uiState.activeFilters.dateRange = drawerDateRange.value;
        if (drawerLeague) this.uiState.activeFilters.league = drawerLeague.value;
        if (drawerMinEv) this.uiState.activeFilters.minEV = parseInt(drawerMinEv.value);
        if (drawerConfidence) this.uiState.activeFilters.confidence = drawerConfidence.value;
        
        this.updateUI();
        this.closeFiltersDrawer();
        
        Utils.trackEvent('filters_applied_from_drawer', this.uiState.activeFilters);
    }

    resetDrawerFilters() {
        this.uiState.activeFilters = {
            dateRange: 'last30',
            league: 'all',
            minEV: 0,
            confidence: 'all'
        };
        
        this.syncDrawerFilters();
        this.updateUI();
        Utils.trackEvent('filters_reset_from_drawer');
    }

    setFilterValues() {
        const dr = document.getElementById('date-range'); 
        if (dr) dr.value = this.uiState.activeFilters.dateRange;
        const lf = document.getElementById('league-filter'); 
        if (lf) lf.value = this.uiState.activeFilters.league;
        const me = document.getElementById('min-ev'); 
        if (me) me.value = this.uiState.activeFilters.minEV;
        const cf = document.getElementById('confidence-filter'); 
        if (cf) cf.value = this.uiState.activeFilters.confidence;
    }

    resetFilters() {
        this.uiState.activeFilters = {
            dateRange: '30',
            league: 'all',
            minEV: 0,
            confidence: 'all'
        };
        this.setFilterValues();
        Utils.updateURL(this.uiState.activeFilters);
        this.updateUI();
    }

    // UI Updates - Orchestration only
    updateUI() {
        this.analyticsManager.updateKPIs();
        this.updateParlayWins();
        this.updateChart();
        this.updateRecommendationsTable();
        this.renderUnifiedSchedule();
        this.updateLastRunStatus();
    }

    renderUnifiedSchedule() {
        const container = document.getElementById('unified-games-container');
        if (container) {
            this.scheduleRenderer.renderUnifiedSchedule(container, this.data);
            this.initGameCardInteractions();
        }
    }

    updateChart() {
        this.analyticsManager.updateChart(this.data.bankrollSeries);
    }

    updateLastRunStatus() {
        const lastUpdate = this.data.metrics.finished_at || this.data.metrics.started_at;
        if (lastUpdate) {
            document.getElementById('last-update').textContent = `Last run: ${Utils.formatTimeAgo(lastUpdate)}`;
        }
    }

    // Performance-optimized batch rendering
    scheduleRender(callback) {
        this.renderQueue.push(callback);
        if (!this.isRendering) {
            this.isRendering = true;
            requestAnimationFrame(() => this.processRenderQueue());
        }
    }
    
    processRenderQueue() {
        const startTime = performance.now();
        
        while (this.renderQueue.length > 0 && (performance.now() - startTime) < 16) {
            const callback = this.renderQueue.shift();
            callback();
        }
        
        if (this.renderQueue.length > 0) {
            requestAnimationFrame(() => this.processRenderQueue());
        } else {
            this.isRendering = false;
        }
    }
    
    // Day navigation
    switchDay(day) {
        this.uiState.currentDay = day;
        
        // Update active tab
        document.querySelectorAll('.day-tab').forEach(tab => {
            tab.classList.toggle('active', tab.dataset.day === day);
        });
        
        // Smooth transition
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
        const content = button.nextElementSibling;
        const isExpanded = button.getAttribute('aria-expanded') === 'true';
        
        content.classList.toggle('hidden', isExpanded);
        button.setAttribute('aria-expanded', !isExpanded);
        button.innerHTML = isExpanded ? 'Show Analysis ▼' : 'Hide Analysis ▲';
    }
    
    // Optimized card expansion
    toggleGameExpansion(card) {
        const gameId = card.dataset.gameId;
        const expandedDetails = card.querySelector('.expanded-details');
        const expandBtn = card.querySelector('.expand-btn');
        
        if (!expandedDetails || !expandBtn) return;
        
        const isCurrentlyExpanded = this.uiState.expandedCards.has(gameId);
        
        if (!isCurrentlyExpanded) {
            // Expand with animation
            this.uiState.expandedCards.add(gameId);
            expandedDetails.classList.remove('hidden');
            expandBtn.textContent = '▲';
            card.setAttribute('data-expanded', 'true');
            expandBtn.setAttribute('aria-expanded', 'true');
            
            // Smooth height animation
            expandedDetails.style.maxHeight = '0';
            expandedDetails.style.overflow = 'hidden';
            requestAnimationFrame(() => {
                expandedDetails.style.maxHeight = expandedDetails.scrollHeight + 'px';
                expandedDetails.style.overflow = 'visible';
            });
        } else {
            // Collapse
            this.uiState.expandedCards.delete(gameId);
            expandedDetails.style.maxHeight = '0';
            expandBtn.textContent = '▼';
            card.setAttribute('data-expanded', 'false');
            expandBtn.setAttribute('aria-expanded', 'false');
            
            setTimeout(() => {
                expandedDetails.classList.add('hidden');
                expandedDetails.style.maxHeight = '';
            }, 200);
        }
    }

    initGameCardInteractions() {
        setTimeout(() => {
            // Enhanced interactions for V3 cards
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

    // Chart resize handling
    setupChartResize() {
        let resizeTimeout;
        
        const handleResize = () => {
            clearTimeout(resizeTimeout);
            resizeTimeout = setTimeout(() => {
                if (this.data.bankrollSeries && this.data.bankrollSeries.length > 0) {
                    const isMobile = window.innerWidth <= 768;
                    this.analyticsManager.updateChart(this.data.bankrollSeries, { simplified: isMobile });
                }
                if (document.getElementById('roi-heatmap')) {
                    this.analyticsManager.renderROIHeatmap(document.getElementById('roi-heatmap'));
                }
                if (document.getElementById('pnl-chart')) {
                    this.analyticsManager.renderPnLChart();
                }
            }, 150);
        };

        window.addEventListener('resize', handleResize);
        window.addEventListener('orientationchange', handleResize);
        
        if ('screen' in window && 'orientation' in window.screen) {
            window.screen.orientation.addEventListener('change', handleResize);
        }
    }

    // Simplified methods that delegate to modules
    updateRecommendationsTable() {
        const tbody = document.getElementById('recommendations-tbody');
        if (!tbody) return;
        
        const filteredRecs = this.filterManager.applyFilters(this.data.recommendations, 'recommendations')
            .filter(r => r.datetime > new Date()) // Upcoming only
            .sort((a, b) => {
                if (a.datetime.getTime() !== b.datetime.getTime()) return a.datetime - b.datetime;
                return parseFloat(b.ev) - parseFloat(a.ev);
            })
            .slice(0, 10);

        tbody.innerHTML = '';

        if (filteredRecs.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; color: var(--muted);">No recommendations found</td></tr>';
            return;
        }

        filteredRecs.forEach(rec => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td><strong>${rec.home}</strong> vs ${rec.away}</td>
                <td><span class="league-badge">${rec.league}</span></td>
                <td><strong>${rec.recommendation}</strong></td>
                <td>${parseFloat(rec.odds).toFixed(2)}</td>
                <td class="${rec.ev >= 0 ? 'positive' : 'negative'}">${rec.ev >= 0 ? '+' : ''}${(parseFloat(rec.ev) * 100).toFixed(1)}%</td>
                <td><span class="confidence-chip confidence-${rec.confidence.toLowerCase()}">${rec.confidence}</span></td>
                <td>${Utils.formatDateTime(rec.datetime)}</td>
            `;
            tbody.appendChild(row);
        });
    }

    updateParlayWins() {
        // Simplified parlay wins update
        const parlays = this.data.parlayWins || [];
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - 14);
        const recentParlays = parlays.filter(p => {
            const end = p.endDate instanceof Date && !isNaN(p.endDate) ? p.endDate : new Date();
            return end >= cutoff;
        });
        
        document.getElementById('total-parlays').textContent = recentParlays.length;
        const maxPayout = recentParlays.length > 0 ? Math.max(...recentParlays.map(p => p.returnPercent)) : 0;
        document.getElementById('max-payout').textContent = `${maxPayout.toFixed(0)}%`;
    }

    exportFilteredRecommendations() {
        const filtered = this.filterManager.applyFilters(this.data.recommendations, 'recommendations');
        const csvContent = Utils.arrayToCSV(filtered, [
            'datetime', 'league', 'home', 'away', 'recommendation', 'line', 'odds', 'ev', 'confidence'
        ]);
        
        Utils.downloadCSV(csvContent, 'parlayking_recommendations.csv');
    }

    // Game interaction methods
    shareGame(gameTimestamp) {
        const game = this.data.unifiedGames.find(g => g.datetime.getTime() === gameTimestamp);
        if (!game) return;

        const shareText = game.hasRecommendation 
            ? `🎯 ${game.recText} @ ${game.recOdds.toFixed(2)} odds (EV: ${(game.ev * 100).toFixed(1)}%) - ${game.home} vs ${game.away}`
            : `⚽ ${game.home} vs ${game.away} - ${Utils.formatDateTime(game.datetime)}`;

        if (navigator.share) {
            navigator.share({
                title: 'ParlayKing Betting Pick',
                text: shareText,
                url: window.location.href
            });
        } else {
            navigator.clipboard.writeText(shareText).then(() => {
                alert('Shared text copied to clipboard!');
            });
        }
    }

    exportGame(gameTimestamp) {
        const game = this.data.unifiedGames.find(g => g.datetime.getTime() === gameTimestamp);
        if (!game || !game.hasRecommendation) return;

        const csvData = [
            ['Date/Time', 'League', 'Match', 'Recommendation', 'Odds', 'EV (%)', 'Confidence', 'Analysis'],
            [
                Utils.formatDateTime(game.datetime),
                game.league,
                `${game.home} vs ${game.away}`,
                game.recText,
                game.recOdds.toFixed(2),
                (game.ev * 100).toFixed(1) + '%',
                game.confidence,
                game.kingsCall
            ]
        ];

        const csvContent = csvData.map(row => row.join(',')).join('\n');
        Utils.downloadCSV(csvContent, `pick_${game.home.replace(/\s+/g, '')}_vs_${game.away.replace(/\s+/g, '')}.csv`);
    }
}

// Make components globally available
window.GameCard = GameCard;
window.DayNavigator = DayNavigator;

// Suppress external script errors
window.addEventListener('error', (event) => {
    if (event.filename && (
        event.filename.includes('extension') || 
        event.filename.includes('evmAsk') ||
        event.filename.includes('chrome-extension') ||
        !event.filename.includes(window.location.host)
    )) {
        event.preventDefault();
        return true;
    }
});

// Initialize the application when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.parlayKing = new ParlayKing();
    
    // Initialize specific page methods based on current page
    const currentPage = window.location.pathname;
    
    setTimeout(() => {
        if (currentPage.includes('analytics.html') && typeof window.parlayKing.initAnalyticsPage === 'function') {
            window.parlayKing.initAnalyticsPage();
        } else if (currentPage.includes('recommendations.html') && typeof window.parlayKing.initRecommendationsPage === 'function') {
            window.parlayKing.initRecommendationsPage();
        } else if (currentPage.includes('index.html') || currentPage === '/' || currentPage === '' || currentPage.endsWith('/')) {
            setTimeout(() => {
                if (window.parlayKing && typeof window.parlayKing.initScheduleFilters === 'function') {
                    window.parlayKing.initScheduleFilters();
                }
            }, 100);
        }
    }, 500);
});

// Handle page visibility changes to refresh data
document.addEventListener('visibilitychange', () => {
    if (!document.hidden && window.parlayKing) {
        setTimeout(() => {
            window.parlayKing.loadAllData();
        }, 1000);
    }
});
