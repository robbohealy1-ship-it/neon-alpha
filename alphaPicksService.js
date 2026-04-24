"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.alphaPicksService = void 0;
const client_1 = require("@prisma/client");
const prisma = new client_1.PrismaClient();
class AlphaPicksService {
    async initializeSampleData() {
        const count = await prisma.alphaPick.count();
        if (count > 0) {
            return;
        }
        await prisma.alphaPick.createMany({
            data: [
                {
                    coinName: 'NEAR Protocol',
                    ticker: 'NEAR',
                    sector: 'Infrastructure',
                    marketCapCategory: 'MID',
                    executiveSummary: JSON.stringify([
                        'Chain abstraction thesis gaining traction across crypto',
                        'Near AI positioning at the intersection of two major narratives',
                        'Developer growth and product differentiation remain underpriced'
                    ]),
                    thesis: 'NEAR is increasingly being valued like a generic layer-1 despite building differentiated chain abstraction and AI-adjacent infrastructure. That disconnect creates a medium-term accumulation opportunity if product execution continues.',
                    narrative: 'Chain abstraction and agentic UX are becoming more relevant as users seek seamless multi-chain experiences. NEAR sits inside that narrative at a time when the market is still rewarding clean, differentiated infrastructure stories.',
                    useCase: 'NEAR provides scalable infrastructure, chain abstraction tooling, and AI-aligned wallet/account primitives that can benefit developers building cross-chain consumer applications.',
                    tokenomics: JSON.stringify({
                        totalSupply: '1B',
                        inflation: 'Low single digits',
                        unlocks: 'Largely mature',
                        stakingRatio: 'Healthy validator participation'
                    }),
                    teamInvestors: JSON.stringify({
                        founders: ['Illia Polosukhin', 'Alexander Skidanov'],
                        investors: ['a16z', 'Pantera Capital', 'Coinbase Ventures']
                    }),
                    competitiveEdge: 'NEAR differentiates through abstraction-focused UX and a clearer product narrative than many competing infrastructure protocols.',
                    onChainData: JSON.stringify({
                        walletGrowth: 'Steady user and developer wallet expansion',
                        exchangeFlows: 'Net outflows imply passive accumulation',
                        whaleActivity: 'Larger holders have added on weakness',
                        volumeAnomalies: 'Demand improves near value area support'
                    }),
                    marketStructure: 'bullish',
                    accumulationZones: JSON.stringify([2.2, 2.5, 2.8]),
                    liquidityAreas: JSON.stringify({
                        demandZones: ['$2.00-$2.20', '$2.45-$2.60'],
                        liquiditySweeps: 'Recent sweep of local lows recovered quickly',
                        structure: 'Higher-low sequence still intact'
                    }),
                    executionPlan: 'Scale 30% on first support, 40% on confirmation, and 30% on continuation. Keep risk controlled per tranche and invalidate on a decisive weekly close below the key demand floor.',
                    invalidation: 2,
                    timeHorizon: 'POSITION',
                    target1: 4.5,
                    target2: 6.8,
                    target3: 10,
                    catalysts: JSON.stringify([
                        'Product rollout tied to chain abstraction',
                        'AI narrative strength',
                        'Potential ecosystem partnership flow'
                    ]),
                    risks: JSON.stringify([
                        'Narrative rotation away from infrastructure',
                        'Broader crypto market weakness',
                        'Execution slowdown versus competitors'
                    ]),
                    confidenceScore: 82,
                    status: 'ACCUMULATING'
                },
                {
                    coinName: 'Artificial Superintelligence Alliance',
                    ticker: 'FET',
                    sector: 'AI',
                    marketCapCategory: 'HIGH',
                    executiveSummary: JSON.stringify([
                        'One of the cleanest liquid expressions of the AI narrative',
                        'Watching for stronger structure before heavier sizing',
                        'Valuation remains sensitive to narrative momentum'
                    ]),
                    thesis: 'FET remains a high-beta AI proxy with enough liquidity and narrative strength to warrant attention, but the best risk-adjusted returns likely come from patient accumulation after structure improves.',
                    narrative: 'AI remains one of the strongest market narratives, but capital is increasingly rotating toward tokens with clearer utility and survivability. FET still commands attention as a liquid benchmark in that theme.',
                    useCase: 'The project targets decentralized AI infrastructure, autonomous agents, and machine-to-machine economic coordination.',
                    tokenomics: JSON.stringify({
                        supply: 'Merged token base',
                        inflation: 'Moderate / controlled',
                        unlocks: 'Monitor treasury and ecosystem emissions'
                    }),
                    teamInvestors: JSON.stringify({
                        backers: ['Strategic enterprise partners', 'Crypto native funds']
                    }),
                    competitiveEdge: 'Strong narrative recognition and comparatively deep liquidity versus many smaller AI names.',
                    onChainData: JSON.stringify({
                        walletGrowth: 'Mixed but stable',
                        exchangeFlows: 'Neutral to mildly constructive',
                        whaleActivity: 'Large wallets mostly inactive',
                        volumeAnomalies: 'Volume contracts during basing periods'
                    }),
                    marketStructure: 'neutral',
                    accumulationZones: JSON.stringify([0.8, 0.95, 1.1]),
                    liquidityAreas: JSON.stringify({
                        demandZones: ['$0.75-$0.85', '$0.95-$1.00'],
                        liquiditySweeps: 'Low swept once; follow-through still limited',
                        structure: 'Needs stronger higher-low confirmation'
                    }),
                    executionPlan: 'Keep initial size small while structure remains neutral. Add only after a reclaim of the middle accumulation band with volume confirmation. Maintain disciplined invalidation below major support.',
                    invalidation: 0.75,
                    timeHorizon: 'LONG_TERM',
                    target1: 2.2,
                    target2: 3.5,
                    target3: 5,
                    catalysts: JSON.stringify([
                        'AI ecosystem integrations',
                        'Broader AI narrative strength',
                        'Exchange and partnership headlines'
                    ]),
                    risks: JSON.stringify([
                        'Narrative fade',
                        'High-beta drawdowns',
                        'Competition from alternative AI tokens'
                    ]),
                    confidenceScore: 75,
                    status: 'WATCHING'
                }
            ]
        });
    }
}
exports.alphaPicksService = new AlphaPicksService();
