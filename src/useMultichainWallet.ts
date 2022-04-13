import { ethers } from "ethers";
import { useMemo } from "preact/hooks";
import { NetworkConfig } from "./types";
import useNetwork, { NetworkParams } from "./useNetwork";
import formatUsdc from "./utils/formatUsdc";

type UseMultichainWallet = {
  account: string;
  networks: NetworkConfig[];
};

export type ExtendedNetworkConfig = NetworkConfig & {
  wallet: NetworkParams;
};

type MultichainParams = {
  balance: bigint;
  balanceStr: string;
  networksWithWallet: ExtendedNetworkConfig[];
};

export default ({ account, networks }: UseMultichainWallet): MultichainParams => {
  const networksWithWallet = networks.map(network => ({
    ...network,
    wallet: useNetwork({ account, network })
  }));

  const balance = networksWithWallet.reduce(
    (balance, network) => balance + BigInt(network.wallet.balance),
    BigInt(0)
  );

  const balanceStr = useMemo(
    () => {
      if (!balance) return '0';
      return formatUsdc(balance, networksWithWallet[0].wallet.tokenDecimals);
    },
    [balance, networksWithWallet]
  );

  return {
    balance,
    balanceStr,
    networksWithWallet,
  }
};