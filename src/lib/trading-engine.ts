import { db } from "@/db";
import {
  botConfigs,
  discoveredTokens,
  positions,
  executionLogs,
  equitySnapshots,
  type BotConfig,
  type DiscoveredToken,
  type Position,
  type ExecutionLog,
  type EquitySnapshot,
} from "@/db/schema";
import { and, desc, eq } from "drizzle-orm";
import { getCustodyState, maybeSyncCustodyDeposits } from "@/lib/custody";
import {
  listWallets,
  listLiveOrders,
  getLiveMetrics,
  maybeCreateBotLiveOrder,
  listVerifiedWallets,
} from "@/lib/wallet-store";

function randomHex(len: number): string {
  const chars = "0123456789abcdef";
  let out = "0x";
  for (let i = 0; i < len; i++) {
    out += chars[Math.floor(Math.random() * chars.length)];
  }
  return out;
}

function randomSolAddress(): string {
  const chars = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  let out = "";
  for (let i = 0; i < 44; i++) {
    out += chars[Math.floor(Math.random() * chars.length)];
  }
  return out;
}

export function generateTxHash(chain: string): string {
  if (chain === "SOL") {
    return randomSolAddress().slice(0, 12) + "..." + randomSolAddress().slice(-6);
  }
  const full = randomHex(40);
  return full.slice(0, 10) + "..." + full.slice(-6);
}

export function computeViabilityScore(input: {
  liquidityScore: number;
  momentumScore: number;
  securityScore: number;
  sentimentScore: number;
  isHoneypotSafe: boolean;
  isLpLocked: boolean;
  sellTaxPct: number;
}): number {
  if (!input.isHoneypotSafe || input.sellTaxPct > 10) {
    return Math.min(
      36,
      Math.round(
        input.liquidityScore * 0.2 +
          input.momentumScore * 0.2 +
          input.securityScore * 0.1
      )
    );
  }
  const raw =
    input.liquidityScore * 0.25 +
    input.momentumScore * 0.32 +
    input.securityScore * 0.28 +
    input.sentimentScore * 0.15;
  const lpPenalty = input.isLpLocked ? 0 : 14;
  return Math.max(12, Math.min(99, Math.round(raw - lpPenalty)));
}

