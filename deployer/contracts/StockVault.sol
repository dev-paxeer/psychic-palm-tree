// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

interface IStockPriceOracle {
    function getPrice(address token) external view returns (uint256);
    function PRICE_DECIMALS() external view returns (uint8);
}

interface ITokenizedStock is IERC20 {
    function mint(address to, uint256 amount) external;
    function burn(address from, uint256 amount) external;
}

contract StockVault is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    IStockPriceOracle public immutable priceOracle;

    address public immutable CUSD;
    address public immutable USDC;
    address public immutable USDT;

    struct StableInfo {
        bool isStable;
        uint8 decimals;
    }

    struct StockInfo {
        bool isStock;
        uint8 decimals;
    }

    mapping(address => StableInfo) public stables;
    mapping(address => StockInfo) public stocks;

    event StockRegistered(address indexed stock, uint8 decimals);
    event BuyStock(address indexed user, address indexed stableToken, address indexed stockToken, uint256 stableAmountIn, uint256 stockAmountOut);
    event SellStock(address indexed user, address indexed stableToken, address indexed stockToken, uint256 stockAmountIn, uint256 stableAmountOut);

    constructor(address _priceOracle, address _cusd, address _usdc, address _usdt) Ownable(msg.sender) {
        require(_priceOracle != address(0), "Invalid oracle address");
        require(_cusd != address(0), "Invalid CUSD address");
        require(_usdc != address(0), "Invalid USDC address");
        require(_usdt != address(0), "Invalid USDT address");

        priceOracle = IStockPriceOracle(_priceOracle);
        CUSD = _cusd;
        USDC = _usdc;
        USDT = _usdt;

        _registerStable(_cusd);
        _registerStable(_usdc);
        _registerStable(_usdt);
    }

    function _registerStable(address token) internal {
        uint8 decimals = IERC20Metadata(token).decimals();
        stables[token] = StableInfo({isStable: true, decimals: decimals});
    }

    function registerStock(address stockToken) external onlyOwner {
        require(stockToken != address(0), "Invalid stock address");
        require(!stocks[stockToken].isStock, "Stock already registered");

        uint8 decimals = IERC20Metadata(stockToken).decimals();
        stocks[stockToken] = StockInfo({isStock: true, decimals: decimals});

        emit StockRegistered(stockToken, decimals);
    }

    function quoteBuy(address stableToken, address stockToken, uint256 stableAmount) external view returns (uint256) {
        require(stables[stableToken].isStable, "Unsupported stable");
        require(stocks[stockToken].isStock, "Unsupported stock");
        require(stableAmount > 0, "Amount must be > 0");

        uint256 price = priceOracle.getPrice(stockToken);
        return _quoteBuy(stableToken, stockToken, stableAmount, price);
    }

    function quoteSell(address stockToken, address stableToken, uint256 stockAmount) external view returns (uint256) {
        require(stables[stableToken].isStable, "Unsupported stable");
        require(stocks[stockToken].isStock, "Unsupported stock");
        require(stockAmount > 0, "Amount must be > 0");

        uint256 price = priceOracle.getPrice(stockToken);
        return _quoteSell(stockToken, stableToken, stockAmount, price);
    }

    function buyStock(address stableToken, address stockToken, uint256 stableAmount, uint256 minStockOut) external nonReentrant {
        require(stables[stableToken].isStable, "Unsupported stable");
        require(stocks[stockToken].isStock, "Unsupported stock");
        require(stableAmount > 0, "Amount must be > 0");

        uint256 price = priceOracle.getPrice(stockToken);
        uint256 stockAmountOut = _quoteBuy(stableToken, stockToken, stableAmount, price);
        require(stockAmountOut >= minStockOut, "Slippage");

        IERC20(stableToken).safeTransferFrom(msg.sender, address(this), stableAmount);
        ITokenizedStock(stockToken).mint(msg.sender, stockAmountOut);

        emit BuyStock(msg.sender, stableToken, stockToken, stableAmount, stockAmountOut);
    }

    function sellStock(address stockToken, address stableToken, uint256 stockAmount, uint256 minStableOut) external nonReentrant {
        require(stables[stableToken].isStable, "Unsupported stable");
        require(stocks[stockToken].isStock, "Unsupported stock");
        require(stockAmount > 0, "Amount must be > 0");

        uint256 price = priceOracle.getPrice(stockToken);
        uint256 stableAmountOut = _quoteSell(stockToken, stableToken, stockAmount, price);
        require(stableAmountOut >= minStableOut, "Slippage");

        require(IERC20(stableToken).balanceOf(address(this)) >= stableAmountOut, "Insufficient liquidity");

        IERC20(stockToken).safeTransferFrom(msg.sender, address(this), stockAmount);
        ITokenizedStock(stockToken).burn(address(this), stockAmount);

        IERC20(stableToken).safeTransfer(msg.sender, stableAmountOut);

        emit SellStock(msg.sender, stableToken, stockToken, stockAmount, stableAmountOut);
    }

    function _quoteBuy(address stableToken, address stockToken, uint256 stableAmount, uint256 price) internal view returns (uint256) {
        StableInfo memory sInfo = stables[stableToken];
        StockInfo memory tInfo = stocks[stockToken];
        uint8 priceDecimals = priceOracle.PRICE_DECIMALS();

        uint256 numerator = stableAmount * (10 ** priceDecimals) * (10 ** tInfo.decimals);
        uint256 denominator = price * (10 ** sInfo.decimals);

        return numerator / denominator;
    }

    function _quoteSell(address stockToken, address stableToken, uint256 stockAmount, uint256 price) internal view returns (uint256) {
        StableInfo memory sInfo = stables[stableToken];
        StockInfo memory tInfo = stocks[stockToken];
        uint8 priceDecimals = priceOracle.PRICE_DECIMALS();

        uint256 numerator = stockAmount * price * (10 ** sInfo.decimals);
        uint256 denominator = (10 ** tInfo.decimals) * (10 ** priceDecimals);

        return numerator / denominator;
    }

    function getStableInfo(address token) external view returns (bool isStable, uint8 decimals) {
        StableInfo memory info = stables[token];
        return (info.isStable, info.decimals);
    }

    function getStockInfo(address token) external view returns (bool isStock, uint8 decimals) {
        StockInfo memory info = stocks[token];
        return (info.isStock, info.decimals);
    }

    function emergencyWithdraw(address token, uint256 amount) external onlyOwner {
        IERC20(token).safeTransfer(owner(), amount);
    }
}
