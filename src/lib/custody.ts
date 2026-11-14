import { cookies } from "next/headers";
import { createHash, randomBytes, randomUUID, createCipheriv, createDecipheriv } from "node:crypto";
import { db } from "@/db";
import {
  custodySessions, custodyWallets, custodyEntries, custodyWithdrawals,
  custodyAllowlist, liveOrders, executionLogs,
  type CustodyWallet,
} from "@/db/schema";
import { and, desc, eq } from "drizzle-orm";
import {
  createPublicClient, http, isAddress, parseEther, formatEther,
  encodeFunctionData,
  parseGwei, type Address,
} from "viem";
import { privateKeyToAccount, generatePrivateKey } from "viem/accounts";
import { getLiveAsset, UNISWAP_V2_ROUTER_ABI } from "@/lib/live-universe";

const COOKIE_NAME = "vortex_vault_session";
const FEE_CENTS = 50;
const GAS_BUFFER = parseEther("0.00002");

function encryptionKey(): Buffer {
  const hex = process.env.CUSTODY_ENCRYPTION_KEY;
  if (!hex || !/^[a-fA-F0-9]{64}$/.test(hex)) {
    throw new Error("Server custody encryption key is not configured");
  }
  return Buffer.from(hex, "hex");
}

function encrypt(value: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return `${iv.toString("hex")}:${cipher.getAuthTag().toString("hex")}:${encrypted.toString("hex")}`;
}

function decrypt(value: string): string {
  const [ivHex, tagHex, dataHex] = value.split(":");
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(ivHex, "hex"));
  decipher.setAuthTag(Buffer.from(tagHex, "hex"));
  return Buffer.concat([
    decipher.update(Buffer.from(dataHex, "hex")), decipher.final(),
  ]).toString("utf8");
}

function baseClient() {
  return createPublicClient({
    chain: { id: 8453, name: "Base", nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 }, rpcUrls: { default: { http: ["https://mainnet.base.org"] } } },
    transport: http(process.env.BASE_RPC_URL || "https://mainnet.base.org", { timeout: 12000, retryCount: 1 }),
  });
}

function today(): string { return new Date().toISOString().slice(0, 10); }
function accountFor(wallet: CustodyWallet) {
  return privateKeyToAccount(decrypt(wallet.encryptedPrivateKey) as `0x${string}`);
}

export async function getCustodySession(create = true): Promise<number | null> {
  const jar = await cookies();
  const token = jar.get(COOKIE_NAME)?.value;
  if (token && /^[a-f0-9]{64}$/.test(token)) {
    const hash = createHash("sha256").update(token).digest("hex");
    const [session] = await db.select().from(custodySessions).where(eq(custodySessions.tokenHash, hash));
    if (session) return session.id;
  }
  if (!create) return null;
  const newToken = randomBytes(32).toString("hex");
  const [session] = await db.insert(custodySessions).values({
    tokenHash: createHash("sha256").update(newToken).digest("hex"),
  }).returning();
  jar.set(COOKIE_NAME, newToken, {
    httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "strict",
    path: "/", maxAge: 60 * 60 * 24 * 30,
  });
  return session.id;
}

export async function getCustodyWallet(sessionId: number): Promise<CustodyWallet | null> {
  const [wallet] = await db.select().from(custodyWallets).where(eq(custodyWallets.sessionId, sessionId));
  return wallet ?? null;
}

export async function getOrCreateCustodyWallet(sessionId: number): Promise<CustodyWallet> {
  const existing = await getCustodyWallet(sessionId);
  if (existing) return existing;
  return db.transaction(async (tx) => {
    const [session] = await tx.select().from(custodySessions).where(eq(custodySessions.id, sessionId)).for("update");
    if (!session) throw new Error("Vault session not found");
    const [prior] = await tx.select().from(custodyWallets).where(eq(custodyWallets.sessionId, sessionId));
    if (prior) return prior;
    const generatedKey = generatePrivateKey();
    const account = privateKeyToAccount(generatedKey);
    const client = baseClient();
    const block = await client.getBlockNumber();
    const [wallet] = await tx.insert(custodyWallets).values({
      sessionId, address: account.address, encryptedPrivateKey: encrypt(generatedKey),
      lastSyncedBlock: Math.max(0, Number(block) - 12),
    }).returning();
    await tx.insert(executionLogs).values({
      level: "WALLET", symbol: "VAULT", chain: "BASE",
      message: "Built-in Base vault created — server-encrypted signing key generated",
      details: "AES-256-GCM encryption. The private key is never returned to the browser. Native ETH deposits only.",
    });
    return wallet;
  });
}

