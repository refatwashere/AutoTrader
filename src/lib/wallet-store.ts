import { db } from "@/db";
import {
  wallets,
  walletChallenges,
  liveOrders,
  positions,
  executionLogs,
  botConfigs,
  discoveredTokens,
  type WalletRecord,
  type LiveOrder,
  type BotConfig,
  type DiscoveredToken,
  type Position,
} from "@/db/schema";
import { and, desc, eq } from "drizzle-orm";
import { getCustodyWallet, finalizeCustodyTrade } from "@/lib/custody";
import { custodyWallets as custodyWalletTable } from "@/db/schema";
import { verifyMessage, isAddress } from "viem";
import bs58 from "bs58";
import nacl from "tweetnacl";
import {
  LIVE_CHAINS,
  getLiveAsset,
  getLiveChain,
  amountUsdToNative,
  explorerTxUrl,
  LIVE_ASSETS,
  type LiveChainKey,
} from "@/lib/live-universe";

export const EVM_CHAINS: LiveChainKey[] = ["BASE", "ETH", "ARB", "SOL"];

export async function listWallets(): Promise<WalletRecord[]> {
  return db.select().from(wallets).orderBy(desc(wallets.isPrimary), desc(wallets.createdAt));
}

export async function listVerifiedWallets(): Promise<WalletRecord[]> {
  const rows = await listWallets();
  return rows.filter((w) => w.isVerified);
}

export async function createWalletChallenge(address: string, chain: string) {
  if (!address || !chain) {
    throw new Error("Wallet address and chain are required");
  }
  if (!getLiveChain(chain)) {
    throw new Error("Unsupported chain");
  }

  const nonce = Array.from({ length: 16 }, () =>
    "abcdef0123456789"[Math.floor(Math.random() * 16)]
  ).join("");
  const issuedAt = new Date().toISOString();
  const message = [
    "VORTEX // ALPHA — Wallet ownership verification",
    "",
    "Signing this message links your wallet to the autonomous trading terminal.",
    "It authorizes live trade INTENTS only. No funds move without a separate transaction signature.",
    "",
    `Wallet: ${address}`,
    `Chain: ${chain}`,
    `Nonce: ${nonce}`,
    `Issued: ${issuedAt}`,
  ].join("\n");

  const [challenge] = await db
    .insert(walletChallenges)
    .values({
      address,
      chain,
      nonce,
      message,
      expiresAt: new Date(Date.now() + 1000 * 60 * 10),
    })
    .returning();

  return { challengeId: challenge.id, message: challenge.message, nonce };
}

