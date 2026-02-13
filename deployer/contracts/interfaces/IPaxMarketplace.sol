// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title IPaxMarketplace
 * @notice Interface for Paxeer NFT marketplace with listings and offers
 */
interface IPaxMarketplace {
    // ═══════════════════════════════════════════════════════════════════
    //  ENUMS & STRUCTS
    // ═══════════════════════════════════════════════════════════════════

    enum ListingStatus { Active, Sold, Cancelled }

    struct Listing {
        uint256 listingId;
        address seller;
        address nftContract;
        uint256 tokenId;
        uint256 price;
        ListingStatus status;
        uint256 createdAt;
    }

    struct Offer {
        uint256 offerId;
        address buyer;
        uint256 listingId;
        uint256 amount;
        uint256 expiresAt;
        bool accepted;
    }

    // ═══════════════════════════════════════════════════════════════════
    //  EVENTS
    // ═══════════════════════════════════════════════════════════════════

    event Listed(uint256 indexed listingId, address indexed seller, address indexed nftContract, uint256 tokenId, uint256 price);
    event Sale(uint256 indexed listingId, address indexed buyer, uint256 price);
    event ListingCancelled(uint256 indexed listingId);
    event OfferMade(uint256 indexed offerId, uint256 indexed listingId, address indexed buyer, uint256 amount);
    event OfferAccepted(uint256 indexed offerId, uint256 indexed listingId);
    event FeeUpdated(uint256 oldFee, uint256 newFee);

    // ═══════════════════════════════════════════════════════════════════
    //  ACTIONS
    // ═══════════════════════════════════════════════════════════════════

    function list(address nftContract, uint256 tokenId, uint256 price) external returns (uint256);
    function buy(uint256 listingId) external payable;
    function cancelListing(uint256 listingId) external;
    function makeOffer(uint256 listingId, uint256 expiresAt) external payable returns (uint256);
    function acceptOffer(uint256 offerId) external;

    // ═══════════════════════════════════════════════════════════════════
    //  VIEWS
    // ═══════════════════════════════════════════════════════════════════

    function getListing(uint256 listingId) external view returns (Listing memory);
    function getOffer(uint256 offerId) external view returns (Offer memory);
    function platformFeeBps() external view returns (uint256);
    function totalListings() external view returns (uint256);
}
