// ParlayKing Dashboard - Custom Implementation

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
            parlayWins: []
        };
        this.filters = this.getFiltersFromURL();
        
        this.init();
    }

    async init() {
        this.showLoading(true);
        await this.loadAllData();
        this.initializeUI();
        this.updateUI();
        this.showLoading(false);
    }

    // Data Loading with Caching
    async loadCSV(filename, useCache = true) {
        const cacheKey = `csv_${filename}`;
        
        if (useCache && this.cache.has(cacheKey)) {
            return this.cache.get(cacheKey);
        }

        try {
            const response = await fetch(filename, {
                headers: useCache ? { 'If-None-Match': localStorage.getItem(`etag_${filename}`) || '' } : {}
            });

            if (response.status === 304) {
                return this.cache.get(cacheKey);
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

            // Cache the data
            this.cache.set(cacheKey, data);
            
            // Store ETag for future requests
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
            const [metrics, pnlByMonth, bankrollSeries, recommendations, roiHeatmap, topSegments, settledBets] = await Promise.all([
                this.loadCSV('metrics.csv'),
                this.loadCSV('pnl_by_month.csv'),
                this.loadCSV('bankroll_series_90d.csv'),
                this.loadCSV('latest_recommendations.csv'),
                this.loadCSV('roi_heatmap.csv'),
                this.loadCSV('top_segments.csv'),
                this.loadCSV('settled_bets.csv') // For parlay calculation
            ]);

            // Store data
            this.data = {
                metrics: this.parseMetrics(metrics),
                pnlByMonth,
                bankrollSeries: this.parseBankrollSeries(bankrollSeries),
                recommendations: this.parseRecommendations(recommendations),
                roiHeatmap,
                topSegments,
                settledBets: this.parseSettledBets(settledBets)
            };

            // Calculate parlay wins
            this.data.parlayWins = this.calculateParlayWins();

            // Populate filter options
            this.populateFilterOptions();

        } catch (error) {
            console.error('Failed to load data:', error);
            this.showError('Failed to load dashboard data. Please try refreshing the page.');
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

    parseBankrollSeries(rawSeries) {
        if (!Array.isArray(rawSeries)) return [];
        
        return rawSeries
            .filter(row => row && row.dt_gmt8 && row.cum_bankroll !== null && row.cum_bankroll !== undefined)
            .map(row => ({
                date: new Date(row.dt_gmt8),
                bankroll: parseFloat(row.cum_bankroll) || 0
            }))
            .sort((a, b) => a.date - b.date);
    }

    parseRecommendations(rawRecs) {
        if (!Array.isArray(rawRecs)) return [];
        
        return rawRecs
            .filter(row => row && row.dt_gmt8 && row.home && row.away)
            .map(row => ({
                datetime: new Date(row.dt_gmt8),
                league: row.league || '',
                home: row.home,
                away: row.away,
                recommendation: row.rec_text || '',
                line: parseFloat(row.line) || 0,
                odds: parseFloat(row.odds) || 0,
                ev: parseFloat(row.ev) || 0,
                confidence: row.confidence || 'Medium'
            }))
            .sort((a, b) => b.datetime - a.datetime);
    }

    parseSettledBets(rawBets) {
        if (!Array.isArray(rawBets)) return [];
        
        return rawBets
            .filter(row => row && row.dt_gmt8 && row.status === 'settled')
            .map(row => ({
                datetime: new Date(row.dt_gmt8),
                league: row.league || '',
                home: row.home || '',
                away: row.away || '',
                recommendation: row.bet_type_refined_ah || `AH ${row.line_betted_on_refined || ''}`,
                line: parseFloat(row.line_betted_on_refined) || 0,
                odds: parseFloat(row.odds_betted_on_refined) || 0,
                stake: parseFloat(row.stake) || 0,
                pl: parseFloat(row.pl) || 0,
                isWin: parseFloat(row.pl) > 0,
                confidence: 'High'
            }))
            .sort((a, b) => b.datetime - a.datetime);
    }

    // Parlay Wins Calculation
    calculateParlayWins() {
        const settledBets = this.data.settledBets || [];
        const parlays = [];
        
        // Group bets by week to find potential parlays
        const weeklyGroups = this.groupBetsByWeek(settledBets);
        
        weeklyGroups.forEach(weekBets => {
            const winningBets = weekBets.filter(bet => bet.isWin);
            
            // Generate parlays of different lengths
            for (let parlaySize = 3; parlaySize <= Math.min(6, winningBets.length); parlaySize++) {
                const combinations = this.getCombinations(winningBets, parlaySize);
                
                // Take best combinations (highest total odds)
                combinations
                    .sort((a, b) => this.calculateParlayOdds(b) - this.calculateParlayOdds(a))
                    .slice(0, 2) // Top 2 per size per week
                    .forEach(combination => {
                        parlays.push(this.createParlayItem(combination));
                    });
            }
        });

        // Sort by payout and return top parlays
        return parlays
            .sort((a, b) => b.totalPayout - a.totalPayout)
            .slice(0, 6); // Show top 6 parlays
    }

    groupBetsByWeek(bets) {
        const groups = new Map();
        
        bets.forEach(bet => {
            const weekStart = new Date(bet.datetime);
            weekStart.setDate(weekStart.getDate() - weekStart.getDay()); // Start of week
            const weekKey = weekStart.toISOString().split('T')[0];
            
            if (!groups.has(weekKey)) {
                groups.set(weekKey, []);
            }
            groups.get(weekKey).push(bet);
        });
        
        return Array.from(groups.values());
    }

    getCombinations(arr, size) {
        if (size === 1) return arr.map(item => [item]);
        if (size > arr.length) return [];
        
        const combinations = [];
        for (let i = 0; i < arr.length - size + 1; i++) {
            const smallerCombinations = this.getCombinations(arr.slice(i + 1), size - 1);
            smallerCombinations.forEach(combo => {
                combinations.push([arr[i], ...combo]);
            });
        }
        return combinations;
    }

    calculateParlayOdds(bets) {
        return bets.reduce((total, bet) => total * bet.odds, 1);
    }

    createParlayItem(bets) {
        const totalOdds = this.calculateParlayOdds(bets);
        const stake = 100; // Standard $100 stake for examples
        const totalPayout = stake * totalOdds;
        const profit = totalPayout - stake;
        
        return {
            legs: bets,
            legCount: bets.length,
            totalOdds: totalOdds,
            stake: stake,
            totalPayout: totalPayout,
            profit: profit,
            returnPercent: (profit / stake) * 100,
            dateRange: this.getParlayDateRange(bets)
        };
    }

    getParlayDateRange(bets) {
        const dates = bets.map(bet => bet.datetime).sort();
        const start = dates[0];
        const end = dates[dates.length - 1];
        
        if (this.isSameDay(start, end)) {
            return this.formatDate(start);
        } else {
            return `${this.formatDate(start)} - ${this.formatDate(end)}`;
        }
    }

    isSameDay(date1, date2) {
        return date1.toDateString() === date2.toDateString();
    }

    // Custom Chart Implementation
    createCustomChart(containerId, data, options = {}) {
        const container = document.getElementById(containerId);
        if (!container) return;
        
        container.innerHTML = '';
        
        // Handle empty or invalid data
        if (!data || !Array.isArray(data) || data.length === 0) {
            container.innerHTML = '<div class="chart-error">No data available</div>';
            return;
        }
        
        // Validate data structure
        const validData = data.filter(d => d && typeof d.value === 'number' && !isNaN(d.value));
        if (validData.length === 0) {
            container.innerHTML = '<div class="chart-error">No valid data points</div>';
            return;
        }
        
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('class', 'chart-svg');
        svg.setAttribute('viewBox', '0 0 800 400');
        svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
        
        // Add gradient definition
        const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
        const gradient = document.createElementNS('http://www.w3.org/2000/svg', 'linearGradient');
        gradient.setAttribute('id', 'chartGradient');
        gradient.setAttribute('x1', '0%');
        gradient.setAttribute('y1', '0%');
        gradient.setAttribute('x2', '0%');
        gradient.setAttribute('y2', '100%');
        
        const stop1 = document.createElementNS('http://www.w3.org/2000/svg', 'stop');
        stop1.setAttribute('offset', '0%');
        stop1.setAttribute('stop-color', '#FF8C42');
        stop1.setAttribute('stop-opacity', '0.3');
        
        const stop2 = document.createElementNS('http://www.w3.org/2000/svg', 'stop');
        stop2.setAttribute('offset', '100%');
        stop2.setAttribute('stop-color', '#FF8C42');
        stop2.setAttribute('stop-opacity', '0.05');
        
        gradient.appendChild(stop1);
        gradient.appendChild(stop2);
        defs.appendChild(gradient);
        svg.appendChild(defs);
        
        // Chart dimensions
        const margin = { top: 20, right: 30, bottom: 40, left: 60 };
        const width = 800 - margin.left - margin.right;
        const height = 400 - margin.top - margin.bottom;
        
        // Scales - use validData instead of data
        const xScale = (index) => margin.left + (index / Math.max(validData.length - 1, 1)) * width;
        const yMin = Math.min(...validData.map(d => d.value));
        const yMax = Math.max(...validData.map(d => d.value));
        const yPadding = (yMax - yMin) * 0.1;
        const yScale = (value) => margin.top + height - ((value - (yMin - yPadding)) / ((yMax + yPadding) - (yMin - yPadding))) * height;
        
        // Grid lines
        const gridGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        for (let i = 0; i <= 5; i++) {
            const y = margin.top + (i / 5) * height;
            const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
            line.setAttribute('x1', margin.left);
            line.setAttribute('y1', y);
            line.setAttribute('x2', margin.left + width);
            line.setAttribute('y2', y);
            line.setAttribute('class', 'chart-grid-line');
            gridGroup.appendChild(line);
        }
        svg.appendChild(gridGroup);
        
        // Area path
        let areaPath = `M ${margin.left} ${margin.top + height}`;
        validData.forEach((d, i) => {
            areaPath += ` L ${xScale(i)} ${yScale(d.value)}`;
        });
        areaPath += ` L ${margin.left + width} ${margin.top + height} Z`;
        
        const area = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        area.setAttribute('d', areaPath);
        area.setAttribute('class', 'chart-area');
        svg.appendChild(area);
        
        // Line path
        let linePath = `M ${xScale(0)} ${yScale(validData[0].value)}`;
        validData.slice(1).forEach((d, i) => {
            linePath += ` L ${xScale(i + 1)} ${yScale(d.value)}`;
        });
        
        const line = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        line.setAttribute('d', linePath);
        line.setAttribute('class', 'chart-line');
        svg.appendChild(line);
        
        // Data points
        const pointsGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        validData.forEach((d, i) => {
            const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
            circle.setAttribute('cx', xScale(i));
            circle.setAttribute('cy', yScale(d.value));
            circle.setAttribute('r', '4');
            circle.setAttribute('class', 'chart-point');
            circle.setAttribute('data-index', i);
            
            // Add hover events
            circle.addEventListener('mouseenter', (e) => this.showChartTooltip(e, d, container));
            circle.addEventListener('mouseleave', () => this.hideChartTooltip(container));
            
            pointsGroup.appendChild(circle);
        });
        svg.appendChild(pointsGroup);
        
        // Axes labels
        const axisGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        
        // Y-axis labels
        for (let i = 0; i <= 5; i++) {
            const value = yMin + (yMax - yMin) * (i / 5);
            const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            text.setAttribute('x', margin.left - 10);
            text.setAttribute('y', margin.top + height - (i / 5) * height + 4);
            text.setAttribute('text-anchor', 'end');
            text.setAttribute('class', 'chart-axis-text');
            text.textContent = options.formatY ? options.formatY(value) : value.toFixed(1);
            axisGroup.appendChild(text);
        }
        
        svg.appendChild(axisGroup);
        container.appendChild(svg);
        
        // Add tooltip
        const tooltip = document.createElement('div');
        tooltip.className = 'chart-tooltip';
        container.appendChild(tooltip);
        
        return svg;
    }

    showChartTooltip(event, data, container) {
        const tooltip = container.querySelector('.chart-tooltip');
        tooltip.innerHTML = `
            <strong>${this.formatDate(data.date)}</strong><br>
            Value: ${data.value.toFixed(2)}
        `;
        tooltip.style.left = (event.pageX + 10) + 'px';
        tooltip.style.top = (event.pageY - 10) + 'px';
        tooltip.classList.add('visible');
    }

    hideChartTooltip(container) {
        const tooltip = container.querySelector('.chart-tooltip');
        tooltip.classList.remove('visible');
    }

    // Filter Management
    getFiltersFromURL() {
        const params = new URLSearchParams(window.location.search);
        return {
            dateRange: params.get('dateRange') || '30',
            league: params.get('league') || 'all',
            minEV: parseFloat(params.get('minEV')) || 0,
            confidence: params.get('confidence') || 'all'
        };
    }

    updateURL() {
        const params = new URLSearchParams();
        Object.entries(this.filters).forEach(([key, value]) => {
            if (value !== 'all' && value !== 0 && value !== '30') {
                params.set(key, value);
            }
        });
        
        const newURL = `${window.location.pathname}${params.toString() ? '?' + params.toString() : ''}`;
        window.history.replaceState({}, '', newURL);
    }

    populateFilterOptions() {
        // Populate league filter
        const leagues = [...new Set(this.data.recommendations.map(r => r.league))].filter(Boolean).sort();
        const leagueSelect = document.getElementById('league-filter');
        
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

    // UI Initialization
    initializeUI() {
        this.setupEventListeners();
        this.setFilterValues();
    }

    setupEventListeners() {
        // Filter controls
        document.getElementById('date-range').addEventListener('change', (e) => {
            this.filters.dateRange = e.target.value;
            this.updateURL();
            this.updateUI();
        });

        document.getElementById('league-filter').addEventListener('change', (e) => {
            this.filters.league = e.target.value;
            this.updateURL();
            this.updateUI();
        });

        document.getElementById('min-ev').addEventListener('input', (e) => {
            this.filters.minEV = parseFloat(e.target.value) || 0;
            this.updateURL();
            this.updateUI();
        });

        document.getElementById('confidence-filter').addEventListener('change', (e) => {
            this.filters.confidence = e.target.value;
            this.updateURL();
            this.updateUI();
        });

        document.getElementById('reset-filters').addEventListener('click', () => {
            this.resetFilters();
        });

        // Chart controls
        document.querySelectorAll('.toggle-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                document.querySelectorAll('.toggle-btn').forEach(b => b.classList.remove('active'));
                e.target.classList.add('active');
                this.updateChart();
            });
        });

        document.querySelectorAll('.range-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                document.querySelectorAll('.range-btn').forEach(b => b.classList.remove('active'));
                e.target.classList.add('active');
                this.updateChart();
            });
        });

        // Export functionality
        document.getElementById('export-recommendations').addEventListener('click', () => {
            this.exportFilteredRecommendations();
        });
    }

    setFilterValues() {
        document.getElementById('date-range').value = this.filters.dateRange;
        document.getElementById('league-filter').value = this.filters.league;
        document.getElementById('min-ev').value = this.filters.minEV;
        document.getElementById('confidence-filter').value = this.filters.confidence;
    }

    resetFilters() {
        this.filters = {
            dateRange: '30',
            league: 'all',
            minEV: 0,
            confidence: 'all'
        };
        this.setFilterValues();
        this.updateURL();
        this.updateUI();
    }

    // UI Updates
    updateUI() {
        this.updateKPIs();
        this.updateParlayWins();
        this.updateChart();
        this.updateRecommendationsTable();
        this.updateLastRunStatus();
    }

    updateKPIs() {
        if (!this.data || !this.data.metrics) {
            console.warn('Data not loaded yet, showing default values');
            return;
        }
        
        const metrics = this.data.metrics;
        
        // Hero Metrics - Win Rate (Main attraction)
        const winRate = parseFloat(metrics.win_rate_30d_pct || 0);
        const winRateEl = document.getElementById('win-rate');
        if (winRateEl) winRateEl.textContent = `${winRate.toFixed(1)}%`;
        
        // Hero Metrics - ROI Performance  
        const roi = parseFloat(metrics.roi_30d_pct || 0);
        const roiEl = document.getElementById('roi-performance');
        if (roiEl) roiEl.textContent = `+${roi.toFixed(1)}%`;
        
        // Non-Losing Rate (wins + pushes)
        const nonLosingRate = parseFloat(metrics.non_losing_rate_30d_pct || 0);
        const nonLosingEl = document.getElementById('non-losing-rate');
        if (nonLosingEl) nonLosingEl.textContent = `${nonLosingRate.toFixed(1)}%`;

        // Total Bets
        const totalBetsEl = document.getElementById('total-bets');
        if (totalBetsEl) totalBetsEl.textContent = this.formatNumber(metrics.bets_30d || 0);
        
        // Update trend indicators with more compelling language
        this.updateMarketingTrend('win-rate-trend', winRate, 'win');
        this.updateMarketingTrend('roi-trend', roi, 'roi');
        this.updateMarketingTrend('non-losing-trend', nonLosingRate, 'nonlosing');
        this.updateTrendIndicator('bets-trend', metrics.bets_30d || 0);
    }

    updateMarketingTrend(elementId, value, type) {
        const element = document.getElementById(elementId);
        if (!element) return;

        // Marketing-focused trend indicators
        if (type === 'win' && value >= 60) {
            element.textContent = '🔥 Elite';
            element.className = 'kpi-trend positive';
        } else if (type === 'win' && value >= 55) {
            element.textContent = '📈 Strong';
            element.className = 'kpi-trend positive';
        } else if (type === 'roi' && value >= 15) {
            element.textContent = '💎 Premium';
            element.className = 'kpi-trend positive';
        } else if (type === 'roi' && value >= 10) {
            element.textContent = '📊 Solid';
            element.className = 'kpi-trend positive';
        } else if (type === 'nonlosing' && value >= 65) {
            element.textContent = '🛡️ Safe';
            element.className = 'kpi-trend positive';
        } else if (value > 0) {
            element.textContent = '✅ Positive';
            element.className = 'kpi-trend positive';
        } else {
            element.textContent = '📊 Tracking';
            element.className = 'kpi-trend';
        }
    }

    updateTrendIndicator(elementId, value) {
        const element = document.getElementById(elementId);
        if (!element) return;

        if (value > 0) {
            element.textContent = `▲ ${Math.abs(value).toFixed(1)}%`;
            element.className = 'kpi-trend positive';
        } else if (value < 0) {
            element.textContent = `▼ ${Math.abs(value).toFixed(1)}%`;
            element.className = 'kpi-trend negative';
        } else {
            element.textContent = '━ 0.0%';
            element.className = 'kpi-trend';
        }
    }

    updateLastRunStatus() {
        const lastUpdate = this.data.metrics.finished_at;
        if (lastUpdate) {
            document.getElementById('last-update').textContent = `Last run: ${this.formatTimeAgo(lastUpdate)}`;
        }
    }

    // Parlay Wins UI Update
    updateParlayWins() {
        const parlays = this.data.parlayWins || [];
        
        // Update stats
        document.getElementById('total-parlays').textContent = parlays.length;
        const maxPayout = parlays.length > 0 ? Math.max(...parlays.map(p => p.returnPercent)) : 0;
        document.getElementById('max-payout').textContent = `${maxPayout.toFixed(0)}%`;
        
        // Update parlay grid
        const grid = document.getElementById('parlay-grid');
        grid.innerHTML = '';
        
        if (parlays.length === 0) {
            grid.innerHTML = '<div style="grid-column: 1/-1; text-align: center; color: var(--muted); padding: var(--space-2xl);">No winning parlays found in recent data</div>';
            return;
        }
        
        parlays.forEach(parlay => {
            const parlayItem = document.createElement('div');
            parlayItem.className = 'parlay-item';
            
            parlayItem.innerHTML = `
                <div class="parlay-header">
                    <span class="parlay-type">${parlay.legCount}-Leg Parlay</span>
                    <span class="parlay-date">${parlay.dateRange}</span>
                </div>
                <div class="parlay-legs">
                    ${parlay.legs.map(leg => `
                        <div class="parlay-leg">
                            <div class="leg-result">✓</div>
                            <div class="leg-details">
                                <div class="leg-match">${leg.home} vs ${leg.away}</div>
                                <div class="leg-bet">${leg.recommendation}</div>
                            </div>
                            <div class="leg-odds">@${leg.odds.toFixed(2)}</div>
                        </div>
                    `).join('')}
                </div>
                <div class="parlay-payout">
                    <div class="payout-calculation">$${parlay.stake} → $${parlay.totalPayout.toFixed(0)}</div>
                    <div class="payout-return">+${parlay.returnPercent.toFixed(0)}%</div>
                </div>
            `;
            
            grid.appendChild(parlayItem);
        });
    }

    // Chart Management
    updateChart() {
        const activeMode = document.querySelector('.toggle-btn.active').dataset.mode;
        const activeRange = document.querySelector('.range-btn.active').dataset.range;
        
        let filteredData = [...this.data.bankrollSeries];
        
        // Apply range filter
        if (activeRange !== 'all') {
            const days = parseInt(activeRange);
            const cutoffDate = new Date();
            cutoffDate.setDate(cutoffDate.getDate() - days);
            filteredData = filteredData.filter(d => d.date >= cutoffDate);
        }

        // Prepare chart data
        let chartData;

        if (activeMode === 'roi') {
            // Calculate ROI based on initial bankroll
            const initialBankroll = filteredData[0]?.bankroll || 0;
            chartData = filteredData.map(d => ({
                date: d.date,
                value: ((d.bankroll - initialBankroll) / Math.max(initialBankroll, 1)) * 100
            }));
        } else {
            chartData = filteredData.map(d => ({
                date: d.date,
                value: d.bankroll
            }));
        }

        // Create custom chart
        this.createCustomChart('bankroll-chart', chartData, {
            formatY: activeMode === 'roi' ? (v) => v.toFixed(1) + '%' : (v) => v.toFixed(1)
        });
    }

    // Recommendations Table
    updateRecommendationsTable() {
        const tbody = document.getElementById('recommendations-tbody');
        const filteredRecs = this.getFilteredRecommendations().slice(0, 10); // Show only top 10 on overview

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
                <td>${rec.odds.toFixed(2)}</td>
                <td class="${rec.ev >= 0 ? 'positive' : 'negative'}">${rec.ev >= 0 ? '+' : ''}${rec.ev.toFixed(3)}</td>
                <td><span class="confidence-chip confidence-${rec.confidence.toLowerCase()}">${rec.confidence}</span></td>
                <td>${this.formatDateTime(rec.datetime)}</td>
            `;
            tbody.appendChild(row);
        });
    }

    getFilteredRecommendations() {
        let filtered = [...this.data.recommendations];

        // Apply filters
        if (this.filters.league !== 'all') {
            filtered = filtered.filter(r => r.league === this.filters.league);
        }

        if (this.filters.confidence !== 'all') {
            filtered = filtered.filter(r => r.confidence === this.filters.confidence);
        }

        if (this.filters.minEV > 0) {
            filtered = filtered.filter(r => r.ev >= this.filters.minEV);
        }

        // Apply date range
        if (this.filters.dateRange !== 'all') {
            const days = parseInt(this.filters.dateRange);
            const cutoffDate = new Date();
            cutoffDate.setDate(cutoffDate.getDate() - days);
            filtered = filtered.filter(r => r.datetime >= cutoffDate);
        }

        return filtered;
    }

    // Export Functionality
    exportFilteredRecommendations() {
        const filtered = this.getFilteredRecommendations();
        const csvContent = this.arrayToCSV(filtered, [
            'datetime', 'league', 'home', 'away', 'recommendation', 'line', 'odds', 'ev', 'confidence'
        ]);
        
        this.downloadCSV(csvContent, 'parlayking_recommendations.csv');
    }

    arrayToCSV(array, headers) {
        const csvRows = [];
        csvRows.push(headers.join(','));
        
        array.forEach(row => {
            const values = headers.map(header => {
                const value = row[header];
                return typeof value === 'string' ? `"${value}"` : value;
            });
            csvRows.push(values.join(','));
        });
        
        return csvRows.join('\n');
    }

    downloadCSV(content, filename) {
        const blob = new Blob([content], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        window.URL.revokeObjectURL(url);
    }

    // Utility Functions
    formatNumber(num) {
        return new Intl.NumberFormat().format(num);
    }

    formatCurrency(amount) {
        const sign = amount >= 0 ? '+' : '';
        return `${sign}${amount.toFixed(2)}`;
    }

    formatDate(date) {
        return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }

    formatDateTime(dateStr) {
        if (!dateStr) return '--';
        const date = new Date(dateStr);
        return date.toLocaleDateString('en-US', { 
            month: 'short', 
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    }

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
        if (show) {
            overlay.classList.remove('hidden');
        } else {
            overlay.classList.add('hidden');
        }
    }

    showError(message) {
        console.error(message);
        // You could implement a toast notification here
        alert(message);
    }

    // Analytics Page Methods
    initAnalyticsPage() {
        this.showLoading(true);
        this.loadAllData().then(() => {
            this.renderROIHeatmap();
            this.renderPnLChart();
            this.renderTopSegments();
            this.showLoading(false);
        }).catch(error => {
            console.error('Failed to load analytics data:', error);
            this.showError('Failed to load analytics data');
            this.showLoading(false);
        });
    }

    renderROIHeatmap() {
        const container = document.getElementById('roi-heatmap');
        if (!container || !this.data.roiHeatmap) return;
        
        container.innerHTML = '<div class="chart-placeholder">ROI Heatmap visualization coming soon</div>';
    }

    renderPnLChart() {
        const container = document.getElementById('pnl-chart');
        if (!container || !this.data.pnlByMonth) return;
        
        container.innerHTML = '<div class="chart-placeholder">P&L Chart visualization coming soon</div>';
    }

    renderTopSegments() {
        const tbody = document.getElementById('segments-tbody');
        if (!tbody || !this.data.topSegments) return;
        
        tbody.innerHTML = '';
        this.data.topSegments.slice(0, 10).forEach(segment => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>Tier ${segment.tier}</td>
                <td>${segment.line}</td>
                <td class="positive">${segment.roi_pct}%</td>
                <td>${segment.n}</td>
                <td>
                    <span class="performance-badge ${segment.roi_pct > 10 ? 'excellent' : segment.roi_pct > 5 ? 'good' : 'moderate'}">
                        ${segment.roi_pct > 10 ? 'Excellent' : segment.roi_pct > 5 ? 'Good' : 'Moderate'}
                    </span>
                </td>
            `;
            tbody.appendChild(row);
        });
    }

    // Recommendations Page Methods
    initRecommendationsPage() {
        this.showLoading(true);
        this.loadAllData().then(() => {
            this.renderRecommendationsTable();
            this.initRecommendationsFilters();
            this.showLoading(false);
        }).catch(error => {
            console.error('Failed to load recommendations data:', error);
            this.showError('Failed to load recommendations data');
            this.showLoading(false);
        });
    }

    renderRecommendationsTable() {
        const tbody = document.getElementById('recommendations-tbody-full');
        if (!tbody || !this.data.recommendations) return;
        
        tbody.innerHTML = '';
        this.data.recommendations.forEach(rec => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${new Date(rec.dt_gmt8).toLocaleString()}</td>
                <td><strong>${rec.home}</strong> vs <strong>${rec.away}</strong></td>
                <td>${rec.league}</td>
                <td>${rec.rec_text}</td>
                <td>${rec.odds}</td>
                <td class="${rec.ev > 0 ? 'positive' : 'negative'}">${rec.ev}%</td>
                <td>
                    <span class="confidence-badge ${rec.confidence.toLowerCase()}">${rec.confidence}</span>
                </td>
                <td>
                    <button class="action-btn-sm">Copy</button>
                </td>
            `;
            tbody.appendChild(row);
        });
    }

    initRecommendationsFilters() {
        // Add filter event listeners here
        console.log('Recommendations filters initialized');
    }
}

// Suppress external script errors (browser extensions)
window.addEventListener('error', (event) => {
    // Only suppress errors from external scripts/extensions
    if (event.filename && (
        event.filename.includes('extension') || 
        event.filename.includes('evmAsk') ||
        event.filename.includes('chrome-extension') ||
        !event.filename.includes(window.location.host)
    )) {
        event.preventDefault();
        return true; // Suppress the error
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
        }
    }, 500); // Wait for initial data to load
});

// Handle page visibility changes to refresh data
document.addEventListener('visibilitychange', () => {
    if (!document.hidden && window.parlayKing) {
        // Refresh data when user returns to tab
        setTimeout(() => {
            window.parlayKing.loadAllData();
        }, 1000);
    }
});