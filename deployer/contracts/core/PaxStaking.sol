// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "../interfaces/IPaxStaking.sol";
import "../libraries/PaxErrors.sol";
import "../libraries/PaxEvents.sol";

/**
 * @title PaxStaking
 * @notice ERC20 staking pool with time-based reward accrual, configurable reward rate,
 *         emergency withdraw, reward deposits, pausable, reentrancy-safe
 */
contract PaxStaking is ReentrancyGuard, Pausable, Ownable, IPaxStaking {
    using SafeERC20 for IERC20;

    IERC20 public immutable _stakingToken;
    IERC20 public immutable _rewardToken;

    uint256 public _rewardRate;
    uint256 public lastUpdateTime;
    uint256 public rewardPerTokenStored;
    uint256 public _totalStaked;

    mapping(address => uint256) public _stakedBalance;
    mapping(address => uint256) public userRewardPerTokenPaid;
    mapping(address => uint256) public rewards;

    /**
     * @param stakingToken_  ERC20 token users stake
     * @param rewardToken_   ERC20 token distributed as rewards
     * @param rewardRate_    Reward tokens per second (in wei)
     * @param owner_         Admin address
     */
    constructor(
        address stakingToken_,
        address rewardToken_,
        uint256 rewardRate_,
        address owner_
    ) Ownable(owner_) {
        if (stakingToken_ == address(0) || rewardToken_ == address(0)) revert PaxErrors.ZeroAddress();
        if (owner_ == address(0)) revert PaxErrors.ZeroAddress();
        _stakingToken = IERC20(stakingToken_);
        _rewardToken = IERC20(rewardToken_);
        _rewardRate = rewardRate_;
        lastUpdateTime = block.timestamp;

        emit PaxEvents.ContractDeployed("PaxStaking", address(this), msg.sender, block.timestamp);
    }

    modifier updateReward(address account) {
        rewardPerTokenStored = rewardPerToken();
        lastUpdateTime = block.timestamp;
        if (account != address(0)) {
            rewards[account] = earned(account);
            userRewardPerTokenPaid[account] = rewardPerTokenStored;
        }
        _;
    }

    // ── IPaxStaking views ────────────────────────────────────────────

    function stakingToken() external view returns (address) { return address(_stakingToken); }
    function rewardToken() external view returns (address) { return address(_rewardToken); }
    function rewardRate() external view returns (uint256) { return _rewardRate; }
    function totalStaked() external view returns (uint256) { return _totalStaked; }
    function stakedBalance(address account) external view returns (uint256) { return _stakedBalance[account]; }

    function rewardPerToken() public view returns (uint256) {
        if (_totalStaked == 0) return rewardPerTokenStored;
        return rewardPerTokenStored + ((block.timestamp - lastUpdateTime) * _rewardRate * 1e18) / _totalStaked;
    }

    function earned(address account) public view returns (uint256) {
        return (_stakedBalance[account] * (rewardPerToken() - userRewardPerTokenPaid[account])) / 1e18 + rewards[account];
    }

    // ── IPaxStaking actions ──────────────────────────────────────────

    function stake(uint256 amount) external nonReentrant whenNotPaused updateReward(msg.sender) {
        if (amount == 0) revert PaxErrors.ZeroAmount();
        _totalStaked += amount;
        _stakedBalance[msg.sender] += amount;
        _stakingToken.safeTransferFrom(msg.sender, address(this), amount);
        emit Staked(msg.sender, amount);
    }

    function withdraw(uint256 amount) external nonReentrant updateReward(msg.sender) {
        if (amount == 0) revert PaxErrors.ZeroAmount();
        if (_stakedBalance[msg.sender] < amount) {
            revert PaxErrors.InsufficientBalance(amount, _stakedBalance[msg.sender]);
        }
        _totalStaked -= amount;
        _stakedBalance[msg.sender] -= amount;
        _stakingToken.safeTransfer(msg.sender, amount);
        emit Withdrawn(msg.sender, amount);
    }

    function claimReward() external nonReentrant updateReward(msg.sender) {
        uint256 reward = rewards[msg.sender];
        if (reward > 0) {
            rewards[msg.sender] = 0;
            _rewardToken.safeTransfer(msg.sender, reward);
            emit RewardClaimed(msg.sender, reward);
        }
    }

    function emergencyWithdraw() external nonReentrant {
        uint256 amount = _stakedBalance[msg.sender];
        if (amount == 0) revert PaxErrors.NothingStaked();
        _totalStaked -= amount;
        _stakedBalance[msg.sender] = 0;
        rewards[msg.sender] = 0;
        _stakingToken.safeTransfer(msg.sender, amount);
        emit EmergencyWithdraw(msg.sender, amount);
    }

    // ── Owner functions ──────────────────────────────────────────────

    function setRewardRate(uint256 newRate) external onlyOwner updateReward(address(0)) {
        uint256 old = _rewardRate;
        _rewardRate = newRate;
        emit RewardRateUpdated(old, newRate);
    }

    function depositRewards(uint256 amount) external onlyOwner {
        if (amount == 0) revert PaxErrors.ZeroAmount();
        _rewardToken.safeTransferFrom(msg.sender, address(this), amount);
        emit RewardsDeposited(msg.sender, amount);
    }

    function pause() external onlyOwner { _pause(); }
    function unpause() external onlyOwner { _unpause(); }
}
