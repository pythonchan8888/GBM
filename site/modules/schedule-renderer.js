// ===== SCHEDULE RENDERER MODULE =====
// Handles all game schedule rendering, grouping, and display logic

export class ScheduleRenderer {
    constructor(uiState, filterManager) {
        this.uiState = uiState;
        this.filterManager = filterManager;
    }

    renderUnifiedSchedule(container, data) {
        if (!container) {
            console.log('Unified games container not found - skipping schedule render');
            return;
        }

        // Add day navigator if not present
        const scheduleSection = container.closest('.unified-schedule-section');
        if (scheduleSection && !scheduleSection.querySelector('.day-navigator')) {
            const dayNavHtml = this.renderDayNavigator();
            scheduleSection.insertAdjacentHTML('afterbegin', dayNavHtml);
        }

        // Show skeleton loading if data is loading
        if (!data.unifiedGames) {
            this.renderSkeletonCards(container);
            return;
        }
        
        // Fallback to recommendations if unified games not available
        if (data.unifiedGames.length === 0) {
            this.renderFallbackRecommendations(container, data.recommendations);
            return;
        }

        const games = this.getFilteredGamesByDay(data.unifiedGames);
        
        if (games.length === 0) {
            container.innerHTML = '<div class="no-games">No games found for the selected day.</div>';
            return;
        }

        // Render grouped games
        const groupedGames = this.groupGamesByLeague(games);
        container.innerHTML = this.renderLeagueGroups(groupedGames);
    }

    renderDayNavigator() {
        const today = new Date();
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);
        const dayAfter = new Date(today);
        dayAfter.setDate(dayAfter.getDate() + 2);
        
        return `
            <div class="day-navigator">
                <button class="day-tab ${this.uiState.currentDay === 'today' ? 'active' : ''}" 
                        data-day="today" onclick="window.parlayKing.switchDay('today')">
                    Today
                </button>
                <button class="day-tab ${this.uiState.currentDay === 'tomorrow' ? 'active' : ''}" 
                        data-day="tomorrow" onclick="window.parlayKing.switchDay('tomorrow')">
                    Tomorrow
                </button>
                <button class="day-tab ${this.uiState.currentDay === 'dayafter' ? 'active' : ''}" 
                        data-day="dayafter" onclick="window.parlayKing.switchDay('dayafter')">
                    ${dayAfter.toLocaleDateString('en-US', { weekday: 'short' })}
                </button>
            </div>
        `;
    }

    getFilteredGamesByDay(unifiedGames) {
        let filtered = [...(unifiedGames || [])];
        
        // Filter by current day first
        filtered = this.filterByDay(filtered, this.uiState.currentDay);
        
        // Apply other filters using FilterManager
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
        
        // Get unique leagues and sort by priority
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
        return `
            <div class="tier-group">
                <div class="tier-group-header">
                    <h4>${tierGroup}</h4>
                    <span class="game-count">${games.length} games</span>
                </div>
                <div class="games-list">
                    ${games.map((game, index) => this.renderGameCard(game, index)).join('')}
                </div>
            </div>
        `;
    }

    renderGameCard(game, index) {
        // Use component-based architecture
        const cardInstance = new GameCard(game, {
            compact: this.uiState.viewMode === 'mobile',
            showHints: true,
            index: index
        });
        
        return cardInstance.render();
    }

    renderSkeletonCards(container) {
        const skeletonCount = 6;
        const skeletonHtml = Array.from({ length: skeletonCount }, (_, index) => `
            <div class="game-card game-card--skeleton" aria-hidden="true">
                <div class="game-row">
                    ${this.renderSkeletonCardContent()}
                </div>
            </div>
        `).join('');
        
        container.innerHTML = `
            <div class="tier-group">
                <div class="tier-group-header skeleton-header">
                    <div class="skeleton-text skeleton-text--title"></div>
                    <div class="skeleton-text skeleton-text--count"></div>
                </div>
                <div class="games-list">
                    ${skeletonHtml}
                </div>
            </div>
        `;
    }

    renderSkeletonCardContent() {
        return `
            <div class="game-meta">
                <div class="skeleton-text skeleton-text--time"></div>
            </div>
            
            <div class="game-matchup">
                <div class="team-row">
                    <div class="skeleton-text skeleton-text--team"></div>
                    <div class="skeleton-chip"></div>
                </div>
                <div class="vs-separator">vs</div>
                <div class="team-row">
                    <div class="skeleton-text skeleton-text--team"></div>
                    <div class="skeleton-chip"></div>
                </div>
            </div>
            
            <div class="game-actions">
                <div class="skeleton-pill"></div>
                <div class="skeleton-chevron"></div>
            </div>
        `;
    }

    renderFallbackRecommendations(container, recommendations) {
        // Show recommendations in a simplified format if unified games not available
        const filteredRecs = (recommendations || []).slice(0, 10);
        
        if (filteredRecs.length === 0) {
            container.innerHTML = '<div class="no-games">No upcoming recommendations available.</div>';
            return;
        }

        container.innerHTML = `
            <div class="time-group">
                <div class="time-group-header">
                    <h4>Our Latest Recommendations</h4>
                    <span class="game-count">${filteredRecs.length} picks</span>
                </div>
                <div class="games-list">
                    ${filteredRecs.map((rec, index) => this.renderRecommendationAsGameCard(rec, index)).join('')}
                </div>
            </div>
        `;
    }

    renderRecommendationAsGameCard(rec, index) {
        return `
            <div class="game-card" data-signal="kings-call" data-expandable="true">
                <div class="game-row">
                    <div class="game-time">${this.formatGameTime(rec.datetime)}</div>
                    <div class="signal-container">
                        <span class="signal-icon kings-call" title="Analysis Available">👑</span>
                    </div>
                    <div class="game-teams">
                        <span class="league-flag">⚽</span>
                        <div class="teams-text">
                            <span class="home">${rec.home}</span>
                            <span class="vs">vs</span>
                            <span class="away">${rec.away}</span>
                        </div>
                    </div>
                    <div class="game-league mobile-hidden">${rec.league}</div>
                    <div class="game-odds mobile-hidden">${rec.odds.toFixed(2)}</div>
                    <div class="expand-btn">▼</div>
                </div>
                
                <div class="expanded-details hidden">
                    <div class="expanded-row recommendation-row">
                        <strong>Our Pick:</strong> ${rec.recommendation}
                        <span class="ev-badge">EV: ${(rec.ev * 100).toFixed(1)}%</span>
                    </div>
                    ${rec.kingsCall ? `
                        <div class="expanded-row kings-call-row">
                            <strong>Analysis:</strong> 
                            <span class="kings-call-text">${rec.kingsCall}</span>
                        </div>
                    ` : ''}
                    <div class="expanded-row stats-row">
                        <span>Confidence: ${rec.confidence}</span>
                        <span>League: ${rec.league}</span>
                    </div>
                </div>
            </div>
        `;
    }

    // Utility methods
    formatGameTime(datetime) {
        if (!datetime) return '--:--';
        return datetime.toLocaleTimeString('en-GB', { 
            hour: '2-digit', 
            minute: '2-digit',
            hour12: false 
        });
    }

    isSameDay(date1, date2) {
        return date1.toDateString() === date2.toDateString();
    }
}
