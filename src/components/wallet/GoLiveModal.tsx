"use client";

import { useEffect, useState } from "react";
import {
  X,
  AlertTriangle,
  Radio,
  ShieldCheck,
  Wallet,
  SlidersHorizontal,
  Flame,
  Loader2,
} from "lucide-react";
import { useWallet } from "./WalletProvider";
import { LIVE_ASSETS } from "@/lib/live-universe";
import type { BotConfig } from "@/db/schema";

export default function GoLiveModal({
  open,
  onClose,
  config,
  onSuccess,
}: {
  open: boolean;
  onClose: () => void;
  config: BotConfig;
  onSuccess: () => Promise<void> | void;
}) {
  const wallet = useWallet();
  const [ack, setAck] = useState(false);
  const [autoTrade, setAutoTrade] = useState(config.liveAutoTrade);
  const [maxTrade, setMaxTrade] = useState(config.liveMaxTradeUsd);
  const [dailyCap, setDailyCap] = useState(config.liveDailyCapUsd);
  const [slippage, setSlippage] = useState(config.liveSlippagePct);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setAutoTrade(config.liveAutoTrade);
    setMaxTrade(config.liveMaxTradeUsd);
    setDailyCap(config.liveDailyCapUsd);
    setSlippage(config.liveSlippagePct);
    setAck(false);
    setError(null);
  }, [
    open,
    config.liveAutoTrade,
    config.liveMaxTradeUsd,
    config.liveDailyCapUsd,
    config.liveSlippagePct,
  ]);

  if (!open) return null;

  const primary = wallet.linkedWallets.find((w) => w.isPrimary) || wallet.linkedWallets[0];

  const enableLive = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/terminal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "UPDATE_CONFIG",
          updates: {
            tradingMode: "LIVE",
            liveAutoTrade: autoTrade,
            liveMaxTradeUsd: maxTrade,
            liveDailyCapUsd: dailyCap,
            liveSlippagePct: slippage,
          },
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not enable live mode");
      await onSuccess();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not enable live mode");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-[#11151F] border border-rose-500/30 rounded-2xl max-w-xl w-full max-h-[90vh] overflow-y-auto shadow-2xl">
        <div className="flex items-start justify-between gap-4 p-5 border-b border-white/[0.08]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-rose-500/15 border border-rose-500/40 flex items-center justify-center">
              <Radio className="w-5 h-5 text-rose-400" />
            </div>
            <div>
              <h2 className="font-display font-bold text-lg text-white">Enable Live On-Chain Mode</h2>
              <p className="text-xs text-slate-400">
                Real signatures · real contracts · non-custodial execution
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-xs text-rose-200 space-y-1.5">
            <div className="flex items-center gap-2 font-semibold">
              <AlertTriangle className="w-4 h-4" />
              Live trading uses real funds and is irreversible.
            </div>
            <p className="leading-relaxed text-rose-200/85">
              Autonomous signals are heuristics, not financial advice. DEX swaps can slip, fail or
              lose value. Contract addresses are curated and verified, but you remain solely
              responsible for every transaction you approve.
            </p>
          </div>

          <div className="p-3.5 rounded-xl bg-[#090B10] border border-white/[0.07] space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-400 flex items-center gap-2">
                <Wallet className="w-3.5 h-3.5 text-[#10B981]" /> Execution wallet
              </span>
              <span className="text-xs font-mono text-[#10B981] flex items-center gap-1">
                <ShieldCheck className="w-3.5 h-3.5" />
                {primary ? `${primary.address.slice(0, 6)}…${primary.address.slice(-4)}` : "None"}
              </span>
            </div>
            <div className="text-[11px] text-slate-500 font-mono">
              {primary ? `${primary.chain} · ${primary.provider} · verified` : "Verify a wallet first"}
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-200">
              <SlidersHorizontal className="w-4 h-4 text-[#8B5CF6]" /> Live risk guardrails
            </div>

            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-slate-300">Max per live trade</span>
                <span className="font-mono text-[#10B981]">${maxTrade.toFixed(2)}</span>
              </div>
              <input
                type="range"
                min={1}
                max={100}
                step={1}
                value={maxTrade}
                onChange={(e) => setMaxTrade(Number(e.target.value))}
                className="w-full accent-[#10B981] cursor-pointer"
              />
            </div>

            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-slate-300">Daily live spend cap</span>
                <span className="font-mono text-[#10B981]">${dailyCap.toFixed(2)}</span>
              </div>
              <input
                type="range"
                min={5}
                max={500}
                step={5}
                value={dailyCap}
                onChange={(e) => setDailyCap(Number(e.target.value))}
                className="w-full accent-[#10B981] cursor-pointer"
              />
              <p className="text-[10px] text-slate-500 mt-1 font-mono">
                ${Math.max(0, dailyCap - config.liveSpentTodayUsd).toFixed(2)} remaining today
              </p>
            </div>

            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-slate-300">Max slippage tolerance</span>
                <span className="font-mono text-[#C4B5FD]">{slippage.toFixed(1)}%</span>
              </div>
              <input
                type="range"
                min={0.5}
                max={10}
                step={0.5}
                value={slippage}
                onChange={(e) => setSlippage(Number(e.target.value))}
                className="w-full accent-[#8B5CF6] cursor-pointer"
              />
            </div>

            <label className="flex items-start justify-between gap-3 text-xs text-slate-300 cursor-pointer p-2.5 rounded-lg bg-[#090B10] border border-white/[0.06]">
              <span className="flex items-start gap-2">
                <Flame className="w-4 h-4 text-[#8B5CF6] mt-0.5" />
                <span>
                  Allow the bot to generate live intents automatically
                  <span className="block text-[10px] text-slate-500 mt-0.5">
                    Each intent is queued for your signature — nothing is broadcast by the bot alone.
                  </span>
                </span>
              </span>
              <input
                type="checkbox"
                checked={autoTrade}
                onChange={(e) => setAutoTrade(e.target.checked)}
                className="mt-1 accent-[#8B5CF6] cursor-pointer"
              />
            </label>
          </div>

          <div className="p-3 rounded-xl bg-[#090B10] border border-white/[0.07]">
            <div className="text-[11px] font-semibold text-slate-300 mb-1.5">
              Live universe ({LIVE_ASSETS.length} verified contracts)
            </div>
            <div className="flex flex-wrap gap-1.5">
              {LIVE_ASSETS.map((a) => (
                <span
                  key={a.symbol}
                  className="text-[10px] font-mono px-2 py-1 rounded bg-white/5 border border-white/10 text-slate-300"
                >
                  {a.symbol} · {a.chain}
                </span>
              ))}
            </div>
          </div>

          <label className="flex items-start gap-2.5 text-xs text-slate-300 cursor-pointer">
            <input
              type="checkbox"
              checked={ack}
              onChange={(e) => setAck(e.target.checked)}
              className="mt-0.5 accent-[#10B981] cursor-pointer"
            />
            <span>
              I understand live trading spends real funds, that I must approve each transaction in my
              wallet, and that I am solely responsible for the resulting positions.
            </span>
          </label>

          {error && (
            <div className="p-2.5 rounded-lg bg-rose-500/10 border border-rose-500/30 text-xs text-rose-300">
              {error}
            </div>
          )}

          <button
            onClick={enableLive}
            disabled={!ack || busy || !primary}
            className="w-full py-3 rounded-lg bg-rose-500 hover:bg-rose-600 disabled:bg-slate-800 disabled:text-slate-500 text-white text-xs font-bold tracking-wider flex items-center justify-center gap-2 cursor-pointer disabled:cursor-not-allowed transition"
          >
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Radio className="w-4 h-4" />}
            {busy ? "ARMING LIVE ENGINE..." : "ENABLE LIVE ON-CHAIN TRADING"}
          </button>
        </div>
      </div>
    </div>
  );
}
