import { http, createConfig } from "wagmi";
import { sepolia } from "wagmi/chains";
import { injected } from "wagmi/connectors";

// Generic injected connector -- works with MetaMask, Rabby, or any
// EIP-1193 wallet extension, rather than a specific wallet's SDK.
const rpcUrl = import.meta.env.VITE_SEPOLIA_RPC_URL as string | undefined;

export const wagmiConfig = createConfig({
  chains: [sepolia],
  connectors: [injected()],
  transports: {
    [sepolia.id]: rpcUrl ? http(rpcUrl) : http(),
  },
});

declare module "wagmi" {
  interface Register {
    config: typeof wagmiConfig;
  }
}