// Transaction.js
const mongoose = require('mongoose');

const transactionSchema = new mongoose.Schema({
  tx_ref: String,
  transaction_id: Number,
  amount: Number,
  currency: String,
  status: String,
  customer_email: String,
  customer_name: String,
  created_at: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model('Transaction', transactionSchema);
