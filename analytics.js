"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const client_1 = require("@prisma/client");
const auth_1 = require("../middleware/auth");
const router = (0, express_1.Router)();
const prisma = new client_1.PrismaClient();
router.use(auth_1.authenticateToken);
router.get('/performance', async (req, res) => {
    try {
        const trades = await prisma.trade.findMany({
            where: {
                userId: req.userId,
                status: 'closed'
            }
        });
        const totalTrades = trades.length;
        const winningTrades = trades.filter(t => (t.pnl || 0) > 0);
        const losingTrades = trades.filter(t => (t.pnl || 0) < 0);
        const winRate = totalTrades > 0 ? (winningTrades.length / totalTrades) * 100 : 0;
        const totalPnl = trades.reduce((sum, t) => sum + (t.pnl || 0), 0);
        const avgWin = winningTrades.length > 0
            ? winningTrades.reduce((sum, t) => sum + (t.pnl || 0), 0) / winningTrades.length
            : 0;
        const avgLoss = losingTrades.length > 0
            ? Math.abs(losingTrades.reduce((sum, t) => sum + (t.pnl || 0), 0) / losingTrades.length)
            : 0;
        const riskRewardRatio = avgLoss > 0 ? avgWin / avgLoss : 0;
        const chartData = trades.slice(-30).map(trade => ({
            date: trade.exitDate?.toISOString().split('T')[0] || trade.createdAt.toISOString().split('T')[0],
            pnl: trade.pnl || 0
        }));
        res.json({
            totalTrades,
            winningTrades: winningTrades.length,
            losingTrades: losingTrades.length,
            winRate: Math.round(winRate * 100) / 100,
            totalPnl: Math.round(totalPnl * 100) / 100,
            avgWin: Math.round(avgWin * 100) / 100,
            avgLoss: Math.round(avgLoss * 100) / 100,
            riskRewardRatio: Math.round(riskRewardRatio * 100) / 100,
            chartData
        });
    }
    catch (error) {
        res.status(500).json({ error: 'Server error' });
    }
});
exports.default = router;
