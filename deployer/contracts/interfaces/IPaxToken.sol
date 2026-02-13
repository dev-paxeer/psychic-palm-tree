// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title IPaxToken
 * @notice Interface for Paxeer ERC20 tokens with extended functionality
 */
interface IPaxToken {
    // ═══════════════════════════════════════════════════════════════════
    //  EVENTS
    // ═══════════════════════════════════════════════════════════════════

    event SupplyCapUpdated(uint256 oldCap, uint256 newCap);
    event TokensMinted(address indexed to, uint256 amount, address indexed minter);
    event TokensBurned(address indexed from, uint256 amount);
    event BlacklistUpdated(address indexed account, bool blacklisted);

    // ═══════════════════════════════════════════════════════════════════
    //  VIEWS
    // ═══════════════════════════════════════════════════════════════════

    function supplyCap() external view returns (uint256);
    function isBlacklisted(address account) external view returns (bool);

    // ═══════════════════════════════════════════════════════════════════
    //  ACTIONS
    // ═══════════════════════════════════════════════════════════════════

    function mint(address to, uint256 amount) external;
    function batchMint(address[] calldata recipients, uint256[] calldata amounts) external;
    function setBlacklist(address account, bool status) external;
    function pause() external;
    function unpause() external;
}