const INITIAL_TOKENS = [
  {
    symbol: "GOATAI",
    name: "Truth Terminal Sovereign",
    chain: "SOL",
    category: "AI_MEME",
    contractAddress: "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU",
    priceUsd: 0.0482,
    priceChange5m: 14.8,
    priceChange1h: 42.6,
    volume24hUsd: 4820000,
    liquidityUsd: 640000,
    marketCapUsd: 14200000,
    liquidityScore: 94,
    momentumScore: 96,
    securityScore: 95,
    sentimentScore: 92,
    isHoneypotSafe: true,
    isLpLocked: true,
    isMintRenounced: true,
    topHoldersPct: 11.4,
    buyTaxPct: 0,
    sellTaxPct: 0,
    ageMinutes: 185,
    sparkline: JSON.stringify([0.031, 0.034, 0.033, 0.038, 0.041, 0.045, 0.0482]),
    signalReason: "Raydium LP 100% burned • 4.6x 5m buy volume spike • 3 smart-money wallets entered",
    status: "SNIPED",
  },
  {
    symbol: "BRETTX",
    name: "Based Brett Alpha",
    chain: "BASE",
    category: "MEME",
    contractAddress: "0x532f27101965dd16442E59d40670FaF5eBB142E4",
    priceUsd: 0.1184,
    priceChange5m: 9.4,
    priceChange1h: 27.3,
    volume24hUsd: 3190000,
    liquidityUsd: 520000,
    marketCapUsd: 19800000,
    liquidityScore: 91,
    momentumScore: 89,
    securityScore: 94,
    sentimentScore: 88,
    isHoneypotSafe: true,
    isLpLocked: true,
    isMintRenounced: true,
    topHoldersPct: 13.2,
    buyTaxPct: 0,
    sellTaxPct: 0,
    ageMinutes: 310,
    sparkline: JSON.stringify([0.092, 0.095, 0.099, 0.104, 0.108, 0.113, 0.1184]),
    signalReason: "Aerodrome deep LP lock • Zero tax verified • Accelerating social velocity on Base",
    status: "SNIPED",
  },
  {
    symbol: "NEURO",
    name: "NeuroSwarm Agent",
    chain: "SOL",
    category: "AI_MEME",
    contractAddress: "9pL2mN8qR4vW6xZ1kC5tB3yF7hJ2dG9sA4eW8uP1qYzR",
    priceUsd: 0.0195,
    priceChange5m: 11.2,
    priceChange1h: 31.8,
    volume24hUsd: 2150000,
    liquidityUsd: 310000,
    marketCapUsd: 6400000,
    liquidityScore: 86,
    momentumScore: 92,
    securityScore: 93,
    sentimentScore: 90,
    isHoneypotSafe: true,
    isLpLocked: true,
    isMintRenounced: true,
    topHoldersPct: 14.1,
    buyTaxPct: 0,
    sellTaxPct: 0,
    ageMinutes: 94,
    sparkline: JSON.stringify([0.014, 0.015, 0.0158, 0.0169, 0.0175, 0.0186, 0.0195]),
    signalReason: "Graduated Pump.fun bonding curve • Clean mint authority • +310% buyer/seller ratio",
    status: "SNIPED",
  },
  {
    symbol: "ZEREBROX",
    name: "Zerebro Hypernode",
    chain: "SOL",
    category: "AI_MEME",
    contractAddress: "4kM9pQ2vL7xR5wN1tC8bF3yH6jD2sG9aE4uW7cP5qXzM",
    priceUsd: 0.00842,
    priceChange5m: 18.6,
    priceChange1h: 51.4,
    volume24hUsd: 1940000,
    liquidityUsd: 275000,
    marketCapUsd: 4900000,
    liquidityScore: 85,
    momentumScore: 95,
    securityScore: 92,
    sentimentScore: 91,
    isHoneypotSafe: true,
    isLpLocked: true,
    isMintRenounced: true,
    topHoldersPct: 12.8,
    buyTaxPct: 0,
    sellTaxPct: 0,
    ageMinutes: 42,
    sparkline: JSON.stringify([0.0054, 0.0059, 0.0063, 0.0068, 0.0072, 0.0079, 0.00842]),
    signalReason: "Fresh 5m breakout • Whale cluster buy ($48k) • Contract immutable & LP burned",
    status: "WATCHING",
  },
  {
    symbol: "AEROFI",
    name: "AeroPulse Liquidity",
    chain: "BASE",
    category: "DEFI_ALPHA",
    contractAddress: "0x940181a94A35A4569E4529A3CDfB74e38FD98631",
    priceUsd: 0.342,
    priceChange5m: 6.8,
    priceChange1h: 19.4,
    volume24hUsd: 2840000,
    liquidityUsd: 780000,
    marketCapUsd: 24500000,
    liquidityScore: 96,
    momentumScore: 83,
    securityScore: 97,
    sentimentScore: 82,
    isHoneypotSafe: true,
    isLpLocked: true,
    isMintRenounced: true,
    topHoldersPct: 9.6,
    buyTaxPct: 0,
    sellTaxPct: 0,
    ageMinutes: 620,
    sparkline: JSON.stringify([0.285, 0.294, 0.301, 0.312, 0.321, 0.334, 0.342]),
    signalReason: "Institutional Base DEX volume surge • Top-tier liquidity depth ($780k) • 0% slippage",
    status: "WATCHING",
  },
  {
    symbol: "PEPE2026",
    name: "CyberPepe Protocol",
    chain: "ETH",
    category: "MEME",
    contractAddress: "0x6982508145454Ce325dDbE47a25d4ec3d2311933",
    priceUsd: 0.00274,
    priceChange5m: -1.8,
    priceChange1h: 16.2,
    volume24hUsd: 5120000,
    liquidityUsd: 890000,
    marketCapUsd: 28900000,
    liquidityScore: 95,
    momentumScore: 76,
    securityScore: 94,
    sentimentScore: 86,
    isHoneypotSafe: true,
    isLpLocked: true,
    isMintRenounced: true,
    topHoldersPct: 11.9,
    buyTaxPct: 0,
    sellTaxPct: 0,
    ageMinutes: 540,
    sparkline: JSON.stringify([0.00235, 0.00248, 0.00265, 0.00281, 0.00279, 0.00277, 0.00274]),
    signalReason: "Healthy consolidation after +18% impulse • Deep Uniswap v3 pool • Zero tax",
    status: "SNIPED",
  },
  {
    symbol: "PONKEV2",
    name: "Ponke Hyperdrive",
    chain: "SOL",
    category: "MEME",
    contractAddress: "5z3EqYQo9HiCEs3R84RCDMu2n7anpDMxRhdK8PSWmrRC",
    priceUsd: 0.0645,
    priceChange5m: 12.4,
    priceChange1h: 28.9,
    volume24hUsd: 1680000,
    liquidityUsd: 245000,
    marketCapUsd: 5800000,
    liquidityScore: 84,
    momentumScore: 88,
    securityScore: 90,
    sentimentScore: 89,
    isHoneypotSafe: true,
    isLpLocked: true,
    isMintRenounced: true,
    topHoldersPct: 14.8,
    buyTaxPct: 0,
    sellTaxPct: 0,
    ageMinutes: 76,
    sparkline: JSON.stringify([0.049, 0.052, 0.055, 0.057, 0.06, 0.062, 0.0645]),
    signalReason: "High retail wallet inflow (420 buyers / 15m) • Verified SPL metadata & LP burn",
    status: "WATCHING",
  },
  {
    symbol: "ARBXBT",
    name: "Arbitrum Quant Agent",
    chain: "ARB",
    category: "AI_MEME",
    contractAddress: "0x912CE59144191C1204E64559FE8253a0e49E6548",
    priceUsd: 0.0892,
    priceChange5m: 8.1,
    priceChange1h: 22.7,
    volume24hUsd: 1420000,
    liquidityUsd: 330000,
    marketCapUsd: 7900000,
    liquidityScore: 88,
    momentumScore: 84,
    securityScore: 91,
    sentimentScore: 83,
    isHoneypotSafe: true,
    isLpLocked: true,
    isMintRenounced: true,
    topHoldersPct: 12.1,
    buyTaxPct: 0,
    sellTaxPct: 0,
    ageMinutes: 215,
    sparkline: JSON.stringify([0.072, 0.075, 0.078, 0.081, 0.084, 0.0865, 0.0892]),
    signalReason: "Camelot v3 concentrated liquidity • On-chain AI oracle momentum signal",
    status: "WATCHING",
  },
  {
    symbol: "TOSHI99",
    name: "Toshi Base Meow",
    chain: "BASE",
    category: "MEME",
    contractAddress: "0xAC1Bd2486aAf3B5C0fc3Fd868558b082a531B2B4",
    priceUsd: 0.00148,
    priceChange5m: 5.4,
    priceChange1h: 14.9,
    volume24hUsd: 980000,
    liquidityUsd: 195000,
    marketCapUsd: 3600000,
    liquidityScore: 79,
    momentumScore: 78,
    securityScore: 89,
    sentimentScore: 81,
    isHoneypotSafe: true,
    isLpLocked: true,
    isMintRenounced: true,
    topHoldersPct: 15.6,
    buyTaxPct: 0,
    sellTaxPct: 0,
    ageMinutes: 140,
    sparkline: JSON.stringify([0.00128, 0.00131, 0.00135, 0.00139, 0.00141, 0.00145, 0.00148]),
    signalReason: "Steady Base accumulation • Clean contract audit • Building volume base",
    status: "WATCHING",
  },
  {
    symbol: "MOONDOG",
    name: "MoonDog Inu",
    chain: "SOL",
    category: "MEME",
    contractAddress: "3vK8pL2mN9qR4wX6zC1tB5yF7hJ2dG8sA4eW9uP2qYzK",
    priceUsd: 0.00062,
    priceChange5m: 34.2,
    priceChange1h: 82.0,
    volume24hUsd: 610000,
    liquidityUsd: 28000,
    marketCapUsd: 1850000,
    liquidityScore: 45,
    momentumScore: 89,
    securityScore: 32,
    sentimentScore: 68,
    isHoneypotSafe: false,
    isLpLocked: false,
    isMintRenounced: false,
    topHoldersPct: 48.5,
    buyTaxPct: 2,
    sellTaxPct: 25,
    ageMinutes: 19,
    sparkline: JSON.stringify([0.00031, 0.00038, 0.00045, 0.00051, 0.00055, 0.00059, 0.00062]),
    signalReason: "BLOCKED BY ANTI-RUG: 25% dynamic sell tax & unlocked LP • Top 10 wallets hold 48.5%",
    status: "REJECTED",
  },
];

