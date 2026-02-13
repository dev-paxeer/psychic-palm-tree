// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @notice Non-transferable ERC20 representing leveraged FX/commodity exposure per market and side
contract FxPositionToken is ERC20, Ownable {
    address public vault;

    event VaultUpdated(address indexed oldVault, address indexed newVault);

    constructor(
        string memory name_,
        string memory symbol_,
        address initialVault
    ) ERC20(name_, symbol_) Ownable(msg.sender) {
        require(initialVault != address(0), "Invalid vault address");
        vault = initialVault;
    }

    modifier onlyVault() {
        require(msg.sender == vault, "Caller is not the vault");
        _;
    }

    function setVault(address newVault) external onlyOwner {
        require(newVault != address(0), "Invalid vault address");
        address oldVault = vault;
        vault = newVault;
        emit VaultUpdated(oldVault, newVault);
    }

    function mint(address to, uint256 amount) external onlyVault {
        _mint(to, amount);
    }

    function burn(address from, uint256 amount) external onlyVault {
        _burn(from, amount);
    }

    /// @dev Override ERC20 transfer to make the token non-transferable for v1
    function _update(address from, address to, uint256 value) internal override {
        if (from != address(0) && to != address(0)) {
            // Disallow transfers between arbitrary users; only mint (from == 0) and burn (to == 0)
            revert("Non-transferable token");
        }
        super._update(from, to, value);
    }
}
