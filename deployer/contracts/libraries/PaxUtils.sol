// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title PaxUtils
 * @notice Shared utility functions for Paxeer contracts
 */
library PaxUtils {
    uint256 internal constant BPS_DENOMINATOR = 10_000;
    uint256 internal constant MAX_FEE_BPS = 2_500; // 25% max fee

    /// @notice Calculate fee amount from a base amount and bps
    function calculateFee(uint256 amount, uint256 feeBps) internal pure returns (uint256) {
        return (amount * feeBps) / BPS_DENOMINATOR;
    }

    /// @notice Validate that a fee is within allowed bounds
    function validateFee(uint256 feeBps) internal pure returns (bool) {
        return feeBps <= MAX_FEE_BPS;
    }

    /// @notice Safely send native currency, reverts on failure
    function safeTransferETH(address to, uint256 amount) internal {
        (bool success, ) = to.call{value: amount}("");
        require(success, "PaxUtils: ETH transfer failed");
    }

    /// @notice Check if an address is a contract
    function isContract(address account) internal view returns (bool) {
        return account.code.length > 0;
    }

    /// @notice Convert uint to string (for metadata URIs)
    function toString(uint256 value) internal pure returns (string memory) {
        if (value == 0) return "0";
        uint256 temp = value;
        uint256 digits;
        while (temp != 0) {
            digits++;
            temp /= 10;
        }
        bytes memory buffer = new bytes(digits);
        while (value != 0) {
            digits -= 1;
            buffer[digits] = bytes1(uint8(48 + uint256(value % 10)));
            value /= 10;
        }
        return string(buffer);
    }
}
