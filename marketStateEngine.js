"use strict";
/**
 * Market State Engine - Stateful Market Intelligence Layer
 *
 * Stores per-symbol market structure memory:
 * - OHLCV history
 * - Swing highs/lows
 * - BOS/CHoCH events
 * - Liquidity zones
 * - Swept liquidity events
 * - FVG zones
 * - Order blocks
 * - Trend bias
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.marketStateEngine = void 0;
class MarketStateEngine {
    constructor() {
        this.state = new Map();
        this.maxCandles = 500; // Keep last 500 candles per symbol
    }
    getKey(symbol, timeframe) {
        return `${symbol}:${timeframe}`;
    }
    /**
     * Initialize or get symbol state
     */
    getState(symbol, timeframe) {
        const key = this.getKey(symbol, timeframe);
        if (!this.state.has(key)) {
            const newState = {
                symbol,
                timeframe,
                candles: [],
                swings: [],
                bosEvents: [],
                liquidityZones: [],
                sweptLiquidity: [],
                fvgZones: [],
                orderBlocks: [],
                marketStructure: {
                    trend: 'range',
                    strength: 50,
                    structurePoints: [],
                    bosEvents: []
                },
                lastUpdate: Date.now()
            };
            this.state.set(key, newState);
        }
        return this.state.get(key);
    }
    /**
     * Add new candle and recalculate structure
     */
    addCandle(symbol, timeframe, candle) {
        const state = this.getState(symbol, timeframe);
        // Add candle
        state.candles.push(candle);
        // Trim old candles
        if (state.candles.length > this.maxCandles) {
            state.candles = state.candles.slice(-this.maxCandles);
        }
        // Recalculate structure
        this.detectSwings(state);
        this.detectBOS(state);
        this.detectFVGs(state);
        this.detectOrderBlocks(state);
        this.updateLiquidityZones(state);
        this.updateMarketStructure(state);
        state.lastUpdate = Date.now();
        return state;
    }
    /**
     * Batch update with multiple candles
     */
    updateCandles(symbol, timeframe, candles) {
        const state = this.getState(symbol, timeframe);
        state.candles = candles.slice(-this.maxCandles);
        // Full recalculation
        this.detectSwings(state);
        this.detectBOS(state);
        this.detectFVGs(state);
        this.detectOrderBlocks(state);
        this.updateLiquidityZones(state);
        this.updateMarketStructure(state);
        state.lastUpdate = Date.now();
        return state;
    }
    /**
     * Detect swing highs and lows (pivots)
     */
    detectSwings(state, lookback = 5) {
        const candles = state.candles;
        const swings = [];
        for (let i = lookback; i < candles.length - lookback; i++) {
            const current = candles[i];
            // Check for swing high
            const isSwingHigh = candles.slice(i - lookback, i).every(c => c.high <= current.high) &&
                candles.slice(i + 1, i + lookback + 1).every(c => c.high <= current.high);
            if (isSwingHigh) {
                swings.push({
                    type: 'high',
                    price: current.high,
                    timestamp: current.timestamp,
                    index: i
                });
            }
            // Check for swing low
            const isSwingLow = candles.slice(i - lookback, i).every(c => c.low >= current.low) &&
                candles.slice(i + 1, i + lookback + 1).every(c => c.low >= current.low);
            if (isSwingLow) {
                swings.push({
                    type: 'low',
                    price: current.low,
                    timestamp: current.timestamp,
                    index: i
                });
            }
        }
        state.swings = swings;
    }
    /**
     * Detect BOS (Break of Structure) and CHoCH (Change of Character)
     */
    detectBOS(state) {
        const { candles, swings } = state;
        if (swings.length < 3)
            return;
        const bosEvents = [];
        for (let i = 2; i < swings.length; i++) {
            const current = swings[i];
            const prev = swings[i - 1];
            const prevPrev = swings[i - 2];
            // BOS Bullish: Price breaks above previous swing high in uptrend
            if (current.type === 'high' && prev.type === 'low' && prevPrev.type === 'high') {
                const lastClose = candles[candles.length - 1]?.close || current.price;
                if (lastClose > prevPrev.price) {
                    bosEvents.push({
                        type: 'BOS',
                        direction: 'bullish',
                        price: prevPrev.price,
                        timestamp: candles[candles.length - 1]?.timestamp || current.timestamp,
                        index: candles.length - 1,
                        swingOrigin: prevPrev
                    });
                }
            }
            // BOS Bearish: Price breaks below previous swing low in downtrend
            if (current.type === 'low' && prev.type === 'high' && prevPrev.type === 'low') {
                const lastClose = candles[candles.length - 1]?.close || current.price;
                if (lastClose < prevPrev.price) {
                    bosEvents.push({
                        type: 'BOS',
                        direction: 'bearish',
                        price: prevPrev.price,
                        timestamp: candles[candles.length - 1]?.timestamp || current.timestamp,
                        index: candles.length - 1,
                        swingOrigin: prevPrev
                    });
                }
            }
            // CHoCH Bullish: In downtrend, price breaks above last lower high
            if (current.type === 'high' && prev.type === 'low' &&
                prev.price < swings[i - 2]?.price && // Lower low
                current.price > swings[i - 2]?.price) { // Breaks above
                bosEvents.push({
                    type: 'CHoCH',
                    direction: 'bullish',
                    price: current.price,
                    timestamp: current.timestamp,
                    index: current.index,
                    swingOrigin: prev
                });
            }
            // CHoCH Bearish: In uptrend, price breaks below last higher low
            if (current.type === 'low' && prev.type === 'high' &&
                prev.price > swings[i - 2]?.price && // Higher high
                current.price < swings[i - 2]?.price) { // Breaks below
                bosEvents.push({
                    type: 'CHoCH',
                    direction: 'bearish',
                    price: current.price,
                    timestamp: current.timestamp,
                    index: current.index,
                    swingOrigin: prev
                });
            }
        }
        state.bosEvents = bosEvents;
        // Update last BOS/CHoCH in market structure
        if (bosEvents.length > 0) {
            const last = bosEvents[bosEvents.length - 1];
            if (last.type === 'BOS') {
                state.marketStructure.lastBOS = last;
            }
            else {
                state.marketStructure.lastCHoCH = last;
            }
        }
    }
    /**
     * Detect Fair Value Gaps (FVGs)
     */
    detectFVGs(state) {
        const candles = state.candles;
        const fvgs = [];
        for (let i = 2; i < candles.length; i++) {
            const current = candles[i];
            const twoBack = candles[i - 2];
            // Bullish FVG: Current low > two candles ago high
            if (current.low > twoBack.high) {
                fvgs.push({
                    id: `fvg-bull-${i}`,
                    type: 'bullish',
                    top: current.low,
                    bottom: twoBack.high,
                    timestamp: candles[i - 1].timestamp,
                    mitigated: current.close < twoBack.high
                });
            }
            // Bearish FVG: Current high < two candles ago low
            if (current.high < twoBack.low) {
                fvgs.push({
                    id: `fvg-bear-${i}`,
                    type: 'bearish',
                    top: twoBack.low,
                    bottom: current.high,
                    timestamp: candles[i - 1].timestamp,
                    mitigated: current.close > twoBack.low
                });
            }
        }
        state.fvgZones = fvgs.slice(-20); // Keep last 20 FVGs
    }
    /**
     * Detect Order Blocks (last opposite candle before strong move)
     */
    detectOrderBlocks(state) {
        const candles = state.candles;
        const obs = [];
        for (let i = 3; i < candles.length; i++) {
            const current = candles[i];
            const prev = candles[i - 1];
            const prevPrev = candles[i - 2];
            // Bullish OB: Bearish candle before strong bullish move
            if (prev.close < prev.open && // Bearish candle
                current.close > current.open && // Bullish candle
                current.close > prevPrev.high) { // Strong break
                obs.push({
                    id: `ob-bull-${i}`,
                    type: 'bullish',
                    open: prev.open,
                    high: prev.high,
                    low: prev.low,
                    close: prev.close,
                    timestamp: prev.timestamp,
                    volume: prev.volume,
                    mitigated: false
                });
            }
            // Bearish OB: Bullish candle before strong bearish move
            if (prev.close > prev.open && // Bullish candle
                current.close < current.open && // Bearish candle
                current.close < prevPrev.low) { // Strong break
                obs.push({
                    id: `ob-bear-${i}`,
                    type: 'bearish',
                    open: prev.open,
                    high: prev.high,
                    low: prev.low,
                    close: prev.close,
                    timestamp: prev.timestamp,
                    volume: prev.volume,
                    mitigated: false
                });
            }
        }
        state.orderBlocks = obs.slice(-20); // Keep last 20 OBs
    }
    /**
     * Update liquidity zones (equal highs/lows, swing points)
     */
    updateLiquidityZones(state) {
        const { swings, candles } = state;
        const zones = [];
        // Group swings by price proximity (within 0.5%)
        const processed = new Set();
        for (let i = 0; i < swings.length; i++) {
            if (processed.has(i))
                continue;
            const swing = swings[i];
            const similar = [swing];
            for (let j = i + 1; j < swings.length; j++) {
                if (processed.has(j))
                    continue;
                const other = swings[j];
                // Check if within 0.5%
                const diff = Math.abs(swing.price - other.price) / swing.price;
                if (diff < 0.005 && swing.type === other.type) {
                    similar.push(other);
                    processed.add(j);
                }
            }
            if (similar.length >= 2) {
                const avgPrice = similar.reduce((sum, s) => sum + s.price, 0) / similar.length;
                const isSwept = candles.some(c => swing.type === 'high' ? c.high > avgPrice : c.low < avgPrice);
                zones.push({
                    id: `liq-${swing.type}-${i}`,
                    type: swing.type === 'high' ? 'equal_highs' : 'equal_lows',
                    priceLevel: avgPrice,
                    upperBound: avgPrice * 1.002,
                    lowerBound: avgPrice * 0.998,
                    timestamp: similar[similar.length - 1].timestamp,
                    swept: isSwept,
                    touches: similar.length
                });
            }
            processed.add(i);
        }
        // Add individual swing highs/lows as liquidity
        swings.forEach((swing, i) => {
            if (!processed.has(i)) {
                zones.push({
                    id: `liq-swing-${swing.type}-${i}`,
                    type: swing.type === 'high' ? 'swing_high' : 'swing_low',
                    priceLevel: swing.price,
                    upperBound: swing.price * 1.005,
                    lowerBound: swing.price * 0.995,
                    timestamp: swing.timestamp,
                    swept: false,
                    touches: 1
                });
            }
        });
        state.liquidityZones = zones.slice(-30); // Keep last 30 zones
    }
    /**
     * Update market structure trend and strength
     */
    updateMarketStructure(state) {
        const { swings, bosEvents } = state;
        if (swings.length < 3) {
            state.marketStructure.trend = 'range';
            state.marketStructure.strength = 50;
            return;
        }
        // Count higher highs and lower lows
        let higherHighs = 0;
        let lowerLows = 0;
        let higherLows = 0;
        let lowerHighs = 0;
        for (let i = 2; i < swings.length; i++) {
            if (swings[i].type === 'high') {
                if (swings[i].price > swings[i - 2].price)
                    higherHighs++;
                else
                    lowerHighs++;
            }
            else {
                if (swings[i].price > swings[i - 2].price)
                    higherLows++;
                else
                    lowerLows++;
            }
        }
        // Determine trend
        if (higherHighs > lowerHighs && higherLows > lowerLows) {
            state.marketStructure.trend = 'bullish';
            state.marketStructure.strength = Math.min(50 + (higherHighs - lowerHighs) * 10, 95);
        }
        else if (lowerLows > higherLows && lowerHighs > higherHighs) {
            state.marketStructure.trend = 'bearish';
            state.marketStructure.strength = Math.min(50 + (lowerLows - higherLows) * 10, 95);
        }
        else {
            state.marketStructure.trend = 'range';
            state.marketStructure.strength = 50;
        }
        state.marketStructure.structurePoints = swings.slice(-10);
    }
    /**
     * Get market context for a symbol
     */
    getMarketContext(symbol, timeframe) {
        const state = this.getState(symbol, timeframe);
        const candles = state.candles;
        if (candles.length < 20) {
            return {
                volatility: 0,
                volumeProfile: 'normal',
                chopIndex: 50,
                directionalBias: 'neutral',
                keyLevels: { support: [], resistance: [] }
            };
        }
        // Calculate ATR for volatility
        const atr = this.calculateATR(candles, 14);
        const price = candles[candles.length - 1].close;
        const volatility = (atr / price) * 100;
        // Volume profile
        const avgVolume = candles.slice(-20).reduce((sum, c) => sum + c.volume, 0) / 20;
        const recentVolume = candles.slice(-5).reduce((sum, c) => sum + c.volume, 0) / 5;
        const volumeProfile = recentVolume > avgVolume * 1.5 ? 'high' :
            recentVolume < avgVolume * 0.5 ? 'low' : 'normal';
        // Chop index (ADX simplified)
        const chopIndex = Math.min(Math.max(100 - (volatility * 10), 0), 100);
        // Directional bias
        const directionalBias = state.marketStructure.trend === 'bullish' ? 'bullish' :
            state.marketStructure.trend === 'bearish' ? 'bearish' : 'neutral';
        // Key levels from liquidity zones
        const supports = state.liquidityZones
            .filter(z => z.type === 'equal_lows' || z.type === 'swing_low')
            .slice(-3)
            .map(z => z.priceLevel);
        const resistances = state.liquidityZones
            .filter(z => z.type === 'equal_highs' || z.type === 'swing_high')
            .slice(-3)
            .map(z => z.priceLevel);
        return {
            volatility,
            volumeProfile,
            chopIndex,
            directionalBias,
            keyLevels: {
                support: supports,
                resistance: resistances
            }
        };
    }
    calculateATR(candles, period) {
        if (candles.length < period)
            return 0;
        const trValues = [];
        for (let i = 1; i < candles.length && i <= period; i++) {
            const current = candles[candles.length - i];
            const prev = candles[candles.length - i - 1];
            const tr1 = current.high - current.low;
            const tr2 = Math.abs(current.high - prev.close);
            const tr3 = Math.abs(current.low - prev.close);
            trValues.push(Math.max(tr1, tr2, tr3));
        }
        return trValues.reduce((sum, tr) => sum + tr, 0) / trValues.length;
    }
    /**
     * Mark liquidity as swept
     */
    markLiquiditySwept(symbol, timeframe, zoneId, sweepPrice) {
        const state = this.getState(symbol, timeframe);
        const zone = state.liquidityZones.find(z => z.id === zoneId);
        if (zone && !zone.swept) {
            zone.swept = true;
            zone.sweepTimestamp = Date.now();
            zone.sweepPrice = sweepPrice;
            state.sweptLiquidity.push(zone);
        }
    }
    /**
     * Check if price is in no-trade zone
     */
    isNoTradeZone(symbol, timeframe, price) {
        const state = this.getState(symbol, timeframe);
        const context = this.getMarketContext(symbol, timeframe);
        // Check chop conditions
        if (context.chopIndex > 70) {
            return { isNoTrade: true, reason: 'Chop conditions detected' };
        }
        // Check tight range
        if (state.candles.length >= 20) {
            const range20 = Math.max(...state.candles.slice(-20).map(c => c.high)) -
                Math.min(...state.candles.slice(-20).map(c => c.low));
            const priceRange = range20 / price;
            if (priceRange < 0.01) { // Less than 1% range
                return { isNoTrade: true, reason: 'Inside tight range (<1% structure range)' };
            }
        }
        // Check liquidity proximity (mid-liquidity zone)
        for (const zone of state.liquidityZones) {
            const proximity = Math.abs(price - zone.priceLevel) / zone.priceLevel;
            if (proximity < 0.002) { // Within 0.2%
                return {
                    isNoTrade: true,
                    reason: 'In liquidity zone - wait for sweep',
                    liquidityProximity: proximity
                };
            }
        }
        // Check low volume
        if (context.volumeProfile === 'low') {
            return { isNoTrade: true, reason: 'Low volume regime' };
        }
        return { isNoTrade: false };
    }
    /**
     * Get all symbol states (for admin/debug)
     */
    getAllStates() {
        return Array.from(this.state.values());
    }
    /**
     * Clear old data (memory management)
     */
    clearOldData(maxAgeMs = 24 * 60 * 60 * 1000) {
        const now = Date.now();
        for (const [key, state] of this.state.entries()) {
            if (now - state.lastUpdate > maxAgeMs) {
                this.state.delete(key);
            }
        }
    }
}
// Singleton instance
exports.marketStateEngine = new MarketStateEngine();
exports.default = exports.marketStateEngine;
