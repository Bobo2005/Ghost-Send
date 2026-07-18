import { WagmiProvider } from "wagmi";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { wagmiConfig } from "./config/wagmi";
import { ConnectWallet } from "./components/ConnectWallet";
import { FaucetButton } from "./components/FaucetButton";
import { WrapPanel } from "./components/WrapPanel";
import { BalanceCard } from "./components/BalanceCard";
import { PrivateSendPanel } from "./components/PrivateSendPanel";
import { UnwrapPanel } from "./components/UnwrapPanel";
import { ActivityLog } from "./components/ActivityLog";

const queryClient = new QueryClient();

export default function App() {
  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <div className="flex min-h-screen flex-col items-center gap-4 bg-ink-bg p-6">
          <div className="w-full max-w-sm">
            <div className="mb-4 flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-status" />
              <span className="text-xs font-medium uppercase tracking-wider text-muted">
                Ghost Send
              </span>
            </div>
            <ConnectWallet />
          </div>

          <div className="flex w-full max-w-sm flex-col gap-4">
            <FaucetButton />
            <WrapPanel />
            <BalanceCard />
            <PrivateSendPanel />
            <UnwrapPanel />
            <ActivityLog />
          </div>
        </div>
      </QueryClientProvider>
    </WagmiProvider>
  );
}