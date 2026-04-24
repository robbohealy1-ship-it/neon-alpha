"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_1 = require("../middleware/auth");
const axios_1 = __importDefault(require("axios"));
const router = (0, express_1.Router)();
// Cache for market data - SHORTER cache for fresher data
let marketCache = null;
let fearGreedCache = null;
let lastUpdate = 0;
let lastFearGreedUpdate = 0;
const CACHE_DURATION = 15000; // 15 seconds
const FEAR_GREED_CACHE_DURATION = 30000; // 30 seconds - match frontend polling
// EXPANDED: Top 50 coins for more trade setups
const COINGECKO_IDS = [
    'bitcoin', 'ethereum', 'solana', 'avalanche-2', 'polygon',
    'chainlink', 'cardano', 'polkadot', 'dogecoin', 'tron',
    'ripple', 'litecoin', 'bitcoin-cash', 'uniswap', 'aave',
    'sushi', 'compound-governance-token', 'maker', 'cosmos', 'near',
    'binancecoin', 'ethereum-classic', 'filecoin', 'aptos', 'optimism',
    'arbitrum', 'sui', 'the-open-network', 'internet-computer', 'pepe',
    'ondo-finance', 'render-token', 'injective-protocol', 'fetch-ai', 'gala',
    'beam-2', 'floki', 'bonk', 'shiba-inu', 'stellar',
    'vechain', 'algorand', 'kaspa', 'monero', 'bitcoin-cash-sv',
    'hedera-hashgraph', 'immutable-x', 'mantle', 'quant-network', 'akash-network'
];
const SYMBOL_MAP = {
    'bitcoin': 'BTC',
    'ethereum': 'ETH',
    'solana': 'SOL',
    'avalanche-2': 'AVAX',
    'polygon': 'MATIC',
    'chainlink': 'LINK',
    'cardano': 'ADA',
    'polkadot': 'DOT',
    'dogecoin': 'DOGE',
    'tron': 'TRX',
    'ripple': 'XRP',
    'litecoin': 'LTC',
    'bitcoin-cash': 'BCH',
    'uniswap': 'UNI',
    'aave': 'AAVE',
    'sushi': 'SUSHI',
    'compound-governance-token': 'COMP',
    'maker': 'MKR',
    'cosmos': 'ATOM',
    'near': 'NEAR'
};
async function fetchMarketData() {
    const now = Date.now();
    if (marketCache && now - lastUpdate < CACHE_DURATION) {
        return marketCache;
    }
    try {
        const response = await axios_1.default.get(`https://api.coingecko.com/api/v3/coins/markets`, {
            params: {
                vs_currency: 'usd',
                ids: COINGECKO_IDS.join(','),
                order: 'market_cap_desc',
                sparkline: true,
                price_change_percentage: '24h',
                include_24hr_vol: true,
                include_market_cap: true
            },
            timeout: 10000
        });
        const formattedData = {};
        const topMovers = [];
        response.data.forEach((coin) => {
            const symbol = coin.symbol.toUpperCase();
            formattedData[symbol] = {
                id: coin.id,
                symbol: symbol,
                name: coin.name,
                price: coin.current_price,
                change24h: coin.price_change_percentage_24h || 0,
                volume: coin.total_volume,
                marketCap: coin.market_cap,
                sparkline: coin.sparkline_in_7d?.price?.slice(-24) || [],
                image: coin.image
            };
            topMovers.push({
                symbol,
                change24h: coin.price_change_percentage_24h || 0,
                price: coin.current_price,
                image: coin.image
            });
        });
        // Sort by change percentage for top movers
        const gainers = topMovers.filter(m => m.change24h > 0).sort((a, b) => b.change24h - a.change24h).slice(0, 5);
        const losers = topMovers.filter(m => m.change24h < 0).sort((a, b) => a.change24h - b.change24h).slice(0, 5);
        marketCache = {
            data: formattedData,
            topGainers: gainers,
            topLosers: losers,
            lastUpdated: new Date().toISOString()
        };
        lastUpdate = now;
        return marketCache;
    }
    catch (error) {
        console.error('CoinGecko API error:', error);
        if (marketCache)
            return marketCache;
        throw error;
    }
}
async function fetchFearGreedIndex() {
    const now = Date.now();
    if (fearGreedCache && now - lastFearGreedUpdate < FEAR_GREED_CACHE_DURATION) {
        return fearGreedCache;
    }
    try {
        const response = await axios_1.default.get('https://api.alternative.me/fng/', {
            timeout: 10000
        });
        const data = response.data.data[0];
        const value = parseInt(data.value);
        let classification = 'Neutral';
        if (value <= 20)
            classification = 'Extreme Fear';
        else if (value <= 40)
            classification = 'Fear';
        else if (value <= 60)
            classification = 'Neutral';
        else if (value <= 80)
            classification = 'Greed';
        else
            classification = 'Extreme Greed';
        fearGreedCache = {
            value,
            classification,
            timestamp: data.timestamp,
            timeUntilUpdate: data.time_until_update
        };
        lastFearGreedUpdate = now;
        return fearGreedCache;
    }
    catch (error) {
        console.error('Fear & Greed API error:', error);
        if (fearGreedCache)
            return fearGreedCache;
        throw error;
    }
}
router.use(auth_1.authenticateToken);
router.get('/overview', async (req, res) => {
    try {
        const marketData = await fetchMarketData();
        res.json(marketData);
    }
    catch (error) {
        console.error('Market overview error:', error);
        res.status(500).json({ error: 'Failed to fetch market data' });
    }
});
router.get('/sentiment', async (req, res) => {
    try {
        const fearGreed = await fetchFearGreedIndex();
        const marketData = await fetchMarketData();
        const topTrending = Object.values(marketData.data)
            .sort((a, b) => Math.abs(b.change24h) - Math.abs(a.change24h))
            .slice(0, 4)
            .map((coin) => coin.symbol);
        const overall = fearGreed.value > 50 ? 'bullish' : fearGreed.value < 40 ? 'bearish' : 'neutral';
        const sentiment = {
            overall,
            fearGreedIndex: fearGreed.value,
            fearGreedClassification: fearGreed.classification,
            trendingCoins: topTrending,
            marketPhase: fearGreed.value > 75 ? 'distribution' : fearGreed.value < 25 ? 'accumulation' : 'markup',
            lastUpdated: fearGreed.timestamp
        };
        res.json(sentiment);
    }
    catch (error) {
        console.error('Sentiment error:', error);
        res.status(500).json({ error: 'Failed to fetch sentiment data' });
    }
});
router.get('/ticker', async (req, res) => {
    try {
        const marketData = await fetchMarketData();
        const tickerData = Object.values(marketData.data).map((coin) => ({
            symbol: coin.symbol,
            price: coin.price,
            change24h: coin.change24h,
            image: coin.image
        }));
        res.json({
            data: tickerData,
            lastUpdated: marketData.lastUpdated
        });
    }
    catch (error) {
        console.error('Ticker error:', error);
        res.status(500).json({ error: 'Failed to fetch ticker data' });
    }
});
router.get('/search/:query', async (req, res) => {
    try {
        const { query } = req.params;
        const response = await axios_1.default.get('https://api.coingecko.com/api/v3/search', {
            params: { query },
            timeout: 10000
        });
        const coins = response.data.coins.slice(0, 10).map((coin) => ({
            id: coin.id,
            symbol: coin.symbol.toUpperCase(),
            name: coin.name,
            image: coin.thumb,
            marketCapRank: coin.market_cap_rank
        }));
        res.json({ coins });
    }
    catch (error) {
        console.error('Search error:', error);
        res.status(500).json({ error: 'Failed to search coins' });
    }
});
exports.default = router;
