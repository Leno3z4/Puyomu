// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title MarketRegistry
/// @notice Stores configuration for markets that will later be enforced by the
///         Puyomu Perpetual Engine. This contract does not execute trades or
///         custody collateral by itself.
/// @dev A disabled market record is deliberately retained. The execution
///      engine must block new/increased exposure while still allowing users to
///      reduce, close and liquidate existing positions.
contract MarketRegistry {
    uint256 private constant BPS = 10_000;
    uint256 private constant MAX_LEVERAGE_BPS = 1_000_000; // 100x hard ceiling
    uint256 private constant BPS_SQUARED = 100_000_000;

    error Unauthorized(address caller);
    error ZeroAddress();
    error InvalidMarketConfiguration();
    error InvalidRiskParameters();
    error MarketAlreadyExists(bytes32 marketId);
    error UnknownMarket(bytes32 marketId);

    struct MarketConfig {
        bytes32 symbol;
        address baseToken; // address(0) may represent a native underlying
        address collateralToken; // address(0) may represent native collateral
        address oracle; // must be a non-zero oracle adapter
        uint32 maxLeverageBps; // 10_000 = 1x, 50_000 = 5x
        uint16 maintenanceMarginBps; // 800 = 8%
        uint128 maxOpenInterestUsdE8; // USD value scaled by 1e8
        bool enabled;
        uint64 createdAt;
        uint64 updatedAt;
    }

    address public owner;
    mapping(address => bool) public marketManagers;
    mapping(bytes32 => bool) public marketExists;
    mapping(bytes32 => MarketConfig) private _markets;
    bytes32[] private _marketIds;

    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);
    event MarketManagerUpdated(address indexed manager, bool allowed);
    event MarketAdded(bytes32 indexed marketId, bytes32 symbol, address baseToken, address collateralToken, address oracle);
    event MarketEnabledUpdated(bytes32 indexed marketId, bool enabled);
    event MarketRiskUpdated(bytes32 indexed marketId, uint32 maxLeverageBps, uint16 maintenanceMarginBps, uint128 maxOpenInterestUsdE8);
    event MarketOracleUpdated(bytes32 indexed marketId, address indexed previousOracle, address indexed newOracle);

    modifier onlyOwner() {
        if (msg.sender != owner) revert Unauthorized(msg.sender);
        _;
    }

    modifier onlyManagerOrOwner() {
        if (msg.sender != owner && !marketManagers[msg.sender]) revert Unauthorized(msg.sender);
        _;
    }

    constructor() {
        owner = msg.sender;
        emit OwnershipTransferred(address(0), msg.sender);
    }

    function transferOwnership(address newOwner) external onlyOwner {
        if (newOwner == address(0)) revert ZeroAddress();

        address previousOwner = owner;
        owner = newOwner;
        emit OwnershipTransferred(previousOwner, newOwner);
    }

    function setMarketManager(address manager, bool allowed) external onlyOwner {
        if (manager == address(0)) revert ZeroAddress();

        marketManagers[manager] = allowed;
        emit MarketManagerUpdated(manager, allowed);
    }

    function addMarket(
        bytes32 marketId,
        bytes32 symbol,
        address baseToken,
        address collateralToken,
        address oracle,
        uint32 maxLeverageBps,
        uint16 maintenanceMarginBps,
        uint128 maxOpenInterestUsdE8
    ) external onlyManagerOrOwner {
        if (marketId == bytes32(0) || symbol == bytes32(0) || oracle == address(0)) {
            revert InvalidMarketConfiguration();
        }
        if (marketExists[marketId]) revert MarketAlreadyExists(marketId);

        _validateRisk(maxLeverageBps, maintenanceMarginBps, maxOpenInterestUsdE8);

        uint64 timestamp = uint64(block.timestamp);
        _markets[marketId] = MarketConfig({
            symbol: symbol,
            baseToken: baseToken,
            collateralToken: collateralToken,
            oracle: oracle,
            maxLeverageBps: maxLeverageBps,
            maintenanceMarginBps: maintenanceMarginBps,
            maxOpenInterestUsdE8: maxOpenInterestUsdE8,
            enabled: true,
            createdAt: timestamp,
            updatedAt: timestamp
        });

        marketExists[marketId] = true;
        _marketIds.push(marketId);

        emit MarketAdded(marketId, symbol, baseToken, collateralToken, oracle);
    }

    /// @notice Soft-remove/relist a market without deleting its configuration.
    /// @dev The Perpetual Engine must apply this flag only to opening or
    ///      increasing exposure; it must not block risk-reducing operations.
    function setMarketEnabled(bytes32 marketId, bool enabled) external onlyManagerOrOwner {
        if (!marketExists[marketId]) revert UnknownMarket(marketId);

        _markets[marketId].enabled = enabled;
        _markets[marketId].updatedAt = uint64(block.timestamp);
        emit MarketEnabledUpdated(marketId, enabled);
    }

    function updateRiskParameters(
        bytes32 marketId,
        uint32 maxLeverageBps,
        uint16 maintenanceMarginBps,
        uint128 maxOpenInterestUsdE8
    ) external onlyManagerOrOwner {
        if (!marketExists[marketId]) revert UnknownMarket(marketId);
        _validateRisk(maxLeverageBps, maintenanceMarginBps, maxOpenInterestUsdE8);

        MarketConfig storage market = _markets[marketId];
        market.maxLeverageBps = maxLeverageBps;
        market.maintenanceMarginBps = maintenanceMarginBps;
        market.maxOpenInterestUsdE8 = maxOpenInterestUsdE8;
        market.updatedAt = uint64(block.timestamp);

        emit MarketRiskUpdated(marketId, maxLeverageBps, maintenanceMarginBps, maxOpenInterestUsdE8);
    }

    function updateOracle(bytes32 marketId, address newOracle) external onlyManagerOrOwner {
        if (!marketExists[marketId]) revert UnknownMarket(marketId);
        if (newOracle == address(0)) revert InvalidMarketConfiguration();

        MarketConfig storage market = _markets[marketId];
        address previousOracle = market.oracle;
        market.oracle = newOracle;
        market.updatedAt = uint64(block.timestamp);

        emit MarketOracleUpdated(marketId, previousOracle, newOracle);
    }

    function getMarket(bytes32 marketId) external view returns (MarketConfig memory) {
        if (!marketExists[marketId]) revert UnknownMarket(marketId);
        return _markets[marketId];
    }

    function getMarketIds() external view returns (bytes32[] memory) {
        return _marketIds;
    }

    function getMarketCount() external view returns (uint256) {
        return _marketIds.length;
    }

    function isMarketEnabled(bytes32 marketId) external view returns (bool) {
        return marketExists[marketId] && _markets[marketId].enabled;
    }

    function _validateRisk(
        uint32 maxLeverageBps,
        uint16 maintenanceMarginBps,
        uint128 maxOpenInterestUsdE8
    ) private pure {
        if (
            maxLeverageBps < BPS ||
            maxLeverageBps > MAX_LEVERAGE_BPS ||
            maintenanceMarginBps == 0 ||
            maintenanceMarginBps >= BPS ||
            maxOpenInterestUsdE8 == 0
        ) {
            revert InvalidRiskParameters();
        }

        // The initial margin implied by maximum leverage must be strictly
        // greater than maintenance margin, otherwise a new position could
        // begin at or beyond the liquidation threshold.
        uint256 impliedInitialMarginBps = BPS_SQUARED / uint256(maxLeverageBps);
        if (maintenanceMarginBps >= impliedInitialMarginBps) {
            revert InvalidRiskParameters();
        }
    }
}