const MEMPOOL_CANDIDATE_POOL = [
  {
    symbol: "ACTAI",
    name: "Act I: Prophecy Node",
    chain: "SOL",
    category: "AI_MEME",
    priceUsd: 0.0264,
    liquidityUsd: 380000,
    volume24hUsd: 2450000,
    marketCapUsd: 8200000,
    liquidityScore: 89,
    momentumScore: 93,
    securityScore: 94,
    sentimentScore: 91,
    isHoneypotSafe: true,
    isLpLocked: true,
    isMintRenounced: true,
    topHoldersPct: 11.8,
    buyTaxPct: 0,
    sellTaxPct: 0,
    signalReason: "Raydium whale snipe detected ($62k) • 100% LP burned • 5.1x volume velocity",
  },
  {
    symbol: "DEGENB",
    name: "Degen Base L3",
    chain: "BASE",
    category: "MEME",
    priceUsd: 0.0158,
    liquidityUsd: 420000,
    volume24hUsd: 3120000,
    marketCapUsd: 11400000,
    liquidityScore: 91,
    momentumScore: 90,
    securityScore: 95,
    sentimentScore: 89,
    isHoneypotSafe: true,
    isLpLocked: true,
    isMintRenounced: true,
    topHoldersPct: 10.4,
    buyTaxPct: 0,
    sellTaxPct: 0,
    signalReason: "Base social alpha breakout • Verified 0/0 tax • Deep Aerodrome locked pool",
  },
  {
    symbol: "FARTCOINX",
    name: "HyperFart Sovereign",
    chain: "SOL",
    category: "MEME",
    priceUsd: 0.0715,
    liquidityUsd: 510000,
    volume24hUsd: 3890000,
    marketCapUsd: 15600000,
    liquidityScore: 92,
    momentumScore: 94,
    securityScore: 92,
    sentimentScore: 95,
    isHoneypotSafe: true,
    isLpLocked: true,
    isMintRenounced: true,
    topHoldersPct: 12.9,
    buyTaxPct: 0,
    sellTaxPct: 0,
    signalReason: "Explosive meme velocity (+380% 15m volume) • Mint authority revoked • High liquidity",
  },
  {
    symbol: "VIRTUALS",
    name: "Virtual Agent Protocol",
    chain: "BASE",
    category: "AI_MEME",
    priceUsd: 0.412,
    liquidityUsd: 690000,
    volume24hUsd: 4650000,
    marketCapUsd: 22400000,
    liquidityScore: 95,
    momentumScore: 91,
    securityScore: 96,
    sentimentScore: 90,
    isHoneypotSafe: true,
    isLpLocked: true,
    isMintRenounced: true,
    topHoldersPct: 9.8,
    buyTaxPct: 0,
    sellTaxPct: 0,
    signalReason: "AI Agent launchpad surge • Institutional smart-money accumulation on Base",
  },
  {
    symbol: "GMXAI",
    name: "GMX Perp Autonomous",
    chain: "ARB",
    category: "DEFI_ALPHA",
    priceUsd: 0.194,
    liquidityUsd: 460000,
    volume24hUsd: 1980000,
    marketCapUsd: 9800000,
    liquidityScore: 90,
    momentumScore: 86,
    securityScore: 95,
    sentimentScore: 84,
    isHoneypotSafe: true,
    isLpLocked: true,
    isMintRenounced: true,
    topHoldersPct: 11.2,
    buyTaxPct: 0,
    sellTaxPct: 0,
    signalReason: "Arbitrum perp yield momentum • Audited smart contract • Strong orderbook depth",
  },
  {
    symbol: "RUGPEPE",
    name: "Fake Pepe Yield",
    chain: "ETH",
    category: "MEME",
    priceUsd: 0.00019,
    liquidityUsd: 19000,
    volume24hUsd: 420000,
    marketCapUsd: 950000,
    liquidityScore: 34,
    momentumScore: 79,
    securityScore: 18,
    sentimentScore: 52,
    isHoneypotSafe: false,
    isLpLocked: false,
    isMintRenounced: false,
    topHoldersPct: 62.0,
    buyTaxPct: 5,
    sellTaxPct: 45,
    signalReason: "HONEYPOT DETECTED: Blacklist function active & 45% sell fee • Auto-blocked",
  },
];

let isSeeding = false;

