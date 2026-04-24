"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireTier = requireTier;
exports.requireFeature = requireFeature;
exports.requireStrategy = requireStrategy;
exports.requireUsageLimit = requireUsageLimit;
exports.requireTierAndFeature = requireTierAndFeature;
exports.optionalAuth = optionalAuth;
const permissionService_1 = require("../services/permissionService");
// ============================================================================
// TIER CHECK MIDDLEWARE
// Validates minimum tier requirement
// ============================================================================
/**
 * Middleware to check minimum tier requirement
 * Usage: router.get('/api/pro-route', requireTier('pro'), handler)
 */
function requireTier(minTier) {
    return async (req, res, next) => {
        try {
            if (!req.userId) {
                return res.status(401).json({
                    error: 'Authentication required',
                    code: 'AUTH_REQUIRED'
                });
            }
            const user = await (0, permissionService_1.getUserWithSubscription)(req.userId);
            if (!user) {
                return res.status(404).json({
                    error: 'User not found',
                    code: 'USER_NOT_FOUND'
                });
            }
            // Check subscription status
            if (!(0, permissionService_1.isSubscriptionActive)(user.subscriptionStatus, user.subscriptionExpiry)) {
                await (0, permissionService_1.logAccessAttempt)(req.userId, 'expired_subscription_access', minTier, req.ip, req.get('user-agent'));
                return res.status(403).json({
                    error: 'Your subscription has expired. Please renew to continue.',
                    code: 'SUBSCRIPTION_EXPIRED',
                    upgradeUrl: '/pricing'
                });
            }
            // Check tier hierarchy
            const tierHierarchy = ['basic', 'pro', 'lifetime'];
            const userTierIndex = tierHierarchy.indexOf(user.subscriptionTier);
            const requiredTierIndex = tierHierarchy.indexOf(minTier);
            if (userTierIndex < requiredTierIndex) {
                await (0, permissionService_1.logAccessAttempt)(req.userId, 'unauthorized_tier_access', minTier, req.ip, req.get('user-agent'), { userTier: user.subscriptionTier, requiredTier: minTier });
                return res.status(403).json({
                    error: `Upgrade required to access this feature`,
                    code: 'TIER_UPGRADE_REQUIRED',
                    currentTier: user.subscriptionTier,
                    requiredTier: minTier,
                    upgradeUrl: '/pricing',
                    message: `This feature requires ${minTier.toUpperCase()} tier or higher`
                });
            }
            // Attach user subscription to request for downstream use
            req.userSubscription = user;
            next();
        }
        catch (error) {
            console.error('Tier check middleware error:', error);
            return res.status(500).json({
                error: 'Internal server error during authorization',
                code: 'AUTH_ERROR'
            });
        }
    };
}
// ============================================================================
// FEATURE PERMISSION MIDDLEWARE
// Checks specific feature access permission
// ============================================================================
/**
 * Middleware to check feature-specific permission
 * Usage: router.get('/api/alpha-picks', requireFeature('alpha_picks_limited'), handler)
 */
function requireFeature(feature) {
    return async (req, res, next) => {
        try {
            if (!req.userId) {
                return res.status(401).json({
                    error: 'Authentication required',
                    code: 'AUTH_REQUIRED'
                });
            }
            const user = req.userSubscription || await (0, permissionService_1.getUserWithSubscription)(req.userId);
            if (!user) {
                return res.status(404).json({
                    error: 'User not found',
                    code: 'USER_NOT_FOUND'
                });
            }
            // Check subscription status
            if (!(0, permissionService_1.isSubscriptionActive)(user.subscriptionStatus, user.subscriptionExpiry)) {
                return res.status(403).json({
                    error: 'Your subscription has expired',
                    code: 'SUBSCRIPTION_EXPIRED',
                    upgradeUrl: '/pricing'
                });
            }
            // Check feature permission
            const permission = (0, permissionService_1.canAccess)(user.subscriptionTier, feature);
            if (!permission.allowed) {
                await (0, permissionService_1.logAccessAttempt)(req.userId, 'unauthorized_feature_access', feature, req.ip, req.get('user-agent'), { userTier: user.subscriptionTier, reason: permission.reason });
                return res.status(403).json({
                    error: permission.reason || 'Access denied',
                    code: 'FEATURE_UPGRADE_REQUIRED',
                    feature,
                    currentTier: user.subscriptionTier,
                    upgradeUrl: '/pricing',
                    message: permission.reason
                });
            }
            req.userSubscription = user;
            next();
        }
        catch (error) {
            console.error('Feature permission middleware error:', error);
            return res.status(500).json({
                error: 'Internal server error during authorization',
                code: 'AUTH_ERROR'
            });
        }
    };
}
// ============================================================================
// STRATEGY ACCESS MIDDLEWARE
// For protecting specific trading strategies
// ============================================================================
/**
 * Middleware to check strategy-specific access
 * Usage: router.get('/api/strategies/mss', requireStrategy('market_structure_shift'), handler)
 */
