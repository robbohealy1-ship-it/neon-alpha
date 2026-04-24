"use strict";
/**
 * Simple in-memory store for alert history
 * In production, use Redis or PostgreSQL
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.alertHistory = void 0;
class AlertHistoryStore {
    constructor() {
        this.alerts = [];
        this.lastAlertTime = new Map();
    }
    /**
     * Add a new alert record
     */
    addAlert(alert) {
        this.alerts.unshift(alert); // Add to beginning
        // Keep only last 100 alerts
        if (this.alerts.length > 100) {
            this.alerts = this.alerts.slice(0, 100);
        }
        // Update last alert time for coin
        this.lastAlertTime.set(alert.coin, alert.sentAt);
    }
    /**
     * Get recent alerts
     */
    getRecentAlerts(limit = 50) {
        return this.alerts.slice(0, limit);
    }
    /**
     * Check if we can send alert for coin (rate limiting)
     * Returns true if enough time has passed (10 minutes)
     */
    canSendAlert(coin) {
        const lastTime = this.lastAlertTime.get(coin);
        if (!lastTime)
            return true;
        const now = new Date();
        const diffMinutes = (now.getTime() - lastTime.getTime()) / (1000 * 60);
        return diffMinutes >= 10;
    }
    /**
     * Get time until next alert can be sent
     */
    getTimeUntilNextAlert(coin) {
        const lastTime = this.lastAlertTime.get(coin);
        if (!lastTime)
            return 0;
        const now = new Date();
        const diffMinutes = (now.getTime() - lastTime.getTime()) / (1000 * 60);
        const remaining = Math.max(0, 10 - diffMinutes);
        return Math.ceil(remaining);
    }
    /**
     * Clear old alerts (keep last 24 hours)
     */
    cleanup() {
        const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
        this.alerts = this.alerts.filter(a => a.sentAt > cutoff);
    }
}
exports.alertHistory = new AlertHistoryStore();
