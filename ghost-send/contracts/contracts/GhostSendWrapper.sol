// SPDX-License-Identifier: MIT
pragma solidity ^0.8.35;

import {IERC20} from "@openzeppelin/contracts/interfaces/IERC20.sol";
import {ERC20ToERC7984Wrapper} from "@iexec-nox/nox-confidential-contracts/contracts/token/extensions/ERC20ToERC7984Wrapper.sol";
import {Nox, euint256} from "@iexec-nox/nox-protocol-contracts/contracts/sdk/Nox.sol";

/// @title GhostSendWrapper
/// @notice Confidential ERC-7984 wrapper around GhostFaucetToken. Wraps at a
/// fixed 1:1 rate (this variant of the Nox wrapper uses euint256 and doesn't
/// need a rate/decimals-compression step, unlike the euint64-based
/// OpenZeppelin original). All the actual logic — wrap, unwrap,
/// finalizeUnwrap, confidentialTransfer, confidentialBalanceOf — comes from
/// the parent contract; this file only supplies name/symbol/contractURI and
/// wires it to the underlying token.
/// @dev Inherits the "optimized primitives" variant (`ERC20ToERC7984Wrapper`),
/// not `...WrapperRaw`. No reason yet to fall back to Raw — flagging that per
/// the original brief in case something in the optimized `_update` path
/// misbehaves once we test against it.
contract GhostSendWrapper is ERC20ToERC7984Wrapper {
    /// @notice Emitted when `owner` grants permanent view-only decrypt
    /// access to their confidential balance to `viewer`.
    /// @dev Nox has no revoke path for persistent grants (only same-
    /// transaction transient grants can be disallowed) -- this is a
    /// limitation of the underlying protocol, not this contract.
    event ViewAccessGranted(address indexed owner, address indexed viewer);

    constructor(
        IERC20 underlying
    ) ERC20ToERC7984Wrapper("Ghost Send USD", "gsUSD", "", underlying) {}

    /// @notice Grants `viewer` permanent, view-only decrypt access to the
    /// caller's own confidential gsUSD balance. This cannot be revoked.
    /// @param viewer The address to grant view access to.
    function grantBalanceView(address viewer) external {
        require(viewer != address(0), "Ghost Send: zero address");
        euint256 bal = confidentialBalanceOf(msg.sender);
        Nox.addViewer(bal, viewer);
        emit ViewAccessGranted(msg.sender, viewer);
    }
}