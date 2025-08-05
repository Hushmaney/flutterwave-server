const express = require("express");
const crypto = require("crypto");
const mongoose = require("mongoose");
const dotenv = require("dotenv");
const bodyParser = require("body-parser");

dotenv.config();

const app = express();
const port = process.env.PORT || 10000;

const MONGODB_URI = process.env.MONGODB_URI;
const FLW_SECRET_HASH = process.env.FLW_SECRET_HASH;

// Connect to MongoDB
mongoose
  .connect(MONGODB_URI)
  .then(() => console.log("MongoDB connected"))
  .catch((err) => console.error("MongoDB connection error:", err));

// Define schema for transactions
const transactionSchema = new mongoose.Schema(
  {
    status: String,
    amount: Number,
    tx_ref: String,
    customer: {
      name: String,
      email: String,
    },
  },
  { timestamps: true }
);

const Transaction = mongoose.model("Transaction", transactionSchema);

// Parse JSON for all routes except webhook
app.use((req, res, next) => {
  if (req.originalUrl === "/api/webhook") {
    next(); // skip bodyParser for webhook
  } else {
    express.json()(req, res, next);
  }
});

// Parse raw body for webhook route only
app.post(
  "/api/webhook",
  express.raw({ type: "application/json" }),
  async (req, res) => {
    const signature = req.headers["verif-hash"];

    if (!signature) {
      console.log("❌ No signature provided");
      return res.status(401).send("No signature");
    }

    const generatedHash = crypto
      .createHmac("sha256", FLW_SECRET_HASH)
      .update(req.body)
      .digest("hex");

    if (signature !== generatedHash) {
      console.log("❌ Invalid signature");
      return res.status(401).send("Invalid signature");
    }

    const payload = JSON.parse(req.body);
    console.log("✅ Webhook received:", payload);

    if (payload.event === "charge.completed" && payload.data.status === "successful") {
      const txData = {
        status: payload.data.status,
        amount: payload.data.amount,
        tx_ref: payload.data.tx_ref,
        customer: payload.data.customer,
      };

      try {
        await Transaction.create(txData);
        console.log("✅ Transaction saved to DB");
      } catch (err) {
        console.error("❌ Error saving transaction:", err);
        return res.status(500).send("Error saving transaction");
      }
    }

    res.send("Webhook received");
  }
);

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
