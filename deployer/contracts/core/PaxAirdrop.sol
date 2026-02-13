// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "../libraries/PaxErrors.sol";
import "../libraries/PaxEvents.sol";

/**
 * @title PaxAirdrop
 * @notice Gas-efficient Merkle tree airdrop: claim with proof, deadline expiry,
 *         duplicate prevention, owner recovery of unclaimed tokens, pausable
 */
contract PaxAirdrop is Pausable, Ownable {
    using SafeERC20 for IERC20;

    IERC20 public immutable token;
    bytes32 public immutable merkleRoot;
    uint256 public immutable deadline;

    mapping(address => bool) public hasClaimed;
    uint256 public totalClaimed;
    uint256 public claimCount;

    event Claimed(address indexed account, uint256 amount);
    event RemainingWithdrawn(address indexed owner, uint256 amount);

    /**
     * @param token_       ERC20 token to airdrop
     * @param merkleRoot_  Root hash of the Merkle tree of recipients
     * @param deadline_    Unix timestamp after which claims expire
     * @param owner_       Admin address
     */
    constructor(
        address token_,
        bytes32 merkleRoot_,
        uint256 deadline_,
        address owner_
    ) Ownable(owner_) {
        if (token_ == address(0)) revert PaxErrors.ZeroAddress();
        if (owner_ == address(0)) revert PaxErrors.ZeroAddress();
        if (deadline_ <= block.timestamp) revert PaxErrors.DeadlineExpired(deadline_, block.timestamp);

        token = IERC20(token_);
        merkleRoot = merkleRoot_;
        deadline = deadline_;

        emit PaxEvents.ContractDeployed("PaxAirdrop", address(this), msg.sender, block.timestamp);
    }

    function claim(uint256 amount, bytes32[] calldata proof) external whenNotPaused {
        if (block.timestamp > deadline) revert PaxErrors.DeadlineExpired(deadline, block.timestamp);
        if (hasClaimed[msg.sender]) revert PaxErrors.AlreadyClaimed(msg.sender);

        bytes32 leaf = keccak256(bytes.concat(keccak256(abi.encode(msg.sender, amount))));
        if (!MerkleProof.verify(proof, merkleRoot, leaf)) revert PaxErrors.InvalidProof();

        hasClaimed[msg.sender] = true;
        totalClaimed += amount;
        claimCount++;
        token.safeTransfer(msg.sender, amount);
        emit Claimed(msg.sender, amount);
    }

    function withdrawRemaining() external onlyOwner {
        if (block.timestamp <= deadline) revert PaxErrors.DeadlineNotReached(deadline, block.timestamp);
        uint256 balance = token.balanceOf(address(this));
        token.safeTransfer(owner(), balance);
        emit RemainingWithdrawn(owner(), balance);
    }

    function pause() external onlyOwner { _pause(); }
    function unpause() external onlyOwner { _unpause(); }
}
