// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title PriceOracle
 * @notice Stores and provides price data for tokens with 18 decimal precision
 * @dev Prices are stored with 18 decimals regardless of token decimals
 */
contract PriceOracle is Ownable {
    // Price decimals - all prices are stored with 18 decimals
    uint8 public constant PRICE_DECIMALS = 18;
    
    // Mapping from token address to its price (in USD with 18 decimals)
    mapping(address => uint256) private prices;
    
    // Mapping from token address to last update timestamp
    mapping(address => uint256) private lastUpdated;
    
    // Events
    event PriceUpdated(address indexed token, uint256 price, uint256 timestamp);
    event PricesBatchUpdated(address[] tokens, uint256[] prices, uint256 timestamp);
    
    constructor() Ownable(msg.sender) {}
    
    /**
     * @notice Update price for a single token
     * @param token The token address
     * @param price The price with 18 decimals
     */
    function updatePrice(address token, uint256 price) external onlyOwner {
        require(token != address(0), "Invalid token address");
        require(price > 0, "Price must be greater than zero");
        
        prices[token] = price;
        lastUpdated[token] = block.timestamp;
        
        emit PriceUpdated(token, price, block.timestamp);
    }
    
    /**
     * @notice Update prices for multiple tokens in a single transaction
     * @param tokens Array of token addresses
     * @param newPrices Array of prices with 18 decimals
     */
    function updatePrices(address[] calldata tokens, uint256[] calldata newPrices) external onlyOwner {
        require(tokens.length == newPrices.length, "Arrays length mismatch");
        require(tokens.length > 0, "Empty arrays");
        
        uint256 timestamp = block.timestamp;
        
        for (uint256 i = 0; i < tokens.length; i++) {
            require(tokens[i] != address(0), "Invalid token address");
            require(newPrices[i] > 0, "Price must be greater than zero");
            
            prices[tokens[i]] = newPrices[i];
            lastUpdated[tokens[i]] = timestamp;
        }
        
        emit PricesBatchUpdated(tokens, newPrices, timestamp);
    }
    
    /**
     * @notice Get the current price of a token
     * @param token The token address
     * @return The price with 18 decimals
     */
    function getPrice(address token) external view returns (uint256) {
        uint256 price = prices[token];
        require(price > 0, "Price not set for token");
        return price;
    }
    
    /**
     * @notice Get prices for multiple tokens
     * @param tokens Array of token addresses
     * @return Array of prices with 18 decimals
     */
    function getPrices(address[] calldata tokens) external view returns (uint256[] memory) {
        uint256[] memory result = new uint256[](tokens.length);
        
        for (uint256 i = 0; i < tokens.length; i++) {
            uint256 price = prices[tokens[i]];
            require(price > 0, "Price not set for token");
            result[i] = price;
        }
        
        return result;
    }
    
    /**
     * @notice Get the last update timestamp for a token
     * @param token The token address
     * @return The timestamp of the last price update
     */
    function getLastUpdated(address token) external view returns (uint256) {
        return lastUpdated[token];
    }
    
    /**
     * @notice Check if a token has a valid price
     * @param token The token address
     * @return True if the token has a non-zero price
     */
    function hasPrice(address token) external view returns (bool) {
        return prices[token] > 0;
    }
}