function requireStrategy(strategyId) {
    return async (req, res, next) => {
        try {
            if (!req.userId) {
                return res.status(401).json({
                    error: 'Authentication required',
                    code: 'AUTH_REQUIRED'
                });
            }
            const user = req.userSubscription || await (0, permissionService_1.getUserWithSubscription)(req.userId);
            if (!user) {
                return res.status(404).json({
                    error: 'User not found',
                    code: 'USER_NOT_FOUND'
                });
            }
            if (!(0, permissionService_1.isSubscriptionActive)(user.subscriptionStatus, user.subscriptionExpiry)) {
                return res.status(403).json({
                    error: 'Your subscription has expired',
                    code: 'SUBSCRIPTION_EXPIRED',
                    upgradeUrl: '/pricing'
                });
            }
            const permission = (0, permissionService_1.canAccessStrategy)(user.subscriptionTier, strategyId);
            if (!permission.allowed) {
                await (0, permissionService_1.logAccessAttempt)(req.userId, 'unauthorized_strategy_access', strategyId, req.ip, req.get('user-agent'), { userTier: user.subscriptionTier, reason: permission.reason });
                return res.status(403).json({
                    error: permission.reason || 'Strategy access denied',
                    code: 'STRATEGY_UPGRADE_REQUIRED',
                    strategy: strategyId,
                    currentTier: user.subscriptionTier,
                    upgradeUrl: '/pricing'
                });
            }
            req.userSubscription = user;
            next();
        }
        catch (error) {
            console.error('Strategy permission middleware error:', error);
            return res.status(500).json({
                error: 'Internal server error during authorization',
                code: 'AUTH_ERROR'
            });
        }
    };
}
// ============================================================================
// USAGE LIMIT MIDDLEWARE
// For rate-limiting based on tier
// ============================================================================
/**
 * Middleware to check and enforce usage limits
 * Usage: router.get('/api/signals', requireUsageLimit('signals'), handler)
 */
function requireUsageLimit(resource) {
    return async (req, res, next) => {
        try {
            if (!req.userId) {
                return res.status(401).json({
                    error: 'Authentication required',
                    code: 'AUTH_REQUIRED'
                });
            }
            const user = req.userSubscription || await (0, permissionService_1.getUserWithSubscription)(req.userId);
            if (!user) {
                return res.status(404).json({
                    error: 'User not found',
                    code: 'USER_NOT_FOUND'
                });
            }
            // Check current usage
            const currentUsage = resource === 'signals'
                ? user.signalsViewedToday
                : user.alphaPicksViewedToday;
            const limitCheck = (0, permissionService_1.checkUsageLimit)(user.subscriptionTier, resource === 'signals' ? 'signalsPerDay' : 'alphaPicksPerDay', currentUsage);
            if (!limitCheck.allowed) {
                await (0, permissionService_1.logAccessAttempt)(req.userId, 'usage_limit_exceeded', resource, req.ip, req.get('user-agent'), {
                    userTier: user.subscriptionTier,
                    limit: limitCheck.limit,
                    current: currentUsage
                });
                return res.status(429).json({
                    error: `Daily ${resource} limit reached`,
                    code: 'USAGE_LIMIT_EXCEEDED',
                    resource,
                    limit: limitCheck.limit,
                    current: currentUsage,
                    remaining: 0,
                    upgradeUrl: '/pricing',
                    resetTime: '00:00 UTC', // Simplified - could calculate actual reset time
                    message: `You've reached your daily limit of ${limitCheck.limit} ${resource}. Upgrade for unlimited access.`
                });
            }
            // Increment usage counter
            const incrementResult = await (0, permissionService_1.incrementUsage)(req.userId, resource);
            if (!incrementResult.success) {
                return res.status(429).json({
                    error: `Daily ${resource} limit reached`,
                    code: 'USAGE_LIMIT_EXCEEDED',
                    resource,
                    limit: limitCheck.limit,
                    remaining: 0,
                    upgradeUrl: '/pricing'
                });
            }
            // Add usage info to response headers
            res.setHeader('X-RateLimit-Limit', limitCheck.limit === -1 ? 'unlimited' : limitCheck.limit.toString());
            res.setHeader('X-RateLimit-Remaining', limitCheck.remaining === -1 ? 'unlimited' : (limitCheck.remaining - 1).toString());
            res.setHeader('X-RateLimit-Used', incrementResult.newCount.toString());
            req.userSubscription = user;
            next();
        }
        catch (error) {
            console.error('Usage limit middleware error:', error);
            return res.status(500).json({
                error: 'Internal server error during usage check',
                code: 'USAGE_CHECK_ERROR'
            });
        }
    };
}
// ============================================================================
// COMPOSITE MIDDLEWARE
// Combine multiple checks
// ============================================================================
/**
 * Middleware that requires both a minimum tier AND a specific feature
 * Usage: router.get('/api/vip-feature', requireTierAndFeature('pro', 'vip_dashboard'), handler)
 */