export async function ensureInitialized() {
  const existingConfigs = await db.select().from(botConfigs).limit(1);
  if (existingConfigs.length > 0) {
    return existingConfigs[0];
  }

  if (isSeeding) {
    await new Promise((r) => setTimeout(r, 250));
    const retry = await db.select().from(botConfigs).limit(1);
    if (retry.length > 0) return retry[0];
  }

  isSeeding = true;
  try {
    const [config] = await db
      .insert(botConfigs)
      .values({
        isRunning: true,
        strategyPreset: "MEME_SNIPER",
        allocatedCapital: 10000,
        cashBalance: 8140,
        realizedPnl: 1842.4,
        totalTrades: 24,
        winningTrades: 19,
        maxPositionUsd: 450,
        minViabilityScore: 78,
        takeProfitPct: 32,
        stopLossPct: 12,
        maxSlippagePct: 1.5,
        minLiquidityUsd: 45000,
        requireLpLocked: true,
        autoCompound: true,
      })
      .returning();

    const insertedTokens: DiscoveredToken[] = [];
    for (const t of INITIAL_TOKENS) {
      const score = computeViabilityScore(t);
      const [row] = await db
        .insert(discoveredTokens)
        .values({
          ...t,
          viabilityScore: score,
        })
        .returning();
      insertedTokens.push(row);
    }

    const goatai = insertedTokens.find((t) => t.symbol === "GOATAI");
    const brettx = insertedTokens.find((t) => t.symbol === "BRETTX");
    const neuro = insertedTokens.find((t) => t.symbol === "NEURO");
    const pepe2026 = insertedTokens.find((t) => t.symbol === "PEPE2026");

    // Seed 4 active positions + 4 historical closed trades
    await db.insert(positions).values([
      {
        tokenId: goatai?.id ?? 1,
        symbol: "GOATAI",
        name: "Truth Terminal Sovereign",
        chain: "SOL",
        category: "AI_MEME",
        contractAddress: goatai?.contractAddress ?? "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU",
        entryPriceUsd: 0.0385,
        currentPriceUsd: 0.0482,
        quantity: 450 / 0.0385,
        investedUsd: 450,
        currentValueUsd: 563.38,
        pnlUsd: 113.38,
        pnlPct: 25.2,
        takeProfitPct: 32,
        stopLossPct: 12,
        viabilityAtEntry: 95,
        status: "OPEN",
        txHash: "5xKm9pQ2vL7x...9qYzR",
      },
      {
        tokenId: brettx?.id ?? 2,
        symbol: "BRETTX",
        name: "Based Brett Alpha",
        chain: "BASE",
        category: "MEME",
        contractAddress: brettx?.contractAddress ?? "0x532f27101965dd16442E59d40670FaF5eBB142E4",
        entryPriceUsd: 0.1032,
        currentPriceUsd: 0.1184,
        quantity: 450 / 0.1032,
        investedUsd: 450,
        currentValueUsd: 516.28,
        pnlUsd: 66.28,
        pnlPct: 14.73,
        takeProfitPct: 32,
        stopLossPct: 12,
        viabilityAtEntry: 91,
        status: "OPEN",
        txHash: "0x8a4f9c12...e41b92",
      },
      {
        tokenId: neuro?.id ?? 3,
        symbol: "NEURO",
        name: "NeuroSwarm Agent",
        chain: "SOL",
        category: "AI_MEME",
        contractAddress: neuro?.contractAddress ?? "9pL2mN8qR4vW6xZ1kC5tB3yF7hJ2dG9sA4eW8uP1qYzR",
        entryPriceUsd: 0.0178,
        currentPriceUsd: 0.0195,
        quantity: 450 / 0.0178,
        investedUsd: 450,
        currentValueUsd: 492.98,
        pnlUsd: 42.98,
        pnlPct: 9.55,
        takeProfitPct: 32,
        stopLossPct: 12,
        viabilityAtEntry: 90,
        status: "OPEN",
        txHash: "3mN8qR4vW6xZ...8uP1qY",
      },
      {
        tokenId: pepe2026?.id ?? 6,
        symbol: "PEPE2026",
        name: "CyberPepe Protocol",
        chain: "ETH",
        category: "MEME",
        contractAddress: pepe2026?.contractAddress ?? "0x6982508145454Ce325dDbE47a25d4ec3d2311933",
        entryPriceUsd: 0.00279,
        currentPriceUsd: 0.00274,
        quantity: 450 / 0.00279,
        investedUsd: 450,
        currentValueUsd: 441.94,
        pnlUsd: -8.06,
        pnlPct: -1.79,
        takeProfitPct: 32,
        stopLossPct: 12,
        viabilityAtEntry: 86,
        status: "OPEN",
        txHash: "0x4c91b82f...311933",
      },
      // Closed profitable & stop-loss positions
      {
        tokenId: 1,
        symbol: "WIFAI",
        name: "DogWifNeuralNet",
        chain: "SOL",
        category: "AI_MEME",
        contractAddress: "8kL3mN9qR4vW6xZ1kC5tB3yF7hJ2dG9sA4eW8uP1qWif",
        entryPriceUsd: 0.021,
        currentPriceUsd: 0.0291,
        quantity: 21428.57,
        investedUsd: 450,
        currentValueUsd: 623.57,
        pnlUsd: 173.57,
        pnlPct: 38.57,
        takeProfitPct: 32,
        stopLossPct: 12,
        viabilityAtEntry: 94,
        status: "CLOSED_TP",
        txHash: "9kL3mN9qR4vW...1qWif",
        closedAt: new Date(Date.now() - 1000 * 60 * 18),
      },
      {
        tokenId: 2,
        symbol: "MOCHIB",
        name: "Mochi Base Cat",
        chain: "BASE",
        category: "MEME",
        contractAddress: "0x721f27101965dd16442E59d40670FaF5eBB991A2",
        entryPriceUsd: 0.0042,
        currentPriceUsd: 0.00565,
        quantity: 107142.85,
        investedUsd: 450,
        currentValueUsd: 605.36,
        pnlUsd: 155.36,
        pnlPct: 34.52,
        takeProfitPct: 32,
        stopLossPct: 12,
        viabilityAtEntry: 89,
        status: "CLOSED_TP",
        txHash: "0x721f2710...B991A2",
        closedAt: new Date(Date.now() - 1000 * 60 * 42),
      },
      {
        tokenId: 3,
        symbol: "TURBOX",
        name: "Turbo Toad AI",
        chain: "ETH",
        category: "AI_MEME",
        contractAddress: "0xA35923162C49Cf95e6BF26623385eb431ad920D3",
        entryPriceUsd: 0.0088,
        currentPriceUsd: 0.00778,
        quantity: 51136.36,
        investedUsd: 450,
        currentValueUsd: 397.84,
        pnlUsd: -52.16,
        pnlPct: -11.59,
        takeProfitPct: 32,
        stopLossPct: 12,
        viabilityAtEntry: 81,
        status: "CLOSED_SL",
        txHash: "0xA3592316...d920D3",
        closedAt: new Date(Date.now() - 1000 * 60 * 75),
      },
      {
        tokenId: 4,
        symbol: "POPCATX",
        name: "Popcat Solana Surge",
        chain: "SOL",
        category: "MEME",
        contractAddress: "7GCihgDB8fe6KNjn2MYtkzZcRjQy3t9GHdC8uHYmW2hr",
        entryPriceUsd: 0.142,
        currentPriceUsd: 0.191,
        quantity: 3169.01,
        investedUsd: 450,
        currentValueUsd: 605.28,
        pnlUsd: 155.28,
        pnlPct: 34.51,
        takeProfitPct: 32,
        stopLossPct: 12,
        viabilityAtEntry: 92,
        status: "CLOSED_TP",
        txHash: "7GCihgDB8fe6...YmW2hr",
        closedAt: new Date(Date.now() - 1000 * 60 * 110),
      },
    ]);

    // Seed Execution Logs
    await db.insert(executionLogs).values([
      {
        level: "SYSTEM",
        symbol: "ENGINE",
        chain: "MULTI",
        message: "VORTEX Autonomous Execution Engine v4.2 initialized across SOL, BASE, ETH, ARB RPC nodes",
        details: "Strategy: MEME_SNIPER | Min Viability >= 78/100 | Anti-Rug Shield: STRICT",
      },
      {
        level: "BUY",
        symbol: "BRETTX",
        chain: "BASE",
        message: "Autonomous SNIPE executed on $BRETTX @ $0.1032 ($450.00 allocation)",
        details: "Viability 91/100 • Aerodrome LP locked • 0% tax verified",
        txHash: "0x8a4f9c12...e41b92",
      },
      {
        level: "SELL_TP",
        symbol: "WIFAI",
        chain: "SOL",
        message: "TAKE-PROFIT target hit on $WIFAI (+38.57%) — Realized +$173.57 profit",
        details: "Exited 21,428.57 WIFAI @ $0.0291 via Jupiter Aggregator v6",
        pnlDeltaUsd: 173.57,
        txHash: "9kL3mN9qR4vW...1qWif",
      },
      {
        level: "REJECT",
        symbol: "MOONDOG",
        chain: "SOL",
        message: "ANTI-RUG SHIELD blocked $MOONDOG — Honeypot & 25% sell tax detected",
        details: "Viability capped at 36/100 • Top 10 holders control 48.5% supply",
      },
      {
        level: "BUY",
        symbol: "GOATAI",
        chain: "SOL",
        message: "Autonomous SNIPE executed on $GOATAI @ $0.0385 ($450.00 allocation)",
        details: "Viability 95/100 • 4.6x 5m volume acceleration • Raydium LP burned",
        txHash: "5xKm9pQ2vL7x...9qYzR",
      },
      {
        level: "BUY",
        symbol: "NEURO",
        chain: "SOL",
        message: "Autonomous SNIPE executed on $NEURO @ $0.0178 ($450.00 allocation)",
        details: "Viability 90/100 • Pump.fun graduation impulse • Mint renounced",
        txHash: "3mN8qR4vW6xZ...8uP1qY",
      },
      {
        level: "AUDIT",
        symbol: "ZEREBROX",
        chain: "SOL",
        message: "Contract & Liquidity Audit passed for $ZEREBROX — Viability Score 91/100",
        details: "LP Depth: $275k | Buy/Sell Tax: 0%/0% | Queued for autonomous entry",
      },
    ]);

    // Seed Equity Snapshots (12 historical intervals up to present)
    const snapshots = [
      { label: "00:00", totalEquityUsd: 10000, realizedPnlUsd: 0, unrealizedPnlUsd: 0, benchmarkUsd: 10000 },
      { label: "02:00", totalEquityUsd: 10185, realizedPnlUsd: 140, unrealizedPnlUsd: 45, benchmarkUsd: 10040 },
      { label: "04:00", totalEquityUsd: 10410, realizedPnlUsd: 310, unrealizedPnlUsd: 100, benchmarkUsd: 9980 },
      { label: "06:00", totalEquityUsd: 10360, realizedPnlUsd: 265, unrealizedPnlUsd: 95, benchmarkUsd: 9910 },
      { label: "08:00", totalEquityUsd: 10690, realizedPnlUsd: 540, unrealizedPnlUsd: 150, benchmarkUsd: 10090 },
      { label: "10:00", totalEquityUsd: 10940, realizedPnlUsd: 780, unrealizedPnlUsd: 160, benchmarkUsd: 10150 },
      { label: "12:00", totalEquityUsd: 11180, realizedPnlUsd: 995, unrealizedPnlUsd: 185, benchmarkUsd: 10120 },
      { label: "14:00", totalEquityUsd: 11420, realizedPnlUsd: 1240, unrealizedPnlUsd: 180, benchmarkUsd: 10240 },
      { label: "16:00", totalEquityUsd: 11590, realizedPnlUsd: 1410, unrealizedPnlUsd: 180, benchmarkUsd: 10190 },
      { label: "18:00", totalEquityUsd: 11780, realizedPnlUsd: 1590, unrealizedPnlUsd: 190, benchmarkUsd: 10280 },
      { label: "20:00", totalEquityUsd: 11910, realizedPnlUsd: 1668, unrealizedPnlUsd: 242, benchmarkUsd: 10340 },
      { label: "LIVE", totalEquityUsd: 12054.58, realizedPnlUsd: 1842.4, unrealizedPnlUsd: 214.58, benchmarkUsd: 10390 },
    ];
    await db.insert(equitySnapshots).values(snapshots);

    return config;
  } finally {
    isSeeding = false;
  }
}

