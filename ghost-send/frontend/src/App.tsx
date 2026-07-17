import { WagmiProvider } from "wagmi";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { wagmiConfig } from "./config/wagmi";
import { ConnectWallet } from "./components/ConnectWallet";

const queryClient = new QueryClient();

export default function App() {
  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <div className="flex min-h-screen items-center justify-center bg-ink-bg p-6">
          <div className="w-full max-w-sm rounded-2xl border border-line bg-surface p-8 shadow-2xl shadow-black/40">
            <div className="mb-6 flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-status" />
              <span className="text-xs font-medium uppercase tracking-wider text-muted">
                Ghost Send
              </span>
            </div>
            <h1 className="mb-1 text-xl font-semibold text-ink">
              Connect your wallet
            </h1>
            <p className="mb-6 text-sm text-muted">
              Ghost Send works alongside MetaMask or Rabby — nothing is
              modified, nothing leaves your wallet.
            </p>
            <ConnectWallet />
          </div>
        </div>
      </QueryClientProvider>
    </WagmiProvider>
  );
}