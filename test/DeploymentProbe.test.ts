import { expect } from "chai";
import { ethers } from "hardhat";

describe("DeploymentProbe", function () {
  it("records its chain, deployer and deployment block", async function () {
    const [deployer] = await ethers.getSigners();
    const probe = await (await ethers.getContractFactory("DeploymentProbe")).deploy();
    await probe.waitForDeployment();

    const network = await ethers.provider.getNetwork();
    expect(await probe.deployer()).to.equal(await deployer.getAddress());
    expect(await probe.deployedChainId()).to.equal(network.chainId);
    expect(await probe.deployedAtBlock()).to.be.greaterThan(0n);
  });

  it("returns the expected ping value", async function () {
    const probe = await (await ethers.getContractFactory("DeploymentProbe")).deploy();
    await probe.waitForDeployment();

    expect(await probe.ping()).to.equal(
      ethers.keccak256(ethers.toUtf8Bytes("PUYOMU_PORTALDOT_V3_OK"))
    );
  });

  it("allows the deployer to write a marker and blocks other accounts", async function () {
    const [deployer, other] = await ethers.getSigners();
    const probe = await (await ethers.getContractFactory("DeploymentProbe")).deploy();
    await probe.waitForDeployment();

    await expect(probe.setMarker(9n))
      .to.emit(probe, "MarkerUpdated")
      .withArgs(await deployer.getAddress(), 0n, 9n);
    expect(await probe.marker()).to.equal(9n);

    await expect(probe.connect(other).setMarker(10n))
      .to.be.revertedWithCustomError(probe, "Unauthorized");
  });
});
