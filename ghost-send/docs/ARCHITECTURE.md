# Ghost Send — Architecture

## Sequence: wrap → send → unwrap

Wallet                GhostFaucetToken            GhostSendWrapper           NoxCompute (Sepolia)
|                          |                            |                          |
|--- mint(amount) -------->|                            |                          |
|                          |                            |                          |
|--- approve(wrapper, amt)->|                            |                          |
|                          |                            |                          |
|--- wrap(to, amt) ------------------------------------->|                          |
|                          |<--- safeTransferFrom -------|                          |
|                          |                            |--- mint (encrypted) ----->|
|                          |                            |<--- balance handle --------|
|                          |                            |                          |
|  [private send]                                       |                          |
|--- encryptInput(amt, wrapper) via @iexec-nox/handle -->|  (client-side, off-chain)|
|--- confidentialTransfer(to, handle, proof) ----------->|                          |
|                          |                            |--- transfer (encrypted) ->|
|                          |                            |<--- new balance handles ---|
|                          |                            |                          |
|  [unwrap]                                              |                          |
|--- encryptInput(amt, wrapper) via @iexec-nox/handle -->|                          |
|--- unwrap(from, to, handle, proof) -------------------->|                          |
|                          |                            |--- burn (encrypted) ----->|
|                          |                            |     + allowPublicDecryption|
|                          |                            |<--- unwrap request id -----|
|                          |                            |                          |
|                          |                            |         (off-chain: Nox's |
|                          |                            |          gateway/TEE signs|
|                          |                            |          a decryption     |
|                          |                            |          proof for the    |
|                          |                            |          request)         |
|                          |                            |                          |
|                          |                            |<-- finalizeUnwrap(id, proof)
|                          |<--- safeTransfer (payout) --|                          |
|<--- gFAU received -------|                            |                          |

Key point: only `wrap()`'s input amount and `finalizeUnwrap()`'s payout
amount are ever plaintext on-chain. Everything in between —
`confidentialTransfer`, the wrapped balance itself, and the burn during
`unwrap()` — operates on opaque handles. The actual encrypted arithmetic
(mint/transfer/burn) is computed off-chain by iExec's TEE runner, which
watches events emitted by `NoxCompute` and produces results only
authorized parties can decrypt.

## Why this preserves composability

Ghost Send deliberately does **not**:

- Fork or modify the underlying ERC-20 (`GhostFaucetToken` is a completely
  ordinary, unmodified ERC-20; any real-world asset with a standard
  `IERC20` interface could sit in its place).
- Require a custom wallet, browser extension, or signing scheme. Every
  transaction Ghost Send sends is a normal Ethereum transaction from a
  normal EOA, signed by whatever standard wallet the user already has
  (MetaMask, Rabby, or any injected EIP-1193 provider).
- Introduce a new token standard consumers need special tooling for at the
  base layer: `GhostSendWrapper` implements `IERC7984`, a defined
  confidential-token interface, rather than an ad hoc contract.

The confidential token is a **wrapper**, not a replacement: the public
asset keeps circulating exactly as it always did (in DEXes, lending
markets, other dApps) with zero awareness that a confidential version
exists. Users opt into privacy by wrapping, and opt back out by unwrapping
— nothing about the underlying asset or its other holders is ever
affected. This is the same "wrap/unwrap" pattern as WETH, just with the
inner leg confidential instead of the outer leg.

## Trust assumptions

- `NoxCompute`'s encrypted arithmetic is only as trustworthy as the TEE
  infrastructure and gateway key running it — this is standard for a TEE
  based confidential-compute design, not unique to this integration.
- Ghost Send's frontend never holds or transmits the gateway's private
  key; it only ever encrypts inputs (via `@iexec-nox/handle`, client-side)
  and reads results it's authorized to decrypt.

  