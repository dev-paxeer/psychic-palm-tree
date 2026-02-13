// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title IPaxVault
 * @notice Interface for Paxeer ERC4626 tokenized vaults with deposit limits
 */
interface IPaxVault {
    // ═══════════════════════════════════════════════════════════════════
    //  EVENTS
    // ═══════════════════════════════════════════════════════════════════

    event DepositLimitUpdated(uint256 oldLimit, uint256 newLimit);
    event StrategyUpdated(address oldStrategy, address newStrategy);

    // ═══════════════════════════════════════════════════════════════════
    //  VIEWS
    // ═══════════════════════════════════════════════════════════════════

    function depositLimit() external view returns (uint256);
    function totalAssets() external view returns (uint256);

    // ═══════════════════════════════════════════════════════════════════
    //  ACTIONS
    // ═══════════════════════════════════════════════════════════════════

    function setDepositLimit(uint256 limit) external;
    function pause() external;
    function unpause() external;
}
