"use client";

import { useState, useEffect, useCallback } from "react";
import QRCode from "qrcode";
import {
  X, Wallet, ShieldCheck, LockKeyhole, Copy, Check, ArrowDownLeft, ArrowUpRight,
  Plus, RefreshCw, Loader2, AlertTriangle, Radio, Fingerprint, ExternalLink, FlaskConical,
} from "lucide-react";
import type { CustodyState } from "@/lib/custody";

const usd = (cents: number) => `${cents < 0 ? "-" : ""}$${(Math.abs(cents) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function CustodyVaultModal({ open, onClose, onChanged }: { open: boolean; onClose: () => void; onChanged: () => void }) {
  const [state, setState] = useState<CustodyState | null>(null);
  const [tab, setTab] = useState("OVERVIEW");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [amount, setAmount] = useState("5");
  const [address, setAddress] = useState("");
  const [label, setLabel] = useState("");
  const [review, setReview] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const [autoSign, setAutoSign] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);
  const [maxTrade, setMaxTrade] = useState(5);
  const [dailyCap, setDailyCap] = useState(50);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/custody", { cache: "no-store" });
      const data = await res.json();
      if (res.ok) setState(data.custody);
    } catch { /* Keep last known vault state. */ }
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    const timer = setInterval(load, 15000);
    return () => clearInterval(timer);
  }, [open, load]);

  useEffect(() => {
    if (state?.wallet) {
      setAutoSign(state.wallet.autoSignEnabled);
      setMaxTrade(state.wallet.maxTradeUsd);
      setDailyCap(state.wallet.dailyTradeCapUsd);
    }
  }, [state?.wallet?.autoSignEnabled, state?.wallet?.maxTradeUsd, state?.wallet?.dailyTradeCapUsd]);

  useEffect(() => {
    let active = true;
    if (state?.wallet.address) {
      QRCode.toDataURL(state.wallet.address, { width: 160, margin: 1, color: { dark: "#10B981", light: "#FFFFFF" } }).then((url) => { if (active) setQr(url); }).catch(() => setQr(null));
    } else setQr(null);
    return () => { active = false; };
  }, [state?.wallet?.address]);

  if (!open) return null;

  const act = async (action: string, payload: Record<string, unknown> = {}) => {
    setBusy(action); setError(null); setNotice(null);
    try {
      const res = await fetch("/api/custody", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...payload }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Vault action failed");
      if (data.custody) setState(data.custody);
      setNotice(data.warning || ({ CREATE_VAULT: "Encrypted Base vault created. Your deposit address is ready.", ADD_ADDRESS: "Withdrawal destination allowlisted.", ADD_TEST_FUNDS: "Added $1,000 TEST USD. No real funds moved.", TEST_WITHDRAW: "Test withdrawal completed — no on-chain transaction.", CREATE_WITHDRAWAL: "Withdrawal reserved. Review and explicitly confirm to broadcast.", CONFIGURE_AUTO_SIGN: "Scoped signing settings saved.", AUTO_SIGN: "Swap signed and broadcast from your built-in vault.", SYNC_DEPOSITS: "Deposit scanner checked confirmed Base blocks." } as Record<string, string>)[action] || "Done");
      await onChanged();
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Vault action failed"); return false;
    } finally { setBusy(null); }
  };

  const copy = async () => {
    try { await navigator.clipboard.writeText(state?.wallet.address || ""); setCopied(true); setTimeout(() => setCopied(false), 1800); } catch { setError("Clipboard unavailable — select and copy the address manually"); }
  };

  const wallet = state?.wallet;
  const canEnable = state && state.wallet.autoSignEnabled || acknowledged && maxTrade >= 1 && maxTrade <= dailyCap;

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-[#11151F] border border-[#10B981]/30 rounded-2xl max-w-3xl w-full max-h-[92vh] overflow-y-auto shadow-2xl">
        <div className="sticky top-0 z-10 bg-[#11151F] p-5 border-b border-white/[0.08] flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#10B981]/15 border border-[#10B981]/40 flex items-center justify-center"><Wallet className="w-5 h-5 text-[#10B981]" /></div>
            <div><h2 className="font-display text-lg font-bold text-white">Built-in Crypto Vault</h2><p className="text-xs text-slate-400">Base mainnet · server-encrypted keys · session-isolated custody</p></div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white cursor-pointer"><X className="w-4 h-4" /></button>
        </div>

        <div className="p-5 space-y-4">
          <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/25 text-[11px] text-amber-200/90 leading-relaxed flex items-start gap-2"><AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" /><span>This vault uses real Base ETH. Browser sessions are not a production authentication system; use a dedicated wallet and small amounts. Deposits are native ETH only, with 12 confirmations. Never send tokens or other-chain assets to this address.</span></div>
          {(error || notice) && <div className={`p-3 rounded-lg text-xs border flex items-start gap-2 ${error ? "bg-rose-500/10 border-rose-500/30 text-rose-300" : "bg-[#10B981]/10 border-[#10B981]/30 text-[#10B981]"}`}>{error ? <AlertTriangle className="w-4 h-4 shrink-0" /> : <Check className="w-4 h-4 shrink-0" />}<span className="flex-1">{error || notice}</span><button onClick={() => { setError(null); setNotice(null); }} className="opacity-60 hover:opacity-100 cursor-pointer"><X className="w-3.5 h-3.5" /></button></div>}

          {!state ? <div className="py-10 text-center text-sm text-slate-400"><Loader2 className="w-6 h-6 animate-spin text-[#10B981] mx-auto mb-3" />Initializing secure vault session...</div> : !wallet ? (
            <div className="text-center py-10 space-y-4">
              <div className="w-16 h-16 rounded-2xl bg-[#10B981]/10 border border-[#10B981]/30 flex items-center justify-center mx-auto"><LockKeyhole className="w-7 h-7 text-[#10B981]" /></div>
              <h3 className="font-display text-xl font-semibold text-white">Your keys. Our encrypted custody.</h3>
              <p className="text-xs text-slate-400 max-w-md leading-relaxed">Create a dedicated Base vault without a browser extension. The server generates and encrypts the signing key; your browser only ever receives the public address and balance.</p>
              <button onClick={() => act("CREATE_VAULT")} disabled={busy === "CREATE_VAULT"} className="px-6 py-3 rounded-lg bg-[#10B981] hover:bg-[#059669] text-slate-950 text-xs font-bold flex items-center gap-2 mx-auto cursor-pointer">{busy === "CREATE_VAULT" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wallet className="w-4 h-4" />}Create Encrypted Vault</button>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div className="p-4 rounded-xl bg-[#090B10] border border-[#10B981]/25"><div className="text-[11px] uppercase tracking-wider text-slate-400">Available Vault Balance</div><div className="font-mono text-2xl font-bold text-[#10B981] mt-1">{usd(state.availableCents)}</div><div className="text-[10px] font-mono text-slate-500 mt-1">{state.nativeBalance} ETH on Base · ${Number(state.ethUsd).toFixed(2)}/ETH</div></div>
                <div className="p-4 rounded-xl bg-[#090B10] border border-white/[0.07]"><div className="text-[11px] uppercase tracking-wider text-slate-400 flex items-center gap-1.5"><FlaskConical className="w-3.5 h-3.5 text-[#8B5CF6]" />Test Balance (no real funds)</div><div className="font-mono text-xl font-semibold text-[#C4B5FD] mt-1">{usd(state.testBalanceCents)}</div><div className="text-[10px] font-mono text-slate-500 mt-1">Pending / reserved: {usd(state.pendingCents)}</div></div>
              </div>

              <div className="flex items-center justify-between gap-2 rounded-lg overflow-x-auto">
                <div className="flex gap-1">{[
                  { id: "OVERVIEW", label: "Overview", icon: Wallet },
                  { id: "DEPOSIT", label: "Deposit", icon: ArrowDownLeft },
                  { id: "WITHDRAW", label: "Withdraw", icon: ArrowUpRight },
                  { id: "AUTO_SIGN", label: "Auto-sign", icon: Fingerprint },
                  { id: "ACTIVITY", label: "Activity", icon: Radio },
                ].map((t) => <button key={t.id} onClick={() => { setTab(t.id); setReview(false); setError(null); }} className={`px-3 py-2 rounded-lg text-[11px] font-semibold flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${tab === t.id ? "bg-[#10B981]/15 text-[#10B981] border border-[#10B981]/40" : "text-slate-400 hover:text-slate-200"}`}><t.icon className="w-3.5 h-3.5" />{t.label}</button>)}</div>
              </div>

              {tab === "OVERVIEW" && <div className="space-y-3">
                <div className="p-4 rounded-xl bg-[#090B10] border border-white/[0.07]"><div className="flex justify-between gap-3"><div><div className="text-xs font-semibold text-white">Base Vault Address</div><div className="text-[10px] font-mono text-slate-500 mt-1">Send native ETH on Base (chain 8453)</div></div><span className="text-[10px] font-mono text-[#10B981] flex items-center gap-1"><ShieldCheck className="w-3.5 h-3.5" />ENCRYPTED</span></div><div className="flex items-center gap-2 mt-3"><code className="text-[11px] font-mono text-slate-300 break-all flex-1">{wallet.address}</code><button onClick={copy} className="p-2 rounded-lg bg-white/5 text-slate-300 hover:text-white cursor-pointer">{copied ? <Check className="w-4 h-4 text-[#10B981]" /> : <Copy className="w-4 h-4" />}</button><a href={`https://basescan.org/address/${wallet.address}`} target="_blank" rel="noreferrer" className="p-2 rounded-lg bg-white/5 text-slate-300 hover:text-white"><ExternalLink className="w-4 h-4" /></a></div></div>
                <div className="grid grid-cols-2 gap-3"><button onClick={() => setTab("DEPOSIT")} className="p-3 rounded-xl bg-[#10B981]/10 border border-[#10B981]/40 text-xs font-semibold text-[#10B981] flex items-center justify-center gap-2 cursor-pointer"><ArrowDownLeft className="w-4 h-4" />Deposit ETH</button><button onClick={() => setTab("WITHDRAW")} className="p-3 rounded-xl bg-[#11151F] border border-white/10 text-xs font-semibold text-slate-200 flex items-center justify-center gap-2 cursor-pointer"><ArrowUpRight className="w-4 h-4" />Withdraw Funds</button></div>
                <div className="p-4 rounded-xl bg-[#8B5CF6]/5 border border-[#8B5CF6]/25 space-y-3"><div className="text-xs font-semibold text-[#C4B5FD] flex items-center gap-2"><FlaskConical className="w-4 h-4" />Test the complete deposit / withdrawal flow</div><p className="text-[11px] text-slate-400 leading-relaxed">Test USD is a separate ledger for testing withdrawals. It cannot fund real on-chain trades or be withdrawn as real crypto. Use the paper bot to test strategies without real funds.</p><div className="flex flex-wrap gap-2"><button onClick={() => act("ADD_TEST_FUNDS", { amountUsd: 1000 })} disabled={busy === "ADD_TEST_FUNDS"} className="px-3 py-2 rounded-lg bg-[#8B5CF6]/20 border border-[#8B5CF6]/40 text-[#C4B5FD] text-[11px] font-semibold flex items-center gap-1.5 cursor-pointer"><Plus className="w-3.5 h-3.5" />Add $1,000 test funds</button><button onClick={() => { setTab("WITHDRAW"); setAmount("5"); }} className="px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-slate-300 text-[11px] cursor-pointer">Test withdrawal</button></div></div>
              </div>}

              {tab === "DEPOSIT" && <div className="space-y-3">
                <div className="text-center p-5 rounded-xl bg-[#090B10] border border-white/[0.07]"><div className="text-xs font-semibold text-white mb-3">Deposit ETH on Base</div>{qr && <img src={qr} alt="Base vault deposit address QR code" width={160} height={160} className="mx-auto rounded-xl p-2 bg-white" />}<code className="block text-[11px] font-mono text-slate-300 break-all mt-3">{wallet.address}</code><button onClick={copy} className="mt-3 px-4 py-2 rounded-lg bg-[#10B981]/15 border border-[#10B981]/40 text-[#10B981] text-xs font-semibold flex items-center gap-2 mx-auto cursor-pointer">{copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}{copied ? "Copied" : "Copy address"}</button></div>
                <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/25 text-[11px] text-amber-200 leading-relaxed">Only send ETH on Base. Do not send USDC, meme tokens, ETH on Ethereum mainnet, or bridged ETH from another chain. Deposits require 12 confirmations and are credited using the ETH/USD spot rate at detection.</div>
                <button onClick={() => act("SYNC_DEPOSITS")} disabled={busy === "SYNC_DEPOSITS"} className="w-full py-2.5 rounded-lg bg-[#11151F] border border-white/10 text-slate-200 text-xs font-semibold flex items-center justify-center gap-2 cursor-pointer"><RefreshCw className={`w-3.5 h-3.5 ${busy === "SYNC_DEPOSITS" ? "animate-spin" : ""}`} />Check Confirmed Deposits</button>
              </div>}

              {tab === "WITHDRAW" && <div className="space-y-3">
                <div className="p-3 rounded-xl bg-[#090B10] border border-white/[0.07] flex items-center justify-between"><span className="text-xs text-slate-300">Test mode (no real funds)</span><input type="checkbox" checked={amount.startsWith("T:")} onChange={(e) => setAmount(e.target.checked ? "T:5" : "5")} className="accent-[#8B5CF6] cursor-pointer" /></div>
                {amount.startsWith("T:") && <button onClick={() => act("ADD_TEST_FUNDS", { amountUsd: 1000 })} className="w-full py-2 rounded-lg bg-[#8B5CF6]/20 border border-[#8B5CF6]/40 text-[#C4B5FD] text-xs font-semibold cursor-pointer">Add $1,000 TEST funds</button>}
                <div className="space-y-3 p-4 rounded-xl bg-[#090B10] border border-white/[0.07]">
                  <div><label className="text-xs text-slate-300 block mb-1">Destination (Base EVM address)</label><input value={address} onChange={(e) => setAddress(e.target.value.trim())} placeholder="0x..." className="w-full px-3 py-2.5 rounded-lg bg-[#11151F] border border-white/10 text-xs font-mono text-slate-200 focus:outline-none focus:border-[#10B981]" /></div>
                  <button onClick={() => act("ADD_ADDRESS", { address, label: "My withdrawal wallet" })} disabled={!address || busy === "ADD_ADDRESS"} className="text-[11px] text-[#10B981] hover:underline disabled:opacity-40 cursor-pointer">+ Allowlist this destination</button>
                  {state.allowlist.length > 0 && <div><label className="text-xs text-slate-300 block mb-1">Verified destination</label><select value={address} onChange={(e) => setAddress(e.target.value)} className="w-full px-3 py-2 rounded-lg bg-[#11151F] border border-white/10 text-xs font-mono text-slate-200"><option value="">Choose allowlisted address</option>{state.allowlist.map((a) => <option key={a.id} value={a.address}>{a.label}: {a.address.slice(0, 8)}…{a.address.slice(-6)}</option>)}</select></div>}
                  <div><label className="text-xs text-slate-300 block mb-1">Withdrawal amount (USD)</label><input type="number" min={1} step={1} value={amount.replace("T:", "")} onChange={(e) => setAmount((amount.startsWith("T:") ? "T:" : "") + e.target.value)} className="w-full px-3 py-2.5 rounded-lg bg-[#11151F] border border-white/10 text-xs font-mono text-slate-200" /><div className="text-[10px] font-mono text-slate-500 mt-1">Available: {usd(amount.startsWith("T:") ? state.testBalanceCents : state.withdrawableCents)} · daily real withdrawal cap $100</div></div>
                  {!review ? <button onClick={async () => { if (amount.startsWith("T:")) { setReview(true); } else { const ok = await act("CREATE_WITHDRAWAL", { amountUsd: Number(amount), address }); if (ok) setReview(true); } }} disabled={!address || Number(amount.replace("T:", "")) < 1 || busy === "CREATE_WITHDRAWAL"} className="w-full py-2.5 rounded-lg bg-[#10B981] hover:bg-[#059669] text-slate-950 text-xs font-bold cursor-pointer">{amount.startsWith("T:") ? "Review Test Withdrawal" : "Create Withdrawal Quote"}</button> : <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/25 space-y-2"><div className="text-xs font-semibold text-amber-200">Confirm withdrawal of {amount.startsWith("T:") ? "TEST USD" : "real ETH"}</div><p className="text-[11px] text-slate-300">To: {address}</p><p className="text-[10px] text-slate-400">Real withdrawals include a $0.50 service fee plus network gas. Test withdrawals have no fees and never broadcast.</p><input value={confirmation} onChange={(e) => setConfirmation(e.target.value)} placeholder='Type WITHDRAW to authorize' className="w-full px-3 py-2 rounded-lg bg-[#090B10] border border-white/15 text-xs font-mono text-slate-200" /><button onClick={async () => { const ok = await act(amount.startsWith("T:") ? "TEST_WITHDRAW" : "CONFIRM_WITHDRAWAL", amount.startsWith("T:") ? { amountUsd: Number(amount.slice(2)), address } : { withdrawalId: state.withdrawals[0]?.id, confirmation }); if (ok) { setReview(false); setConfirmation(""); } }} disabled={confirmation !== "WITHDRAW" || busy === "CONFIRM_WITHDRAWAL" || busy === "TEST_WITHDRAW"} className="w-full py-2 rounded-lg bg-[#10B981] text-slate-950 text-xs font-bold flex items-center justify-center gap-2 cursor-pointer">{busy === "CONFIRM_WITHDRAWAL" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ArrowUpRight className="w-3.5 h-3.5" />}{amount.startsWith("T:") ? "Confirm TEST Withdrawal" : "Sign & Broadcast Withdrawal"}</button></div>}
                </div>
              </div>}

              {tab === "AUTO_SIGN" && <div className="space-y-3 p-4 rounded-xl bg-[#090B10] border border-white/[0.07]">
                <div className="text-xs font-semibold text-white flex items-center gap-2"><Fingerprint className="w-4 h-4 text-[#10B981]" />Scoped Server-Side Transaction Signing</div><p className="text-[11px] text-slate-400 leading-relaxed">The server can sign and broadcast approved BASE meme-coin buys on your behalf. It never signs arbitrary payloads, token approvals, or withdrawals.</p>
                <label className="flex items-start justify-between gap-3 p-3 rounded-lg bg-[#11151F] border border-white/10 text-xs text-slate-300 cursor-pointer"><span>Enable vault auto-signing<span className="block text-[10px] text-slate-500 mt-1">Only whitelisted Uniswap V2 routes and verified contracts</span></span><input type="checkbox" checked={autoSign} onChange={(e) => setAutoSign(e.target.checked)} className="mt-1 accent-[#10B981] cursor-pointer" /></label>
                <div><div className="flex justify-between text-xs mb-1"><span className="text-slate-300">Maximum per trade</span><span className="font-mono text-[#10B981]">${maxTrade.toFixed(2)}</span></div><input type="range" min={1} max={100} step={1} value={maxTrade} onChange={(e) => setMaxTrade(Number(e.target.value))} className="w-full accent-[#10B981] cursor-pointer" /></div>
                <div><div className="flex justify-between text-xs mb-1"><span className="text-slate-300">Daily signing budget</span><span className="font-mono text-[#10B981]">${dailyCap.toFixed(2)}</span></div><input type="range" min={5} max={500} step={5} value={dailyCap} onChange={(e) => setDailyCap(Number(e.target.value))} className="w-full accent-[#10B981] cursor-pointer" /></div>
                <label className="flex items-start gap-2 text-[11px] text-slate-300 cursor-pointer"><input type="checkbox" checked={acknowledged} onChange={(e) => setAcknowledged(e.target.checked)} className="mt-0.5 accent-[#10B981] cursor-pointer" /><span>I authorize this app's server to sign only approved BASE DEX buys within these limits. I understand withdrawals are never auto-signed and that crypto trades can lose money.</span></label>
                <button onClick={() => act("CONFIGURE_AUTO_SIGN", { updates: { autoSignEnabled: autoSign, maxTradeUsd: maxTrade, dailyTradeCapUsd: dailyCap, acknowledged } })} disabled={!canEnable || busy === "CONFIGURE_AUTO_SIGN"} className="w-full py-2.5 rounded-lg bg-[#10B981] hover:bg-[#059669] disabled:bg-slate-800 disabled:text-slate-500 text-slate-950 text-xs font-bold cursor-pointer">{autoSign ? "Save Scoped Signing Permissions" : "Enable Scoped Auto-Signing"}</button>
                <div className="text-[10px] font-mono text-slate-500">Approved routers: Uniswap V2 on BASE · Slippage comes from each order · Daily spent: ${(wallet.spentTodayUsd || 0).toFixed(2)}</div>
              </div>}

              {tab === "ACTIVITY" && <div className="space-y-2"><div className="flex justify-between text-[11px] text-slate-400 font-mono"><span>Vault Ledger Activity</span><button onClick={load} className="text-[#10B981] flex items-center gap-1 cursor-pointer"><RefreshCw className="w-3 h-3" />Refresh</button></div>{state.entries.length === 0 ? <div className="p-5 rounded-xl bg-[#090B10] border border-white/10 text-xs text-slate-500 font-mono">No transactions yet. Make a test deposit to explore the ledger.</div> : state.entries.map((entry) => <div key={entry.id} className="p-3 rounded-lg bg-[#090B10] border border-white/[0.07] flex items-center justify-between gap-2"><div className="flex items-center gap-2"><div className={`p-1.5 rounded-lg ${entry.amountCents >= 0 ? "bg-[#10B981]/15 text-[#10B981]" : "bg-[#8B5CF6]/15 text-[#C4B5FD]"}`}>{entry.amountCents >= 0 ? <ArrowDownLeft className="w-3.5 h-3.5" /> : <ArrowUpRight className="w-3.5 h-3.5" />}</div><div><div className="text-xs font-mono text-slate-200">{entry.kind} {entry.isTest && "· TEST"}</div><div className="text-[10px] font-mono text-slate-500">{entry.status} · balance {usd(entry.balanceAfterCents)}</div></div></div><div className={`text-xs font-mono font-semibold ${entry.amountCents >= 0 ? "text-[#10B981]" : "text-slate-300"}`}>{entry.amountCents >= 0 ? "+" : ""}{usd(entry.amountCents)}</div></div>)}</div>}

              <div className="flex items-center gap-1.5 text-[10px] font-mono text-slate-500"><LockKeyhole className="w-3 h-3 text-[#10B981]" />AES-256-GCM encrypted signing key · private key never exposed to browser</div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
