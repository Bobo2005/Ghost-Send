// SPDX-License-Identifier: MIT
pragma solidity ^0.8.35;

// This file exists purely so Hardhat compiles the real NoxCompute
// implementation (our own contracts only import Nox's *interface*, never
// this concrete contract). It lets the test suite deploy a local instance
// of NoxCompute for testing -- it is never part of GhostSend's own
// deployment and is not referenced by any of our contracts.
import "@iexec-nox/nox-protocol-contracts/contracts/NoxCompute.sol";