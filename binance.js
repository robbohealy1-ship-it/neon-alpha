"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.binanceService = exports.BinanceService = void 0;
const axios_1 = __importDefault(require("axios"));
class BinanceService {
    constructor() {
        this.baseUrl = 'https://api.binance.com/api/v3';
    }
    async getOHLCV(symbol, interval, limit = 200) {
        try {
            const response = await axios_1.default.get(`${this.baseUrl}/klines`, {
                params: {
                    symbol: symbol,
                    interval: interval,
                    limit: limit
                },
                timeout: 10000
            });
            return response.data.map((k) => ({
                time: k[0],
                open: parseFloat(k[1]),
                high: parseFloat(k[2]),
                low: parseFloat(k[3]),
                close: parseFloat(k[4]),
                volume: parseFloat(k[5])
            }));
        }
        catch (error) {
            console.error(`Error fetching OHLCV for ${symbol}:`, error);
            return [];
        }
    }
    calculateEMA(data, period) {
        if (data.length < period)
            return data[data.length - 1] || 0;
        const k = 2 / (period + 1);
        let ema = data.slice(0, period).reduce((a, b) => a + b, 0) / period;
        for (let i = period; i < data.length; i++) {
            ema = data[i] * k + ema * (1 - k);
        }
        return ema;
    }
    calculateRSI(data, period = 14) {
        if (data.length < period + 1)
            return 50;
        let gains = 0;
        let losses = 0;
        for (let i = 1; i <= period; i++) {
            const change = data[i] - data[i - 1];
            if (change > 0)
                gains += change;
            else
                losses -= change;
        }
        let avgGain = gains / period;
        let avgLoss = losses / period;
        for (let i = period + 1; i < data.length; i++) {
            const change = data[i] - data[i - 1];
            const gain = change > 0 ? change : 0;
            const loss = change < 0 ? -change : 0;
            avgGain = (avgGain * (period - 1) + gain) / period;
            avgLoss = (avgLoss * (period - 1) + loss) / period;
        }
        if (avgLoss === 0)
            return 100;
        const rs = avgGain / avgLoss;
        return 100 - (100 / (1 + rs));
    }
    calculateTechnicalIndicators(ohlcv) {
        const closes = ohlcv.map(c => c.close);
        const volumes = ohlcv.map(c => c.volume);
        return {
            ema12: this.calculateEMA(closes, 12),
            ema26: this.calculateEMA(closes, 26),
            ema50: this.calculateEMA(closes, 50),
            ema200: this.calculateEMA(closes, 200),
            rsi: this.calculateRSI(closes),
            avgVolume: volumes.slice(-20).reduce((a, b) => a + b, 0) / 20
        };
    }
    detectBullishDivergence(ohlcv, rsi) {
        if (ohlcv.length < 20)
            return false;
        const recentLows = ohlcv.slice(-10).map(c => c.low);
        const minPrice = Math.min(...recentLows);
        const minPriceIndex = recentLows.indexOf(minPrice);
        // If price made a new low but RSI didn't make a new low (divergence)
        if (minPriceIndex === recentLows.length - 1 && rsi > 35) {
            return true;
        }
        return false;
    }
}
exports.BinanceService = BinanceService;
exports.binanceService = new BinanceService();
