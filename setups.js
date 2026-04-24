"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const client_1 = require("@prisma/client");
const auth_1 = require("../middleware/auth");
const tradeSetupEngine_1 = require("../services/tradeSetupEngine");
const axios_1 = __importDefault(require("axios"));
const router = (0, express_1.Router)();
const prisma = new client_1.PrismaClient();
// In-memory cache for setups (in production, use Redis)
let setupsCache = [];
let lastCacheUpdate = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes
// CoinGecko ID mapping
const COINGECKO_IDS = {
    'BTC': 'bitcoin', 'ETH': 'ethereum', 'SOL': 'solana',
    'AVAX': 'avalanche-2', 'MATIC': 'polygon', 'LINK': 'chainlink',
    'ADA': 'cardano', 'DOT': 'polkadot', 'DOGE': 'dogecoin',
    'XRP': 'ripple', 'BNB': 'binancecoin', 'UNI': 'uniswap',
    'LTC': 'litecoin', 'BCH': 'bitcoin-cash', 'ETC': 'ethereum-classic',
    'FIL': 'filecoin', 'TRX': 'tron', 'NEAR': 'near',
    'APT': 'aptos', 'OP': 'optimism', 'ARB': 'arbitrum',
    'SUI': 'sui', 'TON': 'the-open-network', 'ICP': 'internet-computer',
    'PEPE': 'pepe', 'SHIB': 'shiba-inu', 'FET': 'fetch-ai',
    'RNDR': 'render-token', 'INJ': 'injective-protocol', 'TIA': 'celestia'
};
async function fetchCurrentPrices() {
    try {
        const response = await axios_1.default.get('https://api.coingecko.com/api/v3/coins/markets', {
            params: {
                vs_currency: 'usd',
                ids: Object.values(COINGECKO_IDS).join(','),
                order: 'market_cap_desc'
            },
            timeout: 10000
        });
        const prices = {};
        response.data.forEach((coin) => {
            const symbol = Object.keys(COINGECKO_IDS).find(key => COINGECKO_IDS[key] === coin.id) || coin.symbol.toUpperCase();
            prices[symbol] = coin.current_price;
        });
        return prices;
    }
    catch (error) {
        console.error('Failed to fetch prices:', error);
        return {};
    }
}
function transformSetupForFrontend(setup) {
    return {
        id: setup.id,
        coin: setup.symbol + 'USDT',
        symbol: setup.symbol,
        bias: setup.bias === 'bullish' ? 'Bullish' : 'Bearish',
        entryZone: { low: setup.entryZone.low, high: setup.entryZone.high },
        entryPrice: setup.entryPrice,
        invalidation: setup.stopLoss,
        stopLoss: setup.stopLoss,
        targets: setup.targets,
        confidence: setup.confidenceScore,
        status: setup.status.toUpperCase().replace('_', ' '),
        strategy: setup.strategy.join(' + '),
        strategies: setup.strategy,
        timeframe: setup.timeframe,
        riskRewardRatio: setup.riskRewardRatio,
        riskPercent: setup.riskPercent,
        riskLevel: setup.riskLevel,
        confluence: setup.confluence,
        analysis: setup.analysis,
        createdAt: setup.createdAt.toISOString(),
        expiresAt: setup.expiresAt.toISOString()
    };
}
router.use(auth_1.authenticateToken);
// GET /api/setups - Get all trade setups with real-time status updates and tier-based filtering
router.get('/', async (req, res) => {
    try {
        // Check if cache needs refresh
        const now = Date.now();
        if (now - lastCacheUpdate > CACHE_TTL || setupsCache.length === 0) {
            console.log('Generating fresh trade setups...');
            // Try to get persisted setups first
            const persistedSetups = await tradeSetupEngine_1.tradeSetupEngine.getPersistedSetups();
            if (persistedSetups.length >= 5) {
                // Use persisted setups if we have enough
                setupsCache = persistedSetups.slice(0, 12);
            }
            else {
                // Generate new setups and persist them
                setupsCache = await tradeSetupEngine_1.tradeSetupEngine.generateSetups(12);
                await tradeSetupEngine_1.tradeSetupEngine.persistSetups(setupsCache);
            }
            lastCacheUpdate = now;
        }
        // Fetch current prices to update statuses
        const currentPrices = await fetchCurrentPrices();
        // Update setup statuses based on current prices
        const updatedSetups = setupsCache.map(setup => {
            const currentPrice = currentPrices[setup.symbol];
            if (currentPrice) {
                setup.status = tradeSetupEngine_1.tradeSetupEngine.updateSetupStatus(setup, currentPrice);
            }
            return transformSetupForFrontend(setup);
        });
        // Filter out expired setups from cache
        setupsCache = setupsCache.filter(s => s.status !== 'expired');
        // Apply tier-based filtering
        const user = req.user;
        const tier = user?.subscriptionTier || 'basic';
        let filteredSetups = updatedSetups;
        if (tier === 'basic') {
            // BASIC: Show only 2 setups MAX (highest confidence or closest to trigger)
            // Prioritize near_trigger > forming, then by confidence
            filteredSetups = updatedSetups
                .sort((a, b) => {
                // Prioritize near_trigger status
                const aStatus = a.status === 'NEAR TRIGGER' ? 2 : a.status === 'FORMING' ? 1 : 0;
                const bStatus = b.status === 'NEAR TRIGGER' ? 2 : b.status === 'FORMING' ? 1 : 0;
                if (aStatus !== bStatus)
                    return bStatus - aStatus;
                // Then by confidence
                return b.confidence - a.confidence;
            })
                .slice(0, 2); // Max 2 setups for BASIC
        }
        // PRO and LIFETIME: unlimited setups
        res.json({
            setups: filteredSetups,
            tier,
            limitReached: tier === 'basic' && updatedSetups.length > filteredSetups.length,
            totalAvailable: updatedSetups.length,
            totalShown: filteredSetups.length
        });
    }
    catch (error) {
        console.error('Error fetching setups:', error);
        res.status(500).json({ error: 'Failed to fetch trade setups' });
    }
});
// POST /api/setups/generate - Force regenerate setups
router.post('/generate', async (req, res) => {
    try {
        console.log('Force generating new trade setups...');
        setupsCache = await tradeSetupEngine_1.tradeSetupEngine.generateSetups(12);
        // Persist the new setups
        await tradeSetupEngine_1.tradeSetupEngine.persistSetups(setupsCache);
        lastCacheUpdate = Date.now();
        const transformedSetups = setupsCache.map(transformSetupForFrontend);
        res.json(transformedSetups);
    }
    catch (error) {
        console.error('Error generating setups:', error);
        res.status(500).json({ error: 'Failed to generate trade setups' });
    }
});
// GET /api/setups/stats - Get setup statistics
router.get('/stats', async (req, res) => {
    try {
        const setups = setupsCache.length > 0 ? setupsCache : await tradeSetupEngine_1.tradeSetupEngine.generateSetups(12);
        const stats = {
            total: setups.length,
            byStatus: {
                FORMING: setups.filter(s => s.status === 'forming').length,
                'NEAR TRIGGER': setups.filter(s => s.status === 'near_trigger').length,
                TRIGGERED: setups.filter(s => s.status === 'triggered').length,
                EXPIRED: setups.filter(s => s.status === 'expired').length
            },
            byBias: {
                bullish: setups.filter(s => s.bias === 'bullish').length,
                bearish: setups.filter(s => s.bias === 'bearish').length
            },
            byRisk: {
                LOW: setups.filter(s => s.riskLevel === 'LOW').length,
                MEDIUM: setups.filter(s => s.riskLevel === 'MEDIUM').length,
                HIGH: setups.filter(s => s.riskLevel === 'HIGH').length
            },
            avgConfidence: setups.length > 0
                ? Math.round(setups.reduce((acc, s) => acc + s.confidenceScore, 0) / setups.length)
                : 0,
            avgRiskReward: setups.length > 0
                ? (setups.reduce((acc, s) => acc + s.riskRewardRatio, 0) / setups.length).toFixed(2)
                : '0.00'
        };
        res.json(stats);
    }
    catch (error) {
        console.error('Error fetching stats:', error);
        res.status(500).json({ error: 'Failed to fetch stats' });
    }
});
// DELETE /api/setups/clear - Clear all setups from cache
router.delete('/clear', async (req, res) => {
    try {
        setupsCache = [];
        lastCacheUpdate = 0;
        res.json({ message: 'All setups cleared', count: 0 });
    }
    catch (error) {
        res.status(500).json({ error: 'Server error' });
    }
});
exports.default = router;
