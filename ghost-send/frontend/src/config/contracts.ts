import type { Abi, Address } from "viem";

// ABIs are imported straight from Hardhat's own build output in the
// sibling /contracts project -- never hand-typed. Requires /contracts to
// have been compiled at least once (`pnpm build` there) so these JSON
// files exist. If this import fails, that's almost certainly why.
import GhostFaucetTokenArtifact from "../abis/GhostFaucetToken.json";
import GhostSendWrapperArtifact from "../abis/GhostSendWrapper.json";

export const GHOST_FAUCET_TOKEN_ADDRESS =
  "0x86d44972D6A227C766C40f96E41040944c3B2E60" as const satisfies Address;

export const GHOST_SEND_WRAPPER_ADDRESS =
  "0xCf818c35b241d98da114f1482D5c2fc05229d2D2" as const satisfies Address;

const ghostFaucetTokenAbi = GhostFaucetTokenArtifact.abi as Abi;
const ghostSendWrapperAbi = GhostSendWrapperArtifact.abi as Abi;

export const ghostFaucetToken = {
  address: GHOST_FAUCET_TOKEN_ADDRESS,
  abi: ghostFaucetTokenAbi,
} as const;

export const ghostSendWrapper = {
  address: GHOST_SEND_WRAPPER_ADDRESS,
  abi: ghostSendWrapperAbi,
} as const;