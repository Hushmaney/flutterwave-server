const crypto = require('crypto');

const payload = {
  event: 'charge.completed',
  data: {
    status: 'successful',
    amount: 100,
    tx_ref: 'FLW-TEST-001',
    customer: {
      name: 'John Doe',
      email: 'johndoe@example.com'
    }
  }
};

const secretHash = 'testhash123456789'; // same one used in your server.js

const signature = crypto
  .createHmac('sha256', secretHash)
  .update(JSON.stringify(payload))
  .digest('hex');

console.log('Signature:', signature);
console.log('Payload:', JSON.stringify(payload));

