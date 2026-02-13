// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/finance/PaymentSplitter.sol";
import "../libraries/PaxEvents.sol";

/**
 * @title PaxSplitter
 * @notice Revenue splitting: automatically distributes incoming PAX and ERC20 payments
 *         among configurable payees based on share ratios. Uses OZ PaymentSplitter.
 */
contract PaxSplitter is PaymentSplitter {
    /**
     * @param payees_  Addresses to receive payments
     * @param shares_  Share amounts for each payee (e.g. [70, 30] for 70/30 split)
     */
    constructor(
        address[] memory payees_,
        uint256[] memory shares_
    ) PaymentSplitter(payees_, shares_) {
        emit PaxEvents.ContractDeployed("PaxSplitter", address(this), msg.sender, block.timestamp);
    }
}
