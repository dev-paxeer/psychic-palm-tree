// SPDX-License-Identifier: MIT
// Compatible with OpenZeppelin Contracts ^5.4.0
pragma solidity ^0.8.27;

import {ERC1363} from "@openzeppelin/contracts/token/ERC20/extensions/ERC1363.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC20Bridgeable} from "@openzeppelin/contracts/token/ERC20/extensions/draft-ERC20Bridgeable.sol";
import {ERC20Burnable} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import {ERC20FlashMint} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20FlashMint.sol";
import {ERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";

/// @custom:security-contact paxeernetwork@paxeer.app
contract USDC is ERC20, ERC20Bridgeable, ERC20Burnable, ERC1363, ERC20Permit, ERC20FlashMint {
    address public tokenBridge;
    error Unauthorized();

    constructor(address tokenBridge_, address recipient)
        ERC20("USDC", "USDC")
        ERC20Permit("USDC")
    {
        require(tokenBridge_ != address(0), "Invalid tokenBridge_ address");
        tokenBridge = tokenBridge_;
        if (block.chainid == 229) {
            // Mint supply for ~500M USD market cap
            // USDC price ~$1.00, so mint 500M tokens with 6 decimals
            _mint(recipient, 500000000 * 10 ** 6); // 500M USDC (6 decimals)
        }
    }

    function decimals() public pure override returns (uint8) {
        return 6; // USDC uses 6 decimals
    }

    function _checkTokenBridge(address caller) internal view override {
        if (caller != tokenBridge) revert Unauthorized();
    }

    // The following functions are overrides required by Solidity.

    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(ERC20Bridgeable, ERC1363)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }
}
