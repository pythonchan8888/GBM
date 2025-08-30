// ===== UTILITY FUNCTIONS MODULE =====
// Common formatting, date handling, and helper functions

export class Utils {
    // Number formatting
    static formatNumber(num) {
        return new Intl.NumberFormat().format(num);
    }

    static formatCurrency(amount, showSign = false) {
        const sign = showSign && amount >= 0 ? '+' : '';
        if (Math.abs(amount) >= 1000) {
            return `${sign}${(amount / 1000).toFixed(1)}k`;
        }
        return `${sign}${amount.toFixed(2)}`;
    }

    // Date formatting
    static formatDate(date) {
        const d = date instanceof Date ? date : this.parseDateTimeSafe(date);
        if (!d) return '--';
        return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'Asia/Singapore' }).format(d);
    }

    static formatDateTime(value) {
        const date = value instanceof Date ? value : this.parseDateTimeSafe(value);
        if (!date) return '--';
        return new Intl.DateTimeFormat('en-US', {
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            hour12: true,
            timeZone: 'Asia/Singapore'
        }).format(date);
    }

    static formatTimeAgo(dateStr) {
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

    static formatGameTime(datetime) {
        if (!datetime) return '--:--';
        return datetime.toLocaleTimeString('en-GB', { 
            hour: '2-digit', 
            minute: '2-digit',
            hour12: false 
        });
    }

    // Date parsing utilities
    static parseDateTimeSafe(value) {
        if (!value) return null;
        if (value instanceof Date) return isNaN(value) ? null : value;
        try {
            let iso = String(value).replace(' ', 'T');
            let d = new Date(iso);
            if (!isNaN(d)) return d;
            d = new Date(iso + 'Z');
            if (!isNaN(d)) return d;
            const [datePart, timePart] = String(value).split(' ');
            const [y, m, d2] = datePart.split('-').map(Number);
            const [hh = 0, mm = 0, ss = 0] = (timePart || '').split(':').map(Number);
            const local = new Date(y, (m || 1) - 1, d2 || 1, hh, mm, ss);
            return isNaN(local) ? null : local;
        } catch (_) {
            return null;
        }
    }

    static parseGmt8(value) {
        if (!value) return null;
        try {
            const [datePart, timePart = '00:00:00'] = String(value).split(' ');
            const [y, m, d] = datePart.split('-').map(Number);
            const [hh, mm, ss] = timePart.split(':').map(Number);
            const utcMs = Date.UTC(y, (m || 1) - 1, d || 1, (hh || 0) - 8, mm || 0, ss || 0);
            return new Date(utcMs);
        } catch (_) {
            return this.parseDateTimeSafe(value);
        }
    }

    static isSameDay(date1, date2) {
        return date1.toDateString() === date2.toDateString();
    }

    // URL and filter utilities
    static getFiltersFromURL() {
        const params = new URLSearchParams(window.location.search);
        return {
            dateRange: params.get('dateRange') || '30',
            league: params.get('league') || 'all',
            minEV: parseFloat(params.get('minEV')) || 0,
            confidence: params.get('confidence') || 'all'
        };
    }

    static updateURL(filters) {
        const params = new URLSearchParams();
        Object.entries(filters).forEach(([key, value]) => {
            if (value !== 'all' && value !== 0 && value !== '30') {
                params.set(key, value);
            }
        });
        
        const newURL = `${window.location.pathname}${params.toString() ? '?' + params.toString() : ''}`;
        window.history.replaceState({}, '', newURL);
    }

    // CSV export utilities
    static arrayToCSV(array, headers) {
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

    static downloadCSV(content, filename) {
        const blob = new Blob([content], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        window.URL.revokeObjectURL(url);
    }

    // UI utilities
    static showLoading(show) {
        const overlay = document.getElementById('loading-overlay');
        if (overlay) {
            if (show) {
                overlay.classList.remove('hidden');
            } else {
                overlay.classList.add('hidden');
            }
        }
    }

    static showError(message) {
        console.error(message);
        // Silent error logging - could implement toast notifications
    }

    // Analytics tracking
    static trackEvent(eventName, properties = {}) {
        console.log(`Analytics: ${eventName}`, properties);
        // TODO: Integrate with analytics service
    }
}
