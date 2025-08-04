require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const axios = require('axios');
const nodemailer = require('nodemailer');
const crypto = require('crypto');

const app = express();
app.use(cors());
app.use(express.json());

// Environment variables
const PORT = process.env.PORT || 10000;
const MONGO_URI = process.env.MONGODB_URI;
const FLW_SECRET_KEY = process.env.FLW_SECRET_KEY;
const HASH_SECRET = process.env.FLW_SECRET_HASH;
const EMAIL_SENDER = process.env.EMAIL_USER;
const EMAIL_PASSWORD = process.env.EMAIL_PASS;

// Connect to MongoDB
mongoose
  .connect(MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => console.log('✅ Connected to MongoDB'))
  .catch((err) => console.error('❌ MongoDB connection error:', err));

// Transaction Schema
const transactionSchema = new mongoose.Schema({
  name: String,
  email: String,
  amount: Number,
  tx_ref: String,
  status: String,
  date: { type: Date, default: Date.now },
});

const Transaction = mongoose.model('Transaction', transactionSchema);

// Payment initiation route
app.post('/api/pay', async (req, res) => {
  const { name, email, amount } = req.body;
  const tx_ref = `FLW-${Date.now()}`;

  const paymentData = {
    tx_ref,
    amount,
    currency: 'GHS',
    redirect_url: 'https://super-seahorse-022048.netlify.app/transactions.html',
    payment_options: 'mobilemoneyghana',
    customer: {
      email,
      name,
    },
    customizations: {
      title: 'Payment for Services',
      description: 'Payment via Flutterwave',
    },
  };

  try {
    const response = await axios.post(
      'https://api.flutterwave.com/v3/payments',
      paymentData,
      {
        headers: {
          Authorization: `Bearer ${FLW_SECRET_KEY}`,
          'Content-Type': 'application/json',
        },
      }
    );

    res.json(response.data);
  } catch (error) {
    console.error('Payment initiation error:', error.response?.data || error.message);
    res.status(500).json({ error: 'Payment initiation failed' });
  }
});

// Flutterwave webhook handler
app.post('/api/webhook', async (req, res) => {
  const hash = crypto
    .createHmac('sha256', HASH_SECRET)
    .update(JSON.stringify(req.body))
    .digest('hex');

  const flutterwaveHash = req.headers['verif-hash'];

  if (!flutterwaveHash || flutterwaveHash !== hash) {
    return res.status(401).send('Invalid signature');
  }

  const payload = req.body;
  if (payload.event === 'charge.completed' && payload.data.status === 'successful') {
    const { tx_ref, amount, customer } = payload.data;

    const transaction = new Transaction({
      name: customer.name,
      email: customer.email,
      amount,
      tx_ref,
      status: 'successful',
    });

    try {
      await transaction.save();
      console.log('✅ Transaction saved');

      const transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
          user: EMAIL_SENDER,
          pass: EMAIL_PASSWORD,
        },
      });

      const mailOptions = {
        from: EMAIL_SENDER,
        to: customer.email,
        subject: 'Payment Confirmation',
        text: `Hello ${customer.name},\n\nYour payment of GHS ${amount} was successful. Reference: ${tx_ref}.\n\nThank you!`,
      };

      await transporter.sendMail(mailOptions);
      console.log('📧 Confirmation email sent');
    } catch (err) {
      console.error('❌ Failed to save or send email:', err);
    }
  }

  res.sendStatus(200);
});

// Fetch all transactions
app.get('/api/transactions', async (req, res) => {
  try {
    const transactions = await Transaction.find().sort({ date: -1 });
    res.json(transactions);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch transactions' });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});