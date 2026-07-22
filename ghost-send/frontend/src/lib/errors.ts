// src/lib/errors.ts
//
// Converts any error thrown during a wallet/contract interaction into a
// short, calm, plain-English sentence safe to show a user. Never surfaces
// library names, version strings, error class names, or raw hex/error
// data -- those are logged to the console for debugging instead.

import { BaseError, ContractFunctionRevertedError } from "viem";
import { ghostFaucetToken, ghostSendWrapper } from "../config/contracts";

/**
 * Friendly messages for our own contracts' custom Solidity errors, and for
 * plain string revert reasons (require(condition, "some reason")), keyed
 * by name/reason exactly as declared in source.
 */
const CUSTOM_ERROR_MESSAGES: Record<string, string> = {
  // --- GhostFaucetToken.sol (declared directly, verified against source) ---
  MintAmountExceedsCap: "You tried to mint more than the allowed amount.",
  MintAmountIsZero: "Enter an amount greater than zero to mint.",

  // --- ERC20ToERC7984WrapperBase.sol (declared directly, verified against source) ---
  ERC7984UnauthorizedCaller:
    "That action isn't allowed from this address.",
  InvalidUnwrapRequest:
    "This unwrap request has already been completed or doesn't exist.",
  ERC7984TotalSupplyOverflow:
    "This would exceed the maximum amount the contract allows.",

  // --- Referenced in ERC20ToERC7984WrapperBase.sol but declared in a
  // parent we haven't directly read (ERC7984Base/IERC7984) -- names and
  // argument shapes are known from the exact revert() call sites we've
  // seen, but not independently confirmed against that file's own source.
  ERC7984UnauthorizedSpender:
    "You don't have permission to move funds from that address.",
  ERC7984InvalidReceiver: "That's not a valid recipient address.",
  ERC7984UnauthorizedUseOfEncryptedAmount:
    "That encrypted amount isn't authorized for use here.",

  // --- NoxCompute / INoxCompute.sol (full source verified) -- these
  // surface if a revert happens inside a call into NoxCompute itself,
  // e.g. a malformed or expired proof. ---
  InvalidProof: "That confidential proof couldn't be verified.",
  NotAllowed: "You're not authorized to use this confidential value.",
  NotPubliclyDecryptable: "This value hasn't been made available to reveal yet.",
  UndefinedHandle: "That confidential value doesn't exist.",
  UnauthorizedSender: "You're not authorized to do that.",
  PublicHandleACLForbidden: "That action isn't allowed on a public value.",
  InvalidZeroAddress: "Please provide a valid address.",
  InvalidEmptyBytes: "A required value was missing.",
};

/** Plain require() string revert reasons we use ourselves, mapped by exact reason text. */
const REVERT_REASON_MESSAGES: Record<string, string> = {
  "Ghost Send: zero address":
    "Please enter a valid address to share your balance with.",
};

const KNOWN_ABIS = [ghostFaucetToken.abi, ghostSendWrapper.abi];

function messageIncludes(error: unknown, needle: string): boolean {
  if (!(error instanceof Error)) return false;
  return error.message.toLowerCase().includes(needle.toLowerCase());
}

/** Best-effort extraction of raw revert calldata from common error shapes. */
function extractRevertData(error: unknown): `0x${string}` | undefined {
  if (error instanceof BaseError) {
    const revertError = error.walk(
      (e) => e instanceof ContractFunctionRevertedError,
    ) as ContractFunctionRevertedError | undefined;
    if (revertError?.data) {
      // viem already decoded this for us in most cases -- see caller.
      return undefined;
    }
  }
  const anyErr = error as any;
  return (
    anyErr?.data ?? anyErr?.cause?.data ?? anyErr?.error?.data ?? undefined
  );
}

export function toFriendlyError(error: unknown): string {
  // Always keep the real error available for debugging -- never shown to the user.
  console.error(error);

  // 1. Wallet / connector / provider not found.
  if (
    messageIncludes(error, "provider not found") ||
    messageIncludes(error, "connector not found") ||
    messageIncludes(error, "no injected") ||
    messageIncludes(error, "not been authorized")
  ) {
    return "No wallet found. Please install MetaMask or another wallet extension to continue.";
  }

  // 2. User rejected the request. Code 4001 is the EIP-1193 standard for
  // this, so it's checked regardless of which library shape wraps it.
  const errCode = (error as any)?.code ?? (error as any)?.cause?.code;
  if (
    errCode === 4001 ||
    messageIncludes(error, "user rejected") ||
    messageIncludes(error, "user denied")
  ) {
    return "Transaction cancelled.";
  }

  // 3. Wrong network / chain mismatch.
  if (
    messageIncludes(error, "chain mismatch") ||
    messageIncludes(error, "does not match the target chain") ||
    messageIncludes(error, "unsupported chain") ||
    messageIncludes(error, "wrong network")
  ) {
    return "Please switch your wallet to the Sepolia network.";
  }

  // 4. Insufficient funds for gas.
  if (
    messageIncludes(error, "insufficient funds") ||
    messageIncludes(error, "exceeds balance")
  ) {
    return "Not enough ETH to cover the network fee.";
  }

  // 5. One of our own custom Solidity errors, or a plain require() reason.
  if (error instanceof BaseError) {
    const revertError = error.walk(
      (e) => e instanceof ContractFunctionRevertedError,
    ) as ContractFunctionRevertedError | undefined;

    if (revertError) {
      const errorName = revertError.data?.errorName;
      if (errorName && CUSTOM_ERROR_MESSAGES[errorName]) {
        return CUSTOM_ERROR_MESSAGES[errorName];
      }
      const reason = revertError.reason;
      if (reason && REVERT_REASON_MESSAGES[reason]) {
        return REVERT_REASON_MESSAGES[reason];
      }
    }
  }

  // Fallback path: try decoding raw revert data manually against our known
  // ABIs, in case it wasn't already decoded by viem above (e.g. a shape
  // viem's automatic decoding didn't recognize).
  const rawData = extractRevertData(error);
  if (rawData) {
    for (const abi of KNOWN_ABIS) {
      try {
        const { decodeErrorResult } = require("viem") as typeof import("viem");
        const decoded = decodeErrorResult({ abi, data: rawData });
        if (decoded.errorName && CUSTOM_ERROR_MESSAGES[decoded.errorName]) {
          return CUSTOM_ERROR_MESSAGES[decoded.errorName];
        }
      } catch {
        // Not decodable against this ABI -- try the next one.
      }
    }
  }

  // 6. Generic RPC/network failure.
  if (
    messageIncludes(error, "failed to fetch") ||
    messageIncludes(error, "network error") ||
    messageIncludes(error, "timeout") ||
    messageIncludes(error, "rpc")
  ) {
    return "Couldn't reach the network. Check your connection and try again.";
  }

  // 7. Anything unrecognized -- never render error.message or the raw object.
  return "Something went wrong. Please try again.";
}