export async function getTerminalState(sessionId?: number | null) {
  const config = await ensureInitialized();
  const tokens = await db
    .select()
    .from(discoveredTokens)
    .orderBy(desc(discoveredTokens.viabilityScore));
  const allPositions = await db
    .select()
    .from(positions)
    .orderBy(desc(positions.openedAt));
  const logs = await db
    .select()
    .from(executionLogs)
    .orderBy(desc(executionLogs.id))
    .limit(35);
  const snapshots = await db
    .select()
    .from(equitySnapshots)
    .orderBy(equitySnapshots.id);

  const openPositions = allPositions.filter((p) => p.status === "OPEN" && !p.isLive);
  const closedPositions = allPositions.filter((p) => p.status !== "OPEN" && !p.isLive);
  const livePositions = allPositions.filter((p) => p.isLive);
  const walletRows = await listWallets();
  const liveOrderRows = await listLiveOrders();
  const liveMetrics = await getLiveMetrics(config);

  const openInvestedUsd = openPositions.reduce((acc, p) => acc + p.investedUsd, 0);
  const openCurrentValueUsd = openPositions.reduce((acc, p) => acc + p.currentValueUsd, 0);
  const unrealizedPnlUsd = openCurrentValueUsd - openInvestedUsd;
  const totalEquityUsd = config.cashBalance + openCurrentValueUsd;
  const totalProfitUsd = config.realizedPnl + unrealizedPnlUsd;
  const totalRoiPct = (totalProfitUsd / Math.max(1, config.allocatedCapital)) * 100;
  const winRatePct =
    config.totalTrades > 0 ? (config.winningTrades / config.totalTrades) * 100 : 0;

  return {
    config,
    metrics: {
      totalEquityUsd,
      cashBalance: config.cashBalance,
      openCurrentValueUsd,
      realizedPnlUsd: config.realizedPnl,
      unrealizedPnlUsd,
      totalProfitUsd,
      totalRoiPct,
      winRatePct,
      totalTrades: config.totalTrades,
      winningTrades: config.winningTrades,
      openPositionsCount: openPositions.length,
    },
    tokens,
    openPositions,
    closedPositions,
    logs,
    snapshots,
    wallets: walletRows,
    liveOrders: liveOrderRows,
    livePositions,
    liveMetrics,
    custody: sessionId !== undefined ? await getCustodyState(sessionId) : null,
  };
}

