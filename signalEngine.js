"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.signalEngine = void 0;
const marketDataService_1 = require("./marketDataService");
const client_1 = require("@prisma/client");
const marketStateEngine_1 = require("./marketStateEngine");
const edgeFilterEngine_1 = require("./edgeFilterEngine");
const visualMappingEngine_1 = require("./visualMappingEngine");
const prisma = new client_1.PrismaClient();
// ============================================================================
// PRODUCTION GRADE SIGNAL ENGINE
// ============================================================================
class SignalEngine {
    constructor() {
        // Timeframes for scanning
        this.SIGNAL_TIMEFRAMES = ['5m', '15m', '1h', '4h'];
        this.SETUP_TIMEFRAMES = ['1h', '4h'];
        // Minimum candles required
        this.MIN_CANDLES = 200;
        // Scan intervals (ms)
        this.SIGNAL_INTERVAL = 2 * 60 * 1000; // 2 minutes
        this.SETUP_INTERVAL = 15 * 60 * 1000; // 15 minutes
        // Strategy parameters
        this.EMA_PULLBACK_THRESHOLD = 0.002; // 0.2%
        this.VOLUME_SPIKE_THRESHOLD = 1.3; // 1.3x average
        this.LIQUIDITY_WICK_RATIO = 2.0; // 2x body size
        this.RANGE_WIDTH_THRESHOLD = 0.025; // 2.5%
        this.FVG_MIN_SIZE = 0.003; // 0.3%
        // Coins to monitor - Top 100+ Binance USDT pairs
        this.COINS = [
            // Tier 1 - Majors (20)
            'BTCUSDT', 'ETHUSDT', 'BNBUSDT', 'SOLUSDT', 'XRPUSDT',
            'ADAUSDT', 'AVAXUSDT', 'DOGEUSDT', 'DOTUSDT', 'MATICUSDT',
            'LINKUSDT', 'ATOMUSDT', 'LTCUSDT', 'UNIUSDT', 'NEARUSDT',
            'PEPEUSDT', 'TONUSDT', 'SHIBUSDT', 'TRXUSDT', 'BCHUSDT',
            // Tier 2 - Large Caps (25)
            'ETCUSDT', 'ICPUSDT', 'FILUSDT', 'APTUSDT', 'ARBUSDT',
            'OPUSDT', 'IMXUSDT', 'GRTUSDT', 'INJUSDT', 'RNDRUSDT',
            'STXUSDT', 'WIFUSDT', 'FETUSDT', 'BONKUSDT', 'PYTHUSDT',
            'JUPUSDT', 'WLDUSDT', 'STRKUSDT', 'SEIUSDT', 'TIAUSDT',
            'SUIUSDT', 'ORDIUSDT', 'RUNEUSDT', 'BEAMUSDT', 'DYDXUSDT',
            // Tier 3 - Mid Caps (30)
            'AAVEUSDT', 'ALGOUSDT', 'THETAUSDT', 'FTMUSDT', 'SANDUSDT',
            'MANAUSDT', 'AXSUSDT', 'FLOWUSDT', 'KAVAUSDT', 'GMTUSDT',
            'GALAUSDT', 'CHZUSDT', 'COMPUSDT', 'CRVUSDT', 'ENSUSDT',
            'MKRUSDT', 'SNXUSDT', '1INCHUSDT', 'LDOUSDT', 'SSVUSDT',
            'ROSEUSDT', 'ZILUSDT', 'QTUMUSDT', 'KSMUSDT', 'DASHUSDT',
            'ZECUSDT', 'XMRUSDT', 'EGLDUSDT', 'XTZUSDT', 'IOTAUSDT',
            // Tier 4 - Emerging (30)
            'JTOUSDT', 'HNTUSDT', 'BOMEUSDT', 'DYMUSDT', 'PENDLEUSDT',
            'MANTAUSDT', 'PIXELUSDT', 'PORTALUSDT', 'ACEUSDT', 'XAIUSDT',
            'NFPUSDT', 'AIUSDT', 'XVSUSDT', 'REZUSDT', 'NOTUSDT',
            'ZKUSDT', 'IOUSDT', 'ZROUSDT', 'ATHUSDT', 'TNSRUSDT',
            'BBUSDT', 'REIUSDT', 'EDUUSDT', 'HOOKUSDT', 'IDUSDT',
            'MAVUSDT', 'LEVERUSDT', 'CETUSUSDT', 'BLURUSDT', 'CYBERUSDT'
        ];
        // Daily signal cap
        this.DAILY_SIGNAL_CAP = 5;
        this.dailySignalCount = 0;
        this.lastSignalDate = '';
    }
    // ============================================================================
    // INDICATOR CALCULATIONS (NO LIBRARIES)
    // ============================================================================
    /**
     * Calculate EMA (Exponential Moving Average)
     */
    calculateEMA(prices, period) {
        if (prices.length < period)
            return [];
        const multiplier = 2 / (period + 1);
        const ema = [];
        // First EMA is SMA
        let sum = 0;
        for (let i = 0; i < period; i++) {
            sum += prices[i];
        }
        ema.push(sum / period);
        // Calculate remaining EMAs
        for (let i = period; i < prices.length; i++) {
            const currentEMA = (prices[i] - ema[ema.length - 1]) * multiplier + ema[ema.length - 1];
            ema.push(currentEMA);
        }
        return ema;
    }
    /**
     * Calculate RSI (Relative Strength Index)
     * Period: 14
     */
    calculateRSI(prices, period = 14) {
        if (prices.length < period + 1)
            return [];
        const rsi = [];
        let gains = 0;
        let losses = 0;
        // Initial average gain/loss
        for (let i = 1; i <= period; i++) {
            const change = prices[i] - prices[i - 1];
            if (change > 0)
                gains += change;
            else
                losses += Math.abs(change);
        }
        let avgGain = gains / period;
        let avgLoss = losses / period;
        // First RSI
        let rs = avgGain / avgLoss;
        rsi.push(100 - (100 / (1 + rs)));
        // Remaining RSI values
        for (let i = period + 1; i < prices.length; i++) {
            const change = prices[i] - prices[i - 1];
            const gain = change > 0 ? change : 0;
            const loss = change < 0 ? Math.abs(change) : 0;
            avgGain = (avgGain * (period - 1) + gain) / period;
            avgLoss = (avgLoss * (period - 1) + loss) / period;
            rs = avgGain / avgLoss;
            rsi.push(100 - (100 / (1 + rs)));
        }
        return rsi;
    }
    /**
     * Calculate ATR (Average True Range)
     * Period: 14
     */
    calculateATR(candles, period = 14) {
        if (candles.length < period + 1)
            return [];
        const tr = [];
        const atr = [];
        // Calculate True Range for each candle
        for (let i = 1; i < candles.length; i++) {
            const high = candles[i].high;
            const low = candles[i].low;
            const prevClose = candles[i - 1].close;
            const tr1 = high - low;
            const tr2 = Math.abs(high - prevClose);
            const tr3 = Math.abs(low - prevClose);
            tr.push(Math.max(tr1, tr2, tr3));
        }
        // First ATR is average of first period TR values
        let sum = 0;
        for (let i = 0; i < period; i++) {
            sum += tr[i];
        }
        atr.push(sum / period);
        // Remaining ATR values using smoothing
        for (let i = period; i < tr.length; i++) {
            const currentATR = (atr[atr.length - 1] * (period - 1) + tr[i]) / period;
            atr.push(currentATR);
        }
        return atr;
    }
    /**
     * Calculate Volume Average (20 period)
     */
    calculateVolumeAverage(candles, period = 20) {
        if (candles.length < period)
            return 0;
        const recentVolumes = candles.slice(-period).map(c => c.volume);
        return recentVolumes.reduce((sum, vol) => sum + vol, 0) / period;
    }
    /**
     * Detect Swing Highs/Lows (Fractals)
     * Simple fractal: High surrounded by 2 lower highs
     */
    detectSwings(candles, lookback = 2) {
        const highs = [];
        const lows = [];
        for (let i = lookback; i < candles.length - lookback; i++) {
            const current = candles[i];
            // Check for swing high
            let isSwingHigh = true;
            for (let j = 1; j <= lookback; j++) {
                if (candles[i - j].high >= current.high || candles[i + j].high >= current.high) {
                    isSwingHigh = false;
                    break;
                }
            }
            if (isSwingHigh)
                highs.push(current.high);
            // Check for swing low
            let isSwingLow = true;
            for (let j = 1; j <= lookback; j++) {
                if (candles[i - j].low <= current.low || candles[i + j].low <= current.low) {
                    isSwingLow = false;
                    break;
                }
            }
            if (isSwingLow)
                lows.push(current.low);
        }
        return { highs, lows };
    }
    /**
     * Get previous high/low (last 20 candles)
     */
    getPreviousLevels(candles, lookback = 20) {
        const recent = candles.slice(-lookback);
        return {
            high: Math.max(...recent.map(c => c.high)),
            low: Math.min(...recent.map(c => c.low))
        };
    }
    /**
     * Calculate all indicators for a set of candles
     */
    calculateIndicators(candles) {
        if (candles.length < this.MIN_CANDLES) {
            console.log(`[INDICATORS] Insufficient candles: ${candles.length}/${this.MIN_CANDLES}`);
            return null;
        }
        const closes = candles.map(c => c.close);
        const ema50 = this.calculateEMA(closes, 50);
        const ema200 = this.calculateEMA(closes, 200);
        const rsi = this.calculateRSI(closes, 14);
        const atr = this.calculateATR(candles, 14);
        const volumeAvg = this.calculateVolumeAverage(candles, 20);
        const { highs: swingHighs, lows: swingLows } = this.detectSwings(candles);
        const { high: prevHigh, low: prevLow } = this.getPreviousLevels(candles);
        if (ema50.length === 0 || ema200.length === 0 || rsi.length === 0 || atr.length === 0) {
            console.log('[INDICATORS] Failed to calculate indicators');
            return null;
        }
        return {
            ema50,
            ema200,
            rsi,
            atr,
            volumeAvg,
            swingHighs,
            swingLows,
            prevHigh,
            prevLow
        };
    }
    // ============================================================================
    // VALIDATION HELPERS
    // ============================================================================
    /**
     * Validate candle rejection pattern
     */
    validateRejection(candle, direction) {
        const bodySize = Math.abs(candle.close - candle.open);
        const upperWick = candle.high - Math.max(candle.open, candle.close);
        const lowerWick = Math.min(candle.open, candle.close) - candle.low;
        const isBullish = candle.close > candle.open;
        let hasRejection = false;
        let wickSize = 0;
        let wickToBodyRatio = 0;
        if (direction === 'LONG') {
            // For LONG: look for lower wick (rejection of lows)
            wickSize = lowerWick;
            wickToBodyRatio = bodySize > 0 ? lowerWick / bodySize : 0;
            hasRejection = isBullish && lowerWick > bodySize;
        }
        else {
            // For SHORT: look for upper wick (rejection of highs)
            wickSize = upperWick;
            wickToBodyRatio = bodySize > 0 ? upperWick / bodySize : 0;
            hasRejection = !isBullish && upperWick > bodySize;
        }
        return {
            hasRejection,
            wickSize,
            bodySize,
            wickToBodyRatio,
            isBullish
        };
    }
    /**
     * Check if price is within threshold of target
     */
    isNearLevel(price, target, threshold) {
        return Math.abs(price - target) / target <= threshold;
    }
    /**
     * Get higher timeframe trend alignment
     */
    async getHigherTimeframeTrend(symbol, currentTF) {
        try {
            const higherTF = currentTF === '5m' ? '15m' : currentTF === '15m' ? '1h' : '4h';
            const candles = await marketDataService_1.marketDataService.fetchCandles(symbol, higherTF, 200);
            if (candles.length < 200)
                return null;
            const closes = candles.map(c => c.close);
            const ema50 = this.calculateEMA(closes, 50);
            const ema200 = this.calculateEMA(closes, 200);
            if (ema50.length === 0 || ema200.length === 0)
                return null;
            const currentEMA50 = ema50[ema50.length - 1];
            const currentEMA200 = ema200[ema200.length - 1];
            return currentEMA50 > currentEMA200;
        }
        catch (error) {
            console.error(`[HTF TREND] Error fetching ${symbol}:`, error);
            return null;
        }
    }
    // ============================================================================
    // STRATEGY 1: EMA TREND PULLBACK (HIGH PROBABILITY)
    // ============================================================================
    strategy_EMA_Trend_Pullback(symbol, candles, indicators, timeframe) {
        const coin = symbol.replace('USDT', '');
        const currentPrice = candles[candles.length - 1].close;
        const currentCandle = candles[candles.length - 1];
        const currentVolume = currentCandle.volume;
        const currentEMA50 = indicators.ema50[indicators.ema50.length - 1];
        const currentEMA200 = indicators.ema200[indicators.ema200.length - 1];
        const currentRSI = indicators.rsi[indicators.rsi.length - 1];
        const currentATR = indicators.atr[indicators.atr.length - 1];
        const validationLog = [`[EMA PULLBACK ${coin} ${timeframe}]`];
        let passed = true;
        // Condition 1: EMA50 > EMA200 (bullish trend)
        const bullishTrend = currentEMA50 > currentEMA200;
        validationLog.push(`1. Bullish Trend (EMA50>EMA200): ${bullishTrend} (${currentEMA50.toFixed(2)} > ${currentEMA200.toFixed(2)})`);
        if (!bullishTrend)
            passed = false;
        // Condition 2: Price above EMA200
        const priceAboveEMA200 = currentPrice > currentEMA200;
        validationLog.push(`2. Price above EMA200: ${priceAboveEMA200} (${currentPrice.toFixed(2)} > ${currentEMA200.toFixed(2)})`);
        if (!priceAboveEMA200)
            passed = false;
        // Condition 3: Pullback to EMA50 (within 0.2%)
        const pullbackDistance = Math.abs(currentPrice - currentEMA50) / currentEMA50;
        const nearEMA50 = pullbackDistance <= this.EMA_PULLBACK_THRESHOLD;
        validationLog.push(`3. Pullback to EMA50: ${nearEMA50} (dist: ${(pullbackDistance * 100).toFixed(3)}%, threshold: 0.2%)`);
        if (!nearEMA50)
            passed = false;
        // Condition 4: Rejection pattern
        const rejection = this.validateRejection(currentCandle, 'LONG');
        const hasRejection = rejection.hasRejection && rejection.wickToBodyRatio >= 1.0;
        validationLog.push(`4. Rejection Pattern: ${hasRejection} (wick/body: ${rejection.wickToBodyRatio.toFixed(2)}, bullish: ${rejection.isBullish})`);
        if (!hasRejection)
            passed = false;
        // Condition 5: Volume spike (> 1.3x average)
        const volumeSpike = currentVolume > indicators.volumeAvg * this.VOLUME_SPIKE_THRESHOLD;
        validationLog.push(`5. Volume Spike: ${volumeSpike} (${(currentVolume / indicators.volumeAvg).toFixed(2)}x avg)`);
        if (!volumeSpike)
            passed = false;
        // Log validation results
        if (!passed) {
            validationLog.push('❌ REJECTED: Not all conditions met');
            console.log(validationLog.join('\n  '));
            return null;
        }
        // Calculate signal parameters
        const entry = currentPrice;
        const stopLoss = Math.max(indicators.swingLows.length > 0 ? Math.max(...indicators.swingLows.slice(-3)) : entry - currentATR * 1.2, entry - currentATR * 1.2);
        const risk = entry - stopLoss;
        const takeProfit1 = entry + risk; // 1R
        const takeProfit2 = entry + risk * 2; // 2R
        const riskReward = risk > 0 ? (takeProfit1 - entry) / risk : 0;
        // Confidence scoring
        let confidence = 50;
        if (currentVolume > indicators.volumeAvg * 1.5)
            confidence += 10; // Strong volume
        if (currentRSI >= 45 && currentRSI <= 60)
            confidence += 10; // Good RSI zone
        // HTF alignment check (async, skip for now)
        confidence = Math.min(confidence, 95);
        validationLog.push(`✅ SIGNAL GENERATED: Entry=${entry.toFixed(4)}, SL=${stopLoss.toFixed(4)}, TP1=${takeProfit1.toFixed(4)}, RR=${riskReward.toFixed(2)}, Confidence=${confidence}%`);
        console.log(validationLog.join('\n  '));
        return {
            coin,
            symbol,
            direction: 'LONG',
            timeframe,
            strategy: 'EMA_TREND_PULLBACK',
            entry,
            entryMin: entry * 0.998,
            entryMax: entry * 1.002,
            stopLoss,
            takeProfit1,
            takeProfit2,
            riskReward,
            confidence,
            status: 'ACTIVE',
            expiresAt: this.calculateExpiry(timeframe),
            ema50: currentEMA50,
            ema200: currentEMA200,
            rsi: currentRSI,
            atr: currentATR,
            volume: currentVolume,
            volumeAvg: indicators.volumeAvg,
            validationLog
        };
    }
    // ============================================================================
    // STRATEGY 2: LIQUIDITY SWEEP REVERSAL
    // ============================================================================
    strategy_Liquidity_Sweep_Reversal(symbol, candles, indicators, timeframe, direction) {
        const coin = symbol.replace('USDT', '');
        const currentPrice = candles[candles.length - 1].close;
        const currentCandle = candles[candles.length - 1];
        const currentVolume = currentCandle.volume;
        const currentRSI = indicators.rsi[indicators.rsi.length - 1];
        const currentATR = indicators.atr[indicators.atr.length - 1];
        const validationLog = [`[LIQUIDITY SWEEP ${direction} ${coin} ${timeframe}]`];
        let passed = true;
        if (direction === 'SHORT') {
            // SHORT CONDITIONS
            // 1. Price breaks previous high
            const brokeHigh = currentCandle.high > indicators.prevHigh;
            validationLog.push(`1. Breaks Previous High: ${brokeHigh} (${currentCandle.high.toFixed(4)} > ${indicators.prevHigh.toFixed(4)})`);
            if (!brokeHigh)
                passed = false;
            // 2. Closes back below that level
            const closesBelow = currentPrice < indicators.prevHigh;
            validationLog.push(`2. Closes Below High: ${closesBelow} (${currentPrice.toFixed(4)} < ${indicators.prevHigh.toFixed(4)})`);
            if (!closesBelow)
                passed = false;
            // 3. Upper wick >= 2x body size
            const bodySize = Math.abs(currentCandle.close - currentCandle.open);
            const upperWick = currentCandle.high - Math.max(currentCandle.open, currentCandle.close);
            const strongWick = upperWick >= bodySize * this.LIQUIDITY_WICK_RATIO;
            validationLog.push(`3. Strong Upper Wick: ${strongWick} (wick: ${upperWick.toFixed(4)}, body: ${bodySize.toFixed(4)}, ratio: ${(upperWick / bodySize).toFixed(2)}x)`);
            if (!strongWick)
                passed = false;
            // 4. RSI > 70
            const overbought = currentRSI > 70;
            validationLog.push(`4. RSI Overbought: ${overbought} (RSI: ${currentRSI.toFixed(2)})`);
            if (!overbought)
                passed = false;
            // 5. Volume spike > 1.2x
            const volumeSpike = currentVolume > indicators.volumeAvg * 1.2;
            validationLog.push(`5. Volume Spike: ${volumeSpike} (${(currentVolume / indicators.volumeAvg).toFixed(2)}x avg)`);
            if (!volumeSpike)
                passed = false;
            if (!passed) {
                validationLog.push('❌ REJECTED: Not all conditions met');
                console.log(validationLog.join('\n  '));
                return null;
            }
            // Calculate SHORT parameters
            const entry = currentPrice;
            const stopLoss = currentCandle.high + currentATR * 0.5; // Above wick high
            const risk = stopLoss - entry;
            const takeProfit1 = Math.max(entry - risk, indicators.prevLow); // 1R or range low
            const takeProfit2 = entry - risk * 2; // 2R
            const riskReward = risk > 0 ? (entry - takeProfit1) / risk : 0;
            // Confidence
            let confidence = 55;
            if (upperWick >= bodySize * 3)
                confidence += 15; // Very strong wick
            if (currentRSI > 75)
                confidence += 10; // Extreme overbought
            confidence = Math.min(confidence, 95);
            validationLog.push(`✅ SIGNAL GENERATED: Entry=${entry.toFixed(4)}, SL=${stopLoss.toFixed(4)}, TP1=${takeProfit1.toFixed(4)}, RR=${riskReward.toFixed(2)}, Confidence=${confidence}%`);
            console.log(validationLog.join('\n  '));
            return {
                coin,
                symbol,
                direction: 'SHORT',
                timeframe,
                strategy: 'LIQUIDITY_SWEEP_REVERSAL',
                entry,
                entryMin: entry * 0.998,
                entryMax: entry * 1.002,
                stopLoss,
                takeProfit1,
                takeProfit2,
                riskReward,
                confidence,
                status: 'ACTIVE',
                expiresAt: this.calculateExpiry(timeframe),
                rsi: currentRSI,
                atr: currentATR,
                volume: currentVolume,
                volumeAvg: indicators.volumeAvg,
                validationLog
            };
        }
        else {
            // LONG CONDITIONS (mirror of SHORT)
            // 1. Price breaks previous low
            const brokeLow = currentCandle.low < indicators.prevLow;
            validationLog.push(`1. Breaks Previous Low: ${brokeLow} (${currentCandle.low.toFixed(4)} < ${indicators.prevLow.toFixed(4)})`);
            if (!brokeLow)
                passed = false;
            // 2. Closes back above that level
            const closesAbove = currentPrice > indicators.prevLow;
            validationLog.push(`2. Closes Above Low: ${closesAbove} (${currentPrice.toFixed(4)} > ${indicators.prevLow.toFixed(4)})`);
            if (!closesAbove)
                passed = false;
            // 3. Lower wick >= 2x body size
            const bodySize = Math.abs(currentCandle.close - currentCandle.open);
            const lowerWick = Math.min(currentCandle.open, currentCandle.close) - currentCandle.low;
            const strongWick = lowerWick >= bodySize * this.LIQUIDITY_WICK_RATIO;
            validationLog.push(`3. Strong Lower Wick: ${strongWick} (wick: ${lowerWick.toFixed(4)}, body: ${bodySize.toFixed(4)}, ratio: ${(lowerWick / bodySize).toFixed(2)}x)`);
            if (!strongWick)
                passed = false;
            // 4. RSI < 30
            const oversold = currentRSI < 30;
            validationLog.push(`4. RSI Oversold: ${oversold} (RSI: ${currentRSI.toFixed(2)})`);
            if (!oversold)
                passed = false;
            // 5. Volume spike > 1.2x
            const volumeSpike = currentVolume > indicators.volumeAvg * 1.2;
            validationLog.push(`5. Volume Spike: ${volumeSpike} (${(currentVolume / indicators.volumeAvg).toFixed(2)}x avg)`);
            if (!volumeSpike)
                passed = false;
            if (!passed) {
                validationLog.push('❌ REJECTED: Not all conditions met');
                console.log(validationLog.join('\n  '));
                return null;
            }
            // Calculate LONG parameters
            const entry = currentPrice;
            const stopLoss = currentCandle.low - currentATR * 0.5; // Below wick low
            const risk = entry - stopLoss;
            const takeProfit1 = Math.min(entry + risk, indicators.prevHigh); // 1R or range high
            const takeProfit2 = entry + risk * 2; // 2R
            const riskReward = risk > 0 ? (takeProfit1 - entry) / risk : 0;
            // Confidence
            let confidence = 55;
            if (lowerWick >= bodySize * 3)
                confidence += 15;
            if (currentRSI < 25)
                confidence += 10;
            confidence = Math.min(confidence, 95);
            validationLog.push(`✅ SIGNAL GENERATED: Entry=${entry.toFixed(4)}, SL=${stopLoss.toFixed(4)}, TP1=${takeProfit1.toFixed(4)}, RR=${riskReward.toFixed(2)}, Confidence=${confidence}%`);
            console.log(validationLog.join('\n  '));
            return {
                coin,
                symbol,
                direction: 'LONG',
                timeframe,
                strategy: 'LIQUIDITY_SWEEP_REVERSAL',
                entry,
                entryMin: entry * 0.998,
                entryMax: entry * 1.002,
                stopLoss,
                takeProfit1,
                takeProfit2,
                riskReward,
                confidence,
                status: 'ACTIVE',
                expiresAt: this.calculateExpiry(timeframe),
                rsi: currentRSI,
                atr: currentATR,
                volume: currentVolume,
                volumeAvg: indicators.volumeAvg,
                validationLog
            };
        }
    }
    // ============================================================================
    // STRATEGY 3: RANGE BREAKOUT (MOMENTUM)
    // ============================================================================
    strategy_Range_Breakout(symbol, candles, indicators, timeframe) {
        const coin = symbol.replace('USDT', '');
        const currentPrice = candles[candles.length - 1].close;
        const currentCandle = candles[candles.length - 1];
        const currentVolume = currentCandle.volume;
        const currentATR = indicators.atr[indicators.atr.length - 1];
        const prevCandle = candles[candles.length - 2];
        const validationLog = [`[RANGE BREAKOUT ${coin} ${timeframe}]`];
        let passed = true;
        // 1. Identify range (last 20 candles)
        const recent20 = candles.slice(-20);
        const rangeHigh = Math.max(...recent20.map(c => c.high));
        const rangeLow = Math.min(...recent20.map(c => c.low));
        const rangeWidth = rangeHigh - rangeLow;
        const rangeWidthPercent = rangeWidth / ((rangeHigh + rangeLow) / 2);
        const validRange = rangeWidthPercent < this.RANGE_WIDTH_THRESHOLD;
        validationLog.push(`1. Valid Range: ${validRange} (width: ${(rangeWidthPercent * 100).toFixed(2)}%, threshold: 2.5%)`);
        if (!validRange)
            passed = false;
        // 2. Breakout: Candle closes outside range
        const breaksAbove = currentCandle.close > rangeHigh;
        const breaksBelow = currentCandle.close < rangeLow;
        const breakout = breaksAbove || breaksBelow;
        validationLog.push(`2. Breakout: ${breakout} (above: ${breaksAbove}, below: ${breaksBelow})`);
        if (!breakout)
            passed = false;
        // 3. Volume > 1.5x average
        const strongVolume = currentVolume > indicators.volumeAvg * 1.5;
        validationLog.push(`3. Strong Volume: ${strongVolume} (${(currentVolume / indicators.volumeAvg).toFixed(2)}x avg)`);
        if (!strongVolume)
            passed = false;
        // 4. Follow-through: Prev candle was inside range
        const prevInsideRange = prevCandle.close >= rangeLow && prevCandle.close <= rangeHigh;
        validationLog.push(`4. Follow-through: ${prevInsideRange} (prev candle inside range)`);
        if (!prevInsideRange)
            passed = false;
        if (!passed) {
            validationLog.push('❌ REJECTED: Not all conditions met');
            console.log(validationLog.join('\n  '));
            return null;
        }
        // Calculate signal
        const direction = breaksAbove ? 'LONG' : 'SHORT';
        const entry = currentPrice;
        const stopLoss = breaksAbove
            ? rangeLow + rangeWidth * 0.5 // Inside range midpoint
            : rangeHigh - rangeWidth * 0.5;
        const risk = Math.abs(entry - stopLoss);
        const targetDistance = rangeWidth; // Range height projection
        const takeProfit1 = breaksAbove ? entry + targetDistance : entry - targetDistance;
        const takeProfit2 = breaksAbove ? entry + targetDistance * 1.5 : entry - targetDistance * 1.5;
        const riskReward = risk > 0 ? Math.abs(takeProfit1 - entry) / risk : 0;
        // Confidence
        let confidence = 60;
        if (currentVolume > indicators.volumeAvg * 2)
            confidence += 15;
        if (riskReward >= 2)
            confidence += 10;
        confidence = Math.min(confidence, 90);
        validationLog.push(`✅ SIGNAL GENERATED: ${direction}, Entry=${entry.toFixed(4)}, SL=${stopLoss.toFixed(4)}, TP1=${takeProfit1.toFixed(4)}, RR=${riskReward.toFixed(2)}, Confidence=${confidence}%`);
        console.log(validationLog.join('\n  '));
        return {
            coin,
            symbol,
            direction,
            timeframe,
            strategy: 'RANGE_BREAKOUT',
            entry,
            entryMin: entry * 0.997,
            entryMax: entry * 1.003,
            stopLoss,
            takeProfit1,
            takeProfit2,
            riskReward,
            confidence,
            status: 'ACTIVE',
            expiresAt: this.calculateExpiry(timeframe),
            atr: currentATR,
            volume: currentVolume,
            volumeAvg: indicators.volumeAvg,
            validationLog
        };
    }
    // ============================================================================
    // SETUPS ENGINE (HIGHER TIMEFRAME)
    // ============================================================================
    /**
     * SETUP 1: Market Structure Shift (MSS)
     */
    setup_Market_Structure_Shift(symbol, candles, indicators, timeframe) {
        const coin = symbol.replace('USDT', '');
        const currentPrice = candles[candles.length - 1].close;
        const validationLog = [`[MSS SETUP ${coin} ${timeframe}]`];
        // Detect trend structure
        const structure = this.analyzeMarketStructure(candles);
        // Bearish MSS: Break below last higher low in bullish trend
        if (structure.trend === 'BULLISH' && structure.higherLows) {
            // Find recent higher lows
            const higherLows = this.findHigherLows(candles);
            if (higherLows.length >= 2) {
                const lastHigherLow = higherLows[higherLows.length - 1];
                // Check if price broke below
                const brokeBelow = currentPrice < lastHigherLow;
                validationLog.push(`Bearish MSS: Price ${currentPrice.toFixed(4)} broke below higher low ${lastHigherLow.toFixed(4)}: ${brokeBelow}`);
                if (brokeBelow) {
                    // Find previous high for invalidation
                    const highs = this.findSwingHighs(candles);
                    const prevHigh = highs.length > 0 ? Math.max(...highs.slice(-3)) : currentPrice * 1.05;
                    const confidence = 65;
                    const entryZone = { min: currentPrice * 0.99, max: currentPrice * 1.01 };
                    const target = lastHigherLow - (prevHigh - lastHigherLow) * 0.618; // Fib projection
                    validationLog.push(`✅ BEARISH MSS SETUP: Invalidation above ${prevHigh.toFixed(4)}, Target ${target.toFixed(4)}, Confidence ${confidence}%`);
                    console.log(validationLog.join('\n  '));
                    return {
                        coin,
                        symbol,
                        direction: 'SHORT',
                        timeframe,
                        setupType: 'MSS',
                        entryZone,
                        invalidation: prevHigh,
                        target,
                        confidence,
                        status: 'ACTIVE',
                        expiresAt: this.calculateSetupExpiry(timeframe),
                        thesis: `Bearish Market Structure Shift. Price broke below higher low at ${lastHigherLow.toFixed(4)}. Invalidation above previous high ${prevHigh.toFixed(4)}.`
                    };
                }
            }
        }
        // Bullish MSS: Break above last lower high in bearish trend
        if (structure.trend === 'BEARISH' && structure.higherHighs === false) {
            const lowerHighs = this.findLowerHighs(candles);
            if (lowerHighs.length >= 2) {
                const lastLowerHigh = lowerHighs[lowerHighs.length - 1];
                const brokeAbove = currentPrice > lastLowerHigh;
                validationLog.push(`Bullish MSS: Price ${currentPrice.toFixed(4)} broke above lower high ${lastLowerHigh.toFixed(4)}: ${brokeAbove}`);
                if (brokeAbove) {
                    const lows = this.findSwingLows(candles);
                    const prevLow = lows.length > 0 ? Math.min(...lows.slice(-3)) : currentPrice * 0.95;
                    const confidence = 65;
                    const entryZone = { min: currentPrice * 0.99, max: currentPrice * 1.01 };
                    const target = lastLowerHigh + (lastLowerHigh - prevLow) * 0.618;
                    validationLog.push(`✅ BULLISH MSS SETUP: Invalidation below ${prevLow.toFixed(4)}, Target ${target.toFixed(4)}, Confidence ${confidence}%`);
                    console.log(validationLog.join('\n  '));
                    return {
                        coin,
                        symbol,
                        direction: 'LONG',
                        timeframe,
                        setupType: 'MSS',
                        entryZone,
                        invalidation: prevLow,
                        target,
                        confidence,
                        status: 'ACTIVE',
                        expiresAt: this.calculateSetupExpiry(timeframe),
                        thesis: `Bullish Market Structure Shift. Price broke above lower high at ${lastLowerHigh.toFixed(4)}. Invalidation below previous low ${prevLow.toFixed(4)}.`
                    };
                }
            }
        }
        validationLog.push('❌ No MSS setup detected');
        return null;
    }
    /**
     * SETUP 2: Fair Value Gap (FVG)
     */
    setup_Fair_Value_Gap(symbol, candles, timeframe) {
        const coin = symbol.replace('USDT', '');
        const currentPrice = candles[candles.length - 1].close;
        const validationLog = [`[FVG SETUP ${coin} ${timeframe}]`];
        // Look for FVG in last 10 candles
        for (let i = candles.length - 10; i < candles.length - 2; i++) {
            const c1 = candles[i];
            const c2 = candles[i + 1];
            const c3 = candles[i + 2];
            // Bullish FVG: Candle 1 high < Candle 3 low
            if (c1.high < c3.low) {
                const gapSize = (c3.low - c1.high) / c1.high;
                const notFilled = currentPrice > c1.high && currentPrice < c3.low;
                validationLog.push(`Bullish FVG: c1.high ${c1.high.toFixed(4)} < c3.low ${c3.low.toFixed(4)}, size: ${(gapSize * 100).toFixed(2)}%, filled: ${!notFilled}`);
                if (gapSize > this.FVG_MIN_SIZE && notFilled) {
                    const midpoint = (c1.high + c3.low) / 2;
                    const confidence = 60;
                    validationLog.push(`✅ BULLISH FVG SETUP: Midpoint entry ${midpoint.toFixed(4)}, Confidence ${confidence}%`);
                    console.log(validationLog.join('\n  '));
                    return {
                        coin,
                        symbol,
                        direction: 'LONG',
                        timeframe,
                        setupType: 'FVG',
                        entryZone: { min: c1.high, max: c3.low },
                        invalidation: c1.low,
                        target: candles[candles.length - 1].high * 1.02,
                        confidence,
                        status: 'ACTIVE',
                        expiresAt: this.calculateSetupExpiry(timeframe),
                        thesis: `Bullish Fair Value Gap between ${c1.high.toFixed(4)} and ${c3.low.toFixed(4)}. Gap size ${(gapSize * 100).toFixed(2)}%. Entry at midpoint.`
                    };
                }
            }
            // Bearish FVG: Candle 1 low > Candle 3 high
            if (c1.low > c3.high) {
                const gapSize = (c1.low - c3.high) / c3.high;
                const notFilled = currentPrice < c1.low && currentPrice > c3.high;
                validationLog.push(`Bearish FVG: c1.low ${c1.low.toFixed(4)} > c3.high ${c3.high.toFixed(4)}, size: ${(gapSize * 100).toFixed(2)}%, filled: ${!notFilled}`);
                if (gapSize > this.FVG_MIN_SIZE && notFilled) {
                    const midpoint = (c1.low + c3.high) / 2;
                    const confidence = 60;
                    validationLog.push(`✅ BEARISH FVG SETUP: Midpoint entry ${midpoint.toFixed(4)}, Confidence ${confidence}%`);
                    console.log(validationLog.join('\n  '));
                    return {
                        coin,
                        symbol,
                        direction: 'SHORT',
                        timeframe,
                        setupType: 'FVG',
                        entryZone: { min: c3.high, max: c1.low },
                        invalidation: c1.high,
                        target: candles[candles.length - 1].low * 0.98,
                        confidence,
                        status: 'ACTIVE',
                        expiresAt: this.calculateSetupExpiry(timeframe),
                        thesis: `Bearish Fair Value Gap between ${c3.high.toFixed(4)} and ${c1.low.toFixed(4)}. Gap size ${(gapSize * 100).toFixed(2)}%. Entry at midpoint.`
                    };
                }
            }
        }
        return null;
    }
    /**
     * SETUP 3: Liquidity + Structure Combo (HIGH PRIORITY)
     */
    setup_Liquidity_Structure_Combo(symbol, candles, indicators, timeframe) {
        const coin = symbol.replace('USDT', '');
        const currentCandle = candles[candles.length - 1];
        const currentPrice = currentCandle.close;
        const validationLog = [`[LIQ+STRUCT COMBO ${coin} ${timeframe}]`];
        let passed = true;
        // 1. Sweep previous high/low
        const sweptHigh = currentCandle.high > indicators.prevHigh && currentPrice < indicators.prevHigh;
        const sweptLow = currentCandle.low < indicators.prevLow && currentPrice > indicators.prevLow;
        const sweep = sweptHigh || sweptLow;
        validationLog.push(`1. Liquidity Sweep: ${sweep} (high: ${sweptHigh}, low: ${sweptLow})`);
        if (!sweep)
            passed = false;
        // 2. Immediate reversal (strong wick)
        const rejection = this.validateRejection(currentCandle, sweptHigh ? 'SHORT' : 'LONG');
        const reversal = rejection.hasRejection && rejection.wickToBodyRatio >= 1.5;
        validationLog.push(`2. Immediate Reversal: ${reversal} (wick/body: ${rejection.wickToBodyRatio.toFixed(2)}x)`);
        if (!reversal)
            passed = false;
        // 3. Break of internal structure (current candle close vs open)
        const internalBreak = sweptHigh
            ? currentPrice < currentCandle.open // Bearish close for short
            : currentPrice > currentCandle.open; // Bullish close for long
        validationLog.push(`3. Internal Structure Break: ${internalBreak}`);
        if (!internalBreak)
            passed = false;
        if (!passed) {
            return null;
        }
        // HIGH PRIORITY SETUP
        const direction = sweptHigh ? 'SHORT' : 'LONG';
        const confidence = 75; // High confidence for this setup
        const entryZone = { min: currentPrice * 0.995, max: currentPrice * 1.005 };
        const invalidation = sweptHigh ? currentCandle.high : currentCandle.low;
        const target = sweptHigh ? indicators.prevLow : indicators.prevHigh;
        validationLog.push(`✅ HIGH PRIORITY COMBO SETUP: ${direction}, Invalidation ${invalidation.toFixed(4)}, Target ${target.toFixed(4)}, Confidence ${confidence}%`);
        console.log(validationLog.join('\n  '));
        return {
            coin,
            symbol,
            direction,
            timeframe,
            setupType: 'LIQUIDITY_STRUCTURE',
            entryZone,
            invalidation,
            target,
            confidence,
            status: 'ACTIVE',
            expiresAt: this.calculateSetupExpiry(timeframe),
            thesis: `HIGH PRIORITY: Liquidity sweep of ${sweptHigh ? 'highs' : 'lows'} with immediate reversal and structure break. Strong ${direction} setup.`
        };
    }
    // ============================================================================
    // MARKET STRUCTURE HELPERS
    // ============================================================================
    analyzeMarketStructure(candles) {
        const highs = candles.map(c => c.high);
        const lows = candles.map(c => c.low);
        // Simple trend detection
        let higherHighs = 0;
        let higherLows = 0;
        let lowerHighs = 0;
        let lowerLows = 0;
        for (let i = 2; i < highs.length; i++) {
            if (highs[i] > highs[i - 1] && highs[i - 1] > highs[i - 2])
                higherHighs++;
            if (lows[i] > lows[i - 1] && lows[i - 1] > lows[i - 2])
                higherLows++;
            if (highs[i] < highs[i - 1] && highs[i - 1] < highs[i - 2])
                lowerHighs++;
            if (lows[i] < lows[i - 1] && lows[i - 1] < lows[i - 2])
                lowerLows++;
        }
        const trend = higherHighs > lowerHighs && higherLows > lowerLows ? 'BULLISH' :
            lowerHighs > higherHighs && lowerLows > higherLows ? 'BEARISH' : 'SIDEWAYS';
        return {
            trend,
            higherHighs: higherHighs > lowerHighs,
            higherLows: higherLows > lowerLows,
            lastStructureBreak: null
        };
    }
    findHigherLows(candles) {
        const lows = [];
        for (let i = 2; i < candles.length; i++) {
            if (candles[i].low > candles[i - 1].low && candles[i - 1].low > candles[i - 2].low) {
                lows.push(candles[i - 1].low);
            }
        }
        return lows;
    }
    findLowerHighs(candles) {
        const highs = [];
        for (let i = 2; i < candles.length; i++) {
            if (candles[i].high < candles[i - 1].high && candles[i - 1].high < candles[i - 2].high) {
                highs.push(candles[i - 1].high);
            }
        }
        return highs;
    }
    findSwingHighs(candles) {
        const highs = [];
        for (let i = 2; i < candles.length - 1; i++) {
            if (candles[i].high > candles[i - 1].high && candles[i].high > candles[i - 2].high &&
                candles[i].high > candles[i + 1].high) {
                highs.push(candles[i].high);
            }
        }
        return highs;
    }
    findSwingLows(candles) {
        const lows = [];
        for (let i = 2; i < candles.length - 1; i++) {
            if (candles[i].low < candles[i - 1].low && candles[i].low < candles[i - 2].low &&
                candles[i].low < candles[i + 1].low) {
                lows.push(candles[i].low);
            }
        }
        return lows;
    }
    // ============================================================================
    // EXPIRY CALCULATIONS
    // ============================================================================
    calculateExpiry(timeframe) {
        const now = Date.now();
        const multipliers = {
            '5m': 30 * 60 * 1000, // 30 minutes
            '15m': 2 * 60 * 60 * 1000, // 2 hours
            '1h': 6 * 60 * 60 * 1000, // 6 hours
            '4h': 12 * 60 * 60 * 1000 // 12 hours
        };
        return new Date(now + (multipliers[timeframe] || 6 * 60 * 60 * 1000));
    }
    calculateSetupExpiry(timeframe) {
        // Setups last longer than signals
        const now = Date.now();
        const multipliers = {
            '1h': 24 * 60 * 60 * 1000, // 1 day
            '4h': 3 * 24 * 60 * 60 * 1000, // 3 days
            '1d': 7 * 24 * 60 * 60 * 1000 // 1 week
        };
        return new Date(now + (multipliers[timeframe] || 24 * 60 * 60 * 1000));
    }
    // ============================================================================
    // SIGNAL SCANNER
    // ============================================================================
    /**
     * Scan all coins for signals on a specific timeframe
     * Respects daily signal cap for quality over quantity
     */
    async scanTimeframeForSignals(timeframe, maxSignals = 5) {
        const signals = [];
        console.log(`\n🔍 SCANNING ${timeframe} FOR SIGNALS (max: ${maxSignals}, coins: ${this.COINS.length})...`);
        for (const symbol of this.COINS) {
            // Stop if we've hit the cap
            if (signals.length >= maxSignals) {
                console.log(`  ⏹️  Cap reached (${maxSignals} signals), stopping scan`);
                break;
            }
            try {
                const candles = await marketDataService_1.marketDataService.fetchCandles(symbol, timeframe, 200);
                if (candles.length < this.MIN_CANDLES) {
                    continue; // Silent skip for cleaner logs with 100+ coins
                }
                const indicators = this.calculateIndicators(candles);
                if (!indicators)
                    continue;
                // Run all strategies (priority: EMA Pullback > Liquidity Sweep > Range Breakout)
                const emaSignal = this.strategy_EMA_Trend_Pullback(symbol, candles, indicators, timeframe);
                if (emaSignal) {
                    signals.push(emaSignal);
                    if (signals.length >= maxSignals)
                        break;
                    continue; // Move to next coin after high-quality signal
                }
                const liqLongSignal = this.strategy_Liquidity_Sweep_Reversal(symbol, candles, indicators, timeframe, 'LONG');
                if (liqLongSignal) {
                    signals.push(liqLongSignal);
                    if (signals.length >= maxSignals)
                        break;
                    continue;
                }
                const liqShortSignal = this.strategy_Liquidity_Sweep_Reversal(symbol, candles, indicators, timeframe, 'SHORT');
                if (liqShortSignal) {
                    signals.push(liqShortSignal);
                    if (signals.length >= maxSignals)
                        break;
                    continue;
                }
                const rangeSignal = this.strategy_Range_Breakout(symbol, candles, indicators, timeframe);
                if (rangeSignal) {
                    signals.push(rangeSignal);
                    if (signals.length >= maxSignals)
                        break;
                }
            }
            catch (error) {
                // Silent error for cleaner logs with 100+ coins
            }
        }
        console.log(`✅ ${timeframe} SCAN COMPLETE: ${signals.length} signals found\n`);
        return signals;
    }
    /**
     * Scan for higher timeframe setups
     */
    async scanForSetups() {
        const setups = [];
        console.log(`\n📊 SCANNING FOR HIGHER TIMEFRAME SETUPS...`);
        for (const timeframe of this.SETUP_TIMEFRAMES) {
            for (const symbol of this.COINS) {
                try {
                    const candles = await marketDataService_1.marketDataService.fetchCandles(symbol, timeframe, 200);
                    if (candles.length < this.MIN_CANDLES)
                        continue;
                    const indicators = this.calculateIndicators(candles);
                    if (!indicators)
                        continue;
                    // Run all setup strategies
                    const mssSetup = this.setup_Market_Structure_Shift(symbol, candles, indicators, timeframe);
                    if (mssSetup)
                        setups.push(mssSetup);
                    const fvgSetup = this.setup_Fair_Value_Gap(symbol, candles, timeframe);
                    if (fvgSetup)
                        setups.push(fvgSetup);
                    const comboSetup = this.setup_Liquidity_Structure_Combo(symbol, candles, indicators, timeframe);
                    if (comboSetup)
                        setups.push(comboSetup);
                }
                catch (error) {
                    console.error(`  ${symbol} ${timeframe}: Error -`, error);
                }
            }
        }
        // Limit to max 5 setups
        const selectedSetups = setups.slice(0, 5);
        console.log(`✅ SETUP SCAN COMPLETE: ${selectedSetups.length}/${setups.length} setups selected\n`);
        return selectedSetups;
    }
    // ============================================================================
    // DATABASE OPERATIONS
    // ============================================================================
    async saveSignalToDB(signal, parentSetupId) {
        try {
            // Check for duplicate active signal
            const existing = await prisma.signal.findFirst({
                where: {
                    symbol: signal.symbol,
                    timeframe: signal.timeframe,
                    strategy: signal.strategy,
                    status: 'ACTIVE',
                    createdAt: { gte: new Date(Date.now() - 60 * 60 * 1000) } // Last hour
                }
            });
            if (existing) {
                console.log(`  [DB] Duplicate signal for ${signal.symbol} ${signal.timeframe}, skipping`);
                return;
            }
            await prisma.signal.create({
                data: {
                    coin: signal.coin,
                    symbol: signal.symbol,
                    direction: signal.direction,
                    timeframe: signal.timeframe,
                    strategy: signal.strategy,
                    strategyType: signal.strategyType || 'liquidity',
                    setupType: signal.strategy,
                    entryMin: signal.entryMin,
                    entryMax: signal.entryMax,
                    stopLoss: signal.stopLoss,
                    target1: signal.takeProfit1,
                    target2: signal.takeProfit2,
                    confidence: signal.confidence,
                    status: 'FORMING',
                    expiresAt: signal.expiresAt,
                    parentSetupId: parentSetupId,
                    ema50: signal.ema50,
                    ema200: signal.ema200,
                    rsi: signal.rsi,
                    volume: signal.volume,
                    volumeAvg: signal.volumeAvg
                }
            });
            console.log(`  [DB] ✅ Saved ${signal.strategy} signal for ${signal.coin} ${signal.timeframe}`);
        }
        catch (error) {
            console.error(`  [DB] ❌ Error saving signal:`, error);
        }
    }
    async saveSetupToDB(setup) {
        try {
            // For now, setups are not persisted - they are generated on-demand
            // Could add a Setups table if needed
            console.log(`  [SETUP] ${setup.setupType} for ${setup.coin} ${setup.timeframe} (not persisted)`);
        }
        catch (error) {
            console.error(`  [SETUP] Error:`, error);
        }
    }
    async expireOldSignals() {
        try {
            const result = await prisma.signal.updateMany({
                where: {
                    status: { in: ['FORMING', 'ACTIVE'] },
                    expiresAt: { lt: new Date() }
                },
                data: { status: 'EXPIRED' }
            });
            if (result.count > 0) {
                console.log(`  [DB] 🗑️  Expired ${result.count} old signals`);
            }
        }
        catch (error) {
            console.error(`  [DB] Error expiring signals:`, error);
        }
    }
    // ============================================================================
    // PUBLIC API
    // ============================================================================
    /**
     * Start the signal engine
     */
    start() {
        console.log('\n🚀 STARTING PRODUCTION SIGNAL ENGINE');
        console.log('=====================================\n');
        console.log(`📊 Coverage: ${this.COINS.length} coins across ${this.SIGNAL_TIMEFRAMES.length} timeframes`);
        console.log(`🎯 Daily Signal Cap: ${this.DAILY_SIGNAL_CAP} high-quality signals/day`);
        console.log(`⏱️  Scan interval: ${this.SIGNAL_INTERVAL / 1000}s | Setup scan: ${this.SETUP_INTERVAL / 60000}min`);
        console.log(`📈 Timeframes: ${this.SIGNAL_TIMEFRAMES.join(', ')}`);
        console.log(`🔭 HTF Setups: ${this.SETUP_TIMEFRAMES.join(', ')}\n`);
        // Initial scan
        this.runSignalScan();
        this.runSetupScan();
        // Set intervals
        this.signalInterval = setInterval(() => this.runSignalScan(), this.SIGNAL_INTERVAL);
        this.setupInterval = setInterval(() => this.runSetupScan(), this.SETUP_INTERVAL);
        console.log('✅ Signal engine running\n');
    }
    /**
     * Stop the signal engine
     */
    stop() {
        if (this.signalInterval)
            clearInterval(this.signalInterval);
        if (this.setupInterval)
            clearInterval(this.setupInterval);
        console.log('🛑 Signal engine stopped');
    }
    /**
     * Run a signal scan (can be called manually)
     * Limited to 5 signals per day across 100+ coins
     */
    async runSignalScan() {
        console.log(`\n[${new Date().toISOString()}] 🔍 RUNNING SIGNAL SCAN...`);
        await this.expireOldSignals();
        // Check daily cap
        const today = new Date().toISOString().split('T')[0];
        if (today !== this.lastSignalDate) {
            this.dailySignalCount = 0;
            this.lastSignalDate = today;
            console.log(`📅 New day - Signal counter reset (Cap: ${this.DAILY_SIGNAL_CAP}/day)`);
        }
        if (this.dailySignalCount >= this.DAILY_SIGNAL_CAP) {
            console.log(`⛔ DAILY SIGNAL CAP REACHED: ${this.dailySignalCount}/${this.DAILY_SIGNAL_CAP} signals today`);
            console.log(`   Scanning ${this.COINS.length} coins. Next scan in ${this.SIGNAL_INTERVAL / 60000} minutes.`);
            return [];
        }
        const allSignals = [];
        for (const timeframe of this.SIGNAL_TIMEFRAMES) {
            // Stop if we've hit the cap
            if (this.dailySignalCount >= this.DAILY_SIGNAL_CAP)
                break;
            const signals = await this.scanTimeframeForSignals(timeframe, this.DAILY_SIGNAL_CAP - this.dailySignalCount);
            allSignals.push(...signals);
            this.dailySignalCount += signals.length;
            // Save to database
            for (const signal of signals) {
                await this.saveSignalToDB(signal);
            }
        }
        console.log(`✅ SIGNAL SCAN COMPLETE: ${allSignals.length} signals generated (${this.dailySignalCount}/${this.DAILY_SIGNAL_CAP} today)\n`);
        return allSignals;
    }
    /**
     * Run a setup scan (can be called manually)
     */
    async runSetupScan() {
        console.log(`\n[${new Date().toISOString()}] 📊 RUNNING SETUP SCAN...`);
        const setups = await this.scanForSetups();
        for (const setup of setups) {
            await this.saveSetupToDB(setup);
        }
        return setups;
    }
    /**
     * Get daily signal status (remaining signals for the day)
     */
    getDailySignalStatus() {
        const today = new Date().toISOString().split('T')[0];
        if (today !== this.lastSignalDate) {
            return { generated: 0, cap: this.DAILY_SIGNAL_CAP, remaining: this.DAILY_SIGNAL_CAP, date: today };
        }
        return {
            generated: this.dailySignalCount,
            cap: this.DAILY_SIGNAL_CAP,
            remaining: Math.max(0, this.DAILY_SIGNAL_CAP - this.dailySignalCount),
            date: today
        };
    }
    /**
     * Get current active signals
     */
    async getActiveSignals() {
        try {
            const dbSignals = await prisma.signal.findMany({
                where: { status: { in: ['FORMING', 'ACTIVE'] } },
                orderBy: { createdAt: 'desc' }
            });
            return dbSignals.map(s => ({
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
                takeProfit2: s.target2 || s.target1 * 1.5,
                riskReward: (s.target1 - (s.entryMin + s.entryMax) / 2) / Math.abs(s.stopLoss - (s.entryMin + s.entryMax) / 2),
                confidence: s.confidence,
                status: s.status,
                expiresAt: s.expiresAt,
                createdAt: s.createdAt,
                ema50: s.ema50 || undefined,
                ema200: s.ema200 || undefined,
                rsi: s.rsi || undefined,
                volume: s.volume || undefined,
                volumeAvg: s.volumeAvg || undefined
            }));
        }
        catch (error) {
            console.error('Error fetching active signals:', error);
            return [];
        }
    }
    /**
     * Update signal statuses based on current market prices
     */
    async updateSignalStatuses() {
        try {
            const activeSignals = await prisma.signal.findMany({
                where: { status: { in: ['FORMING', 'ACTIVE'] } }
            });
            for (const signal of activeSignals) {
                const currentPrice = await marketDataService_1.marketDataService.fetchCurrentPrice(signal.symbol);
                if (currentPrice === 0)
                    continue;
                const entryCenter = (signal.entryMin + signal.entryMax) / 2;
                // Check TP1
                if (signal.direction === 'LONG' && currentPrice >= signal.target1) {
                    await prisma.signal.update({
                        where: { id: signal.id },
                        data: { status: 'SUCCESS', exitPrice: currentPrice, pnlPercent: ((currentPrice - entryCenter) / entryCenter * 100) }
                    });
                    console.log(`🎯 TP1 HIT: ${signal.coin} at ${currentPrice.toFixed(4)}`);
                }
                else if (signal.direction === 'SHORT' && currentPrice <= signal.target1) {
                    await prisma.signal.update({
                        where: { id: signal.id },
                        data: { status: 'SUCCESS', exitPrice: currentPrice, pnlPercent: ((entryCenter - currentPrice) / entryCenter * 100) }
                    });
                    console.log(`🎯 TP1 HIT: ${signal.coin} at ${currentPrice.toFixed(4)}`);
                }
                // Check SL
                if (signal.direction === 'LONG' && currentPrice <= signal.stopLoss) {
                    await prisma.signal.update({
                        where: { id: signal.id },
                        data: { status: 'FAILED', exitPrice: currentPrice, pnlPercent: ((currentPrice - entryCenter) / entryCenter * 100) }
                    });
                    console.log(`🛑 SL HIT: ${signal.coin} at ${currentPrice.toFixed(4)}`);
                }
                else if (signal.direction === 'SHORT' && currentPrice >= signal.stopLoss) {
                    await prisma.signal.update({
                        where: { id: signal.id },
                        data: { status: 'FAILED', exitPrice: currentPrice, pnlPercent: ((entryCenter - currentPrice) / entryCenter * 100) }
                    });
                    console.log(`🛑 SL HIT: ${signal.coin} at ${currentPrice.toFixed(4)}`);
                }
                // Check if triggered (price in entry zone)
                if (signal.status === 'FORMING' && currentPrice >= signal.entryMin && currentPrice <= signal.entryMax) {
                    await prisma.signal.update({
                        where: { id: signal.id },
                        data: { status: 'TRIGGERED', entryPrice: currentPrice, triggeredAt: new Date() }
                    });
                    console.log(`🚀 TRIGGERED: ${signal.coin} at ${currentPrice.toFixed(4)}`);
                }
            }
        }
        catch (error) {
            console.error('Error updating signal statuses:', error);
        }
    }
    // ============================================================================
    // NEW STATEFUL SIGNAL ENGINE METHODS (BACKWARD COMPATIBLE)
    // ============================================================================
    /**
     * NEW: Detect signals from market state (stateful approach)
     * This is the new recommended method that uses market state engine
     * Backward compatible: old detectSignal methods still work
     */
    async detectSignalsFromState(symbol, timeframe, candles) {
        // Update market state with new candles
        const mappedCandles = candles.map(c => ({
            timestamp: c.time,
            open: c.open,
            high: c.high,
            low: c.low,
            close: c.close,
            volume: c.volume
        }));
        const state = marketStateEngine_1.marketStateEngine.updateCandles(symbol, timeframe, mappedCandles);
        const context = marketStateEngine_1.marketStateEngine.getMarketContext(symbol, timeframe);
        // Generate raw signals using existing strategies
        const rawSignals = await this.generateRawSignals(symbol, timeframe, candles, state);
        // Filter through edge filter engine
        const signalInputs = rawSignals.map(s => ({
            id: s.id || `${symbol}-${timeframe}-${Date.now()}`,
            symbol: s.symbol,
            type: 'ENTRY',
            direction: s.direction,
            strategy: s.strategy,
            entryPrice: s.entry,
            stopLoss: s.stopLoss,
            takeProfits: [s.takeProfit1, s.takeProfit2],
            timestamp: Date.now(),
            timeframe: s.timeframe,
            confidence: s.confidence
        }));
        const filteredSignals = edgeFilterEngine_1.edgeFilterEngine.filterSignals(signalInputs, state, context);
        // Map to enhanced signals with structure context and visuals
        const enhancedSignals = filteredSignals.map(fs => {
            const baseSignal = rawSignals.find(s => s.symbol === fs.symbol && s.strategy === fs.strategy);
            if (!baseSignal)
                return null;
            // Transform visuals to match ChartOverlays interface
            const visuals = {
                candles: state.candles.map(c => ({
                    time: c.timestamp,
                    open: c.open,
                    high: c.high,
                    low: c.low,
                    close: c.close,
                    volume: c.volume
                })),
                liquidityZones: state.liquidityZones.map(z => ({
                    id: z.id,
                    type: z.type,
                    top: z.upperBound,
                    bottom: z.lowerBound,
                    left: z.timestamp,
                    right: z.sweepTimestamp || Date.now(),
                    color: z.type === 'equal_highs' ? '#ef4444' : '#22c55e',
                    label: z.type,
                    swept: z.swept,
                    extendRight: true
                })),
                fvgZones: state.fvgZones.map(f => ({
                    id: f.id,
                    type: f.type,
                    top: f.top,
                    bottom: f.bottom,
                    left: f.timestamp,
                    right: f.mitigationTimestamp || Date.now(),
                    color: f.type === 'bullish' ? '#22c55e' : '#ef4444',
                    label: `FVG ${f.type}`,
                    mitigated: f.mitigated
                })),
                orderBlocks: state.orderBlocks.map(o => ({
                    id: o.id,
                    type: o.type,
                    open: o.open,
                    high: o.high,
                    low: o.low,
                    close: o.close,
                    time: o.timestamp,
                    color: o.type === 'bullish' ? '#22c55e' : '#ef4444',
                    mitigated: o.mitigated
                })),
                structureLines: [
                    ...state.marketStructure.structurePoints
                        .filter((s) => s.type === 'high')
                        .map((s, i) => ({
                        id: `swing-high-${i}`,
                        type: 'resistance',
                        price: s.price,
                        startTime: s.timestamp,
                        endTime: Date.now(),
                        color: '#ef4444',
                        lineStyle: 'dashed',
                        width: 2
                    })),
                    ...state.marketStructure.structurePoints
                        .filter((s) => s.type === 'low')
                        .map((s, i) => ({
                        id: `swing-low-${i}`,
                        type: 'support',
                        price: s.price,
                        startTime: s.timestamp,
                        endTime: Date.now(),
                        color: '#22c55e',
                        lineStyle: 'dashed',
                        width: 2
                    }))
                ],
                markers: [
                    ...state.bosEvents.map(b => ({
                        time: b.timestamp,
                        position: b.direction === 'bullish' ? 'belowBar' : 'aboveBar',
                        color: b.direction === 'bullish' ? '#22c55e' : '#ef4444',
                        shape: b.type === 'BOS' ? 'arrowUp' : 'circle',
                        text: b.type,
                        size: 1
                    })),
                    {
                        time: Date.now(),
                        position: fs.direction === 'LONG' ? 'belowBar' : 'aboveBar',
                        color: fs.direction === 'LONG' ? '#22c55e' : '#ef4444',
                        shape: 'arrowUp',
                        text: 'ENTRY',
                        size: 2
                    }
                ],
                signalLines: [
                    { id: 'entry', type: 'entry', price: fs.entryPrice, color: '#22c55e', lineWidth: 2, label: 'Entry' },
                    { id: 'sl', type: 'stopLoss', price: fs.stopLoss, color: '#ef4444', lineWidth: 2, label: 'SL' },
                    ...fs.takeProfits.map((tp, i) => ({
                        id: `tp${i + 1}`,
                        type: 'takeProfit',
                        price: tp,
                        color: '#3b82f6',
                        lineWidth: 2,
                        label: `TP${i + 1}`
                    }))
                ]
            };
            return {
                ...baseSignal,
                edgeScore: fs.edgeScore,
                marketContext: fs.marketContext,
                structureContext: fs.structureContext,
                visuals,
                marketStory: visualMappingEngine_1.visualMappingEngine.generateMarketStory(state, fs)
            };
        }).filter(s => s !== null);
        return enhancedSignals;
    }
    /**
     * Generate raw signals from strategies (internal use)
     */
    async generateRawSignals(symbol, timeframe, candles, state) {
        const indicators = this.calculateIndicators(candles);
        if (!indicators)
            return [];
        const signals = [];
        // Run existing strategies
        const emaSignal = this.strategy_EMA_Trend_Pullback(symbol, candles, indicators, timeframe);
        if (emaSignal)
            signals.push(emaSignal);
        const liquidityLong = this.strategy_Liquidity_Sweep_Reversal(symbol, candles, indicators, timeframe, 'LONG');
        if (liquidityLong)
            signals.push(liquidityLong);
        const liquidityShort = this.strategy_Liquidity_Sweep_Reversal(symbol, candles, indicators, timeframe, 'SHORT');
        if (liquidityShort)
            signals.push(liquidityShort);
        // NEW: State-aware setup detection
        const stateSignals = this.detectStateBasedSignals(symbol, candles, indicators, state, timeframe);
        signals.push(...stateSignals);
        return signals;
    }
    /**
     * NEW: Detect signals based on market state (BOS, CHoCH, FVG)
     */
    detectStateBasedSignals(symbol, candles, indicators, state, timeframe) {
        const signals = [];
        const coin = symbol.replace('USDT', '');
        const currentPrice = candles[candles.length - 1].close;
        const currentATR = indicators.atr[indicators.atr.length - 1];
        // Check for BOS-based signals
        const lastBOS = state.marketStructure.lastBOS;
        const lastCHoCH = state.marketStructure.lastCHoCH;
        if (lastBOS && lastBOS.timestamp > Date.now() - 6 * 60 * 60 * 1000) {
            // Recent BOS - look for pullback entries
            const direction = lastBOS.direction === 'bullish' ? 'LONG' : 'SHORT';
            // Check for sweep of previous level
            const recentSweep = state.sweptLiquidity.find(s => s.sweepTimestamp && s.sweepTimestamp > Date.now() - 2 * 60 * 60 * 1000);
            if (recentSweep) {
                // High-quality setup: BOS + Sweep
                const entry = currentPrice;
                const stopLoss = direction === 'LONG'
                    ? Math.min(recentSweep.sweepPrice || entry * 0.99, entry - currentATR)
                    : Math.max(recentSweep.sweepPrice || entry * 1.01, entry + currentATR);
                const risk = Math.abs(entry - stopLoss);
                const takeProfit1 = direction === 'LONG' ? entry + risk * 2 : entry - risk * 2;
                const takeProfit2 = direction === 'LONG' ? entry + risk * 3 : entry - risk * 3;
                signals.push({
                    coin,
                    symbol,
                    direction,
                    timeframe,
                    strategy: 'BOS_SWEEP_PULLBACK',
                    entry,
                    entryMin: entry * 0.995,
                    entryMax: entry * 1.005,
                    stopLoss,
                    takeProfit1,
                    takeProfit2,
                    riskReward: 2.0,
                    confidence: 75,
                    status: 'ACTIVE',
                    expiresAt: this.calculateExpiry(timeframe)
                });
            }
        }
        // Check for FVG-based signals
        const unmitigatedFVGs = state.fvgZones.filter(f => !f.mitigated).slice(-3);
        for (const fvg of unmitigatedFVGs) {
            const priceInFVG = currentPrice >= Math.min(fvg.top, fvg.bottom) &&
                currentPrice <= Math.max(fvg.top, fvg.bottom);
            if (priceInFVG) {
                const direction = fvg.type === 'bullish' ? 'LONG' : 'SHORT';
                signals.push({
                    coin,
                    symbol,
                    direction,
                    timeframe,
                    strategy: 'FVG_MITIGATION',
                    entry: currentPrice,
                    entryMin: Math.min(fvg.top, fvg.bottom),
                    entryMax: Math.max(fvg.top, fvg.bottom),
                    stopLoss: direction === 'LONG'
                        ? Math.min(fvg.bottom * 0.998, currentPrice - currentATR * 0.8)
                        : Math.max(fvg.top * 1.002, currentPrice + currentATR * 0.8),
                    takeProfit1: direction === 'LONG' ? currentPrice + currentATR * 1.5 : currentPrice - currentATR * 1.5,
                    takeProfit2: direction === 'LONG' ? currentPrice + currentATR * 2.5 : currentPrice - currentATR * 2.5,
                    riskReward: 1.5,
                    confidence: 65,
                    status: 'ACTIVE',
                    expiresAt: this.calculateExpiry(timeframe)
                });
            }
        }
        return signals;
    }
    /**
     * NEW: Check for parent trade setups and create signals when price enters zone
     * This implements the two-layer system: Setup (HTF) -> Signal (execution)
     */
    async generateSignalsFromSetups(symbol, currentPrice) {
        try {
            // Get active trade setups for this symbol
            const activeSetups = await prisma.tradeSetup.findMany({
                where: {
                    asset: symbol,
                    active: true,
                    status: { in: ['forming', 'near_trigger'] }
                },
                orderBy: { createdAt: 'desc' }
            });
            const signals = [];
            for (const setup of activeSetups) {
                // Parse entry zone from JSON string
                const entryZone = JSON.parse(setup.entryZone);
                const zoneLow = entryZone.low;
                const zoneHigh = entryZone.high;
                // Check if price entered the setup zone
                if (currentPrice >= zoneLow && currentPrice <= zoneHigh) {
                    // Check if signal already exists for this setup
                    const existingSignal = await prisma.signal.findFirst({
                        where: {
                            parentSetupId: setup.id,
                            status: { in: ['FORMING', 'ACTIVE', 'TRIGGERED'] }
                        }
                    });
                    if (!existingSignal) {
                        // Create signal from setup
                        const signal = await this.createSignalFromSetup(setup, currentPrice);
                        if (signal) {
                            signals.push(signal);
                            console.log(`🎯 Signal created from setup: ${symbol} at ${currentPrice}`);
                        }
                    }
                }
            }
            return signals;
        }
        catch (error) {
            console.error('Error generating signals from setups:', error);
            return [];
        }
    }
    /**
     * Create a signal from a trade setup
     */
    async createSignalFromSetup(setup, currentPrice) {
        try {
            const entryZone = JSON.parse(setup.entryZone);
            const timeframe = this.getLowerTimeframe(setup.timeframe); // Use lower timeframe for signal
            const signal = {
                coin: setup.asset,
                symbol: setup.asset,
                direction: setup.direction.toUpperCase(),
                timeframe,
                strategy: setup.strategy.join(', '),
                strategyType: setup.strategyType,
                entry: currentPrice,
                entryMin: entryZone.low,
                entryMax: entryZone.high,
                stopLoss: setup.stopLoss,
                takeProfit1: setup.targets[0],
                takeProfit2: setup.targets[1] || setup.targets[0] * 1.5,
                riskReward: (setup.targets[0] - currentPrice) / Math.abs(setup.stopLoss - currentPrice),
                confidence: setup.confidence,
                status: 'ACTIVE',
                expiresAt: this.calculateExpiry(timeframe),
                createdAt: new Date(),
                parentSetupId: setup.id
            };
            // Save to database with parent setup link
            await this.saveSignalToDB(signal, setup.id);
            return signal;
        }
        catch (error) {
            console.error('Error creating signal from setup:', error);
            return null;
        }
    }
    /**
     * Get lower timeframe for signal execution
     * Setup HTF -> Signal LTF
     */
    getLowerTimeframe(setupTimeframe) {
        const timeframeMap = {
            '1D': '4h',
            '4H': '1h',
            '1H': '15m'
        };
        return timeframeMap[setupTimeframe] || '1h';
    }
    /**
     * NEW: Get enhanced signal with full market context (for API responses)
     * Backward compatible - returns EnhancedSignal with extra fields
     */
    async getEnhancedSignal(signalId) {
        try {
            const dbSignal = await prisma.signal.findUnique({
                where: { id: signalId }
            });
            if (!dbSignal)
                return null;
            // Build base signal
            const baseSignal = {
                id: dbSignal.id,
                coin: dbSignal.coin,
                symbol: dbSignal.symbol,
                direction: dbSignal.direction,
                timeframe: dbSignal.timeframe,
                strategy: dbSignal.strategy,
                entry: (dbSignal.entryMin + dbSignal.entryMax) / 2,
                entryMin: dbSignal.entryMin,
                entryMax: dbSignal.entryMax,
                stopLoss: dbSignal.stopLoss,
                takeProfit1: dbSignal.target1,
                takeProfit2: dbSignal.target2 || dbSignal.target1 * 1.5,
                riskReward: (dbSignal.target1 - (dbSignal.entryMin + dbSignal.entryMax) / 2) /
                    Math.abs(dbSignal.stopLoss - (dbSignal.entryMin + dbSignal.entryMax) / 2),
                confidence: dbSignal.confidence,
                status: dbSignal.status,
                expiresAt: dbSignal.expiresAt,
                createdAt: dbSignal.createdAt
            };
            // Get current market state for this symbol
            const state = marketStateEngine_1.marketStateEngine.getState(dbSignal.symbol, dbSignal.timeframe);
            const context = marketStateEngine_1.marketStateEngine.getMarketContext(dbSignal.symbol, dbSignal.timeframe);
            // Build visuals
            const visuals = visualMappingEngine_1.visualMappingEngine.mapStateToOverlays(state, undefined, {
                candleLimit: 100
            });
            // Build market story
            const marketStory = visualMappingEngine_1.visualMappingEngine.generateMarketStory(state);
            return {
                ...baseSignal,
                marketContext: context,
                structureContext: {
                    sweepDetected: state.sweptLiquidity.length > 0,
                    bosConfirmed: !!state.marketStructure.lastBOS,
                    trendAlignment: state.marketStructure.trend === 'bullish' && baseSignal.direction === 'LONG' ||
                        state.marketStructure.trend === 'bearish' && baseSignal.direction === 'SHORT'
                },
                visuals,
                marketStory
            };
        }
        catch (error) {
            console.error('Error fetching enhanced signal:', error);
            return null;
        }
    }
}
// Export singleton
exports.signalEngine = new SignalEngine();
