# `btctx` - Super Simple Transaction Builder

For pulling funds from your cold storage wallet simply.

This program uses Insight's API to gather UTXOS and other address information, as well as broadcast transactions without the need for a full node.

Leverages `bitcoinjs-lib`.

**Install via Git:**

```
git clone git@github.com:brucewsinc/btctx.git
cd btctx
npm i
```

Run via `npm start`, or `node script.js`. You will need to create a `keys.json` file using the `keys.example.json` format as a guide.
