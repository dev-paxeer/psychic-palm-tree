// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "../libraries/PaxErrors.sol";

/**
 * @title PaxBlacklist
 * @notice Blacklist module for compliance — blocks transfers to/from flagged addresses
 */
abstract contract PaxBlacklist is AccessControl {
    bytes32 public constant BLACKLIST_ROLE = keccak256("BLACKLIST_ROLE");

    mapping(address => bool) private _blacklisted;

    event Blacklisted(address indexed account);
    event Unblacklisted(address indexed account);

    modifier notBlacklisted(address account) {
        if (_blacklisted[account]) revert PaxErrors.Blacklisted(account);
        _;
    }

    function isBlacklisted(address account) public view returns (bool) {
        return _blacklisted[account];
    }

    function setBlacklist(address account, bool status) external onlyRole(BLACKLIST_ROLE) {
        if (account == address(0)) revert PaxErrors.ZeroAddress();
        _blacklisted[account] = status;
        if (status) {
            emit Blacklisted(account);
        } else {
            emit Unblacklisted(account);
        }
    }

    function batchBlacklist(address[] calldata accounts, bool status) external onlyRole(BLACKLIST_ROLE) {
        for (uint256 i = 0; i < accounts.length; i++) {
            if (accounts[i] == address(0)) revert PaxErrors.ZeroAddress();
            _blacklisted[accounts[i]] = status;
            if (status) {
                emit Blacklisted(accounts[i]);
            } else {
                emit Unblacklisted(accounts[i]);
            }
        }
    }
}
