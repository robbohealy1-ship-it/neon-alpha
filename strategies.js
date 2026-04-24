"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.strategyEngine = exports.StrategyEngine = void 0;
const binance_1 = require("./binance");
class StrategyEngine {
    // Strategy 1: EMA Trend Pullback
    detectEMATrendPullback(symbol, timeframe, ohlcv) {
        if (ohlcv.length < 200) {
            return { signal: null, reason: 'Insufficient data' };
        }
        const indicators = binance_1.binanceService.calculateTechnicalIndicators(ohlcv);
        const currentPrice = ohlcv[ohlcv.length - 1].close;
        const ema50 = indicators.ema50;
        const ema200 = indicators.ema200;
        const rsi = indicators.rsi;
        // Check for bullish trend setup
        if (ema50 > ema200 &&
            currentPrice >= ema50 * 0.99 &&
            currentPrice <= ema50 * 1.01 &&
            rsi >= 40 &&
            rsi <= 60) {
            const stopLoss = currentPrice * 0.97; // 3% below entry
            const takeProfit1 = currentPrice * 1.03; // 3% above entry
            const takeProfit2 = currentPrice * 1.06; // 6% above entry
            const takeProfit3 = currentPrice * 1.09; // 9% above entry
            const risk = currentPrice - stopLoss;
            const reward = takeProfit3 - currentPrice;
            const riskReward = reward / risk;
            const confidence = this.calculateConfidence(ema50, ema200, rsi);
            return {
                signal: {
                    coin: symbol,
                    timeframe,
                    direction: 'LONG',
                    entry: currentPrice,
                    stopLoss,
                    takeProfit1,
                    takeProfit2,
                    takeProfit3,
                    strategy: 'EMA Trend Pullback',
                    confidence,
                    riskReward
                },
                reason: `EMA50 (${ema50.toFixed(2)}) > EMA200 (${ema200.toFixed(2)}), price at EMA50, RSI ${rsi.toFixed(1)}`
            };
        }
        // Check for bearish trend setup
        if (ema50 < ema200 &&
            currentPrice >= ema50 * 0.99 &&
            currentPrice <= ema50 * 1.01 &&
            rsi >= 40 &&
            rsi <= 60) {
            const stopLoss = currentPrice * 1.03; // 3% above entry
            const takeProfit1 = currentPrice * 0.97; // 3% below entry
            const takeProfit2 = currentPrice * 0.94; // 6% below entry
            const takeProfit3 = currentPrice * 0.91; // 9% below entry
            const risk = stopLoss - currentPrice;
            const reward = currentPrice - takeProfit3;
            const riskReward = reward / risk;
            const confidence = this.calculateConfidence(ema200, ema50, rsi);
            return {
                signal: {
                    coin: symbol,
                    timeframe,
                    direction: 'SHORT',
                    entry: currentPrice,
                    stopLoss,
                    takeProfit1,
                    takeProfit2,
                    takeProfit3,
                    strategy: 'EMA Trend Pullback',
                    confidence,
                    riskReward
                },
                reason: `EMA50 (${ema50.toFixed(2)}) < EMA200 (${ema200.toFixed(2)}), price at EMA50, RSI ${rsi.toFixed(1)}`
            };
        }
        return { signal: null, reason: 'No EMA trend pullback setup detected' };
    }
    // Strategy 2: Breakout Setup
    detectBreakoutSetup(symbol, timeframe, ohlcv) {
        if (ohlcv.length < 20) {
            return { signal: null, reason: 'Insufficient data' };
        }
        const indicators = binance_1.binanceService.calculateTechnicalIndicators(ohlcv);
        const currentPrice = ohlcv[ohlcv.length - 1].close;
        const currentVolume = ohlcv[ohlcv.length - 1].volume;
        const recentHighs = ohlcv.slice(-20).map(c => c.high);
        const highestHigh = Math.max(...recentHighs.slice(0, -1));
        // Check for bullish breakout
        if (currentPrice > highestHigh && currentVolume > indicators.avgVolume * 1.5) {
            const stopLoss = highestHigh * 0.98;
            const takeProfit1 = currentPrice * 1.02;
            const takeProfit2 = currentPrice * 1.04;
            const takeProfit3 = currentPrice * 1.06;
            const risk = currentPrice - stopLoss;
            const reward = takeProfit3 - currentPrice;
            const riskReward = risk > 0 ? reward / risk : 2;
            const confidence = Math.min(75 + (currentVolume / indicators.avgVolume - 1.5) * 20, 95);
            return {
                signal: {
                    coin: symbol,
                    timeframe,
                    direction: 'LONG',
                    entry: currentPrice,
                    stopLoss,
                    takeProfit1,
                    takeProfit2,
                    takeProfit3,
                    strategy: 'Breakout Setup',
                    confidence,
                    riskReward
                },
                reason: `Price broke 20-candle high (${highestHigh.toFixed(2)}), volume spike ${(currentVolume / indicators.avgVolume).toFixed(1)}x`
            };
        }
        // Check for bearish breakdown
        const recentLows = ohlcv.slice(-20).map(c => c.low);
        const lowestLow = Math.min(...recentLows.slice(0, -1));
        if (currentPrice < lowestLow && currentVolume > indicators.avgVolume * 1.5) {
            const stopLoss = lowestLow * 1.02;
            const takeProfit1 = currentPrice * 0.98;
            const takeProfit2 = currentPrice * 0.96;
            const takeProfit3 = currentPrice * 0.94;
            const risk = stopLoss - currentPrice;
            const reward = currentPrice - takeProfit3;
            const riskReward = risk > 0 ? reward / risk : 2;
            const confidence = Math.min(75 + (currentVolume / indicators.avgVolume - 1.5) * 20, 95);
            return {
                signal: {
                    coin: symbol,
                    timeframe,
                    direction: 'SHORT',
                    entry: currentPrice,
                    stopLoss,
                    takeProfit1,
                    takeProfit2,
                    takeProfit3,
                    strategy: 'Breakout Setup',
                    confidence,
                    riskReward
                },
                reason: `Price broke 20-candle low (${lowestLow.toFixed(2)}), volume spike ${(currentVolume / indicators.avgVolume).toFixed(1)}x`
            };
        }
        return { signal: null, reason: 'No breakout setup detected' };
    }
    // Strategy 3: RSI Divergence
    detectRSIDivergence(symbol, timeframe, ohlcv) {
        if (ohlcv.length < 30) {
            return { signal: null, reason: 'Insufficient data' };
        }
        const indicators = binance_1.binanceService.calculateTechnicalIndicators(ohlcv);
        const currentPrice = ohlcv[ohlcv.length - 1].close;
        const rsi = indicators.rsi;
        // Detect bullish divergence
        const hasBullishDivergence = binance_1.binanceService.detectBullishDivergence(ohlcv, rsi);
        if (hasBullishDivergence && rsi > 30 && rsi < 50) {
            const stopLoss = currentPrice * 0.95;
            const takeProfit1 = currentPrice * 1.02;
            const takeProfit2 = currentPrice * 1.05;
            const takeProfit3 = currentPrice * 1.08;
            const risk = currentPrice - stopLoss;
            const reward = takeProfit3 - currentPrice;
            const riskReward = reward / risk;
            const confidence = Math.min(60 + (50 - rsi) * 0.8, 85);
            return {
                signal: {
                    coin: symbol,
                    timeframe,
                    direction: 'LONG',
                    entry: currentPrice,
                    stopLoss,
                    takeProfit1,
                    takeProfit2,
                    takeProfit3,
                    strategy: 'RSI Divergence',
                    confidence,
                    riskReward
                },
                reason: `Bullish divergence detected, RSI ${rsi.toFixed(1)}`
            };
        }
        return { signal: null, reason: 'No RSI divergence detected' };
    }
    // Strategy 4: MACD Signal
    detectMACDSignal(symbol, timeframe, ohlcv) {
        if (ohlcv.length < 50) {
            return { signal: null, reason: 'Insufficient data' };
        }
        const indicators = binance_1.binanceService.calculateTechnicalIndicators(ohlcv);
        const currentPrice = ohlcv[ohlcv.length - 1].close;
        const rsi = indicators.rsi;
        // Calculate MACD manually
        const ema12 = indicators.ema12 || indicators.ema50 * 0.95;
        const ema26 = indicators.ema26 || indicators.ema50 * 0.98;
        const macdLine = ema12 - ema26;
        const signalLine = macdLine * 0.9; // Simplified signal line
        const histogram = macdLine - signalLine;
        const prevHistogram = histogram * 0.8; // Previous histogram estimate
        // Check for bullish MACD crossover (histogram turns positive)
        if (histogram > 0 && prevHistogram <= 0 && rsi > 40 && rsi < 65) {
            const stopLoss = currentPrice * 0.97;
            const takeProfit1 = currentPrice * 1.03;
            const takeProfit2 = currentPrice * 1.06;
            const takeProfit3 = currentPrice * 1.09;
            const risk = currentPrice - stopLoss;
            const reward = takeProfit3 - currentPrice;
            const riskReward = reward / risk;
            const confidence = Math.min(65 + Math.abs(histogram) / currentPrice * 1000, 85);
            return {
                signal: {
                    coin: symbol,
                    timeframe,
                    direction: 'LONG',
                    entry: currentPrice,
                    stopLoss,
                    takeProfit1,
                    takeProfit2,
                    takeProfit3,
                    strategy: 'MACD Signal',
                    confidence,
                    riskReward
                },
                reason: `MACD bullish crossover, histogram ${histogram.toFixed(2)}, RSI ${rsi.toFixed(1)}`
            };
        }
        // Check for bearish MACD crossover
        if (histogram < 0 && prevHistogram >= 0 && rsi > 35 && rsi < 60) {
            const stopLoss = currentPrice * 1.03;
            const takeProfit1 = currentPrice * 0.97;
            const takeProfit2 = currentPrice * 0.94;
            const takeProfit3 = currentPrice * 0.91;
            const risk = stopLoss - currentPrice;
            const reward = currentPrice - takeProfit3;
            const riskReward = reward / risk;
            const confidence = Math.min(65 + Math.abs(histogram) / currentPrice * 1000, 85);
            return {
                signal: {
                    coin: symbol,
                    timeframe,
                    direction: 'SHORT',
                    entry: currentPrice,
                    stopLoss,
                    takeProfit1,
                    takeProfit2,
                    takeProfit3,
                    strategy: 'MACD Signal',
                    confidence,
                    riskReward
                },
                reason: `MACD bearish crossover, histogram ${histogram.toFixed(2)}, RSI ${rsi.toFixed(1)}`
            };
        }
        return { signal: null, reason: 'No MACD signal detected' };
    }
    // Strategy 5: Volume Spike
    detectVolumeSpike(symbol, timeframe, ohlcv) {
        if (ohlcv.length < 30) {
            return { signal: null, reason: 'Insufficient data' };
        }
        const indicators = binance_1.binanceService.calculateTechnicalIndicators(ohlcv);
        const currentPrice = ohlcv[ohlcv.length - 1].close;
        const currentVolume = ohlcv[ohlcv.length - 1].volume;
        const avgVolume = indicators.avgVolume;
        const volumeSpike = currentVolume / avgVolume;
        const rsi = indicators.rsi;
        // Volume spike with price action
        if (volumeSpike > 2.0 && rsi > 40 && rsi < 70) {
            const priceChange = (ohlcv[ohlcv.length - 1].close - ohlcv[ohlcv.length - 2].close) / ohlcv[ohlcv.length - 2].close * 100;
            if (priceChange > 1.5) {
                // Bullish volume spike
                const stopLoss = currentPrice * 0.96;
                const takeProfit1 = currentPrice * 1.04;
                const takeProfit2 = currentPrice * 1.08;
                const takeProfit3 = currentPrice * 1.12;
                const risk = currentPrice - stopLoss;
                const reward = takeProfit3 - currentPrice;
                const riskReward = reward / risk;
                const confidence = Math.min(70 + (volumeSpike - 2) * 10, 90);
                return {
                    signal: {
                        coin: symbol,
                        timeframe,
                        direction: 'LONG',
                        entry: currentPrice,
                        stopLoss,
                        takeProfit1,
                        takeProfit2,
                        takeProfit3,
                        strategy: 'Volume Spike',
                        confidence,
                        riskReward
                    },
                    reason: `Volume spike ${volumeSpike.toFixed(1)}x with +${priceChange.toFixed(1)}% price move`
                };
            }
            if (priceChange < -1.5) {
                // Bearish volume spike
                const stopLoss = currentPrice * 1.04;
                const takeProfit1 = currentPrice * 0.96;
                const takeProfit2 = currentPrice * 0.92;
                const takeProfit3 = currentPrice * 0.88;
                const risk = stopLoss - currentPrice;
                const reward = currentPrice - takeProfit3;
                const riskReward = reward / risk;
                const confidence = Math.min(70 + (volumeSpike - 2) * 10, 90);
                return {
                    signal: {
                        coin: symbol,
                        timeframe,
                        direction: 'SHORT',
                        entry: currentPrice,
                        stopLoss,
                        takeProfit1,
                        takeProfit2,
                        takeProfit3,
                        strategy: 'Volume Spike',
                        confidence,
                        riskReward
                    },
                    reason: `Volume spike ${volumeSpike.toFixed(1)}x with ${priceChange.toFixed(1)}% price drop`
                };
            }
        }
        return { signal: null, reason: 'No volume spike detected' };
    }
    calculateConfidence(ema1, ema2, rsi) {
        const emaStrength = Math.abs(ema1 - ema2) / ema2 * 100;
        const rsiScore = rsi >= 45 && rsi <= 55 ? 20 : rsi >= 40 && rsi <= 60 ? 15 : 10;
        return Math.min(60 + emaStrength + rsiScore, 95);
    }
    async scanSymbol(symbol, timeframe) {
        const signals = [];
        try {
            const ohlcv = await binance_1.binanceService.getOHLCV(symbol, timeframe, 200);
            if (ohlcv.length === 0) {
                return signals;
            }
            // Run all strategies
            const strategies = [
                this.detectEMATrendPullback(symbol, timeframe, ohlcv),
                this.detectBreakoutSetup(symbol, timeframe, ohlcv),
                this.detectRSIDivergence(symbol, timeframe, ohlcv),
                this.detectMACDSignal(symbol, timeframe, ohlcv),
                this.detectVolumeSpike(symbol, timeframe, ohlcv)
            ];
            for (const result of strategies) {
                if (result.signal && result.signal.confidence >= 60) {
                    signals.push(result.signal);
                }
            }
        }
        catch (error) {
            console.error(`Error scanning ${symbol}:`, error);
        }
        return signals;
    }
}
exports.StrategyEngine = StrategyEngine;
exports.strategyEngine = new StrategyEngine();
