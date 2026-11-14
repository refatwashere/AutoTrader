"use client";

import { useMemo, useState } from "react";
import {
  Radio,
  LockKeyhole,
  Wallet,
  ShieldCheck,
  ExternalLink,
  PenLine,
  XCircle,
  Loader2,
  ArrowUpRight,
  CheckCircle2,
  X,
  Zap,
  Landmark,
  Link2,
} from "lucide-react";
import type { BotConfig, LiveOrder, Position, WalletRecord } from "@/db/schema";
import type { CustodyState } from "@/lib/custody";
import { useWallet } from "./WalletProvider";
import {
  LIVE_ASSETS,
  dexSwapUrl,
  explorerTxUrl,
  getLiveAsset,
  jupiterSwapUrl,
  shortenAddress,
} from "@/lib/live-universe";

interface LiveMetricsShape {
  verifiedWallets: number;
  liveOpenPositions: number;
  deployedUsd: number;
  pendingOrders: number;
  confirmedOrders: number;
  dailyCapRemainingUsd: number;
  mode: string;
  autoTrade: boolean;
}

interface Props {
  config: BotConfig;
  orders: LiveOrder[];
  livePositions: Position[];
  wallets: WalletRecord[];
  liveMetrics: LiveMetricsShape;
  onRefresh: () => Promise<void>;
  custody: CustodyState | null;
  onOpenCustody: () => void;
  onOpenWallet: () => void;
  onGoLive: () => void;
}

const STATUS_STYLE: Record<string, string> = {
  PENDING: "bg-amber-500/15 text-amber-300 border-amber-500/40",
  SUBMITTED: "bg-sky-500/15 text-sky-300 border-sky-500/40",
  CONFIRMED: "bg-[#10B981]/15 text-[#10B981] border-[#10B981]/40",
  FAILED: "bg-rose-500/15 text-rose-300 border-rose-500/40",
  CANCELLED: "bg-slate-700/40 text-slate-400 border-slate-600",
};

