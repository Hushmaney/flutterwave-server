const express = require('express');
const bodyParser = require('body-parser');
const mongoose = require('mongoose');
const crypto = require('crypto');
const dotenv = require('dotenv');
const nodemailer = require('nodemailer');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(bodyParser.json());

// Connect to MongoDB
mongoose.connect(process.env.MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
})
.then(() => console.log("✅ Connected to MongoDB"))
.catch(err => console.error("❌ MongoDB connection error:", err));

// Mongoose schema
const transactionSchema = new mongoose.Schema({
  tx_ref: String,
  transaction_id: Number,
  amount: Number,
  currency: String,
  email: String,
  status: String,
  createdAt: { type: Date, default: Date.now }
});

const Transaction = mongoose.model('Transaction', transactionSchema);

// Nodemailer config
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_SENDER,
    pass: process.env.EMAIL_PASSWORD
  }
});

// Webhook endpoint
app.post('/webhook', async (req, res) => {
  // Step 1: Verify signature
  const hash = crypto
    .createHmac('sha256', process.env.FLW_SECRET_HASH)
    .update(JSON.stringify(req.body))
    .digest('hex');

  const flutterwaveSignature = req.headers['verif-hash'];

  // Debug logs to help you see what’s happening
  console.log('🔒 Received hash:', flutterwaveSignature);
  console.log('🔐 Expected hash:', hash);

  if (!flutterwaveSignature || flutterwaveSignature !== hash) {
    console.log("❌ Signature mismatch. Unauthorized request.");
    return res.status(401).send('Unauthorized');
  }

  // Step 2: Handle event
  const event = req.body.event;
  const data = req.body.data;

  console.log("✅ Webhook received:", { event, data });

  if (event === 'charge.completed' && data.status === 'successful') {
    const newTransaction = new Transaction({
      tx_ref: data.tx_ref,
      transaction_id: data.id,
      amount: data.amount,
      currency: data.currency,
      email: data.customer.email,
      status: data.status
    });

    try {
      await newTransaction.save();
      console.log("💾 Transaction saved to database");

      // Step 3: Send email
      const mailOptions = {
        from: process.env.EMAIL_SENDER,
        to: data.customer.email,
        subject: 'Payment Confirmation',
        html: `
          <h2>✅ Payment Received</h2>
          <p><strong>Transaction ID:</strong> ${data.id}</p>
          <p><strong>Amount:</strong> ${data.amount} ${data.currency}</p>
          <p><strong>Status:</strong> ${data.status}</p>
          <p><strong>Reference:</strong> ${data.tx_ref}</p>
        `
      };

      await transporter.sendMail(mailOptions);
      console.log("📧 Email sent to", data.customer.email);
    } catch (err) {
      console.error("❌ Error saving transaction or sending email:", err);
    }
  }

  res.status(200).send("OK");
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});
