const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const dotenv = require('dotenv');
const mongoose = require('mongoose');
const nodemailer = require('nodemailer');
const axios = require('axios');

dotenv.config();

const app = express();
app.use(cors());
app.use(bodyParser.json());
app.use(express.static('public'));

const PORT = process.env.PORT || 3000;

// ✅ Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('✅ Connected to MongoDB'))
  .catch(err => console.error('❌ MongoDB connection error:', err));

// ✅ Mongoose Transaction schema
const transactionSchema = new mongoose.Schema({
  email: String,
  amount: Number,
  status: String,
  reference: String,
  date: { type: Date, default: Date.now }
});
const Transaction = mongoose.model('Transaction', transactionSchema);

// ✅ Nodemailer setup
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

// ✅ Root route
app.get('/', (req, res) => {
  res.json({ message: 'Flutterwave server is running' });
});

// ✅ Flutterwave payment initialization
app.post('/api/pay', async (req, res) => {
  const { name, email, amount } = req.body;

  const payload = {
    tx_ref: `tx-${Date.now()}`,
    amount,
    currency: 'GHS',
    redirect_url: 'https://tiny-tarsier-6b11ac.netlify.app/transactions.html',
    customer: { email, name },
    customizations: {
      title: "Wallet Top-up",
      description: "Payment to top up your wallet"
    }
  };

  try {
    const response = await axios.post(
      'https://api.flutterwave.com/v3/payments',
      payload,
      {
        headers: {
          Authorization: `Bearer ${process.env.FLW_SECRET_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );

    if (response.data.status === 'success') {
      res.json({ paymentLink: response.data.data.link });
    } else {
      res.status(500).json({ message: 'Payment initiation failed' });
    }
  } catch (error) {
    console.error('❌ Payment init error:', error.response?.data || error.message);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// ✅ Webhook: Flutterwave callback handler
app.post('/webhook', async (req, res) => {
  const { status, amount, customer, tx_ref } = req.body;
  const email = customer.email;

  const newTransaction = new Transaction({
    email,
    amount,
    status,
    reference: tx_ref
  });

  try {
    await newTransaction.save();
    console.log('✅ Transaction saved to DB');

    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: email,
      subject: 'Payment Successful',
      text: `Your payment of ₦${amount} was successful. Reference: ${tx_ref}`
    };

    await transporter.sendMail(mailOptions);
    console.log('✅ Email sent to', email);

    res.sendStatus(200);
  } catch (err) {
    console.error('❌ Webhook error:', err);
    res.sendStatus(500);
  }
});

// ✅ Get all transactions
app.get('/transactions', async (req, res) => {
  try {
    const transactions = await Transaction.find().sort({ date: -1 });
    res.json(transactions);
  } catch {
    res.status(500).json({ message: 'Error fetching transactions' });
  }
});

// ✅ Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'Backend is live!' });
});

// ✅ Start server
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});