export async function linkVerifiedWallet(input: {
  challengeId: number;
  address: string;
  chain: string;
  signature: string;
  provider: string;
  label?: string;
}) {
  const [challenge] = await db
    .select()
    .from(walletChallenges)
    .where(eq(walletChallenges.id, input.challengeId));

  if (!challenge) throw new Error("Verification challenge not found — request a new one");
  if (challenge.usedAt) throw new Error("This challenge has already been used");
  if (challenge.expiresAt.getTime() < Date.now()) throw new Error("Challenge expired");
  if (challenge.address.toLowerCase() !== input.address.toLowerCase()) {
    throw new Error("Challenge address mismatch");
  }
  if (challenge.chain !== input.chain) throw new Error("Challenge chain mismatch");

  let verified = false;
  if (input.chain === "SOL") {
    try {
      verified = nacl.sign.detached.verify(
        new TextEncoder().encode(challenge.message),
        bs58.decode(input.signature),
        bs58.decode(input.address)
      );
    } catch {
      verified = false;
    }
  } else {
    if (!isAddress(input.address)) throw new Error("Invalid EVM address");
    try {
      verified = await verifyMessage({
        address: input.address as `0x${string}`,
        message: challenge.message,
        signature: input.signature as `0x${string}`,
      });
    } catch {
      verified = false;
    }
  }

  if (!verified) {
    throw new Error("Signature verification failed — wallet ownership not proven");
  }

  await db
    .update(walletChallenges)
    .set({ usedAt: new Date() })
    .where(eq(walletChallenges.id, challenge.id));

  const existing = await db.select().from(wallets).where(eq(wallets.address, input.address));
  const isFirst = (await listWallets()).length === 0;

  if (existing.length > 0) {
    const [updated] = await db
      .update(wallets)
      .set({
        chain: input.chain,
        provider: input.provider,
        isVerified: true,
        signature: input.signature,
        label: input.label || existing[0].label,
      })
      .where(eq(wallets.id, existing[0].id))
      .returning();

    await db.insert(executionLogs).values({
      level: "WALLET",
      symbol: "WALLET",
      chain: input.chain,
      message: `Wallet ${input.address.slice(0, 6)}…${input.address.slice(
        -4
      )} re-verified via ${input.provider} signature`,
      details: "Ownership proof accepted — live intents enabled for this wallet",
    });

    return updated;
  }

  const [created] = await db
    .insert(wallets)
    .values({
      address: input.address,
      chain: input.chain,
      provider: input.provider,
      label: input.label || "Trading Vault",
      isVerified: true,
      isPrimary: isFirst,
      signature: input.signature,
    })
    .returning();

  await db.insert(executionLogs).values({
    level: "WALLET",
    symbol: "WALLET",
    chain: input.chain,
    message: `Wallet linked & verified: ${input.address.slice(0, 6)}…${input.address.slice(
      -4
    )} on ${input.chain} via ${input.provider}`,
    details:
      "ECDSA / Ed25519 ownership signature verified server-side. Non-custodial: the terminal never holds your keys.",
  });

  return created;
}

export async function removeWallet(id: number) {
  await db.delete(wallets).where(eq(wallets.id, id));
  const remaining = await listWallets();
  if (remaining.length > 0 && !remaining.some((w) => w.isPrimary)) {
    await db.update(wallets).set({ isPrimary: true }).where(eq(wallets.id, remaining[0].id));
  }
  await db.insert(executionLogs).values({
    level: "WALLET",
    symbol: "WALLET",
    chain: "MULTI",
    message: "Wallet unlinked from the autonomous terminal",
    details: "Live intents for the removed address are disabled",
  });
}

export async function setPrimaryWallet(id: number) {
  await db.update(wallets).set({ isPrimary: false });
  await db.update(wallets).set({ isPrimary: true }).where(eq(wallets.id, id));
}

export async function listLiveOrders(): Promise<LiveOrder[]> {
  return db.select().from(liveOrders).orderBy(desc(liveOrders.id)).limit(40);
}

export async function listLivePositions(): Promise<Position[]> {
  return db
    .select()
    .from(positions)
    .where(eq(positions.isLive, true))
    .orderBy(desc(positions.openedAt));
}

export async function pendingLiveOrders(): Promise<LiveOrder[]> {
  return db
    .select()
    .from(liveOrders)
    .where(eq(liveOrders.status, "PENDING"))
    .orderBy(desc(liveOrders.id));
}

async function resolveRadarScore(symbol?: string): Promise<number | null> {
  if (!symbol) return null;
  const rows = await db.select().from(discoveredTokens);
  const match = rows.find((t) => t.symbol.toUpperCase() === symbol.toUpperCase());
  return match ? match.viabilityScore : null;
}

export function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function getLiveMetrics(config: BotConfig) {
  const [openLive, allOrders, verified] = await Promise.all([
    listLivePositions(),
    listLiveOrders(),
    listVerifiedWallets(),
  ]);

  const open = openLive.filter((p) => p.status === "OPEN");
  const deployedUsd = open.reduce((sum, p) => sum + p.investedUsd, 0);
  const pending = allOrders.filter((o) => o.status === "PENDING" || o.status === "BROADCASTING").length;
  const confirmed = allOrders.filter((o) => o.status === "CONFIRMED").length;
  const spentToday =
    config.liveSpendDay === todayKey() ? config.liveSpentTodayUsd : 0;

  return {
    verifiedWallets: verified.length,
    liveOpenPositions: open.length,
    deployedUsd: Number(deployedUsd.toFixed(2)),
    pendingOrders: pending,
    confirmedOrders: confirmed,
    dailyCapRemainingUsd: Number(
      Math.max(0, config.liveDailyCapUsd - spentToday).toFixed(2)
    ),
    mode: config.tradingMode,
    autoTrade: config.liveAutoTrade,
  };
}

