"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const dotenv_1 = __importDefault(require("dotenv"));
const http_1 = require("http");
const ws_1 = require("ws");
const auth_1 = __importDefault(require("./routes/auth"));
const trades_1 = __importDefault(require("./routes/trades"));
const watchlist_1 = __importDefault(require("./routes/watchlist"));
const alerts_1 = __importDefault(require("./routes/alerts"));
const setups_1 = __importDefault(require("./routes/setups"));
const market_1 = __importDefault(require("./routes/market"));
const analytics_1 = __importDefault(require("./routes/analytics"));
const signals_1 = __importDefault(require("./routes/signals"));
const telegram_1 = __importDefault(require("./routes/telegram"));
const subscription_1 = __importDefault(require("./routes/subscription"));
const signalPerformance_1 = __importDefault(require("./routes/signalPerformance"));
const signalLimit_1 = __importDefault(require("./routes/signalLimit"));
const alphaPicks_1 = __importDefault(require("./routes/alphaPicks"));
const user_1 = __importDefault(require("./routes/user"));
const alphaPicksService_1 = require("./services/alphaPicksService");
dotenv_1.default.config();
const app = (0, express_1.default)();
// Health check endpoint
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});
const server = (0, http_1.createServer)(app);
const wss = new ws_1.WebSocketServer({ server });
app.use((0, cors_1.default)());
app.use(express_1.default.json({
    verify: (req, res, buf) => {
        // Store raw body for Stripe webhook verification
        if (req.url === '/api/subscription/webhook') {
            req.rawBody = buf;
        }
    }
}));
app.use('/api/auth', auth_1.default);
app.use('/api/trades', trades_1.default);
app.use('/api/watchlist', watchlist_1.default);
app.use('/api/alerts', alerts_1.default);
app.use('/api/setups', setups_1.default);
app.use('/api/market', market_1.default);
app.use('/api/analytics', analytics_1.default);
app.use('/api/signals', signals_1.default);
app.use('/api/telegram', telegram_1.default);
app.use('/api/subscription', subscription_1.default);
app.use('/api/signal-performance', signalPerformance_1.default);
app.use('/api/signal-limit', signalLimit_1.default);
app.use('/api/alpha-picks', alphaPicks_1.default);
app.use('/api/user', user_1.default);
wss.on('connection', (ws) => {
    console.log('WebSocket client connected');
    const interval = setInterval(() => {
        if (ws.readyState === ws.OPEN) {
            ws.send(JSON.stringify({
                type: 'price_update',
                data: {
                    BTC: 45000 + Math.random() * 1000,
                    ETH: 2500 + Math.random() * 100,
                    timestamp: Date.now()
                }
            }));
        }
    }, 3000);
    ws.on('close', () => {
        clearInterval(interval);
        console.log('WebSocket client disconnected');
    });
});
const PORT = process.env.PORT || 5001;
server.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`📊 WebSocket server ready`);
    // DISABLED: Signal scanner causing CoinGecko rate limit crashes
    // startSignalScanner();
    // startSignalChecker();
    // Initialize Alpha Picks sample data
    alphaPicksService_1.alphaPicksService.initializeSampleData().catch(console.error);
});
