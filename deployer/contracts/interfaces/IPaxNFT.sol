// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title IPaxNFT
 * @notice Interface for Paxeer ERC721 NFT collections with royalties, batch ops, and metadata
 */
interface IPaxNFT {
    // ═══════════════════════════════════════════════════════════════════
    //  EVENTS
    // ═══════════════════════════════════════════════════════════════════

    event TokenMinted(address indexed to, uint256 indexed tokenId, string uri);
    event BatchMinted(address indexed to, uint256 startId, uint256 count);
    event BaseURIUpdated(string oldURI, string newURI);
    event MaxSupplyUpdated(uint256 oldMax, uint256 newMax);
    event RoyaltyUpdated(address indexed receiver, uint96 feeBps);

    // ═══════════════════════════════════════════════════════════════════
    //  VIEWS
    // ═══════════════════════════════════════════════════════════════════

    function maxSupply() external view returns (uint256);
    function totalMinted() external view returns (uint256);
    function baseURI() external view returns (string memory);

    // ═══════════════════════════════════════════════════════════════════
    //  ACTIONS
    // ═══════════════════════════════════════════════════════════════════

    function safeMint(address to, string calldata uri) external returns (uint256);
    function batchMint(address to, string[] calldata uris) external returns (uint256[] memory);
    function setBaseURI(string calldata uri) external;
    function setMaxSupply(uint256 max) external;
    function setDefaultRoyalty(address receiver, uint96 feeBps) external;
    function setTokenRoyalty(uint256 tokenId, address receiver, uint96 feeBps) external;
    function pause() external;
    function unpause() external;
}
