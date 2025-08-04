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

// ✅ MongoDB connection
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('✅ Connected to MongoDB'))
  .catch(err => console.error('❌ MongoDB connection error:', err));

// ✅ Mongoose schema
const transactionSchema = new mongoose.Schema({
  email: String,
  amount: Number,
  status: String,
  reference: String,
  date: { type: Date, default: Date.now }
});
const Transaction = mongoose.model('Transaction', transactionSchema);

// ✅ Email setup
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

// ✅ Root
app.get('/', (req, res) => {
  res.json({ message: 'Flutterwave server is running' });
});

// ✅ Payment initialization
app.post('/api/pay', async (req, res) => {
  const { name, email, amount } = req.body;

  const payload = {
    tx_ref: `tx-${Date.now()}`,
    amount,
    currency: 'GHS',
    redirect_url: 'https://flutterwave-server-i4ae.onrender.com/verify-payment', // ✅ Updated redirect
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

// ✅ Verify transaction (replacement for webhook)
app.get('/verify-payment', async (req, res) => {
  const { transaction_id } = req.query;

  try {
    const verifyResponse = await axios.get(
      `https://api.flutterwave.com/v3/transactions/${transaction_id}/verify`,
      {
        headers: {
          Authorization: `Bearer ${process.env.FLW_SECRET_KEY}`
        }
      }
    );

    const data = verifyResponse.data.data;

    const newTransaction = new Transaction({
      email: data.customer.email,
      amount: data.amount,
      status: data.status,
      reference: data.tx_ref
    });

    await newTransaction.save();
    console.log('✅ Transaction verified & saved');

    // Email
    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: data.customer.email,
      subject: 'Payment Successful',
      text: `Your payment of ₦${data.amount} was successful. Reference: ${data.tx_ref}`
    };

    await transporter.sendMail(mailOptions);
    console.log('✅ Email sent to', data.customer.email);

    // Redirect to frontend
    res.redirect('https://tiny-tarsier-6b11ac.netlify.app/transactions.html');
  } catch (err) {
    console.error('❌ Error verifying transaction:', err.response?.data || err.message);
    res.status(500).send('Verification failed');
  }
});

// ✅ Transaction history
app.get('/transactions', async (req, res) => {
  try {
    const transactions = await Transaction.find().sort({ date: -1 });
    res.json(transactions);
  } catch {
    res.status(500).json({ message: 'Error fetching transactions' });
  }
});

// ✅ Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'Backend is live!' });
});

// ✅ Start server
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});