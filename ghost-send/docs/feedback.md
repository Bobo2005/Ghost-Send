# Nox Protocol — developer experience notes

Written for the iExec WTF Hackathon. Genuine notes from actually building
against Nox for five days, not a testimonial.

## What was smooth

- The core mental model — plaintext ERC-20 in, opaque `euint256` handles
  out, decrypt only with ACL authorization — is genuinely simple once it
  clicks, and the `Nox.sol` SDK library's function names
  (`toEuint256`, `allowTransient`, `allowPublicDecryption`, `publicDecrypt`)
  map onto that model cleanly.
- Using `euint256` directly (rather than `euint64` with a conversion rate,
  which the package's own doc comment says is how OpenZeppelin's original
  confidential wrapper works) meant we never had to think about rate
  conversion or precision loss for an 18-decimal token. This was a real
  simplification versus what we expected going in.
- The actual Solidity source, once we found the right files, was clean and
  well-commented — `ERC20ToERC7984WrapperBase.sol` in particular explains
  its own design decisions (e.g. the total-supply-overflow check, the
  handle-uniqueness assumption in the unwrap-request mapping) directly in
  the code, which saved real time.
- `hardhat_setCode` + deploying our own `NoxCompute` instance for local
  testing worked cleanly once we understood the model — no fighting the
  contract itself, just needing to understand the architecture first.

## Friction points

- **No usable local test environment out of the box.** Both
  `@iexec-nox/nox-protocol-contracts` and `@iexec-nox/nox-confidential-contracts`
  explicitly exclude their own `test/`/`mocks/` folders from what's
  published to npm (visible right in `package.json`'s `files` field). That
  meant there was no pattern to follow for testing wrap/transfer/unwrap
  locally — we had to reverse-engineer one from the contracts' own source
  (deploy `NoxCompute` ourselves, act as our own gateway, sign proofs by
  hand). This is a significant gap for anyone trying to write tests
  quickly; a published test-helper package, or even one example test file,
  would have saved most of a day.
- **The gap between "on-chain event" and "off-chain computed result" isn't
  obvious from the contracts alone.** It took tracing all the way into
  `Compute.sol` to realize `mint`/`transfer`/`burn` don't do any real
  arithmetic on-chain — they emit an event with a fresh opaque handle, and
  the actual computation happens entirely off-chain in iExec's TEE runner.
  This is a reasonable design, but it means local testing can only ever
  validate the plumbing (ACL, signatures, real ERC-20 movement), never the
  actual confidential math — and that limitation isn't stated anywhere we
  could find; we had to infer it from the code.
- **No documented client-side path for producing an unwrap's decryption
  proof.** `@iexec-nox/handle`'s documented API (`encryptInput`, `decrypt`)
  covers encrypting inputs and viewing your own authorized balances, but we
  found nothing — in the package or its docs — for obtaining the
  gateway-signed proof `finalizeUnwrap` requires. We built the app to
  request the unwrap and watch on-chain for it to complete, rather than
  fabricate a proof-fetching call that doesn't exist. If there is a
  supported way to do this (a relayer endpoint, a specific SDK method we
  missed), it wasn't discoverable from the public package + our own package
  reading.
- **Prebuilt npm artifacts don't play well with Hardhat 3's own build
  system.** `nox-protocol-contracts` ships a prebuilt `NoxCompute.json`
  artifact directly in the package (per its `files` field), but our own
  project's `hardhat build` neither reused it under a discoverable name nor
  regenerated an equivalent — `ethers.deployContract("NoxCompute")` and
  even the fully-qualified name both failed with "artifact not found." We
  ended up reading the shipped JSON off disk directly. This may be a
  Hardhat 3 versus older-generation-package mismatch rather than a Nox
  issue specifically, but it cost real debugging time with an unhelpful
  error message.
- **`NoxCompute`'s ~30KB bytecode exceeds the EIP-170 contract-size limit**
  that Hardhat's local network enforces by default (real testnets/mainnet
  varies; ours needed `allowUnlimitedContractSize: true` locally). Worth a
  note in onboarding docs so it's not a surprise.
- **Minor:** the `Nox.sol` SDK targets Solidity `^0.8.35`, one minor version
  ahead of the `^0.8.28` we'd started the project on per our own initial
  spec — an easy fix once noticed, but worth flagging since a slightly
  older pinned compiler version elsewhere in a project could cause a
  confusing version-resolution failure.

## Overall

The protocol's actual design is sound and the euint256-direct approach is a
real ergonomic win over rate-based alternatives. The rough edges we hit
were almost entirely about **discoverability** — missing local-test
patterns, an unclear off-chain/on-chain boundary, and no visible path for
the one piece (unwrap finalization) that genuinely can't be done
client-side — rather than anything wrong with the protocol's design itself. 