async function ethPrice(wallet: CustodyWallet): Promise<number> {
  if (wallet.ethUsd > 0 && wallet.rateUpdatedAt && Date.now() - wallet.rateUpdatedAt.getTime() < 60000) {
    return wallet.ethUsd;
  }
  const res = await fetch("https://api.coinbase.com/v2/prices/ETH-USD/spot", {
    cache: "no-store", signal: AbortSignal.timeout(6000),
  });
  if (!res.ok) throw new Error("ETH price feed unavailable — please retry before quoting");
  const data = await res.json();
  const rate = Number(data?.data?.amount);
  if (!Number.isFinite(rate) || rate <= 0) throw new Error("Invalid ETH price quote");
  await db.update(custodyWallets).set({ ethUsd: rate, rateUpdatedAt: new Date() }).where(eq(custodyWallets.id, wallet.id));
  return rate;
}

async function ledgerBalance(walletId: number) {
  const entries = await db.select().from(custodyEntries).where(eq(custodyEntries.walletId, walletId));
  const confirmed = entries.filter((e) => e.status === "CONFIRMED").reduce((s, e) => s + e.amountCents, 0);
  const pending = entries.filter((e) => e.status === "PENDING").reduce((s, e) => s + e.amountCents, 0);
  const test = entries.filter((e) => e.isTest && e.status === "CONFIRMED").reduce((s, e) => s + e.amountCents, 0);
  const realAvailable = entries.filter((e) => !e.isTest).reduce((s, e) => s + (e.status === "CONFIRMED" ? e.amountCents : e.status === "PENDING" ? e.amountCents : 0), 0);
  return { confirmed, available: confirmed + pending, realAvailable, pending: -pending, test };
}

export async function getCustodyState(sessionId: number | null) {
  if (!sessionId) return null;
  const wallet = await getCustodyWallet(sessionId);
  if (!wallet) return null;
  const [entries, withdrawals, allowlist, balances, client] = await Promise.all([
    db.select().from(custodyEntries).where(eq(custodyEntries.walletId, wallet.id)).orderBy(desc(custodyEntries.id)).limit(30),
    db.select().from(custodyWithdrawals).where(eq(custodyWithdrawals.walletId, wallet.id)).orderBy(desc(custodyWithdrawals.id)).limit(15),
    db.select().from(custodyAllowlist).where(eq(custodyAllowlist.walletId, wallet.id)),
    ledgerBalance(wallet.id), Promise.resolve(baseClient()),
  ]);
  let nativeBalanceWei = 0n;
  let rate = wallet.ethUsd;
  try {
    [nativeBalanceWei, rate] = await Promise.all([
      client.getBalance({ address: wallet.address as Address }),
      ethPrice(wallet),
    ]);
  } catch { /* Keep last known values when a public RPC is temporarily unavailable. */ }
  return {
    wallet: {
      id: wallet.id, address: wallet.address, chain: "BASE", createdAt: wallet.createdAt,
      autoSignEnabled: wallet.autoSignEnabled, maxTradeUsd: wallet.maxTradeUsd,
      dailyTradeCapUsd: wallet.dailyTradeCapUsd, spentTodayUsd: wallet.spendDay === today() ? wallet.spentTodayUsd : 0,
      dailyWithdrawnUsd: wallet.withdrawalDay === today() ? wallet.dailyWithdrawnUsd : 0,
      lastSyncedBlock: wallet.lastSyncedBlock,
    },
    balanceCents: balances.confirmed, availableCents: balances.available,
    withdrawableCents: balances.realAvailable, pendingCents: balances.pending,
    testBalanceCents: balances.test,
    nativeBalance: formatEther(nativeBalanceWei), ethUsd: rate,
    rateUpdatedAt: wallet.rateUpdatedAt,
    entries, withdrawals, allowlist,
  };
}

