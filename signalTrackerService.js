"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.signalTrackerService = void 0;
exports.startSignalChecker = startSignalChecker;
const client_1 = require("@prisma/client");
const axios_1 = __importDefault(require("axios"));
const prisma = new client_1.PrismaClient();
class SignalTrackerService {
    // Save a new signal when generated
    async saveSignal(signal) {
        try {
            const saved = await prisma.signalHistory.create({
                data: {
                    coin: signal.coin,
                    direction: signal.direction,
                    entry: signal.entry,
                    stopLoss: signal.stopLoss,
                    takeProfit: signal.takeProfit,
                    confidence: signal.confidence,
                    result: 'ACTIVE',
                    strategy: signal.strategy || 'EMA Trend Pullback',
                    timeframe: signal.timeframe || '1h',
                },
            });
            console.log(`✅ Signal saved: ${signal.coin} ${signal.direction} @ ${signal.entry}`);
            return saved;
        }
        catch (error) {
            console.error('Error saving signal:', error);
            throw error;
        }
    }
    // Check all active signals against current market prices
    async checkActiveSignals() {
        try {
            const activeSignals = await prisma.signalHistory.findMany({
                where: { result: 'ACTIVE' },
            });
            console.log(`🔍 Checking ${activeSignals.length} active signals...`);
            for (const signal of activeSignals) {
                await this.checkSignalResult(signal);
            }
        }
        catch (error) {
            console.error('Error checking active signals:', error);
        }
    }
    // Check if a signal has hit TP or SL
    async checkSignalResult(signal) {
        try {
            // Get current price from CoinGecko
            const symbol = signal.coin.replace('USDT', '').toLowerCase();
            const coinGeckoId = this.getCoinGeckoId(symbol);
            if (!coinGeckoId) {
                console.warn(`Unknown coin: ${signal.coin}`);
                return;
            }
            const response = await axios_1.default.get(`https://api.coingecko.com/api/v3/simple/price?ids=${coinGeckoId}&vs_currencies=usd`, { timeout: 5000 });
            const currentPrice = response.data[coinGeckoId]?.usd;
            if (!currentPrice) {
                console.warn(`No price data for ${signal.coin}`);
                return;
            }
            const { result, pnlPercent } = this.calculateResult(signal, currentPrice);
            if (result !== 'ACTIVE') {
                await this.closeSignal(signal.id, result, pnlPercent);
            }
        }
        catch (error) {
            console.error(`Error checking signal ${signal.id}:`, error);
        }
    }
    // Calculate if signal hit TP or SL
    calculateResult(signal, currentPrice) {
        const { direction, entry, stopLoss, takeProfit } = signal;
        if (direction === 'LONG') {
            // For LONG: TP is above entry, SL is below entry
            if (currentPrice >= takeProfit) {
                const pnl = ((takeProfit - entry) / entry) * 100;
                return { result: 'WIN', pnlPercent: pnl };
            }
            if (currentPrice <= stopLoss) {
                const pnl = ((stopLoss - entry) / entry) * 100;
                return { result: 'LOSS', pnlPercent: pnl };
            }
        }
        else {
            // For SHORT: TP is below entry, SL is above entry
            if (currentPrice <= takeProfit) {
                const pnl = ((entry - takeProfit) / entry) * 100;
                return { result: 'WIN', pnlPercent: pnl };
            }
            if (currentPrice >= stopLoss) {
                const pnl = ((entry - stopLoss) / entry) * 100;
                return { result: 'LOSS', pnlPercent: -pnl };
            }
        }
        return { result: 'ACTIVE', pnlPercent: 0 };
    }
    // Close a signal with result
    async closeSignal(id, result, pnlPercent) {
        try {
            await prisma.signalHistory.update({
                where: { id },
                data: {
                    result,
                    pnlPercent,
                    closedAt: new Date(),
                },
            });
            console.log(`🏁 Signal ${id} closed: ${result} (${pnlPercent.toFixed(2)}%)`);
        }
        catch (error) {
            console.error(`Error closing signal ${id}:`, error);
        }
    }
    // Get signal performance metrics
    async getPerformanceMetrics() {
        try {
            const allSignals = await prisma.signalHistory.findMany();
            const wins = allSignals.filter(s => s.result === 'WIN').length;
            const losses = allSignals.filter(s => s.result === 'LOSS').length;
            const activeSignals = allSignals.filter(s => s.result === 'ACTIVE').length;
            const completedSignals = wins + losses;
            const winRate = completedSignals > 0 ? (wins / completedSignals) * 100 : 0;
            // Calculate average risk/reward
            const completed = allSignals.filter(s => s.result === 'WIN' || s.result === 'LOSS');
            const averageRR = completed.length > 0
                ? completed.reduce((sum, s) => sum + (s.pnlPercent || 0), 0) / completed.length
                : 0;
            // Calculate total PnL
            const totalPnlPercent = allSignals.reduce((sum, s) => sum + (s.pnlPercent || 0), 0);
            return {
                totalSignals: allSignals.length,
                wins,
                losses,
                activeSignals,
                winRate,
                averageRR,
                totalPnlPercent,
            };
        }
        catch (error) {
            console.error('Error getting performance metrics:', error);
            throw error;
        }
    }
    // Get recent signals
    async getRecentSignals(limit = 20) {
        try {
            return await prisma.signalHistory.findMany({
                orderBy: { createdAt: 'desc' },
                take: limit,
            });
        }
        catch (error) {
            console.error('Error getting recent signals:', error);
            throw error;
        }
    }
    // Get signal stats by coin
    async getStatsByCoin() {
        try {
            const signals = await prisma.signalHistory.findMany({
                where: {
                    result: { in: ['WIN', 'LOSS'] },
                },
            });
            const coinStats = {};
            for (const signal of signals) {
                if (!coinStats[signal.coin]) {
                    coinStats[signal.coin] = { wins: 0, losses: 0, total: 0 };
                }
                coinStats[signal.coin].total++;
                if (signal.result === 'WIN') {
                    coinStats[signal.coin].wins++;
                }
                else {
                    coinStats[signal.coin].losses++;
                }
            }
            return Object.entries(coinStats)
                .map(([coin, stats]) => ({
                coin,
                ...stats,
                winRate: stats.total > 0 ? (stats.wins / stats.total) * 100 : 0,
            }))
                .sort((a, b) => b.total - a.total);
        }
        catch (error) {
            console.error('Error getting coin stats:', error);
            throw error;
        }
    }
    // Map common symbols to CoinGecko IDs
    getCoinGeckoId(symbol) {
        const mapping = {
            btc: 'bitcoin',
            eth: 'ethereum',
            sol: 'solana',
            bnb: 'binancecoin',
            xrp: 'ripple',
            ada: 'cardano',
            doge: 'dogecoin',
            dot: 'polkadot',
            matic: 'polygon',
            link: 'chainlink',
            avax: 'avalanche-2',
            uni: 'uniswap',
            ltc: 'litecoin',
            etc: 'ethereum-classic',
            xlm: 'stellar',
            atom: 'cosmos',
            algo: 'algorand',
            vet: 'vechain',
            fil: 'filecoin',
            trx: 'tron',
        };
        return mapping[symbol.toLowerCase()] || null;
    }
}
exports.signalTrackerService = new SignalTrackerService();
// Start periodic signal checking (every 5 minutes)
function startSignalChecker() {
    console.log('🚀 Signal checker started - checking every 5 minutes');
    // Check immediately on start
    exports.signalTrackerService.checkActiveSignals();
    // Then every 5 minutes
    setInterval(() => {
        exports.signalTrackerService.checkActiveSignals();
    }, 5 * 60 * 1000);
}
