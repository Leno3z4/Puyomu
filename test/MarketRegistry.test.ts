import { expect } from "chai";
import { ethers } from "hardhat";

const marketId = ethers.keccak256(ethers.toUtf8Bytes("POT-PERP"));
const symbol = ethers.encodeBytes32String("POT-PERP");
const maxOpenInterestUsdE8 = 50_000n * 100_000_000n;

describe("MarketRegistry", function () {
  async function deployFixture() {
    const [owner, manager, other, baseToken, collateralToken, oracle, replacementOracle] =
      await ethers.getSigners();
    const registry = await (await ethers.getContractFactory("MarketRegistry")).deploy();
    await registry.waitForDeployment();

    return {
      registry,
      owner,
      manager,
      other,
      baseToken,
      collateralToken,
      oracle,
      replacementOracle,
    };
  }

  async function addPotMarket(
    registry: Awaited<ReturnType<typeof deployFixture>>["registry"],
    baseToken: { getAddress(): Promise<string> },
    collateralToken: { getAddress(): Promise<string> },
    oracle: { getAddress(): Promise<string> }
  ) {
    return registry.addMarket(
      marketId,
      symbol,
      await baseToken.getAddress(),
      await collateralToken.getAddress(),
      await oracle.getAddress(),
      50_000, // 5x
      800, // 8% maintenance margin
      maxOpenInterestUsdE8
    );
  }

  it("sets the deployer as owner", async function () {
    const { registry, owner } = await deployFixture();
    expect(await registry.owner()).to.equal(await owner.getAddress());
    expect(await registry.getMarketCount()).to.equal(0n);
  });

  it("adds a configured market and keeps its registration readable", async function () {
    const { registry, baseToken, collateralToken, oracle } = await deployFixture();
    await expect(addPotMarket(registry, baseToken, collateralToken, oracle))
      .to.emit(registry, "MarketAdded")
      .withArgs(
        marketId,
        symbol,
        await baseToken.getAddress(),
        await collateralToken.getAddress(),
        await oracle.getAddress()
      );

    const market = await registry.getMarket(marketId);
    expect(market.symbol).to.equal(symbol);
    expect(market.oracle).to.equal(await oracle.getAddress());
    expect(market.maxLeverageBps).to.equal(50_000n);
    expect(market.maintenanceMarginBps).to.equal(800n);
    expect(market.maxOpenInterestUsdE8).to.equal(maxOpenInterestUsdE8);
    expect(market.enabled).to.equal(true);
    expect(await registry.isMarketEnabled(marketId)).to.equal(true);
    expect(await registry.getMarketCount()).to.equal(1n);
  });

  it("prevents duplicate market IDs", async function () {
    const { registry, baseToken, collateralToken, oracle } = await deployFixture();
    await addPotMarket(registry, baseToken, collateralToken, oracle);
    await expect(addPotMarket(registry, baseToken, collateralToken, oracle))
      .to.be.revertedWithCustomError(registry, "MarketAlreadyExists")
      .withArgs(marketId);
  });

  it("restricts configuration to the owner or approved market managers", async function () {
    const { registry, manager, other, baseToken, collateralToken, oracle } = await deployFixture();

    await expect(addPotMarket(registry, baseToken, collateralToken, oracle))
      .to.emit(registry, "MarketAdded");

    await expect(registry.connect(other).setMarketEnabled(marketId, false))
      .to.be.revertedWithCustomError(registry, "Unauthorized");

    await registry.setMarketManager(await manager.getAddress(), true);
    await expect(registry.connect(manager).setMarketEnabled(marketId, false))
      .to.emit(registry, "MarketEnabledUpdated")
      .withArgs(marketId, false);

    await registry.setMarketManager(await manager.getAddress(), false);
    await expect(registry.connect(manager).setMarketEnabled(marketId, true))
      .to.be.revertedWithCustomError(registry, "Unauthorized");
  });

  it("soft-disables a market without deleting its configuration", async function () {
    const { registry, baseToken, collateralToken, oracle } = await deployFixture();
    await addPotMarket(registry, baseToken, collateralToken, oracle);

    await registry.setMarketEnabled(marketId, false);
    expect(await registry.isMarketEnabled(marketId)).to.equal(false);
    expect(await registry.marketExists(marketId)).to.equal(true);
    expect(await registry.getMarketCount()).to.equal(1n);
    expect((await registry.getMarket(marketId)).symbol).to.equal(symbol);

    await registry.setMarketEnabled(marketId, true);
    expect(await registry.isMarketEnabled(marketId)).to.equal(true);
  });

  it("rejects leverage and maintenance-margin combinations that begin at liquidation", async function () {
    const { registry, baseToken, collateralToken, oracle } = await deployFixture();
    await expect(
      registry.addMarket(
        marketId,
        symbol,
        await baseToken.getAddress(),
        await collateralToken.getAddress(),
        await oracle.getAddress(),
        50_000, // 5x implies 20% initial margin
        2_000, // 20% maintenance margin is not below initial margin
        maxOpenInterestUsdE8
      )
    ).to.be.revertedWithCustomError(registry, "InvalidRiskParameters");
  });

  it("rejects a zero oracle and zero open-interest cap", async function () {
    const { registry, baseToken, collateralToken, oracle } = await deployFixture();

    await expect(
      registry.addMarket(
        marketId,
        symbol,
        await baseToken.getAddress(),
        await collateralToken.getAddress(),
        ethers.ZeroAddress,
        50_000,
        800,
        maxOpenInterestUsdE8
      )
    ).to.be.revertedWithCustomError(registry, "InvalidMarketConfiguration");

    await expect(
      registry.addMarket(
        marketId,
        symbol,
        await baseToken.getAddress(),
        await collateralToken.getAddress(),
        await oracle.getAddress(),
        50_000,
        800,
        0
      )
    ).to.be.revertedWithCustomError(registry, "InvalidRiskParameters");
  });

  it("updates risk settings and oracle without redeploying", async function () {
    const { registry, baseToken, collateralToken, oracle, replacementOracle } =
      await deployFixture();
    await addPotMarket(registry, baseToken, collateralToken, oracle);

    await expect(
      registry.updateRiskParameters(marketId, 40_000, 700, 75_000n * 100_000_000n)
    )
      .to.emit(registry, "MarketRiskUpdated")
      .withArgs(marketId, 40_000, 700, 75_000n * 100_000_000n);

    await expect(
      registry.updateOracle(marketId, await replacementOracle.getAddress())
    )
      .to.emit(registry, "MarketOracleUpdated")
      .withArgs(marketId, await oracle.getAddress(), await replacementOracle.getAddress());

    const market = await registry.getMarket(marketId);
    expect(market.maxLeverageBps).to.equal(40_000n);
    expect(market.maintenanceMarginBps).to.equal(700n);
    expect(market.maxOpenInterestUsdE8).to.equal(75_000n * 100_000_000n);
    expect(market.oracle).to.equal(await replacementOracle.getAddress());
  });

  it("rejects updates for an unknown market and a zero new oracle", async function () {
    const { registry, replacementOracle } = await deployFixture();
    await expect(registry.setMarketEnabled(marketId, false))
      .to.be.revertedWithCustomError(registry, "UnknownMarket");
    await expect(registry.updateOracle(marketId, await replacementOracle.getAddress()))
      .to.be.revertedWithCustomError(registry, "UnknownMarket");
  });

  it("allows only the owner to transfer ownership", async function () {
    const { registry, manager, other } = await deployFixture();
    await expect(registry.connect(other).transferOwnership(await manager.getAddress()))
      .to.be.revertedWithCustomError(registry, "Unauthorized");

    await expect(registry.transferOwnership(await manager.getAddress()))
      .to.emit(registry, "OwnershipTransferred");

    expect(await registry.owner()).to.equal(await manager.getAddress());
  });
});
