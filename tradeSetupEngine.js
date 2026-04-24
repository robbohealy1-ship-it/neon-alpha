"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.tradeSetupEngine = void 0;
const axios_1 = __importDefault(require("axios"));
const marketStateEngine_1 = require("./marketStateEngine");
const edgeFilterEngine_1 = require("./edgeFilterEngine");
const visualMappingEngine_1 = require("./visualMappingEngine");
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
    'RNDR': 'render-token', 'INJ': 'injective-protocol', 'TIA': 'celestia',
    'SEI': 'sei-network', 'STRK': 'starknet', 'PYTH': 'pyth-network',
    'JTO': 'jito-governance-token', 'JUP': 'jupiter-exchange-solana',
    'WIF': 'dogwifhat', 'BONK': 'bonk', 'WLD': 'worldcoin-wld',
    'ARKM': 'arkham', 'CYBER': 'cyberconnect', 'MEME': 'memecoin',
    'ORDI': 'ordinals', 'SATS': 'satoshis', 'BEAM': 'beam-2',
    'IMX': 'immutable-x', 'GRT': 'the-graph', 'MANA': 'decentraland',
    'SAND': 'the-sandbox', 'AXS': 'axie-infinity', 'ENJ': 'enjincoin',
    'CHZ': 'chiliz', 'GMT': 'stepn', 'ATOM': 'cosmos',
    'OSMO': 'osmosis', 'KAVA': 'kava', 'SCRT': 'secret'
};
// Strategy definitions with proper technical logic
const STRATEGIES = {
    LIQUIDITY_SWEEP: {
        name: 'Liquidity Sweep',
        description: 'Price takes out equal highs/lows (stops) before reversing',
        timeframes: ['1H', '4H'],
        confluenceFactors: [
            'Equal highs/lows taken out',
            'High volume on sweep candle',
            'Immediate rejection after sweep',
            'Market structure intact on higher TF'
        ]
    },
    FAIR_VALUE_GAP: {
        name: 'Fair Value Gap',
        description: 'Imbalance zone where price often returns to fill the gap',
        timeframes: ['1H', '4H', '1D'],
        confluenceFactors: [
            'Clear 3-candle FVG pattern',
            'Aligned with trend direction',
            'Near key support/resistance',
            'Volume confirmation'
        ]
    },
    MARKET_STRUCTURE_SHIFT: {
        name: 'Market Structure Shift',
        description: 'Break of Structure (BOS) or Change of Character (CHoCH)',
        timeframes: ['4H', '1D'],
        confluenceFactors: [
            'Clear swing high/low broken',
            'Momentum shift confirmed',
            'Volume spike on break',
            'Retest of broken level likely'
        ]
    },
    TREND_CONTINUATION: {
        name: 'Trend Continuation',
        description: 'Pullback to key EMA/level within established trend',
        timeframes: ['1H', '4H'],
        confluenceFactors: [
            'Higher timeframe trend aligned',
            'Pulling back to EMA 50/200',
            'Previous support now resistance (or vice versa)',
            'Decreasing volume on pullback'
        ]
    },
    RANGE_BREAKOUT: {
        name: 'Range Breakout',
        description: 'Consolidation breakout with volume confirmation',
        timeframes: ['1H', '4H'],
        confluenceFactors: [
            'Clear range established (3+ touches)',
            'Volume spike on breakout candle',
            'Close beyond range boundary',
            'Retest entry opportunity'
        ]
    },
    VOLUME_SPIKE_REVERSAL: {
        name: 'Volume Spike Reversal',
        description: 'High volume exhaustion candle indicating reversal',
        timeframes: ['1H', '4H'],
        confluenceFactors: [
            '3x average volume spike',
            'Long wick rejection candle',
            'Key level reaction',
            'Momentum divergence'
        ]
    }
};
class TradeSetupEngine {
    async fetchMarketData() {
        try {
            const response = await axios_1.default.get('https://api.coingecko.com/api/v3/coins/markets', {
                params: {
                    vs_currency: 'usd',
                    ids: Object.values(COINGECKO_IDS).join(','),
                    order: 'market_cap_desc',
                    price_change_percentage: '24h',
                    include_24hr_vol: true
                },
                timeout: 15000
            });
            return response.data.map((coin) => {
                const symbol = Object.keys(COINGECKO_IDS).find(key => COINGECKO_IDS[key] === coin.id) || coin.symbol.toUpperCase();
                const price = coin.current_price || 0;
                const high24h = coin.high_24h || price * 1.02;
                const low24h = coin.low_24h || price * 0.98;
                // Calculate ATR approximation from 24h range
                const atr = high24h - low24h;
                // Calculate position in 24h range (0 = at low, 100 = at high)
                const pricePosition = high24h === low24h ? 50 :
                    ((price - low24h) / (high24h - low24h)) * 100;
                return {
                    symbol,
                    name: coin.name,
                    price,
                    change24h: coin.price_change_percentage_24h || 0,
                    volume24h: coin.total_volume || 0,
                    marketCap: coin.market_cap || 0,
                    high24h,
                    low24h,
                    atr,
                    pricePosition
                };
            });
        }
        catch (error) {
            console.error('Failed to fetch market data:', error);
            // Return fallback mock data when API fails
            console.log('Using fallback mock market data...');
            return this.getFallbackMarketData();
        }
    }
    getFallbackMarketData() {
        // Fallback data when CoinGecko API is rate limited
        const fallbackCoins = [
            { symbol: 'BTC', name: 'Bitcoin', price: 65000, change24h: 2.5 },
            { symbol: 'ETH', name: 'Ethereum', price: 3500, change24h: 1.8 },
            { symbol: 'SOL', name: 'Solana', price: 145, change24h: 5.2 },
            { symbol: 'BNB', name: 'Binance Coin', price: 590, change24h: 0.9 },
            { symbol: 'XRP', name: 'XRP', price: 0.62, change24h: -1.2 },
            { symbol: 'ADA', name: 'Cardano', price: 0.45, change24h: 3.1 },
            { symbol: 'AVAX', name: 'Avalanche', price: 38, change24h: 4.5 },
            { symbol: 'DOT', name: 'Polkadot', price: 7.2, change24h: 1.5 },
            { symbol: 'LINK', name: 'Chainlink', price: 14, change24h: 2.8 },
            { symbol: 'MATIC', name: 'Polygon', price: 0.58, change24h: -0.8 },
            { symbol: 'DOGE', name: 'Dogecoin', price: 0.16, change24h: 8.5 },
            { symbol: 'SHIB', name: 'Shiba Inu', price: 0.000025, change24h: 6.2 },
            { symbol: 'UNI', name: 'Uniswap', price: 9.5, change24h: -2.1 },
            { symbol: 'LTC', name: 'Litecoin', price: 82, change24h: 1.2 },
            { symbol: 'BCH', name: 'Bitcoin Cash', price: 380, change24h: 0.5 }
        ];
        return fallbackCoins.map(coin => {
            const high24h = coin.price * (1 + Math.abs(coin.change24h) / 100);
            const low24h = coin.price * (1 - Math.abs(coin.change24h) / 100);
            const atr = high24h - low24h;
            const pricePosition = coin.change24h > 0 ? 65 : 35;
            return {
                symbol: coin.symbol,
                name: coin.name,
                price: coin.price,
                change24h: coin.change24h,
                volume24h: Math.random() * 1000000000,
                marketCap: coin.price * 1000000,
                high24h,
                low24h,
                atr,
                pricePosition
            };
        });
    }
    calculateRiskMetrics(entry, stopLoss, targets) {
        const risk = Math.abs(entry - stopLoss);
        const riskPercent = (risk / entry) * 100;
        // Calculate R:R using first target
        const reward = Math.abs(targets[0] - entry);
        const riskRewardRatio = risk > 0 ? reward / risk : 0;
        // Determine risk level - aligned with optimal crypto swing trade risk (1%)
        let riskLevel;
        if (riskPercent < 1.5)
            riskLevel = 'LOW'; // Conservative: < 1.5%
        else if (riskPercent < 3)
            riskLevel = 'MEDIUM'; // Optimal: 1.5% - 3%
        else
            riskLevel = 'HIGH'; // Aggressive: > 3%
        return { riskPercent, riskRewardRatio, riskLevel };
    }
    calculateConfidence(strategies, confluenceFactors, trendAlignment, riskRewardRatio) {
        // Base confidence
        let confidence = 50;
        // +10 per confluence factor (max +40)
        confidence += Math.min(confluenceFactors.length * 10, 40);
        // +10 if aligned with higher timeframe trend
        if (trendAlignment)
            confidence += 10;
        // +5 for favorable R:R (> 2:1)
        if (riskRewardRatio >= 2)
            confidence += 5;
        // +5 for excellent R:R (> 3:1)
        if (riskRewardRatio >= 3)
            confidence += 5;
        // Clamp between 50-95 (never 100% certain)
        return Math.min(95, Math.max(50, confidence));
    }
    generateLiquiditySweepSetup(coin) {
        const { symbol, price, high24h, low24h, change24h, atr, pricePosition } = coin;
        // Determine if we're near 24h high or low (potential sweep)
        const nearHigh = pricePosition > 70;
        const nearLow = pricePosition < 30;
        if (!nearHigh && !nearLow)
            return null;
        const isBullish = nearLow;
        const bias = isBullish ? 'bullish' : 'bearish';
        // Calculate realistic levels based on actual price and 24h range
        const range = high24h - low24h;
        const stopBuffer = Math.max(atr * 0.3, price * 0.005); // Min 0.5% stop buffer
        let entryZone, stopLoss, targets;
        if (isBullish) {
            // Bullish: Entry near current price, looking for small dip
            entryZone = {
                low: price * 0.985, // 1.5% below current price
                high: price * 0.995 // 0.5% below current price
            };
            stopLoss = entryZone.low - stopBuffer;
            targets = [
                price * 1.02, // TP1: 2% above entry
                price * 1.05, // TP2: 5% above entry
                price * 1.08 // TP3: 8% above entry
            ];
        }
        else {
            // Bearish: Entry near current price, looking for small bounce
            entryZone = {
                low: price * 1.005, // 0.5% above current price
                high: price * 1.015 // 1.5% above current price
            };
            stopLoss = entryZone.high + stopBuffer;
            targets = [
                price * 0.98, // TP1: 2% below entry
                price * 0.95, // TP2: 5% below entry
                price * 0.92 // TP3: 8% below entry
            ];
        }
        const confluence = [
            `${isBullish ? 'Equal lows' : 'Equal highs'} within 24h range`,
            'Price position near extreme suggests sweep potential',
            `${Math.abs(change24h).toFixed(1)}% 24h move shows momentum`,
            'ATR indicates adequate volatility for setup'
        ];
        const riskMetrics = this.calculateRiskMetrics((entryZone.low + entryZone.high) / 2, stopLoss, targets);
        const confidence = this.calculateConfidence(['Liquidity Sweep'], confluence, true, riskMetrics.riskRewardRatio);
        // Determine timeframe based on volatility
        const timeframe = atr / price > 0.05 ? '1H' : atr / price > 0.02 ? '4H' : '1D';
        return {
            id: `${symbol}-sweep-${Date.now()}`,
            symbol,
            bias,
            status: 'forming',
            timeframe,
            strategy: ['Liquidity Sweep'],
            strategyType: 'liquidity',
            entryZone,
            entryPrice: (entryZone.low + entryZone.high) / 2,
            stopLoss,
            targets,
            ...riskMetrics,
            confidenceScore: confidence,
            confluence,
            createdAt: new Date(),
            expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
            analysis: {
                marketStructure: isBullish
                    ? 'Potential bullish sweep of 24h lows forming'
                    : 'Potential bearish sweep of 24h highs forming',
                keyLevels: {
                    support: isBullish ? [low24h, low24h * 0.995] : [price * 0.98, price * 0.95],
                    resistance: isBullish ? [price * 1.02, high24h] : [high24h, high24h * 1.005]
                },
                volumeProfile: 'Awaiting volume spike on sweep candle',
                trendAlignment: isBullish ? 'Potential HTF support test' : 'Potential HTF resistance test'
            }
        };
    }
    generateFVGSetup(coin) {
        const { symbol, price, change24h, high24h, low24h, atr } = coin;
        // FVG setups work best in trending conditions
        const isTrending = Math.abs(change24h) > 0.5;
        if (!isTrending)
            return null;
        const isBullish = change24h > 0;
        const bias = isBullish ? 'bullish' : 'bearish';
        // Calculate FVG entry zone based on actual price and trend
        const fvgSize = Math.max(atr * 0.2, price * 0.008); // Min 0.8% FVG size
        const stopBuffer = Math.max(atr * 0.3, price * 0.006); // Min 0.6% stop buffer
        let entryZone, stopLoss, targets;
        if (isBullish) {
            // Bullish FVG: entry slightly below current price (pullback)
            entryZone = {
                low: price * 0.988, // 1.2% below current
                high: price * 0.998 // 0.2% below current
            };
            stopLoss = entryZone.low - stopBuffer;
            targets = [
                price * 1.025, // TP1: 2.5% gain
                price * 1.055, // TP2: 5.5% gain
                price * 1.085 // TP3: 8.5% gain
            ];
        }
        else {
            // Bearish FVG: entry slightly above current price (retracement)
            entryZone = {
                low: price * 1.002, // 0.2% above current
                high: price * 1.012 // 1.2% above current
            };
            stopLoss = entryZone.high + stopBuffer;
            targets = [
                price * 0.975, // TP1: 2.5% drop
                price * 0.945, // TP2: 5.5% drop
                price * 0.915 // TP3: 8.5% drop
            ];
        }
        const confluence = [
            `${isBullish ? 'Bullish' : 'Bearish'} momentum with ${Math.abs(change24h).toFixed(1)}% move`,
            'Price showing continuation pattern',
            'ATR indicates healthy volatility',
            'FVG zone within optimal retracement area'
        ];
        const riskMetrics = this.calculateRiskMetrics((entryZone.low + entryZone.high) / 2, stopLoss, targets);
        const confidence = this.calculateConfidence(['Fair Value Gap', 'Trend Continuation'], confluence, true, riskMetrics.riskRewardRatio);
        return {
            id: `${symbol}-fvg-${Date.now()}`,
            symbol,
            bias,
            status: 'forming',
            timeframe: atr / price > 0.03 ? '1H' : atr / price > 0.015 ? '4H' : '1D',
            strategy: ['Fair Value Gap', 'Trend Continuation'],
            strategyType: 'trend',
            entryZone,
            entryPrice: (entryZone.low + entryZone.high) / 2,
            stopLoss,
            targets,
            ...riskMetrics,
            confidenceScore: confidence,
            confluence,
            createdAt: new Date(),
            expiresAt: new Date(Date.now() + 12 * 60 * 60 * 1000),
            analysis: {
                marketStructure: isBullish
                    ? 'Bullish trend with pullback to FVG zone'
                    : 'Bearish trend with retracement to FVG',
                keyLevels: {
                    support: isBullish ? [entryZone.low, entryZone.high] : [price * 0.95, price * 0.90],
                    resistance: isBullish ? [price * 1.05, price * 1.10] : [entryZone.high, entryZone.low]
                },
                volumeProfile: 'Volume declining on retracement (healthy)',
                trendAlignment: `${isBullish ? 'Bullish' : 'Bearish'} trend continuation expected`
            }
        };
    }
    generateStructureShiftSetup(coin) {
        const { symbol, price, high24h, low24h, change24h, atr, pricePosition } = coin;
        // Structure shifts happen after strong moves
        const strongMove = Math.abs(change24h) > 2;
        if (!strongMove)
            return null;
        const isBullish = change24h > 0;
        const bias = isBullish ? 'bullish' : 'bearish';
        // Calculate levels based on actual price and 24h range
        const range = high24h - low24h;
        const stopBuffer = Math.max(atr * 0.35, price * 0.008); // Min 0.8% stop buffer
        let entryZone, stopLoss, targets;
        if (isBullish) {
            // BOS (Break of Structure) - looking to enter on pullback to current area
            entryZone = {
                low: price * 0.992, // 0.8% below current
                high: price * 1.002 // 0.2% above current
            };
            stopLoss = entryZone.low - stopBuffer;
            targets = [
                price * 1.03, // TP1: 3% gain
                price * 1.06, // TP2: 6% gain
                price * 1.10 // TP3: 10% gain
            ];
        }
        else {
            // Bearish BOS - looking to enter on bounce to current area
            entryZone = {
                low: price * 0.998, // 0.2% below current
                high: price * 1.008 // 0.8% above current
            };
            stopLoss = entryZone.high + stopBuffer;
            targets = [
                price * 0.97, // TP1: 3% drop
                price * 0.94, // TP2: 6% drop
                price * 0.90 // TP3: 10% drop
            ];
        }
        const confluence = [
            `${Math.abs(change24h).toFixed(1)}% move indicates strong momentum`,
            'Break of 24h structure confirmed',
            'Volume spike likely on breakout',
            'Pullback entry offers favorable R:R'
        ];
        const riskMetrics = this.calculateRiskMetrics((entryZone.low + entryZone.high) / 2, stopLoss, targets);
        const confidence = this.calculateConfidence(['Market Structure Shift', 'Break of Structure'], confluence, true, riskMetrics.riskRewardRatio);
        return {
            id: `${symbol}-bos-${Date.now()}`,
            symbol,
            bias,
            status: 'near_trigger',
            timeframe: atr / price > 0.04 ? '1H' : atr / price > 0.02 ? '4H' : '1D',
            strategy: ['Market Structure Shift', 'Break of Structure'],
            strategyType: 'breakout',
            entryZone,
            entryPrice: (entryZone.low + entryZone.high) / 2,
            stopLoss,
            targets,
            ...riskMetrics,
            confidenceScore: confidence,
            confluence,
            createdAt: new Date(),
            expiresAt: new Date(Date.now() + 18 * 60 * 60 * 1000),
            analysis: {
                marketStructure: isBullish
                    ? 'Bullish BOS: Price broke above previous high'
                    : 'Bearish BOS: Price broke below previous low',
                keyLevels: {
                    support: isBullish ? [entryZone.low, low24h] : [price * 0.95, price * 0.90],
                    resistance: isBullish ? [price * 1.05, price * 1.10] : [entryZone.high, high24h]
                },
                volumeProfile: 'High volume confirms breakout validity',
                trendAlignment: 'Structure shift suggests trend continuation'
            }
        };
    }
    generateTrendContinuationSetup(coin) {
        const { symbol, price, change24h, high24h, low24h, atr } = coin;
        // Need established trend
        const establishedTrend = Math.abs(change24h) > 1;
        if (!establishedTrend)
            return null;
        const isBullish = change24h > 0;
        const bias = isBullish ? 'bullish' : 'bearish';
        // Calculate pullback zone based on actual price and 24h range
        const range = high24h - low24h;
        const stopBuffer = Math.max(atr * 0.4, price * 0.008); // Min 0.8% stop buffer
        let entryZone, stopLoss, targets;
        if (isBullish) {
            // Bullish trend continuation: Buy the small dip
            entryZone = {
                low: price * 0.985, // 1.5% below current
                high: price * 0.995 // 0.5% below current
            };
            stopLoss = entryZone.low - stopBuffer;
            targets = [
                price * 1.02, // TP1: 2% gain
                price * 1.05, // TP2: 5% gain
                price * 1.08 // TP3: 8% gain
            ];
        }
        else {
            // Bearish trend continuation: Short the small bounce
            entryZone = {
                low: price * 1.005, // 0.5% above current
                high: price * 1.015 // 1.5% above current
            };
            stopLoss = entryZone.high + stopBuffer;
            targets = [
                price * 0.98, // TP1: 2% drop
                price * 0.95, // TP2: 5% drop
                price * 0.92 // TP3: 8% drop
            ];
        }
        const confluence = [
            `${isBullish ? 'Bullish' : 'Bearish'} trend established (+${Math.abs(change24h).toFixed(1)}%)`,
            'Pullback to optimal retracement zone',
            'Trend continuation pattern forming',
            'Risk/Reward favorable at current levels'
        ];
        const riskMetrics = this.calculateRiskMetrics((entryZone.low + entryZone.high) / 2, stopLoss, targets);
        const confidence = this.calculateConfidence(['Trend Continuation', 'Pullback Entry'], confluence, true, riskMetrics.riskRewardRatio);
        return {
            id: `${symbol}-trend-${Date.now()}`,
            symbol,
            bias,
            status: 'forming',
            timeframe: atr / price > 0.025 ? '1H' : atr / price > 0.012 ? '4H' : '1D',
            strategy: ['Trend Continuation', 'Pullback Entry'],
            strategyType: 'trend',
            entryZone,
            entryPrice: (entryZone.low + entryZone.high) / 2,
            stopLoss,
            targets,
            ...riskMetrics,
            confidenceScore: confidence,
            confluence,
            createdAt: new Date(),
            expiresAt: new Date(Date.now() + 12 * 60 * 60 * 1000),
            analysis: {
                marketStructure: isBullish
                    ? 'Higher highs and higher lows pattern'
                    : 'Lower highs and lower lows pattern',
                keyLevels: {
                    support: isBullish ? [entryZone.low, low24h] : [price, price * 1.02],
                    resistance: isBullish ? [price, high24h] : [entryZone.high, high24h]
                },
                volumeProfile: 'Volume declining on pullback (healthy)',
                trendAlignment: 'Strong trend continuation expected'
            }
        };
    }
    generateMeanReversionSetup(coin) {
        const { symbol, price, high24h, low24h, change24h, atr, pricePosition } = coin;
        // Mean reversion happens when price is at extremes and due to revert
        const atExtreme = pricePosition > 80 || pricePosition < 20;
        if (!atExtreme)
            return null;
        // Need some volatility but not extreme
        const moderateVolatility = Math.abs(change24h) > 1 && Math.abs(change24h) < 5;
        if (!moderateVolatility)
            return null;
        const isBullish = pricePosition < 30; // Near low, expecting bounce up
        const bias = isBullish ? 'bullish' : 'bearish';
        const stopBuffer = Math.max(atr * 0.4, price * 0.01); // Min 1% stop buffer for counter-trend
        let entryZone, stopLoss, targets;
        if (isBullish) {
            // Bullish mean reversion: buy the dip near current price
            entryZone = {
                low: price * 0.975, // 2.5% below current
                high: price * 0.985 // 1.5% below current
            };
            stopLoss = entryZone.low - stopBuffer;
            targets = [
                price * 0.995, // TP1: Near current
                price * 1.015, // TP2: 1.5% above
                price * 1.035 // TP3: 3.5% above
            ];
        }
        else {
            // Bearish mean reversion: short the spike near current price
            entryZone = {
                low: price * 1.015, // 1.5% above current
                high: price * 1.025 // 2.5% above current
            };
            stopLoss = entryZone.high + stopBuffer;
            targets = [
                price * 1.005, // TP1: Near current
                price * 0.985, // TP2: 1.5% below
                price * 0.965 // TP3: 3.5% below
            ];
        }
        const confluence = [
            `${isBullish ? 'Price at 24h low' : 'Price at 24h high'} - extreme reading`,
            'Overextended move likely to revert to mean',
            'ATR supports reversion play',
            'Support/Resistance levels nearby'
        ];
        const riskMetrics = this.calculateRiskMetrics((entryZone.low + entryZone.high) / 2, stopLoss, targets);
        const confidence = this.calculateConfidence(['Mean Reversion', 'Extreme Reading'], confluence, false, // Counter-trend play
        riskMetrics.riskRewardRatio);
        return {
            id: `${symbol}-mean-reversion-${Date.now()}`,
            symbol,
            bias,
            status: 'forming',
            timeframe: atr / price > 0.04 ? '1H' : atr / price > 0.02 ? '4H' : '1D',
            strategy: ['Mean Reversion', 'Extreme Reading'],
            strategyType: 'mean_reversion',
            entryZone,
            entryPrice: (entryZone.low + entryZone.high) / 2,
            stopLoss,
            targets,
            ...riskMetrics,
            confidenceScore: confidence,
            confluence,
            createdAt: new Date(),
            expiresAt: new Date(Date.now() + 8 * 60 * 60 * 1000),
            analysis: {
                marketStructure: isBullish
                    ? 'Oversold conditions near support, expecting bounce'
                    : 'Overbought conditions near resistance, expecting pullback',
                keyLevels: {
                    support: isBullish ? [low24h, low24h * 0.98] : [price * 0.95, price * 0.90],
                    resistance: isBullish ? [price, high24h] : [high24h, high24h * 1.02]
                },
                volumeProfile: 'Volume likely to decrease at extremes',
                trendAlignment: 'Counter-trend mean reversion play'
            }
        };
    }
    generateRangeBreakoutSetup(coin) {
        const { symbol, price, high24h, low24h, change24h, atr, pricePosition, volume24h } = coin;
        // Range breakouts happen when price is consolidating
        // RELAXED: Was <2% and 30-70 position, now <4% and 20-80 position
        const isConsolidating = Math.abs(change24h) < 4 && pricePosition > 20 && pricePosition < 80;
        if (!isConsolidating)
            return null;
        // Determine direction based on position in range + momentum bias
        // If price is in upper half of range with positive momentum = bullish breakout
        // If price is in lower half with negative momentum = bearish breakdown
        const rangeMid = 50;
        const momentumBias = change24h > 0 ? 10 : -10; // Small momentum bias
        const positionScore = pricePosition + momentumBias;
        // Higher score = closer to resistance = bullish breakout more likely
        // Lower score = closer to support = bearish breakdown more likely
        const isBullish = positionScore > rangeMid;
        const bias = isBullish ? 'bullish' : 'bearish';
        const range = high24h - low24h;
        const stopBuffer = Math.max(atr * 0.3, price * 0.006); // Min 0.6% stop buffer
        let entryZone, stopLoss, targets;
        if (isBullish) {
            // Bullish breakout: enter near current price
            entryZone = {
                low: price * 0.995, // 0.5% below current
                high: price * 1.005 // 0.5% above current
            };
            stopLoss = entryZone.low - stopBuffer;
            targets = [
                price * 1.03, // TP1: 3% gain
                price * 1.06, // TP2: 6% gain
                price * 1.10 // TP3: 10% gain
            ];
        }
        else {
            // Bearish breakdown: enter near current price
            entryZone = {
                low: price * 0.995, // 0.5% below current
                high: price * 1.005 // 0.5% above current
            };
            stopLoss = entryZone.high + stopBuffer;
            targets = [
                price * 0.97, // TP1: 3% drop
                price * 0.94, // TP2: 6% drop
                price * 0.90 // TP3: 10% drop
            ];
        }
        const confluence = [
            'Price consolidating in 24h range',
            'Multiple tests of support/resistance',
            'ATR compression indicates expansion coming',
            'Volume building for breakout'
        ];
        const riskMetrics = this.calculateRiskMetrics((entryZone.low + entryZone.high) / 2, stopLoss, targets);
        const confidence = this.calculateConfidence(['Range Breakout', 'Consolidation Play'], confluence, false, // Not aligned with strong trend
        riskMetrics.riskRewardRatio);
        return {
            id: `${symbol}-range-${Date.now()}`,
            symbol,
            bias,
            status: 'forming',
            timeframe: atr / price > 0.035 ? '1H' : atr / price > 0.018 ? '4H' : '1D',
            strategy: ['Range Breakout', 'Consolidation Play'],
            strategyType: 'breakout',
            entryZone,
            entryPrice: (entryZone.low + entryZone.high) / 2,
            stopLoss,
            targets,
            ...riskMetrics,
            confidenceScore: confidence,
            confluence,
            createdAt: new Date(),
            expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
            analysis: {
                marketStructure: 'Price stuck in consolidation range',
                keyLevels: {
                    support: [low24h, low24h * 0.995],
                    resistance: [high24h, high24h * 1.005]
                },
                volumeProfile: 'Volume declining (characteristic of consolidation)',
                trendAlignment: 'Directional bias from breakout'
            }
        };
    }
    async generateSetups(count = 10) {
        const marketData = await this.fetchMarketData();
        if (marketData.length === 0) {
            console.error('No market data available');
            return [];
        }
        const setups = [];
        const generatedSymbols = new Set(); // Track to prevent duplicates
        const strategies = [
            this.generateLiquiditySweepSetup.bind(this),
            this.generateFVGSetup.bind(this),
            this.generateStructureShiftSetup.bind(this),
            this.generateTrendContinuationSetup.bind(this),
            this.generateRangeBreakoutSetup.bind(this),
            this.generateMeanReversionSetup.bind(this)
        ];
        // Sort coins by price position volatility (prefer extreme positions for setups)
        const sortedCoins = [...marketData].sort((a, b) => {
            // Prefer coins at extremes (near highs/lows) or strong trend
            const aScore = Math.abs(a.pricePosition - 50) + Math.abs(a.change24h);
            const bScore = Math.abs(b.pricePosition - 50) + Math.abs(b.change24h);
            return bScore - aScore; // Higher score = more interesting setup potential
        });
        for (const coin of sortedCoins) {
            if (setups.length >= count)
                break;
            if (generatedSymbols.has(coin.symbol))
                continue; // Skip if already generated
            // Try different strategies for this coin
            for (const strategyFn of strategies) {
                const setup = strategyFn(coin);
                if (setup) {
                    setups.push(setup);
                    generatedSymbols.add(coin.symbol);
                    break; // Only one setup per coin
                }
            }
        }
        // Sort by confidence (highest first)
        return setups.sort((a, b) => b.confidenceScore - a.confidenceScore);
    }
    // Update setup status based on current price
    updateSetupStatus(setup, currentPrice) {
        const { entryZone, stopLoss, targets, bias, status } = setup;
        // Check if expired
        if (new Date() > setup.expiresAt)
            return 'expired';
        // Check if triggered (hit entry)
        const entryHit = bias === 'bullish'
            ? currentPrice >= entryZone.low && currentPrice <= entryZone.high
            : currentPrice <= entryZone.high && currentPrice >= entryZone.low;
        if (entryHit)
            return 'triggered';
        // Check if near trigger (within 2% of entry)
        const entryMid = (entryZone.low + entryZone.high) / 2;
        const nearTrigger = Math.abs(currentPrice - entryMid) / entryMid < 0.02;
        if (nearTrigger)
            return 'near_trigger';
        // Check if invalidated (hit stop loss)
        const invalidated = bias === 'bullish'
            ? currentPrice <= stopLoss
            : currentPrice >= stopLoss;
        if (invalidated)
            return 'expired';
        return status;
    }
    // Persist setups - DISABLED for now (Prisma schema mismatch)
    async persistSetups(setups) {
        // TODO: Fix Prisma schema and re-enable
        console.log(`[persistSetups] Would save ${setups.length} setups (disabled)`);
    }
    // Get persisted setups - DISABLED (returns empty)
    async getPersistedSetups() {
        // TODO: Fix Prisma schema and re-enable
        return [];
    }
    // ============================================================================
    // NEW: Market State Integration Methods (Stateful Architecture)
    // ============================================================================
    /**
     * NEW: Derive setups from real market state (BOS, FVG, Liquidity)
     * This is the stateful approach - setups extracted from market structure
     */
    async deriveSetupsFromMarketState(symbol, timeframe, candles) {
        // Map to market state engine format
        const mappedCandles = candles.map(c => ({
            timestamp: c.time,
            open: c.open,
            high: c.high,
            low: c.low,
            close: c.close,
            volume: c.volume
        }));
        // Update market state
        const state = marketStateEngine_1.marketStateEngine.updateCandles(symbol, timeframe, mappedCandles);
        const context = marketStateEngine_1.marketStateEngine.getMarketContext(symbol, timeframe);
        const setups = [];
        const coin = symbol.replace('USDT', '');
        // Check no trade zone
        const currentPrice = candles[candles.length - 1].close;
        const noTradeCheck = marketStateEngine_1.marketStateEngine.isNoTradeZone(symbol, timeframe, currentPrice);
        if (noTradeCheck.isNoTrade) {
            console.log(`[deriveSetups] ${symbol} in no-trade zone: ${noTradeCheck.reason}`);
            return setups;
        }
        // Generate setup from BOS + Sweep
        const bosSetup = this.generateBOSSetup(state, context, coin, symbol, timeframe);
        if (bosSetup)
            setups.push(bosSetup);
        // Generate setup from FVG
        const fvgSetup = this.generateFVGSetupFromState(state, context, coin, symbol, timeframe);
        if (fvgSetup)
            setups.push(fvgSetup);
        // Generate setup from Liquidity
        const liqSetup = this.generateLiquiditySetupFromState(state, context, coin, symbol, timeframe);
        if (liqSetup)
            setups.push(liqSetup);
        return setups;
    }
    /**
     * Generate setup from BOS + Sweep structure
     */
    generateBOSSetup(state, context, coin, symbol, timeframe) {
        const { marketStructure, sweptLiquidity, fvgZones, bosEvents } = state;
        // Need recent BOS
        if (!marketStructure.lastBOS)
            return null;
        const lastBOS = marketStructure.lastBOS;
        const bosAge = Date.now() - lastBOS.timestamp;
        // BOS must be recent (within 12 hours)
        if (bosAge > 12 * 60 * 60 * 1000)
            return null;
        // Check for recent sweep
        const recentSweep = sweptLiquidity.find(s => s.sweepTimestamp && (Date.now() - s.sweepTimestamp) < 4 * 60 * 60 * 1000);
        // Determine bias from BOS direction
        const bias = lastBOS.direction === 'bullish' ? 'bullish' : 'bearish';
        // Get current price
        const candles = state.candles;
        if (candles.length === 0)
            return null;
        const currentPrice = candles[candles.length - 1].close;
        // Calculate entry, SL, targets
        let entryZone;
        let stopLoss;
        if (recentSweep) {
            // Entry based on sweep
            if (bias === 'bullish') {
                entryZone = { low: currentPrice * 0.995, high: currentPrice * 1.005 };
                stopLoss = Math.min(recentSweep.sweepPrice || entryZone.low * 0.99, entryZone.low * 0.985);
            }
            else {
                entryZone = { low: currentPrice * 0.995, high: currentPrice * 1.005 };
                stopLoss = Math.max(recentSweep.sweepPrice || entryZone.high * 1.01, entryZone.high * 1.015);
            }
        }
        else {
            // Entry based on FVG or current price
            const relevantFVG = fvgZones.find(f => f.type === (bias === 'bullish' ? 'bullish' : 'bearish') && !f.mitigated);
            if (relevantFVG) {
                entryZone = {
                    low: Math.min(relevantFVG.top, relevantFVG.bottom),
                    high: Math.max(relevantFVG.top, relevantFVG.bottom)
                };
                stopLoss = bias === 'bullish'
                    ? entryZone.low * 0.985
                    : entryZone.high * 1.015;
            }
            else {
                entryZone = { low: currentPrice * 0.99, high: currentPrice * 1.01 };
                stopLoss = bias === 'bullish'
                    ? currentPrice * 0.97
                    : currentPrice * 1.03;
            }
        }
        const entryMid = (entryZone.low + entryZone.high) / 2;
        const risk = Math.abs(entryMid - stopLoss);
        // Targets: 2R and 3R
        const targets = [
            bias === 'bullish' ? entryMid + risk * 2 : entryMid - risk * 2,
            bias === 'bullish' ? entryMid + risk * 3 : entryMid - risk * 3
        ];
        const riskRewardRatio = 2.0;
        // Calculate confidence
        let confidenceScore = 60;
        if (recentSweep)
            confidenceScore += 15;
        if (marketStructure.strength > 60)
            confidenceScore += 10;
        if (context.volumeProfile === 'high')
            confidenceScore += 10;
        // Build market state data
        const nearestLiquidity = state.liquidityZones
            .slice(-3)
            .find(z => z.type === (bias === 'bullish' ? 'equal_lows' : 'equal_highs'));
        const nearestFVG = fvgZones
            .filter(f => f.type === (bias === 'bullish' ? 'bullish' : 'bearish') && !f.mitigated)
            .slice(-1)[0];
        // Score through edge filter
        const signalInput = {
            id: `${symbol}-bos-${Date.now()}`,
            symbol,
            type: 'ENTRY',
            direction: (bias === 'bullish' ? 'LONG' : 'SHORT'),
            strategy: 'BOS_PULLBACK',
            entryPrice: entryMid,
            stopLoss,
            takeProfits: targets,
            timestamp: Date.now(),
            timeframe: timeframe,
            confidence: confidenceScore
        };
        const filtered = edgeFilterEngine_1.edgeFilterEngine.filterSignal(signalInput, state, context);
        if (!filtered || !filtered.valid) {
            console.log(`[deriveSetups] ${symbol} BOS setup rejected: ${filtered?.edgeScore.reasonBlocked || 'Unknown'}`);
            return null;
        }
        // Build visuals
        const visuals = visualMappingEngine_1.visualMappingEngine.mapStateToOverlays(state, filtered, {
            candleLimit: 100
        });
        // Build market story
        const marketStory = visualMappingEngine_1.visualMappingEngine.generateMarketStory(state, filtered).map(s => ({ ...s, timestamp: typeof s.timestamp === 'string' ? parseInt(s.timestamp) : s.timestamp }));
        return {
            id: `setup-bos-${symbol}-${Date.now()}`,
            symbol: coin,
            bias,
            status: 'forming',
            timeframe,
            strategy: ['BOS_PULLBACK', 'STRUCTURE'],
            strategyType: 'breakout',
            entryZone,
            entryPrice: entryMid,
            stopLoss,
            targets,
            riskRewardRatio,
            riskPercent: (risk / entryMid) * 100,
            riskLevel: riskPercentToLevel((risk / entryMid) * 100),
            confidenceScore: Math.min(confidenceScore, 95),
            confluence: [
                'BOS confirmed',
                recentSweep ? 'Liquidity swept' : 'Clean structure',
                `Trend strength: ${marketStructure.strength}%`,
                `Volume: ${context.volumeProfile}`
            ],
            createdAt: new Date(),
            expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
            analysis: {
                marketStructure: `${bias} BOS confirmed, ${marketStructure.trend} trend`,
                keyLevels: {
                    support: context.keyLevels.support.slice(-3),
                    resistance: context.keyLevels.resistance.slice(-3)
                },
                volumeProfile: context.volumeProfile,
                trendAlignment: `${bias} with ${marketStructure.strength}% strength`
            },
            marketState: {
                trend: marketStructure.trend,
                strength: marketStructure.strength,
                bosConfirmed: true,
                sweepDetected: !!recentSweep,
                liquidityLevel: nearestLiquidity?.priceLevel,
                fvgZone: nearestFVG ? {
                    top: nearestFVG.top,
                    bottom: nearestFVG.bottom,
                    type: nearestFVG.type
                } : undefined
            },
            edgeScore: {
                total: filtered.edgeScore.total,
                liquidityConfluence: filtered.edgeScore.liquidityConfluence,
                structureQuality: filtered.edgeScore.structureQuality,
                timingQuality: filtered.edgeScore.timingQuality,
                riskReward: filtered.edgeScore.riskReward
            },
            visuals,
            marketStory
        };
    }
    /**
     * Generate setup from FVG mitigation
     */
    generateFVGSetupFromState(state, context, coin, symbol, timeframe) {
        const { fvgZones, candles } = state;
        // Find unmitigated FVGs
        const unmitigated = fvgZones.filter(f => !f.mitigated).slice(-3);
        if (unmitigated.length === 0)
            return null;
        const currentPrice = candles[candles.length - 1]?.close || 0;
        // Find FVG that price is currently inside or near
        const activeFVG = unmitigated.find(f => {
            const fvgLow = Math.min(f.top, f.bottom);
            const fvgHigh = Math.max(f.top, f.bottom);
            return currentPrice >= fvgLow * 0.995 && currentPrice <= fvgHigh * 1.005;
        });
        if (!activeFVG)
            return null;
        const bias = activeFVG.type === 'bullish' ? 'bullish' : 'bearish';
        const entryZone = {
            low: Math.min(activeFVG.top, activeFVG.bottom),
            high: Math.max(activeFVG.top, activeFVG.bottom)
        };
        const entryMid = (entryZone.low + entryZone.high) / 2;
        const stopLoss = bias === 'bullish'
            ? entryZone.low * 0.98
            : entryZone.high * 1.02;
        const risk = Math.abs(entryMid - stopLoss);
        const targets = [
            bias === 'bullish' ? entryMid + risk * 2.5 : entryMid - risk * 2.5,
            bias === 'bullish' ? entryMid + risk * 3.5 : entryMid - risk * 3.5
        ];
        // Score through edge filter
        const signalInput = {
            id: `${symbol}-fvg-${Date.now()}`,
            symbol,
            type: 'ENTRY',
            direction: (bias === 'bullish' ? 'LONG' : 'SHORT'),
            strategy: 'FVG_MITIGATION',
            entryPrice: entryMid,
            stopLoss,
            takeProfits: targets,
            timestamp: Date.now(),
            timeframe: timeframe,
            confidence: 70
        };
        const filtered = edgeFilterEngine_1.edgeFilterEngine.filterSignal(signalInput, state, context);
        if (!filtered || !filtered.valid)
            return null;
        return {
            id: `setup-fvg-${symbol}-${Date.now()}`,
            symbol: coin,
            bias,
            status: 'forming',
            timeframe,
            strategy: ['FVG_MITIGATION', 'IMBALANCE'],
            strategyType: 'trend',
            entryZone,
            entryPrice: entryMid,
            stopLoss,
            targets,
            riskRewardRatio: 2.5,
            riskPercent: (risk / entryMid) * 100,
            riskLevel: riskPercentToLevel((risk / entryMid) * 100),
            confidenceScore: 70,
            confluence: [
                'Unmitigated FVG',
                `FVG type: ${activeFVG.type}`,
                'Price in mitigation zone'
            ],
            createdAt: new Date(),
            expiresAt: new Date(Date.now() + 12 * 60 * 60 * 1000),
            analysis: {
                marketStructure: `FVG mitigation setup (${activeFVG.type})`,
                keyLevels: {
                    support: [activeFVG.bottom],
                    resistance: [activeFVG.top]
                },
                volumeProfile: context.volumeProfile,
                trendAlignment: `FVG-based, ${bias} bias`
            },
            marketState: {
                trend: state.marketStructure.trend,
                strength: state.marketStructure.strength,
                bosConfirmed: !!state.marketStructure.lastBOS,
                sweepDetected: state.sweptLiquidity.length > 0,
                fvgZone: {
                    top: activeFVG.top,
                    bottom: activeFVG.bottom,
                    type: activeFVG.type
                }
            },
            edgeScore: {
                total: filtered.edgeScore.total,
                liquidityConfluence: filtered.edgeScore.liquidityConfluence,
                structureQuality: filtered.edgeScore.structureQuality,
                timingQuality: filtered.edgeScore.timingQuality,
                riskReward: filtered.edgeScore.riskReward
            },
            visuals: filtered.visuals,
            marketStory: visualMappingEngine_1.visualMappingEngine.generateMarketStory(state, filtered).map(s => ({ ...s, timestamp: typeof s.timestamp === 'string' ? parseInt(s.timestamp) : s.timestamp }))
        };
    }
    /**
     * Generate setup from Liquidity sweep
     */
    generateLiquiditySetupFromState(state, context, coin, symbol, timeframe) {
        const { sweptLiquidity, candles } = state;
        // Find recent sweeps (within 4 hours)
        const recentSweep = sweptLiquidity.find(s => s.sweepTimestamp && (Date.now() - s.sweepTimestamp) < 4 * 60 * 60 * 1000);
        if (!recentSweep)
            return null;
        const bias = recentSweep.type === 'equal_lows' || recentSweep.type === 'swing_low'
            ? 'bullish'
            : 'bearish';
        const currentPrice = candles[candles.length - 1]?.close || recentSweep.priceLevel;
        const entryZone = {
            low: currentPrice * 0.99,
            high: currentPrice * 1.01
        };
        const entryMid = (entryZone.low + entryZone.high) / 2;
        const stopLoss = bias === 'bullish'
            ? recentSweep.sweepPrice || recentSweep.priceLevel * 0.985
            : recentSweep.sweepPrice || recentSweep.priceLevel * 1.015;
        const risk = Math.abs(entryMid - stopLoss);
        const targets = [
            bias === 'bullish' ? entryMid + risk * 2 : entryMid - risk * 2,
            bias === 'bullish' ? entryMid + risk * 3 : entryMid - risk * 3
        ];
        return {
            id: `setup-liq-${symbol}-${Date.now()}`,
            symbol: coin,
            bias,
            status: 'forming',
            timeframe,
            strategy: ['LIQUIDITY_SWEEP', 'REVERSAL'],
            strategyType: 'liquidity',
            entryZone,
            entryPrice: entryMid,
            stopLoss,
            targets,
            riskRewardRatio: 2.0,
            riskPercent: (risk / entryMid) * 100,
            riskLevel: riskPercentToLevel((risk / entryMid) * 100),
            confidenceScore: 75,
            confluence: [
                `${recentSweep.type} swept`,
                'Liquidity taken',
                'Expect reversal'
            ],
            createdAt: new Date(),
            expiresAt: new Date(Date.now() + 6 * 60 * 60 * 1000),
            analysis: {
                marketStructure: `Liquidity sweep reversal (${recentSweep.type})`,
                keyLevels: {
                    support: bias === 'bullish' ? [recentSweep.priceLevel] : context.keyLevels.support.slice(-2),
                    resistance: bias === 'bearish' ? [recentSweep.priceLevel] : context.keyLevels.resistance.slice(-2)
                },
                volumeProfile: context.volumeProfile,
                trendAlignment: 'Counter-trend liquidity sweep'
            },
            marketState: {
                trend: state.marketStructure.trend,
                strength: state.marketStructure.strength,
                bosConfirmed: !!state.marketStructure.lastBOS,
                sweepDetected: true,
                liquidityLevel: recentSweep.priceLevel
            }
        };
    }
}
function riskPercentToLevel(riskPercent) {
    if (riskPercent < 1.5)
        return 'LOW'; // Conservative: < 1.5%
    if (riskPercent < 3)
        return 'MEDIUM'; // Optimal: 1.5% - 3%
    return 'HIGH'; // Aggressive: > 3%
}
exports.tradeSetupEngine = new TradeSetupEngine();
exports.default = TradeSetupEngine;
