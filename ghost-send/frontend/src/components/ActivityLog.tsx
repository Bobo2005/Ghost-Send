import { useCallback, useEffect, useState } from "react";
import { useAccount, usePublicClient } from "wagmi";
import { formatUnits } from "viem";
import { ghostSendWrapper } from "../config/contracts";
import { useHandleClient } from "../lib/handleClient";

const TOKEN_DECIMALS = 18;
const LOOKBACK_BLOCKS = 50_000n; // roughly a week on Sepolia -- older transfers won't show here

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

function truncate(addr: string): string {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

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
      const fromBlock =
        latestBlock > LOOKBACK_BLOCKS ? latestBlock - LOOKBACK_BLOCKS : 0n;

      const [sentLogs, receivedLogs] = await Promise.all([
        publicClient.getContractEvents({
          ...ghostSendWrapper,
          eventName: "ConfidentialTransfer",
          args: { from: address },
          fromBlock,
          toBlock: latestBlock,
        }),
        publicClient.getContractEvents({
          ...ghostSendWrapper,
          eventName: "ConfidentialTransfer",
          args: { to: address },
          fromBlock,
          toBlock: latestBlock,
        }),
      ]);

      const merged = [...sentLogs, ...receivedLogs];
      const seen = new Set<string>();
      const nextRows: ActivityRow[] = [];
      for (const log of merged) {
        const key = `${log.transactionHash}-${log.logIndex}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const args = log.args as {
          from: `0x${string}`;
          to: `0x${string}`;
          amount: `0x${string}`;
        };
        nextRows.push({
          key,
          from: args.from,
          to: args.to,
          handle: args.amount, // this is the confidential handle, not a plaintext number
          blockNumber: log.blockNumber!,
          txHash: log.transactionHash!,
          revealedValue: null,
          isRevealing: false,
          revealError: null,
        });
      }
      nextRows.sort((a, b) => (b.blockNumber > a.blockNumber ? 1 : -1));
      setRows(nextRows);
    } catch (err) {
      setLoadError(
        err instanceof Error ? err.message.split("\n")[0] : "Failed to load activity.",
      );
    } finally {
      setIsLoading(false);
    }
  }, [publicClient, address]);

  useEffect(() => {
    if (isConnected) loadActivity();
  }, [isConnected, loadActivity]);

  async function handleReveal(key: string) {
    const row = rows.find((r) => r.key === key);
    if (!row || !handleClient) return;
    setRows((prev) =>
      prev.map((r) =>
        r.key === key ? { ...r, isRevealing: true, revealError: null } : r,
      ),
    );
    try {
      const { value } = await handleClient.decrypt(row.handle);
      setRows((prev) =>
        prev.map((r) =>
          r.key === key
            ? { ...r, revealedValue: BigInt(value), isRevealing: false }
            : r,
        ),
      );
    } catch (err) {
      setRows((prev) =>
        prev.map((r) =>
          r.key === key
            ? {
                ...r,
                isRevealing: false,
                revealError:
                  err instanceof Error ? err.message.split("\n")[0] : "Couldn't reveal.",
              }
            : r,
        ),
      );
    }
  }

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
        Transfers you sent or received in roughly the last{" "}
        {LOOKBACK_BLOCKS.toString()} blocks. Amounts stay hidden until you
        reveal each one.
      </p>

      {loadError && <p className="text-xs text-red-400">{loadError}</p>}

      {!isLoading && rows.length === 0 && !loadError && (
        <p className="text-sm text-muted">No private transfers found yet.</p>
      )}

      <ul className="flex flex-col gap-2">
        {rows.map((row) => {
          const direction = row.from === address ? "Sent to" : "Received from";
          const counterparty = row.from === address ? row.to : row.from;
          return (
            <li
              key={row.key}
              className="flex items-center justify-between rounded-lg border border-line bg-ink-bg px-3 py-2"
            >
              <div className="flex flex-col">
                <span className="text-xs text-ink">
                  {direction}{" "}
                  <span className="font-mono text-muted">
                    {truncate(counterparty)}
                  </span>
                </span>
                <span className="font-mono text-[10px] text-muted">
                  {truncate(row.txHash)}
                </span>
              </div>

              {row.revealedValue !== null ? (
                <span className="font-mono text-sm text-ink">
                  {formatUnits(row.revealedValue, TOKEN_DECIMALS)} gsUSD
                </span>
              ) : (
                <div className="flex items-center gap-2">
                  <span className="font-mono text-sm tracking-widest text-muted">
                    •••
                  </span>
                  <button
                    onClick={() => handleReveal(row.key)}
                    disabled={row.isRevealing}
                    className="text-xs text-accent hover:underline disabled:opacity-50"
                  >
                    {row.isRevealing ? "…" : "Reveal"}
                  </button>
                </div>
              )}
              {row.revealError && (
                <span className="text-xs text-red-400">{row.revealError}</span>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}