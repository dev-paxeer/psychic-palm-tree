// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "../libraries/PaxUtils.sol";
import "../libraries/PaxErrors.sol";

/**
 * @title PaxFeeManager
 * @notice Configurable fee collection module for marketplace and protocol contracts
 */
abstract contract PaxFeeManager is AccessControl {
    bytes32 public constant FEE_MANAGER_ROLE = keccak256("FEE_MANAGER_ROLE");

    uint256 private _platformFeeBps;
    address private _feeRecipient;

    event PlatformFeeUpdated(uint256 oldFee, uint256 newFee);
    event FeeRecipientUpdated(address oldRecipient, address newRecipient);

    constructor(uint256 feeBps_, address feeRecipient_) {
        if (!PaxUtils.validateFee(feeBps_)) revert PaxErrors.InvalidFee(feeBps_);
        if (feeRecipient_ == address(0)) revert PaxErrors.ZeroAddress();
        _platformFeeBps = feeBps_;
        _feeRecipient = feeRecipient_;
    }

    function platformFeeBps() public view returns (uint256) {
        return _platformFeeBps;
    }

    function feeRecipient() public view returns (address) {
        return _feeRecipient;
    }

    function setPlatformFee(uint256 feeBps_) external onlyRole(FEE_MANAGER_ROLE) {
        if (!PaxUtils.validateFee(feeBps_)) revert PaxErrors.InvalidFee(feeBps_);
        uint256 old = _platformFeeBps;
        _platformFeeBps = feeBps_;
        emit PlatformFeeUpdated(old, feeBps_);
    }

    function setFeeRecipient(address recipient_) external onlyRole(FEE_MANAGER_ROLE) {
        if (recipient_ == address(0)) revert PaxErrors.ZeroAddress();
        address old = _feeRecipient;
        _feeRecipient = recipient_;
        emit FeeRecipientUpdated(old, recipient_);
    }

    function _collectFee(uint256 amount) internal returns (uint256 fee) {
        fee = PaxUtils.calculateFee(amount, _platformFeeBps);
        if (fee > 0) {
            PaxUtils.safeTransferETH(_feeRecipient, fee);
        }
    }
}
