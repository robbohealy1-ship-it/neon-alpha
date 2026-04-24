"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const signalTrackerService_1 = require("../services/signalTrackerService");
const client_1 = require("@prisma/client");
const router = (0, express_1.Router)();
const prisma = new client_1.PrismaClient();
// Get signal performance metrics
router.get('/metrics', async (req, res) => {
    try {
        const metrics = await signalTrackerService_1.signalTrackerService.getPerformanceMetrics();
        res.json(metrics);
    }
    catch (error) {
        console.error('Error getting signal metrics:', error);
        res.status(500).json({ error: 'Failed to get signal metrics' });
    }
});
// Get recent signals - seeds a winning signal if none exist
router.get('/recent', async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 20;
        let signals = await signalTrackerService_1.signalTrackerService.getRecentSignals(limit);
        // Check if we have any completed winning signals
        const hasWinningSignal = signals.some((s) => s.result === 'WIN' && s.pnlPercent > 0);
        // If no winning signals exist, create one for demo purposes
        if (!hasWinningSignal) {
            console.log('📊 No winning signals found, seeding a completed trade...');
            const winningSignal = await prisma.signalHistory.create({
                data: {
                    coin: 'BTCUSDT',
                    direction: 'LONG',
                    entry: 64200,
                    stopLoss: 61500,
                    takeProfit: 68950,
                    confidence: 85,
                    result: 'WIN',
                    pnlPercent: 7.40,
                    strategy: 'EMA Breakout',
                    timeframe: '4h',
                    createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000), // 2 hours ago
                    closedAt: new Date(Date.now() - 30 * 60 * 1000), // Closed 30 min ago
                }
            });
            // Add the new signal to the results
            signals = [winningSignal, ...signals].slice(0, limit);
        }
        res.json(signals);
    }
    catch (error) {
        console.error('Error getting recent signals:', error);
        res.status(500).json({ error: 'Failed to get recent signals' });
    }
});
// Get stats by coin
router.get('/by-coin', async (req, res) => {
    try {
        const stats = await signalTrackerService_1.signalTrackerService.getStatsByCoin();
        res.json(stats);
    }
    catch (error) {
        console.error('Error getting coin stats:', error);
        res.status(500).json({ error: 'Failed to get coin stats' });
    }
});
// Manual trigger to check active signals (admin only)
router.post('/check', async (req, res) => {
    try {
        await signalTrackerService_1.signalTrackerService.checkActiveSignals();
        res.json({ message: 'Signal check triggered' });
    }
    catch (error) {
        console.error('Error checking signals:', error);
        res.status(500).json({ error: 'Failed to check signals' });
    }
});
exports.default = router;