export async function createLiveOrder(input: {
  walletAddress?: string;
  chain?: string;
  side?: "BUY" | "SELL";
  assetSymbol: string;
  amountUsd?: number;
  slippagePct?: number;
  source?: "BOT" | "MANUAL";
  positionId?: number;
  viabilityScore?: number;
  reason?: string;
  sessionId?: number;
}) {
  const asset = getLiveAsset(input.assetSymbol);
  if (!asset) throw new Error("Asset is not part of the verified live universe");

  const chain = (input.chain as LiveChainKey) || asset.chain;
  const chainCfg = getLiveChain(chain);
  if (!chainCfg) throw new Error("Unsupported chain");

  const verified = await listVerifiedWallets();
  const vault = input.sessionId ? await getCustodyWallet(input.sessionId) : null;
  if (input.sessionId) {
    if (!vault || vault.address !== input.walletAddress) throw new Error("Built-in vault ownership verification failed");
    if (chain !== "BASE") throw new Error("Built-in vault supports BASE only");
  }
  const wallet = vault ||
    verified.find((w) => w.address === input.walletAddress) ||
    verified.find((w) => w.chain === chain) ||
    verified.find((w) => w.isPrimary) ||
    verified[0];

  if (!wallet) {
    throw new Error("Link and verify a wallet before creating live orders");
  }

  const [config] = await db.select().from(botConfigs).limit(1);
  if (!config) throw new Error("Bot configuration missing");

  // Roll the daily risk budget over at UTC midnight.
  const day = todayKey();
  let spentToday = config.liveSpentTodayUsd;
  if (config.liveSpendDay !== day) {
    spentToday = 0;
    await db
      .update(botConfigs)
      .set({ liveSpentTodayUsd: 0, liveSpendDay: day, updatedAt: new Date() })
      .where(eq(botConfigs.id, config.id));
  }

  const side = input.side ?? "BUY";
  const amountUsd =
    input.amountUsd && input.amountUsd > 0
      ? Number(input.amountUsd)
      : Math.min(config.liveMaxTradeUsd, Math.max(0, config.liveDailyCapUsd - spentToday));

  if (amountUsd <= 0) throw new Error("Order amount must be greater than zero");
  if (amountUsd > config.liveMaxTradeUsd) {
    throw new Error(
      `Order exceeds the max live trade size ($${config.liveMaxTradeUsd.toFixed(
        2
      )} per trade). Lower the order or raise the guardrail.`
    );
  }
  if (amountUsd > config.liveDailyCapUsd) {
    throw new Error(
      `Order exceeds the live daily cap ($${config.liveDailyCapUsd.toFixed(2)}). Adjust guardrails first.`
    );
  }
  const remaining = config.liveDailyCapUsd - spentToday;
  if (side === "BUY" && amountUsd > remaining) {
    throw new Error(
      `Only $${remaining.toFixed(2)} of today's live risk budget remains. Lower the order size or raise the cap.`
    );
  }

  const amountNative = amountUsdToNative(chain, amountUsd);

  const [order] = await db
    .insert(liveOrders)
    .values({
      walletAddress: wallet.address,
      chain,
      side,
      assetSymbol: asset.symbol,
      assetName: asset.name,
      tokenAddress: asset.address,
      routerAddress: asset.routerAddress,
      quoteAddress: asset.quoteAddress,
      dex: asset.dex,
      amountUsd: Number(amountUsd.toFixed(2)),
      amountNative,
      slippagePct: input.slippagePct ?? config.liveSlippagePct,
      status: "PENDING",
      source: input.source ?? "MANUAL",
      positionId: input.positionId,
      viabilityScore: input.viabilityScore ?? null,
      reason:
        input.reason ||
        `Live intent on ${asset.symbol} · ${asset.dex} · ${input.source === "BOT" ? "autonomous signal" : "manual execution"}`,
    })
    .returning();

  await db.insert(executionLogs).values({
    level: "LIVE",
    symbol: asset.symbol,
    chain,
    message: `LIVE ${side} intent created for $${asset.symbol} ($${amountUsd.toFixed(
      2
    )} ≈ ${amountNative} ${chainCfg.nativeSymbol}) — awaiting wallet signature`,
    details: `Wallet ${wallet.address.slice(0, 6)}…${wallet.address.slice(-4)} · ${
      asset.dex
    } · slippage ${input.slippagePct ?? config.liveSlippagePct}%`,
  });

  return order;
}

