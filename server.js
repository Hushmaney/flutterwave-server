const express = require('express');
const bodyParser = require('body-parser');
const crypto = require('crypto');
const mongoose = require('mongoose');
const nodemailer = require('nodemailer');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 10000;

// MongoDB connection
mongoose.connect(process.env.MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
}).then(() => console.log('MongoDB connected'))
  .catch(err => console.error('MongoDB error:', err));

// Define Transaction schema
const transactionSchema = new mongoose.Schema({
  tx_ref: String,
  amount: Number,
  status: String,
  customer: {
    name: String,
    email: String
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

const Transaction = mongoose.model('Transaction', transactionSchema);

// Nodemailer setup
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_SENDER,
    pass: process.env.EMAIL_PASSWORD
  }
});

// Parse raw body for webhook
app.post('/api/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const secretHash = process.env.FLW_SECRET_HASH;
  const receivedHash = req.headers['verif-hash'];

  const generatedHash = crypto.createHmac('sha256', secretHash)
    .update(req.body)
    .digest('hex');

  if (receivedHash !== generatedHash) {
    console.log('Invalid signature');
    return res.status(401).send('Invalid signature');
  }

  const payload = JSON.parse(req.body);

  if (payload.event === 'charge.completed' && payload.data.status === 'successful') {
    const data = payload.data;

    const transaction = new Transaction({
      tx_ref: data.tx_ref,
      amount: data.amount,
      status: data.status,
      customer: data.customer
    });

    await transaction.save();

    const mailOptions = {
      from: process.env.EMAIL_SENDER,
      to: data.customer.email,
      subject: 'Payment Successful',
      text: `Hi ${data.customer.name}, your payment of NGN ${data.amount} was successful.`
    };

    transporter.sendMail(mailOptions, (err, info) => {
      if (err) {
        console.error('Email error:', err);
      } else {
        console.log('Email sent:', info.response);
      }
    });

    console.log('Transaction saved and email sent');
  }

  res.status(200).send('Webhook received');
});

// Payment endpoint (optional for testing)
app.get('/api/payment', async (req, res) => {
  const axios = require('axios');

  const payload = {
    tx_ref: `FLW-TEST-${Date.now()}`,
    amount: 100,
    currency: 'NGN',
    redirect_url: 'https://your-frontend.com/payment-success',
    payment_options: 'card',
    customer: {
      email: 'johndoe@example.com',
      name: 'John Doe'
    },
    customizations: {
      title: 'Test Payment',
      description: 'Testing Flutterwave Integration'
    }
  };

  try {
    const response = await axios.post('https://api.flutterwave.com/v3/payments', payload, {
      headers: {
        Authorization: `Bearer ${process.env.FLW_SECRET_KEY}`,
        'Content-Type': 'application/json'
      }
    });

    res.status(200).json({
      status: 'success',
      message: 'Hosted Link',
      data: {
        link: response.data.data.link
      }
    });
  } catch (err) {
    console.error('Payment error:', err);
    res.status(500).send('Payment initialization failed');
  }
});

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
