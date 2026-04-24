"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const client_1 = require("@prisma/client");
const auth_1 = require("../middleware/auth");
const permissions_1 = require("../middleware/permissions");
const router = (0, express_1.Router)();
const prisma = new client_1.PrismaClient();
// Sector and status types
const SECTORS = ['AI', 'DeFi', 'L2', 'Meme', 'RWA', 'Gaming', 'Infrastructure', 'DePIN'];
const STATUSES = ['ACCUMULATING', 'WATCHING', 'COMPLETED'];
const CATEGORIES = ['LOW', 'MID', 'HIGH'];
// Transform database pick to API response format
const transformPick = (pick) => ({
    id: pick.id,
    coinName: pick.coinName,
    ticker: pick.ticker,
    sector: pick.sector,
    marketCapCategory: pick.marketCapCategory,
    confidenceScore: pick.confidenceScore,
    status: pick.status,
    // Summary
    executiveSummary: JSON.parse(pick.executiveSummary || '[]'),
    thesisPreview: pick.thesis?.substring(0, 150) + '...',
    // Full research (detailed view)
    thesis: pick.thesis,
    narrative: pick.narrative,
    // Fundamentals
    fundamentals: {
        useCase: pick.useCase,
        tokenomics: JSON.parse(pick.tokenomics || '{}'),
        teamInvestors: JSON.parse(pick.teamInvestors || '{}'),
        competitiveEdge: pick.competitiveEdge
    },
    // On-chain & Technicals
    onChainData: JSON.parse(pick.onChainData || '{}'),
    technicals: {
        marketStructure: pick.marketStructure,
        accumulationZones: JSON.parse(pick.accumulationZones || '[]'),
        liquidityAreas: JSON.parse(pick.liquidityAreas || '{}')
    },
    // Execution
    executionPlan: pick.executionPlan,
    invalidation: pick.invalidation,
    timeHorizon: pick.timeHorizon,
    // Targets
    targets: {
        tp1: pick.target1,
        tp2: pick.target2,
        tp3: pick.target3
    },
    // Catalysts & Risks
    catalysts: JSON.parse(pick.catalysts || '[]'),
    risks: JSON.parse(pick.risks || '[]'),
    // Metadata
    featuredImage: pick.featuredImage,
    createdAt: pick.createdAt,
    updatedAt: pick.updatedAt
});
// Get all alpha picks (PRO/LIFETIME only)
router.get('/', auth_1.authenticateToken, (0, permissions_1.requireTier)('pro'), (0, permissions_1.requireUsageLimit)('alphaPicks'), async (req, res) => {
    try {
        const { sector, category, status, minConfidence } = req.query;
        // Build where clause
        const where = {};
        if (sector)
            where.sector = sector;
        if (category)
            where.marketCapCategory = category;
        if (status)
            where.status = status;
        if (minConfidence)
            where.confidenceScore = { gte: parseInt(minConfidence) };
        const picks = await prisma.alphaPick.findMany({
            where,
            orderBy: { createdAt: 'desc' },
            take: 50
        });
        // Get user's bookmarks
        const userId = req.userId;
        let bookmarkedIds = [];
        if (userId) {
            const bookmarks = await prisma.alphaPickBookmark.findMany({
                where: { userId },
                select: { pickId: true }
            });
            bookmarkedIds = bookmarks.map(b => b.pickId);
        }
        const transformed = picks.map(pick => ({
            id: pick.id,
            coinName: pick.coinName,
            ticker: pick.ticker,
            sector: pick.sector,
            marketCapCategory: pick.marketCapCategory,
            confidenceScore: pick.confidenceScore,
            status: pick.status,
            thesisPreview: pick.thesis?.substring(0, 120) + '...',
            executiveSummary: JSON.parse(pick.executiveSummary || '[]').slice(0, 2),
            isBookmarked: bookmarkedIds.includes(pick.id),
            createdAt: pick.createdAt
        }));
        res.json({
            picks: transformed,
            count: transformed.length,
            filters: {
                sectors: SECTORS,
                categories: CATEGORIES,
                statuses: STATUSES
            }
        });
    }
    catch (error) {
        console.error('Error getting alpha picks:', error);
        res.status(500).json({ error: 'Failed to get alpha picks' });
    }
});
// Get single alpha pick detail (PRO only)
router.get('/:id', auth_1.authenticateToken, (0, permissions_1.requireTier)('pro'), async (req, res) => {
    try {
        const { id } = req.params;
        const pick = await prisma.alphaPick.findUnique({
            where: { id }
        });
        if (!pick) {
            return res.status(404).json({ error: 'Alpha pick not found' });
        }
        // Check if user bookmarked this pick
        const userId = req.userId;
        let isBookmarked = false;
        let userNotes = null;
        if (userId) {
            const bookmark = await prisma.alphaPickBookmark.findFirst({
                where: { userId, pickId: id }
            });
            if (bookmark) {
                isBookmarked = true;
                userNotes = bookmark.notes;
            }
        }
        res.json({
            ...transformPick(pick),
            isBookmarked,
            userNotes
        });
    }
    catch (error) {
        console.error('Error getting alpha pick:', error);
        res.status(500).json({ error: 'Failed to get alpha pick' });
    }
});
// Bookmark a pick
router.post('/:id/bookmark', auth_1.authenticateToken, (0, permissions_1.requireTier)('pro'), async (req, res) => {
    try {
        const { id } = req.params;
        const { notes } = req.body;
        const userId = req.userId;
        // Check if already bookmarked
        const existing = await prisma.alphaPickBookmark.findFirst({
            where: { userId, pickId: id }
        });
        if (existing) {
            // Update notes
            await prisma.alphaPickBookmark.update({
                where: { id: existing.id },
                data: { notes }
            });
            return res.json({ message: 'Bookmark updated', bookmarked: true });
        }
        // Create new bookmark
        await prisma.alphaPickBookmark.create({
            data: {
                userId: userId,
                pickId: id,
                notes
            }
        });
        res.json({ message: 'Pick bookmarked', bookmarked: true });
    }
    catch (error) {
        console.error('Error bookmarking:', error);
        res.status(500).json({ error: 'Failed to bookmark' });
    }
});
// Remove bookmark
router.delete('/:id/bookmark', auth_1.authenticateToken, (0, permissions_1.requireTier)('pro'), async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.userId;
        await prisma.alphaPickBookmark.deleteMany({
            where: { userId, pickId: id }
        });
        res.json({ message: 'Bookmark removed', bookmarked: false });
    }
    catch (error) {
        console.error('Error removing bookmark:', error);
        res.status(500).json({ error: 'Failed to remove bookmark' });
    }
});
// Get user's bookmarks
router.get('/user/bookmarks', auth_1.authenticateToken, (0, permissions_1.requireTier)('pro'), async (req, res) => {
    try {
        const userId = req.userId;
        const bookmarks = await prisma.alphaPickBookmark.findMany({
            where: { userId },
            include: { pick: true },
            orderBy: { createdAt: 'desc' }
        });
        const transformed = bookmarks.map(b => ({
            id: b.pick.id,
            coinName: b.pick.coinName,
            ticker: b.pick.ticker,
            sector: b.pick.sector,
            status: b.pick.status,
            confidenceScore: b.pick.confidenceScore,
            notes: b.notes,
            bookmarkedAt: b.createdAt
        }));
        res.json({ bookmarks: transformed });
    }
    catch (error) {
        console.error('Error getting bookmarks:', error);
        res.status(500).json({ error: 'Failed to get bookmarks' });
    }
});
// Public preview (teaser for marketing)
router.get('/public/preview', async (req, res) => {
    try {
        const picks = await prisma.alphaPick.findMany({
            where: { status: { not: 'COMPLETED' } },
            orderBy: { confidenceScore: 'desc' },
            take: 3
        });
        const preview = picks.map(pick => ({
            id: pick.id,
            coinName: pick.coinName,
            ticker: pick.ticker,
            sector: pick.sector,
            marketCapCategory: pick.marketCapCategory,
            confidenceScore: pick.confidenceScore,
            status: pick.status,
            thesisPreview: pick.thesis?.substring(0, 100) + '...',
            // Locked fields - upgrade to see full research
        }));
        res.json({
            preview,
            count: preview.length,
            message: 'Upgrade to PRO for full institutional-grade research',
            cta: 'Unlock Alpha Picks'
        });
    }
    catch (error) {
        console.error('Error getting preview:', error);
        res.status(500).json({ error: 'Failed to get preview' });
    }
});
// Seed sample research data (admin only)
router.post('/seed', auth_1.authenticateToken, async (req, res) => {
    try {
        // Check admin status
        const user = await prisma.user.findUnique({
            where: { id: req.userId },
            select: { subscriptionTier: true }
        });
        if (user?.subscriptionTier !== 'lifetime') {
            return res.status(403).json({ error: 'Admin only' });
        }
        // Sample research: NEAR Protocol
        await prisma.alphaPick.create({
            data: {
                coinName: 'NEAR Protocol',
                ticker: 'NEAR',
                sector: 'Infrastructure',
                marketCapCategory: 'MID',
                confidenceScore: 82,
                status: 'ACCUMULATING',
                executiveSummary: JSON.stringify([
                    'Chain abstraction thesis gaining traction across crypto',
                    'Near AI positioning at intersection of two mega-trends',
                    'Strong developer growth (+40% YoY)',
                    'Oversold from $8 ATH, now consolidating above key support',
                    'Institutional accumulation visible on-chain'
                ]),
                thesis: `NEAR is building the "user-owned AI" thesis at the intersection of two mega-trends: chain abstraction and artificial intelligence. The protocol's pivot toward AI infrastructure through Near AI represents a significant strategic shift that the market has not fully priced in.

The inefficiency here is that most investors still view NEAR as "just another L1" when in reality, they're building infrastructure for AI agents to transact autonomously. This creates a mispricing opportunity as the narrative shifts from "Ethereum competitor" to "AI infrastructure play.`,
                narrative: `NEAR sits at the confluence of two explosive narratives: Chain Abstraction and AI Infrastructure. As the crypto market matures, users don't care about which chain they're on - they want seamless experiences. NEAR's chain signatures and intent-based architecture solve this.

The Near AI pivot is particularly compelling. By enabling AI agents to hold crypto wallets and transact autonomously, NEAR is positioning itself as infrastructure for the coming wave of AI agents. This is a fundamentally different positioning than other L1s.`,
                useCase: `NEAR Protocol serves three core functions:\n\n1. Chain Abstraction: Users can interact with any blockchain without managing multiple wallets or bridges\n2. AI Infrastructure: Near AI enables autonomous AI agents to hold wallets and execute transactions\n3. Developer Platform: Sharded architecture provides 1000+ TPS with 1.3s finality\n\nThe killer app is "invisible infrastructure" - users don't know they're using NEAR, but they're benefiting from its speed and low costs.`,
                tokenomics: JSON.stringify({
                    totalSupply: '1,000,000,000 NEAR',
                    circulatingSupply: '~1B NEAR (most unlocked)',
                    inflation: '5% annually (declining to 1%)',
                    unlockSchedule: 'Most major unlocks completed',
                    stakingRatio: '45% of supply staked',
                    burnMechanism: '70% of fees burned, 30% to validators'
                }),
                teamInvestors: JSON.stringify({
                    founder: 'Illia Polosukhin (ex-Google DeepMind)',
                    coFounder: 'Alexander Skidanov',
                    keyInvestors: ['a16z', 'Pantera Capital', 'Coinbase Ventures', 'Multicoin'],
                    advisors: ['Naval Ravikant', 'Balaji Srinivasan']
                }),
                competitiveEdge: `NEAR's competitive moat is its chain abstraction technology combined with AI integration. While other L1s compete on speed, NEAR competes on user experience. The ability for users to interact with Bitcoin, Ethereum, and NEAR from a single account is genuinely differentiated.

The Near AI integration is the real edge. By being first-to-market with AI agent infrastructure, NEAR is positioning itself as the default chain for autonomous agents. This is a massive greenfield opportunity.`,
                onChainData: JSON.stringify({
                    walletGrowth: '+40% YoY developer growth',
                    exchangeFlows: 'Net outflows from CEXs (accumulation)',
                    whaleActivity: 'Wallets >100K NEAR increasing holdings',
                    volumeProfile: 'Accumulation volume at $2.50-3.00 range'
                }),
                marketStructure: 'bullish',
                accumulationZones: JSON.stringify([2.20, 2.50, 2.80]),
                liquidityAreas: JSON.stringify({
                    demandZones: ['$2.00-2.20', '$2.50-2.60'],
                    liquiditySweeps: 'Recent sweep of $2.20 with recovery',
                    structure: 'Higher lows pattern forming since August'
                }),
                executionPlan: `ACCUMULATION STRATEGY - 3 tranches:\n\nTRANCHE 1 (30% position): $2.20-2.50\n- Entry on any retest of demand zone\n- Risk: 1% of portfolio\n\nTRANCHE 2 (40% position): $2.50-2.80\n- Scale in on confirmation of support\n- Risk: 1% of portfolio\n\nTRANCHE 3 (30% position): $2.80-3.00\n- Final tranche on strength\n- Risk: 0.5% of portfolio\n\nINVALIDATION: Weekly close below $2.00`,
                invalidation: 2.00,
                timeHorizon: 'POSITION',
                target1: 4.50,
                target2: 6.80,
                target3: 10.00,
                catalysts: JSON.stringify([
                    'Near AI mainnet launch Q2 2025',
                    'Chain signatures live on mainnet',
                    'Major AI partnership announcements',
                    'ETH Denver narrative positioning'
                ]),
                risks: JSON.stringify([
                    'AI narrative fades or shifts to different chain',
                    'Chain abstraction adoption slower than expected',
                    'Macro crypto bear market',
                    'Competition from other L1s (Solana, Sui)',
                    'Token unlocks pressure price'
                ]),
                featuredImage: '/assets/near-research.png'
            }
        });
        // Sample research: Artificial Superintelligence Alliance
        await prisma.alphaPick.create({
            data: {
                coinName: 'Artificial Superintelligence Alliance',
                ticker: 'FET',
                sector: 'AI',
                marketCapCategory: 'HIGH',
                confidenceScore: 75,
                status: 'WATCHING',
                executiveSummary: JSON.stringify([
                    'Merger of Fetch.ai, SingularityNET, Ocean Protocol',
                    'Leading AI x Crypto narrative for 2025',
                    'Real enterprise adoption (Bosch, Deutsche Telekom)',
                    'Oversold from $3.50 peak, finding support',
                    'Critical for AGI infrastructure thesis'
                ]),
                thesis: `The ASI Alliance represents the most credible attempt to decentralize artificial intelligence infrastructure. The merger creates a vertically integrated stack from data (Ocean) to models (SingularityNET) to deployment (Fetch.ai).

The market inefficiency is that investors are treating this as a "meme AI coin" when it has actual enterprise traction. Bosch, Deutsche Telekom, and other Fortune 500s are building on this stack. As AI regulation increases, decentralized AI infrastructure becomes more valuable.`,
                narrative: `AI is the dominant narrative of this cycle, but most "AI coins" are vaporware. FET is different - it has real technology, real partnerships, and a credible path to AGI infrastructure.

The merger creates a flywheel: Ocean provides data → SingularityNET provides models → Fetch.ai provides deployment. This vertical integration is unique in crypto and creates strong network effects.

As OpenAI/Microsoft consolidate control over centralized AI, the counter-narrative of decentralized AI becomes more compelling.`,
                useCase: `ASI provides decentralized AI infrastructure:\n\n1. Fetch.ai: Autonomous AI agents for enterprise automation\n2. SingularityNET: Decentralized AI model marketplace\n3. Ocean Protocol: Privacy-preserving data marketplace\n\nCombined, these enable AI applications that don't rely on centralized providers like OpenAI or Google. This is infrastructure for the "open AI" movement.`,
                tokenomics: JSON.stringify({
                    totalSupply: '2.63B FET (post-merger)',
                    inflation: 'No new emissions',
                    staking: 'Up to 15% APY on staking',
                    utility: 'Required for agent deployment and model inference'
                }),
                teamInvestors: JSON.stringify({
                    fetchAiFounder: 'Humayun Sheikh',
                    singularityFounder: 'Ben Goertzel (AGI researcher)',
                    oceanFounder: 'Bruce Pon',
                    keyPartners: ['Bosch', 'Deutsche Telekom', 'Mitsubishi']
                }),
                competitiveEdge: `The merged entity has no real competitor in decentralized AI infrastructure. While Bittensor focuses on model training and Render focuses on compute, ASI covers the full stack from data → models → agents.

Enterprise partnerships provide real revenue and validation that competitors lack.`,
                onChainData: JSON.stringify({
                    stakingRatio: '35% of supply staked',
                    exchangeFlows: 'Mixed - some accumulation, some distribution',
                    whaleActivity: 'Large holders mostly dormant',
                    volumeProfile: 'Volume declining = potential bottoming'
                }),
                marketStructure: 'neutral',
                accumulationZones: JSON.stringify([0.80, 0.95, 1.10]),
                liquidityAreas: JSON.stringify({
                    demandZones: ['$0.75-0.85', '$0.95-1.00'],
                    liquiditySweeps: 'Sweep of $0.80 with weak bounce',
                    structure: 'Waiting for higher low formation'
                }),
                executionPlan: `WATCH MODE - Waiting for structure:\n\nPHASE 1: Watch for $0.80 support hold\n- Wait for daily close above $0.90\n- Volume confirmation needed\n\nPHASE 2: Scale in $0.95-1.10\n- 50% position on confirmation\n- Risk: 1% of portfolio\n\nPHASE 3: Full position $1.10-1.25\n- Remaining 50% on strength\n- Risk: 1% of portfolio\n\nINVALIDATION: Weekly close below $0.75`,
                invalidation: 0.75,
                timeHorizon: 'LONG_TERM',
                target1: 2.20,
                target2: 3.50,
                target3: 5.00,
                catalysts: JSON.stringify([
                    'ASI-1 AGI model launch',
                    'Enterprise partnership announcements',
                    'AI agent marketplace live',
                    'Regulatory clarity on decentralized AI'
                ]),
                risks: JSON.stringify([
                    'Merger integration challenges',
                    'AI narrative shifts to other tokens',
                    'Centralized AI (OpenAI) dominates',
                    'Regulatory crackdown on AI tokens',
                    'Token unlock pressure from merger'
                ]),
                featuredImage: '/assets/asi-research.png'
            }
        });
        res.json({ message: 'Alpha Picks research data seeded successfully' });
    }
    catch (error) {
        console.error('Error seeding data:', error);
        res.status(500).json({ error: 'Failed to seed data' });
    }
});
exports.default = router;
