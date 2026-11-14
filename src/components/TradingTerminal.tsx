"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  Activity,
  ShieldCheck,
  ShieldAlert,
  Zap,
  Play,
  Pause,
  RefreshCw,
  TrendingUp,
  TrendingDown,
  Radar,
  Sliders,
  Terminal,
  CheckCircle2,
  XCircle,
  ArrowUpRight,
  Lock,
  Sparkles,
  Wallet,
  Award,
  Search,
  Eye,
  DollarSign,
  Flame,
  Cpu,
  Layers,
  X,
  PlusCircle,
  Radio,
  LockKeyhole,
  Fingerprint,
  Link2,
  ShieldQuestion,
} from "lucide-react";
import type {
  BotConfig,
  DiscoveredToken,
  Position,
  ExecutionLog,
  EquitySnapshot,
  LiveOrder,
  WalletRecord,
} from "@/db/schema";
import { useWallet } from "@/components/wallet/WalletProvider";
import WalletModal from "@/components/wallet/WalletModal";
import GoLiveModal from "@/components/wallet/GoLiveModal";
import CustodyVaultModal from "@/components/wallet/CustodyVaultModal";
import type { CustodyState } from "@/lib/custody";
import LiveOrdersPanel from "@/components/wallet/LiveOrdersPanel";
import { LIVE_ASSETS, LIVE_CHAINS, shortenAddress } from "@/lib/live-universe";

interface TerminalMetrics {
  totalEquityUsd: number;
  cashBalance: number;
  openCurrentValueUsd: number;
  realizedPnlUsd: number;
  unrealizedPnlUsd: number;
  totalProfitUsd: number;
  totalRoiPct: number;
  winRatePct: number;
  totalTrades: number;
  winningTrades: number;
  openPositionsCount: number;
}

interface LiveMetrics {
  verifiedWallets: number;
  liveOpenPositions: number;
  deployedUsd: number;
  pendingOrders: number;
  confirmedOrders: number;
  dailyCapRemainingUsd: number;
  mode: string;
  autoTrade: boolean;
}

interface TerminalState {
  config: BotConfig;
  metrics: TerminalMetrics;
  tokens: DiscoveredToken[];
  openPositions: Position[];
  closedPositions: Position[];
  logs: ExecutionLog[];
  snapshots: EquitySnapshot[];
  wallets: WalletRecord[];
  liveOrders: LiveOrder[];
  livePositions: Position[];
  liveMetrics: LiveMetrics;
  custody: CustodyState | null;
}

function formatUsd(val: number, decimals = 2): string {
  const abs = Math.abs(val);
  const sign = val < 0 ? "-" : "";
  return `${sign}$${abs.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })}`;
}

function formatCompactUsd(val: number): string {
  if (val >= 1_000_000) return `$${(val / 1_000_000).toFixed(2)}M`;
  if (val >= 1_000) return `$${(val / 1_000).toFixed(0)}K`;
  return `$${val.toFixed(0)}`;
}

function formatTokenPrice(price: number): string {
  if (price >= 1) return `$${price.toFixed(3)}`;
  if (price >= 0.01) return `$${price.toFixed(4)}`;
  return `$${price.toFixed(5)}`;
}

function ChainBadge({ chain }: { chain: string }) {
  const styles: Record<string, string> = {
    SOL: "bg-[#8B5CF6]/15 text-[#C4B5FD] border-[#8B5CF6]/40",
    BASE: "bg-sky-500/15 text-sky-300 border-sky-500/40",
    ETH: "bg-indigo-500/15 text-indigo-300 border-indigo-500/40",
    ARB: "bg-cyan-500/15 text-cyan-300 border-cyan-500/40",
    MULTI: "bg-emerald-500/15 text-emerald-300 border-emerald-500/40",
  };
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-mono font-semibold uppercase tracking-wider border ${
        styles[chain] ?? "bg-slate-800 text-slate-300 border-slate-700"
      }`}
    >
      {chain}
    </span>
  );
}

function CategoryBadge({ category }: { category: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    AI_MEME: {
      label: "AI MEME",
      cls: "bg-fuchsia-500/10 text-fuchsia-300 border-fuchsia-500/30",
    },
    MEME: {
      label: "MEME ALPHA",
      cls: "bg-amber-500/10 text-amber-300 border-amber-500/30",
    },
    DEFI_ALPHA: {
      label: "DEFI MOMENTUM",
      cls: "bg-emerald-500/10 text-emerald-300 border-emerald-500/30",
    },
  };
  const item = map[category] ?? {
    label: category,
    cls: "bg-slate-800 text-slate-300 border-slate-700",
  };
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-mono font-medium uppercase tracking-wider border ${item.cls}`}
    >
      {item.label}
    </span>
  );
}

function ViabilityGauge({ score, size = 46 }: { score: number; size?: number }) {
  const radius = (size - 8) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (Math.max(0, Math.min(100, score)) / 100) * circumference;

  const color =
    score >= 82
      ? "#10B981"
      : score >= 68
      ? "#8B5CF6"
      : score >= 50
      ? "#F59E0B"
      : "#F43F5E";

  return (
    <div
      className="relative inline-flex items-center justify-center shrink-0"
      style={{ width: size, height: size }}
      title={`Composite Viability Score: ${score}/100`}
    >
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="transparent"
          stroke="rgba(255,255,255,0.08)"
          strokeWidth={4}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="transparent"
          stroke={color}
          strokeWidth={4}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
        />
      </svg>
      <span
        className="absolute text-[12px] font-mono font-bold tabular-nums"
        style={{ color }}
      >
        {score}
      </span>
    </div>
  );
}

function TokenSparkline({
  dataJson,
  positive,
}: {
  dataJson: string;
  positive: boolean;
}) {
  let points: number[] = [];
  try {
    points = JSON.parse(dataJson);
  } catch {
    points = [1, 1.02, 1.01, 1.04, 1.06];
  }
  if (!Array.isArray(points) || points.length < 2) {
    points = [1, 1.02, 1.05, 1.04, 1.08];
  }

  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min || 1;
  const width = 92;
  const height = 28;

  const coords = points.map((val, idx) => {
    const x = (idx / (points.length - 1)) * width;
    const y = height - ((val - min) / range) * (height - 6) - 3;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });

  const polyline = coords.join(" ");
  const strokeColor = positive ? "#10B981" : "#F43F5E";

  return (
    <svg width={width} height={height} className="overflow-visible">
      <polyline
        fill="none"
        stroke={strokeColor}
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
        points={polyline}
      />
    </svg>
  );
}

