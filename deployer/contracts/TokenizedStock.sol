// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract TokenizedStock is ERC20, Ownable {
    address public vault;
    bool public bootstrapped;

    event VaultUpdated(address indexed oldVault, address indexed newVault);

    constructor(string memory name_, string memory symbol_, address initialVault) ERC20(name_, symbol_) Ownable(msg.sender) {
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

    /// @notice One-time mint of exactly 1 token (18 decimals) to a recipient for bootstrap purposes
    /// @dev Can only be called once by the owner; subsequent calls revert
    function bootstrapMint(address to) external onlyOwner {
        require(!bootstrapped, "Already bootstrapped");
        require(to != address(0), "Invalid recipient");
        bootstrapped = true;
        _mint(to, 1e18);
    }

    function mint(address to, uint256 amount) external onlyVault {
        _mint(to, amount);
    }

    function burn(address from, uint256 amount) external onlyVault {
        _burn(from, amount);
    }
}
