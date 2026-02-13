// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title IPaxStaking
 * @notice Interface for Paxeer staking pools with time-based reward accrual
 */
interface IPaxStaking {
    // ═══════════════════════════════════════════════════════════════════
    //  EVENTS
    // ═══════════════════════════════════════════════════════════════════

    event Staked(address indexed user, uint256 amount);
    event Withdrawn(address indexed user, uint256 amount);
    event RewardClaimed(address indexed user, uint256 reward);
    event RewardRateUpdated(uint256 oldRate, uint256 newRate);
    event RewardsDeposited(address indexed depositor, uint256 amount);
    event EmergencyWithdraw(address indexed user, uint256 amount);

    // ═══════════════════════════════════════════════════════════════════
    //  VIEWS
    // ═══════════════════════════════════════════════════════════════════

    function stakingToken() external view returns (address);
    function rewardToken() external view returns (address);
    function rewardRate() external view returns (uint256);
    function totalStaked() external view returns (uint256);
    function stakedBalance(address account) external view returns (uint256);
    function earned(address account) external view returns (uint256);
    function rewardPerToken() external view returns (uint256);

    // ═══════════════════════════════════════════════════════════════════
    //  ACTIONS
    // ═══════════════════════════════════════════════════════════════════

    function stake(uint256 amount) external;
    function withdraw(uint256 amount) external;
    function claimReward() external;
    function emergencyWithdraw() external;
    function setRewardRate(uint256 newRate) external;
    function depositRewards(uint256 amount) external;
}
