"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.startSignalScanner = startSignalScanner;
const express_1 = require("express");
const client_1 = require("@prisma/client");
const signalEngine_1 = require("../services/signalEngine");
const auth_1 = require("../middleware/auth");
const permissions_1 = require("../middleware/permissions");
const router = (0, express_1.Router)();
const prisma = new client_1.PrismaClient();
// Public preview endpoint - limited signals for marketing (only from trade setups)
router.get('/public/preview', async (req, res) => {
    try {
        const previewSignals = await prisma.signal.findMany({
            where: {
                status: { in: ['FORMING', 'TRIGGERED'] },
                parentSetupId: { not: null } // Only signals from trade setups
            },
            orderBy: {
                createdAt: 'desc'
            },
            take: 3
        });
        const mapped = previewSignals.map(s => ({
            id: s.id,
            coin: s.coin,
            direction: s.direction,
            entry: (s.entryMin + s.entryMax) / 2,
            confidence: s.confidence,
            timeframe: s.timeframe,
            strategy: s.setupType,
            createdAt: s.createdAt,
            stopLoss: 'Upgrade to view',
            takeProfit: 'Upgrade to view',
            isPreview: true
        }));
        res.json({
            signals: mapped,
            count: mapped.length,
            message: 'Upgrade to see all signals with full details'
        });
    }
    catch (error) {
        console.error('Error fetching signal preview:', error);
        res.json({ signals: [], count: 0, message: 'Upgrade to see all signals with full details' });
    }
});
// Get all signals (PRO/LIFETIME: unlimited, BASIC: 1 signal max)
router.get('/', auth_1.authenticateToken, (0, permissions_1.requireTier)('basic'), async (req, res) => {
    try {
        const { timeframe, strategy, confidence, status } = req.query;
        const where = {
            status: status ? status : { in: ['FORMING', 'TRIGGERED', 'ACTIVE'] },
            parentSetupId: { not: null } // Only signals generated from trade setups
        };
        if (timeframe)
            where.timeframe = timeframe;
        if (strategy)
            where.setupType = strategy;
        if (confidence)
            where.confidence = { gte: parseInt(confidence) };
        const signals = await prisma.signal.findMany({
            where,
            orderBy: {
                createdAt: 'desc'
            },
            take: 50
        });
        // Apply tier-based filtering
        const user = req.user;
        const tier = user?.subscriptionTier || 'basic';
        let filteredSignals = signals;
        if (tier === 'basic') {
            // BASIC: Show only 1 active signal (highest confidence)
            filteredSignals = signals
                .sort((a, b) => b.confidence - a.confidence)
                .slice(0, 1);
        }
        // PRO and LIFETIME: unlimited signals
        const mapped = filteredSignals.map(s => ({
            id: s.id,
            coin: s.coin,
            direction: s.direction,
            entry: (s.entryMin + s.entryMax) / 2,
            stopLoss: s.stopLoss,
            takeProfit: s.target1,
            takeProfit1: s.target1,
            takeProfit2: s.target2,
            takeProfit3: s.target3,
            confidence: s.confidence,
            timeframe: s.timeframe,
            strategy: s.setupType,
            strategyType: s.strategyType,
            status: s.status.toLowerCase(),
            createdAt: s.createdAt,
            expiresAt: s.expiresAt,
            ema50: s.ema50,
            ema200: s.ema200,
            rsi: s.rsi,
            volume: s.volume,
            parentSetupId: s.parentSetupId // Include parent setup reference
        }));
        res.json({
            signals: mapped,
            tier,
            limitReached: tier === 'basic' && signals.length > filteredSignals.length,
            totalAvailable: signals.length,
            totalShown: filteredSignals.length
        });
    }
    catch (error) {
        console.error('Error fetching signals:', error);
        res.json({ signals: [], tier: 'basic', limitReached: false, totalAvailable: 0, totalShown: 0 });
    }
});
// Get signal performance
router.get('/performance', async (req, res) => {
    try {
        const totalSignals = await prisma.signal.count();
        const success = await prisma.signal.count({ where: { status: 'SUCCESS' } });
        const failed = await prisma.signal.count({ where: { status: 'FAILED' } });
        const triggered = await prisma.signal.count({ where: { status: 'TRIGGERED' } });
        const completed = success + failed;
        const winRate = completed > 0 ? (success / completed) * 100 : 0;
        res.json({
            totalSignals,
            winningSignals: success,
            losingSignals: failed,
            winRate: Math.round(winRate * 100) / 100,
            avgRiskReward: 0,
            lastUpdated: new Date()
        });
    }
    catch (error) {
        console.error('Error fetching performance:', error);
        res.json({
            totalSignals: 0,
            winningSignals: 0,
            losingSignals: 0,
            winRate: 0,
            avgRiskReward: 0,
            lastUpdated: new Date()
        });
    }
});
// Get enhanced signal with full market context (PRO/LIFETIME)
router.get('/:id/enhanced', auth_1.authenticateToken, (0, permissions_1.requireTier)('pro'), async (req, res) => {
    try {
        const { id } = req.params;
        const enhancedSignal = await signalEngine_1.signalEngine.getEnhancedSignal(id);
        if (!enhancedSignal) {
            return res.status(404).json({ error: 'Signal not found' });
        }
        res.json(enhancedSignal);
    }
    catch (error) {
        console.error('Error fetching enhanced signal:', error);
        res.status(500).json({ error: 'Failed to fetch enhanced signal' });
    }
});
// Get signals with structure context (PRO/LIFETIME)
router.get('/enhanced', auth_1.authenticateToken, (0, permissions_1.requireTier)('pro'), async (req, res) => {
    try {
        const { timeframe, strategy, status } = req.query;
        const where = {
            status: status ? status : { in: ['FORMING', 'TRIGGERED', 'ACTIVE'] }
        };
        if (timeframe)
            where.timeframe = timeframe;
        if (strategy)
            where.strategy = strategy;
        const signals = await prisma.signal.findMany({
            where,
            orderBy: { createdAt: 'desc' },
            take: 20
        });
        // Enhance each signal with market context
        const enhanced = await Promise.all(signals.map(async (s) => {
            const enhanced = await signalEngine_1.signalEngine.getEnhancedSignal(s.id);
            return enhanced || {
                id: s.id,
                coin: s.coin,
                symbol: s.symbol,
                direction: s.direction,
                timeframe: s.timeframe,
                strategy: s.strategy,
                entry: (s.entryMin + s.entryMax) / 2,
                entryMin: s.entryMin,
                entryMax: s.entryMax,
                stopLoss: s.stopLoss,
                takeProfit1: s.target1,
                takeProfit2: s.target2,
                riskReward: (s.target1 - (s.entryMin + s.entryMax) / 2) / Math.abs(s.stopLoss - (s.entryMin + s.entryMax) / 2),
                confidence: s.confidence,
                status: s.status,
                createdAt: s.createdAt,
                expiresAt: s.expiresAt
            };
        }));
        res.json(enhanced);
    }
    catch (error) {
        console.error('Error fetching enhanced signals:', error);
        res.status(500).json({ error: 'Failed to fetch enhanced signals' });
    }
});
// Manual scan trigger
router.post('/scan', async (req, res) => {
    try {
        await signalEngine_1.signalEngine.runSignalScan();
        res.json({ message: 'Signal scan completed' });
    }
    catch (error) {
        console.error('Error running scan:', error);
        res.status(500).json({ error: 'Failed to run scan' });
    }
});
// Start signal scanner - runs every 5 minutes
function startSignalScanner() {
    console.log('🚀 Starting signal scanner...');
    signalEngine_1.signalEngine.runSignalScan().catch(console.error);
    setInterval(() => {
        signalEngine_1.signalEngine.updateSignalStatuses().catch(console.error);
    }, 60 * 1000);
    setInterval(() => {
        console.log('📊 Running signal scan...');
        signalEngine_1.signalEngine.runSignalScan().catch((error) => {
            console.error('Signal scan error:', error);
        });
    }, 5 * 60 * 1000);
}
exports.default = router;
