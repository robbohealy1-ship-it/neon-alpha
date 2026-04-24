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
        const alerts = await prisma.alert.findMany({
            where: { userId: req.userId },
            orderBy: { createdAt: 'desc' },
            take: 50
        });
        res.json(alerts);
    }
    catch (error) {
        res.status(500).json({ error: 'Server error' });
    }
});
router.post('/', async (req, res) => {
    try {
        const { type, asset, message, severity } = req.body;
        const alert = await prisma.alert.create({
            data: {
                userId: req.userId,
                type,
                asset,
                message,
                severity: severity || 'info'
            }
        });
        res.json(alert);
    }
    catch (error) {
        res.status(500).json({ error: 'Server error' });
    }
});
router.put('/:id/read', async (req, res) => {
    try {
        const { id } = req.params;
        const alert = await prisma.alert.update({
            where: { id },
            data: { read: true }
        });
        res.json(alert);
    }
    catch (error) {
        res.status(500).json({ error: 'Server error' });
    }
});
router.delete('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        await prisma.alert.delete({
            where: { id }
        });
        res.json({ success: true });
    }
    catch (error) {
        res.status(500).json({ error: 'Server error' });
    }
});
exports.default = router;
