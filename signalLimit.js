"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const signalLimitService_1 = require("../services/signalLimitService");
const subscriptionService_1 = require("../services/subscriptionService");
const auth_1 = require("../middleware/auth");
const router = (0, express_1.Router)();
// Get today's signal limit status
router.get('/status', auth_1.authenticateToken, async (req, res) => {
    try {
        const userId = req.user?.id;
        if (!userId) {
            return res.status(401).json({ error: 'Unauthorized' });
        }
        // Check if user has active subscription
        const subscriptionStatus = subscriptionService_1.subscriptionService.getSubscriptionStatus(userId);
        const isPaidUser = subscriptionStatus.isActive && (subscriptionStatus.plan === 'basic' || subscriptionStatus.plan === 'pro');
        const status = await signalLimitService_1.signalLimitService.getTodayStatus(userId, isPaidUser);
        res.json({
            allowed: status.allowed,
            signalsViewed: status.signalsViewed,
            remainingFree: status.remainingFree,
            limitReached: status.limitReached,
            isPaidUser: status.isPaidUser,
            freeLimit: 1,
        });
    }
    catch (error) {
        console.error('Error getting signal limit status:', error);
        res.status(500).json({ error: 'Failed to get signal limit status' });
    }
});
// Check if user can view signals and increment count
router.post('/view', auth_1.authenticateToken, async (req, res) => {
    try {
        const userId = req.user?.id;
        if (!userId) {
            return res.status(401).json({ error: 'Unauthorized' });
        }
        // Check if user has active subscription
        const subscriptionStatus = subscriptionService_1.subscriptionService.getSubscriptionStatus(userId);
        const isPaidUser = subscriptionStatus.isActive && (subscriptionStatus.plan === 'basic' || subscriptionStatus.plan === 'pro');
        // First check if allowed
        const checkResult = await signalLimitService_1.signalLimitService.checkSignalLimit(userId, isPaidUser);
        if (!checkResult.allowed) {
            return res.status(403).json({
                error: 'FREE_LIMIT_REACHED',
                message: 'You have reached your daily free signal limit. Upgrade to unlock unlimited signals.',
                signalsViewed: checkResult.signalsViewed,
                remainingFree: 0,
                limitReached: true,
                isPaidUser: false,
            });
        }
        // Increment the view count
        const status = await signalLimitService_1.signalLimitService.incrementSignalView(userId);
        res.json({
            allowed: status.allowed,
            signalsViewed: status.signalsViewed,
            remainingFree: status.remainingFree,
            limitReached: status.limitReached,
            isPaidUser: status.isPaidUser,
            freeLimit: 1,
        });
    }
    catch (error) {
        console.error('Error checking signal limit:', error);
        res.status(500).json({ error: 'Failed to check signal limit' });
    }
});
// Admin: Reset all views (for testing)
router.post('/reset', auth_1.authenticateToken, async (req, res) => {
    try {
        // In production, you might want to check if user is admin
        await signalLimitService_1.signalLimitService.resetAllViews();
        res.json({ message: 'All signal views reset' });
    }
    catch (error) {
        console.error('Error resetting signal views:', error);
        res.status(500).json({ error: 'Failed to reset signal views' });
    }
});
exports.default = router;