export type CustodyState = NonNullable<Awaited<ReturnType<typeof getCustodyState>>>;

export async function syncCustodyDeposits(sessionId: number) {
  const wallet = await getCustodyWallet(sessionId);
  if (!wallet) return getCustodyState(sessionId);
  const client = baseClient();
  const latest = Number(await client.getBlockNumber());
  const confirmedHead = Math.max(wallet.lastSyncedBlock, latest - 12);
  const rate = await ethPrice(wallet);
  const scanHead = Math.min(confirmedHead, wallet.lastSyncedBlock + 100);
  for (let blockNumber = wallet.lastSyncedBlock + 1; blockNumber <= scanHead; blockNumber++) {
    const block = await client.getBlock({ blockNumber: BigInt(blockNumber), includeTransactions: true });
    for (const chainTx of block.transactions) {
      if (typeof chainTx !== "object" || chainTx.to?.toLowerCase() !== wallet.address.toLowerCase() || chainTx.value === BigInt(0)) continue;
      const receipt = await client.getTransactionReceipt({ hash: chainTx.hash });
      if (receipt.status !== "success") continue;
      await db.transaction(async (tx) => {
        await tx.select().from(custodyWallets).where(eq(custodyWallets.id, wallet.id)).for("update");
        const amountCents = Math.round(Number(formatEther(chainTx.value)) * rate * 100);
        const balance = await ledgerBalance(wallet.id);
        const inserted = await tx.insert(custodyEntries).values({
          walletId: wallet.id, kind: "DEPOSIT", amountCents,
          balanceAfterCents: balance.confirmed + amountCents,
          txHash: chainTx.hash, reference: `deposit:${chainTx.hash}`,
        }).onConflictDoNothing().returning();
        if (inserted.length) {
          await tx.insert(executionLogs).values({
            level: "WALLET", symbol: "DEPOSIT", chain: "BASE",
            message: `Base deposit credited: +$${(amountCents / 100).toFixed(2)} to the built-in vault`,
            details: "12+ block confirmations. Native ETH only. Duplicate deposit hashes are rejected.",
            txHash: chainTx.hash,
          });
        }
      });
    }
  }
  await db.update(custodyWallets).set({ lastSyncedBlock: scanHead }).where(eq(custodyWallets.id, wallet.id));
  return getCustodyState(sessionId);
}

const lastScanAttempt = new Map<number, number>();

export async function maybeSyncCustodyDeposits(sessionId: number) {
  const wallet = await getCustodyWallet(sessionId);
  if (!wallet) return null;
  const now = Date.now();
  if (now - (lastScanAttempt.get(sessionId) || 0) < 30000) return getCustodyState(sessionId);
  lastScanAttempt.set(sessionId, now);
  try { return await syncCustodyDeposits(sessionId); }
  catch (err) { console.error("Custody deposit scan:", err instanceof Error ? err.message : "RPC unavailable"); return getCustodyState(sessionId); }
}

export async function addCustodyAddress(sessionId: number, address: string, label?: string) {
  if (!isAddress(address)) throw new Error("Enter a valid Base / EVM address");
  const wallet = await getCustodyWallet(sessionId);
  if (!wallet) throw new Error("Create your built-in vault first");
  await db.insert(custodyAllowlist).values({ walletId: wallet.id, address, label: label?.slice(0, 60) || "Withdrawal destination" }).onConflictDoNothing();
  return getCustodyState(sessionId);
}

export async function addTestFunds(sessionId: number, amountUsd = 1000) {
  const amount = Math.round(amountUsd * 100);
  if (amount < 100 || amount > 100000) throw new Error("Test funding must be between $1 and $1,000");
  const wallet = await getCustodyWallet(sessionId);
  if (!wallet) throw new Error("Create your built-in vault first");
  await db.transaction(async (tx) => {
    const [locked] = await tx.select().from(custodyWallets).where(eq(custodyWallets.id, wallet.id)).for("update");
    const balance = await ledgerBalance(wallet.id);
    await tx.insert(custodyEntries).values({
      walletId: wallet.id, kind: "TEST", amountCents: amount,
      balanceAfterCents: balance.confirmed + amount, isTest: true,
      reference: `test:${randomUUID()}`,
    });
    await tx.update(custodyWallets).set({ testBalanceCents: locked.testBalanceCents + amount }).where(eq(custodyWallets.id, wallet.id));
  });
  return getCustodyState(sessionId);
}

