import { toFriendlyError } from "../lib/errors";
import { useEffect, useState } from "react";
import {
  useAccount,
  useReadContract,
  useWaitForTransactionReceipt,
  useWriteContract,
} from "wagmi";
import { parseUnits } from "viem";
import { ghostFaucetToken, ghostSendWrapper } from "../config/contracts";

const TOKEN_DECIMALS = 18;

type Step = "approve" | "wrap";

export function WrapPanel({ onWrapped }: { onWrapped?: () => void }) {
  const { address, isConnected } = useAccount();
  const [amountInput, setAmountInput] = useState("100");

  let parsedAmount: bigint | null = null;
  try {
    if (amountInput.trim() !== "") {
      parsedAmount = parseUnits(amountInput, TOKEN_DECIMALS);
    }
  } catch {
    parsedAmount = null; // invalid number typed mid-edit; treat as not-ready
  }

  const { data: allowance, refetch: refetchAllowance } = useReadContract({
    ...ghostFaucetToken,
    functionName: "allowance",
    args: address ? [address, ghostSendWrapper.address] : undefined,
    query: { enabled: isConnected && !!address },
  });

  const needsApproval =
    parsedAmount !== null &&
    (allowance === undefined || (allowance as bigint) < parsedAmount);

  const currentStep: Step = needsApproval ? "approve" : "wrap";

  const approveWrite = useWriteContract();
  const approveReceipt = useWaitForTransactionReceipt({
    hash: approveWrite.data,
  });

  const wrapWrite = useWriteContract();
  const wrapReceipt = useWaitForTransactionReceipt({ hash: wrapWrite.data });

  // Once an approve tx confirms, refresh the on-chain allowance so the
  // component naturally advances to the "wrap" step.
  useEffect(() => {
    if (approveReceipt.isSuccess) refetchAllowance();
  }, [approveReceipt.isSuccess, refetchAllowance]);

  useEffect(() => {
    if (wrapReceipt.isSuccess) {
      onWrapped?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wrapReceipt.isSuccess]);

  function handleApprove() {
    if (!parsedAmount) return;
    approveWrite.writeContract({
      ...ghostFaucetToken,
      functionName: "approve",
      args: [ghostSendWrapper.address, parsedAmount],
    });
  }

  function handleWrap() {
    if (!address || !parsedAmount) return;
    wrapWrite.writeContract({
      ...ghostSendWrapper,
      functionName: "wrap",
      // wrap()'s amount is RAW token units (already scaled by decimals),
      // unlike the faucet's mint() which takes whole tokens.
      args: [address, parsedAmount],
    });
  }

  const isApproveBusy = approveWrite.isPending || approveReceipt.isLoading;
  const isWrapBusy = wrapWrite.isPending || wrapReceipt.isLoading;
  const error = approveWrite.error ?? wrapWrite.error;
  const errorMessage = error ? toFriendlyError(error) : null;

  return (
    <div className="flex flex-col gap-4 rounded-xl border border-line bg-surface p-5">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-ink">Wrap to gsUSD</h2>
        <span className="font-mono text-xs text-muted">confidential</span>
      </div>

      <label className="flex flex-col gap-1.5">
        <span className="text-xs text-muted">Amount (gFAU)</span>
        <input
          type="text"
          inputMode="decimal"
          value={amountInput}
          onChange={(e) => setAmountInput(e.target.value)}
          disabled={isApproveBusy || isWrapBusy}
          placeholder="100"
          className="rounded-lg border border-line bg-ink-bg px-3 py-2 font-mono text-sm text-ink outline-none focus:border-accent disabled:opacity-50"
        />
      </label>

      {/* Step indicator */}
      <div className="flex items-center gap-2 text-xs">
        <StepDot
          label="1. Approve"
          active={currentStep === "approve"}
          done={!needsApproval}
        />
        <div className="h-px flex-1 bg-line" />
        <StepDot
          label="2. Wrap"
          active={currentStep === "wrap"}
          done={wrapReceipt.isSuccess}
        />
      </div>

      {currentStep === "approve" ? (
        <button
          onClick={handleApprove}
          disabled={!isConnected || !parsedAmount || isApproveBusy}
          className="rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-white transition hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {approveWrite.isPending
            ? "Confirm in wallet…"
            : approveReceipt.isLoading
              ? "Approving…"
              : "Approve gFAU"}
        </button>
      ) : (
        <button
          onClick={handleWrap}
          disabled={!isConnected || !parsedAmount || isWrapBusy}
          className="rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-white transition hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {wrapWrite.isPending
            ? "Confirm in wallet…"
            : wrapReceipt.isLoading
              ? "Wrapping…"
              : "Wrap tokens"}
        </button>
      )}

      {wrapReceipt.isSuccess && (
        <p className="text-xs text-status">
          Wrapped {amountInput} gFAU into confidential gsUSD.
        </p>
      )}
      {errorMessage && (
        <p className="text-xs text-red-400">{errorMessage}</p>
      )}
    </div>
  );
}

function StepDot({
  label,
  active,
  done,
}: {
  label: string;
  active: boolean;
  done: boolean;
}) {
  return (
    <span
      className={`flex items-center gap-1.5 ${
        done ? "text-status" : active ? "text-ink" : "text-muted"
      }`}
    >
      <span
        className={`h-1.5 w-1.5 rounded-full ${
          done ? "bg-status" : active ? "bg-accent" : "bg-line"
        }`}
      />
      {label}
    </span>
  );
}