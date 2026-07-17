import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

export default buildModule("GhostSendModule", (m) => {
  const faucetToken = m.contract("GhostFaucetToken");
  const wrapper = m.contract("GhostSendWrapper", [faucetToken]);
  return { faucetToken, wrapper };
});