export async function runAutonomousTick(options?: { forceTrade?: boolean; sessionId?: number | null }) {
  const config = await ensureInitialized();
  if (options?.sessionId) await maybeSyncCustodyDeposits(options.sessionId);
  const tokens = await db.select().from(discoveredTokens);
  // On-chain (live) positions are non-custodial and are NEVER marked to market or
  // auto-exited by the paper engine. Only simulated positions are managed here.
  const allOpenPositions = await db
    .select()
    .from(positions)
    .where(and(eq(positions.status, "OPEN"), eq(positions.isLive, false)));

  let cashBalance = config.cashBalance;
  let realizedPnl = config.realizedPnl;
  let totalTrades = config.totalTrades;
  let winningTrades = config.winningTrades;

  const updatedTokenMap = new Map<number, DiscoveredToken>();

  // 1. Update token prices, sparklines, and viability scores with realistic market momentum
  for (const token of tokens) {
    // High-viability tokens have slight positive drift bias; low-viability have negative/erratic bias
    const bias =
      token.viabilityScore >= 85
        ? 0.018
        : token.viabilityScore >= 75
        ? 0.009
        : -0.012;
    const randomSwing = (Math.random() - 0.44) * 0.055 + bias;
    const newPrice = Math.max(0.00001, Number((token.priceUsd * (1 + randomSwing)).toPrecision(5)));
    const pctDelta = ((newPrice - token.priceUsd) / token.priceUsd) * 100;
    const newChange5m = Number(
      Math.max(-35, Math.min(95, token.priceChange5m * 0.75 + pctDelta * 2.2)).toFixed(2)
    );
    const newChange1h = Number(
      Math.max(-45, Math.min(180, token.priceChange1h + pctDelta * 0.8)).toFixed(2)
    );
    const newVolume = Math.round(token.volume24hUsd * (1 + Math.abs(randomSwing) * 0.6));

    let spark: number[] = [];
    try {
      spark = JSON.parse(token.sparkline);
    } catch {
      spark = [token.priceUsd];
    }
    spark = [...spark.slice(-6), newPrice];

    const newMomentum = Math.max(
      25,
      Math.min(99, Math.round(token.momentumScore + (pctDelta > 0 ? 1.5 : -1.2)))
    );
    const newViability = computeViabilityScore({
      liquidityScore: token.liquidityScore,
      momentumScore: newMomentum,
      securityScore: token.securityScore,
      sentimentScore: token.sentimentScore,
      isHoneypotSafe: token.isHoneypotSafe,
      isLpLocked: token.isLpLocked,
      sellTaxPct: token.sellTaxPct,
    });

    const [updated] = await db
      .update(discoveredTokens)
      .set({
        priceUsd: newPrice,
        priceChange5m: newChange5m,
        priceChange1h: newChange1h,
        volume24hUsd: newVolume,
        momentumScore: newMomentum,
        viabilityScore: newViability,
        sparkline: JSON.stringify(spark),
      })
      .where(eq(discoveredTokens.id, token.id))
      .returning();

    if (updated) {
      updatedTokenMap.set(updated.id, updated);
    }
  }

  // 2. Update all OPEN positions & execute Autonomous Take-Profit / Stop-Loss exits if bot is running
  const remainingOpenPositions: Position[] = [];
  for (const pos of allOpenPositions) {
    const linkedToken = pos.tokenId ? updatedTokenMap.get(pos.tokenId) : undefined;
    // Slight upward bias on sniped alpha positions so users see realistic profit generation
    const fallbackMultiplier = 1 + (Math.random() - 0.36) * 0.065;
    const currentPriceUsd = linkedToken
      ? linkedToken.priceUsd
      : Number((pos.currentPriceUsd * fallbackMultiplier).toPrecision(5));

    const currentValueUsd = Number((pos.quantity * currentPriceUsd).toFixed(2));
    const pnlUsd = Number((currentValueUsd - pos.investedUsd).toFixed(2));
    const pnlPct = Number(((pnlUsd / pos.investedUsd) * 100).toFixed(2));

    const effectiveTp = config.takeProfitPct;
    const effectiveSl = config.stopLossPct;

    if (config.isRunning && pnlPct >= effectiveTp) {
      // Autonomous TAKE PROFIT!
      const txHash = generateTxHash(pos.chain);
      await db
        .update(positions)
        .set({
          currentPriceUsd,
          currentValueUsd,
          pnlUsd,
          pnlPct,
          status: "CLOSED_TP",
          closedAt: new Date(),
        })
        .where(eq(positions.id, pos.id));

      if (pos.tokenId) {
        await db
          .update(discoveredTokens)
          .set({ status: "WATCHING" })
          .where(eq(discoveredTokens.id, pos.tokenId));
      }

      cashBalance = Number((cashBalance + currentValueUsd).toFixed(2));
      realizedPnl = Number((realizedPnl + pnlUsd).toFixed(2));
      totalTrades += 1;
      winningTrades += 1;

      await db.insert(executionLogs).values({
        level: "SELL_TP",
        symbol: pos.symbol,
        chain: pos.chain,
        message: `TAKE-PROFIT executed on $${pos.symbol} (+${pnlPct.toFixed(2)}%) — Locked in +$${pnlUsd.toFixed(2)} profit`,
        details: `Sold ${pos.quantity.toFixed(2)} ${pos.symbol} @ $${currentPriceUsd} (Entry: $${pos.entryPriceUsd})`,
        pnlDeltaUsd: pnlUsd,
        txHash,
      });
    } else if (config.isRunning && pnlPct <= -effectiveSl) {
      // Autonomous STOP LOSS protection!
      const txHash = generateTxHash(pos.chain);
      await db
        .update(positions)
        .set({
          currentPriceUsd,
          currentValueUsd,
          pnlUsd,
          pnlPct,
          status: "CLOSED_SL",
          closedAt: new Date(),
        })
        .where(eq(positions.id, pos.id));

      if (pos.tokenId) {
        await db
          .update(discoveredTokens)
          .set({ status: "WATCHING" })
          .where(eq(discoveredTokens.id, pos.tokenId));
      }

      cashBalance = Number((cashBalance + currentValueUsd).toFixed(2));
      realizedPnl = Number((realizedPnl + pnlUsd).toFixed(2));
      totalTrades += 1;

      await db.insert(executionLogs).values({
        level: "SELL_SL",
        symbol: pos.symbol,
        chain: pos.chain,
        message: `STOP-LOSS shield triggered on $${pos.symbol} (${pnlPct.toFixed(2)}%) — Protected capital`,
        details: `Exited ${pos.symbol} @ $${currentPriceUsd} to cap downside risk`,
        pnlDeltaUsd: pnlUsd,
        txHash,
      });
    } else {
      const [updatedPos] = await db
        .update(positions)
        .set({
          currentPriceUsd,
          currentValueUsd,
          pnlUsd,
          pnlPct,
        })
        .where(eq(positions.id, pos.id))
        .returning();
      if (updatedPos) remainingOpenPositions.push(updatedPos);
    }
  }

  // 3. Autonomous Discovery & Snipe Engine (if running or forceTrade)
  if (config.isRunning || options?.forceTrade) {
    const openSymbols = new Set(remainingOpenPositions.map((p) => p.symbol));
    const allFreshTokens = Array.from(updatedTokenMap.values());

    // Find viable candidates matching user's strategy rules
    const candidates = allFreshTokens
      .filter(
        (t) =>
          t.status === "WATCHING" &&
          !openSymbols.has(t.symbol) &&
          t.isHoneypotSafe &&
          (!config.requireLpLocked || t.isLpLocked) &&
          t.liquidityUsd >= config.minLiquidityUsd &&
          t.viabilityScore >= config.minViabilityScore
      )
      .sort((a, b) => b.viabilityScore - a.viabilityScore);

    const shouldSnipe =
      config.tradingMode === "PAPER" &&
      (options?.forceTrade || (remainingOpenPositions.length < 5 && Math.random() < 0.65)) &&
      candidates.length > 0 &&
      cashBalance >= config.maxPositionUsd;

    if (shouldSnipe) {
      const target = candidates[0];
      const allocationUsd = Math.min(config.maxPositionUsd, cashBalance);
      const quantity = allocationUsd / target.priceUsd;
      const txHash = generateTxHash(target.chain);

      const [newPos] = await db
        .insert(positions)
        .values({
          tokenId: target.id,
          symbol: target.symbol,
          name: target.name,
          chain: target.chain,
          category: target.category,
          contractAddress: target.contractAddress,
          entryPriceUsd: target.priceUsd,
          currentPriceUsd: target.priceUsd,
          quantity,
          investedUsd: allocationUsd,
          currentValueUsd: allocationUsd,
          pnlUsd: 0,
          pnlPct: 0,
          takeProfitPct: config.takeProfitPct,
          stopLossPct: config.stopLossPct,
          viabilityAtEntry: target.viabilityScore,
          status: "OPEN",
          txHash,
        })
        .returning();

      if (newPos) remainingOpenPositions.push(newPos);

      await db
        .update(discoveredTokens)
        .set({ status: "SNIPED" })
        .where(eq(discoveredTokens.id, target.id));

      cashBalance = Number((cashBalance - allocationUsd).toFixed(2));

      await db.insert(executionLogs).values({
        level: "BUY",
        symbol: target.symbol,
        chain: target.chain,
        message: `Autonomous SNIPE executed on $${target.symbol} @ $${target.priceUsd} ($${allocationUsd.toFixed(2)})`,
        details: `Viability ${target.viabilityScore}/100 • ${target.signalReason}`,
        txHash,
      });
    } else if (candidates.length > 0) {
      // Log an autonomous mempool scan / audit update
      const top = candidates[0];
      await db.insert(executionLogs).values({
        level: "SCAN",
        symbol: top.symbol,
        chain: top.chain,
        message: `Mempool Radar tracking $${top.symbol} (Viability ${top.viabilityScore}/100 • 5m: ${top.priceChange5m >= 0 ? "+" : ""}${top.priceChange5m}%)`,
        details: `Liquidity: $${(top.liquidityUsd / 1000).toFixed(0)}k • Monitoring orderflow for optimal entry`,
      });
    }
  }

  // 4. Persist updated botConfig balances
  const [freshConfig] = await db
    .update(botConfigs)
    .set({
      cashBalance,
      realizedPnl,
      totalTrades,
      winningTrades,
      updatedAt: new Date(),
    })
    .where(eq(botConfigs.id, config.id))
    .returning();

  // 4b. Autonomous LIVE intent generation (human signature always required)
  if (freshConfig) {
    await maybeCreateBotLiveOrder(freshConfig, Array.from(updatedTokenMap.values()), options?.sessionId);
  }

  // 5. Append a fresh Equity Snapshot point (keep max 18 points for crisp chart)
  const openValue = remainingOpenPositions.reduce((s, p) => s + p.currentValueUsd, 0);
  const openInvested = remainingOpenPositions.reduce((s, p) => s + p.investedUsd, 0);
  const unrealized = Number((openValue - openInvested).toFixed(2));
  const totalEq = Number((cashBalance + openValue).toFixed(2));
  const nowStr = new Date().toTimeString().slice(0, 8);

  await db.insert(equitySnapshots).values({
    label: nowStr,
    totalEquityUsd: totalEq,
    realizedPnlUsd: realizedPnl,
    unrealizedPnlUsd: unrealized,
    benchmarkUsd: Number((10390 + (Math.random() - 0.45) * 45).toFixed(2)),
  });

  const allSnaps = await db
    .select()
    .from(equitySnapshots)
    .orderBy(equitySnapshots.id);
  if (allSnaps.length > 16) {
    const toRemove = allSnaps.slice(0, allSnaps.length - 16);
    for (const old of toRemove) {
      await db.delete(equitySnapshots).where(eq(equitySnapshots.id, old.id));
    }
  }

  return getTerminalState(options?.sessionId);
}

