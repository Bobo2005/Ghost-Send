import { useEffect, useState } from "react";
import { useWalletClient } from "wagmi";
import { createViemHandleClient } from "@iexec-nox/handle";

// createViemHandleClient's real return type isn't something I've verified
// against the package's actual TS declarations -- this is inferred purely
// from the async-factory usage given in the project brief. If this type
// doesn't line up once you have real IntelliSense on it, that's the type
// to fix, not the calling code below.
type HandleClient = Awaited<ReturnType<typeof createViemHandleClient>>;

interface UseHandleClientResult {
  handleClient: HandleClient | null;
  isReady: boolean;
  error: Error | null;
}

/**
 * Wraps createViemHandleClient(walletClient) as a hook, so components can
 * call encryptInput/decrypt without re-doing this setup themselves. Returns
 * null until a wallet is connected and the client has finished initializing.
 */
export function useHandleClient(): UseHandleClientResult {
  const { data: walletClient } = useWalletClient();
  const [handleClient, setHandleClient] = useState<HandleClient | null>(null);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let cancelled = false;
    setHandleClient(null);
    setError(null);

    if (!walletClient) {
      return;
    }

    createViemHandleClient(walletClient)
      .then((client) => {
        if (!cancelled) setHandleClient(client);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err : new Error(String(err)));
        }
      });

    return () => {
      cancelled = true;
    };
  }, [walletClient]);

  return { handleClient, isReady: handleClient !== null, error };
}