import {
  pgTable,
  serial,
  text,
  integer,
  doublePrecision,
  boolean,
  timestamp,
} from "drizzle-orm/pg-core";

export const botConfigs = pgTable("bot_configs", {
  id: serial("id").primaryKey(),
  isRunning: boolean("is_running").notNull().default(true),
  strategyPreset: text("strategy_preset").notNull().default("MEME_SNIPER"),
  allocatedCapital: doublePrecision("allocated_capital").notNull().default(10000),
  cashBalance: doublePrecision("cash_balance").notNull().default(7650),
  realizedPnl: doublePrecision("realized_pnl").notNull().default(1842.4),
  totalTrades: integer("total_trades").notNull().default(24),
  winningTrades: integer("winning_trades").notNull().default(19),
  maxPositionUsd: doublePrecision("max_position_usd").notNull().default(450),
  minViabilityScore: integer("min_viability_score").notNull().default(78),
  takeProfitPct: doublePrecision("take_profit_pct").notNull().default(32),
  stopLossPct: doublePrecision("stop_loss_pct").notNull().default(12),
  maxSlippagePct: doublePrecision("max_slippage_pct").notNull().default(1.5),
  minLiquidityUsd: doublePrecision("min_liquidity_usd").notNull().default(45000),
  requireLpLocked: boolean("require_lp_locked").notNull().default(true),
  autoCompound: boolean("auto_compound").notNull().default(true),
  // Live / on-chain execution settings
  tradingMode: text("trading_mode").notNull().default("PAPER"), // 'PAPER' | 'LIVE'
  liveAutoTrade: boolean("live_auto_trade").notNull().default(false),
  liveMaxTradeUsd: doublePrecision("live_max_trade_usd").notNull().default(5),
  liveSlippagePct: doublePrecision("live_slippage_pct").notNull().default(2),
  liveDailyCapUsd: doublePrecision("live_daily_cap_usd").notNull().default(50),
  liveSpentTodayUsd: doublePrecision("live_spent_today_usd").notNull().default(0),
  liveSpendDay: text("live_spend_day").notNull().default(""),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const wallets = pgTable("wallets", {
  id: serial("id").primaryKey(),
  address: text("address").notNull(),
  chain: text("chain").notNull(), // 'ETH' | 'BASE' | 'ARB' | 'SOL'
  provider: text("provider").notNull(), // 'metamask' | 'coinbase' | 'phantom' | 'solflare' | 'injected'
  label: text("label").notNull().default("Trading Vault"),
  isVerified: boolean("is_verified").notNull().default(false),
  isPrimary: boolean("is_primary").notNull().default(false),
  signature: text("signature"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const walletChallenges = pgTable("wallet_challenges", {
  id: serial("id").primaryKey(),
  address: text("address").notNull(),
  chain: text("chain").notNull(),
  nonce: text("nonce").notNull(),
  message: text("message").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  usedAt: timestamp("used_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const liveOrders = pgTable("live_orders", {
  id: serial("id").primaryKey(),
  walletAddress: text("wallet_address").notNull(),
  chain: text("chain").notNull(),
  side: text("side").notNull(), // 'BUY' | 'SELL'
  assetSymbol: text("asset_symbol").notNull(),
  assetName: text("asset_name").notNull(),
  tokenAddress: text("token_address").notNull(),
  routerAddress: text("router_address"),
  quoteAddress: text("quote_address"),
  dex: text("dex").notNull().default("Uniswap V2"),
  amountUsd: doublePrecision("amount_usd").notNull(),
  amountNative: doublePrecision("amount_native").notNull(),
  slippagePct: doublePrecision("slippage_pct").notNull().default(2),
  status: text("status").notNull().default("PENDING"), // PENDING | SUBMITTED | CONFIRMED | FAILED | CANCELLED
  source: text("source").notNull().default("BOT"), // 'BOT' | 'MANUAL'
  signedTransaction: text("signed_transaction"),
  positionId: integer("position_id"),
  txHash: text("tx_hash"),
  explorerUrl: text("explorer_url"),
  errorMessage: text("error_message"),
  viabilityScore: integer("viability_score"),
  reason: text("reason"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  submittedAt: timestamp("submitted_at"),
  confirmedAt: timestamp("confirmed_at"),
});

export const discoveredTokens = pgTable("discovered_tokens", {
  id: serial("id").primaryKey(),
  symbol: text("symbol").notNull(),
  name: text("name").notNull(),
  chain: text("chain").notNull(), // 'SOL' | 'BASE' | 'ETH' | 'ARB'
  category: text("category").notNull(), // 'MEME' | 'AI_MEME' | 'DEFI_ALPHA'
  contractAddress: text("contract_address").notNull(),
  priceUsd: doublePrecision("price_usd").notNull(),
  priceChange5m: doublePrecision("price_change_5m").notNull(),
  priceChange1h: doublePrecision("price_change_1h").notNull(),
  volume24hUsd: doublePrecision("volume_24h_usd").notNull(),
  liquidityUsd: doublePrecision("liquidity_usd").notNull(),
  marketCapUsd: doublePrecision("market_cap_usd").notNull(),
  viabilityScore: integer("viability_score").notNull(),
  liquidityScore: integer("liquidity_score").notNull(),
  momentumScore: integer("momentum_score").notNull(),
  securityScore: integer("security_score").notNull(),
  sentimentScore: integer("sentiment_score").notNull(),
  isHoneypotSafe: boolean("is_honeypot_safe").notNull().default(true),
  isLpLocked: boolean("is_lp_locked").notNull().default(true),
  isMintRenounced: boolean("is_mint_renounced").notNull().default(true),
  topHoldersPct: doublePrecision("top_holders_pct").notNull(),
  buyTaxPct: doublePrecision("buy_tax_pct").notNull().default(0),
  sellTaxPct: doublePrecision("sell_tax_pct").notNull().default(0),
  ageMinutes: integer("age_minutes").notNull(),
  sparkline: text("sparkline").notNull(), // JSON array of 7 numbers
  signalReason: text("signal_reason").notNull(),
  status: text("status").notNull().default("WATCHING"), // 'WATCHING' | 'SNIPED' | 'REJECTED' | 'COOLDOWN'
  discoveredAt: timestamp("discovered_at").notNull().defaultNow(),
});

export const positions = pgTable("positions", {
  id: serial("id").primaryKey(),
  tokenId: integer("token_id"),
  symbol: text("symbol").notNull(),
  name: text("name").notNull(),
  chain: text("chain").notNull(),
  category: text("category").notNull(),
  contractAddress: text("contract_address").notNull(),
  entryPriceUsd: doublePrecision("entry_price_usd").notNull(),
  currentPriceUsd: doublePrecision("current_price_usd").notNull(),
  quantity: doublePrecision("quantity").notNull(),
  investedUsd: doublePrecision("invested_usd").notNull(),
  currentValueUsd: doublePrecision("current_value_usd").notNull(),
  pnlUsd: doublePrecision("pnl_usd").notNull(),
  pnlPct: doublePrecision("pnl_pct").notNull(),
  takeProfitPct: doublePrecision("take_profit_pct").notNull(),
  stopLossPct: doublePrecision("stop_loss_pct").notNull(),
  viabilityAtEntry: integer("viability_at_entry").notNull(),
  status: text("status").notNull().default("OPEN"), // 'OPEN' | 'CLOSED_TP' | 'CLOSED_SL' | 'CLOSED_MANUAL'
  txHash: text("tx_hash").notNull(),
  isLive: boolean("is_live").notNull().default(false),
  walletAddress: text("wallet_address"),
  dex: text("dex"),
  openedAt: timestamp("opened_at").notNull().defaultNow(),
  closedAt: timestamp("closed_at"),
});

export const executionLogs = pgTable("execution_logs", {
  id: serial("id").primaryKey(),
  level: text("level").notNull(), // 'SCAN' | 'AUDIT' | 'BUY' | 'SELL_TP' | 'SELL_SL' | 'REJECT' | 'SYSTEM'
  symbol: text("symbol"),
  chain: text("chain"),
  message: text("message").notNull(),
  details: text("details"),
  pnlDeltaUsd: doublePrecision("pnl_delta_usd"),
  txHash: text("tx_hash"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const equitySnapshots = pgTable("equity_snapshots", {
  id: serial("id").primaryKey(),
  label: text("label").notNull(),
  totalEquityUsd: doublePrecision("total_equity_usd").notNull(),
  realizedPnlUsd: doublePrecision("realized_pnl_usd").notNull(),
  unrealizedPnlUsd: doublePrecision("unrealized_pnl_usd").notNull(),
  benchmarkUsd: doublePrecision("benchmark_usd").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type BotConfig = typeof botConfigs.$inferSelect;
export type DiscoveredToken = typeof discoveredTokens.$inferSelect;
export type Position = typeof positions.$inferSelect;
export type ExecutionLog = typeof executionLogs.$inferSelect;
export type EquitySnapshot = typeof equitySnapshots.$inferSelect;
export type WalletRecord = typeof wallets.$inferSelect;
export type LiveOrder = typeof liveOrders.$inferSelect;

export const custodySessions = pgTable("custody_sessions", {
  id: serial("id").primaryKey(),
  tokenHash: text("token_hash").notNull().unique(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const custodyWallets = pgTable("custody_wallets", {
  id: serial("id").primaryKey(),
  sessionId: integer("session_id").notNull().references(() => custodySessions.id),
  address: text("address").notNull().unique(),
  encryptedPrivateKey: text("encrypted_private_key").notNull(),
  chain: text("chain").notNull().default("BASE"),
  lastSyncedBlock: integer("last_synced_block").notNull().default(0),
  autoSignEnabled: boolean("auto_sign_enabled").notNull().default(false),
  maxTradeUsd: doublePrecision("max_trade_usd").notNull().default(5),
  dailyTradeCapUsd: doublePrecision("daily_trade_cap_usd").notNull().default(50),
  spentTodayUsd: doublePrecision("spent_today_usd").notNull().default(0),
  spendDay: text("spend_day").notNull().default(""),
  dailyWithdrawnUsd: doublePrecision("daily_withdrawn_usd").notNull().default(0),
  withdrawalDay: text("withdrawal_day").notNull().default(""),
  testBalanceCents: integer("test_balance_cents").notNull().default(0),
  ethUsd: doublePrecision("eth_usd").notNull().default(0),
  rateUpdatedAt: timestamp("rate_updated_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const custodyEntries = pgTable("custody_entries", {
  id: serial("id").primaryKey(),
  walletId: integer("wallet_id").notNull().references(() => custodyWallets.id),
  kind: text("kind").notNull(), // DEPOSIT | WITHDRAWAL | TRADE | FEE | TEST
  amountCents: integer("amount_cents").notNull(), // signed USD minor units
  balanceAfterCents: integer("balance_after_cents").notNull(),
  isTest: boolean("is_test").notNull().default(false),
  status: text("status").notNull().default("CONFIRMED"), // PENDING | CONFIRMED
  txHash: text("tx_hash"),
  reference: text("reference").notNull().unique(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const custodyWithdrawals = pgTable("custody_withdrawals", {
  id: serial("id").primaryKey(),
  walletId: integer("wallet_id").notNull().references(() => custodyWallets.id),
  destination: text("destination").notNull(),
  amountCents: integer("amount_cents").notNull(),
  feeCents: integer("fee_cents").notNull().default(50),
  ethAmount: doublePrecision("eth_amount").notNull(),
  status: text("status").notNull().default("PENDING"), // PENDING | BROADCASTING | CONFIRMED | FAILED
  txHash: text("tx_hash"),
  signedTransaction: text("signed_transaction"),
  quoteExpiresAt: timestamp("quote_expires_at").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  confirmedAt: timestamp("confirmed_at"),
});

export const custodyAllowlist = pgTable("custody_allowlist", {
  id: serial("id").primaryKey(),
  walletId: integer("wallet_id").notNull().references(() => custodyWallets.id),
  address: text("address").notNull(),
  label: text("label").notNull().default("Withdrawal destination"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type CustodyWallet = typeof custodyWallets.$inferSelect;
export type CustodyEntry = typeof custodyEntries.$inferSelect;
export type CustodyWithdrawal = typeof custodyWithdrawals.$inferSelect;
