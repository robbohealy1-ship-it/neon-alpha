"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.marketDataService = void 0;
class MarketDataService {
    constructor() {
        this.BINANCE_API = 'https://api.binance.com/api/v3';
        this.COINGECKO_API = 'https://api.coingecko.com/api/v3';
        // List of coins to monitor
        this.COINS = [
            'BTCUSDT', 'ETHUSDT', 'BNBUSDT', 'SOLUSDT', 'XRPUSDT',
            'ADAUSDT', 'AVAXUSDT', 'DOGEUSDT', 'DOTUSDT', 'MATICUSDT',
            'LINKUSDT', 'ATOMUSDT', 'LTCUSDT', 'UNIUSDT', 'NEARUSDT'
        ];
    }
    /**
     * Fetch OHLCV candles from Binance
     */
    async fetchCandles(symbol, interval = '1h', limit = 200) {
        try {
            const response = await fetch(`${this.BINANCE_API}/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`);
            if (!response.ok) {
                throw new Error(`Binance API error: ${response.statusText}`);
            }
            const data = await response.json();
            return data.map((k) => ({
                time: k[0],
                open: parseFloat(k[1]),
                high: parseFloat(k[2]),
                low: parseFloat(k[3]),
                close: parseFloat(k[4]),
                volume: parseFloat(k[5])
            }));
        }
        catch (error) {
            console.error(`Error fetching candles for ${symbol}:`, error);
            // Fallback to mock data for development
            return this.generateMockCandles(symbol);
        }
    }
    /**
     * Fetch current price from Binance
     */
    async fetchCurrentPrice(symbol) {
        try {
            const response = await fetch(`${this.BINANCE_API}/ticker/price?symbol=${symbol}`);
            if (!response.ok) {
                throw new Error(`Binance API error: ${response.statusText}`);
            }
            const data = await response.json();
            return parseFloat(data.price);
        }
        catch (error) {
            console.error(`Error fetching price for ${symbol}:`, error);
            return 0;
        }
    }
    /**
     * Fetch market data for multiple coins
     */
    async fetchMarketData(interval = '1h') {
        const promises = this.COINS.map(async (symbol) => {
            const candles = await this.fetchCandles(symbol, interval);
            const currentPrice = await this.fetchCurrentPrice(symbol);
            return {
                symbol,
                candles,
                currentPrice
            };
        });
        return Promise.all(promises);
    }
    /**
     * Calculate EMA (Exponential Moving Average)
     */
    calculateEMA(data, period) {
        const k = 2 / (period + 1);
        const ema = [data[0]];
        for (let i = 1; i < data.length; i++) {
            ema.push(data[i] * k + ema[i - 1] * (1 - k));
        }
        return ema;
    }
    /**
     * Calculate RSI (Relative Strength Index)
     */
    calculateRSI(candles, period = 14) {
        if (candles.length < period + 1)
            return 50;
        let gains = 0;
        let losses = 0;
        for (let i = candles.length - period; i < candles.length; i++) {
            const change = candles[i].close - candles[i - 1].close;
            if (change > 0) {
                gains += change;
            }
            else {
                losses -= change;
            }
        }
        const avgGain = gains / period;
        const avgLoss = losses / period;
        if (avgLoss === 0)
            return 100;
        const rs = avgGain / avgLoss;
        return 100 - (100 / (1 + rs));
    }
    /**
     * Calculate Volume Average
     */
    calculateVolumeAverage(candles, period = 20) {
        if (candles.length < period)
            return 0;
        const recent = candles.slice(-period);
        const sum = recent.reduce((acc, c) => acc + c.volume, 0);
        return sum / period;
    }
    /**
     * Generate mock candles for development/fallback
     */
    generateMockCandles(symbol) {
        const candles = [];
        const basePrice = symbol.includes('BTC') ? 65000 : symbol.includes('ETH') ? 3500 : 100;
        const now = Date.now();
        const interval = 60 * 60 * 1000; // 1 hour
        let price = basePrice;
        for (let i = 200; i > 0; i--) {
            const change = (Math.random() - 0.5) * (basePrice * 0.02);
            price = Math.max(price + change, basePrice * 0.8);
            candles.push({
                time: now - (i * interval),
                open: price,
                high: price * (1 + Math.random() * 0.01),
                low: price * (1 - Math.random() * 0.01),
                close: price * (1 + (Math.random() - 0.5) * 0.005),
                volume: Math.random() * 1000000 + 500000
            });
        }
        return candles;
    }
    /**
     * Get list of monitored coins
     */
    getCoins() {
        return this.COINS;
    }
}
exports.marketDataService = new MarketDataService();
