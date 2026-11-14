"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  createPublicClient,
  custom,
  encodeFunctionData,
  formatEther,
  numberToHex,
  parseEther,
  toHex,
  type Address,
} from "viem";
import bs58 from "bs58";
import type { LiveOrder, WalletRecord } from "@/db/schema";
import {
  LIVE_CHAINS,
  UNISWAP_V2_ROUTER_ABI,
  getLiveAsset,
  type LiveChainKey,
} from "@/lib/live-universe";

interface Eip1193Provider {
  request(args: { method: string; params?: unknown[] | object }): Promise<unknown>;
  on?(event: string, handler: (...args: unknown[]) => void): void;
  removeListener?(event: string, handler: (...args: unknown[]) => void): void;
  isMetaMask?: boolean;
  isCoinbaseWallet?: boolean;
  providers?: Eip1193Provider[];
}

interface SolanaProvider {
  isPhantom?: boolean;
  publicKey?: { toString(): string } | null;
  connect(opts?: { onlyIfTrusted?: boolean }): Promise<{ publicKey: { toString(): string } }>;
  disconnect(): Promise<void>;
  signMessage(
    message: Uint8Array,
    display?: string
  ): Promise<{ signature: Uint8Array; publicKey: { toString(): string } }>;
  on?(event: string, handler: (...args: unknown[]) => void): void;
}

declare global {
  interface Window {
    ethereum?: Eip1193Provider;
    phantom?: { solana?: SolanaProvider };
    solana?: SolanaProvider;
    solflare?: SolanaProvider;
  }
}

export interface WalletContextValue {
  detected: { evm: boolean; solana: boolean };
  evmAddress: string | null;
  evmChainKey: LiveChainKey | null;
  evmChainId: number | null;
  evmProviderName: string | null;
  solanaAddress: string | null;
  solanaProviderName: string | null;
  nativeBalance: string | null;
  linkedWallets: WalletRecord[];
  busy: boolean;
  error: string | null;
  notice: string | null;
  clearMessages: () => void;
  connectEvm: () => Promise<string | null>;
  connectSolana: (providerKey?: "phantom" | "solflare") => Promise<string | null>;
  disconnectEvm: () => Promise<void>;
  disconnectSolana: () => Promise<void>;
  switchEvmChain: (chain: LiveChainKey) => Promise<void>;
  linkCurrentWallet: (chain: LiveChainKey) => Promise<WalletRecord | null>;
  unlinkWallet: (id: number) => Promise<void>;
  setPrimaryWallet: (id: number) => Promise<void>;
  refreshWallets: () => Promise<WalletRecord[]>;
  walletForChain: (chain: LiveChainKey) => WalletRecord | null;
  broadcastLiveBuy: (order: LiveOrder) => Promise<string>;
  readTokenRoute: (assetSymbol: string, amountNative: number) => Promise<string | null>;
}

const WalletContext = createContext<WalletContextValue | null>(null);

function chainKeyFromId(chainId: number): LiveChainKey | null {
  const entry = Object.values(LIVE_CHAINS).find((c) => c.chainId === chainId);
  return entry ? entry.key : null;
}

function getInjectedProvider(): Eip1193Provider | null {
  if (typeof window === "undefined" || !window.ethereum) return null;
  const eth = window.ethereum;
  if (Array.isArray(eth.providers) && eth.providers.length > 0) {
    return eth.providers.find((p) => p.isMetaMask) ?? eth.providers[0];
  }
  return eth;
}

function getSolanaProvider(providerKey?: "phantom" | "solflare"): SolanaProvider | null {
  if (typeof window === "undefined") return null;
  if (providerKey === "solflare") return window.solflare ?? null;
  if (providerKey === "phantom") return window.phantom?.solana ?? window.solana ?? null;
  return window.phantom?.solana ?? window.solflare ?? window.solana ?? null;
}

function ercError(error: unknown): string {
  if (error && typeof error === "object") {
    const e = error as { shortMessage?: string; message?: string };
    return e.shortMessage || e.message || "Wallet request failed";
  }
  return String(error);
}