export async function discoverMempoolTokens() {
  await ensureInitialized();
  const existing = await db.select().from(discoveredTokens);
  const existingSymbols = new Set(existing.map((e) => e.symbol));

  const available = MEMPOOL_CANDIDATE_POOL.filter((c) => !existingSymbols.has(c.symbol));
  const chosen =
    available.length > 0
      ? available[Math.floor(Math.random() * available.length)]
      : {
          symbol: `ALPHA${Math.floor(10 + Math.random() * 89)}`,
          name: `Autonomous Meme Gem #${Math.floor(100 + Math.random() * 899)}`,
          chain: ["SOL", "BASE", "ETH", "ARB"][Math.floor(Math.random() * 4)],
          category: ["AI_MEME", "MEME", "DEFI_ALPHA"][Math.floor(Math.random() * 3)],
          priceUsd: Number((0.004 + Math.random() * 0.08).toPrecision(4)),
          liquidityUsd: Math.round(140000 + Math.random() * 480000),
          volume24hUsd: Math.round(900000 + Math.random() * 3200000),
          marketCapUsd: Math.round(3200000 + Math.random() * 12000000),
          liquidityScore: Math.round(82 + Math.random() * 14),
          momentumScore: Math.round(85 + Math.random() * 13),
          securityScore: Math.round(88 + Math.random() * 10),
          sentimentScore: Math.round(82 + Math.random() * 15),
          isHoneypotSafe: true,
          isLpLocked: true,
          isMintRenounced: true,
          topHoldersPct: Number((9.5 + Math.random() * 5.5).toFixed(1)),
          buyTaxPct: 0,
          sellTaxPct: 0,
          signalReason:
            "Fresh DEX liquidity deployment • 0% buy/sell tax verified • Smart-money accumulation",
        };

  const viabilityScore = computeViabilityScore(chosen);
  const status = chosen.isHoneypotSafe ? "WATCHING" : "REJECTED";
  const basePrice = chosen.priceUsd;
  const sparkline = JSON.stringify([
    Number((basePrice * 0.76).toPrecision(4)),
    Number((basePrice * 0.81).toPrecision(4)),
    Number((basePrice * 0.85).toPrecision(4)),
    Number((basePrice * 0.89).toPrecision(4)),
    Number((basePrice * 0.93).toPrecision(4)),
    Number((basePrice * 0.97).toPrecision(4)),
    basePrice,
  ]);

  const contractAddress =
    chosen.chain === "SOL" ? randomSolAddress() : randomHex(40);

  const [inserted] = await db
    .insert(discoveredTokens)
    .values({
      symbol: chosen.symbol,
      name: chosen.name,
      chain: chosen.chain,
      category: chosen.category,
      contractAddress,
      priceUsd: chosen.priceUsd,
      priceChange5m: Number((8.5 + Math.random() * 18).toFixed(2)),
      priceChange1h: Number((22 + Math.random() * 42).toFixed(2)),
      volume24hUsd: chosen.volume24hUsd,
      liquidityUsd: chosen.liquidityUsd,
      marketCapUsd: chosen.marketCapUsd,
      viabilityScore,
      liquidityScore: chosen.liquidityScore,
      momentumScore: chosen.momentumScore,
      securityScore: chosen.securityScore,
      sentimentScore: chosen.sentimentScore,
      isHoneypotSafe: chosen.isHoneypotSafe,
      isLpLocked: chosen.isLpLocked,
      isMintRenounced: chosen.isMintRenounced,
      topHoldersPct: chosen.topHoldersPct,
      buyTaxPct: chosen.buyTaxPct,
      sellTaxPct: chosen.sellTaxPct,
      ageMinutes: Math.floor(4 + Math.random() * 28),
      sparkline,
      signalReason: chosen.signalReason,
      status,
    })
    .returning();

  await db.insert(executionLogs).values({
    level: chosen.isHoneypotSafe ? "AUDIT" : "REJECT",
    symbol: inserted.symbol,
    chain: inserted.chain,
    message: chosen.isHoneypotSafe
      ? `Discovered viable token $${inserted.symbol} on ${inserted.chain} — Viability Score ${viabilityScore}/100`
      : `Anti-Rug Shield rejected newly discovered $${inserted.symbol} (Viability ${viabilityScore}/100)`,
    details: inserted.signalReason,
  });

  return getTerminalState();
}

