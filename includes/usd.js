let UsdConverter = function(amount, exchangeRate) {
  amount = amount || 0;
  exchangeRate = exchangeRate || 0;

  this.usd = amount;
  this.btc = amount / exchangeRate;
  this.satoshis = (amount / exchangeRate) * 1e8;
  this.microbits = (amount / exchangeRate) * 1e6;
};

module.exports = function(amount, exchangeRate) {
  return new UsdConverter(amount, exchangeRate);
};
