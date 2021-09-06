import { ethers } from "ethers";

export default () => {
  let privateKey = localStorage.getItem('eltoo-private-key');
  if (!privateKey) {
    const wallet = ethers.Wallet.createRandom();
    privateKey = wallet.privateKey;
    localStorage.setItem('eltoo-private-key', privateKey);
  }

  const wallet = new ethers.Wallet(privateKey);

  return {
    wallet,
    privateKey,
  };  
}