export async function confirmLiveOrder(orderId: number, txHash: string) {
  if (!txHash || txHash.trim().length < 20) {
    throw new Error("A valid on-chain transaction hash is required");
  }
  const [order] = await db.select().from(liveOrders).where(eq(liveOrders.id, orderId));
  if (!order) throw new Error("Live order not found");
  if (order.status === "CONFIRMED") return order;
  if (order.status === "CANCELLED") throw new Error("Order was cancelled");

  const asset = getLiveAsset(order.assetSymbol);
  const url = explorerTxUrl(order.chain, txHash.trim());

  await db
    .update(liveOrders)
    .set({
      status: "CONFIRMED",
      txHash: txHash.trim(),
      explorerUrl: url,
      confirmedAt: new Date(),
      submittedAt: order.submittedAt ?? new Date(),
      errorMessage: null,
    })
    .where(eq(liveOrders.id, order.id));

  const [config] = await db.select().from(botConfigs).limit(1);
  const [managedVault] = await db.select().from(custodyWalletTable).where(eq(custodyWalletTable.address, order.walletAddress));
  if (managedVault) await finalizeCustodyTrade(managedVault.sessionId, order.id, txHash.trim());

  if (order.side === "BUY" && asset && config) {
    const quantity = order.amountUsd / Math.max(asset.referencePriceUsd, 0.0000001);
    const [pos] = await db
      .insert(positions)
      .values({
        symbol: order.assetSymbol,
        name: order.assetName,
        chain: order.chain,
        category: "LIVE_ONCHAIN",
        contractAddress: order.tokenAddress,
        entryPriceUsd: asset.referencePriceUsd,
        currentPriceUsd: asset.referencePriceUsd,
        quantity,
        investedUsd: order.amountUsd,
        currentValueUsd: order.amountUsd,
        pnlUsd: 0,
        pnlPct: 0,
        takeProfitPct: config.takeProfitPct,
        stopLossPct: config.stopLossPct,
        viabilityAtEntry: order.viabilityScore ?? 80,
        status: "OPEN",
        txHash: txHash.trim(),
        isLive: true,
        walletAddress: order.walletAddress,
        dex: order.dex,
      })
      .returning();

    if (pos) {
      await db
        .update(liveOrders)
        .set({ positionId: pos.id })
        .where(eq(liveOrders.id, order.id));
    }

    const day = todayKey();
    const priorSpend = config.liveSpendDay === day ? config.liveSpentTodayUsd : 0;
    await db
      .update(botConfigs)
      .set({
        liveSpentTodayUsd: Number((priorSpend + order.amountUsd).toFixed(2)),
        liveSpendDay: day,
        updatedAt: new Date(),
      })
      .where(eq(botConfigs.id, config.id));
  }

  if (order.side === "SELL" && order.positionId) {
    await db
      .update(positions)
      .set({ status: "CLOSED_MANUAL", closedAt: new Date() })
      .where(eq(positions.id, order.positionId));
  }

  await db.insert(executionLogs).values({
    level: "SELL_TP",
    symbol: order.assetSymbol,
    chain: order.chain,
    message: `ON-CHAIN ${order.side} CONFIRMED on $${order.assetSymbol} ($${order.amountUsd.toFixed(
      2
    )}) — settled from your wallet`,
    details: `Non-custodial execution · ${order.dex} · wallet ${order.walletAddress.slice(
      0,
      6
    )}…${order.walletAddress.slice(-4)}`,
    txHash: txHash.trim(),
  });

  const [settled] = await db.select().from(liveOrders).where(eq(liveOrders.id, order.id));
  return settled ?? order;
}

