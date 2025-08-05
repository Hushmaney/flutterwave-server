const express = require('express');
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const crypto = require('crypto');
const cors = require('cors');

dotenv.config();

const app = express();
const port = process.env.PORT || 10000;

// MongoDB connection
mongoose.connect(process.env.MONGODB_URI, {
})
  .then(() => console.log('MongoDB connected'))
  .catch(err => console.error('MongoDB connection error:', err));

// CORS middleware
app.use(cors());

// Body parser for normal JSON requests
app.use(express.json());

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

// Webhook endpoint (use express.raw for signature verification)
app.post('/api/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const secretHash = process.env.FLW_SECRET_HASH;
  const receivedHash = req.headers['verif-hash'];

  const rawBody = req.body.toString(); // convert buffer to string

  const generatedHash = crypto.createHmac('sha256', secretHash)
    .update(rawBody)
    .digest('hex');

  if (receivedHash !== generatedHash) {
    console.log('Invalid signature');
    return res.status(401).send('Invalid signature');
  }

  const payload = JSON.parse(rawBody);

  if (payload.event === 'charge.completed' && payload.data.status === 'successful') {
    const { tx_ref, amount, customer, status } = payload.data;

    try {
      const newTransaction = new Transaction({
        tx_ref,
        amount,
        status,
        customer
      });

      await newTransaction.save();
      console.log('Transaction saved:', tx_ref);
    } catch (error) {
      console.error('Error saving transaction:', error);
    }
  }

  res.sendStatus(200);
});

// Endpoint to get transaction history
app.get('/api/transactions', async (req, res) => {
  try {
    const transactions = await Transaction.find().sort({ createdAt: -1 });
    res.json(transactions);
  } catch (error) {
    console.error('Error fetching transactions:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
