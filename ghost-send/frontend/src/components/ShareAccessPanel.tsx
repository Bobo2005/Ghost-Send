import { useCallback, useEffect, useState } from "react";
import {
  useAccount,
  usePublicClient,
  useWaitForTransactionReceipt,
  useWriteContract,
} from "wagmi";
import { isAddress } from "viem";
import { ghostSendWrapper } from "../config/contracts";
import { toFriendlyError } from "../lib/errors";

const LOOKBACK_BLOCKS = 20_000n;
const CHUNK_SIZE = 999n; // same RPC limit discovered in ActivityLog

interface SharedRow {
  key: string;
  viewer: `0x${string}`;
  blockNumber: bigint;
  txHash: `0x${string}`;
}

const truncate = (addr: string) => `${addr.slice(0, 6)}…${addr.slice(-4)}`;

export function ShareAccessPanel() {
  const { address, isConnected } = useAccount();
  const publicClient = usePublicClient();

  const [viewerInput, setViewerInput] = useState("");
  const [confirmed, setConfirmed] = useState(false);

  const {
    writeContract,
    data: hash,
    isPending: isSubmitting,
    error: writeError,
    reset,
  } = useWriteContract();
  const {
    isLoading: isConfirming,
    isSuccess,
    error: receiptError,
  } = useWaitForTransactionReceipt({ hash });

  const [sharedRows, setSharedRows] = useState<SharedRow[]>([]);
  const [isLoadingShared, setIsLoadingShared] = useState(false);
  const [loadSharedError, setLoadSharedError] = useState<string | null>(null);

  const viewerValid = isAddress(viewerInput);

  const loadShared = useCallback(async () => {
    if (!publicClient || !address) return;
    setIsLoadingShared(true);
    setLoadSharedError(null);
    try {
      const latestBlock = await publicClient.getBlockNumber();
      const startBlock =
        latestBlock > LOOKBACK_BLOCKS ? latestBlock - LOOKBACK_BLOCKS : 0n;
      const allLogs = [];

      for (
        let chunkStart = startBlock;
        chunkStart <= latestBlock;
        chunkStart += CHUNK_SIZE + 1n
      ) {
        const chunkEnd =
          chunkStart + CHUNK_SIZE > latestBlock
            ? latestBlock
            : chunkStart + CHUNK_SIZE;
        try {
          const logs = await publicClient.getContractEvents({
            ...ghostSendWrapper,
            eventName: "ViewAccessGranted",
            args: { owner: address },
            fromBlock: chunkStart,
            toBlock: chunkEnd,
          });
          allLogs.push(...logs);
        } catch (err) {
          console.warn(
            `ShareAccessPanel: chunk query failed (${chunkStart} - ${chunkEnd})`,
            err,
          );
        }
      }

      const seen = new Set<string>();
      const rows: SharedRow[] = [];
      for (const log of allLogs) {
        if (!log.transactionHash || log.blockNumber === null) continue;
        const key = `${log.transactionHash}-${log.logIndex}`;
        if (seen.has(key)) continue;
        seen.add(key);
        // Read by position, not name -- ViewAccessGranted(address indexed owner, address indexed viewer)
        const [, viewer] = Object.values(log.args as Record<string, unknown>) as [
          `0x${string}`,
          `0x${string}`,
        ];
        rows.push({
          key,
          viewer,
          blockNumber: log.blockNumber,
          txHash: log.transactionHash,
        });
      }
      rows.sort((a, b) => Number(b.blockNumber - a.blockNumber));
      setSharedRows(rows);
    } catch (err) {
      setLoadSharedError(toFriendlyError(err));
    } finally {
      setIsLoadingShared(false);
    }
  }, [publicClient, address]);

  useEffect(() => {
    if (isConnected) loadShared();
  }, [isConnected, loadShared]);

  useEffect(() => {
    if (isSuccess) {
      setViewerInput("");
      setConfirmed(false);
      loadShared();
    }
  }, [isSuccess, loadShared]);

  function handleGrant() {
    if (!viewerValid || !confirmed) return;
    writeContract({
      ...ghostSendWrapper,
      functionName: "grantBalanceView",
      args: [viewerInput as `0x${string}`],
    });
  }

  function handleReset() {
    reset();
    setViewerInput("");
    setConfirmed(false);
  }

  const isBusy = isSubmitting || isConfirming;
  const rawError = writeError ?? receiptError;
  const errorMessage = rawError ? toFriendlyError(rawError) : null;

  return (
    <div className="flex flex-col gap-4 rounded-xl border border-line bg-surface p-5">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-ink">Share balance view</h2>
        <span className="font-mono text-xs text-muted">confidential</span>
      </div>

      {isSuccess ? (
        <div className="flex flex-col gap-2">
          <p className="text-sm text-status">View access granted.</p>
          <button
            onClick={handleReset}
            className="self-start text-xs text-muted underline-offset-2 hover:text-ink hover:underline"
          >
            Share with someone else
          </button>
        </div>
      ) : (
        <>
          <label className="flex flex-col gap-1.5">
            <span className="text-xs text-muted">
              Address to grant view access to
            </span>
            <input
              type="text"
              value={viewerInput}
              onChange={(e) => {
                setViewerInput(e.target.value.trim());
                setConfirmed(false);
              }}
              disabled={isBusy}
              placeholder="0x…"
              className="rounded-lg border border-line bg-ink-bg px-3 py-2 font-mono text-sm text-ink outline-none focus:border-accent disabled:opacity-50"
            />
            {viewerInput.length > 0 && !viewerValid && (
              <span className="text-xs text-red-400">Not a valid address.</span>
            )}
          </label>

          {viewerValid && (
            <div className="rounded-lg border border-amber-400/20 bg-amber-400/5 p-3">
              <label className="flex items-start gap-2 text-xs text-amber-300">
                <input
                  type="checkbox"
                  checked={confirmed}
                  onChange={(e) => setConfirmed(e.target.checked)}
                  className="mt-0.5"
                />
                <span>
                  This is permanent.{" "}
                  <span className="font-mono">{truncate(viewerInput)}</span> will
                  be able to see your current confidential balance at any time,
                  and this cannot be undone.
                </span>
              </label>
            </div>
          )}

          <button
            onClick={handleGrant}
            disabled={!isConnected || !viewerValid || !confirmed || isBusy}
            className="rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-white transition hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isSubmitting
              ? "Confirm in wallet…"
              : isConfirming
                ? "Granting…"
                : "Grant view access"}
          </button>

          {errorMessage && (
            <p className="text-xs text-red-400">{errorMessage}</p>
          )}
        </>
      )}

      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted">Shared with</span>
          <button
            onClick={loadShared}
            disabled={!isConnected || isLoadingShared}
            className="text-xs text-muted underline-offset-2 hover:text-ink hover:underline disabled:opacity-50"
          >
            {isLoadingShared ? "Loading…" : "Refresh"}
          </button>
        </div>

        {loadSharedError && (
          <p className="text-xs text-red-400">{loadSharedError}</p>
        )}

        {!isLoadingShared && sharedRows.length === 0 && !loadSharedError && (
          <p className="text-sm text-muted">Nobody yet.</p>
        )}

        <ul className="flex flex-col gap-2">
          {sharedRows.map((row) => (
            <li
              key={row.key}
              className="flex items-center justify-between rounded-lg border border-line bg-ink-bg px-3 py-2"
            >
              <span className="font-mono text-sm text-ink">
                {truncate(row.viewer)}
              </span>
              
              <a
                href={`https://sepolia.etherscan.io/tx/${row.txHash}`}
                target="_blank"
                rel="noreferrer"
                className="font-mono text-[10px] text-muted hover:text-accent hover:underline"
              >
                {truncate(row.txHash)}
              </a>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}