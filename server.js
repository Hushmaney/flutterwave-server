const express = require('express');
const fs = require('fs');
const path = require('path');
const cors = require('cors');
const bodyParser = require('body-parser');
const dotenv = require('dotenv');
const mongoose = require('mongoose');
const nodemailer = require('nodemailer');

dotenv.config();

const app = express();
app.use(cors());
app.use(bodyParser.json());
app.use(express.static('public'));

const PORT = process.env.PORT || 3000;

// ✅ Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
}).then(() => {
  console.log('✅ Connected to MongoDB');
}).catch(err => {
  console.error('❌ MongoDB connection error:', err);
});

// ✅ Create a Mongoose schema/model
const transactionSchema = new mongoose.Schema({
  email: String,
  amount: Number,
  status: String,
  reference: String,
  date: { type: Date, default: Date.now }
});

const Transaction = mongoose.model('Transaction', transactionSchema);

// ✅ Email Setup
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

// ✅ Flutterwave webhook endpoint
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
    console.log('✅ Transaction saved to MongoDB');

    // ✅ Send email
    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: email,
      subject: 'Payment Successful',
      text: `Your payment of ₦${amount} was successful. Reference: ${tx_ref}`
    };

    await transporter.sendMail(mailOptions);
    console.log('✅ Email sent to', email);

    res.sendStatus(200);
  } catch (error) {
    console.error('❌ Error:', error);
    res.sendStatus(500);
  }
});

// ✅ Get all transactions
app.get('/transactions', async (req, res) => {
  try {
    const transactions = await Transaction.find().sort({ date: -1 });
    res.json(transactions);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching transactions' });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});