export async function testWithdrawal(sessionId: number, amountUsd: number, destination: string) {
  if (!isAddress(destination)) throw new Error("Invalid test destination address");
  const amount = Math.round(amountUsd * 100);
  if (amount < 100) throw new Error("Minimum test withdrawal is $1");
  const wallet = await getCustodyWallet(sessionId);
  if (!wallet) throw new Error("Create your vault first");
  await db.transaction(async (tx) => {
    await tx.select().from(custodyWallets).where(eq(custodyWallets.id, wallet.id)).for("update");
    const balance = await ledgerBalance(wallet.id);
    if (balance.test < amount) throw new Error("Insufficient test balance");
    await tx.insert(custodyEntries).values({
      walletId: wallet.id, kind: "TEST", amountCents: -amount,
      balanceAfterCents: balance.confirmed - amount, isTest: true,
      txHash: `TEST-${randomUUID()}`, reference: `test-withdraw:${randomUUID()}`,
    });
    await tx.update(custodyWallets).set({ testBalanceCents: balance.test - amount }).where(eq(custodyWallets.id, wallet.id));
  });
  return getCustodyState(sessionId);
}

export async function createWithdrawal(sessionId: number, amountUsd: number, destination: string) {
  if (!isAddress(destination)) throw new Error("Enter a valid destination address");
  const amount = Math.round(amountUsd * 100);
  if (amount < 100) throw new Error("Minimum withdrawal is $1");
  const wallet = await getCustodyWallet(sessionId);
  if (!wallet) throw new Error("Create your vault first");
  const [allowed] = await db.select().from(custodyAllowlist).where(and(eq(custodyAllowlist.walletId, wallet.id), eq(custodyAllowlist.address, destination)));
  if (!allowed) throw new Error("Add this destination to your withdrawal allowlist first");
  const rate = await ethPrice(wallet);
  const ethAmount = Number((amount / 100 / rate).toFixed(6));
  const client = baseClient();
  const native = await client.getBalance({ address: wallet.address as Address });
  if (native < parseEther(String(ethAmount)) + GAS_BUFFER) throw new Error("Vault has insufficient ETH for this withdrawal plus network fees");
  await db.transaction(async (tx) => {
    const [locked] = await tx.select().from(custodyWallets).where(eq(custodyWallets.id, wallet.id)).for("update");
    const balance = await ledgerBalance(wallet.id);
    const spent = locked.withdrawalDay === today() ? locked.dailyWithdrawnUsd : 0;
    if (amount + FEE_CENTS > balance.realAvailable) throw new Error("Insufficient withdrawable ledger balance (test funds excluded)");
    if (spent + amount / 100 > 100) throw new Error("Withdrawal daily cap is $100");
    const [withdrawal] = await tx.insert(custodyWithdrawals).values({
      walletId: wallet.id, destination, amountCents: amount, feeCents: FEE_CENTS,
      ethAmount, quoteExpiresAt: new Date(Date.now() + 60000),
    }).returning();
    await tx.insert(custodyEntries).values({
      walletId: wallet.id, kind: "WITHDRAWAL", amountCents: -(amount + FEE_CENTS),
      balanceAfterCents: balance.available - amount - FEE_CENTS, status: "PENDING",
      reference: `withdraw:${withdrawal.id}:reserve`,
    });
  });
  return getCustodyState(sessionId);
}

