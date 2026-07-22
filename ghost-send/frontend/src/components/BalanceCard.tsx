import { toFriendlyError } from "../lib/errors";
import { useState } from "react";
import { formatUnits } from "viem";
import { useConfidentialBalance } from "../hooks/useConfidentialBalance";
import { useHandleClient } from "../lib/handleClient";

const TOKEN_DECIMALS = 18;

export function BalanceCard() {
  const { handle, isLoading: isLoadingHandle, error: handleError, refetch } =
    useConfidentialBalance();
  const { handleClient, isReady } = useHandleClient();

  const [revealedValue, setRevealedValue] = useState<bigint | null>(null);
  const [isRevealing, setIsRevealing] = useState(false);
  const [revealError, setRevealError] = useState<string | null>(null);

  async function handleReveal() {
    if (!handle || !handleClient) return;
    setIsRevealing(true);
    setRevealError(null);
    try {
      // Only succeeds if the connected account is ACL-authorized for this
      // handle -- e.g. it's their own balance handle after wrap()/transfer().
      const { value } = await handleClient.decrypt(handle);
      setRevealedValue(BigInt(value));
    } catch (err) {
      setRevealError(toFriendlyError(err));
    } finally {
      setIsRevealing(false);
    }
  }

  function handleRefreshHandle() {
    setRevealedValue(null);
    setRevealError(null);
    refetch();
  }

  return (
    <div className="flex flex-col gap-4 rounded-xl border border-line bg-surface p-5">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-ink">gsUSD balance</h2>
        <span className="font-mono text-xs text-muted">confidential</span>
      </div>

      {isLoadingHandle ? (
        <p className="text-sm text-muted">Reading balance handle…</p>
      ) : handleError ? (
        <p className="text-xs text-red-400">
          {handleError.message.split("\n")[0]}
        </p>
      ) : !handle ? (
        <p className="text-sm text-muted">Connect a wallet to view balance.</p>
      ) : revealedValue !== null ? (
        <div className="flex items-center justify-between">
          <span className="font-mono text-lg text-ink">
            {formatUnits(revealedValue, TOKEN_DECIMALS)} gsUSD
          </span>
          <button
            onClick={handleRefreshHandle}
            className="text-xs text-muted underline-offset-2 hover:text-ink hover:underline"
          >
            Refresh
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <p className="font-mono text-xs text-muted break-all">
            handle: {handle}
          </p>
          <button
            onClick={handleReveal}
            disabled={!isReady || isRevealing}
            className="rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-white transition hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isRevealing ? "Decrypting…" : "Reveal balance"}
          </button>
          <p className="text-xs text-muted">
            Nothing is decrypted until you ask. The balance stays hidden
            on-chain either way.
          </p>
        </div>
      )}

      {revealError && (
        <p className="text-xs text-red-400">{revealError}</p>
      )}
    </div>
  );
}