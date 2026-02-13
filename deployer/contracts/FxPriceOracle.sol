// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";

contract FxPriceOracle is Ownable {
    uint8 public constant PRICE_DECIMALS = 18;

    // Market IDs are bytes32 (e.g. keccak256("EUR/USD"))
    mapping(bytes32 => uint256) private prices;
    mapping(bytes32 => uint256) private lastUpdated;

    event PriceUpdated(bytes32 indexed marketId, uint256 price, uint256 timestamp);
    event PricesBatchUpdated(bytes32[] marketIds, uint256[] prices, uint256 timestamp);

    constructor() Ownable(msg.sender) {}

    function updatePrice(bytes32 marketId, uint256 price) external onlyOwner {
        require(marketId != bytes32(0), "Invalid marketId");
        require(price > 0, "Price must be greater than zero");

        prices[marketId] = price;
        lastUpdated[marketId] = block.timestamp;

        emit PriceUpdated(marketId, price, block.timestamp);
    }

    function updatePrices(bytes32[] calldata marketIds, uint256[] calldata newPrices) external onlyOwner {
        require(marketIds.length == newPrices.length, "Arrays length mismatch");
        require(marketIds.length > 0, "Empty arrays");

        uint256 timestamp = block.timestamp;

        for (uint256 i = 0; i < marketIds.length; i++) {
            require(marketIds[i] != bytes32(0), "Invalid marketId");
            require(newPrices[i] > 0, "Price must be greater than zero");

            prices[marketIds[i]] = newPrices[i];
            lastUpdated[marketIds[i]] = timestamp;
        }

        emit PricesBatchUpdated(marketIds, newPrices, timestamp);
    }

    function getPrice(bytes32 marketId) external view returns (uint256) {
        uint256 price = prices[marketId];
        require(price > 0, "Price not set for market");
        return price;
    }

    function getPrices(bytes32[] calldata marketIds) external view returns (uint256[] memory) {
        uint256[] memory result = new uint256[](marketIds.length);

        for (uint256 i = 0; i < marketIds.length; i++) {
            uint256 price = prices[marketIds[i]];
            require(price > 0, "Price not set for market");
            result[i] = price;
        }

        return result;
    }

    function getLastUpdated(bytes32 marketId) external view returns (uint256) {
        return lastUpdated[marketId];
    }

    function hasPrice(bytes32 marketId) external view returns (bool) {
        return prices[marketId] > 0;
    }
}
