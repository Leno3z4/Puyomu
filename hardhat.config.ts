import "dotenv/config";
import "@nomicfoundation/hardhat-toolbox";
import type { HardhatUserConfig } from "hardhat/config";

const privateKey = process.env.PRIVATE_KEY;
const rpcUrl =
  process.env.PORTALDOT_V3_RPC ??
  "https://testnetv3-eth-rpc.feso-apps.xyz";

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.24",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  },
  networks: {
    portaldotV3: {
      url: rpcUrl,
      chainId: 420420777,
      accounts: privateKey ? [privateKey] : [],
    },
  },
};

export default config;