function requireTierAndFeature(minTier, feature) {
    return async (req, res, next) => {
        try {
            if (!req.userId) {
                return res.status(401).json({
                    error: 'Authentication required',
                    code: 'AUTH_REQUIRED'
                });
            }
            const user = await (0, permissionService_1.getUserWithSubscription)(req.userId);
            if (!user) {
                return res.status(404).json({
                    error: 'User not found',
                    code: 'USER_NOT_FOUND'
                });
            }
            // Check subscription status
            if (!(0, permissionService_1.isSubscriptionActive)(user.subscriptionStatus, user.subscriptionExpiry)) {
                return res.status(403).json({
                    error: 'Your subscription has expired',
                    code: 'SUBSCRIPTION_EXPIRED',
                    upgradeUrl: '/pricing'
                });
            }
            // Check tier
            const tierHierarchy = ['basic', 'pro', 'lifetime'];
            const userTierIndex = tierHierarchy.indexOf(user.subscriptionTier);
            const requiredTierIndex = tierHierarchy.indexOf(minTier);
            if (userTierIndex < requiredTierIndex) {
                await (0, permissionService_1.logAccessAttempt)(req.userId, 'unauthorized_tier_access', `${minTier}:${feature}`, req.ip, req.get('user-agent'));
                return res.status(403).json({
                    error: 'Upgrade required to access this feature',
                    code: 'TIER_UPGRADE_REQUIRED',
                    currentTier: user.subscriptionTier,
                    requiredTier: minTier,
                    upgradeUrl: '/pricing'
                });
            }
            // Check feature
            const permission = (0, permissionService_1.canAccess)(user.subscriptionTier, feature);
            if (!permission.allowed) {
                await (0, permissionService_1.logAccessAttempt)(req.userId, 'unauthorized_feature_access', feature, req.ip, req.get('user-agent'));
                return res.status(403).json({
                    error: permission.reason || 'Access denied',
                    code: 'FEATURE_UPGRADE_REQUIRED',
                    feature,
                    currentTier: user.subscriptionTier,
                    upgradeUrl: '/pricing'
                });
            }
            req.userSubscription = user;
            next();
        }
        catch (error) {
            console.error('Tier+Feature middleware error:', error);
            return res.status(500).json({
                error: 'Internal server error',
                code: 'AUTH_ERROR'
            });
        }
    };
}
// ============================================================================
// PUBLIC ACCESS MIDDLEWARE
// For routes that allow limited public access
// ============================================================================
/**
 * Middleware for routes that have limited functionality for non-subscribers
 * Attaches user info if available, but doesn't require it
 */
function optionalAuth() {
    return async (req, res, next) => {
        try {
            // Try to get user if token is provided
            const authHeader = req.headers['authorization'];
            const token = authHeader && authHeader.split(' ')[1];
            if (token && process.env.JWT_SECRET) {
                try {
                    const jwt = require('jsonwebtoken');
                    const decoded = jwt.verify(token, process.env.JWT_SECRET);
                    req.userId = decoded.userId;
                    const user = await (0, permissionService_1.getUserWithSubscription)(decoded.userId);
                    if (user && (0, permissionService_1.isSubscriptionActive)(user.subscriptionStatus, user.subscriptionExpiry)) {
                        req.userSubscription = user;
                    }
                }
                catch {
                    // Invalid token, continue as anonymous
                }
            }
            next();
        }
        catch (error) {
            // Continue even if auth fails - this is optional auth
            next();
        }
    };
}