export async function confirmWithdrawal(sessionId: number, withdrawalId: number, confirmation: string): Promise<{ state: CustodyState; error?: string }> {
  if (confirmation !== "WITHDRAW") throw new Error("Type WITHDRAW to authorize this transfer");
  const wallet = await getCustodyWallet(sessionId);
  if (!wallet) throw new Error("Vault not found");
  const client = baseClient();
  const account = accountFor(wallet);
  let raw: string | null = null;
  let hash: string | null = null;
  await db.transaction(async (tx) => {
    const [locked] = await tx.select().from(custodyWallets).where(eq(custodyWallets.id, wallet.id)).for("update");
    const [withdrawal] = await tx.select().from(custodyWithdrawals).where(and(eq(custodyWithdrawals.id, withdrawalId), eq(custodyWithdrawals.walletId, wallet.id))).for("update");
    if (!withdrawal) throw new Error("Withdrawal not found");
    if (withdrawal.status === "CONFIRMED") return;
    if (withdrawal.status === "BROADCASTING" && withdrawal.signedTransaction) {
      raw = withdrawal.signedTransaction;
      hash = withdrawal.txHash;
      return;
    }
    if (withdrawal.status !== "PENDING" || withdrawal.quoteExpiresAt.getTime() < Date.now()) {
      throw new Error("Withdrawal quote expired or is no longer pending — create a new quote");
    }
    const balance = await ledgerBalance(wallet.id);
    if (withdrawal.amountCents + withdrawal.feeCents > balance.available) throw new Error("Vault balance changed — create a new withdrawal");
    const value = parseEther(String(withdrawal.ethAmount));
    const native = await client.getBalance({ address: wallet.address as Address });
    if (native < value + GAS_BUFFER) throw new Error("Insufficient native ETH for withdrawal");
    const [gasPrice, nonce] = await Promise.all([
      client.getGasPrice(), client.getTransactionCount({ address: wallet.address as Address, blockTag: "pending" }),
    ]);
    const signed = await account.signTransaction({
      chainId: 8453, to: withdrawal.destination as Address, value, nonce,
      gas: BigInt(21000), maxFeePerGas: gasPrice * 2n, maxPriorityFeePerGas: parseGwei("0.001"),
      type: "eip1559",
    });
    raw = signed;
    await tx.update(custodyWithdrawals).set({ status: "BROADCASTING", signedTransaction: signed }).where(eq(custodyWithdrawals.id, withdrawal.id));
  });
  if (!raw) return { state: (await getCustodyState(sessionId))! };
  try {
    hash = await client.sendRawTransaction({ serializedTransaction: raw as `0x${string}` });
    const receipt = await client.waitForTransactionReceipt({ hash: hash as `0x${string}`, timeout: 45000, pollingInterval: 2000 });
    if (receipt.status !== "success") {
      await finalizeRevertedWithdrawal(withdrawalId, hash as string, receipt.gasUsed * receipt.effectiveGasPrice, wallet.ethUsd);
      return { state: (await getCustodyState(sessionId))!, error: "Withdrawal reverted on-chain. Only network gas was spent; principal was returned to the ledger." };
    }
    await finalizeWithdrawal(withdrawalId, hash as string, receipt.gasUsed * receipt.effectiveGasPrice, wallet.ethUsd);
  } catch (err) {
    // A timeout is NOT proof of failure. Persist the signed transaction so retry is idempotent.
    if (hash) {
      await db.update(custodyWithdrawals).set({ txHash: hash }).where(eq(custodyWithdrawals.id, withdrawalId));
    }
    return { state: (await getCustodyState(sessionId))!, error: err instanceof Error ? err.message : "Broadcast unconfirmed — retry to reconcile the same transaction" };
  }
  return { state: (await getCustodyState(sessionId))! };
}

async function finalizeWithdrawal(id: number, hash: string, gasWei: bigint, rate: number) {
  await db.transaction(async (tx) => {
    const [withdrawal] = await tx.select().from(custodyWithdrawals).where(eq(custodyWithdrawals.id, id)).for("update");
    if (!withdrawal || withdrawal.status === "CONFIRMED") return;
    const [wallet] = await tx.select().from(custodyWallets).where(eq(custodyWallets.id, withdrawal.walletId)).for("update");
    const [freshWallet] = await tx.select().from(custodyWallets).where(eq(custodyWallets.id, withdrawal.walletId));
    const actualRate = rate || freshWallet.ethUsd;
    const actualFee = withdrawal.feeCents + Math.ceil(Number(gasWei) / 1e18 * actualRate * 100);
    const delta = withdrawal.amountCents + actualFee;
    const balance = await ledgerBalance(wallet.id);
    await tx.update(custodyWithdrawals).set({ status: "CONFIRMED", txHash: hash, confirmedAt: new Date() }).where(eq(custodyWithdrawals.id, id));
    await tx.update(custodyEntries).set({ status: "CONFIRMED", txHash: hash, amountCents: -delta, balanceAfterCents: balance.available - delta }).where(eq(custodyEntries.reference, `withdraw:${id}:reserve`));
    await tx.update(custodyWallets).set({
      dailyWithdrawnUsd: (wallet.withdrawalDay === today() ? wallet.dailyWithdrawnUsd : 0) + withdrawal.amountCents / 100,
      withdrawalDay: today(),
    }).where(eq(custodyWallets.id, wallet.id));
  });
}

