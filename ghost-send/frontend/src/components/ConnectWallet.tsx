import { useAccount, useConnect, useDisconnect, useSwitchChain } from "wagmi";
import { sepolia } from "wagmi/chains";

function truncateAddress(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

export function ConnectWallet() {
  const { address, isConnected, chainId } = useAccount();
  const {
    connectors,
    connect,
    isPending: isConnecting,
    error: connectError,
  } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChain, isPending: isSwitching } = useSwitchChain();

  const isWrongNetwork = isConnected && chainId !== sepolia.id;
  const injectedConnector = connectors[0];

  if (!isConnected) {
    return (
      <div className="flex flex-col items-start gap-3">
        <button
          onClick={() =>
            injectedConnector && connect({ connector: injectedConnector })
          }
          disabled={!injectedConnector || isConnecting}
          className="rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-white transition hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isConnecting ? "Connecting…" : "Connect wallet"}
        </button>
        {!injectedConnector && (
          <p className="text-xs text-muted">
            No wallet extension detected. Install MetaMask or Rabby to
            continue.
          </p>
        )}
        {connectError && (
          <p className="text-xs text-red-400">{connectError.message}</p>
        )}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3 rounded-lg border border-line bg-surface px-4 py-2.5">
      <span
        className={`h-2 w-2 shrink-0 rounded-full ${
          isWrongNetwork ? "bg-amber-400" : "bg-status"
        }`}
        aria-hidden="true"
      />
      <span className="font-mono text-sm text-ink">
        {address ? truncateAddress(address) : ""}
      </span>

      {isWrongNetwork ? (
        <button
          onClick={() => switchChain({ chainId: sepolia.id })}
          disabled={isSwitching}
          className="ml-2 rounded-md bg-amber-400/10 px-3 py-1 text-xs font-medium text-amber-300 transition hover:bg-amber-400/20 disabled:opacity-50"
        >
          {isSwitching ? "Switching…" : "Switch to Sepolia"}
        </button>
      ) : (
        <span className="ml-1 text-xs text-muted">Sepolia</span>
      )}

      <button
        onClick={() => disconnect()}
        className="ml-2 text-xs text-muted underline-offset-2 hover:text-ink hover:underline"
      >
        Disconnect
      </button>
    </div>
  );
}