import type { Abi, Address } from "viem";

// ABIs are imported straight from Hardhat's own build output in the
// sibling /contracts project -- never hand-typed. Requires /contracts to
// have been compiled at least once (`pnpm build` there) so these JSON
// files exist. If this import fails, that's almost certainly why.
import GhostFaucetTokenArtifact from "../abis/GhostFaucetToken.json";
import GhostSendWrapperArtifact from "../abis/GhostSendWrapper.json";

export const GHOST_FAUCET_TOKEN_ADDRESS =
  "0x13b090ba5D6049ddFeEf34267194085eBE804AAD" as const satisfies Address;

export const GHOST_SEND_WRAPPER_ADDRESS =
  "0x5d36BB0763f4A3653971762d67036bB8D72324Df" as const satisfies Address;

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