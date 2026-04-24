"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TIER_COMPARISON = exports.USAGE_LIMITS = exports.STRATEGY_ACCESS = exports.FEATURE_ACCESS = void 0;
exports.canAccess = canAccess;
exports.canAccessStrategy = canAccessStrategy;
exports.checkUsageLimit = checkUsageLimit;
exports.getFeaturesForTier = getFeaturesForTier;
exports.getStrategiesForTier = getStrategiesForTier;
exports.getUserWithSubscription = getUserWithSubscription;
exports.isSubscriptionActive = isSubscriptionActive;
exports.logAccessAttempt = logAccessAttempt;
exports.incrementUsage = incrementUsage;
const client_1 = require("@prisma/client");
const prisma = new client_1.PrismaClient();
// ============================================================================
// FEATURE CONFIGURATION MAP
// This single source of truth defines which tiers can access which features
// ============================================================================
exports.FEATURE_ACCESS = {
    // BASIC tier - Limited access
    basic: [
        'dashboard',
        'signals_limited', // Limited signals per day
        'market_overview',
        'basic_charts',
        'public_watchlist',
        'help_center',
    ],
    // PRO tier - Full trading utility
    pro: [
        'dashboard',
        'signals_unlimited', // All signals
        'alpha_picks_limited', // Limited Alpha Picks per day
        'strategies_all', // All strategies
        'real_time_alerts',
        'advanced_analytics',
        'risk_management',
        'telegram_alerts',
        'email_alerts',
        'websocket_feed',
        'portfolio_analytics',
        'trade_journal',
        'custom_watchlists',
        'backtesting_basic',
    ],
    // LIFETIME tier - Elite/Exclusive access
    lifetime: [
        'dashboard',
        'signals_unlimited',
        'alpha_picks_unlimited', // Unlimited Alpha Picks
        'strategies_all',
        'real_time_alerts',
        'advanced_analytics',
        'risk_management',
        'telegram_alerts',
        'email_alerts',
        'websocket_feed',
        'portfolio_analytics',
        'trade_journal',
        'custom_watchlists',
        'backtesting_advanced',
        'vip_dashboard', // Exclusive premium dashboards
        'priority_processing', // Faster signal generation
        'beta_features', // Early access to experimental models
        'exclusive_signals', // VIP-only high-confidence signals
        'direct_support',
    ],
};
// ============================================================================
// STRATEGY MODULE CONFIGURATION
// Each strategy declares required tier and can be independently toggled
// ============================================================================
exports.STRATEGY_ACCESS = {
    // BASIC tier strategies (limited/delayed)
    'ema_trend_pullback': { tier: 'basic', enabled: true },
    // PRO tier strategies
    'liquidity_sweep_long': { tier: 'pro', enabled: true },
    'liquidity_sweep_short': { tier: 'pro', enabled: true },
    'range_breakout': { tier: 'pro', enabled: true },
    'rsi_divergence': { tier: 'pro', enabled: true },
    'volume_spike': { tier: 'pro', enabled: true },
    // LIFETIME tier strategies (exclusive/priority)
    'market_structure_shift': { tier: 'lifetime', enabled: true },
    'fair_value_gap': { tier: 'lifetime', enabled: true },
    'liquidity_structure_combo': { tier: 'lifetime', enabled: true },
    'trend_continuation': { tier: 'lifetime', enabled: true },
    'institutional_levels': { tier: 'lifetime', enabled: true },
};
// ============================================================================
// USAGE LIMITS CONFIGURATION
// ============================================================================
exports.USAGE_LIMITS = {
    basic: {
        signalsPerDay: 1,
        alphaPicksPerDay: 0,
        watchlists: 1,
        alerts: 0,
        backtestsPerDay: 0,
    },
    pro: {
        signalsPerDay: -1, // unlimited
        alphaPicksPerDay: 3,
        watchlists: 10,
        alerts: 50,
        backtestsPerDay: 10,
    },
    lifetime: {
        signalsPerDay: -1, // unlimited
        alphaPicksPerDay: -1, // unlimited
        watchlists: -1, // unlimited
        alerts: -1, // unlimited
        backtestsPerDay: -1, // unlimited
    },
};
// ============================================================================
// CORE PERMISSION CHECK FUNCTION
// ============================================================================
/**
 * Check if a user can access a specific feature
 * This is the centralized permission system used by all API routes
 */
