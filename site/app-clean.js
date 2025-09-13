// ===== PARLAYKING REFACTORED - CLEAN ARCHITECTURE =====
// Streamlined version with modular components (4,500 → ~1,500 lines)

// ===== FILTER MANAGER =====
class FilterManager {
    constructor(filters) {
        this.filters = filters;
    }

    applyFilters(items, type = 'games') {
        return items
            .filter(item => this.matchesDateRange(item, this.filters.dateRange, type))
            .filter(item => this.matchesLeague(item, this.filters.league))
            .filter(item => this.matchesMinEV(item, this.filters.minEV, type))
            .filter(item => this.matchesConfidence(item, this.filters.confidence));
    }

    matchesDateRange(item, range, type = 'games') {
        if (range === 'all') return true;
        
        const now = new Date();
        const itemDate = item.datetime;
        if (!itemDate) return false;

        const days = parseInt(range);
        
        // Calculate difference relative to 'now'
        const diffMs = itemDate.getTime() - now.getTime();
        const diffDays = diffMs / (1000 * 60 * 60 * 24);

        if (type === 'recommendations') {
            // Context: Recommendations (Live Picks) - FUTURE ONLY
            
            // Define a buffer for games that might have just started (e.g., 30 minutes ago)
            const bufferMinutes = 30;
            const bufferDays = bufferMinutes / (24 * 60);

            // Must be upcoming (diffDays >= -bufferDays) AND within the range (diffDays <= days)
            return diffDays >= -bufferDays && diffDays <= days;
        } else {
            // Context: Overview/Games/Analytics (Default) - Historical or upcoming
            // (The original logic for other pages, using Math.abs)
            return Math.abs(diffDays) <= days;
        }
    }

    matchesLeague(item, league) {
        return league === 'all' || item.league === league;
    }

    matchesMinEV(item, minEV, type = 'games') {
        if (type === 'recommendations') {
            // Context: Recommendations Page. All items are recommendations.
            // We must check the EV value directly. 
            // Handle missing data robustly (null/undefined).
            if (item.ev === null || item.ev === undefined) return false; 
            return (item.ev * 100) >= minEV;

        } else {
            // Context: Overview/Games Page (Default).
            // If it's just a game without a recommendation, show it (default behavior).
            if (!item.hasRecommendation) return true;
            
            // If it has a recommendation, check the EV.
            if (item.ev === null || item.ev === undefined) return true;
            return (item.ev * 100) >= minEV;
        }
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
        const { homeChip, awayChip, homeTeamClass, awayTeamClass } = this.renderAhChips();
        
        const evPercent = this.game.ev ? (this.game.ev * 100).toFixed(1) : 0;
        const evClass = this.game.ev > 0.15 ? 'high' : '';
        
        const homeShort = this.shortenTeamName(this.game.home);
        const awayShort = this.shortenTeamName(this.game.away);
        const homeAh = this.formatAh(this.game.homeLine);
        const awayAh = this.formatAh(this.game.awayLine);
        
        // Fix: Only bold the actual recommended team, not based on AH favorite
        const homePicked = this.game.hasRecommendation && this.game.recommendedTeam === this.game.home ? 'team-picked' : '';
        const awayPicked = this.game.hasRecommendation && this.game.recommendedTeam === this.game.away ? 'team-picked' : '';

        return `
            <div class="game-card game-card--v4" 
                 data-game-id="${this.game.datetime.getTime()}"
                 data-expandable="${this.isExpandable}"
                 data-expanded="false"
                 data-high-ev="${this.game.ev && this.game.ev > 0.15 ? 'true' : 'false'}"
                 data-low-ev="${this.game.ev && this.game.ev < 0.05 ? 'true' : 'false'}">
                
                <div class="game-row">
                    <div class="game-time">${timeDisplay}</div>
                    <div class="game-matchup-inline">
                        <div class="team-home">
                            <span class="team-ah-inline">${homeAh}</span>
                            <span class="team-name ${homePicked}">${homeShort}</span>
                    </div>
                        <span class="vs-fixed">vs</span>
                        <div class="team-away">
                            <span class="team-name ${awayPicked}">${awayShort}</span>
                            <span class="team-ah-inline">${awayAh}</span>
                        </div>
                    </div>
                    <div class="game-meta-right">
                        ${this.game.hasRecommendation && this.game.ev ? `<i data-feather="zap" class="ev-icon ${evClass}" title="EV ${evPercent}%"></i>` : ''}
                    </div>
                </div>
                ${this.isExpandable ? this.renderExpansion() : ''}
            </div>
        `;
    }
    
    renderExpansion() {
        const confidenceIcon = this.game.confidence === 'High' ? '<i data-feather="award"></i>' : 
                              this.game.confidence === 'Medium' ? '<i data-feather="star"></i>' : '<i data-feather="circle"></i>';
        
        // Add local calculations for evPercent and evClass
        const evPercent = this.game.ev ? (this.game.ev * 100).toFixed(1) : 0;
        const evClass = this.game.ev > 0.15 ? 'high' : '';
        
        return `
            <div class="expanded-details hidden">
                <div class="pick-section flex-balanced">
                    <div class="pick-main flex-grow">
                        <strong>${this.game.recText}</strong>
                    </div>
                    <div class="pick-meta right-aligned">
                        <span class="ev-badge ${evClass}">EV ${evPercent}%</span>
                    </div>
                </div>
                
                ${this.game.kingsCall ? `
                <div class="analysis-content">
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

        const isHomeRecommended = this.game.hasRecommendation && this.game.recommendedTeam === this.game.home;
        const isAwayRecommended = this.game.hasRecommendation && this.game.recommendedTeam === this.game.away;

        // Determine favorite/underdog based on AH lines (negative line = favorite)
        const isHomeFavorite = this.game.homeLine < 0;
        const isAwayFavorite = this.game.awayLine < 0;

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

        // Add favorite/underdog classes to team names
        const homeTeamClass = isHomeFavorite ? 'team-name team-favorite' : 'team-name team-underdog';
        const awayTeamClass = isAwayFavorite ? 'team-name team-favorite' : 'team-name team-underdog';

        return {
            homeChip: `<span class="${homeChipClass}">${this.formatAh(this.game.homeLine)}</span>`,
            awayChip: `<span class="${awayChipClass}">${this.formatAh(this.game.awayLine)}</span>`,
            homeTeamClass: homeTeamClass,
            awayTeamClass: awayTeamClass
        };
    }
    
