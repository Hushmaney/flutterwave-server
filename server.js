require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const axios = require('axios');
const crypto = require('crypto');

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 10000;
const MONGO_URI = process.env.MONGO_URI;
const FLW_SECRET_KEY = process.env.FLW_SECRET_KEY;
const HASH_SECRET = process.env.HASH_SECRET || 'your-36-character-secret-hash';

// MongoDB Schema
const transactionSchema = new mongoose.Schema({
  name: String,
  email: String,
  amount: Number,
  reference: String,
  status: String,
  date: { type: Date, default: Date.now },
});

const Transaction = mongoose.model('Transaction', transactionSchema);

// Connect to MongoDB
mongoose
  .connect(MONGO_URI)
  .then(() => console.log('✅ Connected to MongoDB'))
  .catch((err) => console.error('❌ MongoDB connection error:', err));

// Create Payment Route
app.post('/api/pay', async (req, res) => {
  const { name, email, amount } = req.body;

  try {
    const tx_ref = `FLW-${Date.now()}`;
    const paymentData = {
      tx_ref,
      amount,
      currency: 'GHS',
      redirect_url: 'https://super-seahorse-022048.netlify.app/transactions.html',
      payment_options: 'mobilemoneyghana',
      customer: { email, name },
      customizations: {
        title: 'Top Up Wallet',
        description: 'Wallet funding',
      },
    };

    const response = await axios.post('https://api.flutterwave.com/v3/payments', paymentData, {
      headers: {
        Authorization: `Bearer ${FLW_SECRET_KEY}`,
        'Content-Type': 'application/json',
      },
    });

    if (response.data && response.data.data && response.data.data.link) {
      res.json({ paymentLink: response.data.data.link });
    } else {
      res.status(400).json({ error: 'Unable to initiate payment' });
    }
  } catch (error) {
    console.error('Payment error:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// ✅ Webhook Route
app.post('/webhook', async (req, res) => {
  const hash = crypto
    .createHmac('sha256', HASH_SECRET)
    .update(JSON.stringify(req.body))
    .digest('hex');

  if (hash !== req.headers['verif-hash']) {
    return res.status(401).send('Invalid hash');
  }

  const payload = req.body;

  if (payload.event === 'charge.completed' && payload.data.status === 'successful') {
    const tx = new Transaction({
      name: payload.data.customer.name,
      email: payload.data.customer.email,
      amount: payload.data.amount,
      reference: payload.data.tx_ref,
      status: payload.data.status,
    });

    await tx.save();
    console.log('✅ Transaction saved via webhook');
  }

  res.send('OK');
});

// Get All Transactions
app.get('/transactions', async (req, res) => {
  try {
    const transactions = await Transaction.find().sort({ date: -1 });
    res.json(transactions);
  } catch (error) {
    console.error('Fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch transactions' });
  }
});

// Start Server
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});