export async function submitLiveOrder(orderId: number, txHash: string) {
  const [order] = await db.select().from(liveOrders).where(eq(liveOrders.id, orderId));
  if (!order) throw new Error("Live order not found");
  const [managedVault] = await db.select().from(custodyWalletTable).where(eq(custodyWalletTable.address, order.walletAddress));
  if (managedVault) throw new Error("Server-managed vault transactions must be signed by the vault, not an external wallet");
  await db
    .update(liveOrders)
    .set({
      status: "SUBMITTED",
      submittedAt: new Date(),
      txHash: txHash.trim(),
      explorerUrl: explorerTxUrl(order.chain, txHash.trim()),
      errorMessage: null,
    })
    .where(eq(liveOrders.id, order.id));
  return order;
}

export async function failLiveOrder(orderId: number, errorMessage: string) {
  await db
    .update(liveOrders)
    .set({
      status: "FAILED",
      errorMessage: errorMessage.slice(0, 400),
    })
    .where(eq(liveOrders.id, orderId));

  const [order] = await db.select().from(liveOrders).where(eq(liveOrders.id, orderId));
  if (order) {
    await db.insert(executionLogs).values({
      level: "REJECT",
      symbol: order.assetSymbol,
      chain: order.chain,
      message: `Live ${order.side} failed on $${order.assetSymbol}: ${errorMessage.slice(0, 140)}`,
      details: "No funds moved. The intent is closed and the risk budget restored.",
    });
  }
}

export async function cancelLiveOrder(orderId: number) {
  const [order] = await db.select().from(liveOrders).where(eq(liveOrders.id, orderId));
  if (!order) throw new Error("Live order not found");
  if (order.status === "CONFIRMED") throw new Error("Settled orders cannot be cancelled");

  await db
    .update(liveOrders)
    .set({ status: "CANCELLED" })
    .where(eq(liveOrders.id, orderId));

  await db.insert(executionLogs).values({
    level: "LIVE",
    symbol: order.assetSymbol,
    chain: order.chain,
    message: `Live ${order.side} intent cancelled for $${order.assetSymbol}`,
    details: "No signature was broadcast — zero funds moved",
  });
}

/**
 * Autonomous live intent generation. Only ever targets the curated, real-contract
 * universe and never exceeds the user's live risk budget.
 */