function canAccess(tier, feature) {
    // Get features available for this tier
    const allowedFeatures = exports.FEATURE_ACCESS[tier];
    // Check if feature is in the tier's allowed list
    if (allowedFeatures.includes(feature)) {
        return { allowed: true };
    }
    // Determine reason based on tier hierarchy
    const higherTiers = getHigherTiers(tier);
    const requiredTier = findRequiredTier(feature);
    return {
        allowed: false,
        reason: requiredTier
            ? `Upgrade to ${requiredTier} to access this feature`
            : `This feature is not available in your ${tier} plan`
    };
}
/**
 * Check if a user can access a specific strategy
 */
function canAccessStrategy(tier, strategyId) {
    const strategy = exports.STRATEGY_ACCESS[strategyId];
    if (!strategy || !strategy.enabled) {
        return { allowed: false, reason: 'Strategy not available' };
    }
    const requiredTier = strategy.tier;
    const tierHierarchy = ['basic', 'pro', 'lifetime'];
    const userTierIndex = tierHierarchy.indexOf(tier);
    const requiredTierIndex = tierHierarchy.indexOf(requiredTier);
    if (userTierIndex >= requiredTierIndex) {
        return { allowed: true };
    }
    return {
        allowed: false,
        reason: `Upgrade to ${requiredTier} to access this strategy`
    };
}
/**
 * Check if user has reached usage limits
 */
function checkUsageLimit(tier, resource, currentUsage) {
    const limit = exports.USAGE_LIMITS[tier][resource];
    // -1 means unlimited
    if (limit === -1) {
        return { allowed: true, limit: -1, remaining: -1 };
    }
    const remaining = Math.max(0, limit - currentUsage);
    return {
        allowed: currentUsage < limit,
        limit,
        remaining
    };
}
// ============================================================================
// HELPER FUNCTIONS
// ============================================================================
function getHigherTiers(tier) {
    const hierarchy = ['basic', 'pro', 'lifetime'];
    const index = hierarchy.indexOf(tier);
    return hierarchy.slice(index + 1);
}
function findRequiredTier(feature) {
    for (const [tier, features] of Object.entries(exports.FEATURE_ACCESS)) {
        if (features.includes(feature)) {
            return tier;
        }
    }
    return null;
}
/**
 * Get all features available for a tier
 */
function getFeaturesForTier(tier) {
    // Higher tiers inherit all features from lower tiers
    switch (tier) {
        case 'lifetime':
            return [...exports.FEATURE_ACCESS.basic, ...exports.FEATURE_ACCESS.pro, ...exports.FEATURE_ACCESS.lifetime];
        case 'pro':
            return [...exports.FEATURE_ACCESS.basic, ...exports.FEATURE_ACCESS.pro];
        case 'basic':
        default:
            return [...exports.FEATURE_ACCESS.basic];
    }
}
/**
 * Get all strategies available for a tier
 */
function getStrategiesForTier(tier) {
    const tierHierarchy = ['basic', 'pro', 'lifetime'];
    const userTierIndex = tierHierarchy.indexOf(tier);
    return Object.entries(exports.STRATEGY_ACCESS)
        .filter(([_, config]) => {
        const strategyTierIndex = tierHierarchy.indexOf(config.tier);
        return config.enabled && userTierIndex >= strategyTierIndex;
    })
        .map(([id]) => id);
}
/**
 * Fetch user with subscription details from database
 */
async function getUserWithSubscription(userId) {
    const user = await prisma.user.findUnique({
        where: { id: userId },
        select: {
            id: true,
            email: true,
            subscriptionTier: true,
            subscriptionStatus: true,
            subscriptionExpiry: true,
            signalsViewedToday: true,
            alphaPicksViewedToday: true,
        }
    });
    if (!user)
        return null;
    return {
        id: user.id,
        email: user.email,
        subscriptionTier: user.subscriptionTier,
        subscriptionStatus: user.subscriptionStatus,
        subscriptionExpiry: user.subscriptionExpiry,
        signalsViewedToday: user.signalsViewedToday,
        alphaPicksViewedToday: user.alphaPicksViewedToday,
    };
}
/**
 * Check if user's subscription is active (not expired)
 */
function isSubscriptionActive(status, expiryDate) {
    if (status === 'cancelled')
        return false;
    if (status === 'expired')
        return false;
    if (expiryDate && new Date() > expiryDate)
        return false;
    return status === 'active' || status === 'trialing';
}
/**
 * Log unauthorized access attempts for security monitoring
 */
