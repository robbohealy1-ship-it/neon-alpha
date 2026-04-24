"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const telegramService_1 = require("../services/telegramService");
const AlertHistory_1 = require("../models/AlertHistory");
const crypto_1 = require("crypto");
const router = (0, express_1.Router)();
/**
 * POST /api/telegram/signal
 * Send a new trading signal alert to Telegram
 */
router.post('/signal', async (req, res) => {
    try {
        const signal = req.body;
        // Validate required fields
        if (!signal.coin || !signal.direction || !signal.entry || !signal.stopLoss || !signal.takeProfit) {
            return res.status(400).json({
                error: 'Missing required fields: coin, direction, entry, stopLoss, takeProfit'
            });
        }
        // Check rate limiting (1 alert per coin per 10 minutes)
        if (!AlertHistory_1.alertHistory.canSendAlert(signal.coin)) {
            const minutesRemaining = AlertHistory_1.alertHistory.getTimeUntilNextAlert(signal.coin);
            return res.status(429).json({
                error: 'Rate limit exceeded',
                message: `Please wait ${minutesRemaining} minutes before sending another alert for ${signal.coin}`,
                retryAfter: minutesRemaining * 60
            });
        }
        // Send Telegram alert
        const success = await (0, telegramService_1.sendTelegramAlert)(signal);
        // Record in history
        const alertRecord = {
            id: (0, crypto_1.randomUUID)(),
            signalId: (0, crypto_1.randomUUID)(),
            coin: signal.coin,
            direction: signal.direction,
            sentAt: new Date(),
            status: (success ? 'sent' : 'failed'),
            error: success ? undefined : 'Failed to send Telegram message'
        };
        AlertHistory_1.alertHistory.addAlert(alertRecord);
        if (success) {
            res.json({
                success: true,
                message: `Alert sent for ${signal.coin} ${signal.direction}`,
                alertId: alertRecord.id
            });
        }
        else {
            res.status(500).json({
                error: 'Failed to send Telegram alert',
                message: 'Check bot token and chat ID configuration'
            });
        }
    }
    catch (error) {
        console.error('Error in /signal endpoint:', error);
        res.status(500).json({ error: 'Server error' });
    }
});
/**
 * POST /api/telegram/test
 * Send a test message to verify Telegram integration
 */
router.post('/test', async (req, res) => {
    try {
        const success = await (0, telegramService_1.sendTestMessage)();
        if (success) {
            res.json({ success: true, message: 'Test message sent successfully' });
        }
        else {
            res.status(500).json({
                error: 'Failed to send test message',
                message: 'Check TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID in .env'
            });
        }
    }
    catch (error) {
        console.error('Error in /test endpoint:', error);
        res.status(500).json({ error: 'Server error' });
    }
});
/**
 * GET /api/telegram/status
 * Check Telegram bot status and configuration
 */
router.get('/status', async (req, res) => {
    try {
        const botInfo = await (0, telegramService_1.getBotInfo)();
        const hasToken = !!process.env.TELEGRAM_BOT_TOKEN;
        const hasChatId = !!process.env.TELEGRAM_CHAT_ID;
        res.json({
            configured: hasToken && hasChatId,
            hasToken,
            hasChatId,
            botName: botInfo?.username,
            botId: botInfo?.id,
            canSendMessages: hasToken && hasChatId
        });
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to check status' });
    }
});
/**
 * GET /api/telegram/history
 * Get recent alert history
 */
router.get('/history', async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 50;
        const alerts = AlertHistory_1.alertHistory.getRecentAlerts(limit);
        res.json({
            count: alerts.length,
            alerts: alerts.map(a => ({
                ...a,
                sentAt: a.sentAt.toISOString()
            }))
        });
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to fetch history' });
    }
});
/**
 * GET /api/telegram/rate-limit/:coin
 * Check rate limit status for a specific coin
 */
router.get('/rate-limit/:coin', async (req, res) => {
    try {
        const { coin } = req.params;
        const canSend = AlertHistory_1.alertHistory.canSendAlert(coin);
        const minutesRemaining = AlertHistory_1.alertHistory.getTimeUntilNextAlert(coin);
        res.json({
            coin,
            canSend,
            minutesRemaining,
            nextAvailable: canSend ? 'now' : `in ${minutesRemaining} minutes`
        });
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to check rate limit' });
    }
});
exports.default = router;
