'use-strict';

const util = require('util');
const request = require('request-promise-native');
const promptly = require('promptly');
const bitcoin = require('bitcoinjs-lib');
const keyPairs = require('./keys.json');
const qrcode = require('qrcode-terminal');

// Ease-of-use
const urls = require('./includes/urls.js');

// Currency Converters
const usd = require('./includes/usd.js');
const btc = require('./includes/btc.js');
const satoshis = require('./includes/satoshis.js');

/**
 * Retrieves the USD Exchange Rate From Insight.
 */
let usdRate;
async function getUSDRate() {
  let rates = await request(urls.rate);
  rates = JSON.parse(rates).data;

  for (let o of rates) {
    if (o.code !== 'USD') continue;
    return parseFloat(o.rate);
  }
}

/**
 * Gets fee estimate per input/output
 *
 * @returns SatoshiConverter
 */
let feeEst;
async function getFeeEst() {
  let fees = await request(urls.fees);
  fees = JSON.parse(fees);
  return satoshis((Math.round(fees['1'] * 1e8 / 1024) + 5), usdRate);
}

/**
 * Gets wallet balance
 *
 * @returns Object
 */
async function getBalance(address, keyPair) {
  let addrDetails = await request.get(urls.addr + address);
  addrDetails = JSON.parse(addrDetails);

  let confirmed = satoshis(parseInt(addrDetails.balanceSat), usdRate);
  let unconfirmed = satoshis(parseInt(addrDetails.unconfirmedBalanceSat), usdRate);

  console.log('This wallet currently has the following balance: \n');
  console.log('Confirmed: ' + confirmed.btc + ' (' + confirmed.usd + ' USD)');
  console.log('Unconfirmed: ' + confirmed.btc + ' (' + unconfirmed.usd + ' USD)');

  return { confirmed: confirmed.satoshis, unconfirmed: unconfirmed.satoshis };
}

/**
 * Retrieves available UTXOs for given address
 *
 * @param String address The wallet address to check UTXOs for
 *
 * @return Object
 */
async function getUTXOS(address) {
  let url = urls.utxo.replace('address', address);
  let utxos = await request(url);
  utxos = JSON.parse(utxos);

  let total = 0;
  let count = 0;

  for (let utxo of utxos) {
    count++;
    total += utxo.satoshis;
  }

  let total = satoshis(total, usdRate);
  console.log(`Wallet currently has ${count} UTXOS totaling ${ total.btc } BTC (${total.usd} USD) \n`);

  return { utxos, available: total.satoshis };
}

/**
 * Sets up fees for transactions
 */
async function setFee() {
  let amount = await promptly.prompt('Enter Satoshi amount: ');

  feeEst = satoshis(parseInt(amount), usdRate);
  console.log('\nFee amount set to ' + feeEst.satoshis + ' satoshis per input/output (' + feeEst.usd + ' USD).');
};

async function generateQR(address) {
  return qrcode.generate('bitcoin:' + address);
}

async function sendBTC(address, keyPair) {
  console.log('Gathering UTXOS.... \n');
  let { utxos, available } = await getUTXOS(address);

  let tx = new bitcoin.TransactionBuilder();

  let amount = await promptly.prompt('Enter the USD amount you\'d like to send: ');
  amount = usd(amount, usdRate);

  console.log('\n Preparing to send ' + amount.satoshis + ' Satoshis.\n');

  let toAddress = await promptly.prompt('Enter the address you\'d like to send to: ');

  console.log('\nBuilding transaction... ');

  let feeAmount = 0;
  let satoshis = amount.satoshis;

  try {
    for (let utxo of utxos) {
      feeAmount += feeEst.satoshis;
      tx.addInput(utxo.txid, utxo.vout);
    }

    let leftovers = available - (satoshis + feeAmount);
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

  let txInfo = { satoshis, feeAmount, leftovers };
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

  feeEst = (await getFeeEst());
  console.log('Current estimated transaction fee: ' + feeEst.satoshis + ' satoshis (' + feeEst.usd + ' USD) per input/output');

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
