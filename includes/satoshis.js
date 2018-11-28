let SatoshiConverter = function(amount, exchangeRate) {
  amount = amount || 0;
  exchangeRate = exchangeRate || 0;

  this.satoshis = amount;
  this.btc = amount / 1e8;
  this.microbits = amount / 1e6;
  this.usd = Math.round(((amount / 1e8) * exchangeRate) * 100) / 100;
};

module.exports = function(amount, exchangeRate) {
  return new SatoshiConverter(amount, exchangeRate);
};
