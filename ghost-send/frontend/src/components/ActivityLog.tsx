import { useCallback, useEffect, useState } from "react";
import { useAccount, usePublicClient } from "wagmi";
import { formatUnits } from "viem";
import { ghostSendWrapper } from "../config/contracts";
import { useHandleClient } from "../lib/handleClient";

const TOKEN_DECIMALS = 18;
const LOOKBACK_BLOCKS = 20_000n; // reduced from 50k -- some public RPCs cap eth_getLogs range
const CHUNK_SIZE = 999n; // this RPC provider (thirdweb's public Sepolia endpoint) caps eth_getLogs at 1000 blocks per call

interface ActivityRow {
  key: string;
  from: `0x${string}`;
  to: `0x${string}`;
  handle: `0x${string}`;
  blockNumber: bigint;
  txHash: `0x${string}`;
  revealedValue: bigint | null;
  isRevealing: boolean;
  revealError: string | null;
}

const truncate = (addr: string) => `${addr.slice(0, 6)}…${addr.slice(-4)}`;

export function ActivityLog() {
  const { address, isConnected } = useAccount();
  const publicClient = usePublicClient();
  const { handleClient } = useHandleClient();

  const [rows, setRows] = useState<ActivityRow[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const loadActivity = useCallback(async () => {
    if (!publicClient || !address) return;

    setIsLoading(true);
    setLoadError(null);

    try {
      const latestBlock = await publicClient.getBlockNumber();
      const startBlock = latestBlock > LOOKBACK_BLOCKS ? latestBlock - LOOKBACK_BLOCKS : 0n;
      const allLogs = [];

      // 1. Fetch logs in chunks to avoid RPC limits
      for (let chunkStart = startBlock; chunkStart <= latestBlock; chunkStart += CHUNK_SIZE + 1n) {
        const chunkEnd = chunkStart + CHUNK_SIZE > latestBlock ? latestBlock : chunkStart + CHUNK_SIZE;

        try {
          const [sentLogs, receivedLogs] = await Promise.all([
            publicClient.getContractEvents({
              ...ghostSendWrapper,
              eventName: "ConfidentialTransfer",
              args: { from: address },
              fromBlock: chunkStart,
              toBlock: chunkEnd,
            }),
            publicClient.getContractEvents({
              ...ghostSendWrapper,
              eventName: "ConfidentialTransfer",
              args: { to: address },
              fromBlock: chunkStart,
              toBlock: chunkEnd,
            }),
          ]);
          allLogs.push(...sentLogs, ...receivedLogs);
        } catch (error) {
          console.warn(`ActivityLog: chunk query failed (${chunkStart} - ${chunkEnd})`, error);
        }
      }

      // 2. Process, deduplicate, and format logs
      const seen = new Set<string>();
      const parsedRows: ActivityRow[] = [];

      for (const log of allLogs) {
        if (!log.transactionHash || log.blockNumber === null) continue;

        const key = `${log.transactionHash}-${log.logIndex}`;
        if (seen.has(key)) continue;
        seen.add(key);

        const [from, to, handle] = Object.values(log.args as Record<string, unknown>) as [
          `0x${string}`,
          `0x${string}`,
          `0x${string}`,
        ];

        parsedRows.push({
          key,
          from,
          to,
          handle,
          blockNumber: log.blockNumber,
          txHash: log.transactionHash,
          revealedValue: null,
          isRevealing: false,
          revealError: null,
        });
      }

      // Sort newest first
      parsedRows.sort((a, b) => Number(b.blockNumber - a.blockNumber));
      setRows(parsedRows);
    } catch (err) {
      const message = err instanceof Error ? err.message.split("\n")[0] : "Failed to load activity.";
      setLoadError(message);
    } finally {
      setIsLoading(false);
    }
  }, [publicClient, address]);

  useEffect(() => {
    if (isConnected) loadActivity();
  }, [isConnected, loadActivity]);

  const handleReveal = async (key: string) => {
    const row = rows.find((r) => r.key === key);
    if (!row || !handleClient) return;

    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, isRevealing: true, revealError: null } : r)));

    try {
      const { value } = await handleClient.decrypt(row.handle);
      setRows((prev) =>
        prev.map((r) => (r.key === key ? { ...r, revealedValue: BigInt(value), isRevealing: false } : r)),
      );
    } catch {
      // Not surfacing the raw contract revert text here -- it's long,
      // technical, and reads like something is broken. The real reason is
      // architectural: wrap()/transfer() only grant TRANSIENT decrypt
      // access (one transaction only) to the handle emitted in a
      // ConfidentialTransfer event. By the time this reveal button runs,
      // in a later separate transaction, that access is gone -- this is
      // expected behavior of the ACL model, not a bug in this app. Only
      // the *current* balance (via BalanceCard) reliably stays decryptable.
      setRows((prev) =>
        prev.map((r) =>
          r.key === key
            ? {
                ...r,
                isRevealing: false,
                revealError:
                  "Not decryptable from here -- only a transfer's live participants can reveal it, and only in the same transaction it happened in.",
              }
            : r,
        ),
      );
    }
  };

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-line bg-surface p-5">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-ink">Activity</h2>
        <button
          onClick={loadActivity}
          disabled={!isConnected || isLoading}
          className="text-xs text-muted underline-offset-2 hover:text-ink hover:underline disabled:opacity-50"
        >
          {isLoading ? "Loading…" : "Refresh"}
        </button>
      </div>

      <p className="text-xs text-muted">
        Transfers you sent or received in roughly the last {LOOKBACK_BLOCKS.toString()} blocks.
        Some older entries may not be individually decryptable -- see the note below on entries
        that can't reveal.
      </p>

      {loadError && <p className="text-xs text-red-400">{loadError}</p>}

      {!isLoading && rows.length === 0 && !loadError && (
        <p className="text-sm text-muted">No private transfers found yet.</p>
      )}

      <ul className="flex flex-col gap-2">
        {rows.map((row) => {
          const isSender = row.from === address;
          const direction = isSender ? "Sent to" : "Received from";
          const counterparty = isSender ? row.to : row.from;

          return (
            <li
              key={row.key}
              className="flex flex-col gap-2 rounded-lg border border-line bg-ink-bg p-3"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="min-w-0 truncate text-xs text-ink">
                  {direction} <span className="font-mono text-muted">{truncate(counterparty)}</span>
                </span>
                
                <a
                  href={`https://sepolia.etherscan.io/tx/${row.txHash}`}
                  target="_blank"
                  rel="noreferrer"
                  className="shrink-0 font-mono text-[10px] text-muted hover:text-accent hover:underline"
                >
                  {truncate(row.txHash)}
                </a>
              </div>

              <div className="flex items-center justify-between gap-2">
                {row.revealedValue !== null ? (
                  <span className="font-mono text-sm text-ink">
                    {formatUnits(row.revealedValue, TOKEN_DECIMALS)} gsUSD
                  </span>
                ) : (
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm tracking-widest text-muted">•••</span>
                    <button
                      onClick={() => handleReveal(row.key)}
                      disabled={row.isRevealing}
                      className="text-xs text-accent hover:underline disabled:opacity-50"
                    >
                      {row.isRevealing ? "…" : "Reveal"}
                    </button>
                  </div>
                )}
              </div>

              {row.revealError && (
                <p className="break-words text-xs text-muted">{row.revealError}</p>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}