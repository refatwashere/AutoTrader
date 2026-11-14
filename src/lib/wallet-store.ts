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
    "AutoTrader — Wallet ownership verification",
    "",
    "Signing this message links your wallet to the trading terminal.",
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
