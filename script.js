'use-strict';

const util = require('util');
const request = require('request-promise-native');
const promptly = require('promptly');
const bitcoin = require('bitcoinjs-lib');
const keyPairs = require('./keys.json');
const qrcode = require('qrcode-terminal');

const insight = {
  rate: 'https://bitpay.com/rates',
  addr: 'https://insight.bitpay.com/api/addr/',
  utxo: 'https://insight.bitpay.com/api/addr/address/utxo',
  fees: 'https://insight.bitpay.com/api/utils/estimatefee?nbBlocks=1',
  send: 'https://insight.bitpay.com/api/tx/send'
};

let usdRate;
async function getUSDRate() {
  let rates = await request(insight.rate);
  rates = JSON.parse(rates).data;

  for (let o of rates) {
    if (o.code !== 'USD') continue;
    return parseFloat(o.rate);
  }
}

let feeEst;
async function getFeeEst() { // Returns estimated fee satoshis
  let fees = await request(insight.fees);
  fees = JSON.parse(fees);
  return Math.round(fees['1'] * 1e8 / 1024) + 5;
}

async function getBalance(address, keyPair) {
  let addrDetails = await request.get(insight.addr + address);
  addrDetails = JSON.parse(addrDetails);

  let confirmed = parseInt(addrDetails.balanceSat) / 1e8;
  let unconfirmed = parseInt(addrDetails.unconfirmedBalanceSat) / 1e8;

  console.log('This wallet currently has the following balance: \n');
  console.log('Confirmed: ' + confirmed + ' (approx. ' + (confirmed * usdRate) + ' USD)');
  console.log('Unconfirmed: ' + unconfirmed + ' (approx. ' + (unconfirmed * usdRate) + ' USD)');

  return { confirmed, unconfirmed };
}

async function getUTXOS(address) {
  let url = insight.utxo.replace('address', address);
  let utxos = await request(url);
  utxos = JSON.parse(utxos);

  let total = 0;
  let count = 0;

  for (let utxo of utxos) {
    count++;
    total += utxo.satoshis;
  }

  let usdAmount = (total / 1e8) * usdRate;

  console.log(`Wallet currently has ${count} UTXOS totaling ${ total / 1e8 } BTC (${usdAmount} USD) \n`);

  return { utxos, available: total };
}

async function setFee() {
  let amount = await promptly.prompt('Enter Satoshi amount: ');
  feeEst = parseInt(amount);

  let feeUsd = (Math.round((feeEst / 1e8) * (usdRate) * 100) / 100);

  console.log('\nFee amount set to ' + feeEst + ' satoshis per input/output (' + feeUsd + ' USD).');
};

async function generateQR(address) {
  return qrcode.generate('bitcoin:' + address);
}

async function sendBTC(address, keyPair) {
  console.log('Gathering UTXOS.... \n');
  let { utxos, available } = await getUTXOS(address);

  let tx = new bitcoin.TransactionBuilder();

  let amount = await promptly.prompt('Enter the USD amount you\'d like to send: ');
  amount = Math.round((parseFloat(amount) / usdRate) * 1e8); // Changed to Satoshis

  console.log('\n Preparing to send ' + amount + ' Satoshis.\n');

  let toAddress = await promptly.prompt('Enter the address you\'d like to send to: ');

  console.log('\nBuilding transaction... ');

  let feeAmount = 0;

  try {
    for (let utxo of utxos) {
      feeAmount += feeEst;
      tx.addInput(utxo.txid, utxo.vout);
    }

    let leftovers = available - (amount + feeAmount);
    if (leftovers < 0) {
      throw new Error('Could not build this transaction. Amount declared greater than available resource.');
    }

    tx.addOutput(toAddress, amount);

    if (leftovers) {
      tx.addOuput(address, leftovers);
    }

    tx.sign(0, keyPair);
  } catch (err) {
    console.log('\n\nError building transaction: ');
    console.error(err.message + '\n\n');
    return;
  }

  console.log('\nSuccessfully built transaction.');

  console.log('\nTransaction info\n');

  let txInfo = { amount, feeAmount, leftovers };
  console.log(txInfo);

  console.log('\nTransaction hex: \n');
  console.log(tx.build().toHex());

  let broadcast = await promptly.confirm('Would you like to broadcast this transaction (y/n)?: ');

  if (!broadcast) {
    return console.log('Okay! You can broadcast manually at https://insight.bitpay.com/tx/send');
  }

  console.log('Sorry, haven\'t gotten that far yet.');
}

function quit() {
  console.log('\nGoodbye! :-)\n');
  process.exit(0);
}
process.on('SIGTERM', quit);

(async () => {
  usdRate = await getUSDRate();
  console.log('Current USD Rate: ' + usdRate);

  feeEst = (await getFeeEst()) + 5; // Add 5 satoshis for priority
  let feeUsd = (Math.round((feeEst / 1e8) * (usdRate) * 100) / 100);
  console.log('Current estimated transaction fee: ' + feeEst + ' satoshis (approx. ' + feeUsd + ' USD) per input/output');

  console.log('\n');

  console.log('Available wallets: \n');
  for (let i in keyPairs) {
    let key = keyPairs[i];
    console.log(`[${i}] -- ${key.name}`);
  }

  console.log('\n');

  const selected = await promptly.prompt('Which wallet would you like to interact with today?');
  const key = keyPairs[parseInt(selected)];

  console.log('\n');

  if (!key || !key.privKey) {
    throw new Error('Invalid key pair selected.');
  }

  const keyPair = bitcoin.ECPair.fromWIF(key.privKey);
  const { address } = bitcoin.payments.p2pkh({ pubkey: keyPair.publicKey });

  console.log(`Interacting with wallet ${key.name} -- address ${address}`);

  let actions = {
    qr      : 'Generate QR code for address',
    balance : 'Get wallet balance',
    send    : 'Send Bitcoin',
    set     : 'Override Fee Satoshis',
    quit    : 'Stop interacting with this wallet'
  };

  while (1 === 1) {
    console.log('Available actions: \n');
    for (let a in actions) {
      let desc = actions[a];
      console.log(`${a} -> ${desc}`);
    }

    console.log('\n');

    let action = await promptly.prompt('What action would you like to take?');
    switch (action) {
      case 'balance':
        console.log('Getting wallet balance....\n');
        await getBalance(address, keyPair);
        break;
      case 'set':
        console.log('Preparing to set fee amount....\n');
        await setFee();
        break;
      case 'send':
        console.log('Preparing to send bitcoin...\n')
        await sendBTC(address, keyPair);
        break;
      case 'qr':
        console.log('Generating QR code...\n');
        await generateQR(address);
        break;
      case 'quit':
        quit();
        break;
    }
  }
})();
