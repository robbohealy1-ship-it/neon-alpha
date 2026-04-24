"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const client_1 = require("@prisma/client");
const subscriptionService_1 = require("../services/subscriptionService");
const auth_1 = require("../middleware/auth");
const router = (0, express_1.Router)();
const prisma = new client_1.PrismaClient();
// Create checkout session - supports both authenticated and guest users
router.post('/create-checkout-session', async (req, res) => {
    try {
        const { plan, email: guestEmail, currency = 'gbp' } = req.body;
        const userId = req.userId;
        const userEmail = guestEmail;
        if (!plan || (plan !== 'free' && plan !== 'basic' && plan !== 'pro' && plan !== 'lifetime')) {
            return res.status(400).json({ error: 'Invalid plan. Must be "free", "basic", "pro", or "lifetime"' });
        }
        // FREE tier - no checkout needed
        if (plan === 'free') {
            return res.json({ url: '/signup' });
        }
        // For paid plans, create Stripe checkout session with currency preference
        // If user is not logged in, they'll enter email on Stripe checkout page
        const session = await subscriptionService_1.subscriptionService.createCheckoutSession(userId || 'guest', userEmail || '', plan, currency);
        res.json(session);
    }
    catch (error) {
        console.error('Error creating checkout session:', error);
        res.status(500).json({ error: 'Failed to create checkout session' });
    }
});
// Create customer portal session
router.post('/create-portal-session', auth_1.authenticateToken, async (req, res) => {
    try {
        const userId = req.userId;
        if (!userId) {
            return res.status(401).json({ error: 'Unauthorized' });
        }
        const session = await subscriptionService_1.subscriptionService.createPortalSession(userId);
        res.json(session);
    }
    catch (error) {
        console.error('Error creating portal session:', error);
        res.status(500).json({ error: 'Failed to create portal session' });
    }
});
// Get subscription status
router.get('/status', auth_1.authenticateToken, async (req, res) => {
    try {
        const userId = req.userId;
        if (!userId) {
            return res.status(401).json({ error: 'Unauthorized' });
        }
        const user = await prisma.user.findUnique({
            where: { id: userId },
            select: {
                subscriptionTier: true,
                subscriptionStatus: true,
                subscriptionExpiry: true
            }
        });
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }
        const normalizedPlan = user.subscriptionTier === 'basic' ||
            user.subscriptionTier === 'pro' ||
            user.subscriptionTier === 'lifetime' ||
            user.subscriptionTier === 'free'
            ? user.subscriptionTier
            : 'free';
        const normalizedStatus = user.subscriptionStatus || 'inactive';
        const isActive = (normalizedStatus === 'active' || normalizedStatus === 'trialing') &&
            (!user.subscriptionExpiry || user.subscriptionExpiry > new Date());
        res.json({
            isActive,
            plan: normalizedPlan,
            status: normalizedStatus,
            currentPeriodEnd: user.subscriptionExpiry ? user.subscriptionExpiry.toISOString() : null,
            cancelAtPeriodEnd: false
        });
    }
    catch (error) {
        console.error('Error getting subscription status:', error);
        res.status(500).json({ error: 'Failed to get subscription status' });
    }
});
// Stripe webhook
router.post('/webhook', async (req, res) => {
    const sig = req.headers['stripe-signature'];
    if (!sig) {
        return res.status(400).json({ error: 'Missing stripe-signature header' });
    }
    try {
        // Use raw body for signature verification
        const rawBody = req.rawBody || req.body;
        const event = subscriptionService_1.subscriptionService.constructWebhookEvent(rawBody, sig);
        switch (event.type) {
            case 'checkout.session.completed': {
                const session = event.data.object;
                const userId = session.metadata?.userId;
                const plan = session.metadata?.plan;
                if (userId && session.subscription) {
                    await subscriptionService_1.subscriptionService.handleSubscriptionCreated(session.customer, session.subscription, 'active', plan, Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60, // 30 days from now
                    false, userId);
                }
                break;
            }
            case 'invoice.payment_succeeded': {
                const invoice = event.data.object;
                if (invoice.subscription) {
                    await subscriptionService_1.subscriptionService.handleSubscriptionUpdated(invoice.subscription, 'active', Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60, false);
                }
                break;
            }
            case 'customer.subscription.updated': {
                const subscription = event.data.object;
                await subscriptionService_1.subscriptionService.handleSubscriptionUpdated(subscription.id, subscription.status, subscription.current_period_end, subscription.cancel_at_period_end);
                break;
            }
            case 'customer.subscription.deleted': {
                const subscription = event.data.object;
                await subscriptionService_1.subscriptionService.handleSubscriptionDeleted(subscription.id);
                break;
            }
            default:
                console.log(`Unhandled event type: ${event.type}`);
        }
        res.json({ received: true });
    }
    catch (error) {
        console.error('Webhook error:', error);
        res.status(400).json({ error: 'Webhook signature verification failed' });
    }
});
exports.default = router;
