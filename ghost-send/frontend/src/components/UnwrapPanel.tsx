// import { useEffect, useRef, useState } from "react";
// import {
//   useAccount,
//   usePublicClient,
//   useWaitForTransactionReceipt,
//   useWriteContract,
// } from "wagmi";
// import { parseUnits, parseEventLogs, zeroAddress } from "viem";
// import { ghostSendWrapper } from "../config/contracts";
// import { useHandleClient } from "../lib/handleClient";

// const TOKEN_DECIMALS = 18;
// const POLL_INTERVAL_MS = 5000;

// type Phase = "idle" | "requesting" | "waiting-finalize" | "finalized" | "error";

// export function UnwrapPanel() {
//   const { address, isConnected } = useAccount();
//   const publicClient = usePublicClient();
//   const { handleClient, isReady } = useHandleClient();

//   const [amountInput, setAmountInput] = useState("");
//   const [phase, setPhase] = useState<Phase>("idle");
//   const [errorMessage, setErrorMessage] = useState<string | null>(null);
//   const [unwrapRequestId, setUnwrapRequestId] = useState<`0x${string}` | null>(
//     null,
//   );
//   const [manualProof, setManualProof] = useState("");

//   const {
//     writeContract,
//     data: hash,
//     isPending: isSubmitting,
//     error: writeError,
//   } = useWriteContract();
//   const { data: receipt, isLoading: isConfirming, error: receiptError } =
//     useWaitForTransactionReceipt({ hash });

//   const finalizeWrite = useWriteContract();
//   const finalizeReceipt = useWaitForTransactionReceipt({
//     hash: finalizeWrite.data,
//   });

//   const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

//   let parsedAmount: bigint | null = null;
//   try {
//     if (amountInput.trim() !== "") {
//       parsedAmount = parseUnits(amountInput, TOKEN_DECIMALS);
//     }
//   } catch {
//     parsedAmount = null;
//   }

//   // Pull the request id out of UnwrapRequested once the unwrap() tx confirms.
//   useEffect(() => {
//     if (!receipt || phase !== "requesting") return;
//     try {
//       const [event] = parseEventLogs({
//         abi: ghostSendWrapper.abi,
//         eventName: "UnwrapRequested",
//         logs: receipt.logs,
//       });
//       const requestId = (event.args as { unwrapAmount: `0x${string}` })
//         .unwrapAmount;
//       setUnwrapRequestId(requestId);
//       setPhase("waiting-finalize");
//     } catch {
//       setErrorMessage(
//         "Unwrap request sent, but couldn't read the request id from the transaction.",
//       );
//       setPhase("error");
//     }
//     // eslint-disable-next-line react-hooks/exhaustive-deps
//   }, [receipt]);

//   // Poll on-chain for completion. This only flips once *someone* calls
//   // finalizeUnwrap() successfully -- see the honest note in the UI below.
//   useEffect(() => {
//     if (phase !== "waiting-finalize" || !unwrapRequestId || !publicClient) return;

//     async function poll() {
//       const requester = await publicClient!.readContract({
//         ...ghostSendWrapper,
//         functionName: "unwrapRequester",
//         args: [unwrapRequestId!],
//       });
//       if (requester === zeroAddress) {
//         setPhase("finalized");
//         if (pollRef.current) clearInterval(pollRef.current);
//       }
//     }

//     poll();
//     pollRef.current = setInterval(poll, POLL_INTERVAL_MS);
//     return () => {
//       if (pollRef.current) clearInterval(pollRef.current);
//     };
//   }, [phase, unwrapRequestId, publicClient]);

//   useEffect(() => {
//     if (finalizeReceipt.isSuccess) {
//       setPhase("finalized");
//       if (pollRef.current) clearInterval(pollRef.current);
//     }
//   }, [finalizeReceipt.isSuccess]);

//   async function handleRequestUnwrap() {
//     if (!handleClient || !parsedAmount || !address) return;
//     setErrorMessage(null);
//     setPhase("requesting");
//     try {
//       const { handle, handleProof } = await handleClient.encryptInput(
//         parsedAmount,
//         "uint256",
//         ghostSendWrapper.address,
//       );
//       writeContract({
//         ...ghostSendWrapper,
//         functionName: "unwrap",
//         args: [address, address, handle, handleProof],
//       });
//     } catch (err) {
//       setErrorMessage(
//         err instanceof Error ? err.message.split("\n")[0] : "Failed to encrypt amount.",
//       );
//       setPhase("error");
//     }
//   }

