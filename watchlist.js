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
        const items = await prisma.watchlistItem.findMany({
            where: { userId: req.userId },
            orderBy: { createdAt: 'desc' }
        });
        res.json(items);
    }
    catch (error) {
        res.status(500).json({ error: 'Server error' });
    }
});
router.post('/', async (req, res) => {
    try {
        const { symbol, sentiment, notes } = req.body;
        console.log('POST /watchlist - Request:', { symbol, sentiment, notes, userId: req.userId });
        const item = await prisma.watchlistItem.create({
            data: {
                userId: req.userId,
                symbol,
                sentiment: sentiment || 'neutral',
                notes
            }
        });
        console.log('Watchlist item created successfully:', item.id);
        res.json(item);
    }
    catch (error) {
        console.error('Watchlist create error:', error);
        console.error('Error code:', error.code);
        console.error('Error meta:', error.meta);
        res.status(500).json({
            error: 'Server error',
            details: error.message,
            code: error.code
        });
    }
});
router.put('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { sentiment, notes } = req.body;
        const item = await prisma.watchlistItem.update({
            where: { id },
            data: { sentiment, notes }
        });
        res.json(item);
    }
    catch (error) {
        res.status(500).json({ error: 'Server error' });
    }
});
router.delete('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        await prisma.watchlistItem.delete({
            where: { id }
        });
        res.json({ success: true });
    }
    catch (error) {
        res.status(500).json({ error: 'Server error' });
    }
});
exports.default = router;
