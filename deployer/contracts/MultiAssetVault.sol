// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

interface IPriceOracle {
    function getPrice(address token) external view returns (uint256);
    function PRICE_DECIMALS() external view returns (uint8);
}

/**
 * @title MultiAssetVault
 * @notice A vault that holds multiple tokens and enables swaps based on oracle prices
 * @dev No fees, no price impact, decimal-aware calculations
 */
contract MultiAssetVault is Ownable, ReentrancyGuard {
    // Price oracle contract
    IPriceOracle public immutable priceOracle;
    
    // USDC address for optimized swap path
    address public immutable USDC;
    
    // Price tolerance: 10% = 1000 basis points
    uint256 public constant PRICE_TOLERANCE_BPS = 1000;
    uint256 public constant BPS_DENOMINATOR = 10000;
    
    // Token information
    struct TokenInfo {
        bool isRegistered;
        uint8 decimals;
        uint256 reserves;
    }
    
    // Mapping from token address to token info
    mapping(address => TokenInfo) public tokens;
    
    // List of registered tokens
    address[] public registeredTokens;
    
    // Events
    event TokenRegistered(address indexed token, uint8 decimals);
    event Deposit(address indexed token, address indexed depositor, uint256 amount);
    event Swap(
        address indexed user,
        address indexed tokenIn,
        address indexed tokenOut,
        uint256 amountIn,
        uint256 amountOut
    );
    
    constructor(address _priceOracle, address _usdc) Ownable(msg.sender) {
        require(_priceOracle != address(0), "Invalid oracle address");
        require(_usdc != address(0), "Invalid USDC address");
        priceOracle = IPriceOracle(_priceOracle);
        USDC = _usdc;
    }
    
    /**
     * @notice Register a new token in the vault
     * @param token The token address to register
     */
    function registerToken(address token) external onlyOwner {
        require(token != address(0), "Invalid token address");
        require(!tokens[token].isRegistered, "Token already registered");
        
        uint8 decimals = IERC20Metadata(token).decimals();
        require(decimals > 0 && decimals <= 18, "Invalid token decimals");
        
        tokens[token] = TokenInfo({
            isRegistered: true,
            decimals: decimals,
            reserves: 0
        });
        
        registeredTokens.push(token);
        
        emit TokenRegistered(token, decimals);
    }
    
    /**
     * @notice Deposit tokens into the vault
     * @param token The token to deposit
     * @param amount The amount to deposit
     */
    function deposit(address token, uint256 amount) external nonReentrant {
        require(tokens[token].isRegistered, "Token not registered");
        require(amount > 0, "Amount must be greater than zero");
        
        // Transfer tokens from user
        require(
            IERC20(token).transferFrom(msg.sender, address(this), amount),
            "Transfer failed"
        );
        
        // Update reserves
        tokens[token].reserves += amount;
        
        emit Deposit(token, msg.sender, amount);
    }
    
    /**
     * @notice Handle direct token transfers to the vault
     * @dev This allows users to simply send tokens to the vault
     * @param token The token that was received
     * @param amount The amount received
     */
    function onTokenReceived(address token, uint256 amount) external {
        require(tokens[token].isRegistered, "Token not registered");
        require(msg.sender == token, "Can only be called by token contract");
        
        // Update reserves
        tokens[token].reserves += amount;
        
        emit Deposit(token, tx.origin, amount);
    }
    
    /**
     * @notice Swap with exact input amount
     * @param tokenIn The token being swapped
     * @param tokenOut The token being received
     * @param amountIn The exact amount of tokenIn to swap
     * @param amountOutMin The minimum amount of tokenOut expected
     * @param priceTokenIn User's price for tokenIn (18 decimals)
     * @param priceTokenOut User's price for tokenOut (18 decimals)
     */
    function swapExactIn(
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 amountOutMin,
        uint256 priceTokenIn,
        uint256 priceTokenOut
    ) external nonReentrant {
        require(tokens[tokenIn].isRegistered, "TokenIn not registered");
        require(tokens[tokenOut].isRegistered, "TokenOut not registered");
        require(tokenIn != tokenOut, "Cannot swap same token");
        require(amountIn > 0, "Amount must be greater than zero");
        
        // Get oracle prices
        uint256 oraclePriceIn = priceOracle.getPrice(tokenIn);
        uint256 oraclePriceOut = priceOracle.getPrice(tokenOut);
        
        // Validate user prices are within tolerance
        _validatePrice(priceTokenIn, oraclePriceIn);
        _validatePrice(priceTokenOut, oraclePriceOut);
        
        // Calculate output amount
        uint256 amountOut;
        
        // Optimized path for USDC swaps
        if (tokenIn == USDC || tokenOut == USDC) {
            amountOut = _calculateSwapUSDC(
                tokenIn,
                tokenOut,
                amountIn,
                oraclePriceIn,
                oraclePriceOut
            );
        } else {
            amountOut = _calculateSwap(
                tokenIn,
                tokenOut,
                amountIn,
                oraclePriceIn,
                oraclePriceOut
            );
        }
        
        require(amountOut >= amountOutMin, "Insufficient output amount");
        require(tokens[tokenOut].reserves >= amountOut, "Insufficient liquidity");
        
        // Execute swap
        _executeSwap(tokenIn, tokenOut, amountIn, amountOut);
    }
    
    /**
     * @notice Swap for exact output amount
     * @param tokenIn The token being swapped
     * @param tokenOut The token being received
     * @param amountOut The exact amount of tokenOut desired
     * @param amountInMax The maximum amount of tokenIn willing to pay
     * @param priceTokenIn User's price for tokenIn (18 decimals)
     * @param priceTokenOut User's price for tokenOut (18 decimals)
     */
    function swapExactOut(
        address tokenIn,
        address tokenOut,
        uint256 amountOut,
        uint256 amountInMax,
        uint256 priceTokenIn,
        uint256 priceTokenOut
    ) external nonReentrant {
        require(tokens[tokenIn].isRegistered, "TokenIn not registered");
        require(tokens[tokenOut].isRegistered, "TokenOut not registered");
        require(tokenIn != tokenOut, "Cannot swap same token");
        require(amountOut > 0, "Amount must be greater than zero");
        require(tokens[tokenOut].reserves >= amountOut, "Insufficient liquidity");
        
        // Get oracle prices
        uint256 oraclePriceIn = priceOracle.getPrice(tokenIn);
        uint256 oraclePriceOut = priceOracle.getPrice(tokenOut);
        
        // Validate user prices are within tolerance
        _validatePrice(priceTokenIn, oraclePriceIn);
        _validatePrice(priceTokenOut, oraclePriceOut);
        
        // Calculate input amount needed
        uint256 amountIn;
        
        // Optimized path for USDC swaps
        if (tokenIn == USDC || tokenOut == USDC) {
            amountIn = _calculateSwapUSDCReverse(
                tokenIn,
                tokenOut,
                amountOut,
                oraclePriceIn,
                oraclePriceOut
            );
        } else {
            amountIn = _calculateSwapReverse(
                tokenIn,
                tokenOut,
                amountOut,
                oraclePriceIn,
                oraclePriceOut
            );
        }
        
        require(amountIn <= amountInMax, "Excessive input amount");
        
        // Execute swap
        _executeSwap(tokenIn, tokenOut, amountIn, amountOut);
    }
    
    /**
     * @notice Validate that user price is within tolerance of oracle price
     */
    function _validatePrice(uint256 userPrice, uint256 oraclePrice) private pure {
        require(userPrice > 0, "Invalid user price");
        require(oraclePrice > 0, "Invalid oracle price");
        
        // Calculate the acceptable price range (±10%)
        uint256 minAcceptable = (oraclePrice * (BPS_DENOMINATOR - PRICE_TOLERANCE_BPS)) / BPS_DENOMINATOR;
        uint256 maxAcceptable = (oraclePrice * (BPS_DENOMINATOR + PRICE_TOLERANCE_BPS)) / BPS_DENOMINATOR;
        
        require(
            userPrice >= minAcceptable && userPrice <= maxAcceptable,
            "Price outside acceptable range"
        );
    }
    
    /**
     * @notice Calculate swap output amount (decimal-aware)
     */
    function _calculateSwap(
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 priceIn,
        uint256 priceOut
    ) private view returns (uint256) {
        uint8 decimalsIn = tokens[tokenIn].decimals;
        uint8 decimalsOut = tokens[tokenOut].decimals;
        uint8 priceDecimals = priceOracle.PRICE_DECIMALS();
        
        // Calculate value in USD: (amountIn * priceIn) / (10^decimalsIn)
        // Then convert to output tokens: (valueUSD * 10^decimalsOut) / priceOut
        // Combined: (amountIn * priceIn * 10^decimalsOut) / (priceOut * 10^decimalsIn)
        
        uint256 numerator = amountIn * priceIn;
        uint256 denominator = priceOut;
        
        // Adjust for decimal differences
        if (decimalsOut > decimalsIn) {
            numerator *= 10 ** (decimalsOut - decimalsIn);
        } else if (decimalsIn > decimalsOut) {
            denominator *= 10 ** (decimalsIn - decimalsOut);
        }
        
        return numerator / denominator;
    }
    
    /**
     * @notice Calculate swap input amount needed for exact output (decimal-aware)
     */
    function _calculateSwapReverse(
        address tokenIn,
        address tokenOut,
        uint256 amountOut,
        uint256 priceIn,
        uint256 priceOut
    ) private view returns (uint256) {
        uint8 decimalsIn = tokens[tokenIn].decimals;
        uint8 decimalsOut = tokens[tokenOut].decimals;
        
        // Calculate value in USD: (amountOut * priceOut) / (10^decimalsOut)
        // Then convert to input tokens: (valueUSD * 10^decimalsIn) / priceIn
        // Combined: (amountOut * priceOut * 10^decimalsIn) / (priceIn * 10^decimalsOut)
        
        uint256 numerator = amountOut * priceOut;
        uint256 denominator = priceIn;
        
        // Adjust for decimal differences
        if (decimalsIn > decimalsOut) {
            numerator *= 10 ** (decimalsIn - decimalsOut);
        } else if (decimalsOut > decimalsIn) {
            denominator *= 10 ** (decimalsOut - decimalsIn);
        }
        
        return numerator / denominator;
    }
    
    /**
     * @notice Optimized calculation for USDC swaps (USDC has 6 decimals)
     */
    function _calculateSwapUSDC(
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 priceIn,
        uint256 priceOut
    ) private view returns (uint256) {
        // Same logic as regular swap but may be gas-optimized
        return _calculateSwap(tokenIn, tokenOut, amountIn, priceIn, priceOut);
    }
    
    /**
     * @notice Optimized reverse calculation for USDC swaps
     */
    function _calculateSwapUSDCReverse(
        address tokenIn,
        address tokenOut,
        uint256 amountOut,
        uint256 priceIn,
        uint256 priceOut
    ) private view returns (uint256) {
        // Same logic as regular reverse swap but may be gas-optimized
        return _calculateSwapReverse(tokenIn, tokenOut, amountOut, priceIn, priceOut);
    }
    
    /**
     * @notice Execute the token swap
     */
    function _executeSwap(
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 amountOut
    ) private {
        // Transfer tokens in from user
        require(
            IERC20(tokenIn).transferFrom(msg.sender, address(this), amountIn),
            "Transfer in failed"
        );
        
        // Update reserves
        tokens[tokenIn].reserves += amountIn;
        tokens[tokenOut].reserves -= amountOut;
        
        // Transfer tokens out to user
        require(
            IERC20(tokenOut).transfer(msg.sender, amountOut),
            "Transfer out failed"
        );
        
        emit Swap(msg.sender, tokenIn, tokenOut, amountIn, amountOut);
    }
    
    /**
     * @notice Get token reserves
     */
    function getReserves(address token) external view returns (uint256) {
        require(tokens[token].isRegistered, "Token not registered");
        return tokens[token].reserves;
    }
    
    /**
     * @notice Get list of all registered tokens
     */
    function getRegisteredTokens() external view returns (address[] memory) {
        return registeredTokens;
    }
    
    /**
     * @notice Get token information
     */
    function getTokenInfo(address token) external view returns (
        bool isRegistered,
        uint8 decimals,
        uint256 reserves
    ) {
        TokenInfo memory info = tokens[token];
        return (info.isRegistered, info.decimals, info.reserves);
    }
    
    /**
     * @notice Emergency withdraw function (only owner)
     */
    function emergencyWithdraw(address token, uint256 amount) external onlyOwner {
        require(tokens[token].isRegistered, "Token not registered");
        require(tokens[token].reserves >= amount, "Insufficient reserves");
        
        tokens[token].reserves -= amount;
        require(IERC20(token).transfer(owner(), amount), "Transfer failed");
    }
}