//   function handleManualFinalize() {
//     if (!unwrapRequestId || !manualProof) return;
//     finalizeWrite.writeContract({
//       ...ghostSendWrapper,
//       functionName: "finalizeUnwrap",
//       args: [unwrapRequestId, manualProof as `0x${string}`],
//     });
//   }

//   function handleReset() {
//     setAmountInput("");
//     setPhase("idle");
//     setErrorMessage(null);
//     setUnwrapRequestId(null);
//     setManualProof("");
//   }

//   const submitError = writeError ?? receiptError;

//   return (
//     <div className="flex flex-col gap-4 rounded-xl border border-line bg-surface p-5">
//       <div className="flex items-center justify-between">
//         <h2 className="text-sm font-semibold text-ink">Unwrap to gFAU</h2>
//         <span className="font-mono text-xs text-muted">confidential → public</span>
//       </div>

//       {phase === "idle" && (
//         <>
//           <label className="flex flex-col gap-1.5">
//             <span className="text-xs text-muted">Amount (gsUSD)</span>
//             <input
//               type="text"
//               inputMode="decimal"
//               value={amountInput}
//               onChange={(e) => setAmountInput(e.target.value)}
//               placeholder="50"
//               className="rounded-lg border border-line bg-ink-bg px-3 py-2 font-mono text-sm text-ink outline-none focus:border-accent"
//             />
//           </label>
//           <button
//             onClick={handleRequestUnwrap}
//             disabled={!isConnected || !isReady || !parsedAmount}
//             className="rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-white transition hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-50"
//           >
//             Request unwrap
//           </button>
//         </>
//       )}

//       {phase === "requesting" && (
//         <p className="text-sm text-muted">
//           {isSubmitting ? "Confirm in wallet…" : "Submitting unwrap request…"}
//         </p>
//       )}

//       {phase === "waiting-finalize" && (
//         <div className="flex flex-col gap-3">
//           <p className="text-sm text-ink">
//             Unwrap requested. Watching on-chain for it to complete…
//           </p>
//           <p className="font-mono text-xs text-muted break-all">
//             request id: {unwrapRequestId}
//           </p>

//           <div className="rounded-lg border border-amber-400/20 bg-amber-400/5 p-3">
//             <p className="text-xs text-amber-300">
//               <strong>Honest gap, not a bug:</strong> finalizing this unwrap
//               needs a decryption proof signed by the Nox gateway/TEE. I
//               couldn't find a client-side way to produce or fetch that proof
//               in <code>@iexec-nox/handle</code> — on a real network, iExec's
//               own off-chain infrastructure is expected to watch for this
//               request and call <code>finalizeUnwrap</code> automatically. This
//               panel polls the contract every few seconds and updates itself
//               the moment that happens. If you already have a signed proof
//               from elsewhere, you can submit it manually below.
//             </p>
//           </div>

//           <details className="text-xs text-muted">
//             <summary className="cursor-pointer text-muted hover:text-ink">
//               Manually submit a decryption proof
//             </summary>
//             <div className="mt-2 flex flex-col gap-2">
//               <input
//                 type="text"
//                 value={manualProof}
//                 onChange={(e) => setManualProof(e.target.value.trim())}
//                 placeholder="0x… (signature + decrypted amount)"
//                 className="rounded-lg border border-line bg-ink-bg px-3 py-2 font-mono text-xs text-ink outline-none focus:border-accent"
//               />
//               <button
//                 onClick={handleManualFinalize}
//                 disabled={!manualProof || finalizeWrite.isPending}
//                 className="self-start rounded-lg border border-line px-3 py-1.5 text-xs text-ink hover:border-accent disabled:opacity-50"
//               >
//                 {finalizeWrite.isPending ? "Submitting…" : "Finalize with this proof"}
//               </button>
//               {finalizeWrite.error && (
//                 <p className="text-red-400">
//                   {finalizeWrite.error.message.split("\n")[0]}
//                 </p>
//               )}
//             </div>
//           </details>
//         </div>
//       )}

//       {phase === "finalized" && (
//         <div className="flex flex-col gap-2">
//           <p className="text-sm text-status">
//             Unwrapped. gFAU is back in your wallet.
//           </p>
//           <button
//             onClick={handleReset}
//             className="self-start text-xs text-muted underline-offset-2 hover:text-ink hover:underline"
//           >
//             Unwrap more
//           </button>
//         </div>
//       )}

