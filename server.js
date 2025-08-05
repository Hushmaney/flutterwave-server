const express = require('express');
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const crypto = require('crypto');
const bodyParser = require('body-parser');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 10000;

// Connect to MongoDB
mongoose
  .connect(process.env.MONGODB_URI)
  .then(() => console.log('MongoDB connected'))
  .catch((err) => console.error('MongoDB connection error:', err));

// Capture raw body before JSON parsing
app.use(
  '/api/webhook',
  bodyParser.json({
    verify: (req, res, buf) => {
      req.rawBody = buf.toString();
    },
  })
);

// Other routes use normal body parsing
app.use(express.json());

// Webhook endpoint
app.post('/api/webhook', (req, res) => {
  const receivedHash = req.headers['verif-hash'];
  const secretHash = process.env.FLW_SECRET_HASH;

  if (!receivedHash || !secretHash) {
    return res.status(400).send('Missing hash');
  }

  const generatedHash = crypto
    .createHmac('sha256', secretHash)
    .update(req.rawBody)
    .digest('hex');

  if (generatedHash !== receivedHash) {
    console.log('Invalid signature');
    return res.status(400).send('Invalid signature');
  }

  const event = req.body.event;
  const data = req.body.data;

  if (event === 'charge.completed' && data.status === 'successful') {
    console.log('✅ Payment successful:', data);
    return res.status(200).send('Webhook received and verified');
  }

  res.status(400).send('Unhandled event');
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
