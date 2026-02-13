// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";

contract StockPriceOracle is Ownable {
    uint8 public constant PRICE_DECIMALS = 18;

    mapping(address => uint256) private prices;
    mapping(address => uint256) private lastUpdated;

    event PriceUpdated(address indexed token, uint256 price, uint256 timestamp);
    event PricesBatchUpdated(address[] tokens, uint256[] prices, uint256 timestamp);

    constructor() Ownable(msg.sender) {}

    function updatePrice(address token, uint256 price) external onlyOwner {
        require(token != address(0), "Invalid token address");
        require(price > 0, "Price must be greater than zero");

        prices[token] = price;
        lastUpdated[token] = block.timestamp;

        emit PriceUpdated(token, price, block.timestamp);
    }

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

    function getPrice(address token) external view returns (uint256) {
        uint256 price = prices[token];
        require(price > 0, "Price not set for token");
        return price;
    }

    function getPrices(address[] calldata tokens) external view returns (uint256[] memory) {
        uint256[] memory result = new uint256[](tokens.length);

        for (uint256 i = 0; i < tokens.length; i++) {
            uint256 price = prices[tokens[i]];
            require(price > 0, "Price not set for token");
            result[i] = price;
        }

        return result;
    }

    function getLastUpdated(address token) external view returns (uint256) {
        return lastUpdated[token];
    }

    function hasPrice(address token) external view returns (bool) {
        return prices[token] > 0;
    }
}
