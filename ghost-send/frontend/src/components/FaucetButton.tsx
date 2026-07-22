import { useEffect, useState } from "react";
import { useAccount, useWaitForTransactionReceipt, useWriteContract } from "wagmi";
import { ghostFaucetToken } from "../config/contracts";
import { toFriendlyError } from "../lib/errors";

const MAX_MINT_PER_CALL = 1000; // must match GhostFaucetToken.MAX_MINT_PER_CALL

export function FaucetButton() {
  const { address, isConnected } = useAccount();
  const [amount, setAmount] = useState(MAX_MINT_PER_CALL);

  const {
    writeContract,
    data: hash,
    isPending: isSubmitting,
    error: writeError,
    reset,
  } = useWriteContract();

  const {
    isLoading: isConfirming,
    isSuccess: isConfirmed,
    error: receiptError,
  } = useWaitForTransactionReceipt({ hash });

  // Clear the previous tx's state once the user changes the amount, so an
  // old success/error message doesn't linger next to a new input value.
  useEffect(() => {
    if (hash) reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [amount]);

  function handleMint() {
    if (!address) return;
    writeContract({
      ...ghostFaucetToken,
      functionName: "mint",
      // GhostFaucetToken.mint(amount) takes WHOLE tokens (it scales by
      // decimals() internally) -- not raw wei. mint(1000) mints 1000 gFAU.
      args: [BigInt(amount)],
    });
  }

  const error = writeError ?? receiptError;
  const errorMessage = error ? toFriendlyError(error) : null;
  const isBusy = isSubmitting || isConfirming;

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-line bg-surface p-5">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-ink">Get test tokens</h2>
        <span className="font-mono text-xs text-muted">gFAU faucet</span>
      </div>

      <div className="flex items-center gap-2">
        <input
          type="number"
          min={1}
          max={MAX_MINT_PER_CALL}
          value={amount}
          onChange={(e) =>
            setAmount(
              Math.min(MAX_MINT_PER_CALL, Math.max(1, Number(e.target.value) || 1)),
            )
          }
          disabled={isBusy}
          className="w-28 rounded-lg border border-line bg-ink-bg px-3 py-2 font-mono text-sm text-ink outline-none focus:border-accent disabled:opacity-50"
        />
        <span className="text-sm text-muted">gFAU (max {MAX_MINT_PER_CALL}/call)</span>
      </div>

      <button
        onClick={handleMint}
        disabled={!isConnected || isBusy}
        className="rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-white transition hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {isSubmitting
          ? "Confirm in wallet…"
          : isConfirming
            ? "Minting…"
            : "Mint tokens"}
      </button>

      {isConfirmed && (
        <p className="text-xs text-status">
          Minted {amount} gFAU. Tokens are in your wallet now.
        </p>
      )}
      {errorMessage && (
        <p className="text-xs text-red-400">
          {errorMessage}
        </p>
      )}
    </div>
  );
}