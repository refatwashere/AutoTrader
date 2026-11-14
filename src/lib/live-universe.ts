export type LiveChainKey = "ETH" | "BASE" | "ARB" | "SOL";

export interface LiveChainConfig {
  key: LiveChainKey;
  name: string;
  chainId: number | null;
  hexChainId: string | null;
  nativeSymbol: string;
  wrappedNative: string | null;
  routerAddress: string | null;
  dex: string;
  explorer: string;
  nativeUsd: number;
  supportsInAppSigning: boolean;
}

export const LIVE_CHAINS: Record<LiveChainKey, LiveChainConfig> = {
  ETH: {
    key: "ETH",
    name: "Ethereum",
    chainId: 1,
    hexChainId: "0x1",
    nativeSymbol: "ETH",
    wrappedNative: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
    routerAddress: "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D",
    dex: "Uniswap V2",
    explorer: "https://etherscan.io",
    nativeUsd: 3000,
    supportsInAppSigning: true,
  },
  BASE: {
    key: "BASE",
    name: "Base",
    chainId: 8453,
    hexChainId: "0x2105",
    nativeSymbol: "ETH",
    wrappedNative: "0x4200000000000000000000000000000000000006",
    routerAddress: "0x4752ba5DBc23f44D87826276BF6Fd6b1C372aD24",
    dex: "Uniswap V2",
    explorer: "https://basescan.org",
    nativeUsd: 3000,
    supportsInAppSigning: true,
  },
  ARB: {
    key: "ARB",
    name: "Arbitrum One",
    chainId: 42161,
    hexChainId: "0xa4b1",
    nativeSymbol: "ETH",
    wrappedNative: "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1",
    routerAddress: "0x4752ba5DBc23f44D87826276BF6Fd6b1C372aD24",
    dex: "Uniswap V2",
    explorer: "https://arbiscan.io",
    nativeUsd: 3000,
    supportsInAppSigning: true,
  },
  SOL: {
    key: "SOL",
    name: "Solana",
    chainId: null,
    hexChainId: null,
    nativeSymbol: "SOL",
    wrappedNative: null,
    routerAddress: null,
    dex: "Jupiter Aggregator",
    explorer: "https://solscan.io",
    nativeUsd: 150,
    supportsInAppSigning: false,
  },
};

export interface LiveAsset {
  symbol: string;
  name: string;
  chain: LiveChainKey;
  address: string;
  routerAddress: string | null;
  quoteAddress: string | null;
  dex: string;
  referencePriceUsd: number;
  /** Radar symbol whose viability score mirrors onto this real asset (if any). */
  radarSymbol?: string;
  liquidityLabel: string;
  note: string;
}

/**
 * Curated universe of REAL, verified on-chain contracts.
 * Live orders are only ever generated for assets in this list so that the bot can
 * never send funds to an unverified (simulated / honeypot) address.
 */
export const LIVE_ASSETS: LiveAsset[] = [
  {
    symbol: "BRETT",
    name: "Brett (Base)",
    chain: "BASE",
    address: "0x532f27101965dd16442E59d40670FaF5eBB142E4",
    routerAddress: LIVE_CHAINS.BASE.routerAddress,
    quoteAddress: LIVE_CHAINS.BASE.wrappedNative,
    dex: "Uniswap V2 · Base",
    referencePriceUsd: 0.082,
    radarSymbol: "BRETTX",
    liquidityLabel: "$40M+",
    note: "Blue-chip Base meme · contract renounced · deep ETH pairs",
  },
  {
    symbol: "TOSHI",
    name: "Toshi (Base)",
    chain: "BASE",
    address: "0xAC1Bd2486aAf3B5C0fc3Fd868558b082a531B2B4",
    routerAddress: LIVE_CHAINS.BASE.routerAddress,
    quoteAddress: LIVE_CHAINS.BASE.wrappedNative,
    dex: "Uniswap V2 · Base",
    referencePriceUsd: 0.00105,
    radarSymbol: "TOSHI99",
    liquidityLabel: "$18M+",
    note: "Base OG cat coin · audited · zero transfer tax",
  },
  {
    symbol: "DEGEN",
    name: "Degen (Base)",
    chain: "BASE",
    address: "0x4ed4E862860beD51a9570b96d89aF5E1B0Efefed",
    routerAddress: LIVE_CHAINS.BASE.routerAddress,
    quoteAddress: LIVE_CHAINS.BASE.wrappedNative,
    dex: "Uniswap V2 · Base",
    referencePriceUsd: 0.0042,
    liquidityLabel: "$25M+",
    note: "Farcaster-native asset · high velocity liquidity",
  },
  {
    symbol: "PEPE",
    name: "Pepe (Ethereum)",
    chain: "ETH",
    address: "0x6982508145454Ce325dDbE47a25d4ec3d2311933",
    routerAddress: LIVE_CHAINS.ETH.routerAddress,
    quoteAddress: LIVE_CHAINS.ETH.wrappedNative,
    dex: "Uniswap V2 · Ethereum",
    referencePriceUsd: 0.0000092,
    radarSymbol: "PEPE2026",
    liquidityLabel: "$90M+",
    note: "Deepest meme liquidity on Ethereum · immutable contract",
  },
  {
    symbol: "ARB",
    name: "Arbitrum (Arbitrum One)",
    chain: "ARB",
    address: "0x912CE59144191C1204E64559FE8253a0e49E6548",
    routerAddress: LIVE_CHAINS.ARB.routerAddress,
    quoteAddress: LIVE_CHAINS.ARB.wrappedNative,
    dex: "Uniswap V2 · Arbitrum",
    referencePriceUsd: 0.44,
    radarSymbol: "ARBXBT",
    liquidityLabel: "$60M+",
    note: "Governance asset with institutional depth · low gas",
  },
  {
    symbol: "BONK",
    name: "Bonk (Solana)",
    chain: "SOL",
    address: "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263",
    routerAddress: null,
    quoteAddress: null,
    dex: "Jupiter Aggregator",
    referencePriceUsd: 0.000027,
    liquidityLabel: "$45M+",
    note: "Solana OG meme · routed through Jupiter for live swaps",
  },
  {
    symbol: "WIF",
    name: "dogwifhat (Solana)",
    chain: "SOL",
    address: "EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm",
    routerAddress: null,
    quoteAddress: null,
    dex: "Jupiter Aggregator",
    referencePriceUsd: 1.72,
    liquidityLabel: "$30M+",
    note: "High-beta Solana meme · SPL standard verified",
  },
  {
    symbol: "POPCAT",
    name: "Popcat (Solana)",
    chain: "SOL",
    address: "7GCihgDB8fe6KNjn2MYtkzZcRjQy3t9GHdC8uHYmW2hr",
    routerAddress: null,
    quoteAddress: null,
    dex: "Jupiter Aggregator",
    referencePriceUsd: 0.88,
    radarSymbol: "POPCATX",
    liquidityLabel: "$22M+",
    note: "Verified SPL mint · LP burned · Jupiter routed",
  },
];