export async function maybeCreateBotLiveOrder(
  config: BotConfig,
  tokens: DiscoveredToken[],
  sessionId?: number | null
): Promise<LiveOrder | null> {
  if (config.tradingMode !== "LIVE" || !config.liveAutoTrade) return null;
  if (sessionId) {
    const vault = await getCustodyWallet(sessionId);
    if (!vault?.autoSignEnabled) return null;
    const pending = await pendingLiveOrders();
    if (pending.length > 0) return null;
    const remaining = config.liveDailyCapUsd - (vault.spendDay === new Date().toISOString().slice(0, 10) ? vault.spentTodayUsd : 0);
    const candidate = LIVE_ASSETS.find((a) => a.chain === "BASE" && a.radarSymbol && (tokens.find((t) => t.symbol === a.radarSymbol)?.viabilityScore || 0) >= config.minViabilityScore);
    if (!candidate || remaining <= 0) return null;
    const amountUsd = Math.min(config.liveMaxTradeUsd, vault.maxTradeUsd, remaining);
    const order = await createLiveOrder({ walletAddress: vault.address, sessionId, chain: "BASE", assetSymbol: candidate.symbol, amountUsd, source: "BOT", viabilityScore: tokens.find((t) => t.symbol === candidate.radarSymbol)?.viabilityScore, reason: "Scoped vault auto-signing signal — approved BASE DEX route only" });
    const { executeCustodyTrade } = await import("@/lib/custody");
    try { await executeCustodyTrade(sessionId, order.id); }
    catch (err) { console.error("Vault signing deferred:", err instanceof Error ? err.message : "Signing unavailable"); }
    return order;
  }

  const verifiedWallets = await listVerifiedWallets();
  if (verifiedWallets.length === 0) return null;

  const pending = await pendingLiveOrders();
  if (pending.length > 0) return null; // one live intent at a time — always human-signed

  const spentToday = config.liveSpendDay === todayKey() ? config.liveSpentTodayUsd : 0;
  const remainingBudget = config.liveDailyCapUsd - spentToday;
  if (remainingBudget <= 0) return null;

  const eligibleChains = new Set(verifiedWallets.map((w) => w.chain));
  const candidates: { symbol: string; score: number; chain: LiveChainKey }[] = [];

  for (const asset of LIVE_ASSETS) {
    if (!eligibleChains.has(asset.chain)) continue;
    const radar = asset.radarSymbol
      ? tokens.find((t) => t.symbol.toUpperCase() === asset.radarSymbol?.toUpperCase())
      : undefined;
    const score = radar ? radar.viabilityScore : 74;
    if (score < config.minViabilityScore) continue;
    candidates.push({ symbol: asset.symbol, score, chain: asset.chain });
  }

  if (candidates.length === 0) return null;
  candidates.sort((a, b) => b.score - a.score);
  const pick = candidates[0];

  const wallet =
    verifiedWallets.find((w) => w.chain === pick.chain) ||
    verifiedWallets.find((w) => w.isPrimary) ||
    verifiedWallets[0];

  const amountUsd = Math.min(config.liveMaxTradeUsd, remainingBudget);

  try {
    const order = await createLiveOrder({
      walletAddress: wallet.address,
      chain: pick.chain,
      side: "BUY",
      assetSymbol: pick.symbol,
      amountUsd,
      source: "BOT",
      viabilityScore: pick.score,
      reason: `Autonomous live signal: ${pick.symbol} scored ${pick.score}/100 on the verified universe. Requires your signature — funds stay non-custodial.`,
    });
    return order;
  } catch {
    return null;
  }
}

export async function createLiveExitIntent(positionId: number, amountUsd?: number) {
  const [pos] = await db.select().from(positions).where(eq(positions.id, positionId));
  if (!pos || !pos.isLive || pos.status !== "OPEN") {
    throw new Error("Open on-chain position not found");
  }
  return createLiveOrder({
    walletAddress: pos.walletAddress || undefined,
    chain: pos.chain,
    side: "SELL",
    assetSymbol: pos.symbol,
    amountUsd: amountUsd ?? pos.investedUsd,
    source: "MANUAL",
    positionId: pos.id,
    reason: `Exit intent for on-chain position ${pos.symbol} — sign the swap in your wallet to settle.`,
  });
}

export async function recordLiveFillFromSignature(orderId: number, signature: string) {
  return confirmLiveOrder(orderId, signature);
}

export async function closeLivePositionBook(positionId: number) {
  const [pos] = await db.select().from(positions).where(eq(positions.id, positionId));
  if (!pos || !pos.isLive) throw new Error("On-chain position not found");
  await db
    .update(positions)
    .set({ status: "CLOSED_MANUAL", closedAt: new Date() })
    .where(and(eq(positions.id, positionId), eq(positions.isLive, true)));

  await db.insert(executionLogs).values({
    level: "LIVE",
    symbol: pos.symbol,
    chain: pos.chain,
    message: `On-chain position $${pos.symbol} archived from the live ledger`,
    details: "Bookkeeping only — verify your wallet balance in your wallet / explorer",
  });
}

export async function hasVerifiedWalletOnChain(chain: string): Promise<boolean> {
  const verified = await listVerifiedWallets();
  return verified.some((w) => w.chain === chain);
}

export function liveChainLabel(chain: string): string {
  return LIVE_CHAINS[chain as LiveChainKey]?.name ?? chain;
}
