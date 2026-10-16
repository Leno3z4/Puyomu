// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Small testnet-only milestone contract used to prove EVM deployment
///         and a state-changing transaction work on Portaldot V3.
/// @dev Not a product vault and must never hold user funds.
contract DeploymentProbe {
    error Unauthorized();

    address public immutable deployer;
    uint256 public immutable deployedChainId;
    uint256 public immutable deployedAtBlock;
    uint256 public marker;

    event MarkerUpdated(address indexed caller, uint256 previousMarker, uint256 newMarker);

    constructor() {
        deployer = msg.sender;
        deployedChainId = block.chainid;
        deployedAtBlock = block.number;
    }

    function ping() external pure returns (bytes32) {
        return keccak256("PUYOMU_PORTALDOT_V3_OK");
    }

    /// @notice Writes a marker so the deployment script can verify an actual
    ///         state change on the configured chain.
    function setMarker(uint256 nextMarker) external {
        if (msg.sender != deployer) revert Unauthorized();

        uint256 previousMarker = marker;
        marker = nextMarker;
        emit MarkerUpdated(msg.sender, previousMarker, nextMarker);
    }
}
