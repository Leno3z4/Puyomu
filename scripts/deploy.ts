import fs from "node:fs";
import path from "node:path";
import { ethers, network } from "hardhat";

const PORTALDOT_V3_CHAIN_ID = 420420777n;

async function main(): Promise<void> {
  const connectedNetwork = await ethers.provider.getNetwork();
  const chainId = connectedNetwork.chainId;

  if (network.name === "portaldotV3" && chainId !== PORTALDOT_V3_CHAIN_ID) {
    throw new Error(
      `Wrong chain: expected ${PORTALDOT_V3_CHAIN_ID}, RPC returned ${chainId}. Stopping deployment.`
    );
  }

  const [deployer] = await ethers.getSigners();
  if (!deployer) {
    throw new Error("No deployer signer found. Set PRIVATE_KEY in your local .env file.");
  }

  const deployerAddress = await deployer.getAddress();
  console.log(`Network: ${network.name} (chainId ${chainId})`);
  console.log(`Deployer: ${deployerAddress}`);

  const probe = await (await ethers.getContractFactory("DeploymentProbe")).deploy();
  await probe.waitForDeployment();
  const probeAddress = await probe.getAddress();
  const probeDeployTx = probe.deploymentTransaction();
  const probeDeployReceipt = probeDeployTx ? await probeDeployTx.wait() : null;

  const markerTx = await probe.setMarker(1n);
  const markerReceipt = await markerTx.wait();
  const markerValue = await probe.marker();

  if (markerValue !== 1n) {
    throw new Error("Deployment probe write/read check failed.");
  }

  const pingValue = await probe.ping();
  const deployedChainId = await probe.deployedChainId();
  if (deployedChainId !== chainId) {
    throw new Error(
      `Probe reports chain ID ${deployedChainId}, provider reports ${chainId}.`
    );
  }

  const registry = await (await ethers.getContractFactory("MarketRegistry")).deploy();
  await registry.waitForDeployment();
  const registryAddress = await registry.getAddress();
  const registryDeployTx = registry.deploymentTransaction();
  const registryDeployReceipt = registryDeployTx ? await registryDeployTx.wait() : null;

  const deployment = {
    project: "Puyomu",
    network: network.name,
    chainId: chainId.toString(),
    deployer: deployerAddress,
    deployedAt: new Date().toISOString(),
    contracts: {
      DeploymentProbe: {
        address: probeAddress,
        deploymentTransactionHash: probeDeployReceipt?.hash ?? probeDeployTx?.hash ?? null,
        deploymentBlock: probeDeployReceipt?.blockNumber ?? null,
        markerTransactionHash: markerReceipt?.hash ?? markerTx.hash,
        markerValue: markerValue.toString(),
        ping: pingValue,
      },
      MarketRegistry: {
        address: registryAddress,
        deploymentTransactionHash: registryDeployReceipt?.hash ?? registryDeployTx?.hash ?? null,
        deploymentBlock: registryDeployReceipt?.blockNumber ?? null,
        owner: await registry.owner(),
      },
    },
  };

  const outputDirectory = path.join(process.cwd(), "deployments");
  fs.mkdirSync(outputDirectory, { recursive: true });
  const outputFile = path.join(outputDirectory, `${network.name}.json`);
  fs.writeFileSync(outputFile, JSON.stringify(deployment, null, 2) + "\n");

  console.log("Deployment + state-change smoke test passed:");
  console.log(JSON.stringify(deployment, null, 2));
  console.log(`Saved to ${outputFile}`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
