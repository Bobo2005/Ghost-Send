import { toFriendlyError } from "../lib/errors";
import { useState } from "react";
import { useAccount, useWaitForTransactionReceipt, useWriteContract } from "wagmi";
import { parseUnits, isAddress } from "viem";
import { ghostSendWrapper } from "../config/contracts";
import { useHandleClient } from "../lib/handleClient";

const TOKEN_DECIMALS = 18;

export function PrivateSendPanel() {
  const { address, isConnected } = useAccount();
  const { handleClient, isReady } = useHandleClient();

  const [recipient, setRecipient] = useState("");
  const [amountInput, setAmountInput] = useState("");
  const [isEncrypting, setIsEncrypting] = useState(false);
  const [encryptError, setEncryptError] = useState<unknown>(null);
  const [lastSentTo, setLastSentTo] = useState<string | null>(null);

  const {
    writeContract,
    data: hash,
    isPending: isSubmitting,
    error: writeError,
    reset,
  } = useWriteContract();
  const {
    isLoading: isConfirming,
    isSuccess: isSent,
    error: receiptError,
  } = useWaitForTransactionReceipt({ hash });

  const recipientValid = isAddress(recipient);

  let parsedAmount: bigint | null = null;
  try {
    if (amountInput.trim() !== "") {
      parsedAmount = parseUnits(amountInput, TOKEN_DECIMALS);
    }
  } catch {
    parsedAmount = null;
  }

  async function handleSend() {
    if (!handleClient || !parsedAmount || !recipientValid || !address) return;
    setEncryptError(null);
    setIsEncrypting(true);
    try {
      // The third arg is the contract that will validate this proof --
      // must be the wrapper (it's the one calling Nox internally), not the
      // recipient or the connected wallet.
      const { handle, handleProof } = await handleClient.encryptInput(
        parsedAmount,
        "uint256",
        ghostSendWrapper.address,
      );
      setLastSentTo(recipient);
      writeContract({
        ...ghostSendWrapper,
        functionName: "confidentialTransfer",
        args: [recipient as `0x${string}`, handle, handleProof],
      });
    } catch (err) {
      setEncryptError(err);
    } finally {
      setIsEncrypting(false);
    }
  }

  function handleReset() {
    reset();
    setAmountInput("");
    setRecipient("");
    setEncryptError(null);
    setLastSentTo(null);
  }

  const isBusy = isEncrypting || isSubmitting || isConfirming;
  const rawError = encryptError ?? writeError ?? receiptError;
  const error = rawError ? toFriendlyError(rawError) : null;

  return (
    <div className="flex flex-col gap-4 rounded-xl border border-line bg-surface p-5">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-ink">Private send</h2>
        <span className="font-mono text-xs text-muted">confidential</span>
      </div>

      {isSent ? (
        <div className="flex flex-col gap-2">
          <p className="text-sm text-ink">
            Sent <span className="font-mono text-lg tracking-wider">•••</span>{" "}
            gsUSD to{" "}
            <span className="font-mono text-xs text-muted break-all">
              {lastSentTo}
            </span>
          </p>
          <p className="text-xs text-muted">
            The amount is hidden on-chain. Only you and the recipient can
            reveal it, each from your own balance card.
          </p>
          <button
            onClick={handleReset}
            className="self-start text-xs text-muted underline-offset-2 hover:text-ink hover:underline"
          >
            Send another
          </button>
        </div>
      ) : (
        <>
          <label className="flex flex-col gap-1.5">
            <span className="text-xs text-muted">Recipient address</span>
            <input
              type="text"
              value={recipient}
              onChange={(e) => setRecipient(e.target.value.trim())}
              disabled={isBusy}
              placeholder="0x…"
              className="rounded-lg border border-line bg-ink-bg px-3 py-2 font-mono text-sm text-ink outline-none focus:border-accent disabled:opacity-50"
            />
            {recipient.length > 0 && !recipientValid && (
              <span className="text-xs text-red-400">Not a valid address.</span>
            )}
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-xs text-muted">Amount (gsUSD)</span>
            <input
              type="text"
              inputMode="decimal"
              value={amountInput}
              onChange={(e) => setAmountInput(e.target.value)}
              disabled={isBusy}
              placeholder="50"
              className="rounded-lg border border-line bg-ink-bg px-3 py-2 font-mono text-sm text-ink outline-none focus:border-accent disabled:opacity-50"
            />
          </label>

          <button
            onClick={handleSend}
            disabled={
              !isConnected || !isReady || !recipientValid || !parsedAmount || isBusy
            }
            className="rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-white transition hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isEncrypting
              ? "Encrypting amount…"
              : isSubmitting
                ? "Confirm in wallet…"
                : isConfirming
                  ? "Sending…"
                  : "Send privately"}
          </button>

          {!isReady && isConnected && (
            <p className="text-xs text-muted">Setting up secure client…</p>
          )}
          {error && <p className="text-xs text-red-400">{error}</p>}
        </>
      )}
    </div>
  );
}