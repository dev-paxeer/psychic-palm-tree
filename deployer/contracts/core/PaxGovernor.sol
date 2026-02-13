// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/governance/Governor.sol";
import "@openzeppelin/contracts/governance/extensions/GovernorSettings.sol";
import "@openzeppelin/contracts/governance/extensions/GovernorCountingSimple.sol";
import "@openzeppelin/contracts/governance/extensions/GovernorVotes.sol";
import "@openzeppelin/contracts/governance/extensions/GovernorVotesQuorumFraction.sol";
import "../libraries/PaxEvents.sol";

/**
 * @title PaxGovernor
 * @notice On-chain DAO governance: proposals, voting, quorum, configurable periods.
 *         Requires an ERC20Votes-compatible governance token.
 */
contract PaxGovernor is
    Governor,
    GovernorSettings,
    GovernorCountingSimple,
    GovernorVotes,
    GovernorVotesQuorumFraction
{
    /**
     * @param name_           Governor name
     * @param token_          ERC20Votes governance token address
     * @param votingDelay_    Blocks before voting starts after proposal
     * @param votingPeriod_   Duration of voting in blocks
     * @param quorumPercent_  % of total supply needed for quorum (e.g. 4 = 4%)
     */
    constructor(
        string memory name_,
        address token_,
        uint48 votingDelay_,
        uint32 votingPeriod_,
        uint256 quorumPercent_
    )
        Governor(name_)
        GovernorSettings(votingDelay_, votingPeriod_, 0)
        GovernorVotes(IVotes(token_))
        GovernorVotesQuorumFraction(quorumPercent_)
    {
        emit PaxEvents.ContractDeployed("PaxGovernor", address(this), msg.sender, block.timestamp);
    }

    // ── Required overrides ───────────────────────────────────────────

    function votingDelay() public view override(Governor, GovernorSettings) returns (uint256) {
        return super.votingDelay();
    }

    function votingPeriod() public view override(Governor, GovernorSettings) returns (uint256) {
        return super.votingPeriod();
    }

    function quorum(uint256 blockNumber) public view override(Governor, GovernorVotesQuorumFraction) returns (uint256) {
        return super.quorum(blockNumber);
    }

    function proposalThreshold() public view override(Governor, GovernorSettings) returns (uint256) {
        return super.proposalThreshold();
    }
}