    renderHint() {
        // Enhanced visual cues for positive EV picks
        if (this.game.hasRecommendation && this.game.ev > 0) {
            const evPercent = (this.game.ev * 100).toFixed(1);
            const hintClass = this.game.ev > 0.15 ? 'game-hint--high-ev' : 'game-hint--active';
            return `<span class="game-hint ${hintClass}" title="Positive EV Pick: ${evPercent}%"><i data-feather="zap"></i></span>`;
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

    formatAh(line) {
        if (line === 0) return '0.0';
        // Ensure accurate formatting for decimals
        const decimalPlaces = Math.abs(line) % 0.5 === 0 ? 1 : 2;
        const formatted = line.toFixed(decimalPlaces);
        return line > 0 ? `+${formatted}` : `${formatted}`.replace('-', '−');
    }

    shortenTeamName(name) {
        const tier1Mappings = {
            // Premier League
            'Brighton & Hove Albion': 'Brighton',
            'Manchester United': 'Man Utd',
            'Manchester City': 'Man City',
            'Tottenham Hotspur': 'Tottenham',
            'West Ham United': 'West Ham',
            'Aston Villa': 'Villa',
            'Newcastle United': 'Newcastle',
            'Crystal Palace': 'Palace',
            'Nottingham Forest': 'Forest',
            'Bournemouth': 'Bournemouth',
            'Wolverhampton Wanderers': 'Wolves',
            'Leicester City': 'Leicester',
            'Ipswich Town': 'Ipswich',
            'Southampton': 'Southampton',
            'Everton': 'Everton',
            'Fulham': 'Fulham',
            'Brentford': 'Brentford',
            'Liverpool': 'Liverpool',
            'Chelsea': 'Chelsea',
            'Arsenal': 'Arsenal',
            // La Liga
            'Real Madrid': 'Real Madrid',
            'Barcelona': 'Barcelona',
            'Atletico Madrid': 'Atletico',
            'Athletic Bilbao': 'Bilbao',
            'Real Sociedad': 'Sociedad',
            'Valencia': 'Valencia',
            'Villarreal': 'Villarreal',
            'Sevilla': 'Sevilla',
            'Real Betis': 'Betis',
            'Celta Vigo': 'Celta Vigo',
            'Rayo Vallecano': 'Rayo',
            'Deportivo Alaves': 'Alaves',
            'Las Palmas': 'Las Palmas',
            'RCD Espanyol': 'Espanyol',
            'RCD Mallorca': 'Mallorca',
            // Bundesliga
            'Bayern Munich': 'Bayern',
            'Borussia Dortmund': 'Dortmund',
            'RB Leipzig': 'Leipzig',
            'Bayer Leverkusen': 'Leverkusen',
            'Borussia Monchengladbach': 'Gladbach',
            'Eintracht Frankfurt': 'Frankfurt',
            'VfB Stuttgart': 'Stuttgart',
            'SC Freiburg': 'Freiburg',
            'TSG Hoffenheim': 'Hoffenheim',
            'FC Augsburg': 'Augsburg',
            'Werder Bremen': 'Bremen',
            // Serie A
            'Inter Milan': 'Inter',
            'AC Milan': 'Milan',
            'Juventus': 'Juventus',
            'Napoli': 'Napoli',
            'Roma': 'Roma',
            'Lazio': 'Lazio',
            'Atalanta': 'Atalanta',
            'Fiorentina': 'Fiorentina',
            'Hellas Verona': 'Verona',
            'Udinese': 'Udinese',
            'Bologna': 'Bologna',
            'Torino': 'Torino',
            'Genoa': 'Genoa',
            'Como': 'Como',
            'Empoli': 'Empoli',
            'Parma': 'Parma',
            'Cagliari': 'Cagliari',
            'Lecce': 'Lecce',
            'Venezia': 'Venezia',
            'Monza': 'Monza',
            // Ligue 1
            'Paris Saint-Germain': 'PSG',
            'Monaco': 'Monaco',
            'Lyon': 'Lyon',
            'Marseille': 'Marseille',
            'Lille': 'Lille',
            'Olympique Marseille': 'Marseille',
            'Olympique Lyonnais': 'Lyon',
            'AS Saint-Etienne': 'Saint-Etienne',
            'FC Nantes': 'Nantes',
            'Stade Rennais': 'Rennes',
            'RC Lens': 'Lens',
            'Montpellier': 'Montpellier',
            'OGC Nice': 'Nice',
            'RC Strasbourg': 'Strasbourg',
            'Toulouse': 'Toulouse',
            'Lorient': 'Lorient',
            'Angers': 'Angers',
            'Brest': 'Brest',
            'Clermont': 'Clermont',
            'Troyes': 'Troyes',
            // Japan J1
            'Machida Zelvia': 'Machida',
            'Yokohama F. Marinos': 'Yokohama',
            'Kashiwa Reysol': 'Kashiwa',
            'Vissel Kobe': 'Vissel',
            'Sanfrecce Hiroshima': 'Hiroshima',
            'Kyoto Sanga': 'Kyoto',
            'FC Tokyo': 'FC Tokyo',
            'Kawasaki Frontale': 'Kawasaki',
            'Cerezo Osaka': 'Cerezo',
            'Gamba Osaka': 'Gamba',
            'Urawa Red Diamonds': 'Urawa',
            'Nagoya Grampus': 'Nagoya',
            'Avispa Fukuoka': 'Fukuoka',
            'Shonan Bellmare': 'Shonan',
            'Albirex Niigata': 'Niigata',
            'Consadole Sapporo': 'Sapporo',
            'Jubilo Iwata': 'Iwata',
            'Kashima Antlers': 'Kashima'
        };

        const lowerName = name.toLowerCase();
        for (let key in tier1Mappings) {
            if (key.toLowerCase() === lowerName) {
                return tier1Mappings[key];
            }
        }

        // Aggressive fallback shortening for any remaining long names
        return name
            .replace(/ & Hove Albion/g, '')
            .replace(/ United/g, ' Utd')
            .replace(/ City/g, ' City')
            .replace(/ Hotspur/g, '')
            .replace(/ F\. Marinos/g, '')
            .replace(/ Saint-Germain/g, '')
            .replace(/ Marseille/g, '')
            .replace(/Olympique /g, '')
            .replace(/FC /g, '')
            .replace(/AS /g, '')
            .replace(/RC /g, '')
            .replace(/OGC /g, '')
            .replace(/Stade /g, '')
            .replace(/ Zelvia/g, '')
            .replace(/ Reysol/g, '')
            .replace(/ Hiroshima/g, '')
            .replace(/ Sanga/g, '')
            .trim();
    }
}

// ===== DAY NAVIGATOR COMPONENT =====
class DayNavigator {
    constructor(parlayKing) {
        this.parlayKing = parlayKing;
    }
    
    getDaysWithGames() {
        // Create day boundaries in user's local timezone
        const today = new Date();
        
        // Get start of today in local timezone
        const localDayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
        
        // Generate 4 consecutive days starting from today in local timezone
        const fourDays = [];
        for (let i = 0; i < 4; i++) {
            const day = new Date(localDayStart);
            day.setDate(localDayStart.getDate() + i);
            fourDays.push(day);
        }
        
        return fourDays;
    }
    
    setupSwipeGestures(navElement) {
        // Check if Hammer.js is available
        if (typeof Hammer === 'undefined') {
            console.warn('Hammer.js not loaded, falling back to touch events');
            this.setupFallbackSwipeGestures(navElement);
            return;
        }

        const hammer = new Hammer(navElement);
        hammer.get('pan').set({ direction: Hammer.DIRECTION_HORIZONTAL, threshold: 10 });

        let startScroll = 0;
        hammer.on('panstart', (e) => {
            startScroll = navElement.scrollLeft;
        });

        hammer.on('pan', (e) => {
            // Smooth scrolling during pan - invert deltaX for natural feel
            navElement.scrollLeft = startScroll - e.deltaX;
        });

        hammer.on('panend', (e) => {
            const currentDay = parseInt(this.parlayKing.uiState.currentDay) || 0;
            const velocity = e.velocityX;
            const deltaX = e.deltaX;
            
            // Determine direction: left swipe (negative deltaX) = next day, right swipe = previous day
            let targetDay = currentDay;
            
             if (Math.abs(deltaX) > 50 || Math.abs(velocity) > 0.3) {
                 if (deltaX < 0) {
                     // Swiped left = next day
                     targetDay = Math.min(3, currentDay + 1);
                 } else {
                     // Swiped right = previous day  
                     targetDay = Math.max(0, currentDay - 1);
                 }
            } else {
                // Small swipe - find closest tab to center
                const tabs = navElement.querySelectorAll('.day-tab');
                let closestTab = null;
                let minDistance = Infinity;
                
                tabs.forEach((tab) => {
                    const tabRect = tab.getBoundingClientRect();
                    const navRect = navElement.getBoundingClientRect();
                    const tabCenter = tabRect.left + tabRect.width / 2;
                    const navCenter = navRect.left + navRect.width / 2;
                    const distance = Math.abs(tabCenter - navCenter);
                    
                    if (distance < minDistance) {
                        minDistance = distance;
                        closestTab = tab;
                    }
                });
                
                if (closestTab) {
                    targetDay = parseInt(closestTab.dataset.day);
                }
            }
            
            // Switch to the target day (this will center it and apply orange background)
            this.parlayKing.switchDay(targetDay.toString());
        });
    }

    setupFallbackSwipeGestures(navElement) {
        let startX = 0;
        let startScrollLeft = 0;

        navElement.addEventListener('touchstart', (e) => {
            startX = e.touches[0].pageX;
            startScrollLeft = navElement.scrollLeft;
        }, { passive: true });
        
        navElement.addEventListener('touchmove', (e) => {
            const deltaX = e.touches[0].pageX - startX;
            navElement.scrollLeft = startScrollLeft - deltaX;
        }, { passive: true });

        navElement.addEventListener('touchend', (e) => {
            const endX = e.changedTouches[0].pageX;
            const deltaX = startX - endX;
            const currentDay = parseInt(this.parlayKing.uiState.currentDay) || 0;
            
             // If significant swipe, change day
             if (Math.abs(deltaX) > 50) {
                 let targetDay = currentDay;
                 if (deltaX > 0) {
                     // Swiped left = next day
                     targetDay = Math.min(3, currentDay + 1);
                 } else {
                     // Swiped right = previous day
                     targetDay = Math.max(0, currentDay - 1);
                 }
                this.parlayKing.switchDay(targetDay.toString());
            }
        }, { passive: true });
    }

    render() {
        const daysWithGames = this.getDaysWithGames();
        
        if (daysWithGames.length === 0) {
            return `<div class="day-navigator"><div class="no-upcoming-games">No upcoming games</div></div>`;
        }
        
        // If current day doesn't have games, switch to first available day
        const currentDayIndex = parseInt(this.parlayKing.uiState.currentDay) || 0;
        if (currentDayIndex >= daysWithGames.length) {
            this.parlayKing.uiState.currentDay = '0';
        }
        
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        const html = `
            <div class="day-navigator">
                ${daysWithGames.map((day, index) => {
                    // Use local time for consistent comparison with game times
                    const today = new Date();
                    const localDayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
                    const localTomorrow = new Date(localDayStart);
                    localTomorrow.setDate(localDayStart.getDate() + 1);
                    
                    let label;
                    if (day.getTime() === localDayStart.getTime()) {
                        label = 'Today';
                        // Add class for today
                        return `
                            <button class="day-tab today ${this.parlayKing.uiState.currentDay === index.toString() ? 'active' : ''}" 
                                    data-day="${index}" onclick="window.parlayKing.switchDay('${index}')">
                                ${label}
                            </button>
                        `;
                    } else if (day.getTime() === localTomorrow.getTime()) {
                        label = 'Tomorrow';
                    } else {
                        // FOTMOB style: "Thu 12 Sep"
                        const dayName = day.toLocaleDateString('en-US', { weekday: 'short' });
                        const dayNum = day.getDate();
                        const month = day.toLocaleDateString('en-US', { month: 'short' });
                        label = `${dayName} ${dayNum} ${month}`;
                    }
                    
                    return `
                        <button class="day-tab ${this.parlayKing.uiState.currentDay === index.toString() ? 'active' : ''}" 
                                data-day="${index}" onclick="window.parlayKing.switchDay('${index}')">
                            ${label}
                        </button>
                    `;
                }).join('')}
            </div>
        `;
        
        // Setup swipe gestures after rendering
        setTimeout(() => {
            const navElement = document.querySelector('.day-navigator');
            if (navElement) {
                this.setupSwipeGestures(navElement);
                // Force immediate centering after DOM is ready
                setTimeout(() => this.parlayKing.centerActiveDayTab(), 100);
            }
        }, 50); // Reduced delay for faster initialization
        
        return html;
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
            currentDay: '0', // Always start with TODAY (index 0)
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
        
        // Register Service Worker for PWA functionality
        if ('serviceWorker' in navigator) {
            try {
                await navigator.serviceWorker.register('/sw.js');
                console.log('Service Worker registered successfully');
            } catch (error) {
                console.log('Service Worker registration failed:', error);
            }
        }
        
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
            // FIX: Load all required data files concurrently, including analytics data
            const [
                metrics, 
                recommendations, 
                unifiedGames,
                roiHeatmapData, // ADDED
                topSegmentsData, // ADDED
                parlayWinsData // ADDED
            ] = await Promise.all([
                this.loadCSV('metrics.csv').catch(() => []),
                this.loadCSV('latest_recommendations.csv').catch(() => []),
                this.loadCSV('unified_games.csv').catch(() => []),
                // Add the missing analytics data sources
                this.loadCSV('roi_heatmap.csv').catch(() => []), // ADDED
                this.loadCSV('top_segments.csv').catch(() => []), // ADDED
                this.loadCSV('parlay_wins.csv').catch(() => []) // ADDED
            ]);


            this.data = {
                ...this.data,
                metrics: this.parseMetrics(metrics || []),
                recommendations: this.parseRecommendations(recommendations || []),
                unifiedGames: this.parseUnifiedGames(unifiedGames || []),
                // FIX: Assign the new data using dedicated parsers
                roiHeatmap: this.parseRoiHeatmap(roiHeatmapData || []), // ADDED
                topSegments: this.parseTopSegments(topSegmentsData || []), // ADDED
                parlayWins: this.parseParlayWins(parlayWinsData || []) // ADDED
            };

            this.populateFilterOptions();

            console.log('Data loaded successfully:', {
                metrics: Object.keys(this.data.metrics).length,
                recommendations: this.data.recommendations.length,
                unifiedGames: this.data.unifiedGames.length,
                roiHeatmap: this.data.roiHeatmap.length,
                topSegments: this.data.topSegments.length,
                parlayWins: this.data.parlayWins.length
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
                const parsedTeam = recMatch[1].trim().toLowerCase();
                const parsedLine = parseFloat(recMatch[2]);
                
                const homeLower = game.home.toLowerCase();
                const awayLower = game.away.toLowerCase();
                
                // Better matching: check both directions and use includes for partial matches
                if (parsedTeam === homeLower || homeLower.includes(parsedTeam) || parsedTeam.includes(homeLower.split(' ')[0])) {
                    recommendedTeam = game.home;
                    homeLine = parsedLine;
                    awayLine = -parsedLine;
                } else if (parsedTeam === awayLower || awayLower.includes(parsedTeam) || parsedTeam.includes(awayLower.split(' ')[0])) {
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

    // Add these parsing methods for analytics data
    parseRoiHeatmap(rawData) {
        if (!Array.isArray(rawData)) return [];
        
        return rawData.map(item => {
            // 1. Validate: Ensure required fields exist in the CSV row
            if (item.tier === undefined || item.line === undefined || item.roi_pct === undefined || item.n === undefined) {
                return null; // Skip this row if data is missing
            }

            // 2. Transform: Construct the segment name (e.g., "Tier 1 (Line -1.5)")
            const segmentDescription = `Tier ${item.tier} (Line: ${item.line})`;
            
            // 3. Format: Convert roi_pct (e.g., 71.77) to decimal (0.7177)
            // The rendering logic expects a decimal value.
            const roiValue = parseFloat(item.roi_pct) / 100;
            
            // 4. Format: Parse the count (n)
            const countValue = parseInt(item.n);

            return {
                segment: segmentDescription,
                roi: isNaN(roiValue) ? 0 : roiValue,
                count: isNaN(countValue) ? 0 : countValue
            };
        }).filter(item => item !== null && item.count > 0); // Filter out invalid rows and zero counts
    }

    parseTopSegments(rawData) {
        if (!Array.isArray(rawData)) return [];
        return rawData.map(item => ({
            // FIX: Use actual CSV column names (same structure as ROI heatmap)
            tier: parseInt(item.tier) || 0,
            line: parseFloat(item.line) || 0,
            segment: `Tier ${item.tier} | Line ${item.line > 0 ? '+' : ''}${item.line}`,
            roi: parseFloat(item.roi_pct) / 100 || 0, // Convert percentage to decimal
            count: parseInt(item.n) || 0
        })).filter(item => item.count > 0);
    }
    
    parseParlayWins(rawWins) {
        if (!Array.isArray(rawWins)) return [];
        // Basic parsing/validation logic
        return rawWins.filter(w => w && w.date && w.payout);
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
        return (
            date1.getFullYear() === date2.getFullYear() &&
            date1.getMonth() === date2.getMonth() &&
            date1.getDate() === date2.getDate()
        );
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

    updateURLParams() {
        const params = new URLSearchParams(window.location.search);
        params.set('day', this.uiState.currentDay);
        params.set('dateRange', this.uiState.activeFilters.dateRange);
        params.set('league', this.uiState.activeFilters.league);
        params.set('minEV', this.uiState.activeFilters.minEV.toString());
        params.set('confidence', this.uiState.activeFilters.confidence);
        
        history.replaceState(null, '', `${window.location.pathname}?${params.toString()}`);
    }

    // Helper to determine the current page
    getCurrentPage() {
        const path = window.location.pathname;
        // Check pathname (more reliable than body classes)
        if (path.includes('analytics.html')) return 'analytics';
        if (path.includes('recommendations.html')) return 'recommendations';
        return 'overview'; // Default to overview
    }

    // UI Initialization
    initializeUI() {
        // Global initializations
        this.setupEventListeners();
        this.setFilterValues();
        this.setupHeaderShrinking();
        this.setupPullToRefresh();
        
        // Determine the current page context
        const currentPage = this.getCurrentPage();
        console.log(`Initializing UI for page: ${currentPage}`);
        
        // Call the appropriate page initializer
        if (currentPage === 'overview') {
            // Overview page initialization (if needed)
        } else if (currentPage === 'analytics') {
            this.initAnalyticsPage(); // CRITICAL CALL
        } else if (currentPage === 'recommendations') {
            this.initRecommendationsPage();
        }
    }
    
    setupPullToRefresh() {
        const container = document.getElementById('pull-refresh-container');
        if (container && window.innerWidth <= 768) {
            let startY = 0, pullDistance = 0;
            
            container.addEventListener('touchstart', e => {
                startY = e.touches[0].pageY;
            }, { passive: true });
            
            container.addEventListener('touchmove', e => {
                pullDistance = e.touches[0].pageY - startY;
                if (pullDistance > 0 && window.scrollY === 0) {
                    e.preventDefault();
                    container.classList.add('pulling');
                    container.style.setProperty('--pull-distance', `${Math.min(pullDistance, 100)}px`);
                }
            }, { passive: false });
            
            container.addEventListener('touchend', async () => {
                container.classList.remove('pulling');
                if (pullDistance > 80) {
                    container.classList.add('refreshing');
                    await this.loadAllData();
                    this.updateUI();
                    setTimeout(() => container.classList.remove('refreshing'), 1000);
                }
                pullDistance = 0;
            });
        }
    }

    setupHeaderShrinking() {
        const header = document.querySelector('.nav-container');
        // Get the day navigator for sticky activation tracking
        const dayNavigator = document.querySelector('.day-navigator');
        if (!header) return;

        const scrollThreshold = 50; 

        const updateHeaderAndSticky = () => {
            const scrollY = window.scrollY;

            // 1. Handle the header shrinking class (still useful for subtle shrinking)
            if (scrollY > scrollThreshold) {
                header.classList.add('shrunk');
            } else {
                header.classList.remove('shrunk');
            }
            
            // 2. Dynamically update the header height CSS variable
            // This ensures the Day Navigator sticks perfectly below the header
            const headerHeight = header.offsetHeight;
            document.documentElement.style.setProperty('--header-height', `${headerHeight}px`);

            // 3. Add class to Day Navigator when it becomes sticky (for the shadow)
            if (dayNavigator) {
                // Check if we have scrolled past the top of the schedule section
                if (scrollY > 0) {
                     dayNavigator.classList.add('sticky-active');
                } else {
                     dayNavigator.classList.remove('sticky-active');
                }
            }
        };

        // Use requestAnimationFrame for optimized, smooth scroll handling
        let ticking = false;
        const handleScroll = () => {
            if (!ticking) {
                window.requestAnimationFrame(() => {
                    updateHeaderAndSticky();
                    ticking = false;
                });
                ticking = true;
            }
        };

        // Initial check on page load and resize (for orientation changes)
        updateHeaderAndSticky();
        window.addEventListener('scroll', handleScroll, { passive: true });
        window.addEventListener('resize', updateHeaderAndSticky);
    }

    setupDayNavigationListeners() {
        // Add click event listeners to day navigation tabs
        const dayTabs = document.querySelectorAll('.day-tab');
        dayTabs.forEach(tab => {
            tab.addEventListener('click', (e) => {
                e.preventDefault();
                const dayIndex = tab.dataset.day;
                if (dayIndex !== undefined) {
                    this.uiState.currentDay = dayIndex;
                    this.updateUI();
                }
            });
        });
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

        // Initialize recommendations page specific features
        this.initRecommendationsPage();

        // Initialize mobile drawer if needed
        if (window.innerWidth <= 768) {
            this.initFiltersDrawer();
        }
    }

    // Recommendations page initialization
    initRecommendationsPage() {
        // Set defaults for filters that no longer have UI controls
        this.setDefaultFiltersForRecommendations();
        
        // Initialize the new EV Slider interaction
        this.initEvSlider();
        
        // Setup the League filter interaction
        this.setupLeagueFilter('league-filter-recs');
    }

    // Analytics page initialization
    initAnalyticsPage() {
        console.log("Initializing Analytics Page...");
        
        // Render all analytics components
        this.renderRoiHeatmap();
        this.renderTopSegments();
        this.renderParlayWins();
        
        // Setup filter interactions specific to the analytics page (if any)
        this.setupAnalyticsFilters();
    }

    // Render ROI Heatmap
    renderRoiHeatmap() {
        // Ensure the container element exists in analytics.html 
        const container = document.getElementById('roi-heatmap');
        if (!container) {
            console.warn("ROI Heatmap container (roi-heatmap) not found in HTML.");
            return;
        }

        if (!this.data.roiHeatmap || this.data.roiHeatmap.length === 0) {
            container.innerHTML = '<p class="empty-state">No ROI Heatmap data available.</p>';
            return;
        }

        console.log(`Rendering ROI Heatmap with ${this.data.roiHeatmap.length} items.`);

        // Sort data by highest ROI first
        const sortedData = [...this.data.roiHeatmap].sort((a, b) => b.roi - a.roi);

        const html = sortedData.map(item => {
            const roiPercent = (item.roi * 100).toFixed(1);
            
            // Determine color coding class based on ROI value (using existing CSS classes)
            let heatClass = 'heat-mid';
            if (item.roi > 0.05) { // > 5% ROI
                heatClass = 'heat-pos';
            } else if (item.roi < -0.05) { // < -5% ROI
                heatClass = 'heat-neg';
            }

            return `
                <div class="heatmap-cell ${heatClass}">
                    <div class="heatmap-value">${roiPercent}%</div>
                    <div class="heatmap-meta">
                        <strong>${item.segment}</strong><br>
                        <small>Bets: ${item.count}</small>
                    </div>
                </div>
            `;
        }).join('');

        // Wrap the cells in the grid container
        container.innerHTML = `<div class="heatmap-grid">${html}</div>`;
    }

    // Render Top Performing Segments
    renderTopSegments() {
        const container = document.getElementById('top-segments-container');
        if (!container) {
            console.log('Top segments container not found, skipping...');
            return;
        }

        if (!this.data.topSegments || this.data.topSegments.length === 0) {
            container.innerHTML = '<p class="empty-state">No Top Segments data available.</p>';
            return;
        }
        
        console.log(`Rendering Top Segments with ${this.data.topSegments.length} items.`);

        // Sort by ROI descending and take top 10
        const sortedData = [...this.data.topSegments].sort((a, b) => b.roi - a.roi).slice(0, 10);

        const html = sortedData.map(item => {
            const roiPercent = (item.roi * 100).toFixed(1);
            const lineDisplay = item.line > 0 ? `+${item.line}` : `${item.line}`;

            return `
                <div class="segment-pill">
                    <div class="pill-top">
                        <span class="line-text">${roiPercent}% ROI</span>
                        <span class="segment-name">${item.segment}</span>
                    </div>
                    <div class="pill-bottom">
                        <span>Line: ${lineDisplay}</span>
                        <span>Bets: ${item.count}</span>
                    </div>
                </div>
            `;
        }).join('');

        container.innerHTML = `<div class="segments-pills">${html}</div>`;
    }
    
    // Render Parlay Wins
    renderParlayWins() {
        const container = document.getElementById('parlay-grid');
        if (!container) return;
        
        if (!this.data.parlayWins || this.data.parlayWins.length === 0) {
            container.innerHTML = '<p class="empty-state">No parlay wins data available.</p>';
            return;
        }
        
        console.log(`Rendering Parlay Wins with ${this.data.parlayWins.length} items.`);

        // Update stats in header
        const totalParlaysEl = document.getElementById('total-parlays');
        const maxPayoutEl = document.getElementById('max-payout');
        
        if (totalParlaysEl) totalParlaysEl.textContent = this.data.parlayWins.length;
        
        // Find max payout
        const maxPayout = Math.max(...this.data.parlayWins.map(w => parseFloat(w.payout) || 0));
        if (maxPayoutEl) maxPayoutEl.textContent = `$${maxPayout.toFixed(0)}`;

        // Render parlay items
        const html = this.data.parlayWins.map(win => `
            <div class="parlay-item">
                <div class="parlay-date">${win.date}</div>
                <div class="parlay-payout">$${parseFloat(win.payout).toFixed(0)}</div>
                <div class="parlay-details">${win.details || 'Multi-leg parlay win'}</div>
            </div>
        `).join('');

        container.innerHTML = html;
    }

    // Setup Analytics Filters
    setupAnalyticsFilters() {
        const dateRangeFilter = document.getElementById('date-range-analytics');
        if (dateRangeFilter) {
            dateRangeFilter.addEventListener('change', (e) => {
                this.uiState.activeFilters.dateRange = e.target.value;
                console.log("Analytics Date Range changed (Note: Dynamic filtering may not be fully supported yet).");
            });
        }
    }

    setDefaultFiltersForRecommendations() {
        // Enforce the default Date Range (7 days) as the UI control is removed
        this.uiState.activeFilters.dateRange = '7'; 
        // Enforce 'all' Confidence as the UI control is removed
        this.uiState.activeFilters.confidence = 'all';
    }
    
    setupLeagueFilter(elementId) {
        const leagueFilter = document.getElementById(elementId);
        if (leagueFilter) {
            // Populate league options from recommendations data
            this.populateLeagueOptions(elementId);
            
            // Set up event listener
            leagueFilter.addEventListener('change', (e) => {
                this.uiState.activeFilters.league = e.target.value;
                this.updateUI();
            });
        }
    }
    
    populateLeagueOptions(elementId) {
        const leagueSelect = document.getElementById(elementId);
        if (!leagueSelect || !this.data.recommendations) return;
        
        // Get unique leagues from recommendations data
        const leagues = [...new Set(this.data.recommendations.map(r => r.league))].filter(Boolean).sort();
        
        // Clear existing options except "All leagues"
        while (leagueSelect.children.length > 1) {
            leagueSelect.removeChild(leagueSelect.lastChild);
        }
        
        // Add league options
        leagues.forEach(league => {
            const option = document.createElement('option');
            option.value = league;
            option.textContent = league;
            leagueSelect.appendChild(option);
        });
        
        console.log(`Populated ${leagues.length} leagues in ${elementId}:`, leagues);
    }

    initEvSlider() {
        const slider = document.getElementById('min-ev-slider');
        const valueDisplay = document.getElementById('min-ev-value');
        // FIX: Select the new interactive labels instead of the old presets
        const labels = document.querySelectorAll('.slider-labels .slider-label');

        if (!slider || !valueDisplay) return;

        // Function to update the display and internal state
        const updateDisplay = (value) => {
            const floatValue = parseFloat(value);
            const formattedValue = floatValue.toFixed(0); // Whole numbers for 0-50% range
            
            // Update slider value (Crucial for Firefox progress bar)
            slider.value = value; 
            
            valueDisplay.textContent = `${formattedValue}%`;
            this.uiState.activeFilters.minEV = floatValue;
            
            // Update orange progress line using CSS variable (Crucial for WebKit/Blink)
            const progressPercent = (floatValue / 50) * 100; // Convert to 0-100% for CSS
            slider.style.setProperty('--slider-progress', `${progressPercent}%`);
            
            // FIX: Update active label highlighting
            labels.forEach(label => {
                const labelValue = parseFloat(label.dataset.value);
                // Highlight if the label value is less than or equal to the current slider value
                label.classList.toggle('active', labelValue <= floatValue);
            });
        };

        // Function to trigger the UI update (filter the list)
        const applyFilter = () => {
            // We call updateUI() which handles rendering across different pages.
            // If on the recommendations page, ensure updateUI() calls renderRecommendations() if needed.
            this.updateUI();
        };

        // Initialize display with the current value
        const initialValue = this.uiState.activeFilters.minEV || 0;
        updateDisplay(initialValue);

        // 'input' event: Real-time update while sliding (updates display and progress line)
        slider.addEventListener('input', (e) => {
            updateDisplay(e.target.value);
        });

        // 'change' event: Trigger the actual UI update after sliding (Performance optimization)
        slider.addEventListener('change', applyFilter);

        // FIX: Event listeners for clicking the labels (restores preset functionality)
        labels.forEach(label => {
            label.addEventListener('click', () => {
                updateDisplay(label.dataset.value);
                applyFilter(); // Apply immediately when a label is clicked
            });
        });
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
        this.renderRecommendations();
        this.updateLastRunStatus();
        
        this.populateFilterOptions();
        this.populateLeagueOptions('league-filter-recs');
        
        // Fallback load for Feather if not present
        if (typeof feather === 'undefined') {
            const script = document.createElement('script');
            script.src = 'https://unpkg.com/feather-icons';
            script.onload = () => feather.replace();
            document.head.appendChild(script);
        } else {
            setTimeout(() => feather.replace(), 200);
        }

        this.switchDay(this.uiState.currentDay || '0');
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
            
            // Show skeleton loaders while data is loading or empty
            if (!this.data.unifiedGames || this.data.unifiedGames.length === 0) {
                let skeletonHtml = '';
                for (let i = 0; i < 3; i++) { // 3 skeleton leagues
                    skeletonHtml += `
                        <div class="tier-group skeleton-group">
                            <div class="tier-group-header skeleton-header"></div>
                            <div class="games-list">
                                ${Array(4).fill(0).map(() => '<div class="game-card skeleton-card"></div>').join('')}
                            </div>
                        </div>
                    `;
                }
                container.innerHTML = skeletonHtml;
                return;
            }
            
            this.ensureValidCurrentDay();

            // Add day navigator to dedicated container
            const dayNavContainer = document.getElementById('day-navigator-container');
            if (dayNavContainer && !dayNavContainer.querySelector('.day-navigator')) {
                const dayNavHtml = this.dayNavigator.render();
                dayNavContainer.innerHTML = dayNavHtml;
                
                // Add event listeners for day navigation
                this.setupDayNavigationListeners();
                
                // Center the active tab on mobile
                this.centerActiveDayTab();
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
            
            // Ensure Feather icons are replaced after DOM update
            if (typeof feather !== 'undefined') {
                feather.replace();
                console.log('Feather icons replaced after rendering schedule');
            } else {
                console.warn('Feather not loaded');
            }
            
            this.initGameCardInteractions();
        } catch (error) {
            console.error('Error rendering schedule:', error);
        }
    }
    
    ensureValidCurrentDay() {
        const daysWithGames = this.dayNavigator.getDaysWithGames();
        const currentIndex = parseInt(this.uiState.currentDay) || 0;
        
        // If current day index is invalid or no games on that day, reset to first available day
        if (currentIndex >= daysWithGames.length || daysWithGames.length === 0) {
            this.uiState.currentDay = '0';
        }
    }

    renderRecommendations() {
        try {
            const container = document.getElementById('recommendations-cards');
            if (!container) {
                // Not on recommendations page, skip
                return;
            }

            if (!this.data.recommendations || this.data.recommendations.length === 0) {
                container.innerHTML = '<div class="no-recommendations">No recommendations available.</div>';
                return;
            }

            // CRITICAL FIX: Apply filters using the correct type 'recommendations'
            const filteredRecs = this.filterManager.applyFilters(this.data.recommendations, 'recommendations');
            
            if (filteredRecs.length === 0) {
                container.innerHTML = '<div class="no-recommendations">No recommendations match your filters.</div>';
                return;
            }

            // Render recommendation cards
            container.innerHTML = filteredRecs.map(rec => this.renderRecommendationCard(rec)).join('');
            
        } catch (error) {
            console.error('Error rendering recommendations:', error);
        }
    }

    renderRecommendationCard(rec) {
        const timeDisplay = rec.datetime ? rec.datetime.toLocaleTimeString('en-GB', { 
            hour: '2-digit', 
            minute: '2-digit',
            hour12: false 
        }) : '--:--';
        
        const evDisplay = rec.ev ? `+${(rec.ev * 100).toFixed(1)}%` : '--';
        const confidenceIcon = rec.confidence === 'High' ? '<i data-feather="award"></i>' : 
                              rec.confidence === 'Medium' ? '<i data-feather="star"></i>' : '<i data-feather="circle"></i>';
        
        // Add premium styling for high EV recommendations
        const cardClasses = ['rec-card'];
        if (rec.ev && rec.ev > 0.15) { // >15% EV gets hero treatment
            cardClasses.push('high-ev');
        }
        
        return `
            <div class="${cardClasses.join(' ')}">
                <div class="rec-header">
                    <div class="rec-time">${timeDisplay}</div>
                    <div class="rec-confidence" title="${rec.confidence}">${confidenceIcon}</div>
                </div>
                <div class="rec-matchup">
                    <h4>${rec.home} vs ${rec.away}</h4>
                    <div class="rec-league">${rec.league}</div>
                </div>
                <div class="rec-pick">
                    <div class="pick-text" onclick="navigator.clipboard.writeText('${rec.recommendation.replace(/'/g, "\\'")}'); this.style.transform='scale(0.95)'; setTimeout(() => this.style.transform='', 150);" title="Click to copy recommendation">${rec.recommendation}</div>
                </div>
                <div class="rec-footer">
                    <div class="ev-badge">EV ${evDisplay}</div>
                    ${rec.kingsCall ? `<button class="show-analysis-btn" onclick="this.nextElementSibling.classList.toggle('hidden')">Analysis</button>
                    <div class="analysis-content hidden">${rec.kingsCall}</div>` : ''}
                </div>
            </div>
        `;
    }

    getFilteredGamesByDay() {
        let filtered = [...(this.data.unifiedGames || [])];
        
        // Filter by current day
        filtered = this.filterByDay(filtered, this.uiState.currentDay);
        
        // Apply other filters
        filtered = this.filterManager.applyFilters(filtered, 'games');
        
        return filtered.sort((a, b) => a.datetime - b.datetime);
    }
    
    filterByDay(games, dayIndex) {
        const daysWithGames = this.dayNavigator.getDaysWithGames();
        
        // Debug logging
        console.log('DEBUG: filterByDay called with dayIndex:', dayIndex);
        console.log('DEBUG: daysWithGames:', daysWithGames.map(d => d.toISOString()));
        console.log('DEBUG: games count:', games.length);
        if (games.length > 0) {
            console.log('DEBUG: first game datetime:', games[0].datetime?.toISOString());
        }
        
        // If no specific day selected or invalid index, return all games
        const index = parseInt(dayIndex);
        if (isNaN(index) || index < 0 || index >= daysWithGames.length) {
                return games;
        }
        
        const selectedDay = daysWithGames[index];
        console.log('DEBUG: selectedDay:', selectedDay.toISOString());
        
        const filtered = games.filter(g => {
            const matches = this.isSameDay(g.datetime, selectedDay);
            if (!matches && games.indexOf(g) < 3) { // Log first few mismatches
                console.log('DEBUG: Game mismatch - game:', g.datetime?.toISOString(), 'vs selectedDay:', selectedDay.toISOString());
            }
            return matches;
        });
        
        console.log('DEBUG: filtered games count:', filtered.length);
        return filtered;
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
            'Scotland Premiership': '🇬🇧',
            'Turkey Super Lig': '🇹🇷',
            'Brazil Serie A': '🇧🇷',
            'Argentina Primera Division': '🇦🇷',
            'Mexico Liga MX': '🇲🇽',
            'USA MLS': '🇺🇸',
            'Japan J1 League': '🇯🇵',
            'South Korea K League 1': '🇰🇷',
            'Australia A-League': '🇦🇺',
            'England Championship': '🇬🇧',
            'Denmark Superliga': '🇩🇰',
            'Saudi Arabia Professional League': '🇸🇦',
            'Portugal Liga NOS': '🇵🇹'
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
    switchDay(dayIndex) {
        this.uiState.currentDay = dayIndex.toString();
        this.updateURLParams();
        
        // Update active tab classes first
        document.querySelectorAll('.day-tab').forEach(tab => {
            tab.classList.toggle('active', tab.dataset.day === dayIndex.toString());
        });
        
                this.renderUnifiedSchedule();
        this.centerActiveDayTab();
    }
    
    centerActiveDayTab() {
        // Force immediate centering without delay for better responsiveness
        requestAnimationFrame(() => {
            const activeTab = document.querySelector('.day-tab.active');
            const navigator = document.querySelector('.day-navigator');
            
            if (activeTab && navigator) {
                console.log('Centering tab:', activeTab.textContent, 'Current scroll:', navigator.scrollLeft);
                
                // Force layout recalculation
                navigator.offsetHeight;
                activeTab.offsetLeft;
                
                // Calculate the position to center the active tab with magnetic precision
                const tabLeft = activeTab.offsetLeft;
                const tabWidth = activeTab.offsetWidth;
                const navWidth = navigator.offsetWidth;
                
                // Perfect center calculation
                const scrollPosition = tabLeft - (navWidth / 2) + (tabWidth / 2);
                
                console.log('Scroll calculation:', {
                    tabLeft,
                    tabWidth,
                    navWidth,
                    scrollPosition,
                    finalPosition: Math.max(0, scrollPosition)
                });
                
                // Add magnetic easing for smooth snap-to-center feel
                navigator.scrollTo({
                    left: Math.max(0, scrollPosition),
                    behavior: 'smooth'
                });
                
                // Add a subtle scale effect for magnetic feedback
                activeTab.style.transform = 'scale(1.05)';
                setTimeout(() => {
                    activeTab.style.transform = '';
                }, 200);
            } else {
                console.warn('centerActiveDayTab: Missing elements', { activeTab: !!activeTab, navigator: !!navigator });
            }
        });
    }
    
    // Analysis toggle for expanded cards
    toggleAnalysis(button) {
        const content = button.nextElementSibling; // .analysis-content
        const isExpanded = button.getAttribute('aria-expanded') === 'true';
        
        // Toggle visibility (removes/adds display: none via .hidden class)
        content.classList.toggle('hidden', isExpanded);
        button.setAttribute('aria-expanded', !isExpanded);
        // Analysis toggle removed - using chevron icon instead

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
        
        if (!expandedDetails) return;
        
        const isCurrentlyExpanded = this.uiState.expandedCards.has(gameId);
        
        if (!isCurrentlyExpanded) {
            this.uiState.expandedCards.add(gameId);
            expandedDetails.classList.remove('hidden');
            card.setAttribute('data-expanded', 'true');
            
            expandedDetails.style.maxHeight = '0';
            requestAnimationFrame(() => {
                expandedDetails.classList.add('fade-in');
                expandedDetails.style.maxHeight = expandedDetails.scrollHeight + 'px';
            });
        } else {
            this.uiState.expandedCards.delete(gameId);
            expandedDetails.style.maxHeight = '0';
            card.setAttribute('data-expanded', 'false');
            
            setTimeout(() => {
                expandedDetails.classList.add('hidden');
                expandedDetails.classList.remove('fade-in');
                expandedDetails.style.maxHeight = '';
            }, 300);  // Match transition duration
        }
    }

    initGameCardInteractions() {
        setTimeout(() => {
            document.querySelectorAll('.game-card--v4[data-expandable="true"]').forEach(card => {
                console.log('Adding listener to expandable card'); // Debug
                
                // Remove any existing listeners to prevent conflicts
                const newCard = card.cloneNode(true);
                card.parentNode.replaceChild(newCard, card);
                
                // Add single click listener to the entire card (since no expand icon)
                newCard.addEventListener('click', (e) => {
                        // Prevent expansion when clicking on interactive elements
                        if (e.target.closest('.ah-chip') || 
                            e.target.closest('.game-hint') ||
                        e.target.closest('.analysis-toggle')) {
                        return;
                    }
                    
                    console.log('Card clicked, toggling expansion'); // Debug
                    this.toggleGameExpansion(newCard);
                });

                // Add keyboard support for accessibility
                newCard.setAttribute('tabindex', '0');
                newCard.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        this.toggleGameExpansion(newCard);
                    }
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
