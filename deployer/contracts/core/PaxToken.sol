// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Pausable.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "../interfaces/IPaxToken.sol";
import "../libraries/PaxErrors.sol";
import "../libraries/PaxEvents.sol";
import "../modules/PaxBlacklist.sol";

/**
 * @title PaxToken
 * @notice Full-featured ERC20: mint, burn, pause, permit, access control, blacklist, supply cap, batch mint
 * @dev Deploys on HyperPaxeer Network (Chain ID 125)
 */
contract PaxToken is
    ERC20,
    ERC20Burnable,
    ERC20Pausable,
    ERC20Permit,
    AccessControl,
    PaxBlacklist,
    IPaxToken
{
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");

    uint256 public immutable supplyCap;

    /**
     * @param _name         Token name
     * @param _symbol       Token symbol
     * @param _initialSupply Tokens to mint to deployer (whole units, decimals applied)
     * @param _cap          Max total supply ever (0 = unlimited, whole units)
     * @param _owner        Address that receives admin roles and initial supply
     */
    constructor(
        string memory _name,
        string memory _symbol,
        uint256 _initialSupply,
        uint256 _cap,
        address _owner
    ) ERC20(_name, _symbol) ERC20Permit(_name) {
        if (_owner == address(0)) revert PaxErrors.ZeroAddress();

        uint256 capWei = _cap == 0 ? type(uint256).max : _cap * 10 ** decimals();
        uint256 supplyWei = _initialSupply * 10 ** decimals();
        if (supplyWei > capWei) revert PaxErrors.SupplyCapExceeded(capWei, supplyWei);

        supplyCap = capWei;

        _grantRole(DEFAULT_ADMIN_ROLE, _owner);
        _grantRole(MINTER_ROLE, _owner);
        _grantRole(PAUSER_ROLE, _owner);
        _grantRole(BLACKLIST_ROLE, _owner);

        if (_initialSupply > 0) {
            _mint(_owner, supplyWei);
            emit TokensMinted(_owner, supplyWei, _owner);
        }

        emit PaxEvents.ContractDeployed("PaxToken", address(this), msg.sender, block.timestamp);
    }

    function mint(address to, uint256 amount) external onlyRole(MINTER_ROLE) {
        if (to == address(0)) revert PaxErrors.ZeroAddress();
        if (amount == 0) revert PaxErrors.ZeroAmount();
        if (totalSupply() + amount > supplyCap) revert PaxErrors.SupplyCapExceeded(supplyCap, totalSupply() + amount);
        _mint(to, amount);
        emit TokensMinted(to, amount, msg.sender);
    }

    function batchMint(address[] calldata recipients, uint256[] calldata amounts) external onlyRole(MINTER_ROLE) {
        if (recipients.length != amounts.length) revert PaxErrors.ArrayLengthMismatch(recipients.length, amounts.length);
        uint256 totalAmount;
        for (uint256 i = 0; i < amounts.length; i++) {
            totalAmount += amounts[i];
        }
        if (totalSupply() + totalAmount > supplyCap) revert PaxErrors.SupplyCapExceeded(supplyCap, totalSupply() + totalAmount);

        for (uint256 i = 0; i < recipients.length; i++) {
            if (recipients[i] == address(0)) revert PaxErrors.ZeroAddress();
            _mint(recipients[i], amounts[i]);
            emit TokensMinted(recipients[i], amounts[i], msg.sender);
        }
    }

    function pause() external onlyRole(PAUSER_ROLE) { _pause(); }
    function unpause() external onlyRole(PAUSER_ROLE) { _unpause(); }

    // Override _update to enforce pausable + blacklist
    function _update(address from, address to, uint256 value)
        internal
        override(ERC20, ERC20Pausable)
    {
        if (from != address(0) && isBlacklisted(from)) revert PaxErrors.Blacklisted(from);
        if (to != address(0) && isBlacklisted(to)) revert PaxErrors.Blacklisted(to);
        super._update(from, to, value);
    }

    function supportsInterface(bytes4 interfaceId) public view override(AccessControl) returns (bool) {
        return super.supportsInterface(interfaceId);
    }
}
