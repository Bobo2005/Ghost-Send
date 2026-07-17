// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @title GhostFaucetToken
/// @notice A throwaway, publicly mintable ERC-20 used as the "public" asset
/// that Ghost Send wraps into a confidential ERC-7984 token via iExec's Nox
/// protocol. Exists purely so hackathon judges can self-serve test tokens on
/// Sepolia without hunting down a real asset or a faucet with a queue.
/// @dev `mint` is intentionally unrestricted (anyone can call it, for
/// themselves or for someone else) and capped per call so it can never be
/// used to mint an unbounded amount in one transaction. This contract has no
/// value and should only ever be deployed on testnets.
contract GhostFaucetToken is ERC20 {
    /// @notice Maximum number of whole tokens (i.e. before applying
    /// `decimals()`) that a single `mint` call is allowed to create.
    uint256 public constant MAX_MINT_PER_CALL = 1000;

    /// @notice Thrown when `mint` is called with an amount above
    /// `MAX_MINT_PER_CALL` whole tokens.
    error MintAmountExceedsCap(uint256 requested, uint256 cap);

    /// @notice Thrown when `mint` is called with a zero amount.
    error MintAmountIsZero();

    constructor() ERC20("Ghost Faucet Token", "gFAU") {}

    /// @notice Mints `amount` whole tokens (scaled internally by
    /// `decimals()`) to the caller. Capped at `MAX_MINT_PER_CALL` per call,
    /// but callable as many times and by as many addresses as needed.
    /// @param amount The number of whole tokens to mint, e.g. `mint(1000)`
    /// mints 1000 gFAU (not 1000 wei of gFAU).
    function mint(uint256 amount) external {
        _mintCapped(msg.sender, amount);
    }

    /// @notice Same as `mint`, but sends the tokens to `to` instead of the
    /// caller. Handy for judges minting straight to a demo wallet address.
    /// @param to The recipient of the newly minted tokens.
    /// @param amount The number of whole tokens to mint.
    function mintTo(address to, uint256 amount) external {
        _mintCapped(to, amount);
    }

    function _mintCapped(address to, uint256 amount) private {
        if (amount == 0) revert MintAmountIsZero();
        if (amount > MAX_MINT_PER_CALL) {
            revert MintAmountExceedsCap(amount, MAX_MINT_PER_CALL);
        }
        _mint(to, amount * (10 ** decimals()));
    }
}