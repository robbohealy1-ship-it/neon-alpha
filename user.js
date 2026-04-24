"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const client_1 = require("@prisma/client");
const auth_1 = require("../middleware/auth");
const router = (0, express_1.Router)();
const prisma = new client_1.PrismaClient();
router.use(auth_1.authenticateToken);
router.get('/profile', async (req, res) => {
    try {
        if (!req.userId) {
            return res.status(401).json({ error: 'Unauthorized' });
        }
        const user = await prisma.user.findUnique({
            where: { id: req.userId },
            select: {
                id: true,
                email: true,
                name: true,
                subscriptionTier: true,
                subscriptionStatus: true
            }
        });
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }
        return res.json(user);
    }
    catch (error) {
        console.error('Failed to fetch profile:', error);
        return res.status(500).json({ error: 'Failed to fetch profile' });
    }
});
router.put('/profile', async (req, res) => {
    try {
        if (!req.userId) {
            return res.status(401).json({ error: 'Unauthorized' });
        }
        const { name, email } = req.body;
        if (!email || typeof email !== 'string') {
            return res.status(400).json({ error: 'Valid email is required' });
        }
        const normalizedEmail = email.trim().toLowerCase();
        const normalizedName = typeof name === 'string' ? name.trim() : null;
        const existing = await prisma.user.findUnique({ where: { email: normalizedEmail } });
        if (existing && existing.id !== req.userId) {
            return res.status(409).json({ error: 'Email is already in use' });
        }
        const updatedUser = await prisma.user.update({
            where: { id: req.userId },
            data: {
                email: normalizedEmail,
                name: normalizedName
            },
            select: {
                id: true,
                email: true,
                name: true,
                subscriptionTier: true,
                subscriptionStatus: true
            }
        });
        return res.json(updatedUser);
    }
    catch (error) {
        console.error('Failed to update profile:', error);
        return res.status(500).json({ error: 'Failed to update profile' });
    }
});
exports.default = router;
