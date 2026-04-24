"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const client_1 = require("@prisma/client");
const auth_1 = require("../middleware/auth");
const router = (0, express_1.Router)();
const prisma = new client_1.PrismaClient();
router.use(auth_1.authenticateToken);
router.get('/', async (req, res) => {
    try {
        const trades = await prisma.trade.findMany({
            where: { userId: req.userId },
            orderBy: { createdAt: 'desc' }
        });
        res.json(trades);
    }
    catch (error) {
        res.status(500).json({ error: 'Server error' });
    }
});
router.post('/', async (req, res) => {
    try {
        const { asset, direction, entry, exit, size, notes, status } = req.body;
        // Convert to numbers
        const entryNum = parseFloat(entry);
        const exitNum = exit ? parseFloat(exit) : null;
        const sizeNum = parseFloat(size);
        if (isNaN(entryNum) || isNaN(sizeNum)) {
            return res.status(400).json({ error: 'Invalid entry or size value' });
        }
        let pnl = null;
        let pnlPercent = null;
        if (exitNum && status === 'closed') {
            if (direction === 'long') {
                pnl = (exitNum - entryNum) * sizeNum;
                pnlPercent = ((exitNum - entryNum) / entryNum) * 100;
            }
            else {
                pnl = (entryNum - exitNum) * sizeNum;
                pnlPercent = ((entryNum - exitNum) / entryNum) * 100;
            }
        }
        const trade = await prisma.trade.create({
            data: {
                userId: req.userId,
                asset: asset.toUpperCase(),
                direction,
                entry: entryNum,
                exit: exitNum,
                size: sizeNum,
                pnl,
                pnlPercent,
                status: status || 'open',
                notes,
                exitDate: exitNum ? new Date() : null
            }
        });
        res.json(trade);
    }
    catch (error) {
        console.error('Trade creation error:', error);
        console.error('Error code:', error.code);
        console.error('Error meta:', error.meta);
        res.status(500).json({
            error: 'Failed to create trade',
            details: error.message,
            code: error.code
        });
    }
});
router.put('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { exit, status, notes } = req.body;
        console.log('PUT /trades/:id - Request:', { id, body: req.body, userId: req.userId });
        const existingTrade = await prisma.trade.findFirst({
            where: { id, userId: req.userId }
        });
        console.log('Existing trade found:', existingTrade?.id);
        if (!existingTrade) {
            console.log('Trade not found');
            return res.status(404).json({ error: 'Trade not found' });
        }
        let pnl = existingTrade.pnl;
        let pnlPercent = existingTrade.pnlPercent;
        if (exit && status === 'closed') {
            const exitNum = parseFloat(exit);
            console.log('Calculating P&L:', { exitNum, direction: existingTrade.direction, entry: existingTrade.entry, size: existingTrade.size });
            if (existingTrade.direction === 'long') {
                pnl = (exitNum - existingTrade.entry) * existingTrade.size;
                pnlPercent = ((exitNum - existingTrade.entry) / existingTrade.entry) * 100;
            }
            else {
                pnl = (existingTrade.entry - exitNum) * existingTrade.size;
                pnlPercent = ((existingTrade.entry - exitNum) / existingTrade.entry) * 100;
            }
            console.log('Calculated P&L:', { pnl, pnlPercent });
        }
        const trade = await prisma.trade.update({
            where: { id },
            data: {
                exit: exit ? parseFloat(exit) : existingTrade.exit,
                status,
                notes,
                pnl,
                pnlPercent,
                exitDate: status === 'closed' ? new Date() : null
            }
        });
        console.log('Trade updated successfully:', trade.id);
        res.json(trade);
    }
    catch (error) {
        console.error('Trade update error:', error);
        console.error('Error code:', error.code);
        console.error('Error meta:', error.meta);
        res.status(500).json({
            error: 'Server error',
            details: error.message,
            code: error.code
        });
    }
});
router.delete('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        await prisma.trade.delete({
            where: { id }
        });
        res.json({ success: true });
    }
    catch (error) {
        res.status(500).json({ error: 'Server error' });
    }
});
exports.default = router;
