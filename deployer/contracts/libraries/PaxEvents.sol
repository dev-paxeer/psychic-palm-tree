// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title PaxEvents
 * @notice Shared events for cross-contract indexing on HyperPaxeer
 */
library PaxEvents {
    event ContractDeployed(
        string indexed contractType,
        address indexed contractAddress,
        address indexed deployer,
        uint256 timestamp
    );

    event OwnershipTransferRequested(
        address indexed contractAddress,
        address indexed currentOwner,
        address indexed newOwner
    );

    event FeeCollected(
        address indexed token,
        address indexed collector,
        uint256 amount
    );

    event EmergencyAction(
        address indexed contractAddress,
        string action,
        address indexed caller,
        uint256 timestamp
    );
}
