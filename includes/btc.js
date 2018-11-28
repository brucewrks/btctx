let BtcConverter = function(amount, exchangeRate) {
  amount = amount || 0;
  exchangeRate = exchangeRate || 0;

  this.btc = amount;
  this.satoshis = amount * 1e8;
  this.microbits = amount * 1e6;
  this.usd = Math.round((amount * exchangeRate) * 100) / 100;
};

module.exports = function(amount, exchangeRate) {
  return new BtcConverter(amount, exchangeRate);
};
