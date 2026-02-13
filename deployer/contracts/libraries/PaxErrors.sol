// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title PaxErrors
 * @notice Shared custom errors for Paxeer contracts — cheaper than require strings
 */
library PaxErrors {
    error ZeroAddress();
    error ZeroAmount();
    error InsufficientBalance(uint256 required, uint256 available);
    error SupplyCapExceeded(uint256 cap, uint256 requested);
    error MaxSupplyReached(uint256 maxSupply);
    error Blacklisted(address account);
    error ArrayLengthMismatch(uint256 a, uint256 b);
    error DeadlineExpired(uint256 deadline, uint256 current);
    error DeadlineNotReached(uint256 deadline, uint256 current);
    error AlreadyClaimed(address account);
    error InvalidProof();
    error InvalidFee(uint256 fee);
    error NotListed(uint256 listingId);
    error NotSeller(address caller, address seller);
    error NotActive(uint256 id);
    error InsufficientPayment(uint256 required, uint256 sent);
    error OfferExpired(uint256 offerId);
    error TransferFailed();
    error NothingStaked();
    error CooldownActive(uint256 unlockTime);
}
