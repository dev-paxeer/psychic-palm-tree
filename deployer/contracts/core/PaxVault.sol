// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/extensions/ERC4626.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Pausable.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "../interfaces/IPaxVault.sol";
import "../libraries/PaxErrors.sol";
import "../libraries/PaxEvents.sol";

/**
 * @title PaxVault
 * @notice ERC4626 tokenized vault: deposit ERC20, receive shares, deposit limits,
 *         pausable, access-controlled management
 */
contract PaxVault is ERC4626, ERC20Pausable, AccessControl, IPaxVault {
    bytes32 public constant MANAGER_ROLE = keccak256("MANAGER_ROLE");

    uint256 private _depositLimit;

    /**
     * @param asset_   Underlying ERC20 token
     * @param name_    Vault share token name
     * @param symbol_  Vault share token symbol
     * @param owner_   Admin address
     */
    constructor(
        address asset_,
        string memory name_,
        string memory symbol_,
        address owner_
    ) ERC4626(IERC20(asset_)) ERC20(name_, symbol_) {
        if (owner_ == address(0)) revert PaxErrors.ZeroAddress();

        _grantRole(DEFAULT_ADMIN_ROLE, owner_);
        _grantRole(MANAGER_ROLE, owner_);
        _depositLimit = type(uint256).max;

        emit PaxEvents.ContractDeployed("PaxVault", address(this), msg.sender, block.timestamp);
    }

    function depositLimit() public view returns (uint256) { return _depositLimit; }

    function setDepositLimit(uint256 limit) external onlyRole(MANAGER_ROLE) {
        uint256 old = _depositLimit;
        _depositLimit = limit;
        emit DepositLimitUpdated(old, limit);
    }

    function maxDeposit(address) public view override returns (uint256) {
        uint256 assets = totalAssets();
        return assets >= _depositLimit ? 0 : _depositLimit - assets;
    }

    function maxMint(address receiver) public view override returns (uint256) {
        return convertToShares(maxDeposit(receiver));
    }

    function pause() external onlyRole(MANAGER_ROLE) { _pause(); }
    function unpause() external onlyRole(MANAGER_ROLE) { _unpause(); }

    function _update(address from, address to, uint256 value) internal override(ERC20, ERC20Pausable) {
        super._update(from, to, value);
    }

    function decimals() public view override(ERC4626, ERC20) returns (uint8) {
        return super.decimals();
    }

    function supportsInterface(bytes4 interfaceId) public view override(AccessControl) returns (bool) {
        return super.supportsInterface(interfaceId);
    }
}