//       {(errorMessage || submitError) && (
//         <p className="text-xs text-red-400">
//           {errorMessage ?? submitError?.message.split("\n")[0]}
//         </p>
//       )}
//     </div>
//   );
// } 
import { toFriendlyError } from "../lib/errors";
import { useEffect, useRef, useState } from "react";
import {
  useAccount,
  usePublicClient,
  useWaitForTransactionReceipt,
  useWriteContract,
} from "wagmi";
import { parseUnits, parseEventLogs, zeroAddress } from "viem";
import { ghostSendWrapper } from "../config/contracts";
import { useHandleClient } from "../lib/handleClient";

const TOKEN_DECIMALS = 18;
const POLL_INTERVAL_MS = 5000;

type Phase = "idle" | "requesting" | "waiting-finalize" | "finalized" | "error";

export function UnwrapPanel() {
  const { address, isConnected } = useAccount();
  const publicClient = usePublicClient();
  const { handleClient, isReady } = useHandleClient();

  const [amountInput, setAmountInput] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [unwrapRequestId, setUnwrapRequestId] = useState<`0x${string}` | null>(
    null,
  );
  const [manualProof, setManualProof] = useState("");

  const {
    writeContract,
    data: hash,
    isPending: isSubmitting,
    error: writeError,
  } = useWriteContract();
  const { data: receipt, isLoading: isConfirming, error: receiptError } =
    useWaitForTransactionReceipt({ hash });

  const finalizeWrite = useWriteContract();
  const finalizeReceipt = useWaitForTransactionReceipt({
    hash: finalizeWrite.data,
  });

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  let parsedAmount: bigint | null = null;
  try {
    if (amountInput.trim() !== "") {
      parsedAmount = parseUnits(amountInput, TOKEN_DECIMALS);
    }
  } catch {
    parsedAmount = null;
  }

  // Pull the request id out of UnwrapRequested once the unwrap() tx confirms.
  useEffect(() => {
    if (!receipt || phase !== "requesting") return;
    try {
      const [event] = parseEventLogs({
        abi: ghostSendWrapper.abi,
        eventName: "UnwrapRequested",
        logs: receipt.logs,
      });
      if (!event) {
        throw new Error("No UnwrapRequested event found in this transaction");
      }
      // Read by POSITION, not by name -- the event's real parameter names
      // are declared in IERC20ToERC7984Wrapper.sol, which we've never
      // actually seen; the emit-site variable name isn't guaranteed to
      // match. UnwrapRequested(address indexed to, <handle type> id) means
      // the request id is always the second value, regardless of its key.
      const values = Object.values(event.args as Record<string, unknown>);
      const requestId = values[1] as `0x${string}` | undefined;
      if (!requestId) {
        throw new Error("UnwrapRequested event had no second argument");
      }
      setUnwrapRequestId(requestId);
      setPhase("waiting-finalize");
    } catch {
      setErrorMessage(toFriendlyError(new Error("Missing unwrap request id")));
      setPhase("error");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [receipt]);

  // Poll on-chain for completion. This only flips once *someone* calls
  // finalizeUnwrap() successfully -- see the honest note in the UI below.
  useEffect(() => {
    if (phase !== "waiting-finalize" || !unwrapRequestId || !publicClient) return;

    async function poll() {
      const requester = await publicClient!.readContract({
        ...ghostSendWrapper,
        functionName: "unwrapRequester",
        args: [unwrapRequestId!],
      });
      if (requester === zeroAddress) {
        setPhase("finalized");
        if (pollRef.current) clearInterval(pollRef.current);
      }
    }

    poll();
    pollRef.current = setInterval(poll, POLL_INTERVAL_MS);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [phase, unwrapRequestId, publicClient]);

  useEffect(() => {
    if (finalizeReceipt.isSuccess) {
      setPhase("finalized");
      if (pollRef.current) clearInterval(pollRef.current);
    }
  }, [finalizeReceipt.isSuccess]);

  async function handleRequestUnwrap() {
    if (!handleClient || !parsedAmount || !address) return;
    setErrorMessage(null);
    setPhase("requesting");
    try {
      const { handle, handleProof } = await handleClient.encryptInput(
        parsedAmount,
        "uint256",
        ghostSendWrapper.address,
      );
      writeContract({
        ...ghostSendWrapper,
        functionName: "unwrap",
        args: [address, address, handle, handleProof],
      });
    } catch (err) {
      setErrorMessage(toFriendlyError(err));
      setPhase("error");
    }
  }

  function handleManualFinalize() {
    if (!unwrapRequestId || !manualProof) return;
    finalizeWrite.writeContract({
      ...ghostSendWrapper,
      functionName: "finalizeUnwrap",
      args: [unwrapRequestId, manualProof as `0x${string}`],
    });
  }

  function handleReset() {
    setAmountInput("");
    setPhase("idle");
    setErrorMessage(null);
    setUnwrapRequestId(null);
    setManualProof("");
  }

  const submitError = writeError ?? receiptError;

  return (
    <div className="flex flex-col gap-4 rounded-xl border border-line bg-surface p-5">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-ink">Unwrap to gFAU</h2>
        <span className="font-mono text-xs text-muted">confidential → public</span>
      </div>

      {phase === "idle" && (
        <>
          <label className="flex flex-col gap-1.5">
            <span className="text-xs text-muted">Amount (gsUSD)</span>
            <input
              type="text"
              inputMode="decimal"
              value={amountInput}
              onChange={(e) => setAmountInput(e.target.value)}
              placeholder="50"
              className="rounded-lg border border-line bg-ink-bg px-3 py-2 font-mono text-sm text-ink outline-none focus:border-accent"
            />
          </label>
          <button
            onClick={handleRequestUnwrap}
            disabled={!isConnected || !isReady || !parsedAmount}
            className="rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-white transition hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Request unwrap
          </button>
        </>
      )}

      {phase === "requesting" && (
        <p className="text-sm text-muted">
          {isSubmitting ? "Confirm in wallet…" : "Submitting unwrap request…"}
        </p>
      )}

      {phase === "waiting-finalize" && (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-ink">
            Unwrap requested. Watching on-chain for it to complete…
          </p>
          <p className="font-mono text-xs text-muted break-all">
            request id: {unwrapRequestId ?? "(unavailable)"}
          </p>

          <div className="rounded-lg border border-amber-400/20 bg-amber-400/5 p-3">
            <p className="text-xs text-amber-300">
              <strong>Honest gap, not a bug:</strong> finalizing this unwrap
              needs a decryption proof signed by the Nox gateway/TEE. I
              couldn't find a client-side way to produce or fetch that proof
              in <code>@iexec-nox/handle</code> — on a real network, iExec's
              own off-chain infrastructure is expected to watch for this
              request and call <code>finalizeUnwrap</code> automatically. This
              panel polls the contract every few seconds and updates itself
              the moment that happens. If you already have a signed proof
              from elsewhere, you can submit it manually below.
            </p>
          </div>

          <details className="text-xs text-muted">
            <summary className="cursor-pointer text-muted hover:text-ink">
              Manually submit a decryption proof
            </summary>
            <div className="mt-2 flex flex-col gap-2">
              <input
                type="text"
                value={manualProof}
                onChange={(e) => setManualProof(e.target.value.trim())}
                placeholder="0x… (signature + decrypted amount)"
                className="rounded-lg border border-line bg-ink-bg px-3 py-2 font-mono text-xs text-ink outline-none focus:border-accent"
              />
              <button
                onClick={handleManualFinalize}
                disabled={!manualProof || finalizeWrite.isPending}
                className="self-start rounded-lg border border-line px-3 py-1.5 text-xs text-ink hover:border-accent disabled:opacity-50"
              >
                {finalizeWrite.isPending ? "Submitting…" : "Finalize with this proof"}
              </button>
              {finalizeWrite.error && (
                <p className="text-red-400">
                  {toFriendlyError(finalizeWrite.error)}
                </p>
              )}
            </div>
          </details>
        </div>
      )}

      {phase === "finalized" && (
        <div className="flex flex-col gap-2">
          <p className="text-sm text-status">
            Unwrapped. gFAU is back in your wallet.
          </p>
          <button
            onClick={handleReset}
            className="self-start text-xs text-muted underline-offset-2 hover:text-ink hover:underline"
          >
            Unwrap more
          </button>
        </div>
      )}

      {(errorMessage || submitError) && (
        <p className="text-xs text-red-400">
          {errorMessage ?? (submitError ? toFriendlyError(submitError) : null)}
        </p>
      )}
    </div>
  );
}