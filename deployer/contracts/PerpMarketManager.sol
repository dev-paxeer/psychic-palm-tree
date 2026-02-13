// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

interface IPerpOracle {
    function getMarkPrice(address perp) external view returns (uint256);
    function getIndexPrice(address perp) external view returns (uint256);
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
        );
}

contract PerpMarketManager is ReentrancyGuard, Ownable {
    using SafeERC20 for IERC20;

    uint256 public constant BPS_DENOMINATOR = 10000;
    uint256 public constant ONE = 1e18;

    IERC20 public immutable collateralToken;
    IPerpOracle public immutable perpOracle;

    struct MarketConfig {
        bool isActive;
        uint256 maxLeverageBps;
        uint256 initialMarginBps;
        uint256 maintenanceMarginBps;
        uint256 takerFeeBps;
        uint256 makerFeeBps;
        uint256 liquidationFeeBps;
    }

    struct Position {
        bool isLong;
        bool isOpen;
        int256 size;        // Signed position size, 1e18 units
        uint256 entryPrice; // 1e18 price
        uint256 margin;     // Collateral in collateralToken units
    }

    mapping(address => MarketConfig) public marketConfigs; // perp token => config
    mapping(address => mapping(address => Position)) public positions; // user => perp => position

    mapping(address => uint256) public collateralBalance; // user => total collateral deposited
    mapping(address => uint256) public usedCollateral;     // user => collateral locked as margin

    uint256 public protocolBadDebt;

    event MarketConfigured(
        address indexed perp,
        bool isActive,
        uint256 maxLeverageBps,
        uint256 initialMarginBps,
        uint256 maintenanceMarginBps,
        uint256 takerFeeBps,
        uint256 makerFeeBps,
        uint256 liquidationFeeBps
    );

    event CollateralDeposited(address indexed user, uint256 amount);
    event CollateralWithdrawn(address indexed user, uint256 amount);

    event PositionOpened(
        address indexed user,
        address indexed perp,
        bool isLong,
        int256 size,
        uint256 entryPrice,
        uint256 margin
    );

    event PositionClosed(
        address indexed user,
        address indexed perp,
        int256 size,
        uint256 entryPrice,
        uint256 exitPrice,
        int256 pnl,
        uint256 marginReleased
    );

    constructor(address _collateralToken, address _perpOracle) Ownable(msg.sender) {
        require(_collateralToken != address(0), "Invalid collateral token");
        require(_perpOracle != address(0), "Invalid oracle");
        collateralToken = IERC20(_collateralToken);
        perpOracle = IPerpOracle(_perpOracle);
    }

    function configureMarket(
        address perp,
        bool isActive,
        uint256 maxLeverageBps,
        uint256 initialMarginBps,
        uint256 maintenanceMarginBps,
        uint256 takerFeeBps,
        uint256 makerFeeBps,
        uint256 liquidationFeeBps
    ) external onlyOwner {
        require(perp != address(0), "Invalid perp address");
        require(maxLeverageBps > 0, "Invalid leverage");
        require(maintenanceMarginBps <= initialMarginBps, "Maintenance > initial");

        marketConfigs[perp] = MarketConfig({
            isActive: isActive,
            maxLeverageBps: maxLeverageBps,
            initialMarginBps: initialMarginBps,
            maintenanceMarginBps: maintenanceMarginBps,
            takerFeeBps: takerFeeBps,
            makerFeeBps: makerFeeBps,
            liquidationFeeBps: liquidationFeeBps
        });

        emit MarketConfigured(
            perp,
            isActive,
            maxLeverageBps,
            initialMarginBps,
            maintenanceMarginBps,
            takerFeeBps,
            makerFeeBps,
            liquidationFeeBps
        );
    }

    function depositCollateral(uint256 amount) external nonReentrant {
        require(amount > 0, "Amount must be > 0");
        collateralToken.safeTransferFrom(msg.sender, address(this), amount);
        collateralBalance[msg.sender] += amount;
        emit CollateralDeposited(msg.sender, amount);
    }

    function withdrawCollateral(uint256 amount) external nonReentrant {
        require(amount > 0, "Amount must be > 0");
        uint256 available = collateralBalance[msg.sender] - usedCollateral[msg.sender];
        require(amount <= available, "Insufficient free collateral");

        collateralBalance[msg.sender] -= amount;
        collateralToken.safeTransfer(msg.sender, amount);
        emit CollateralWithdrawn(msg.sender, amount);
    }

    function openPosition(
        address perp,
        bool isLong,
        uint256 marginAmount,
        uint256 leverageBps
    ) external nonReentrant {
        MarketConfig memory cfg = marketConfigs[perp];
        require(cfg.isActive, "Market not active");
        require(marginAmount > 0, "Margin must be > 0");
        require(leverageBps > 0 && leverageBps <= cfg.maxLeverageBps, "Invalid leverage");

        Position storage pos = positions[msg.sender][perp];
        require(!pos.isOpen, "Position already open");

        uint256 freeCollateral = collateralBalance[msg.sender] - usedCollateral[msg.sender];
        require(marginAmount <= freeCollateral, "Insufficient collateral");

        uint256 markPrice = perpOracle.getMarkPrice(perp);

        uint256 notionalUsd = (marginAmount * leverageBps) / BPS_DENOMINATOR;
        require(notionalUsd > 0, "Notional too small");

        uint256 sizeAbs = (notionalUsd * ONE) / markPrice;
        require(sizeAbs > 0, "Size too small");

        int256 signedSize = isLong ? int256(sizeAbs) : -int256(sizeAbs);

        pos.isLong = isLong;
        pos.isOpen = true;
        pos.size = signedSize;
        pos.entryPrice = markPrice;
        pos.margin = marginAmount;

        usedCollateral[msg.sender] += marginAmount;

        emit PositionOpened(msg.sender, perp, isLong, signedSize, markPrice, marginAmount);
    }

    function closePosition(address perp) external nonReentrant {
        _closePosition(msg.sender, perp);
    }

    function forceClosePosition(address user, address perp) external onlyOwner nonReentrant {
        _closePosition(user, perp);
    }

    function _closePosition(address user, address perp) internal {
        Position storage pos = positions[user][perp];
        require(pos.isOpen, "No open position");

        uint256 markPrice = perpOracle.getMarkPrice(perp);
        int256 pnl = _calculatePnl(pos, markPrice);
        uint256 margin = pos.margin;

        usedCollateral[user] -= margin;

        if (pnl >= 0) {
            uint256 profit = uint256(pnl);
            collateralBalance[user] += profit;
        } else {
            uint256 loss = uint256(-pnl);
            uint256 collateral = collateralBalance[user];
            if (loss >= collateral) {
                uint256 badDebt = loss - collateral;
                protocolBadDebt += badDebt;
                collateralBalance[user] = 0;
            } else {
                collateralBalance[user] = collateral - loss;
            }
        }

        int256 size = pos.size;
        uint256 entryPrice = pos.entryPrice;

        pos.isOpen = false;
        pos.isLong = false;
        pos.size = 0;
        pos.entryPrice = 0;
        pos.margin = 0;

        emit PositionClosed(user, perp, size, entryPrice, markPrice, pnl, margin);
    }

    function getPosition(address user, address perp)
        external
        view
        returns (
            bool isLong,
            bool isOpen,
            int256 size,
            uint256 entryPrice,
            uint256 margin
        )
    {
        Position memory pos = positions[user][perp];
        return (pos.isLong, pos.isOpen, pos.size, pos.entryPrice, pos.margin);
    }

    function getPositionState(address user, address perp)
        external
        view
        returns (
            int256 pnl,
            uint256 notionalUsd,
            uint256 equityUsd,
            bool canBeLiquidated
        )
    {
        Position memory pos = positions[user][perp];
        if (!pos.isOpen) {
            return (0, 0, 0, false);
        }

        uint256 markPrice = perpOracle.getMarkPrice(perp);
        pnl = _calculatePnl(pos, markPrice);
        notionalUsd = _notionalUsd(pos, markPrice);

        uint256 margin = pos.margin;
        int256 equitySigned = int256(margin);
        equitySigned += pnl;

        uint256 equityUsd = equitySigned > 0 ? uint256(equitySigned) : 0;
        bool canBeLiquidated = false;

        MarketConfig memory cfg = marketConfigs[perp];
        if (cfg.maintenanceMarginBps > 0 && notionalUsd > 0) {
            uint256 requiredMaintenance = (notionalUsd * cfg.maintenanceMarginBps) / BPS_DENOMINATOR;
            if (equityUsd < requiredMaintenance) {
                canBeLiquidated = true;
            }
        }

        return (pnl, notionalUsd, equityUsd, canBeLiquidated);
    }

    function _calculatePnl(Position memory pos, uint256 markPrice) internal pure returns (int256) {
        if (!pos.isOpen || pos.size == 0) {
            return 0;
        }

        int256 priceDiff = int256(markPrice) - int256(pos.entryPrice);
        int256 pnl = (priceDiff * pos.size) / int256(ONE);
        return pnl;
    }

    function _notionalUsd(Position memory pos, uint256 markPrice) internal pure returns (uint256) {
        if (!pos.isOpen || pos.size == 0) {
            return 0;
        }
        uint256 absSize = pos.size >= 0 ? uint256(pos.size) : uint256(-pos.size);
        return (absSize * markPrice) / ONE;
    }
}