export async function configureCustody(sessionId: number, updates: { autoSignEnabled?: boolean; maxTradeUsd?: number; dailyTradeCapUsd?: number; slippagePct?: number; acknowledged?: boolean }) {
  const wallet = await getCustodyWallet(sessionId);
  if (!wallet) throw new Error("Create your vault first");
  if (updates.autoSignEnabled && !updates.acknowledged) throw new Error("Acknowledge the scoped auto-signing permissions first");
  await db.update(custodyWallets).set({
    autoSignEnabled: updates.autoSignEnabled ?? wallet.autoSignEnabled,
    maxTradeUsd: Math.min(100, Math.max(1, Number(updates.maxTradeUsd ?? wallet.maxTradeUsd))),
    dailyTradeCapUsd: Math.min(500, Math.max(5, Number(updates.dailyTradeCapUsd ?? wallet.dailyTradeCapUsd))),
  }).where(eq(custodyWallets.id, wallet.id));
  await db.insert(executionLogs).values({
    level: "WALLET", symbol: "AUTO_SIGN", chain: "BASE",
    message: `Built-in vault auto-signing ${updates.autoSignEnabled ? "ENABLED" : "disabled"} — scoped DEX buys only`,
    details: "Never signs arbitrary payloads, token approvals, or withdrawals. Withdrawals always require explicit confirmation.",
  });
  return getCustodyState(sessionId);
}

async function finalizeRevertedWithdrawal(id: number, hash: string, gasWei: bigint, rate: number) {
  await db.transaction(async (tx) => {
    const [withdrawal] = await tx.select().from(custodyWithdrawals).where(eq(custodyWithdrawals.id, id)).for("update");
    if (!withdrawal || withdrawal.status === "CONFIRMED") return;
    const [wallet] = await tx.select().from(custodyWallets).where(eq(custodyWallets.id, withdrawal.walletId)).for("update");
    const actualRate = rate || wallet.ethUsd;
    const fee = withdrawal.feeCents + Math.ceil(Number(gasWei) / 1e18 * actualRate * 100);
    const balance = await ledgerBalance(wallet.id);
    await tx.update(custodyWithdrawals).set({ status: "FAILED", txHash: hash, confirmedAt: new Date() }).where(eq(custodyWithdrawals.id, id));
    await tx.update(custodyEntries).set({ status: "CONFIRMED", amountCents: -fee, balanceAfterCents: balance.realAvailable - fee, txHash: hash }).where(eq(custodyEntries.reference, `withdraw:${id}:reserve`));
  });
}

