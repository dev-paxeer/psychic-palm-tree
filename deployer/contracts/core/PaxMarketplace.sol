// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/token/common/ERC2981.sol";
import "../interfaces/IPaxMarketplace.sol";
import "../libraries/PaxErrors.sol";
import "../libraries/PaxEvents.sol";
import "../libraries/PaxUtils.sol";
import "../modules/PaxFeeManager.sol";

/**
 * @title PaxMarketplace
 * @notice NFT marketplace: list, buy, cancel, make offers, accept offers.
 *         Platform fees, ERC2981 royalty support, reentrancy-safe, pausable.
 */
contract PaxMarketplace is
    ReentrancyGuard,
    Pausable,
    PaxFeeManager,
    IPaxMarketplace
{
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");

    uint256 private _listingCounter;
    uint256 private _offerCounter;

    mapping(uint256 => Listing) private _listings;
    mapping(uint256 => Offer) private _offers;

    /**
     * @param feeBps_        Platform fee in basis points (250 = 2.5%)
     * @param feeRecipient_  Address that collects platform fees
     * @param owner_         Admin address
     */
    constructor(
        uint256 feeBps_,
        address feeRecipient_,
        address owner_
    ) PaxFeeManager(feeBps_, feeRecipient_) {
        if (owner_ == address(0)) revert PaxErrors.ZeroAddress();

        _grantRole(DEFAULT_ADMIN_ROLE, owner_);
        _grantRole(FEE_MANAGER_ROLE, owner_);
        _grantRole(PAUSER_ROLE, owner_);

        emit PaxEvents.ContractDeployed("PaxMarketplace", address(this), msg.sender, block.timestamp);
    }

    // ── Listings ─────────────────────────────────────────────────────

    function list(address nftContract, uint256 tokenId, uint256 price)
        external whenNotPaused returns (uint256)
    {
        if (price == 0) revert PaxErrors.ZeroAmount();

        IERC721 nft = IERC721(nftContract);
        require(
            nft.ownerOf(tokenId) == msg.sender,
            "Not token owner"
        );
        require(
            nft.isApprovedForAll(msg.sender, address(this)) ||
            nft.getApproved(tokenId) == address(this),
            "Marketplace not approved"
        );

        uint256 listingId = _listingCounter++;
        _listings[listingId] = Listing({
            listingId: listingId,
            seller: msg.sender,
            nftContract: nftContract,
            tokenId: tokenId,
            price: price,
            status: ListingStatus.Active,
            createdAt: block.timestamp
        });

        emit Listed(listingId, msg.sender, nftContract, tokenId, price);
        return listingId;
    }

    function buy(uint256 listingId) external payable nonReentrant whenNotPaused {
        Listing storage listing = _listings[listingId];
        if (listing.status != ListingStatus.Active) revert PaxErrors.NotActive(listingId);
        if (msg.value < listing.price) revert PaxErrors.InsufficientPayment(listing.price, msg.value);

        listing.status = ListingStatus.Sold;

        // Platform fee
        uint256 fee = _collectFee(listing.price);
        uint256 sellerProceeds = listing.price - fee;

        // ERC2981 royalties
        try IERC2981(listing.nftContract).royaltyInfo(listing.tokenId, listing.price) returns (address royaltyReceiver, uint256 royaltyAmount) {
            if (royaltyReceiver != address(0) && royaltyAmount > 0 && royaltyAmount < sellerProceeds) {
                PaxUtils.safeTransferETH(royaltyReceiver, royaltyAmount);
                sellerProceeds -= royaltyAmount;
            }
        } catch {}

        // Pay seller
        PaxUtils.safeTransferETH(listing.seller, sellerProceeds);

        // Transfer NFT
        IERC721(listing.nftContract).safeTransferFrom(listing.seller, msg.sender, listing.tokenId);

        // Refund excess
        if (msg.value > listing.price) {
            PaxUtils.safeTransferETH(msg.sender, msg.value - listing.price);
        }

        emit Sale(listingId, msg.sender, listing.price);
    }

    function cancelListing(uint256 listingId) external {
        Listing storage listing = _listings[listingId];
        if (listing.status != ListingStatus.Active) revert PaxErrors.NotActive(listingId);
        if (listing.seller != msg.sender) revert PaxErrors.NotSeller(msg.sender, listing.seller);

        listing.status = ListingStatus.Cancelled;
        emit ListingCancelled(listingId);
    }

    // ── Offers ───────────────────────────────────────────────────────

    function makeOffer(uint256 listingId, uint256 expiresAt)
        external payable nonReentrant whenNotPaused returns (uint256)
    {
        Listing storage listing = _listings[listingId];
        if (listing.status != ListingStatus.Active) revert PaxErrors.NotActive(listingId);
        if (msg.value == 0) revert PaxErrors.ZeroAmount();
        if (expiresAt <= block.timestamp) revert PaxErrors.DeadlineExpired(expiresAt, block.timestamp);

        uint256 offerId = _offerCounter++;
        _offers[offerId] = Offer({
            offerId: offerId,
            buyer: msg.sender,
            listingId: listingId,
            amount: msg.value,
            expiresAt: expiresAt,
            accepted: false
        });

        emit OfferMade(offerId, listingId, msg.sender, msg.value);
        return offerId;
    }

    function acceptOffer(uint256 offerId) external nonReentrant {
        Offer storage offer = _offers[offerId];
        Listing storage listing = _listings[offer.listingId];

        if (listing.status != ListingStatus.Active) revert PaxErrors.NotActive(offer.listingId);
        if (listing.seller != msg.sender) revert PaxErrors.NotSeller(msg.sender, listing.seller);
        if (block.timestamp > offer.expiresAt) revert PaxErrors.OfferExpired(offerId);

        offer.accepted = true;
        listing.status = ListingStatus.Sold;

        // Platform fee
        uint256 fee = _collectFee(offer.amount);
        uint256 sellerProceeds = offer.amount - fee;

        PaxUtils.safeTransferETH(listing.seller, sellerProceeds);
        IERC721(listing.nftContract).safeTransferFrom(listing.seller, offer.buyer, listing.tokenId);

        emit OfferAccepted(offerId, offer.listingId);
        emit Sale(offer.listingId, offer.buyer, offer.amount);
    }

    // ── Views ────────────────────────────────────────────────────────

    function getListing(uint256 listingId) external view returns (Listing memory) { return _listings[listingId]; }
    function getOffer(uint256 offerId) external view returns (Offer memory) { return _offers[offerId]; }
    function totalListings() external view returns (uint256) { return _listingCounter; }

    function pause() external onlyRole(PAUSER_ROLE) { _pause(); }
    function unpause() external onlyRole(PAUSER_ROLE) { _unpause(); }

    function supportsInterface(bytes4 interfaceId) public view override(AccessControl) returns (bool) {
        return super.supportsInterface(interfaceId);
    }
}
