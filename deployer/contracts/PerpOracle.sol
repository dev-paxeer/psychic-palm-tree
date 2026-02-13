// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";

contract PerpOracle is Ownable {
    uint8 public constant PRICE_DECIMALS = 18;
    uint8 public constant FUNDING_DECIMALS = 18;

    struct PerpMarketData {
        uint256 indexPrice;
        uint256 markPrice;
        int256 sumUnitaryFunding;
        int256 estFundingRate;
        int256 lastFundingRate;
        uint256 nextFundingTime;
        uint256 lastUpdated;
    }

    mapping(address => PerpMarketData) private markets;

    event PerpMarketUpdated(
        address indexed perp,
        uint256 indexPrice,
        uint256 markPrice,
        int256 sumUnitaryFunding,
        int256 estFundingRate,
        int256 lastFundingRate,
        uint256 nextFundingTime,
        uint256 timestamp
    );

    event PerpMarketsBatchUpdated(uint256 count, uint256 timestamp);

    constructor() Ownable(msg.sender) {}

    function updatePerpMarket(
        address perp,
        uint256 indexPrice,
        uint256 markPrice,
        int256 sumUnitaryFunding,
        int256 estFundingRate,
        int256 lastFundingRate,
        uint256 nextFundingTime
    ) external onlyOwner {
        require(perp != address(0), "Invalid perp address");
        require(indexPrice > 0, "Index price must be > 0");
        require(markPrice > 0, "Mark price must be > 0");

        uint256 timestamp = block.timestamp;

        markets[perp] = PerpMarketData({
            indexPrice: indexPrice,
            markPrice: markPrice,
            sumUnitaryFunding: sumUnitaryFunding,
            estFundingRate: estFundingRate,
            lastFundingRate: lastFundingRate,
            nextFundingTime: nextFundingTime,
            lastUpdated: timestamp
        });

        emit PerpMarketUpdated(
            perp,
            indexPrice,
            markPrice,
            sumUnitaryFunding,
            estFundingRate,
            lastFundingRate,
            nextFundingTime,
            timestamp
        );
    }

    function updatePerpPrices(
        address[] calldata perps,
        uint256[] calldata indexPrices,
        uint256[] calldata markPrices
    ) external onlyOwner {
        uint256 len = perps.length;
        require(len == indexPrices.length && len == markPrices.length, "Array length mismatch");
        require(len > 0, "Empty arrays");

        uint256 timestamp = block.timestamp;

        for (uint256 i = 0; i < len; i++) {
            address perp = perps[i];
            require(perp != address(0), "Invalid perp address");
            require(indexPrices[i] > 0, "Index price must be > 0");
            require(markPrices[i] > 0, "Mark price must be > 0");

            PerpMarketData storage data = markets[perp];
            data.indexPrice = indexPrices[i];
            data.markPrice = markPrices[i];
            data.lastUpdated = timestamp;

            emit PerpMarketUpdated(
                perp,
                data.indexPrice,
                data.markPrice,
                data.sumUnitaryFunding,
                data.estFundingRate,
                data.lastFundingRate,
                data.nextFundingTime,
                timestamp
            );
        }

        emit PerpMarketsBatchUpdated(len, timestamp);
    }

    function updatePerpFunding(
        address[] calldata perps,
        int256[] calldata sumUnitaryFundings,
        int256[] calldata estFundingRates,
        int256[] calldata lastFundingRates,
        uint256[] calldata nextFundingTimes
    ) external onlyOwner {
        uint256 len = perps.length;
        require(
            len == sumUnitaryFundings.length &&
                len == estFundingRates.length &&
                len == lastFundingRates.length &&
                len == nextFundingTimes.length,
            "Array length mismatch"
        );
        require(len > 0, "Empty arrays");

        uint256 timestamp = block.timestamp;

        for (uint256 i = 0; i < len; i++) {
            address perp = perps[i];
            require(perp != address(0), "Invalid perp address");

            PerpMarketData storage data = markets[perp];
            data.sumUnitaryFunding = sumUnitaryFundings[i];
            data.estFundingRate = estFundingRates[i];
            data.lastFundingRate = lastFundingRates[i];
            data.nextFundingTime = nextFundingTimes[i];
            data.lastUpdated = timestamp;

            emit PerpMarketUpdated(
                perp,
                data.indexPrice,
                data.markPrice,
                data.sumUnitaryFunding,
                data.estFundingRate,
                data.lastFundingRate,
                data.nextFundingTime,
                timestamp
            );
        }

        emit PerpMarketsBatchUpdated(len, timestamp);
    }

    function getMarkPrice(address perp) external view returns (uint256) {
        uint256 price = markets[perp].markPrice;
        require(price > 0, "Perp price not set");
        return price;
    }

    function getIndexPrice(address perp) external view returns (uint256) {
        uint256 price = markets[perp].indexPrice;
        require(price > 0, "Perp price not set");
        return price;
    }

    function getPerpData(address perp)
        external
        view
        returns (
            uint256 indexPrice,
            uint256 markPrice,
            int256 sumUnitaryFunding,
            int256 estFundingRate,
            int256 lastFundingRate,
            uint256 nextFundingTime,
            uint256 lastUpdated
        )
    {
        PerpMarketData memory data = markets[perp];
        require(data.markPrice > 0, "Perp data not set");
        return (
            data.indexPrice,
            data.markPrice,
            data.sumUnitaryFunding,
            data.estFundingRate,
            data.lastFundingRate,
            data.nextFundingTime,
            data.lastUpdated
        );
    }

    function hasPerpData(address perp) external view returns (bool) {
        return markets[perp].markPrice > 0;
    }
}
