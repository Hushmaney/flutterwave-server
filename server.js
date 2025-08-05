const express = require('express');
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const bodyParser = require('body-parser');
const crypto = require('crypto');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 10000;

// MongoDB connection
mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});
mongoose.connection.once('open', () => console.log('MongoDB connected'));

// Capture raw body for signature verification
app.use(bodyParser.json({
  verify: (req, res, buf) => {
    req.rawBody = buf.toString(); // Save raw body for HMAC hash
  }
}));

// Webhook route
app.post('/api/webhook', (req, res) => {
  const secretHash = process.env.FLW_SECRET_HASH || 'testhash123456789';
  const signature = req.headers['verif-hash'];

  const generatedHash = crypto
    .createHmac('sha256', secretHash)
    .update(req.rawBody)
    .digest('hex');

  if (signature !== generatedHash) {
    console.log('Invalid signature');
    return res.status(401).send('Invalid signature');
  }

  console.log('Webhook verified and received:');
  console.log(req.body);

  res.status(200).send('Webhook received successfully');
});

// Root route
app.get('/', (req, res) => {
  res.send('Flutterwave Server is Running 🚀');
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
