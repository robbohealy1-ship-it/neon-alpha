"use strict";
/**
 * Edge Filter Engine - Signal Quality & Expectancy Control Layer
 *
 * Sits between marketState → signalEngine → output
 *
 * Does NOT generate signals.
 * Does: kill weak signals, upgrade strong ones, enforce consistency
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.edgeFilterEngine = void 0;
class EdgeFilterEngine {
    constructor() {
        this.config = {
            minLiquidityConfluence: 30, // At least 30 points from liquidity
            minStructureQuality: 30, // At least 30 points from structure
            minTimingQuality: 40, // At least 40 points from timing
            minRiskReward: 2.5, // Minimum 2.5:1 R:R
            maxChopIndex: 70, // No trades in chop > 70
            minVolumeProfile: 'normal' // At least normal volume
        };
    }
    /**
     * Score and filter a signal
     * Returns null if signal should be rejected
     */
    filterSignal(signal, state, context) {
        // Calculate all scores
        const liquidityScore = this.scoreLiquidityConfluence(signal, state);
        const structureScore = this.scoreStructureQuality(signal, state);
        let timingScore = this.scoreTimingQuality(signal, context);
        const riskRewardScore = this.scoreRiskReward(signal);
        // Total edge score (weighted average)
        const totalScore = Math.round((liquidityScore * 0.25) +
            (structureScore * 0.30) +
            (timingScore * 0.25) +
            (riskRewardScore * 0.20));
        const edgeScore = {
            total: totalScore,
            liquidityConfluence: liquidityScore,
            structureQuality: structureScore,
            timingQuality: timingScore,
            riskReward: riskRewardScore,
            passed: true
        };
        // Check filters
        let reasonBlocked;
        // 1. Liquidity Confluence Filter
        if (liquidityScore < this.config.minLiquidityConfluence) {
            reasonBlocked = `Insufficient liquidity confluence (${liquidityScore}/${this.config.minLiquidityConfluence})`;
            edgeScore.passed = false;
        }
        // 2. Structure Quality Filter
        if (structureScore < this.config.minStructureQuality) {
            reasonBlocked = reasonBlocked || `Weak structure quality (${structureScore}/${this.config.minStructureQuality})`;
            edgeScore.passed = false;
        }
        // 3. Timing Filter - Chop conditions
        if (context.chopIndex > this.config.maxChopIndex) {
            reasonBlocked = reasonBlocked || `Chop conditions (index: ${context.chopIndex.toFixed(0)})`;
            edgeScore.passed = false;
            timingScore = 0;
        }
        // 4. Timing Filter - Low volume
        if (context.volumeProfile === 'low' && this.config.minVolumeProfile !== 'low') {
            reasonBlocked = reasonBlocked || `Low volume regime`;
            edgeScore.passed = false;
            timingScore = Math.max(0, timingScore - 30);
        }
        // 5. Risk-Reward Filter
        const rr = this.calculateRR(signal);
        if (rr < this.config.minRiskReward) {
            reasonBlocked = reasonBlocked || `R:R below ${this.config.minRiskReward}:1 (${rr.toFixed(1)}:1)`;
            edgeScore.passed = false;
        }
        // 6. No Trade Zone Filter
        const noTrade = this.checkNoTradeZone(signal, state, context);
        if (noTrade.isNoTrade) {
            reasonBlocked = reasonBlocked || noTrade.reason;
            edgeScore.passed = false;
        }
        // 7. Trend Alignment Check
        const trendAligned = this.checkTrendAlignment(signal, state);
        if (!trendAligned) {
            // Don't block, but reduce score
            edgeScore.total = Math.round(edgeScore.total * 0.7);
        }
        // Recalculate if failed
        if (reasonBlocked) {
            edgeScore.reasonBlocked = reasonBlocked;
        }
        // Build structure context
        const sweepDetected = this.detectSweep(signal, state);
        const bosConfirmed = this.detectBOSConfirmation(signal, state);
        const fvgZone = this.findNearestFVG(signal, state);
        const liquidityLevel = this.findNearestLiquidity(signal, state);
        // Build visuals
        const visuals = this.buildVisuals(signal, state, sweepDetected, bosConfirmed);
        return {
            ...signal,
            edgeScore,
            valid: edgeScore.passed,
            marketContext: context,
            structureContext: {
                sweepDetected,
                bosConfirmed,
                fvgZone: fvgZone || undefined,
                liquidityLevel,
                trendAlignment: trendAligned
            },
            visuals
        };
    }
    /**
     * 1. Liquidity Confluence Score
     * +30 if sweep occurred
     * +20 if near HTF liquidity zone
     * +20 if equal highs/lows present
     */
    scoreLiquidityConfluence(signal, state) {
        let score = 0;
        const { liquidityZones, sweptLiquidity } = state;
        // Check for swept liquidity (strong signal)
        const recentSweeps = sweptLiquidity.filter(s => s.sweepTimestamp && s.sweepTimestamp > signal.timestamp - 24 * 60 * 60 * 1000);
        if (recentSweeps.length > 0) {
            // Check if sweep aligns with signal direction
            const relevantSweep = recentSweeps.find(s => {
                if (signal.direction === 'LONG') {
                    return s.type === 'equal_lows' || s.type === 'swing_low';
                }
                else {
                    return s.type === 'equal_highs' || s.type === 'swing_high';
                }
            });
            if (relevantSweep) {
                score += 30; // Sweep occurred
            }
        }
        // Check proximity to liquidity zones
        const entryPrice = signal.entryPrice;
        const relevantZones = liquidityZones.filter(z => {
            if (signal.direction === 'LONG') {
                return z.type === 'equal_lows' || z.type === 'swing_low';
            }
            else {
                return z.type === 'equal_highs' || z.type === 'swing_high';
            }
        });
        for (const zone of relevantZones) {
            const distance = Math.abs(entryPrice - zone.priceLevel) / zone.priceLevel;
            if (distance < 0.005) { // Within 0.5%
                score += 20; // Near HTF liquidity
                break;
            }
            if (distance < 0.01) { // Within 1%
                score += 10; // Close to liquidity
                break;
            }
        }
        // Check for equal highs/lows (strong liquidity)
        const equalLevels = liquidityZones.filter(z => z.type === 'equal_highs' || z.type === 'equal_lows');
        if (equalLevels.length > 0) {
            score += 20; // Equal highs/lows present
        }
        return Math.min(score, 100);
    }
    /**
     * 2. Structure Quality Score
     * +30 if BOS + CHoCH alignment
     * +15 if trend continuation setup
     * +10 if no conflicting structure
     */
    scoreStructureQuality(signal, state) {
        let score = 0;
        const { marketStructure, bosEvents } = state;
        // Check BOS + CHoCH alignment
        const recentBOS = marketStructure.lastBOS;
        const recentCHoCH = marketStructure.lastCHoCH;
        if (recentBOS && recentCHoCH) {
            const bosTime = recentBOS.timestamp;
            const chochTime = recentCHoCH.timestamp;
            // Both within last 20 candles
            const recentTime = Date.now() - 20 * 60 * 60 * 1000; // 20 hours
            if (bosTime > recentTime && chochTime > recentTime) {
                // Check alignment with signal
                if (signal.direction === 'LONG' &&
                    recentBOS.direction === 'bullish' &&
                    recentCHoCH.direction === 'bullish') {
                    score += 30;
                }
                else if (signal.direction === 'SHORT' &&
                    recentBOS.direction === 'bearish' &&
                    recentCHoCH.direction === 'bearish') {
                    score += 30;
                }
            }
        }
        // Trend continuation setup
        if (marketStructure.trend === 'bullish' && signal.direction === 'LONG') {
            score += 15;
        }
        else if (marketStructure.trend === 'bearish' && signal.direction === 'SHORT') {
            score += 15;
        }
        // No conflicting structure (recent opposite BOS)
        const conflictingBOS = bosEvents.find(e => {
            if (signal.direction === 'LONG') {
                return e.direction === 'bearish' && e.timestamp > Date.now() - 6 * 60 * 60 * 1000;
            }
            else {
                return e.direction === 'bullish' && e.timestamp > Date.now() - 6 * 60 * 60 * 1000;
            }
        });
        if (!conflictingBOS) {
            score += 10;
        }
        else {
            score -= 20; // Penalty for conflicting structure
        }
        // Strength bonus
        score += Math.round(marketStructure.strength / 10);
        return Math.max(0, Math.min(score, 100));
    }
    /**
     * 3. Timing Quality Score
     * Reject: no volatility expansion, chop conditions, low volume
     */
    scoreTimingQuality(signal, context) {
        let score = 50; // Base score
        // Volatility check
        if (context.volatility < 0.5) {
            score -= 20; // Low volatility
        }
        else if (context.volatility > 2.0) {
            score += 20; // High volatility (good for setups)
        }
        else {
            score += 10; // Normal volatility
        }
        // Chop check
        if (context.chopIndex > 60) {
            score -= 30; // Chop penalty
        }
        else if (context.chopIndex < 30) {
            score += 20; // Trending bonus
        }
        // Volume check
        if (context.volumeProfile === 'high') {
            score += 20;
        }
        else if (context.volumeProfile === 'normal') {
            score += 10;
        }
        else {
            score -= 20;
        }
        return Math.max(0, Math.min(score, 100));
    }
    /**
     * 4. Risk-Reward Score
     */
    scoreRiskReward(signal) {
        const rr = this.calculateRR(signal);
        if (rr >= 4.0)
            return 100;
        if (rr >= 3.0)
            return 90;
        if (rr >= 2.5)
            return 80;
        if (rr >= 2.0)
            return 60;
        if (rr >= 1.5)
            return 40;
        return Math.max(0, rr * 20);
    }
    calculateRR(signal) {
        const risk = Math.abs(signal.entryPrice - signal.stopLoss);
        const reward = Math.abs(signal.takeProfits[0] - signal.entryPrice);
        if (risk === 0)
            return 0;
        return reward / risk;
    }
    /**
     * 5. No Trade Zone Check
     */
    checkNoTradeZone(signal, state, context) {
        const candles = state.candles;
        if (candles.length < 20) {
            return { isNoTrade: true, reason: 'Insufficient data' };
        }
        const currentPrice = candles[candles.length - 1].close;
        // Tight range check
        const range20 = Math.max(...candles.slice(-20).map(c => c.high)) -
            Math.min(...candles.slice(-20).map(c => c.low));
        const priceRange = range20 / currentPrice;
        if (priceRange < 0.01) { // Less than 1% range
            return { isNoTrade: true, reason: 'Inside tight range (<1% structure range)' };
        }
        // Mid-liquidity check
        const midPoint = (Math.max(...candles.slice(-20).map(c => c.high)) +
            Math.min(...candles.slice(-20).map(c => c.low))) / 2;
        const distanceFromMid = Math.abs(currentPrice - midPoint) / currentPrice;
        if (distanceFromMid < 0.003) { // Within 0.3% of midpoint
            return { isNoTrade: true, reason: 'Mid-liquidity zone' };
        }
        return { isNoTrade: false };
    }
    /**
     * Trend Alignment Check
     */
    checkTrendAlignment(signal, state) {
        const { marketStructure } = state;
        if (signal.direction === 'LONG') {
            return marketStructure.trend === 'bullish' || marketStructure.trend === 'range';
        }
        else {
            return marketStructure.trend === 'bearish' || marketStructure.trend === 'range';
        }
    }
    /**
     * Detect if liquidity sweep occurred
     */
    detectSweep(signal, state) {
        return state.sweptLiquidity.some(s => {
            if (signal.direction === 'LONG') {
                return s.type === 'equal_lows' || s.type === 'swing_low';
            }
            else {
                return s.type === 'equal_highs' || s.type === 'swing_high';
            }
        });
    }
    /**
     * Detect BOS confirmation
     */
    detectBOSConfirmation(signal, state) {
        const recentBOS = state.marketStructure.lastBOS;
        if (!recentBOS)
            return false;
        // Within last 12 hours
        const isRecent = recentBOS.timestamp > Date.now() - 12 * 60 * 60 * 1000;
        if (signal.direction === 'LONG') {
            return isRecent && recentBOS.direction === 'bullish';
        }
        else {
            return isRecent && recentBOS.direction === 'bearish';
        }
    }
    /**
     * Find nearest FVG zone
     */
    findNearestFVG(signal, state) {
        const relevantFVGs = state.fvgZones.filter(f => {
            if (signal.direction === 'LONG')
                return f.type === 'bullish';
            return f.type === 'bearish';
        });
        if (relevantFVGs.length === 0)
            return null;
        // Return most recent unmitigated FVG
        return relevantFVGs
            .filter(f => !f.mitigated)
            .sort((a, b) => b.timestamp - a.timestamp)[0] || null;
    }
    /**
     * Find nearest liquidity level
     */
    findNearestLiquidity(signal, state) {
        const relevantZones = state.liquidityZones.filter(z => {
            if (signal.direction === 'LONG') {
                return z.type === 'equal_lows' || z.type === 'swing_low';
            }
            else {
                return z.type === 'equal_highs' || z.type === 'swing_high';
            }
        });
        if (relevantZones.length === 0)
            return undefined;
        return relevantZones.sort((a, b) => b.timestamp - a.timestamp)[0]?.priceLevel;
    }
    /**
     * Build visual overlay data for charts
     */
    buildVisuals(signal, state, sweepDetected, bosConfirmed) {
        // Entry/SL/TP lines
        const entryLine = {
            price: signal.entryPrice,
            color: signal.direction === 'LONG' ? '#06b6d4' : '#ef4444' // Cyan for long, red for short
        };
        const stopLossLine = {
            price: signal.stopLoss,
            color: '#ef4444' // Red for SL
        };
        const takeProfitZones = signal.takeProfits.map((tp, i) => ({
            price: tp,
            label: `TP${i + 1}`
        }));
        // Liquidity zones
        const liquidityZones = state.liquidityZones
            .slice(-10)
            .map(z => ({
            top: z.upperBound,
            bottom: z.lowerBound,
            swept: z.swept
        }));
        // FVG zones
        const fvgZones = state.fvgZones
            .filter(f => !f.mitigated)
            .slice(-5)
            .map(f => ({
            top: f.top,
            bottom: f.bottom,
            type: f.type
        }));
        // BOS markers
        const bosMarkers = state.bosEvents
            .slice(-5)
            .map(e => ({
            price: e.price,
            type: e.type,
            direction: e.direction
        }));
        return {
            entryLine,
            stopLossLine,
            takeProfitZones,
            liquidityZones,
            fvgZones,
            bosMarkers
        };
    }
    /**
     * Batch filter multiple signals
     */
    filterSignals(signals, state, context) {
        return signals
            .map(s => this.filterSignal(s, state, context))
            .filter((s) => s !== null);
    }
    /**
     * Update filter configuration
     */
    updateConfig(config) {
        this.config = { ...this.config, ...config };
    }
    /**
     * Get current config
     */
    getConfig() {
        return { ...this.config };
    }
}
// Singleton instance
exports.edgeFilterEngine = new EdgeFilterEngine();
exports.default = exports.edgeFilterEngine;