export function getLiveAsset(symbol: string): LiveAsset | undefined {
  return LIVE_ASSETS.find((a) => a.symbol === symbol);
}

export function getLiveChain(key: string): LiveChainConfig | undefined {
  return LIVE_CHAINS[key as LiveChainKey];
}

export function explorerTxUrl(chain: string, txHash: string): string {
  const cfg = getLiveChain(chain);
  if (!cfg) return txHash;
  return `${cfg.explorer}/tx/${txHash}`;
}

export function explorerAddressUrl(chain: string, address: string): string {
  const cfg = getLiveChain(chain);
  if (!cfg) return address;
  return `${cfg.explorer}/address/${address}`;
}

export function jupiterSwapUrl(asset: LiveAsset, amountSol: number): string {
  return `https://jup.ag/swap/SOL-${asset.address}?amount=${Math.max(
    0.0001,
    Number(amountSol.toFixed(4))
  )}`;
}

const UNISWAP_CHAIN_SLUG: Record<string, string> = {
  ETH: "mainnet",
  BASE: "base",
  ARB: "arbitrum",
};

/** Explorer / DEX fallback execution link for assets the in-app router can't settle. */
export function dexSwapUrl(asset: LiveAsset): string {
  if (asset.chain === "SOL") {
    return `https://jup.ag/swap/SOL-${asset.address}`;
  }
  const slug = UNISWAP_CHAIN_SLUG[asset.chain] ?? "mainnet";
  return `https://app.uniswap.org/#/swap?chain=${slug}&inputCurrency=ETH&outputCurrency=${asset.address}`;
}

export function tokenExplorerUrl(chain: string, address: string): string {
  const cfg = getLiveChain(chain);
  if (!cfg) return address;
  return chain === "SOL" ? `${cfg.explorer}/token/${address}` : `${cfg.explorer}/token/${address}`;
}

export function shortenAddress(address: string, size = 4): string {
  if (!address) return "";
  if (address.length <= size * 2 + 2) return address;
  return `${address.slice(0, size + 2)}…${address.slice(-size)}`;
}

export function amountUsdToNative(chain: LiveChainKey, amountUsd: number): number {
  const cfg = LIVE_CHAINS[chain];
  return Number((amountUsd / Math.max(1, cfg.nativeUsd)).toFixed(6));
}

export const UNISWAP_V2_ROUTER_ABI = [
  {
    inputs: [
      { internalType: "uint256", name: "amountOutMin", type: "uint256" },
      { internalType: "address[]", name: "path", type: "address[]" },
      { internalType: "address", name: "to", type: "address" },
      { internalType: "uint256", name: "deadline", type: "uint256" },
    ],
    name: "swapExactETHForTokens",
    outputs: [{ internalType: "uint256[]", name: "amounts", type: "uint256[]" }],
    stateMutability: "payable",
    type: "function",
  },
  {
    inputs: [
      { internalType: "uint256", name: "amountIn", type: "uint256" },
      { internalType: "uint256", name: "amountOutMin", type: "uint256" },
      { internalType: "address[]", name: "path", type: "address[]" },
      { internalType: "address", name: "to", type: "address" },
      { internalType: "uint256", name: "deadline", type: "uint256" },
    ],
    name: "swapExactTokensForETH",
    outputs: [{ internalType: "uint256[]", name: "amounts", type: "uint256[]" }],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      { internalType: "uint256", name: "amountIn", type: "uint256" },
      { internalType: "address[]", name: "path", type: "address[]" },
    ],
    name: "getAmountsOut",
    outputs: [{ internalType: "uint256[]", name: "amounts", type: "uint256[]" }],
    stateMutability: "view",
    type: "function",
  },
] as const;