function EquityCurveChart({ snapshots }: { snapshots: EquitySnapshot[] }) {
  if (!snapshots || snapshots.length < 2) {
    return null;
  }

  const width = 680;
  const height = 165;
  const padX = 12;
  const padY = 16;

  const allValues = snapshots.flatMap((s) => [s.totalEquityUsd, s.benchmarkUsd]);
  const minVal = Math.min(...allValues) * 0.992;
  const maxVal = Math.max(...allValues) * 1.005;
  const range = maxVal - minVal || 1;

  const toCoords = (vals: number[]) =>
    vals.map((v, i) => {
      const x = padX + (i / (vals.length - 1)) * (width - padX * 2);
      const y = height - padY - ((v - minVal) / range) * (height - padY * 2);
      return { x, y, v };
    });

  const eqCoords = toCoords(snapshots.map((s) => s.totalEquityUsd));
  const benchCoords = toCoords(snapshots.map((s) => s.benchmarkUsd));

  const eqLine = eqCoords.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
  const benchLine = benchCoords.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");

  const areaPoints = `${eqCoords[0].x.toFixed(1)},${height - padY} ${eqLine} ${eqCoords[
    eqCoords.length - 1
  ].x.toFixed(1)},${height - padY}`;

  const latestEq = snapshots[snapshots.length - 1]?.totalEquityUsd ?? 10000;
  const firstEq = snapshots[0]?.totalEquityUsd ?? 10000;
  const netGain = latestEq - firstEq;

  return (
    <div className="relative w-full">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-4 text-xs">
          <span className="inline-flex items-center gap-1.5 text-slate-300 font-medium">
            <span className="w-2.5 h-2.5 rounded-full bg-[#10B981] inline-block" />
            Autonomous Vault Equity
          </span>
          <span className="inline-flex items-center gap-1.5 text-slate-400">
            <span className="w-2.5 h-0.5 bg-[#8B5CF6] inline-block" />
            Market Hold Benchmark
          </span>
        </div>
        <div className="text-xs font-mono text-[#10B981]">
          Session Alpha: +{formatUsd(Math.max(0, netGain))} Outperformance
        </div>
      </div>

      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full h-40 overflow-visible bg-[#090B10]/60 rounded-lg border border-white/[0.05] p-1"
      >
        <defs>
          <linearGradient id="equityAreaGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#10B981" stopOpacity="0.32" />
            <stop offset="100%" stopColor="#10B981" stopOpacity="0.0" />
          </linearGradient>
        </defs>

        {/* Horizontal reference lines */}
        {[0.25, 0.5, 0.75].map((ratio, idx) => (
          <line
            key={idx}
            x1={padX}
            x2={width - padX}
            y1={height * ratio}
            y2={height * ratio}
            stroke="rgba(255,255,255,0.04)"
            strokeDasharray="4 4"
          />
        ))}

        {/* Benchmark line */}
        <polyline
          fill="none"
          stroke="#8B5CF6"
          strokeWidth="1.5"
          strokeDasharray="5 4"
          strokeOpacity="0.7"
          points={benchLine}
        />

        {/* Equity Area + Line */}
        <polygon fill="url(#equityAreaGrad)" points={areaPoints} />
        <polyline
          fill="none"
          stroke="#10B981"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          points={eqLine}
        />

        {/* Latest pulse node */}
        {eqCoords.length > 0 && (
          <g>
            <circle
              cx={eqCoords[eqCoords.length - 1].x}
              cy={eqCoords[eqCoords.length - 1].y}
              r="5"
              fill="#10B981"
              fillOpacity="0.3"
            />
            <circle
              cx={eqCoords[eqCoords.length - 1].x}
              cy={eqCoords[eqCoords.length - 1].y}
              r="2.8"
              fill="#10B981"
            />
          </g>
        )}
      </svg>

      <div className="flex justify-between text-[10px] font-mono text-slate-500 mt-1 px-1">
        {snapshots
          .filter((_, i) => i % 3 === 0 || i === snapshots.length - 1)
          .map((s) => (
            <span key={s.id}>{s.label}</span>
          ))}
      </div>
    </div>
  );
}

export default function TradingTerminal() {
  const wallet = useWallet();
  const [state, setState] = useState<TerminalState | null>(null);
  const [loading, setLoading] = useState(true);
  const [isTicking, setIsTicking] = useState(false);
  const [actionBusy, setActionBusy] = useState<string | null>(null);
  const [walletModalOpen, setWalletModalOpen] = useState(false);
  const [goLiveOpen, setGoLiveOpen] = useState(false);
  const [custodyOpen, setCustodyOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState<{
    text: string;
    type: "success" | "info" | "warning";
  } | null>(null);

  // Filters for Viable Coin Discovery Radar
  const [chainFilter, setChainFilter] = useState<string>("ALL");
  const [categoryFilter, setCategoryFilter] = useState<string>("ALL");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [hideRejected, setHideRejected] = useState<boolean>(false);

  // Active vs Closed positions tab
  const [positionTab, setPositionTab] = useState<"OPEN" | "CLOSED">("OPEN");

  // Execution log filter
  const [logFilter, setLogFilter] = useState<"ALL" | "TRADES" | "AUDITS" | "ALERTS">("ALL");

  // Selected token for Contract & Viability Audit Modal
  const [inspectedToken, setInspectedToken] = useState<DiscoveredToken | null>(null);
  const [customSnipeUsd, setCustomSnipeUsd] = useState<number>(450);

  // Local editable strategy sliders
  const [localConfig, setLocalConfig] = useState<{
    maxPositionUsd: number;
    minViabilityScore: number;
    takeProfitPct: number;
    stopLossPct: number;
    minLiquidityUsd: number;
    requireLpLocked: boolean;
    autoCompound: boolean;
    liveMaxTradeUsd: number;
    liveSlippagePct: number;
    liveDailyCapUsd: number;
    liveAutoTrade: boolean;
  } | null>(null);

  const showToast = useCallback(
    (text: string, type: "success" | "info" | "warning" = "success") => {
      setToastMessage({ text, type });
      setTimeout(() => {
        setToastMessage((prev) => (prev?.text === text ? null : prev));
      }, 3600);
    },
    []
  );

  const fetchTerminal = useCallback(async () => {
    try {
      const res = await fetch("/api/terminal", { cache: "no-store" });
      if (!res.ok) throw new Error("Failed to fetch state");
      const data: TerminalState = await res.json();
      setState(data);
      setLocalConfig((prev) =>
        prev ?? {
          maxPositionUsd: data.config.maxPositionUsd,
          minViabilityScore: data.config.minViabilityScore,
          takeProfitPct: data.config.takeProfitPct,
          stopLossPct: data.config.stopLossPct,
          minLiquidityUsd: data.config.minLiquidityUsd,
          requireLpLocked: data.config.requireLpLocked,
          autoCompound: data.config.autoCompound,
          liveMaxTradeUsd: data.config.liveMaxTradeUsd,
          liveSlippagePct: data.config.liveSlippagePct,
          liveDailyCapUsd: data.config.liveDailyCapUsd,
          liveAutoTrade: data.config.liveAutoTrade,
        }
      );
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTerminal();
  }, [fetchTerminal]);

  // Autonomous live tick interval when bot is running
  useEffect(() => {
    if (!state?.config.isRunning) return;

    const timer = setInterval(async () => {
      if (isTicking || actionBusy) return;
      setIsTicking(true);
      try {
        const res = await fetch("/api/terminal", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "TICK" }),
        });
        if (res.ok) {
          const updated: TerminalState = await res.json();
          setState(updated);
        }
      } catch (err) {
        console.error("Auto-tick error:", err);
      } finally {
        setIsTicking(false);
      }
    }, 4500);

    return () => clearInterval(timer);
  }, [state?.config.isRunning, isTicking, actionBusy]);

  const handleToggleEngine = async () => {
    if (!state) return;
    const nextRun = !state.config.isRunning;
    setActionBusy("TOGGLE_ENGINE");
    try {
      const res = await fetch("/api/terminal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "UPDATE_CONFIG",
          updates: { isRunning: nextRun },
        }),
      });
      if (res.ok) {
        const data: TerminalState = await res.json();
        setState(data);
        showToast(
          nextRun
            ? "Autonomous Engine ACTIVE — Scanning & trading viable coins"
            : "Autonomous Engine PAUSED — Open positions held in manual custody",
          nextRun ? "success" : "warning"
        );
      }
    } finally {
      setActionBusy(null);
    }
  };

  const handleSelectPreset = async (
    preset: "SAFE_MOMENTUM" | "MEME_SNIPER" | "DEGEN_SCALPER"
  ) => {
    const presets = {
      SAFE_MOMENTUM: {
        strategyPreset: "SAFE_MOMENTUM",
        maxPositionUsd: 350,
        minViabilityScore: 86,
        takeProfitPct: 24,
        stopLossPct: 8,
        minLiquidityUsd: 120000,
        requireLpLocked: true,
      },
      MEME_SNIPER: {
        strategyPreset: "MEME_SNIPER",
        maxPositionUsd: 450,
        minViabilityScore: 78,
        takeProfitPct: 32,
        stopLossPct: 12,
        minLiquidityUsd: 45000,
        requireLpLocked: true,
      },
      DEGEN_SCALPER: {
        strategyPreset: "DEGEN_SCALPER",
        maxPositionUsd: 650,
        minViabilityScore: 70,
        takeProfitPct: 55,
        stopLossPct: 18,
        minLiquidityUsd: 25000,
        requireLpLocked: true,
      },
    };
    const chosen = presets[preset];
    setLocalConfig((prev) => (prev ? { ...prev, ...chosen } : null));
    setActionBusy("PRESET");
    try {
      const res = await fetch("/api/terminal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "UPDATE_CONFIG",
          updates: chosen,
        }),
      });
      if (res.ok) {
        const data: TerminalState = await res.json();
        setState(data);
        showToast(`Switched strategy profile to ${preset.replace("_", " ")}`, "info");
      }
    } finally {
      setActionBusy(null);
    }
  };

  const handleSaveCustomConfig = async () => {
    if (!localConfig) return;
    setActionBusy("SAVE_CONFIG");
    try {
      const res = await fetch("/api/terminal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "UPDATE_CONFIG",
          updates: localConfig,
        }),
      });
      if (res.ok) {
        const data: TerminalState = await res.json();
        setState(data);
        showToast("Updated autonomous risk guardrails & viability filters", "success");
      }
    } finally {
      setActionBusy(null);
    }
  };

  const handleScanMempool = async () => {
    setActionBusy("SCAN");
    try {
      const res = await fetch("/api/terminal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "SCAN_MEMPOOL" }),
      });
      if (res.ok) {
        const data: TerminalState = await res.json();
        setState(data);
        showToast("Mempool scan complete — New token audited & added to radar", "info");
      }
    } finally {
      setActionBusy(null);
    }
  };

  const handleForceCycle = async () => {
    setActionBusy("FORCE_CYCLE");
    try {
      const res = await fetch("/api/terminal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "TICK", forceTrade: true }),
      });
      if (res.ok) {
        const data: TerminalState = await res.json();
        setState(data);
        showToast(
          "Executed autonomous trade cycle — Checked TP/SL & sniped top viable coin",
          "success"
        );
      }
    } finally {
      setActionBusy(null);
    }
  };

  const handleManualSnipe = async (token: DiscoveredToken, amountUsd?: number) => {
    setActionBusy(`SNIPE_${token.id}`);
    try {
      const res = await fetch("/api/terminal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "SNIPE",
          tokenId: token.id,
          amountUsd: amountUsd ?? state?.config.maxPositionUsd,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setState(data);
        setInspectedToken(null);
        showToast(
          `Sniped $${token.symbol} on ${token.chain} (${formatUsd(
            amountUsd ?? state?.config.maxPositionUsd ?? 450
          )})`,
          "success"
        );
      } else {
        showToast(data.error || "Unable to snipe token", "warning");
      }
    } finally {
      setActionBusy(null);
    }
  };

  const handleClosePosition = async (pos: Position) => {
    setActionBusy(`CLOSE_${pos.id}`);
    try {
      const res = await fetch("/api/terminal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "CLOSE_POSITION",
          positionId: pos.id,
        }),
      });
      if (res.ok) {
        const data: TerminalState = await res.json();
        setState(data);
        showToast(
          `Closed $${pos.symbol} position — Realized ${
            pos.pnlUsd >= 0 ? "+" : ""
          }${formatUsd(pos.pnlUsd)}`,
          pos.pnlUsd >= 0 ? "success" : "info"
        );
      }
    } finally {
      setActionBusy(null);
    }
  };

  const handleTopUpVault = async () => {
    setActionBusy("TOP_UP");
    try {
      const res = await fetch("/api/terminal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "TOP_UP_VAULT", amountUsd: 2500 }),
      });
      if (res.ok) {
        const data: TerminalState = await res.json();
        setState(data);
        showToast("Added +$2,500.00 paper liquidity to Autonomous Vault", "success");
      }
    } finally {
      setActionBusy(null);
    }
  };

  const handleModeSwitch = async (mode: "PAPER" | "LIVE") => {
    if (!state) return;
    if (mode === "LIVE") {
      const verified = state.wallets.filter((w) => w.isVerified);
      if (verified.length === 0) {
        setWalletModalOpen(true);
        showToast("Link & verify a wallet before going live", "warning");
        return;
      }
      setGoLiveOpen(true);
      return;
    }

    setActionBusy("MODE");
    try {
      const res = await fetch("/api/terminal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "UPDATE_CONFIG", updates: { tradingMode: "PAPER" } }),
      });
      if (res.ok) {
        const data: TerminalState = await res.json();
        setState(data);
        showToast("Switched to PAPER mode — no on-chain transactions will be requested", "info");
      }
    } finally {
      setActionBusy(null);
    }
  };

  const handleWalletRefresh = async () => {
    await wallet.refreshWallets();
    await fetchTerminal();
  };

  const liveEquivalent = (symbol: string) =>
    LIVE_ASSETS.find((a) => a.radarSymbol?.toUpperCase() === symbol.toUpperCase());

  const handleLiveIntent = async (token: DiscoveredToken) => {
    const asset = liveEquivalent(token.symbol);
    if (!asset) {
      showToast(
        `$${token.symbol} has no verified on-chain contract in the live universe — paper only`,
        "warning"
      );
      return;
    }
    if (!state) return;
    setActionBusy(`LIVE_${token.id}`);
    try {
      const res = await fetch("/api/wallet/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "CREATE",
          assetSymbol: asset.symbol,
          amountUsd: state.config.liveMaxTradeUsd,
          reason: `Radar signal $${token.symbol} mapped to verified contract $${asset.symbol} (${asset.chain}). Signed execution required.`,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not queue live intent");
      setState(data.state);
      showToast(
        `Live intent queued for $${asset.symbol} — sign it in On-Chain Execution`,
        "info"
      );
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Live intent failed", "warning");
    } finally {
      setActionBusy(null);
    }
  };

  const filteredTokens = useMemo(() => {
    if (!state) return [];
    return state.tokens.filter((t) => {
      if (chainFilter !== "ALL" && t.chain !== chainFilter) return false;
      if (categoryFilter !== "ALL" && t.category !== categoryFilter) return false;
      if (hideRejected && t.status === "REJECTED") return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        return (
          t.symbol.toLowerCase().includes(q) ||
          t.name.toLowerCase().includes(q) ||
          t.chain.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [state, chainFilter, categoryFilter, hideRejected, searchQuery]);

  const filteredLogs = useMemo(() => {
    if (!state) return [];
    return state.logs.filter((l) => {
      if (logFilter === "TRADES") {
        return (
          l.level === "BUY" ||
          l.level === "SELL_TP" ||
          l.level === "SELL_SL" ||
          l.level === "LIVE"
        );
      }
      if (logFilter === "AUDITS") {
        return l.level === "AUDIT" || l.level === "SCAN";
      }
      if (logFilter === "ALERTS") {
        return l.level === "REJECT" || l.level === "SYSTEM" || l.level === "WALLET";
      }
      return true;
    });
  }, [state, logFilter]);

  if (loading || !state || !localConfig) {
    return (
      <div className="min-h-screen bg-[#090B10] text-[#F1F5F9] flex flex-col items-center justify-center p-6">
        <div className="w-14 h-14 rounded-2xl bg-[#11151F] border border-[#10B981]/40 flex items-center justify-center mb-4 shadow-[0_0_30px_-5px_rgba(16,185,129,0.4)]">
          <Radar className="w-7 h-7 text-[#10B981] animate-spin" />
        </div>
        <h1 className="font-display text-xl font-bold tracking-tight">
          INITIALIZING VORTEX // ALPHA TERMINAL
        </h1>
        <p className="text-sm text-slate-400 font-mono mt-1">
          Connecting to multi-chain DEX liquidity indexers & autonomous execution engine...
        </p>
      </div>
    );
  }

  const { config, metrics } = state;

  return (
    <div className="min-h-screen flex flex-col bg-[#090B10] text-[#F1F5F9]">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-5 right-5 z-50 max-w-md animate-in fade-in slide-in-from-bottom-3">
          <div
            className={`px-4 py-3 rounded-xl border backdrop-blur-md shadow-2xl flex items-center gap-3 text-sm font-medium ${
              toastMessage.type === "success"
                ? "bg-[#11151F]/95 border-[#10B981]/50 text-[#10B981]"
                : toastMessage.type === "warning"
                ? "bg-[#11151F]/95 border-amber-500/50 text-amber-300"
                : "bg-[#11151F]/95 border-[#8B5CF6]/50 text-[#C4B5FD]"
            }`}
          >
            <Zap className="w-4 h-4 shrink-0" />
            <span>{toastMessage.text}</span>
          </div>
        </div>
      )}

      {/* TOP COMMAND HEADER */}
      <header className="sticky top-0 z-30 border-b border-white/[0.08] bg-[#090B10]/90 backdrop-blur-md">
        <div className="max-w-[1600px] mx-auto px-4 lg:px-6 h-auto min-h-16 py-2.5 flex flex-wrap items-center justify-between gap-4">
          {/* Left: Brand + Autonomous Engine Heartbeat */}
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#10B981]/20 to-[#8B5CF6]/20 border border-[#10B981]/40 flex items-center justify-center shadow-[0_0_20px_-5px_rgba(16,185,129,0.4)]">
                <Radar className="w-5 h-5 text-[#10B981]" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-display font-bold text-base tracking-tight text-white">
                    VORTEX // ALPHA
                  </span>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#8B5CF6]/15 text-[#C4B5FD] border border-[#8B5CF6]/30">
                    v4.2 AUTONOMOUS
                  </span>
                </div>
                <p className="text-xs text-slate-400 hidden sm:block">
                  Multi-Chain Viable Crypto & Meme-Coin Sniper Engine
                </p>
              </div>
            </div>

            {/* Live Status Pill */}
            <div
              className={`flex items-center gap-2.5 px-3 py-1.5 rounded-full border text-xs font-mono ${
                config.isRunning
                  ? "bg-[#10B981]/10 border-[#10B981]/40 text-[#10B981]"
                  : "bg-amber-500/10 border-amber-500/40 text-amber-300"
              }`}
            >
              <span className="relative flex h-2.5 w-2.5">
                {config.isRunning && (
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#10B981] opacity-75" />
                )}
                <span
                  className={`relative inline-flex rounded-full h-2.5 w-2.5 ${
                    config.isRunning ? "bg-[#10B981]" : "bg-amber-400"
                  }`}
                />
              </span>
              <span className="font-semibold">
                {config.isRunning ? "BOT ENGINE ACTIVE" : "BOT ENGINE PAUSED"}
              </span>
              {isTicking && (
                <RefreshCw className="w-3.5 h-3.5 animate-spin text-[#10B981]" />
              )}
            </div>
          </div>

          {/* Center: Strategy Mode Quick Switcher */}
          <div className="hidden xl:flex items-center bg-[#11151F] p-1 rounded-lg border border-white/[0.07]">
            {(
              [
                { id: "SAFE_MOMENTUM", label: "Safe Momentum" },
                { id: "MEME_SNIPER", label: "Meme Sniper" },
                { id: "DEGEN_SCALPER", label: "Degen Scalper" },
              ] as const
            ).map((mode) => {
              const active = config.strategyPreset === mode.id;
              return (
                <button
                  key={mode.id}
                  onClick={() => handleSelectPreset(mode.id)}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                    active
                      ? "bg-[#10B981]/15 text-[#10B981] border border-[#10B981]/40 shadow-sm"
                      : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  {mode.label}
                </button>
              );
            })}
          </div>

          {/* Right: Action Controls & Master Start/Stop Toggle */}
          <div className="flex flex-wrap items-center gap-2.5">
            {/* Mode switch: Paper vs Live on-chain */}
            <div className="flex items-center bg-[#11151F] p-1 rounded-lg border border-white/[0.07]">
              <button
                onClick={() => handleModeSwitch("PAPER")}
                className={`px-2.5 py-1.5 rounded-md text-[11px] font-semibold transition cursor-pointer ${
                  config.tradingMode !== "LIVE"
                    ? "bg-[#10B981]/15 text-[#10B981] border border-[#10B981]/40"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                PAPER
              </button>
              <button
                onClick={() => handleModeSwitch("LIVE")}
                className={`px-2.5 py-1.5 rounded-md text-[11px] font-semibold transition cursor-pointer flex items-center gap-1 ${
                  config.tradingMode === "LIVE"
                    ? "bg-rose-500/20 text-rose-300 border border-rose-500/40"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                <Radio className="w-3 h-3" />
                LIVE
              </button>
            </div>

            <button onClick={() => setCustodyOpen(true)} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-mono bg-[#11151F] border border-[#10B981]/30 text-[#10B981] hover:bg-[#10B981]/10 cursor-pointer" title="Encrypted built-in vault: deposit, withdraw and scoped auto-signing"><LockKeyhole className="w-3.5 h-3.5" />Built-in Vault</button>

            {/* Wallet connect pill */}
            <button
              onClick={() => setWalletModalOpen(true)}
              className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-mono transition cursor-pointer border ${
                wallet.evmAddress || wallet.solanaAddress
                  ? "bg-[#10B981]/10 border-[#10B981]/40 text-[#10B981] hover:bg-[#10B981]/20"
                  : "bg-[#11151F] border-white/10 text-slate-200 hover:border-[#10B981]/50"
              }`}
              title="Manage live wallets, networks and on-chain permissions"
            >
              {wallet.evmAddress || wallet.solanaAddress ? (
                <>
                  <span className="w-2 h-2 rounded-full bg-[#10B981] animate-pulse" />
                  {shortenAddress(wallet.evmAddress || wallet.solanaAddress || "")}
                  {wallet.evmChainKey && (
                    <span className="text-[10px] px-1 rounded bg-white/10">
                      {LIVE_CHAINS[wallet.evmChainKey].key}
                    </span>
                  )}
                </>
              ) : (
                <>
                  <Wallet className="w-3.5 h-3.5" />
                  Connect Wallet
                </>
              )}
            </button>

            <button
              onClick={handleScanMempool}
              disabled={actionBusy === "SCAN"}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium bg-[#11151F] hover:bg-slate-800/80 text-slate-200 border border-white/10 transition cursor-pointer"
              title="Discover and audit a fresh token from on-chain mempool"
            >
              <Sparkles className="w-3.5 h-3.5 text-[#8B5CF6]" />
              <span>{actionBusy === "SCAN" ? "Scanning..." : "Scan Mempool"}</span>
            </button>

            <button
              onClick={handleForceCycle}
              disabled={actionBusy === "FORCE_CYCLE"}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium bg-[#8B5CF6]/15 hover:bg-[#8B5CF6]/25 text-[#C4B5FD] border border-[#8B5CF6]/40 transition cursor-pointer"
              title="Immediately evaluate viable coins and execute an autonomous trade cycle"
            >
              <Zap className="w-3.5 h-3.5 text-[#C4B5FD]" />
              <span>
                {actionBusy === "FORCE_CYCLE" ? "Executing..." : "Run Trade Cycle"}
              </span>
            </button>

            <button
              onClick={handleTopUpVault}
              disabled={actionBusy === "TOP_UP"}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-mono font-medium bg-[#11151F] hover:bg-slate-800 text-slate-300 border border-white/10 transition cursor-pointer"
              title="Add +$2,500 paper capital to test scaling up positions"
            >
              <PlusCircle className="w-3.5 h-3.5 text-[#10B981]" />
              <span>+$2.5k Vault</span>
            </button>

            <button
              onClick={handleToggleEngine}
              disabled={actionBusy === "TOGGLE_ENGINE"}
              className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold tracking-wide transition cursor-pointer ${
                config.isRunning
                  ? "bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 border border-rose-500/40"
                  : "bg-[#10B981] hover:bg-[#059669] text-slate-950 shadow-[0_0_20px_-5px_rgba(16,185,129,0.6)]"
              }`}
            >
              {config.isRunning ? (
                <>
                  <Pause className="w-3.5 h-3.5" />
                  <span>PAUSE BOT</span>
                </>
              ) : (
                <>
                  <Play className="w-3.5 h-3.5 fill-current" />
                  <span>RESUME BOT</span>
                </>
              )}
            </button>
          </div>
        </div>
      </header>

      {/* MAIN CONTENT CONTAINER */}
      <main className="flex-1 max-w-[1600px] w-full mx-auto px-4 lg:px-6 py-5 space-y-5">
        {/* 4-CARD KPI TELEMETRY STRIP */}
        <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Card 1: Total Portfolio Equity */}
          <div className="bg-[#11151F]/90 backdrop-blur-md rounded-xl p-5 border border-white/[0.07] relative overflow-hidden">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium uppercase tracking-wider text-slate-400">
                Total Autonomous Equity
              </span>
              <Wallet className="w-4 h-4 text-[#10B981]" />
            </div>
            <div className="text-2xl lg:text-3xl font-display font-bold font-mono tabular-nums text-white">
              {formatUsd(metrics.totalEquityUsd)}
            </div>
            <div className="mt-2.5 flex items-center justify-between text-xs font-mono text-slate-400">
              <span>Vault Cash: {formatUsd(metrics.cashBalance)}</span>
              <span className="text-slate-300">
                In Trades: {formatUsd(metrics.openCurrentValueUsd)}
              </span>
            </div>
            <div className="mt-1.5 flex items-center justify-between text-[11px] font-mono">
              <span className="text-slate-500">
                On-chain deployed: {formatUsd(state.liveMetrics?.deployedUsd ?? 0)}
              </span>
              <span
                className={
                  config.tradingMode === "LIVE" ? "text-rose-300" : "text-slate-500"
                }
              >
                {config.tradingMode === "LIVE" ? "LIVE MODE" : "PAPER MODE"}
              </span>
            </div>
          </div>

          {/* Card 2: Total Net Profit Generated */}
          <div className="bg-[#11151F]/90 backdrop-blur-md rounded-xl p-5 border border-[#10B981]/30 shadow-[0_0_25px_-10px_rgba(16,185,129,0.25)] relative overflow-hidden">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium uppercase tracking-wider text-slate-400">
                Total Bot Profit & ROI
              </span>
              <TrendingUp className="w-4 h-4 text-[#10B981]" />
            </div>
            <div className="flex items-baseline gap-2.5">
              <span
                className={`text-2xl lg:text-3xl font-display font-bold font-mono tabular-nums ${
                  metrics.totalProfitUsd >= 0 ? "text-[#10B981]" : "text-rose-400"
                }`}
              >
                {metrics.totalProfitUsd >= 0 ? "+" : ""}
                {formatUsd(metrics.totalProfitUsd)}
              </span>
              <span className="px-2 py-0.5 rounded text-xs font-mono font-semibold bg-[#10B981]/15 text-[#10B981] border border-[#10B981]/30">
                {metrics.totalRoiPct >= 0 ? "+" : ""}
                {metrics.totalRoiPct.toFixed(2)}%
              </span>
            </div>
            <div className="mt-2.5 flex items-center justify-between text-xs font-mono text-slate-400">
              <span>
                Realized:{" "}
                <strong className="text-[#10B981]">
                  +{formatUsd(metrics.realizedPnlUsd)}
                </strong>
              </span>
              <span>
                Open PnL:{" "}
                <strong
                  className={
                    metrics.unrealizedPnlUsd >= 0 ? "text-[#10B981]" : "text-rose-400"
                  }
                >
                  {metrics.unrealizedPnlUsd >= 0 ? "+" : ""}
                  {formatUsd(metrics.unrealizedPnlUsd)}
                </strong>
              </span>
            </div>
          </div>

          {/* Card 3: Autonomous Win Rate & Execution */}
          <div className="bg-[#11151F]/90 backdrop-blur-md rounded-xl p-5 border border-white/[0.07]">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium uppercase tracking-wider text-slate-400">
                Bot Win Rate & Targets
              </span>
              <Award className="w-4 h-4 text-[#8B5CF6]" />
            </div>
            <div className="flex items-baseline gap-2.5">
              <span className="text-2xl lg:text-3xl font-display font-bold font-mono tabular-nums text-white">
                {metrics.winRatePct.toFixed(1)}%
              </span>
              <span className="text-xs font-mono text-slate-400">
                ({metrics.winningTrades}W / {metrics.totalTrades - metrics.winningTrades}L)
              </span>
            </div>
            <div className="mt-2.5 flex items-center justify-between text-xs font-mono text-slate-400">
              <span className="text-[#10B981]">Auto TP: +{config.takeProfitPct}%</span>
              <span className="text-rose-400">Auto SL: -{config.stopLossPct}%</span>
            </div>
          </div>

          {/* Card 4: Viability Radar & Anti-Rug Shield */}
          <div className="bg-[#11151F]/90 backdrop-blur-md rounded-xl p-5 border border-white/[0.07]">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium uppercase tracking-wider text-slate-400">
                Viability & Anti-Rug Shield
              </span>
              <ShieldCheck className="w-4 h-4 text-[#10B981]" />
            </div>
            <div className="flex items-baseline gap-2.5">
              <span className="text-2xl lg:text-3xl font-display font-bold font-mono tabular-nums text-white">
                {state.tokens.filter((t) => t.viabilityScore >= config.minViabilityScore).length}{" "}
                <span className="text-base font-normal text-slate-400">
                  / {state.tokens.length} Viable
                </span>
              </span>
            </div>
            <div className="mt-2.5 flex items-center justify-between text-xs font-mono text-slate-400">
              <span>Min Score: &ge;{config.minViabilityScore}/100</span>
              <span className="text-amber-300">
                {state.tokens.filter((t) => !t.isHoneypotSafe).length} Rugs Blocked
              </span>
            </div>
          </div>
        </section>

        {/* 3-ZONE ASYMMETRIC BENTO GRID */}
        <section className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
          {/* LEFT COLUMN (3 COLS): BOT STRATEGY & RISK GUARDRAILS */}
          <div className="lg:col-span-3 space-y-5">
            <div className="bg-[#11151F]/90 backdrop-blur-md rounded-xl border border-white/[0.07] p-5 space-y-5">
              <div className="flex items-center justify-between border-b border-white/[0.06] pb-3.5">
                <div className="flex items-center gap-2">
                  <Sliders className="w-4 h-4 text-[#8B5CF6]" />
                  <h2 className="font-display font-semibold text-base tracking-tight">
                    Autonomous Strategy
                  </h2>
                </div>
                <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-[#10B981]/10 text-[#10B981] border border-[#10B981]/30">
                  {config.strategyPreset.replace("_", " ")}
                </span>
              </div>

              {/* Strategy Preset Selector */}
              <div className="space-y-2">
                <label className="text-xs font-medium text-slate-400 block">
                  Execution Profile Preset
                </label>
                <div className="grid grid-cols-1 gap-2">
                  {(
                    [
                      {
                        id: "SAFE_MOMENTUM",
                        title: "Safe Momentum",
                        desc: "Score ≥ 86 • Liquidity ≥ $120k • +24% TP / -8% SL",
                      },
                      {
                        id: "MEME_SNIPER",
                        title: "Meme Alpha Sniper",
                        desc: "Score ≥ 78 • Liquidity ≥ $45k • +32% TP / -12% SL",
                      },
                      {
                        id: "DEGEN_SCALPER",
                        title: "High-Velocity Scalper",
                        desc: "Score ≥ 70 • Early breakouts • +55% TP / -18% SL",
                      },
                    ] as const
                  ).map((p) => {
                    const isSelected = config.strategyPreset === p.id;
                    return (
                      <button
                        key={p.id}
                        onClick={() => handleSelectPreset(p.id)}
                        className={`w-full text-left p-3 rounded-lg border transition cursor-pointer ${
                          isSelected
                            ? "bg-[#10B981]/10 border-[#10B981]/50 text-white"
                            : "bg-[#090B10]/60 border-white/[0.06] text-slate-300 hover:border-white/15"
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-semibold">{p.title}</span>
                          {isSelected && (
                            <span className="text-[10px] font-mono text-[#10B981] font-semibold">
                              ACTIVE
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] font-mono text-slate-400 mt-1">
                          {p.desc}
                        </p>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Custom Sliders */}
              <div className="space-y-4 pt-1">
                <div>
                  <div className="flex justify-between text-xs mb-1.5">
                    <span className="text-slate-300">Trade Size Allocation</span>
                    <span className="font-mono font-semibold text-[#10B981]">
                      ${localConfig.maxPositionUsd} / trade
                    </span>
                  </div>
                  <input
                    type="range"
                    min={100}
                    max={1500}
                    step={50}
                    value={localConfig.maxPositionUsd}
                    onChange={(e) =>
                      setLocalConfig({
                        ...localConfig,
                        maxPositionUsd: Number(e.target.value),
                      })
                    }
                    className="w-full accent-[#10B981] cursor-pointer"
                  />
                </div>

                <div>
                  <div className="flex justify-between text-xs mb-1.5">
                    <span className="text-slate-300">Min Viability Score Gate</span>
                    <span className="font-mono font-semibold text-[#C4B5FD]">
                      {localConfig.minViabilityScore} / 100
                    </span>
                  </div>
                  <input
                    type="range"
                    min={55}
                    max={94}
                    step={1}
                    value={localConfig.minViabilityScore}
                    onChange={(e) =>
                      setLocalConfig({
                        ...localConfig,
                        minViabilityScore: Number(e.target.value),
                      })
                    }
                    className="w-full accent-[#8B5CF6] cursor-pointer"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <div className="flex justify-between text-xs mb-1.5">
                      <span className="text-slate-300">Take-Profit</span>
                      <span className="font-mono font-semibold text-[#10B981]">
                        +{localConfig.takeProfitPct}%
                      </span>
                    </div>
                    <input
                      type="range"
                      min={10}
                      max={80}
                      step={2}
                      value={localConfig.takeProfitPct}
                      onChange={(e) =>
                        setLocalConfig({
                          ...localConfig,
                          takeProfitPct: Number(e.target.value),
                        })
                      }
                      className="w-full accent-[#10B981] cursor-pointer"
                    />
                  </div>

                  <div>
                    <div className="flex justify-between text-xs mb-1.5">
                      <span className="text-slate-300">Stop-Loss</span>
                      <span className="font-mono font-semibold text-rose-400">
                        -{localConfig.stopLossPct}%
                      </span>
                    </div>
                    <input
                      type="range"
                      min={5}
                      max={30}
                      step={1}
                      value={localConfig.stopLossPct}
                      onChange={(e) =>
                        setLocalConfig({
                          ...localConfig,
                          stopLossPct: Number(e.target.value),
                        })
                      }
                      className="w-full accent-rose-500 cursor-pointer"
                    />
                  </div>
                </div>

                <div>
                  <div className="flex justify-between text-xs mb-1.5">
                    <span className="text-slate-300">Min Pool Liquidity</span>
                    <span className="font-mono font-semibold text-slate-200">
                      {formatCompactUsd(localConfig.minLiquidityUsd)}
                    </span>
                  </div>
                  <input
                    type="range"
                    min={20000}
                    max={250000}
                    step={5000}
                    value={localConfig.minLiquidityUsd}
                    onChange={(e) =>
                      setLocalConfig({
                        ...localConfig,
                        minLiquidityUsd: Number(e.target.value),
                      })
                    }
                    className="w-full accent-[#10B981] cursor-pointer"
                  />
                </div>
              </div>

              {/* Security Checkboxes */}
              <div className="space-y-2.5 pt-2 border-t border-white/[0.06]">
                <label className="flex items-center justify-between text-xs text-slate-300 cursor-pointer">
                  <span className="flex items-center gap-2">
                    <Lock className="w-3.5 h-3.5 text-[#10B981]" />
                    Require Locked / Burned LP
                  </span>
                  <input
                    type="checkbox"
                    checked={localConfig.requireLpLocked}
                    onChange={(e) =>
                      setLocalConfig({
                        ...localConfig,
                        requireLpLocked: e.target.checked,
                      })
                    }
                    className="accent-[#10B981] rounded cursor-pointer"
                  />
                </label>

                <label className="flex items-center justify-between text-xs text-slate-300 cursor-pointer">
                  <span className="flex items-center gap-2">
                    <Flame className="w-3.5 h-3.5 text-[#8B5CF6]" />
                    Auto-Compound Realized Profit
                  </span>
                  <input
                    type="checkbox"
                    checked={localConfig.autoCompound}
                    onChange={(e) =>
                      setLocalConfig({
                        ...localConfig,
                        autoCompound: e.target.checked,
                      })
                    }
                    className="accent-[#8B5CF6] rounded cursor-pointer"
                  />
                </label>
              </div>

              <button
                onClick={handleSaveCustomConfig}
                disabled={actionBusy === "SAVE_CONFIG"}
                className="w-full py-2.5 px-4 rounded-lg bg-[#10B981] hover:bg-[#059669] text-slate-950 font-semibold text-xs tracking-wide transition shadow-[0_0_20px_-5px_rgba(16,185,129,0.5)] cursor-pointer"
              >
                {actionBusy === "SAVE_CONFIG"
                  ? "Applying Guardrails..."
                  : "Apply Strategy Parameters"}
              </button>
            </div>

            {/* LIVE WALLET & ON-CHAIN GUARDRAILS */}
            <div
              className={`bg-[#11151F]/90 backdrop-blur-md rounded-xl border p-5 space-y-4 ${
                config.tradingMode === "LIVE"
                  ? "border-rose-500/40 shadow-[0_0_25px_-12px_rgba(244,63,94,0.5)]"
                  : "border-white/[0.07]"
              }`}
            >
              <div className="flex items-center justify-between border-b border-white/[0.06] pb-3">
                <div className="flex items-center gap-2">
                  <Link2 className="w-4 h-4 text-[#10B981]" />
                  <h2 className="font-display font-semibold text-base tracking-tight">
                    Live Wallet Bridge
                  </h2>
                </div>
                <span
                  className={`text-[10px] font-mono px-2 py-0.5 rounded border ${
                    config.tradingMode === "LIVE"
                      ? "bg-rose-500/15 text-rose-300 border-rose-500/40"
                      : "bg-slate-800 text-slate-400 border-slate-700"
                  }`}
                >
                  {config.tradingMode === "LIVE" ? "LIVE ON-CHAIN" : "PAPER SIM"}
                </span>
              </div>

              {/* Connected wallet summary */}
              <div className="space-y-2">
                {wallet.evmAddress || wallet.solanaAddress ? (
                  <div className="p-2.5 rounded-lg bg-[#090B10] border border-[#10B981]/25 flex items-center justify-between gap-2">
                    <div>
                      <div className="text-xs font-mono text-white">
                        {shortenAddress(wallet.evmAddress || wallet.solanaAddress || "")}
                      </div>
                      <div className="text-[10px] font-mono text-slate-500">
                        {wallet.evmProviderName || wallet.solanaProviderName || "Injected"} ·{" "}
                        {wallet.nativeBalance !== null
                          ? `${Number(wallet.nativeBalance).toFixed(4)} native`
                          : "balance n/a"}
                      </div>
                    </div>
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[#10B981]/15 text-[#10B981] border border-[#10B981]/30">
                      {wallet.evmChainKey || (wallet.solanaAddress ? "SOL" : "—")}
                    </span>
                  </div>
                ) : (
                  <button
                    onClick={() => setWalletModalOpen(true)}
                    className="w-full py-2.5 rounded-lg bg-[#090B10] border border-dashed border-white/15 text-slate-300 text-xs font-semibold hover:border-[#10B981]/50 flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <Wallet className="w-4 h-4 text-[#10B981]" />
                    Connect EVM / Solana wallet
                  </button>
                )}

                <div className="flex items-center justify-between text-[11px] font-mono">
                  <span className="text-slate-400">
                    Verified: {state.wallets.filter((w) => w.isVerified).length} wallet(s)
                  </span>
                  <button
                    onClick={() => setWalletModalOpen(true)}
                    className="text-[#10B981] hover:underline cursor-pointer"
                  >
                    Manage
                  </button>
                </div>

                {config.tradingMode === "LIVE" ? (
                  <button
                    onClick={() => handleModeSwitch("PAPER")}
                    disabled={actionBusy === "MODE"}
                    className="w-full py-2 rounded-lg bg-[#11151F] hover:bg-slate-800 border border-white/10 text-slate-200 text-xs font-semibold cursor-pointer"
                  >
                    Return to Paper Mode
                  </button>
                ) : (
                  <button
                    onClick={() => handleModeSwitch("LIVE")}
                    className="w-full py-2 rounded-lg bg-[#10B981] hover:bg-[#059669] text-slate-950 text-xs font-bold tracking-wide flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <Radio className="w-3.5 h-3.5" />
                    Go Live On-Chain
                  </button>
                )}
              </div>

              <button onClick={() => setCustodyOpen(true)} className="w-full py-2 rounded-lg bg-[#8B5CF6]/10 border border-[#8B5CF6]/30 text-[#C4B5FD] text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer"><Fingerprint className="w-3.5 h-3.5" />{state.custody?.wallet ? "Open Built-in Vault" : "Create Built-in Vault"}<ArrowUpRight className="w-3 h-3" /></button>

              {/* Live guardrails */}
              <div className="space-y-3 pt-2 border-t border-white/[0.06]">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                    Live Guardrails
                  </span>
                  <span className="text-[10px] font-mono text-slate-500">
                    paper & live separated
                  </span>
                </div>

                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-slate-300">Max per live trade</span>
                    <span className="font-mono text-[#10B981]">
                      ${localConfig.liveMaxTradeUsd.toFixed(2)}
                    </span>
                  </div>
                  <input
                    type="range"
                    min={1}
                    max={100}
                    step={1}
                    value={localConfig.liveMaxTradeUsd}
                    onChange={(e) =>
                      setLocalConfig({
                        ...localConfig,
                        liveMaxTradeUsd: Number(e.target.value),
                      })
                    }
                    className="w-full accent-[#10B981] cursor-pointer"
                  />
                </div>

                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-slate-300">Daily live cap</span>
                    <span className="font-mono text-[#10B981]">
                      ${localConfig.liveDailyCapUsd.toFixed(0)}
                    </span>
                  </div>
                  <input
                    type="range"
                    min={5}
                    max={500}
                    step={5}
                    value={localConfig.liveDailyCapUsd}
                    onChange={(e) =>
                      setLocalConfig({
                        ...localConfig,
                        liveDailyCapUsd: Number(e.target.value),
                      })
                    }
                    className="w-full accent-[#10B981] cursor-pointer"
                  />
                  <div className="flex items-center justify-between text-[10px] font-mono text-slate-500 mt-1">
                    <span>Remaining</span>
                    <span className="text-[#10B981]">
                      ${state.liveMetrics.dailyCapRemainingUsd.toFixed(2)}
                    </span>
                  </div>
                </div>

                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-slate-300">Slippage tolerance</span>
                    <span className="font-mono text-[#C4B5FD]">
                      {localConfig.liveSlippagePct.toFixed(1)}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0.5}
                    max={10}
                    step={0.5}
                    value={localConfig.liveSlippagePct}
                    onChange={(e) =>
                      setLocalConfig({
                        ...localConfig,
                        liveSlippagePct: Number(e.target.value),
                      })
                    }
                    className="w-full accent-[#8B5CF6] cursor-pointer"
                  />
                </div>

                <label className="flex items-center justify-between text-xs text-slate-300 cursor-pointer">
                  <span className="flex items-center gap-2">
                    <ShieldQuestion className="w-3.5 h-3.5 text-[#8B5CF6]" />
                    Auto-generate live intents
                  </span>
                  <input
                    type="checkbox"
                    checked={localConfig.liveAutoTrade}
                    onChange={(e) =>
                      setLocalConfig({
                        ...localConfig,
                        liveAutoTrade: e.target.checked,
                      })
                    }
                    className="accent-[#8B5CF6] cursor-pointer"
                  />
                </label>

                <button
                  onClick={handleSaveCustomConfig}
                  disabled={actionBusy === "SAVE_CONFIG"}
                  className="w-full py-2 rounded-lg bg-[#11151F] hover:bg-slate-800 border border-white/10 text-slate-200 text-xs font-semibold cursor-pointer"
                >
                  {actionBusy === "SAVE_CONFIG" ? "Saving..." : "Save Live Guardrails"}
                </button>
                <p className="text-[10px] text-slate-500 leading-relaxed">
                  The bot can only queue intents inside these limits, on verified contracts, and
                  every intent needs your signature. Nothing is broadcast without you.
                </p>
              </div>
            </div>

            {/* Scoring Methodology Box */}
            <div className="bg-[#11151F]/90 backdrop-blur-md rounded-xl border border-white/[0.07] p-4 space-y-3">
              <div className="flex items-center gap-2 text-xs font-semibold text-slate-200">
                <Cpu className="w-4 h-4 text-[#10B981]" />
                <span>How the Bot Selects Viable Coins</span>
              </div>
              <p className="text-xs text-slate-400 leading-relaxed">
                Every discovered crypto & meme coin is scored <strong className="text-slate-200">0–100</strong> in real time before execution:
              </p>
              <ul className="space-y-1.5 text-[11px] font-mono text-slate-300">
                <li className="flex justify-between">
                  <span className="text-slate-400">1. 5m/1h Volume Velocity</span>
                  <span className="text-[#10B981]">32% weight</span>
                </li>
                <li className="flex justify-between">
                  <span className="text-slate-400">2. Contract & Anti-Rug Audit</span>
                  <span className="text-[#10B981]">28% weight</span>
                </li>
                <li className="flex justify-between">
                  <span className="text-slate-400">3. DEX Liquidity Depth</span>
                  <span className="text-[#C4B5FD]">25% weight</span>
                </li>
                <li className="flex justify-between">
                  <span className="text-slate-400">4. Smart-Money & Sentiment</span>
                  <span className="text-[#C4B5FD]">15% weight</span>
                </li>
              </ul>
            </div>
          </div>

          {/* CENTER COLUMN (6 COLS): DISCOVERY RADAR + PORTFOLIO EQUITY & POSITIONS */}
          <div className="lg:col-span-6 space-y-5">
            {/* PANEL 1: VIABLE COIN DISCOVERY RADAR */}
            <div className="bg-[#11151F]/90 backdrop-blur-md rounded-xl border border-white/[0.07] p-5">
              <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-white/[0.06]">
                <div>
                  <div className="flex items-center gap-2">
                    <Radar className="w-4 h-4 text-[#10B981]" />
                    <h2 className="font-display font-semibold text-base tracking-tight">
                      Viable Crypto & Meme-Coin Discovery Radar
                    </h2>
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Real-time DEX liquidity & contract scanner • Auto-buys coins scoring &ge;
                    {config.minViabilityScore}/100
                  </p>
                </div>

                {/* Search Input */}
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Filter symbol or chain..."
                    className="pl-8 pr-3 py-1.5 rounded-lg bg-[#090B10] border border-white/10 text-xs text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-[#10B981]"
                  />
                </div>
              </div>

              {/* Filter Bar */}
              <div className="flex flex-wrap items-center justify-between gap-2 py-3 border-b border-white/[0.05]">
                <div className="flex flex-wrap items-center gap-1.5">
                  {["ALL", "SOL", "BASE", "ETH", "ARB"].map((ch) => (
                    <button
                      key={ch}
                      onClick={() => setChainFilter(ch)}
                      className={`px-2.5 py-1 rounded text-xs font-mono font-medium transition cursor-pointer ${
                        chainFilter === ch
                          ? "bg-[#10B981]/20 text-[#10B981] border border-[#10B981]/40"
                          : "bg-[#090B10]/60 text-slate-400 hover:text-slate-200 border border-white/[0.05]"
                      }`}
                    >
                      {ch}
                    </button>
                  ))}
                  <span className="text-slate-700 mx-1">|</span>
                  {[
                    { id: "ALL", label: "All Types" },
                    { id: "AI_MEME", label: "AI Meme" },
                    { id: "MEME", label: "Meme" },
                    { id: "DEFI_ALPHA", label: "DeFi Alpha" },
                  ].map((cat) => (
                    <button
                      key={cat.id}
                      onClick={() => setCategoryFilter(cat.id)}
                      className={`px-2.5 py-1 rounded text-xs font-medium transition cursor-pointer ${
                        categoryFilter === cat.id
                          ? "bg-[#8B5CF6]/20 text-[#C4B5FD] border border-[#8B5CF6]/40"
                          : "bg-[#090B10]/60 text-slate-400 hover:text-slate-200 border border-white/[0.05]"
                      }`}
                    >
                      {cat.label}
                    </button>
                  ))}
                </div>

                <label className="flex items-center gap-1.5 text-xs text-slate-400 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={hideRejected}
                    onChange={(e) => setHideRejected(e.target.checked)}
                    className="accent-[#10B981]"
                  />
                  <span>Hide Blocked Rugs</span>
                </label>
              </div>

              {/* Discovered Token Rows */}
              <div className="divide-y divide-white/[0.05] max-h-[460px] overflow-y-auto pr-1">
                {filteredTokens.map((token) => {
                  const isViable =
                    token.viabilityScore >= config.minViabilityScore && token.isHoneypotSafe;
                  return (
                    <div
                      key={token.id}
                      className={`py-3.5 px-2 transition rounded-lg hover:bg-white/[0.02] flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                        !token.isHoneypotSafe ? "opacity-65" : ""
                      }`}
                    >
                      {/* Left: Viability Gauge + Token Identity */}
                      <div className="flex items-center gap-3 min-w-0">
                        <ViabilityGauge score={token.viabilityScore} />
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-display font-bold text-sm text-white">
                              ${token.symbol}
                            </span>
                            <ChainBadge chain={token.chain} />
                            <CategoryBadge category={token.category} />
                            {token.status === "SNIPED" && (
                              <span className="px-2 py-0.5 rounded text-[10px] font-mono font-semibold bg-[#10B981]/15 text-[#10B981] border border-[#10B981]/30">
                                IN PORTFOLIO
                              </span>
                            )}
                            {!token.isHoneypotSafe && (
                              <span className="px-2 py-0.5 rounded text-[10px] font-mono font-semibold bg-rose-500/15 text-rose-400 border border-rose-500/30">
                                RUG BLOCKED
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-slate-400 truncate mt-0.5">
                            {token.signalReason}
                          </p>
                          <div className="flex flex-wrap items-center gap-3 mt-1 text-[11px] font-mono text-slate-400">
                            <span>LIQ: {formatCompactUsd(token.liquidityUsd)}</span>
                            <span>VOL: {formatCompactUsd(token.volume24hUsd)}</span>
                            <span>MCAP: {formatCompactUsd(token.marketCapUsd)}</span>
                            {token.isLpLocked && (
                              <span className="text-[#10B981] inline-flex items-center gap-0.5">
                                <ShieldCheck className="w-3 h-3" /> LP Locked
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Right: Sparkline + Price + Actions */}
                      <div className="flex items-center justify-between sm:justify-end gap-4 shrink-0">
                        <div className="hidden md:block">
                          <TokenSparkline
                            dataJson={token.sparkline}
                            positive={token.priceChange5m >= 0}
                          />
                        </div>

                        <div className="text-right font-mono">
                          <div className="text-sm font-semibold text-white tabular-nums">
                            {formatTokenPrice(token.priceUsd)}
                          </div>
                          <div className="flex items-center justify-end gap-2 text-xs tabular-nums">
                            <span
                              className={
                                token.priceChange5m >= 0
                                  ? "text-[#10B981]"
                                  : "text-rose-400"
                              }
                            >
                              5m: {token.priceChange5m >= 0 ? "+" : ""}
                              {token.priceChange5m}%
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => {
                              setInspectedToken(token);
                              setCustomSnipeUsd(config.maxPositionUsd);
                            }}
                            className="p-2 rounded-lg bg-[#090B10] hover:bg-slate-800 text-slate-300 border border-white/10 transition cursor-pointer"
                            title="Inspect Contract Security & Viability Breakdown"
                          >
                            <Eye className="w-4 h-4" />
                          </button>

                          {token.isHoneypotSafe ? (
                            config.tradingMode === "LIVE" ? (
                              <button
                                onClick={() => handleLiveIntent(token)}
                                disabled={actionBusy === `LIVE_${token.id}`}
                                className={`px-3 py-2 rounded-lg text-xs font-mono font-semibold transition cursor-pointer ${
                                  liveEquivalent(token.symbol)
                                    ? "bg-rose-500/20 hover:bg-rose-500/30 text-rose-200 border border-rose-500/40"
                                    : "bg-[#11151F] hover:bg-slate-800 text-slate-400 border border-white/10"
                                }`}
                                title={
                                  liveEquivalent(token.symbol)
                                    ? `Queue on-chain intent for verified ${liveEquivalent(token.symbol)?.symbol} contract`
                                    : "No verified on-chain contract for this simulated asset"
                                }
                              >
                                {actionBusy === `LIVE_${token.id}`
                                  ? "Queueing..."
                                  : liveEquivalent(token.symbol)
                                  ? `Live $${config.liveMaxTradeUsd}`
                                  : "Sim only"}
                              </button>
                            ) : (
                              <button
                                onClick={() => handleManualSnipe(token)}
                                disabled={actionBusy === `SNIPE_${token.id}`}
                                className={`px-3 py-2 rounded-lg text-xs font-mono font-semibold transition cursor-pointer ${
                                  isViable
                                    ? "bg-[#10B981] hover:bg-[#059669] text-slate-950 shadow-[0_0_15px_-3px_rgba(16,185,129,0.5)]"
                                    : "bg-[#11151F] hover:bg-slate-800 text-slate-200 border border-white/15"
                                }`}
                              >
                                {actionBusy === `SNIPE_${token.id}`
                                  ? "Buying..."
                                  : `Snipe $${config.maxPositionUsd}`}
                              </button>
                            )
                          ) : (
                            <span className="px-2.5 py-1.5 rounded-lg text-[11px] font-mono bg-rose-950/40 text-rose-400 border border-rose-500/30">
                              Blocked
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* PANEL 2: LIVE ON-CHAIN EXECUTION & WALLET BRIDGE */}
            <LiveOrdersPanel
              config={config}
              orders={state.liveOrders ?? []}
              livePositions={state.livePositions ?? []}
              wallets={state.wallets ?? []}
              liveMetrics={state.liveMetrics}
              onRefresh={handleWalletRefresh}
              custody={state.custody}
              onOpenCustody={() => setCustodyOpen(true)}
              onOpenWallet={() => setWalletModalOpen(true)}
              onGoLive={() => handleModeSwitch("LIVE")}
            />

            {/* PANEL 3: EQUITY CURVE & ACTIVE / CLOSED POSITIONS */}
            <div className="bg-[#11151F]/90 backdrop-blur-md rounded-xl border border-white/[0.07] p-5 space-y-5">
              {/* Equity Curve Header & SVG */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Activity className="w-4 h-4 text-[#10B981]" />
                    <h2 className="font-display font-semibold text-base tracking-tight">
                      Autonomous Profit Trajectory & Active Positions
                    </h2>
                  </div>
                  <span className="text-xs font-mono text-slate-400">
                    Auto Take-Profit: +{config.takeProfitPct}% | Stop-Loss: -{config.stopLossPct}%
                  </span>
                </div>
                <EquityCurveChart snapshots={state.snapshots} />
              </div>

              {/* Positions Tabs */}
              <div className="border-t border-white/[0.06] pt-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setPositionTab("OPEN")}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                        positionTab === "OPEN"
                          ? "bg-[#10B981]/15 text-[#10B981] border border-[#10B981]/40"
                          : "text-slate-400 hover:text-slate-200"
                      }`}
                    >
                      Active Autonomous Positions ({state.openPositions.length})
                    </button>
                    <button
                      onClick={() => setPositionTab("CLOSED")}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                        positionTab === "CLOSED"
                          ? "bg-[#8B5CF6]/15 text-[#C4B5FD] border border-[#8B5CF6]/40"
                          : "text-slate-400 hover:text-slate-200"
                      }`}
                    >
                      Closed Profit Ledger ({state.closedPositions.length})
                    </button>
                  </div>
                </div>

                {positionTab === "OPEN" ? (
                  state.openPositions.length === 0 ? (
                    <div className="text-center py-8 bg-[#090B10]/50 rounded-xl border border-white/[0.05] space-y-2">
                      <p className="text-sm text-slate-300">
                        No open positions right now — Bot is scanning for viable entries.
                      </p>
                      <button
                        onClick={handleForceCycle}
                        className="px-4 py-2 rounded-lg bg-[#10B981] text-slate-950 font-semibold text-xs cursor-pointer"
                      >
                        Snipe Top Viable Coin Now
                      </button>
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="border-b border-white/[0.06] text-[11px] font-mono uppercase text-slate-400">
                            <th className="py-2.5 px-2">Asset</th>
                            <th className="py-2.5 px-2">Entry / Mark</th>
                            <th className="py-2.5 px-2">Position Value</th>
                            <th className="py-2.5 px-2">Net PnL</th>
                            <th className="py-2.5 px-2">Auto TP Target</th>
                            <th className="py-2.5 px-2 text-right">Action</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-white/[0.05] text-xs font-mono">
                          {state.openPositions.map((pos) => {
                            const tpProgress = Math.max(
                              0,
                              Math.min(100, (pos.pnlPct / Math.max(1, pos.takeProfitPct)) * 100)
                            );
                            return (
                              <tr key={pos.id} className="hover:bg-white/[0.02]">
                                <td className="py-3 px-2">
                                  <div className="flex items-center gap-2">
                                    <span className="font-display font-bold text-white text-sm">
                                      ${pos.symbol}
                                    </span>
                                    <ChainBadge chain={pos.chain} />
                                  </div>
                                  <div className="text-[10px] text-slate-500">
                                    Viability @ Entry: {pos.viabilityAtEntry}/100
                                  </div>
                                </td>
                                <td className="py-3 px-2 tabular-nums">
                                  <div className="text-slate-300">
                                    {formatTokenPrice(pos.currentPriceUsd)}
                                  </div>
                                  <div className="text-[10px] text-slate-500">
                                    Entry: {formatTokenPrice(pos.entryPriceUsd)}
                                  </div>
                                </td>
                                <td className="py-3 px-2 tabular-nums">
                                  <div className="text-white font-semibold">
                                    {formatUsd(pos.currentValueUsd)}
                                  </div>
                                  <div className="text-[10px] text-slate-500">
                                    Cost: {formatUsd(pos.investedUsd)}
                                  </div>
                                </td>
                                <td className="py-3 px-2 tabular-nums">
                                  <div
                                    className={`font-semibold ${
                                      pos.pnlUsd >= 0 ? "text-[#10B981]" : "text-rose-400"
                                    }`}
                                  >
                                    {pos.pnlUsd >= 0 ? "+" : ""}
                                    {formatUsd(pos.pnlUsd)}
                                  </div>
                                  <div
                                    className={`text-[11px] ${
                                      pos.pnlPct >= 0 ? "text-[#10B981]" : "text-rose-400"
                                    }`}
                                  >
                                    {pos.pnlPct >= 0 ? "+" : ""}
                                    {pos.pnlPct.toFixed(2)}%
                                  </div>
                                </td>
                                <td className="py-3 px-2">
                                  <div className="w-28">
                                    <div className="flex justify-between text-[10px] text-slate-400 mb-1">
                                      <span>TP +{pos.takeProfitPct}%</span>
                                      <span>{Math.round(tpProgress)}%</span>
                                    </div>
                                    <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                                      <div
                                        className={`h-full rounded-full transition-all ${
                                          pos.pnlPct >= 0 ? "bg-[#10B981]" : "bg-rose-500"
                                        }`}
                                        style={{
                                          width: `${
                                            pos.pnlPct >= 0
                                              ? Math.max(8, tpProgress)
                                              : Math.min(100, Math.abs(pos.pnlPct) * 4)
                                          }%`,
                                        }}
                                      />
                                    </div>
                                  </div>
                                </td>
                                <td className="py-3 px-2 text-right">
                                  <button
                                    onClick={() => handleClosePosition(pos)}
                                    disabled={actionBusy === `CLOSE_${pos.id}`}
                                    className="px-2.5 py-1.5 rounded-lg bg-[#10B981]/15 hover:bg-[#10B981]/30 text-[#10B981] border border-[#10B981]/30 text-xs font-semibold transition cursor-pointer"
                                  >
                                    {actionBusy === `CLOSE_${pos.id}`
                                      ? "Closing..."
                                      : pos.pnlUsd >= 0
                                      ? "Take Profit"
                                      : "Close"}
                                  </button>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )
                ) : (
                  <div className="overflow-x-auto max-h-64 overflow-y-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="border-b border-white/[0.06] text-[11px] font-mono uppercase text-slate-400">
                          <th className="py-2 px-2">Asset</th>
                          <th className="py-2 px-2">Exit Trigger</th>
                          <th className="py-2 px-2">Entry / Exit</th>
                          <th className="py-2 px-2">Settled Value</th>
                          <th className="py-2 px-2 text-right">Realized PnL</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/[0.05] text-xs font-mono">
                        {state.closedPositions.map((pos) => (
                          <tr key={pos.id} className="hover:bg-white/[0.02]">
                            <td className="py-2.5 px-2">
                              <div className="flex items-center gap-2">
                                <span className="font-bold text-white">${pos.symbol}</span>
                                <ChainBadge chain={pos.chain} />
                              </div>
                            </td>
                            <td className="py-2.5 px-2">
                              <span
                                className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                                  pos.status === "CLOSED_TP"
                                    ? "bg-[#10B981]/15 text-[#10B981]"
                                    : "bg-rose-500/15 text-rose-400"
                                }`}
                              >
                                {pos.status === "CLOSED_TP"
                                  ? "AUTO TAKE-PROFIT"
                                  : pos.status === "CLOSED_SL"
                                  ? "AUTO STOP-LOSS"
                                  : "MANUAL EXIT"}
                              </span>
                            </td>
                            <td className="py-2.5 px-2 text-slate-300 tabular-nums">
                              {formatTokenPrice(pos.entryPriceUsd)} &rarr;{" "}
                              {formatTokenPrice(pos.currentPriceUsd)}
                            </td>
                            <td className="py-2.5 px-2 text-white tabular-nums">
                              {formatUsd(pos.currentValueUsd)}
                            </td>
                            <td
                              className={`py-2.5 px-2 text-right font-semibold tabular-nums ${
                                pos.pnlUsd >= 0 ? "text-[#10B981]" : "text-rose-400"
                              }`}
                            >
                              {pos.pnlUsd >= 0 ? "+" : ""}
                              {formatUsd(pos.pnlUsd)} ({pos.pnlPct >= 0 ? "+" : ""}
                              {pos.pnlPct.toFixed(1)}%)
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* RIGHT COLUMN (3 COLS): LIVE AUTONOMOUS EXECUTION & TELEMETRY LOG */}
          <div className="lg:col-span-3 space-y-5">
            <div className="bg-[#11151F]/90 backdrop-blur-md rounded-xl border border-white/[0.07] p-5 flex flex-col h-[780px]">
              <div className="flex items-center justify-between pb-3.5 border-b border-white/[0.06]">
                <div className="flex items-center gap-2">
                  <Terminal className="w-4 h-4 text-[#10B981]" />
                  <h2 className="font-display font-semibold text-base tracking-tight">
                    Autonomous Execution Stream
                  </h2>
                </div>
                <span className="flex items-center gap-1.5 text-[11px] font-mono text-[#10B981]">
                  <span className="w-2 h-2 rounded-full bg-[#10B981] animate-pulse" />
                  LIVE
                </span>
              </div>

              {/* Filter Tabs */}
              <div className="flex items-center gap-1 py-2.5 border-b border-white/[0.05]">
                {(["ALL", "TRADES", "AUDITS", "ALERTS"] as const).map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setLogFilter(tab)}
                    className={`flex-1 py-1 rounded text-[11px] font-mono font-medium transition cursor-pointer ${
                      logFilter === tab
                        ? "bg-[#10B981]/20 text-[#10B981] border border-[#10B981]/40"
                        : "bg-[#090B10]/50 text-slate-400 hover:text-slate-200"
                    }`}
                  >
                    {tab}
                  </button>
                ))}
              </div>

              {/* Stream Items */}
              <div className="flex-1 overflow-y-auto space-y-2.5 py-3 pr-1 font-mono">
                {filteredLogs.map((log) => {
                  const badgeMap: Record<string, { label: string; cls: string }> = {
                    BUY: {
                      label: "SNIPE BUY",
                      cls: "bg-[#10B981]/20 text-[#10B981] border-[#10B981]/40",
                    },
                    SELL_TP: {
                      label: "PROFIT EXIT",
                      cls: "bg-[#10B981] text-slate-950 font-bold border-[#10B981]",
                    },
                    SELL_SL: {
                      label: "STOP-LOSS",
                      cls: "bg-rose-500/20 text-rose-400 border-rose-500/40",
                    },
                    AUDIT: {
                      label: "AUDIT PASS",
                      cls: "bg-[#8B5CF6]/20 text-[#C4B5FD] border-[#8B5CF6]/40",
                    },
                    SCAN: {
                      label: "MEMPOOL",
                      cls: "bg-sky-500/15 text-sky-300 border-sky-500/30",
                    },
                    REJECT: {
                      label: "RUG BLOCKED",
                      cls: "bg-amber-500/20 text-amber-300 border-amber-500/40",
                    },
                    SYSTEM: {
                      label: "ENGINE",
                      cls: "bg-slate-800 text-slate-300 border-slate-700",
                    },
                    LIVE: {
                      label: "ON-CHAIN",
                      cls: "bg-rose-500/20 text-rose-300 border-rose-500/40",
                    },
                    WALLET: {
                      label: "WALLET",
                      cls: "bg-[#8B5CF6]/20 text-[#C4B5FD] border-[#8B5CF6]/40",
                    },
                  };
                  const style = badgeMap[log.level] ?? badgeMap.SYSTEM;

                  return (
                    <div
                      key={log.id}
                      className="p-3 rounded-lg bg-[#090B10]/80 border border-white/[0.06] space-y-1.5 text-xs"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5">
                          <span
                            className={`px-1.5 py-0.5 rounded text-[10px] border ${style.cls}`}
                          >
                            {style.label}
                          </span>
                          {log.symbol && (
                            <span className="font-bold text-white">${log.symbol}</span>
                          )}
                          {log.chain && <ChainBadge chain={log.chain} />}
                        </div>
                        {log.pnlDeltaUsd !== null && log.pnlDeltaUsd !== undefined && (
                          <span
                            className={`text-xs font-bold ${
                              log.pnlDeltaUsd >= 0 ? "text-[#10B981]" : "text-rose-400"
                            }`}
                          >
                            {log.pnlDeltaUsd >= 0 ? "+" : ""}
                            {formatUsd(log.pnlDeltaUsd)}
                          </span>
                        )}
                      </div>

                      <p className="text-slate-200 text-[11px] leading-relaxed font-sans">
                        {log.message}
                      </p>

                      {log.details && (
                        <p className="text-[10px] text-slate-400 leading-relaxed">
                          {log.details}
                        </p>
                      )}

                      {log.txHash && (
                        <div className="text-[10px] text-slate-500 flex items-center justify-between pt-0.5">
                          <span>TX: {log.txHash}</span>
                          <span className="text-[#10B981]">CONFIRMED</span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Footer Trigger inside Execution Log */}
              <div className="pt-3 border-t border-white/[0.06] flex items-center justify-between text-xs">
                <span className="text-slate-400 font-mono text-[11px]">
                  {config.isRunning
                    ? "Auto-scanning every 4.5s"
                    : "Engine paused by user"}
                </span>
                <button
                  onClick={handleForceCycle}
                  disabled={actionBusy === "FORCE_CYCLE"}
                  className="text-[#10B981] hover:underline font-mono text-xs flex items-center gap-1 cursor-pointer"
                >
                  <span>Step Next Block</span>
                  <ArrowUpRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* TOKEN CONTRACT & VIABILITY AUDIT MODAL */}
      {inspectedToken && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#11151F] border border-white/15 rounded-2xl max-w-lg w-full p-6 space-y-5 shadow-2xl">
            <div className="flex items-start justify-between gap-4 border-b border-white/[0.08] pb-4">
              <div className="flex items-center gap-3">
                <ViabilityGauge score={inspectedToken.viabilityScore} size={54} />
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-display font-bold text-lg text-white">
                      ${inspectedToken.symbol}
                    </h3>
                    <ChainBadge chain={inspectedToken.chain} />
                    <CategoryBadge category={inspectedToken.category} />
                  </div>
                  <p className="text-xs text-slate-400">{inspectedToken.name}</p>
                  <p className="text-[11px] font-mono text-slate-500 mt-0.5">
                    Contract: {inspectedToken.contractAddress.slice(0, 16)}...
                  </p>
                </div>
              </div>
              <button
                onClick={() => setInspectedToken(null)}
                className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* 4 Pillar Breakdown */}
            <div className="grid grid-cols-2 gap-3">
              {[
                {
                  label: "Momentum & Volume Velocity",
                  score: inspectedToken.momentumScore,
                  color: "bg-[#10B981]",
                },
                {
                  label: "Smart Contract Security",
                  score: inspectedToken.securityScore,
                  color: "bg-[#10B981]",
                },
                {
                  label: "DEX Liquidity Depth",
                  score: inspectedToken.liquidityScore,
                  color: "bg-[#8B5CF6]",
                },
                {
                  label: "On-Chain Alpha Sentiment",
                  score: inspectedToken.sentimentScore,
                  color: "bg-[#8B5CF6]",
                },
              ].map((pillar) => (
                <div
                  key={pillar.label}
                  className="p-3 rounded-xl bg-[#090B10] border border-white/[0.06]"
                >
                  <div className="flex justify-between text-xs mb-1.5">
                    <span className="text-slate-400">{pillar.label}</span>
                    <span className="font-mono font-bold text-white">
                      {pillar.score}/100
                    </span>
                  </div>
                  <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                    <div
                      className={`h-full ${pillar.color}`}
                      style={{ width: `${pillar.score}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>

            {/* On-chain Security Checks */}
            <div className="p-3.5 rounded-xl bg-[#090B10] border border-white/[0.06] space-y-2 text-xs font-mono">
              <div className="text-slate-300 font-sans font-semibold mb-1">
                Automated Anti-Rug & Honeypot Simulation
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="flex items-center gap-2">
                  {inspectedToken.isHoneypotSafe ? (
                    <CheckCircle2 className="w-4 h-4 text-[#10B981]" />
                  ) : (
                    <XCircle className="w-4 h-4 text-rose-400" />
                  )}
                  <span>
                    Honeypot Check:{" "}
                    {inspectedToken.isHoneypotSafe ? "SAFE" : "FAILED"}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  {inspectedToken.isLpLocked ? (
                    <CheckCircle2 className="w-4 h-4 text-[#10B981]" />
                  ) : (
                    <XCircle className="w-4 h-4 text-amber-400" />
                  )}
                  <span>
                    LP Status: {inspectedToken.isLpLocked ? "LOCKED/BURNED" : "UNLOCKED"}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-[#10B981]" />
                  <span>
                    Buy / Sell Tax: {inspectedToken.buyTaxPct}% /{" "}
                    {inspectedToken.sellTaxPct}%
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-[#10B981]" />
                  <span>Top 10 Holders: {inspectedToken.topHoldersPct}%</span>
                </div>
              </div>
            </div>

            {/* Instant Snipe Allocation Control */}
            {inspectedToken.isHoneypotSafe ? (
              <div className="pt-2 flex items-center gap-3">
                <div className="flex-1">
                  <label className="text-[11px] font-mono text-slate-400 block mb-1">
                    Allocation Amount ($ USD)
                  </label>
                  <input
                    type="number"
                    min={50}
                    max={Math.floor(metrics.cashBalance)}
                    step={50}
                    value={customSnipeUsd}
                    onChange={(e) => setCustomSnipeUsd(Number(e.target.value))}
                    className="w-full px-3 py-2 rounded-lg bg-[#090B10] border border-white/15 font-mono text-sm text-white"
                  />
                </div>
                <button
                  onClick={() => handleManualSnipe(inspectedToken, customSnipeUsd)}
                  disabled={actionBusy === `SNIPE_${inspectedToken.id}`}
                  className="mt-5 px-5 py-2.5 rounded-lg bg-[#10B981] hover:bg-[#059669] text-slate-950 font-semibold text-xs font-mono cursor-pointer shadow-[0_0_20px_-5px_rgba(16,185,129,0.6)]"
                >
                  {actionBusy === `SNIPE_${inspectedToken.id}`
                    ? "Executing..."
                    : `Execute Snipe ($${customSnipeUsd})`}
                </button>
              </div>
            ) : (
              <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/30 text-xs text-rose-300">
                Anti-Rug Shield has blocked trading on ${inspectedToken.symbol} due to
                malicious sell tax or honeypot risk.
              </div>
            )}
          </div>
        </div>
      )}

      <CustodyVaultModal open={custodyOpen} onClose={() => setCustodyOpen(false)} onChanged={handleWalletRefresh} />

      {/* WALLET CONNECTION MODAL */}
      <WalletModal
        open={walletModalOpen}
        onClose={() => setWalletModalOpen(false)}
        onGoLive={() => {
          setWalletModalOpen(false);
          setGoLiveOpen(true);
        }}
      />

      {/* GO LIVE RISK ACKNOWLEDGEMENT MODAL */}
      <GoLiveModal
        open={goLiveOpen}
        onClose={() => setGoLiveOpen(false)}
        config={config}
        onSuccess={async () => {
          await fetchTerminal();
          await wallet.refreshWallets();
          showToast(
            "LIVE on-chain mode armed — intents now target verified contracts and wait for your signature",
            "warning"
          );
        }}
      />
    </div>
  );
}
