import { ethers } from "ethers";

export default (value: bigint, decimals = 6) =>
  parseFloat(ethers.utils.formatUnits(value, decimals)).toFixed(2);