"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const client_1 = require("@prisma/client");
const router = (0, express_1.Router)();
const prisma = new client_1.PrismaClient();
router.post('/signup', async (req, res) => {
    try {
        const { email, password, name } = req.body;
        const existingUser = await prisma.user.findUnique({ where: { email } });
        if (existingUser) {
            return res.status(400).json({ error: 'User already exists' });
        }
        const hashedPassword = await bcryptjs_1.default.hash(password, 10);
        const user = await prisma.user.create({
            data: {
                email,
                password: hashedPassword,
                name,
                subscriptionTier: 'basic'
            }
        });
        const token = jsonwebtoken_1.default.sign({ userId: user.id }, process.env.JWT_SECRET, {
            expiresIn: '7d'
        });
        res.json({
            token,
            user: {
                id: user.id,
                email: user.email,
                name: user.name,
                subscriptionTier: user.subscriptionTier
            }
        });
    }
    catch (error) {
        res.status(500).json({ error: 'Server error' });
    }
});
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        const user = await prisma.user.findUnique({ where: { email } });
        if (!user) {
            return res.status(400).json({ error: 'Invalid credentials' });
        }
        const validPassword = await bcryptjs_1.default.compare(password, user.password);
        if (!validPassword) {
            return res.status(400).json({ error: 'Invalid credentials' });
        }
        const token = jsonwebtoken_1.default.sign({ userId: user.id }, process.env.JWT_SECRET, {
            expiresIn: '7d'
        });
        res.json({
            token,
            user: {
                id: user.id,
                email: user.email,
                name: user.name,
                subscriptionTier: user.subscriptionTier
            }
        });
    }
    catch (error) {
        console.error('[Login Error]', error?.message || error);
        res.status(500).json({ error: 'Server error', message: error?.message });
    }
});
// Social login (Google, Apple)
router.post('/social', async (req, res) => {
    try {
        const { provider, email, name } = req.body;
        if (!email || !provider) {
            return res.status(400).json({ error: 'Missing required fields' });
        }
        // Check if user exists
        let user = await prisma.user.findUnique({ where: { email } });
        if (!user) {
            // Create new user from social login
            const randomPassword = Math.random().toString(36).substring(2, 15);
            const hashedPassword = await bcryptjs_1.default.hash(randomPassword, 10);
            user = await prisma.user.create({
                data: {
                    email,
                    password: hashedPassword,
                    name: name || `${provider.charAt(0).toUpperCase() + provider.slice(1)} User`,
                    subscriptionTier: 'basic'
                }
            });
        }
        const token = jsonwebtoken_1.default.sign({ userId: user.id }, process.env.JWT_SECRET, {
            expiresIn: '7d'
        });
        res.json({
            token,
            user: {
                id: user.id,
                email: user.email,
                name: user.name,
                subscriptionTier: user.subscriptionTier
            }
        });
    }
    catch (error) {
        console.error('Social login error:', error);
        res.status(500).json({ error: 'Social login failed' });
    }
});
exports.default = router;
