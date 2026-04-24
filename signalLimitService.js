"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.signalLimitService = void 0;
const client_1 = require("@prisma/client");
const prisma = new client_1.PrismaClient();
const FREE_DAILY_LIMIT = 1;
class SignalLimitService {
    // Check if user can view signals (returns current status without incrementing)
    async checkSignalLimit(userId, isPaidUser) {
        // Paid users have unlimited access
        if (isPaidUser) {
            return {
                allowed: true,
                signalsViewed: 0,
                remainingFree: -1, // Unlimited
                limitReached: false,
                isPaidUser: true,
            };
        }
        // Free users: check daily limit
        const today = this.getTodayDate();
        const viewRecord = await prisma.signalView.findUnique({
            where: {
                userId_date: {
                    userId,
                    date: today,
                },
            },
        });
        const signalsViewed = viewRecord?.signalsViewed || 0;
        const remainingFree = Math.max(0, FREE_DAILY_LIMIT - signalsViewed);
        const limitReached = signalsViewed >= FREE_DAILY_LIMIT;
        return {
            allowed: !limitReached,
            signalsViewed,
            remainingFree,
            limitReached,
            isPaidUser: false,
        };
    }
    // Increment signal view count when user views a signal
    async incrementSignalView(userId) {
        const today = this.getTodayDate();
        // Upsert: create if not exists, increment if exists
        const viewRecord = await prisma.signalView.upsert({
            where: {
                userId_date: {
                    userId,
                    date: today,
                },
            },
            update: {
                signalsViewed: {
                    increment: 1,
                },
            },
            create: {
                userId,
                date: today,
                signalsViewed: 1,
            },
        });
        const signalsViewed = viewRecord.signalsViewed;
        const remainingFree = Math.max(0, FREE_DAILY_LIMIT - signalsViewed);
        const limitReached = signalsViewed >= FREE_DAILY_LIMIT;
        return {
            allowed: !limitReached,
            signalsViewed,
            remainingFree,
            limitReached,
            isPaidUser: false,
        };
    }
    // Get today's signal limit status for a user
    async getTodayStatus(userId, isPaidUser) {
        if (isPaidUser) {
            return {
                allowed: true,
                signalsViewed: 0,
                remainingFree: -1,
                limitReached: false,
                isPaidUser: true,
            };
        }
        const today = this.getTodayDate();
        const viewRecord = await prisma.signalView.findUnique({
            where: {
                userId_date: {
                    userId,
                    date: today,
                },
            },
        });
        const signalsViewed = viewRecord?.signalsViewed || 0;
        const remainingFree = Math.max(0, FREE_DAILY_LIMIT - signalsViewed);
        const limitReached = signalsViewed >= FREE_DAILY_LIMIT;
        return {
            allowed: !limitReached,
            signalsViewed,
            remainingFree,
            limitReached,
            isPaidUser: false,
        };
    }
    // Reset all signal views (for testing or admin purposes)
    async resetAllViews() {
        await prisma.signalView.deleteMany({});
    }
    // Get today's date in YYYY-MM-DD format
    getTodayDate() {
        return new Date().toISOString().split('T')[0];
    }
}
exports.signalLimitService = new SignalLimitService();