async function logAccessAttempt(userId, action, feature, ipAddress, userAgent, metadata) {
    try {
        await prisma.userLog.create({
            data: {
                userId,
                action,
                feature,
                ipAddress: ipAddress || null,
                userAgent: userAgent || null,
                metadata: metadata ? JSON.stringify(metadata) : null,
            }
        });
    }
    catch (error) {
        console.error('Failed to log access attempt:', error);
    }
}
/**
 * Increment usage counters with daily reset check
 */
async function incrementUsage(userId, resource) {
    const now = new Date();
    const user = await prisma.user.findUnique({
        where: { id: userId },
        select: {
            signalsViewedToday: true,
            alphaPicksViewedToday: true,
            lastSignalReset: true,
            lastAlphaPickReset: true,
            subscriptionTier: true,
        }
    });
    if (!user)
        return { success: false, newCount: 0 };
    const tier = (user.subscriptionTier || 'basic');
    const limit = resource === 'signals'
        ? exports.USAGE_LIMITS[tier].signalsPerDay
        : exports.USAGE_LIMITS[tier].alphaPicksPerDay;
    // Check if we need to reset daily counter
    const lastReset = resource === 'signals'
        ? user.lastSignalReset
        : user.lastAlphaPickReset;
    const isNewDay = !isSameDay(now, lastReset);
    let currentCount = resource === 'signals'
        ? user.signalsViewedToday
        : user.alphaPicksViewedToday;
    // Reset if new day
    if (isNewDay) {
        currentCount = 0;
    }
    // Check limit (skip if unlimited)
    if (limit !== -1 && currentCount >= limit) {
        return { success: false, newCount: currentCount };
    }
    // Increment counter
    const newCount = currentCount + 1;
    await prisma.user.update({
        where: { id: userId },
        data: resource === 'signals'
            ? { signalsViewedToday: newCount, lastSignalReset: now }
            : { alphaPicksViewedToday: newCount, lastAlphaPickReset: now }
    });
    return { success: true, newCount };
}
function isSameDay(date1, date2) {
    return (date1.getFullYear() === date2.getFullYear() &&
        date1.getMonth() === date2.getMonth() &&
        date1.getDate() === date2.getDate());
}
// ============================================================================
// TIER COMPARISON DATA (for frontend display)
// ============================================================================
exports.TIER_COMPARISON = {
    basic: {
        name: 'BASIC',
        price: 'Free',
        description: 'Essential market access for beginners',
        features: [
            { name: 'Dashboard Access', included: true },
            { name: 'Limited Signals (1/day)', included: true },
            { name: 'Market Overview', included: true },
            { name: 'Basic Charts', included: true },
            { name: 'Public Watchlist', included: true },
            { name: 'Alpha Picks', included: false },
            { name: 'All Strategies', included: false },
            { name: 'Real-time Alerts', included: false },
            { name: 'Advanced Analytics', included: false },
            { name: 'VIP Dashboard', included: false },
        ]
    },
    pro: {
        name: 'PRO',
        price: '$29/month',
        description: 'Full trading utility for active traders',
        features: [
            { name: 'Everything in BASIC', included: true },
            { name: 'Unlimited Signals', included: true },
            { name: 'Alpha Picks (3/day)', included: true },
            { name: 'All Trading Strategies', included: true },
            { name: 'Real-time Alerts', included: true },
            { name: 'Advanced Analytics', included: true },
            { name: 'Risk Management Tools', included: true },
            { name: 'Email/Telegram Alerts', included: true },
            { name: 'Backtesting (10/day)', included: true },
            { name: 'VIP Dashboard', included: false },
        ]
    },
    lifetime: {
        name: 'LIFETIME',
        price: '$299 one-time',
        description: 'Elite tier with exclusive access forever',
        features: [
            { name: 'Everything in PRO', included: true },
            { name: 'Unlimited Alpha Picks', included: true },
            { name: 'Early Access to New Features', included: true },
            { name: 'Priority Signal Generation', included: true },
            { name: 'Exclusive VIP Dashboard', included: true },
            { name: 'VIP-Level Instant Alerts', included: true },
            { name: 'Beta/Experimental Models', included: true },
            { name: 'Advanced Backtesting', included: true },
            { name: 'Direct Support Access', included: true },
            { name: 'Never Pay Again', included: true },
        ]
    }
};