export async function executeCustodyTrade(sessionId: number, orderId: number) {
  const wallet = await getCustodyWallet(sessionId);
  if (!wallet) throw new Error("Built-in vault not found");
  const [order] = await db.select().from(liveOrders).where(eq(liveOrders.id, orderId));
  if (!order || order.walletAddress !== wallet.address) throw new Error("Order does not belong to this vault");
  if (order.status === "CONFIRMED") return { state: await getCustodyState(sessionId), txHash: order.txHash || "" };
  if (!wallet.autoSignEnabled) throw new Error("Enable scoped vault auto-signing before authorizing server-side swaps");
  if (order.status !== "PENDING" && order.status !== "BROADCASTING") throw new Error("Order is no longer pending");
  if (order.status === "BROADCASTING" && order.signedTransaction) {
    const client = baseClient();
    const hash = await client.sendRawTransaction({ serializedTransaction: order.signedTransaction as `0x${string}` });
    await db.update(liveOrders).set({ txHash: hash }).where(eq(liveOrders.id, orderId));
    const receipt = await client.waitForTransactionReceipt({ hash, timeout: 45000, pollingInterval: 2000 });
    if (receipt.status === "success") {
      const { confirmLiveOrder } = await import("@/lib/wallet-store");
      await confirmLiveOrder(orderId, hash);
      await finalizeCustodyTrade(sessionId, orderId, hash);
    } else {
      await finalizeRevertedCustodyOrder(sessionId, orderId, hash, receipt.gasUsed * receipt.effectiveGasPrice, wallet.ethUsd);
    }
    return { state: await getCustodyState(sessionId), txHash: hash };
  }
  if (order.side !== "BUY" || order.chain !== "BASE") throw new Error("Vault signing only supports BASE DEX buys");
  const asset = getLiveAsset(order.assetSymbol);
  if (!asset || asset.chain !== "BASE" || !asset.routerAddress || !asset.quoteAddress) throw new Error("Asset / router is not in the approved live universe");
  if (order.routerAddress !== asset.routerAddress || order.tokenAddress !== asset.address) throw new Error("Unapproved swap route");
  if (order.amountUsd > wallet.maxTradeUsd) throw new Error("Order exceeds the vault per-trade limit");
  const spent = wallet.spendDay === today() ? wallet.spentTodayUsd : 0;
  if (spent + order.amountUsd > wallet.dailyTradeCapUsd) throw new Error("Vault daily signing cap reached");
  const balance = await ledgerBalance(wallet.id);
  if (balance.realAvailable < Math.round(order.amountUsd * 100)) throw new Error("Insufficient real vault balance — test USD cannot fund on-chain trades");
  const client = baseClient();
  const account = accountFor(wallet);
  const rate = await ethPrice(wallet);
  const value = parseEther((order.amountUsd / rate).toFixed(6));
  const native = await client.getBalance({ address: wallet.address as Address });
  if (native < value + GAS_BUFFER) throw new Error("Vault needs native ETH for this swap plus gas");
  const path = [asset.quoteAddress as Address, asset.address as Address];
  const amounts = await client.readContract({ address: asset.routerAddress as Address, abi: UNISWAP_V2_ROUTER_ABI, functionName: "getAmountsOut", args: [value, path] });
  const expected = amounts[amounts.length - 1];
  const slippage = Math.max(1, Math.round(order.slippagePct * 100));
  const minOut = expected - expected * BigInt(slippage) / BigInt(10000);
  const data = encodeFunctionData({ abi: UNISWAP_V2_ROUTER_ABI, functionName: "swapExactETHForTokens", args: [minOut, path, account.address, BigInt(Math.floor(Date.now() / 1000) + 600)] });
  const gas = await client.estimateGas({ account, to: asset.routerAddress as Address, value, data });
  const gasPrice = await client.getGasPrice();
  const nonce = await client.getTransactionCount({ address: account.address, blockTag: "pending" });
  const signed = await account.signTransaction({ chainId: 8453, to: asset.routerAddress as Address, value, data, nonce, gas, maxFeePerGas: gasPrice * BigInt(2), maxPriorityFeePerGas: parseGwei("0.001"), type: "eip1559" });
  let broadcastAttempted = false;
  await db.transaction(async (tx) => {
    const [locked] = await tx.select().from(custodyWallets).where(eq(custodyWallets.id, wallet.id)).for("update");
    const [lockedOrder] = await tx.select().from(liveOrders).where(eq(liveOrders.id, orderId)).for("update");
    if (lockedOrder.status !== "PENDING" && lockedOrder.status !== "BROADCASTING") throw new Error("Order is already being processed");
    if (lockedOrder.signedTransaction) throw new Error("Signed transaction already exists — retry to reconcile it");
    const current = await ledgerBalance(wallet.id);
    const dailyUsd = locked.spendDay === today() ? locked.spentTodayUsd : 0;
    if (current.realAvailable < Math.round(order.amountUsd * 100) || dailyUsd + order.amountUsd > locked.dailyTradeCapUsd) throw new Error("Vault balance / daily cap changed");
    await tx.insert(custodyEntries).values({ walletId: wallet.id, kind: "TRADE", amountCents: -Math.round(order.amountUsd * 100), balanceAfterCents: current.realAvailable - Math.round(order.amountUsd * 100), status: "PENDING", reference: `order:${orderId}:reserve` }).onConflictDoNothing();
    await tx.update(liveOrders).set({ status: "BROADCASTING", signedTransaction: signed }).where(eq(liveOrders.id, orderId));
  });
  try {
    broadcastAttempted = true;
    const hash = await client.sendRawTransaction({ serializedTransaction: signed as `0x${string}` });
    await db.update(liveOrders).set({ txHash: hash }).where(eq(liveOrders.id, orderId));
    const receipt = await client.waitForTransactionReceipt({ hash, timeout: 45000, pollingInterval: 2000 });
    if (receipt.status !== "success") throw new Error("On-chain swap reverted — retry to reconcile the receipt");
    const { confirmLiveOrder } = await import("@/lib/wallet-store");
    await confirmLiveOrder(orderId, hash);
    await finalizeCustodyTrade(sessionId, orderId, hash);
    return { state: await getCustodyState(sessionId), txHash: hash };
  } catch (err) {
    if (broadcastAttempted) await db.update(liveOrders).set({ errorMessage: "Broadcast unconfirmed — retry to reconcile the same signed transaction" }).where(eq(liveOrders.id, orderId));
    throw new Error(err instanceof Error ? err.message : "Broadcast unconfirmed — retry before creating another order");
  }
}

