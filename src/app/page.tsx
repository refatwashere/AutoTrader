import TradingTerminal from "@/components/TradingTerminal";
import { WalletProvider } from "@/components/wallet/WalletProvider";

export default function HomePage() {
  return (
    <WalletProvider>
      <TradingTerminal />
    </WalletProvider>
  );
}
