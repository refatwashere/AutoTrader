"use client";

import {
  Wallet,
  X,
  ShieldCheck,
  ShieldAlert,
  Link2,
  Unlink,
  Star,
  ExternalLink,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  Radio,
} from "lucide-react";
import { useWallet } from "./WalletProvider";
import { LIVE_CHAINS, explorerAddressUrl, type LiveChainKey } from "@/lib/live-universe";

const CHAIN_BADGE: Record<string, string> = {
  SOL: "bg-[#8B5CF6]/15 text-[#C4B5FD] border-[#8B5CF6]/40",
  BASE: "bg-sky-500/15 text-sky-300 border-sky-500/40",
  ETH: "bg-indigo-500/15 text-indigo-300 border-indigo-500/40",
  ARB: "bg-cyan-500/15 text-cyan-300 border-cyan-500/40",
};

export default function WalletModal({
  open,
  onClose,
  onGoLive,
}: {
  open: boolean;
  onClose: () => void;
  onGoLive: () => void;
}) {
  const wallet = useWallet();
  if (!open) return null;

  const hasVerified = wallet.linkedWallets.some((w) => w.isVerified);

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-[#11151F] border border-white/15 rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-2xl">
        <div className="flex items-start justify-between gap-4 p-5 border-b border-white/[0.08] sticky top-0 bg-[#11151F] z-10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#10B981]/15 border border-[#10B981]/40 flex items-center justify-center">
              <Wallet className="w-5 h-5 text-[#10B981]" />
            </div>
            <div>
              <h2 className="font-display font-bold text-lg text-white">Live Wallet & On-Chain Access</h2>
              <p className="text-xs text-slate-400">
                Non-custodial. Keys never leave your wallet; every live trade needs your signature.
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

        <div className="p-5 space-y-5">
          {(wallet.error || wallet.notice) && (
            <div
              className={`p-3 rounded-lg text-xs flex items-start gap-2 border ${
                wallet.error
                  ? "bg-rose-500/10 border-rose-500/30 text-rose-300"
                  : "bg-[#10B981]/10 border-[#10B981]/30 text-[#10B981]"
              }`}
            >
              {wallet.error ? (
                <AlertTriangle className="w-4 h-4 shrink-0" />
              ) : (
                <CheckCircle2 className="w-4 h-4 shrink-0" />
              )}
              <span className="flex-1">{wallet.error || wallet.notice}</span>
              <button onClick={wallet.clearMessages} className="opacity-70 hover:opacity-100 cursor-pointer">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* EVM WALLETS */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                EVM Wallet (Base · Ethereum · Arbitrum)
              </h3>
              <span
                className={`text-[10px] font-mono px-2 py-0.5 rounded border ${
                  wallet.detected.evm
                    ? "bg-[#10B981]/10 text-[#10B981] border-[#10B981]/30"
                    : "bg-slate-800 text-slate-400 border-slate-700"
                }`}
              >
                {wallet.detected.evm ? "INJECTED PROVIDER FOUND" : "NOT DETECTED"}
              </span>
            </div>

            {wallet.evmAddress ? (
              <div className="p-4 rounded-xl bg-[#090B10] border border-[#10B981]/30 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <div className="font-mono text-sm text-white">
                      {wallet.evmAddress.slice(0, 8)}…{wallet.evmAddress.slice(-6)}
                    </div>
                    <div className="text-[11px] text-slate-400 font-mono mt-0.5">
                      {wallet.evmProviderName} · chain {wallet.evmChainId ?? "—"} ·{" "}
                      {wallet.nativeBalance !== null
                        ? `${Number(wallet.nativeBalance).toFixed(5)} ETH/SOL`
                        : "balance unavailable"}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="flex items-center gap-1.5 text-[11px] font-mono text-[#10B981]">
                      <span className="w-2 h-2 rounded-full bg-[#10B981] animate-pulse" />
                      CONNECTED
                    </span>
                    <button
                      onClick={wallet.disconnectEvm}
                      className="text-[11px] text-slate-400 hover:text-white px-2 py-1 rounded bg-white/5 cursor-pointer"
                    >
                      Disconnect
                    </button>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-[11px] text-slate-500 mr-1">Network:</span>
                  {(["BASE", "ETH", "ARB"] as LiveChainKey[]).map((chain) => (
                    <button
                      key={chain}
                      onClick={() => wallet.switchEvmChain(chain)}
                      className={`px-2.5 py-1 rounded text-[11px] font-mono border transition cursor-pointer ${
                        wallet.evmChainKey === chain
                          ? "bg-[#10B981]/20 text-[#10B981] border-[#10B981]/40"
                          : "bg-[#11151F] text-slate-300 border-white/10 hover:border-white/25"
                      }`}
                    >
                      {LIVE_CHAINS[chain].name}
                    </button>
                  ))}
                </div>

                <button
                  onClick={() => wallet.linkCurrentWallet(wallet.evmChainKey ?? "BASE")}
                  disabled={wallet.busy}
                  className="w-full py-2.5 rounded-lg bg-[#8B5CF6] hover:bg-[#7c3aed] text-white text-xs font-semibold flex items-center justify-center gap-2 cursor-pointer transition disabled:opacity-60"
                >
                  {wallet.busy ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : (
                    <Link2 className="w-4 h-4" />
                  )}
                  Sign message to link & verify on {LIVE_CHAINS[wallet.evmChainKey ?? "BASE"].name}
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <button
                  onClick={wallet.connectEvm}
                  disabled={wallet.busy}
                  className="p-3 rounded-xl bg-[#090B10] border border-white/10 hover:border-[#10B981]/50 text-left transition cursor-pointer"
                >
                  <div className="text-xs font-semibold text-white">MetaMask / Injected</div>
                  <div className="text-[11px] text-slate-400 mt-0.5">
                    Connect your browser wallet extension
                  </div>
                </button>
                <button
                  onClick={wallet.connectEvm}
                  disabled={wallet.busy}
                  className="p-3 rounded-xl bg-[#090B10] border border-white/10 hover:border-[#10B981]/50 text-left transition cursor-pointer"
                >
                  <div className="text-xs font-semibold text-white">Coinbase Wallet / Others</div>
                  <div className="text-[11px] text-slate-400 mt-0.5">
                    Any EIP-1193 compatible provider
                  </div>
                </button>
              </div>
            )}
          </div>

          {/* SOLANA WALLET */}
          <div className="space-y-3 pt-4 border-t border-white/[0.07]">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                Solana Wallet (Phantom · Solflare)
              </h3>
              <span
                className={`text-[10px] font-mono px-2 py-0.5 rounded border ${
                  wallet.detected.solana
                    ? "bg-[#8B5CF6]/10 text-[#C4B5FD] border-[#8B5CF6]/30"
                    : "bg-slate-800 text-slate-400 border-slate-700"
                }`}
              >
                {wallet.detected.solana ? "SOLANA PROVIDER FOUND" : "NOT DETECTED"}
              </span>
            </div>

            {wallet.solanaAddress ? (
              <div className="p-3.5 rounded-xl bg-[#090B10] border border-[#8B5CF6]/30 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="font-mono text-sm text-white">
                    {wallet.solanaAddress.slice(0, 6)}…{wallet.solanaAddress.slice(-6)}
                  </div>
                  <div className="text-[11px] text-slate-400 font-mono">
                    {wallet.solanaProviderName} · {wallet.nativeBalance ?? "—"} SOL
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => wallet.linkCurrentWallet("SOL")}
                    disabled={wallet.busy}
                    className="px-3 py-2 rounded-lg bg-[#8B5CF6] hover:bg-[#7c3aed] text-white text-[11px] font-semibold cursor-pointer"
                  >
                    Sign & verify
                  </button>
                  <button
                    onClick={wallet.disconnectSolana}
                    className="px-2 py-2 rounded-lg bg-white/5 text-slate-400 hover:text-white text-[11px] cursor-pointer"
                  >
                    Disconnect
                  </button>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => wallet.connectSolana("phantom")}
                  disabled={wallet.busy}
                  className="p-3 rounded-xl bg-[#090B10] border border-white/10 hover:border-[#8B5CF6]/50 text-left transition cursor-pointer"
                >
                  <div className="text-xs font-semibold text-white">Phantom</div>
                  <div className="text-[11px] text-slate-400 mt-0.5">Solana mainnet wallet</div>
                </button>
                <button
                  onClick={() => wallet.connectSolana("solflare")}
                  disabled={wallet.busy}
                  className="p-3 rounded-xl bg-[#090B10] border border-white/10 hover:border-[#8B5CF6]/50 text-left transition cursor-pointer"
                >
                  <div className="text-xs font-semibold text-white">Solflare</div>
                  <div className="text-[11px] text-slate-400 mt-0.5">Alternative Solana wallet</div>
                </button>
              </div>
            )}
          </div>

          {/* VERIFIED WALLETS */}
          <div className="space-y-2 pt-4 border-t border-white/[0.07]">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Verified Wallets ({wallet.linkedWallets.length})
            </h3>
            {wallet.linkedWallets.length === 0 ? (
              <div className="p-4 rounded-xl bg-[#090B10] border border-white/[0.07] text-xs text-slate-400 flex items-start gap-2">
                <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0" />
                No verified wallet yet. Connect a wallet and sign the ownership message to unlock LIVE
                mode. Signatures are verified server-side (ECDSA / Ed25519).
              </div>
            ) : (
              <div className="space-y-2">
                {wallet.linkedWallets.map((w) => (
                  <div
                    key={w.id}
                    className="p-3 rounded-xl bg-[#090B10] border border-white/[0.07] flex flex-wrap items-center justify-between gap-2"
                  >
                    <div className="flex items-center gap-2.5">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-mono border ${
                          CHAIN_BADGE[w.chain] ?? "bg-slate-800 text-slate-300 border-slate-700"
                        }`}
                      >
                        {w.chain}
                      </span>
                      <div>
                        <div className="font-mono text-xs text-white flex items-center gap-1.5">
                          {w.address.slice(0, 8)}…{w.address.slice(-6)}
                          {w.isPrimary && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#10B981]/15 text-[#10B981] border border-[#10B981]/30">
                              PRIMARY
                            </span>
                          )}
                        </div>
                        <div className="text-[10px] text-slate-500 font-mono">
                          {w.provider} · verified signature
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      {w.isVerified && (
                        <span className="flex items-center gap-1 text-[10px] font-mono text-[#10B981]">
                          <ShieldCheck className="w-3.5 h-3.5" /> VERIFIED
                        </span>
                      )}
                      <a
                        href={explorerAddressUrl(w.chain, w.address)}
                        target="_blank"
                        rel="noreferrer"
                        className="p-1.5 rounded bg-white/5 text-slate-400 hover:text-white"
                        title="View on explorer"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                      {!w.isPrimary && (
                        <button
                          onClick={() => wallet.setPrimaryWallet(w.id)}
                          className="p-1.5 rounded bg-white/5 text-slate-400 hover:text-[#10B981] cursor-pointer"
                          title="Make primary"
                        >
                          <Star className="w-3.5 h-3.5" />
                        </button>
                      )}
                      <button
                        onClick={() => wallet.unlinkWallet(w.id)}
                        className="p-1.5 rounded bg-white/5 text-slate-400 hover:text-rose-400 cursor-pointer"
                        title="Unlink wallet"
                      >
                        <Unlink className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="p-3 rounded-xl bg-[#090B10] border border-white/[0.07] text-[11px] text-slate-400 leading-relaxed">
            <strong className="text-slate-200">How live execution works:</strong> the bot only ever
            generates intents for the curated universe of verified contracts. Acting on an intent
            always requires a wallet signature, and you can inspect the swap route, slippage and gas
            in your wallet before approving. Paper mode remains available at any time.
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={onGoLive}
              disabled={!hasVerified}
              className="flex-1 py-2.5 rounded-lg bg-[#10B981] hover:bg-[#059669] disabled:bg-slate-800 disabled:text-slate-500 text-slate-950 text-xs font-bold tracking-wide flex items-center justify-center gap-2 cursor-pointer disabled:cursor-not-allowed transition"
            >
              <Radio className="w-4 h-4" />
              GO LIVE ON-CHAIN
            </button>
            <button
              onClick={onClose}
              className="px-4 py-2.5 rounded-lg bg-[#090B10] border border-white/10 text-slate-300 text-xs font-semibold hover:bg-slate-800 cursor-pointer"
            >
              Stay in Paper Mode
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