async function finalizeRevertedCustodyOrder(sessionId: number, orderId: number, hash: string, gasWei: bigint, rate: number) {
  const wallet = await getCustodyWallet(sessionId);
  if (!wallet) return;
  await db.transaction(async (tx) => {
    await tx.select().from(custodyWallets).where(eq(custodyWallets.id, wallet.id)).for("update");
    const [order] = await tx.select().from(liveOrders).where(eq(liveOrders.id, orderId)).for("update");
    if (!order || order.status === "CONFIRMED") return;
    const fee = Math.ceil(Number(gasWei) / 1e18 * (rate || wallet.ethUsd) * 100);
    const balance = await ledgerBalance(wallet.id);
    await tx.update(liveOrders).set({ status: "FAILED", txHash: hash, errorMessage: "Swap reverted on-chain; principal returned to vault ledger." }).where(eq(liveOrders.id, orderId));
    await tx.update(custodyEntries).set({ status: "CONFIRMED", amountCents: -fee, balanceAfterCents: balance.realAvailable - fee, txHash: hash }).where(eq(custodyEntries.reference, `order:${orderId}:reserve`));
  });
}

export async function finalizeCustodyTrade(sessionId: number, orderId: number, txHash: string) {
  const wallet = await getCustodyWallet(sessionId);
  if (!wallet) return;
  const [order] = await db.select().from(liveOrders).where(eq(liveOrders.id, orderId));
  if (!order) return;
  await db.transaction(async (tx) => {
    await tx.select().from(custodyWallets).where(eq(custodyWallets.id, wallet.id)).for("update");
    const [entry] = await tx.select().from(custodyEntries).where(eq(custodyEntries.reference, `order:${orderId}:reserve`));
    if (entry?.status === "CONFIRMED") return;
    await tx.update(custodyEntries).set({ status: "CONFIRMED", txHash }).where(eq(custodyEntries.reference, `order:${orderId}:reserve`));
    await tx.update(custodyWallets).set({
      spentTodayUsd: (wallet.spendDay === today() ? wallet.spentTodayUsd : 0) + order.amountUsd,
      spendDay: today(),
    }).where(eq(custodyWallets.id, wallet.id));

  });
}

export async function releaseCustodyOrder(orderId: number) {
  const [order] = await db.select().from(liveOrders).where(eq(liveOrders.id, orderId));
  if (!order) return;
  const [wallet] = await db.select().from(custodyWallets).where(eq(custodyWallets.address, order.walletAddress));
  if (!wallet) return;
  const [entry] = await db.select().from(custodyEntries).where(eq(custodyEntries.reference, `order:${orderId}:reserve`));
  const [lockedOrder] = await db.select().from(liveOrders).where(eq(liveOrders.id, orderId));
  if (!entry || entry.status === "CONFIRMED" || lockedOrder?.status === "BROADCASTING" || lockedOrder?.signedTransaction) return;
  await db.update(custodyEntries).set({ status: "FAILED", amountCents: 0, balanceAfterCents: (await ledgerBalance(wallet.id)).confirmed }).where(eq(custodyEntries.id, entry.id));
}
