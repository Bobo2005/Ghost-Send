# Ghost Send

A privacy companion for any standard Ethereum wallet (MetaMask, Rabby, etc.)
on Sepolia. Wrap a public ERC-20 into a confidential ERC-7984 token via
iExec's Nox protocol, send it with the amount hidden on-chain, and unwrap
back to the public token whenever you want. Ghost Send never modifies your
wallet — it's a plain web app that talks to it like any other dApp.

## Contracts

| Contract | Sepolia address |
|---|---|
| `GhostFaucetToken` (public gFAU test token) | `0x13b090ba5D6049ddFeEf34267194085eBE804AAD` |
| `GhostSendWrapper` (confidential gsUSD) | `0x5d36BB0763f4A3653971762d67036bB8D72324Df` |

## Repo layout 

/contracts   Hardhat 3 project: GhostFaucetToken.sol, GhostSendWrapper.sol, tests, Ignition deploy module
/frontend    Vite + React + TypeScript app
/docs        this file, ARCHITECTURE.md, feedback.md

## Prerequisites

- Node.js >= 24
- pnpm >= 10
- A Sepolia-funded wallet (MetaMask or Rabby) for using the app
- A separate Sepolia-funded deployer wallet if you want to redeploy contracts

## Contracts: setup

```bash
cd contracts
cp .env.example .env
# fill in RPC_URL, PRIVATE_KEY, ETHERSCAN_API_KEY
pnpm install
pnpm build
pnpm test
```

`.env` variables:

- `RPC_URL` — a Sepolia RPC endpoint (Alchemy, Infura, or similar)
- `PRIVATE_KEY` — the deployer wallet's private key (test wallet only)
- `ETHERSCAN_API_KEY` — for contract verification

## Contracts: deploy

```bash
cd contracts
pnpm hardhat ignition deploy ignition/modules/deploy.ts --network sepolia
```

This deploys `GhostFaucetToken` then `GhostSendWrapper` wired to it, and
prints both addresses. Update `frontend/src/config/contracts.ts` with the
new addresses if you redeploy.

## Frontend: setup and run

```bash
cd frontend
pnpm install
pnpm dev
```

Open the printed local URL (typically `http://localhost:5173`), connect a
Sepolia-funded wallet, and the app is live.

`.env` variables (optional):

- `VITE_SEPOLIA_RPC_URL` — a custom Sepolia RPC endpoint. Falls back to a
  public default if unset.

## Using the app

1. **Get test tokens** — click "Mint tokens" to receive up to 1000 gFAU per
   call (repeatable).
2. **Wrap to gsUSD** — enter an amount, approve the wrapper contract to
   spend your gFAU (first time only, or when the amount exceeds your
   current allowance), then wrap. This mints an equivalent confidential
   gsUSD balance.
3. **Reveal balance** — your gsUSD balance is never shown automatically.
   Click "Reveal balance" to decrypt and view it; nothing is decrypted
   until you ask.
4. **Private send** — enter a recipient address and an amount, and send.
   The amount is encrypted client-side before it ever reaches the chain;
   only the sender and recipient can later reveal it.
5. **Unwrap** — request an unwrap of a given amount back to gFAU. See the
   in-app note on this step: finalizing an unwrap requires a decryption
   proof signed by Nox's off-chain gateway/TEE infrastructure, which this
   app cannot produce itself — it requests the unwrap, then watches
   on-chain for it to be finalized (by iExec's own infrastructure, or
   manually if you have a proof from elsewhere).
6. **Activity** — see your own recent private transfers (sent and
   received), each with its own reveal button.

## Known limitations

- Unwrap finalization depends on iExec's off-chain Nox gateway actually
  processing the request on Sepolia — Ghost Send has no way to produce that
  proof itself, and no way to guarantee timing.
- Activity only looks back roughly 50,000 blocks; older transfers won't
  appear without a dedicated indexer.