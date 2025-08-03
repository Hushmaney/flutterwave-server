require('dotenv').config(); // Load environment variables

const express = require('express');
const axios = require('axios');
const cors = require('cors');
const bodyParser = require('body-parser');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// Use environment variable for Flutterwave secret key
const FLW_SECRET_KEY = process.env.FLW_SECRET_KEY;

// Middleware
app.use(cors());
app.use(bodyParser.json());

// Simulate sending the product
function sendProduct(transaction) {
  console.log(`✅ Product sent for transaction: ${transaction.tx_ref} to ${transaction.customer.email}`);
  return true;
}

// Save payment to local file
function savePayment(data) {
  const filePath = 'payments.json';
  const existingData = fs.existsSync(filePath)
    ? JSON.parse(fs.readFileSync(filePath))
    : [];

  existingData.push(data);
  fs.writeFileSync(filePath, JSON.stringify(existingData, null, 2));
}

// Load payment records
function loadPayments() {
  const filePath = 'payments.json';
  return fs.existsSync(filePath)
    ? JSON.parse(fs.readFileSync(filePath))
    : [];
}

// Route to initiate payment
app.post('/api/pay', async (req, res) => {
  const { amount, email, name } = req.body;
  const tx_ref = 'TX_' + Date.now();

  try {
    const response = await axios.post(
      'https://api.flutterwave.com/v3/payments',
      {
        tx_ref,
        amount,
        currency: 'GHS',
        redirect_url: 'https://your-frontend-url.netlify.app/payment-success.html', // <-- UPDATE THIS!
        customer: { email, name },
        customizations: {
          title: 'MyApp Wallet Payment',
          description: 'Top-up wallet using Flutterwave',
        },
      },
      {
        headers: {
          Authorization: `Bearer ${FLW_SECRET_KEY}`,
        },
      }
    );

    const paymentLink = response.data.data.link;

    // Save transaction request
    savePayment({
      name,
      email,
      amount,
      tx_ref,
      paymentLink,
      createdAt: new Date().toISOString(),
    });

    res.json({ paymentLink, tx_ref });
  } catch (err) {
    console.error(err.response?.data || err.message);
    res.status(500).send('Error initiating payment');
  }
});

// Route to verify payment and send product
app.get('/api/verify', async (req, res) => {
  const tx_ref = req.query.tx_ref;

  if (!tx_ref) {
    return res.status(400).json({ message: 'Transaction reference (tx_ref) is required' });
  }

  try {
    const response = await axios.get(
      `https://api.flutterwave.com/v3/transactions/verify_by_reference?tx_ref=${tx_ref}`,
      {
        headers: {
          Authorization: `Bearer ${FLW_SECRET_KEY}`,
        },
      }
    );

    const result = response.data;

    if (result.status === 'success' && result.data.status === 'successful') {
      sendProduct(result.data);

      // ✅ Save verified transaction
      savePayment({
        status: 'verified',
        tx_ref: result.data.tx_ref,
        amount: result.data.amount,
        customer: result.data.customer,
        createdAt: result.data.created_at,
      });

      return res.status(200).json({
        message: 'Payment verified successfully and product sent',
        transaction: result.data,
      });
    } else {
      return res.status(400).json({ message: 'Payment not successful', details: result.data });
    }
  } catch (error) {
    console.error(error.response?.data || error.message);
    return res.status(500).json({ message: 'Error verifying payment' });
  }
});

// Route to get all transaction history
app.get('/api/transactions', (req, res) => {
  const records = loadPayments();
  res.json(records);
});

// ✅ Root route to fix "Cannot GET /"
app.get('/', (req, res) => {
  res.send('✅ Flutterwave server is live!');
});

// Start the server
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});