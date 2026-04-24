"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendTelegramAlert = sendTelegramAlert;
exports.sendTestMessage = sendTestMessage;
exports.getBotInfo = getBotInfo;
const axios_1 = __importDefault(require("axios"));
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;
/**
 * Send a formatted trading signal alert to Telegram
 */
async function sendTelegramAlert(signal) {
    if (!BOT_TOKEN || !CHAT_ID) {
        console.error('Telegram credentials not configured');
        return false;
    }
    const coinSymbol = signal.coin.replace('USDT', '');
    const riskPercent = Math.abs((signal.entry - signal.stopLoss) / signal.entry * 100).toFixed(2);
    // Determine emoji based on direction
    const directionEmoji = signal.direction === 'LONG' ? '🟢' : '🔴';
    const directionText = signal.direction === 'LONG' ? 'LONG' : 'SHORT';
    // Format message
    const message = `
🚨 <b>NEW SIGNAL</b>

${directionEmoji} <b>${coinSymbol}/USDT — ${directionText}</b>

📍 <b>Entry:</b> ${signal.entry.toLocaleString()}
🛑 <b>Stop Loss:</b> ${signal.stopLoss.toLocaleString()}
🎯 <b>Take Profit:</b> ${signal.takeProfit.toLocaleString()}

📊 <b>Risk:</b> ${riskPercent}%
💪 <b>Confidence:</b> ${signal.confidence}%

⏳ <b>Expires in:</b> 2 hours

#crypto #${coinSymbol} #trading #${directionText.toLowerCase()}
`;
    try {
        const url = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`;
        const response = await axios_1.default.post(url, {
            chat_id: CHAT_ID,
            text: message,
            parse_mode: 'HTML',
            disable_web_page_preview: true
        });
        if (response.data.ok) {
            console.log(`✅ Telegram alert sent for ${coinSymbol} ${directionText}`);
            return true;
        }
        else {
            console.error('Telegram API error:', response.data);
            return false;
        }
    }
    catch (error) {
        console.error('Failed to send Telegram alert:', error);
        return false;
    }
}
/**
 * Send test message to verify bot is working
 */
async function sendTestMessage() {
    if (!BOT_TOKEN || !CHAT_ID) {
        console.error('Telegram credentials not configured');
        return false;
    }
    try {
        const url = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`;
        const response = await axios_1.default.post(url, {
            chat_id: CHAT_ID,
            text: '✅ <b>Neon Signal Engine</b> is now connected!\n\nYou will receive trading alerts here.',
            parse_mode: 'HTML'
        });
        return response.data.ok;
    }
    catch (error) {
        console.error('Failed to send test message:', error);
        return false;
    }
}
/**
 * Get bot info to verify token is valid
 */
async function getBotInfo() {
    if (!BOT_TOKEN) {
        return null;
    }
    try {
        const url = `https://api.telegram.org/bot${BOT_TOKEN}/getMe`;
        const response = await axios_1.default.get(url);
        return response.data.ok ? response.data.result : null;
    }
    catch (error) {
        console.error('Failed to get bot info:', error);
        return null;
    }
}
