import { ethers, network } from "hardhat";

const EXPECTED_CHAIN_ID = 420420777n;

async function main(): Promise<void> {
  if (network.name !== "portaldotV3") {
    throw new Error(`Run this check against portaldotV3, not ${network.name}.`);
  }

  const connectedNetwork = await ethers.provider.getNetwork();
  if (connectedNetwork.chainId !== EXPECTED_CHAIN_ID) {
    throw new Error(
      `Wrong chain ID: expected ${EXPECTED_CHAIN_ID}, received ${connectedNetwork.chainId}.`
    );
  }

  const blockNumber = await ethers.provider.getBlockNumber();
  const latestBlock = await ethers.provider.getBlock("latest");
  if (!latestBlock) {
    throw new Error("RPC returned no latest block.");
  }

  console.log(
    JSON.stringify(
      {
        status: "ok",
        network: network.name,
        chainId: connectedNetwork.chainId.toString(),
        rpc: process.env.PORTALDOT_V3_RPC ?? "https://testnetv3-eth-rpc.feso-apps.xyz",
        latestBlockNumber: blockNumber,
        latestBlockTimestamp: latestBlock.timestamp,
        walletRequired: false,
      },
      null,
      2
    )
  );
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