export function WalletProvider({ children }: { children: ReactNode }) {
  const [detected, setDetected] = useState({ evm: false, solana: false });
  const [evmAddress, setEvmAddress] = useState<string | null>(null);
  const [evmChainId, setEvmChainId] = useState<number | null>(null);
  const [evmProviderName, setEvmProviderName] = useState<string | null>(null);
  const [solanaAddress, setSolanaAddress] = useState<string | null>(null);
  const [solanaProviderName, setSolanaProviderName] = useState<string | null>(null);
  const [nativeBalance, setNativeBalance] = useState<string | null>(null);
  const [linkedWallets, setLinkedWallets] = useState<WalletRecord[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const clearMessages = useCallback(() => {
    setError(null);
    setNotice(null);
  }, []);

  useEffect(() => {
    const check = () => {
      setDetected({
        evm: typeof window !== "undefined" && Boolean(window.ethereum),
        solana:
          typeof window !== "undefined" &&
          Boolean(window.phantom?.solana || window.solana || window.solflare),
      });
    };
    check();
    const timer = setTimeout(check, 800);

    // Silent reconnect for a previously authorized injected wallet
    const provider = getInjectedProvider();
    if (provider) {
      provider
        .request({ method: "eth_accounts" })
        .then((accounts) => {
          const list = accounts as string[];
          if (Array.isArray(list) && list.length > 0) {
            setEvmAddress(list[0]);
            setEvmProviderName(provider.isMetaMask ? "MetaMask" : provider.isCoinbaseWallet ? "Coinbase Wallet" : "Injected wallet");
            provider
              .request({ method: "eth_chainId" })
              .then((id) => setEvmChainId(Number(id)))
              .catch(() => undefined);
          }
        })
        .catch(() => undefined);
    }

    return () => clearTimeout(timer);
  }, []);

  const refreshWallets = useCallback(async () => {
    try {
      const res = await fetch("/api/wallet", { cache: "no-store" });
      const data = await res.json();
      const rows: WalletRecord[] = Array.isArray(data.wallets) ? data.wallets : [];
      setLinkedWallets(rows);
      return rows;
    } catch {
      return [];
    }
  }, []);

  useEffect(() => {
    refreshWallets();
  }, [refreshWallets]);

  // Refresh native balance whenever an address becomes active
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (evmAddress) {
        const provider = getInjectedProvider();
        if (!provider) return;
        try {
          const wei = (await provider.request({
            method: "eth_getBalance",
            params: [evmAddress, "latest"],
          })) as string;
          if (!cancelled) setNativeBalance(formatEther(BigInt(wei)));
        } catch {
          if (!cancelled) setNativeBalance(null);
        }
        return;
      }
      if (solanaAddress) {
        try {
          const res = await fetch("https://api.mainnet-beta.solana.com", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              jsonrpc: "2.0",
              id: 1,
              method: "getBalance",
              params: [solanaAddress],
            }),
          });
          const json = await res.json();
          if (!cancelled) {
            const lamports = Number(json?.result?.value ?? 0);
            setNativeBalance((lamports / 1e9).toFixed(4));
          }
        } catch {
          if (!cancelled) setNativeBalance(null);
        }
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [evmAddress, solanaAddress]);

  const connectEvm = useCallback(async () => {
    clearMessages();
    const provider = getInjectedProvider();
    if (!provider) {
      setError("No EVM wallet detected. Install MetaMask or Coinbase Wallet to trade on-chain.");
      return null;
    }
    setBusy(true);
    try {
      const accounts = (await provider.request({ method: "eth_requestAccounts" })) as string[];
      const account = Array.isArray(accounts) ? accounts[0] : null;
      if (!account) throw new Error("No account authorized");
      const chainId = Number(await provider.request({ method: "eth_chainId" }));
      setEvmAddress(account);
      setEvmChainId(chainId);
      setEvmProviderName(
        provider.isMetaMask ? "MetaMask" : provider.isCoinbaseWallet ? "Coinbase Wallet" : "Injected wallet"
      );
      setNotice(`Connected ${account.slice(0, 6)}…${account.slice(-4)}`);

      provider.on?.("accountsChanged", (...args: unknown[]) => {
        const next = args[0] as string[];
        setEvmAddress(next && next.length > 0 ? next[0] : null);
      });
      provider.on?.("chainChanged", (...args: unknown[]) => {
        setEvmChainId(Number(args[0]));
      });
      return account;
    } catch (err) {
      setError(ercError(err));
      return null;
    } finally {
      setBusy(false);
    }
  }, [clearMessages]);

  const connectSolana = useCallback(
    async (providerKey?: "phantom" | "solflare") => {
      clearMessages();
      const provider = getSolanaProvider(providerKey);
      if (!provider) {
        setError("No Solana wallet detected. Install Phantom or Solflare to trade on Solana.");
        return null;
      }
      setBusy(true);
      try {
        const res = await provider.connect();
        const address = res.publicKey.toString();
        setSolanaAddress(address);
        setSolanaProviderName(provider.isPhantom ? "Phantom" : "Solflare");
        setNotice(`Connected Solana wallet ${address.slice(0, 4)}…${address.slice(-4)}`);
        return address;
      } catch (err) {
        setError(ercError(err));
        return null;
      } finally {
        setBusy(false);
      }
    },
    [clearMessages]
  );

  const disconnectEvm = useCallback(async () => {
    setEvmAddress(null);
    setEvmChainId(null);
    setEvmProviderName(null);
    setNativeBalance(null);
    setNotice("Disconnected browser wallet session");
  }, []);

  const disconnectSolana = useCallback(async () => {
    try {
      await getSolanaProvider()?.disconnect();
    } catch {
      // ignore
    }
    setSolanaAddress(null);
    setSolanaProviderName(null);
    setNativeBalance(null);
  }, []);

  const switchEvmChain = useCallback(async (chain: LiveChainKey) => {
    const cfg = LIVE_CHAINS[chain];
    const provider = getInjectedProvider();
    if (!provider || !cfg.hexChainId) return;
    setBusy(true);
    try {
      await provider.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: cfg.hexChainId }],
      });
      setEvmChainId(cfg.chainId);
      setNotice(`Network switched to ${cfg.name}`);
    } catch (err) {
      const code = (err as { code?: number })?.code;
      if (code === 4902) {
        try {
          await provider.request({
            method: "wallet_addEthereumChain",
            params: [
              {
                chainId: cfg.hexChainId,
                chainName: cfg.name,
                nativeCurrency: { name: cfg.nativeSymbol, symbol: cfg.nativeSymbol, decimals: 18 },
                rpcUrls:
                  chain === "BASE"
                    ? ["https://mainnet.base.org"]
                    : chain === "ARB"
                    ? ["https://arb1.arbitrum.io/rpc"]
                    : ["https://eth.llamarpc.com"],
                blockExplorerUrls: [cfg.explorer],
              },
            ],
          });
          setNotice(`Added ${cfg.name} to your wallet`);
        } catch (addErr) {
          setError(ercError(addErr));
        }
      } else {
        setError(ercError(err));
      }
    } finally {
      setBusy(false);
    }
  }, []);

  const linkCurrentWallet = useCallback(
    async (chain: LiveChainKey) => {
      clearMessages();
      setBusy(true);
      try {
        const provider = getInjectedProvider();
        let address: string | null = null;
        let signature = "";
        let providerLabel = "injected";

        if (chain === "SOL") {
          const solProvider = getSolanaProvider();
          if (!solProvider) throw new Error("Connect a Solana wallet first");
          const connected = solProvider.publicKey
            ? { publicKey: solProvider.publicKey }
            : await solProvider.connect();
          address = connected.publicKey.toString();
          const challengeRes = await fetch("/api/wallet", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "CHALLENGE", address, chain }),
          });
          const challenge = await challengeRes.json();
          if (!challengeRes.ok) throw new Error(challenge.error || "Challenge failed");
          const signed = await solProvider.signMessage(
            new TextEncoder().encode(challenge.message),
            "UTF-8"
          );
          signature = bs58.encode(signed.signature);
          providerLabel = solProvider.isPhantom ? "phantom" : "solflare";
          setSolanaAddress(address);
          const verifyRes = await fetch("/api/wallet", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              action: "VERIFY",
              challengeId: challenge.challengeId,
              address,
              chain,
              signature,
              provider: providerLabel,
            }),
          });
          const verified = await verifyRes.json();
          if (!verifyRes.ok) throw new Error(verified.error || "Verification failed");
          setLinkedWallets(verified.wallets);
          setNotice("Solana wallet ownership verified — live intents enabled");
          return (verified.wallet as WalletRecord) ?? null;
        }

        if (!provider) throw new Error("No EVM wallet detected");
        if (!evmAddress) {
          const accounts = (await provider.request({
            method: "eth_requestAccounts",
          })) as string[];
          address = accounts[0] ?? null;
          setEvmAddress(address);
        } else {
          address = evmAddress;
        }
        if (!address) throw new Error("No EVM account authorized");

        await provider.request({
          method: "wallet_switchEthereumChain",
          params: [{ chainId: LIVE_CHAINS[chain].hexChainId }],
        }).catch(() => undefined);

        const challengeRes = await fetch("/api/wallet", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "CHALLENGE", address, chain }),
        });
        const challenge = await challengeRes.json();
        if (!challengeRes.ok) throw new Error(challenge.error || "Challenge failed");

        signature = (await provider.request({
          method: "personal_sign",
          params: [toHex(challenge.message), address],
        })) as string;

        providerLabel = provider.isMetaMask
          ? "metamask"
          : provider.isCoinbaseWallet
          ? "coinbase"
          : "injected";

        const verifyRes = await fetch("/api/wallet", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "VERIFY",
            challengeId: challenge.challengeId,
            address,
            chain,
            signature,
            provider: providerLabel,
          }),
        });
        const verified = await verifyRes.json();
        if (!verifyRes.ok) throw new Error(verified.error || "Verification failed");
        setLinkedWallets(verified.wallets);
        setNotice("Wallet ownership verified — you can now enable LIVE mode");
        return (verified.wallet as WalletRecord) ?? null;
      } catch (err) {
        setError(ercError(err));
        return null;
      } finally {
        setBusy(false);
      }
    },
    [clearMessages, evmAddress]
  );

  const unlinkWallet = useCallback(async (id: number) => {
    setBusy(true);
    try {
      const res = await fetch("/api/wallet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "UNLINK", id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Unlink failed");
      setLinkedWallets(data.wallets);
      setNotice("Wallet unlinked");
    } catch (err) {
      setError(ercError(err));
    } finally {
      setBusy(false);
    }
  }, []);

  const setPrimaryWallet = useCallback(async (id: number) => {
    setBusy(true);
    try {
      const res = await fetch("/api/wallet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "SET_PRIMARY", id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not set primary wallet");
      setLinkedWallets(data.wallets);
    } catch (err) {
      setError(ercError(err));
    } finally {
      setBusy(false);
    }
  }, []);

  const walletForChain = useCallback(
    (chain: LiveChainKey) => {
      const verified = linkedWallets.filter((w) => w.isVerified);
      return (
        verified.find((w) => w.chain === chain && w.address === evmAddress) ||
        verified.find((w) => w.chain === chain) ||
        verified.find((w) => w.isPrimary) ||
        verified[0] ||
        null
      );
    },
    [linkedWallets, evmAddress]
  );

  const readTokenRoute = useCallback(
    async (assetSymbol: string, amountNative: number) => {
      const provider = getInjectedProvider();
      const asset = getLiveAsset(assetSymbol);
      if (!provider || !asset?.routerAddress || !asset.quoteAddress) return null;
      try {
        const client = createPublicClient({ transport: custom(provider) });
        const amounts = (await client.readContract({
          address: asset.routerAddress as Address,
          abi: UNISWAP_V2_ROUTER_ABI,
          functionName: "getAmountsOut",
          args: [
            parseEther(String(amountNative)),
            [asset.quoteAddress as Address, asset.address as Address],
          ],
        })) as readonly bigint[];
        const out = amounts[amounts.length - 1];
        return out.toString();
      } catch {
        return null;
      }
    },
    []
  );

  const broadcastLiveBuy = useCallback(
    async (order: LiveOrder) => {
      clearMessages();
      const provider = getInjectedProvider();
      const asset = getLiveAsset(order.assetSymbol);
      if (!provider) throw new Error("Connect an EVM wallet to sign on-chain transactions");
      if (!asset?.routerAddress || !asset.quoteAddress) {
        throw new Error("This asset cannot be routed by the in-app EVM router");
      }
      if (!evmAddress) throw new Error("Connect your wallet first");

      const chainCfg = LIVE_CHAINS[asset.chain];
      if (chainCfg.chainId && evmChainId !== chainCfg.chainId) {
        await switchEvmChain(asset.chain);
      }

      const from = evmAddress as Address;
      const router = asset.routerAddress as Address;
      const path = [asset.quoteAddress as Address, asset.address as Address];
      const valueWei = parseEther(String(order.amountNative));
      const client = createPublicClient({ transport: custom(provider) });

      let minOut = BigInt(0);
      try {
        const amounts = (await client.readContract({
          address: router,
          abi: UNISWAP_V2_ROUTER_ABI,
          functionName: "getAmountsOut",
          args: [valueWei, path],
        })) as readonly bigint[];
        const expected = amounts[amounts.length - 1];
        const slipBps = BigInt(Math.max(1, Math.round(Number(order.slippagePct) * 100)));
        minOut = expected - (expected * slipBps) / BigInt(10000);
      } catch {
        throw new Error(
          `No direct ${chainCfg.nativeSymbol} → ${asset.symbol} route on Uniswap V2 right now. No funds moved — use the DEX link instead.`
        );
      }

      const deadline = BigInt(Math.floor(Date.now() / 1000) + 60 * 10);
      const data = encodeFunctionData({
        abi: UNISWAP_V2_ROUTER_ABI,
        functionName: "swapExactETHForTokens",
        args: [minOut, path, from, deadline],
      });

      const hash = (await provider.request({
        method: "eth_sendTransaction",
        params: [
          {
            from,
            to: router,
            value: numberToHex(valueWei),
            data,
          },
        ],
      })) as string;

      if (!hash) throw new Error("Wallet did not return a transaction hash");
      return hash;
    },
    [clearMessages, evmAddress, evmChainId, switchEvmChain]
  );

  const value = useMemo<WalletContextValue>(
    () => ({
      detected,
      evmAddress,
      evmChainKey: evmChainId ? chainKeyFromId(evmChainId) : null,
      evmChainId,
      evmProviderName,
      solanaAddress,
      solanaProviderName,
      nativeBalance,
      linkedWallets,
      busy,
      error,
      notice,
      clearMessages,
      connectEvm,
      connectSolana,
      disconnectEvm,
      disconnectSolana,
      switchEvmChain,
      linkCurrentWallet,
      unlinkWallet,
      setPrimaryWallet,
      refreshWallets,
      walletForChain,
      broadcastLiveBuy,
      readTokenRoute,
    }),
    [
      detected,
      evmAddress,
      evmChainId,
      evmProviderName,
      solanaAddress,
      solanaProviderName,
      nativeBalance,
      linkedWallets,
      busy,
      error,
      notice,
      clearMessages,
      connectEvm,
      connectSolana,
      disconnectEvm,
      disconnectSolana,
      switchEvmChain,
      linkCurrentWallet,
      unlinkWallet,
      setPrimaryWallet,
      refreshWallets,
      walletForChain,
      broadcastLiveBuy,
      readTokenRoute,
    ]
  );

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

export function useWallet(): WalletContextValue {
  const ctx = useContext(WalletContext);
  if (!ctx) {
    throw new Error("useWallet must be used inside <WalletProvider>");
  }
  return ctx;
}