export default function LiveOrdersPanel({
  config,
  orders,
  livePositions,
  wallets,
  liveMetrics,
  onRefresh,
  custody,
  onOpenCustody,
  onOpenWallet,
  onGoLive,
}: Props) {
  const wallet = useWallet();
  const [signingId, setSigningId] = useState<number | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [fillInputs, setFillInputs] = useState<Record<number, string>>({});
  const [buyAsset, setBuyAsset] = useState<string>(
    LIVE_ASSETS.find((a) => a.chain === "BASE")?.symbol ?? LIVE_ASSETS[0].symbol
  );
  const [buyAmount, setBuyAmount] = useState<number>(Math.max(1, config.liveMaxTradeUsd));
  const [creating, setCreating] = useState(false);
  const [useCustody, setUseCustody] = useState(false);

  const isLive = config.tradingMode === "LIVE";
  const verifiedChains = useMemo(
    () => new Set(wallets.filter((w) => w.isVerified).map((w) => w.chain)),
    [wallets]
  );
  const openLive = livePositions.filter((p) => p.status === "OPEN");
  const pendingOrders = orders.filter((o) => o.status === "PENDING" || o.status === "BROADCASTING");
  const settledOrders = orders.filter((o) => o.status !== "PENDING").slice(0, 8);

  const post = async (body: Record<string, unknown>) => {
    const res = await fetch("/api/wallet/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Live action failed");
    return data;
  };

  const signOrder = async (order: LiveOrder) => {
    setActionError(null);
    setSigningId(order.id);
    try {
      if (custody?.wallet.address === order.walletAddress) {
        const res = await fetch("/api/custody", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "AUTO_SIGN", orderId: order.id }) });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Vault signing failed");
      } else {
        const hash = await wallet.broadcastLiveBuy(order);
        await post({ action: "CONFIRM", orderId: order.id, txHash: hash });
      }
      await onRefresh(); return;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Transaction failed";
      setActionError(message);
      const code = (err as { code?: number })?.code;
      if (code !== 4001) {
        // not a user rejection — mark the intent failed so the budget is released
        try {
          await post({ action: "FAIL", orderId: order.id, error: message, walletAddress: order.walletAddress });
          await onRefresh();
        } catch {
          // ignore
        }
      }
    } finally {
      setSigningId(null);
    }
  };

  const recordFill = async (order: LiveOrder) => {
    const signature = (fillInputs[order.id] || "").trim();
    if (signature.length < 20) {
      setActionError("Paste the full transaction signature / hash from your wallet or explorer");
      return;
    }
    setSigningId(order.id);
    setActionError(null);
    try {
      await post({ action: "CONFIRM", orderId: order.id, txHash: signature });
      setFillInputs((prev) => ({ ...prev, [order.id]: "" }));
      await onRefresh();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Could not record fill");
    } finally {
      setSigningId(null);
    }
  };

  const cancelOrder = async (order: LiveOrder) => {
    setSigningId(order.id);
    try {
      await post({ action: "CANCEL", orderId: order.id });
      await onRefresh();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Could not cancel");
    } finally {
      setSigningId(null);
    }
  };

  const createManualBuy = async () => {
    setCreating(true);
    setActionError(null);
    try {
      await post({ action: "CREATE", assetSymbol: buyAsset, amountUsd: buyAmount, useCustody, walletAddress: useCustody ? custody?.wallet.address : undefined });
      await onRefresh();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Could not create live intent");
    } finally {
      setCreating(false);
    }
  };

  const prepareExit = async (positionId: number) => {
    setSigningId(positionId);
    setActionError(null);
    try {
      await post({ action: "EXIT_POSITION", positionId });
      await onRefresh();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Could not prepare exit");
    } finally {
      setSigningId(null);
    }
  };

  const renderOrder = (order: LiveOrder) => {
    const asset = getLiveAsset(order.assetSymbol);
    const isEvmBuy =
      order.side === "BUY" && order.chain !== "SOL" && asset?.routerAddress && asset.quoteAddress;
    const canSignWithWallet = Boolean(asset && asset.chain === "SOL" ? wallet.solanaAddress : wallet.evmAddress);

    return (
      <div
        key={order.id}
        className="p-3 rounded-lg bg-[#090B10] border border-white/[0.07] space-y-2"
      >
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 flex-wrap">
            <span
              className={`text-[10px] font-mono px-1.5 py-0.5 rounded border ${
                order.side === "BUY"
                  ? "bg-[#10B981]/15 text-[#10B981] border-[#10B981]/30"
                  : "bg-[#8B5CF6]/15 text-[#C4B5FD] border-[#8B5CF6]/30"
              }`}
            >
              LIVE {order.side}
            </span>
            <span className="font-display font-bold text-sm text-white">${order.assetSymbol}</span>
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-white/5 border border-white/10 text-slate-300">
              {order.chain}
            </span>
            <span
              className={`text-[10px] font-mono px-1.5 py-0.5 rounded border ${
                STATUS_STYLE[order.status] ?? STATUS_STYLE.PENDING
              }`}
            >
              {order.status}
            </span>
            <span className="text-[10px] font-mono text-slate-500">{order.source}</span>
          </div>
          <div className="text-right">
            <div className="text-xs font-mono text-white">${order.amountUsd.toFixed(2)}</div>
            <div className="text-[10px] font-mono text-slate-500">
              ≈ {order.amountNative} {order.chain === "SOL" ? "SOL" : "ETH"}
            </div>
          </div>
        </div>

        <div className="text-[11px] text-slate-400 font-sans leading-relaxed">{order.reason}</div>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] font-mono text-slate-500">
          <span>{order.dex}</span>
          <span>slip {order.slippagePct}%</span>
          <span>wallet {shortenAddress(order.walletAddress)}</span>
          {order.viabilityScore !== null && <span>score {order.viabilityScore}/100</span>}
        </div>

        {order.status === "PENDING" && (
          <div className="space-y-2 pt-1">
            {isEvmBuy ? (
              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={() => signOrder(order)}
                  disabled={signingId === order.id || !canSignWithWallet}
                  className="flex-1 min-w-[150px] py-2 rounded-lg bg-[#10B981] hover:bg-[#059669] disabled:bg-slate-800 disabled:text-slate-500 text-slate-950 text-[11px] font-bold flex items-center justify-center gap-1.5 cursor-pointer disabled:cursor-not-allowed"
                >
                  {signingId === order.id ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Wallet className="w-3.5 h-3.5" />
                  )}
                  {signingId === order.id ? "Waiting for signature…" : custody?.wallet.address === order.walletAddress ? "Retry / auto-sign with Vault" : "Sign & broadcast swap"}
                </button>
                {asset && (
                  <a
                    href={dexSwapUrl(asset)}
                    target="_blank"
                    rel="noreferrer"
                    className="px-2.5 py-2 rounded-lg bg-white/5 border border-white/10 text-slate-300 text-[11px] flex items-center gap-1 hover:text-white"
                  >
                    DEX route <ExternalLink className="w-3 h-3" />
                  </a>
                )}
                <button
                  onClick={() => cancelOrder(order)}
                  disabled={signingId === order.id}
                  className="px-2.5 py-2 rounded-lg bg-white/5 border border-white/10 text-slate-400 hover:text-rose-300 text-[11px] flex items-center gap-1 cursor-pointer"
                >
                  <XCircle className="w-3 h-3" /> Cancel
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  {asset && (
                    <a
                      href={
                        order.chain === "SOL"
                          ? jupiterSwapUrl(asset, order.amountNative)
                          : dexSwapUrl(asset)
                      }
                      target="_blank"
                      rel="noreferrer"
                      className="flex-1 min-w-[150px] py-2 rounded-lg bg-[#8B5CF6] hover:bg-[#7c3aed] text-white text-[11px] font-bold flex items-center justify-center gap-1.5"
                    >
                      <ArrowUpRight className="w-3.5 h-3.5" />
                      Open {order.chain === "SOL" ? "Jupiter" : "Uniswap"} & sign
                    </a>
                  )}
                  <button
                    onClick={() => cancelOrder(order)}
                    disabled={signingId === order.id}
                    className="px-2.5 py-2 rounded-lg bg-white/5 border border-white/10 text-slate-400 hover:text-rose-300 text-[11px] flex items-center gap-1 cursor-pointer"
                  >
                    <XCircle className="w-3 h-3" /> Cancel
                  </button>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    value={fillInputs[order.id] || ""}
                    onChange={(e) =>
                      setFillInputs((prev) => ({ ...prev, [order.id]: e.target.value }))
                    }
                    placeholder="Paste tx signature after swapping"
                    className="flex-1 px-2.5 py-1.5 rounded-lg bg-[#11151F] border border-white/10 text-[11px] font-mono text-slate-200 focus:outline-none focus:border-[#8B5CF6]"
                  />
                  <button
                    onClick={() => recordFill(order)}
                    disabled={signingId === order.id}
                    className="px-2.5 py-1.5 rounded-lg bg-[#10B981]/15 border border-[#10B981]/40 text-[#10B981] text-[11px] font-semibold flex items-center gap-1 cursor-pointer"
                  >
                    <CheckCircle2 className="w-3 h-3" /> Record fill
                  </button>
                </div>
              </div>
            )}
            {!canSignWithWallet && isEvmBuy && (
              <p className="text-[10px] text-amber-300/90">
                Connect the matching wallet to sign this intent.
              </p>
            )}
          </div>
        )}

        {order.txHash && (
          <a
            href={order.explorerUrl || explorerTxUrl(order.chain, order.txHash)}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-[10px] font-mono text-[#10B981] hover:underline"
          >
            {shortenAddress(order.txHash, 6)} <ExternalLink className="w-3 h-3" />
          </a>
        )}
        {order.errorMessage && order.status === "FAILED" && (
          <p className="text-[10px] font-mono text-rose-400/90">{order.errorMessage}</p>
        )}
      </div>
    );
  };

  return (
    <div className="bg-[#11151F]/90 backdrop-blur-md rounded-xl border border-white/[0.07] p-5 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3 pb-3 border-b border-white/[0.06]">
        <div>
          <div className="flex items-center gap-2">
            <Landmark className="w-4 h-4 text-[#10B981]" />
            <h2 className="font-display font-semibold text-base tracking-tight">
              On-Chain Execution & Wallet Bridge
            </h2>
            <span
              className={`text-[10px] font-mono px-2 py-0.5 rounded border ${
                isLive
                  ? "bg-rose-500/15 text-rose-300 border-rose-500/40"
                  : "bg-slate-800 text-slate-400 border-slate-700"
              }`}
            >
              {isLive ? "LIVE MODE" : "PAPER MODE"}
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-0.5">
            {isLive
              ? "Verified contracts only · every intent requires your wallet signature"
              : "Paper simulation is active. Link a wallet to unlock real on-chain execution."}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={onOpenWallet}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#11151F] border border-white/10 hover:border-[#10B981]/50 text-xs text-slate-200 cursor-pointer"
          >
            <Wallet className="w-3.5 h-3.5 text-[#10B981]" />
            {wallet.evmAddress
              ? shortenAddress(wallet.evmAddress)
              : wallet.solanaAddress
              ? shortenAddress(wallet.solanaAddress)
              : "Connect Wallet"}
          </button>
          {!isLive && (
            <button
              onClick={onGoLive}
              disabled={liveMetrics.verifiedWallets === 0}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#10B981] hover:bg-[#059669] disabled:bg-slate-800 disabled:text-slate-500 text-slate-950 text-xs font-bold cursor-pointer disabled:cursor-not-allowed"
            >
              <Radio className="w-3.5 h-3.5" /> Go Live
            </button>
          )}
        </div>
      </div>

      {/* Live telemetry strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
        {[
          { label: "Verified Wallets", value: String(liveMetrics.verifiedWallets) },
          { label: "On-Chain Open", value: String(openLive.length) },
          { label: "Deployed Live", value: `$${liveMetrics.deployedUsd.toFixed(2)}` },
          { label: "Daily Budget Left", value: `$${liveMetrics.dailyCapRemainingUsd.toFixed(2)}` },
        ].map((item) => (
          <div
            key={item.label}
            className="p-2.5 rounded-lg bg-[#090B10] border border-white/[0.06]"
          >
            <div className="text-[10px] uppercase tracking-wider text-slate-500">{item.label}</div>
            <div className="text-sm font-mono font-semibold text-white mt-0.5">{item.value}</div>
          </div>
        ))}
      </div>

      {actionError && (
        <div className="p-2.5 rounded-lg bg-rose-500/10 border border-rose-500/30 text-[11px] text-rose-300 flex items-start gap-2">
          <X className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          <span className="flex-1">{actionError}</span>
          <button onClick={() => setActionError(null)} className="opacity-70 hover:opacity-100 cursor-pointer">
            <X className="w-3 h-3" />
          </button>
        </div>
      )}

      {/* Pending queue */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
            Pending signatures ({pendingOrders.length})
          </span>
          {liveMetrics.autoTrade && isLive && (
            <span className="flex items-center gap-1 text-[10px] font-mono text-[#10B981]">
              <Zap className="w-3 h-3" /> bot intent generation on
            </span>
          )}
        </div>
        {pendingOrders.length === 0 ? (
          <div className="p-3 rounded-lg bg-[#090B10] border border-dashed border-white/[0.08] text-[11px] text-slate-500 font-mono">
            No intents awaiting signature.
          </div>
        ) : (
          <div className="space-y-2 max-h-[360px] overflow-y-auto pr-1">
            {pendingOrders.map(renderOrder)}
          </div>
        )}
      </div>

      {/* Manual live buy */}
      {isLive && (
        <div className="p-3 rounded-lg bg-[#090B10] border border-white/[0.07] space-y-2">
          <div className="flex items-center gap-2 text-[11px] font-semibold text-slate-300">
            <ShieldCheck className="w-3.5 h-3.5 text-[#10B981]" /> New live intent (verified universe)
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={buyAsset}
              onChange={(e) => setBuyAsset(e.target.value)}
              className="flex-1 min-w-[140px] px-2.5 py-2 rounded-lg bg-[#11151F] border border-white/10 text-xs font-mono text-slate-200 focus:outline-none focus:border-[#10B981]"
            >
              {LIVE_ASSETS.map((asset) => (
                <option key={asset.symbol} value={asset.symbol}>
                  ${asset.symbol} · {asset.chain}
                  {verifiedChains.has(asset.chain) ? " ✓ wallet" : ""}
                </option>
              ))}
            </select>
            <div className="relative">
              <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500 text-xs font-mono">
                $
              </span>
              <input
                type="number"
                min={1}
                step={1}
                value={buyAmount}
                onChange={(e) => setBuyAmount(Number(e.target.value))}
                className="w-24 pl-6 pr-2 py-2 rounded-lg bg-[#11151F] border border-white/10 text-xs font-mono text-slate-200 focus:outline-none focus:border-[#10B981]"
              />
            </div>
            <button
              onClick={createManualBuy}
              disabled={creating}
              className="px-3 py-2 rounded-lg bg-[#10B981] hover:bg-[#059669] text-slate-950 text-[11px] font-bold flex items-center gap-1.5 cursor-pointer disabled:opacity-60"
            >
              {creating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Link2 className="w-3.5 h-3.5" />}
              Create intent
            </button>
          </div>
          <p className="text-[10px] text-slate-500 font-mono">
            Guardrail: max ${config.liveMaxTradeUsd.toFixed(2)} per trade · {config.liveSlippagePct}%
            slippage · daily cap ${config.liveDailyCapUsd.toFixed(2)} · $
            {liveMetrics.dailyCapRemainingUsd.toFixed(2)} remaining today
          </p>
        </div>
      )}

      {/* On-chain positions */}
      <div className="space-y-2 pt-1">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
          Live wallet positions ({openLive.length})
        </span>
        {openLive.length === 0 ? (
          <div className="p-3 rounded-lg bg-[#090B10] border border-dashed border-white/[0.08] text-[11px] text-slate-500 font-mono">
            No on-chain positions. Signed swaps will appear here with explorer receipts.
          </div>
        ) : (
          <div className="space-y-2 max-h-[260px] overflow-y-auto pr-1">
            {openLive.map((pos) => (
              <div
                key={pos.id}
                className="p-3 rounded-lg bg-[#090B10] border border-[#10B981]/20 flex flex-wrap items-center justify-between gap-2"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-display font-bold text-sm text-white">${pos.symbol}</span>
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[#10B981]/15 text-[#10B981] border border-[#10B981]/30">
                      ON-CHAIN
                    </span>
                    <span className="text-[10px] font-mono text-slate-500">{pos.chain}</span>
                  </div>
                  <div className="text-[10px] font-mono text-slate-500 mt-0.5">
                    {pos.dex} · wallet {shortenAddress(pos.walletAddress || "")} · deployed $
                    {pos.investedUsd.toFixed(2)}
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  <a
                    href={explorerTxUrl(pos.chain, pos.txHash)}
                    target="_blank"
                    rel="noreferrer"
                    className="px-2 py-1.5 rounded-lg bg-white/5 border border-white/10 text-[10px] font-mono text-slate-300 flex items-center gap-1 hover:text-white"
                  >
                    Receipt <ExternalLink className="w-3 h-3" />
                  </a>
                  <button
                    onClick={() => prepareExit(pos.id)}
                    disabled={signingId === pos.id}
                    className="px-2 py-1.5 rounded-lg bg-[#8B5CF6]/15 border border-[#8B5CF6]/40 text-[10px] font-semibold text-[#C4B5FD] flex items-center gap-1 cursor-pointer"
                  >
                    <PenLine className="w-3 h-3" /> Prepare exit
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Settled history */}
      {settledOrders.length > 0 && (
        <details className="pt-1">
          <summary className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 cursor-pointer">
            Recent on-chain activity ({settledOrders.length})
          </summary>
          <div className="space-y-2 mt-2 max-h-[260px] overflow-y-auto pr-1">
            {settledOrders.map(renderOrder)}
          </div>
        </details>
      )}
    </div>
  );
}
