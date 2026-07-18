import { useAccount, useReadContract } from "wagmi";
import { ghostSendWrapper } from "../config/contracts";

/**
 * Reads confidentialBalanceOf(address) on GhostSendWrapper. This returns a
 * HANDLE (an opaque bytes32-encoded euint256), not a plaintext balance --
 * decrypting it is a separate step (see BalanceCard.tsx / useHandleClient),
 * and only succeeds if the caller is ACL-authorized for that handle.
 */
export function useConfidentialBalance() {
  const { address, isConnected } = useAccount();

  const {
    data: handle,
    isLoading,
    error,
    refetch,
  } = useReadContract({
    ...ghostSendWrapper,
    functionName: "confidentialBalanceOf",
    args: address ? [address] : undefined,
    query: {
      enabled: isConnected && !!address,
    },
  });

  return {
    handle: handle as `0x${string}` | undefined,
    isLoading,
    error,
    refetch,
  };
}