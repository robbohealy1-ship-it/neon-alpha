"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.subscriptionService = exports.SubscriptionService = void 0;
const stripe_1 = __importDefault(require("stripe"));
// Price IDs - Replace with your actual Stripe Price IDs
const PRICE_IDS = {
    free: 'free', // Free tier has no Stripe price
    basic: process.env.STRIPE_BASIC_PRICE_ID,
    pro: process.env.STRIPE_PRO_PRICE_ID,
    lifetime: process.env.STRIPE_LIFETIME_PRICE_ID,
};
// In-memory store for user subscriptions (replace with database in production)
const userSubscriptions = new Map();
class SubscriptionService {
    getStripe() {
        if (!this.stripe) {
            const secretKey = process.env.STRIPE_SECRET_KEY;
            if (!secretKey) {
                throw new Error('STRIPE_SECRET_KEY not configured');
            }
            this.stripe = new stripe_1.default(secretKey, {
                apiVersion: '2026-03-25.dahlia',
            });
        }
        return this.stripe;
    }
    // Create a Stripe checkout session
    async createCheckoutSession(userId, email, plan, currency = 'gbp') {
        try {
            // FREE tier - no Stripe checkout needed
            if (plan === 'free') {
                return { sessionId: 'free', url: '/signup' };
            }
            // Check if Stripe is configured
            const secretKey = process.env.STRIPE_SECRET_KEY;
            const priceId = PRICE_IDS[plan];
            if (!secretKey || !priceId || priceId.includes('...')) {
                console.warn('Stripe not configured, redirecting to pricing page');
                // Return pricing page URL as fallback with currency info
                return {
                    sessionId: 'fallback',
                    url: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/pricing?plan=${plan}&currency=${currency}&message=Please sign up first to subscribe`
                };
            }
            // Convert currency to uppercase for Stripe
            const stripeCurrency = currency.toUpperCase();
            // Create or retrieve customer
            let customerId;
            const existingSub = userSubscriptions.get(userId);
            if (existingSub) {
                customerId = existingSub.customerId;
            }
            else {
                const customer = await this.getStripe().customers.create({
                    email: email || 'guest@example.com',
                    metadata: { userId },
                });
                customerId = customer.id;
            }
            const isLifetime = plan === 'lifetime';
            const sessionConfig = {
                customer: customerId,
                line_items: [
                    {
                        price: PRICE_IDS[plan],
                        quantity: 1,
                    },
                ],
                mode: isLifetime ? 'payment' : 'subscription',
                success_url: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/subscription/success?session_id={CHECKOUT_SESSION_ID}`,
                cancel_url: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/pricing`,
                metadata: { userId, plan },
            };
            // Only add subscription_data for subscription mode (not for one-time payments)
            if (!isLifetime) {
                sessionConfig.subscription_data = {
                    metadata: { userId, plan },
                };
            }
            const session = await this.getStripe().checkout.sessions.create(sessionConfig);
            return { sessionId: session.id, url: session.url };
        }
        catch (error) {
            console.error('Error creating checkout session:', error);
            // Fallback to pricing page on error
            return {
                sessionId: 'error',
                url: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/pricing?plan=${plan}&error=true`
            };
        }
    }
    // Create a customer portal session for managing subscription
    async createPortalSession(userId) {
        try {
            const subscription = userSubscriptions.get(userId);
            if (!subscription) {
                throw new Error('No active subscription found');
            }
            const portalSession = await this.getStripe().billingPortal.sessions.create({
                customer: subscription.customerId,
                return_url: `${process.env.FRONTEND_URL}/profile`,
            });
            return { url: portalSession.url };
        }
        catch (error) {
            console.error('Error creating portal session:', error);
            throw new Error('Failed to create portal session');
        }
    }
    // Get subscription status for a user
    getSubscriptionStatus(userId) {
        const subscription = userSubscriptions.get(userId);
        if (!subscription) {
            // Default to free tier for users without subscription
            return {
                isActive: false,
                plan: 'free',
                status: 'inactive',
                currentPeriodEnd: null,
                cancelAtPeriodEnd: false,
            };
        }
        const isActive = subscription.status === 'active' || subscription.status === 'trialing';
        return {
            isActive,
            plan: subscription.plan,
            status: subscription.status,
            currentPeriodEnd: subscription.currentPeriodEnd,
            cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
        };
    }
    // Update subscription from webhook event
    async handleSubscriptionCreated(customerId, subscriptionId, status, plan, currentPeriodEnd, cancelAtPeriodEnd, userId) {
        // If userId not provided, lookup by customer
        let targetUserId = userId;
        if (!targetUserId) {
            for (const [uid, sub] of userSubscriptions.entries()) {
                if (sub.customerId === customerId) {
                    targetUserId = uid;
                    break;
                }
            }
        }
        if (!targetUserId) {
            // Try to get from Stripe customer metadata
            const customer = await this.getStripe().customers.retrieve(customerId);
            if (!customer.deleted && customer.metadata?.userId) {
                targetUserId = customer.metadata.userId;
            }
        }
        if (!targetUserId) {
            throw new Error('Could not find user for subscription');
        }
        userSubscriptions.set(targetUserId, {
            customerId,
            subscriptionId,
            status,
            plan,
            currentPeriodEnd: new Date(currentPeriodEnd * 1000),
            cancelAtPeriodEnd,
        });
        return targetUserId;
    }
    // Handle subscription updated
    async handleSubscriptionUpdated(subscriptionId, status, currentPeriodEnd, cancelAtPeriodEnd) {
        for (const [userId, sub] of userSubscriptions.entries()) {
            if (sub.subscriptionId === subscriptionId) {
                sub.status = status;
                sub.currentPeriodEnd = new Date(currentPeriodEnd * 1000);
                sub.cancelAtPeriodEnd = cancelAtPeriodEnd;
                return userId;
            }
        }
        return null;
    }
    // Handle subscription deleted/canceled
    async handleSubscriptionDeleted(subscriptionId) {
        for (const [userId, sub] of userSubscriptions.entries()) {
            if (sub.subscriptionId === subscriptionId) {
                sub.status = 'canceled';
                sub.cancelAtPeriodEnd = true;
                return userId;
            }
        }
        return null;
    }
    // Verify webhook signature
    constructWebhookEvent(payload, signature) {
        const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
        return this.getStripe().webhooks.constructEvent(payload, signature, webhookSecret);
    }
}
exports.SubscriptionService = SubscriptionService;
exports.subscriptionService = new SubscriptionService();