export async function manualSnipeToken(tokenId: number, customAmountUsd?: number) {
  const config = await ensureInitialized();
  const [token] = await db
    .select()
    .from(discoveredTokens)
    .where(eq(discoveredTokens.id, tokenId));

  if (!token) {
    throw new Error("Token not found");
  }

  const investAmount = Math.min(
    customAmountUsd ?? config.maxPositionUsd,
    config.cashBalance
  );
  if (investAmount < 25) {
    throw new Error("Insufficient available cash balance in vault");
  }

  const quantity = investAmount / token.priceUsd;
  const txHash = generateTxHash(token.chain);

  await db.insert(positions).values({
    tokenId: token.id,
    symbol: token.symbol,
    name: token.name,
    chain: token.chain,
    category: token.category,
    contractAddress: token.contractAddress,
    entryPriceUsd: token.priceUsd,
    currentPriceUsd: token.priceUsd,
    quantity,
    investedUsd: investAmount,
    currentValueUsd: investAmount,
    pnlUsd: 0,
    pnlPct: 0,
    takeProfitPct: config.takeProfitPct,
    stopLossPct: config.stopLossPct,
    viabilityAtEntry: token.viabilityScore,
    status: "OPEN",
    txHash,
  });

  await db
    .update(discoveredTokens)
    .set({ status: "SNIPED" })
    .where(eq(discoveredTokens.id, token.id));

  await db
    .update(botConfigs)
    .set({
      cashBalance: Number((config.cashBalance - investAmount).toFixed(2)),
      updatedAt: new Date(),
    })
    .where(eq(botConfigs.id, config.id));

  await db.insert(executionLogs).values({
    level: "BUY",
    symbol: token.symbol,
    chain: token.chain,
    message: `Instant SNIPE executed on $${token.symbol} @ $${token.priceUsd} ($${investAmount.toFixed(2)})`,
    details: `Viability Score ${token.viabilityScore}/100 • Priority MEV-protected route`,
    txHash,
  });

  return getTerminalState();
}

export async function manualClosePosition(positionId: number) {
  const config = await ensureInitialized();
  const [pos] = await db
    .select()
    .from(positions)
    .where(eq(positions.id, positionId));

  if (!pos || pos.status !== "OPEN") {
    throw new Error("Open position not found");
  }

  if (pos.isLive) {
    // On-chain positions are non-custodial: bookkeeping only, never paper cash.
    const { closeLivePositionBook } = await import("@/lib/wallet-store");
    await closeLivePositionBook(pos.id);
    return getTerminalState();
  }

  const txHash = generateTxHash(pos.chain);
  const isWin = pos.pnlUsd >= 0;

  await db
    .update(positions)
    .set({
      status: isWin ? "CLOSED_TP" : "CLOSED_MANUAL",
      closedAt: new Date(),
    })
    .where(eq(positions.id, pos.id));

  if (pos.tokenId) {
    await db
      .update(discoveredTokens)
      .set({ status: "WATCHING" })
      .where(eq(discoveredTokens.id, pos.tokenId));
  }

  await db
    .update(botConfigs)
    .set({
      cashBalance: Number((config.cashBalance + pos.currentValueUsd).toFixed(2)),
      realizedPnl: Number((config.realizedPnl + pos.pnlUsd).toFixed(2)),
      totalTrades: config.totalTrades + 1,
      winningTrades: config.winningTrades + (isWin ? 1 : 0),
      updatedAt: new Date(),
    })
    .where(eq(botConfigs.id, config.id));

  await db.insert(executionLogs).values({
    level: isWin ? "SELL_TP" : "SELL_SL",
    symbol: pos.symbol,
    chain: pos.chain,
    message: `Position closed on $${pos.symbol} (${pos.pnlPct >= 0 ? "+" : ""}${pos.pnlPct.toFixed(2)}%) — Net PnL ${pos.pnlUsd >= 0 ? "+" : ""}$${pos.pnlUsd.toFixed(2)}`,
    details: `Settled $${pos.currentValueUsd.toFixed(2)} back into Autonomous Vault`,
    pnlDeltaUsd: pos.pnlUsd,
    txHash,
  });

  return getTerminalState();
}

export async function updateBotConfig(updates: Partial<BotConfig>) {
  const config = await ensureInitialized();

  const sanitized: Partial<BotConfig> = { ...updates };

  if (updates.tradingMode !== undefined) {
    if (updates.tradingMode !== "PAPER" && updates.tradingMode !== "LIVE") {
      throw new Error("Invalid trading mode");
    }
    if (updates.tradingMode === "LIVE") {
      const verified = await listVerifiedWallets();
      if (verified.length === 0) {
        throw new Error(
          "Link and verify a wallet with a signature before switching the bot to LIVE mode."
        );
      }
    }
  }

  if (updates.liveMaxTradeUsd !== undefined) {
    sanitized.liveMaxTradeUsd = Math.min(
      1000,
      Math.max(0.5, Number(updates.liveMaxTradeUsd) || 0.5)
    );
  }
  if (updates.liveSlippagePct !== undefined) {
    sanitized.liveSlippagePct = Math.min(
      15,
      Math.max(0.1, Number(updates.liveSlippagePct) || 0.1)
    );
  }
  if (updates.liveDailyCapUsd !== undefined) {
    sanitized.liveDailyCapUsd = Math.min(
      5000,
      Math.max(1, Number(updates.liveDailyCapUsd) || 1)
    );
  }
  if (updates.liveSpentTodayUsd !== undefined) {
    sanitized.liveSpentTodayUsd = Math.max(0, Number(updates.liveSpentTodayUsd) || 0);
  }

  const [updated] = await db
    .update(botConfigs)
    .set({
      ...sanitized,
      updatedAt: new Date(),
    })
    .where(eq(botConfigs.id, config.id))
    .returning();

  if (updates.tradingMode && updates.tradingMode !== config.tradingMode) {
    await db.insert(executionLogs).values({
      level: "SYSTEM",
      symbol: "MODE",
      chain: "MULTI",
      message:
        updates.tradingMode === "LIVE"
          ? "🔴 LIVE MODE ENABLED — Intents now target verified on-chain contracts and require your wallet signature"
          : "🟢 PAPER MODE ENABLED — Autonomous snipes execute against the simulated vault",
      details:
        updates.tradingMode === "LIVE"
          ? `Max per trade $${updated.liveMaxTradeUsd} · Daily cap $${updated.liveDailyCapUsd} · Slippage ${updated.liveSlippagePct}%`
          : "No on-chain transactions will be requested in paper mode",
    });
  }

  if (updates.isRunning !== undefined && updates.isRunning !== config.isRunning) {
    await db.insert(executionLogs).values({
      level: "SYSTEM",
      symbol: "ENGINE",
      chain: "MULTI",
      message: updates.isRunning
        ? "Autonomous Trading Engine RESUMED — Scanning mempool & managing open positions"
        : "Autonomous Trading Engine PAUSED — Open positions held in manual custody",
      details: `Preset: ${updated.strategyPreset} | Min Viability: ${updated.minViabilityScore}/100`,
    });
  } else if (updates.strategyPreset && updates.strategyPreset !== config.strategyPreset) {
    await db.insert(executionLogs).values({
      level: "SYSTEM",
      symbol: "STRATEGY",
      chain: "MULTI",
      message: `Strategy switched to ${updates.strategyPreset} (TP: +${updated.takeProfitPct}%, SL: -${updated.stopLossPct}%, Min Score: ${updated.minViabilityScore})`,
      details: `Max Position Allocation: $${updated.maxPositionUsd}`,
    });
  }

  return getTerminalState();
}
