# 🎯 PRODUCTION-STYLE MANUAL TESTING GUIDE
## SiddhuTrends Backend - Battle Test Plan

---

## 📋 PREREQUISITES

### Tools You Need:
1. **Postman** or **Thunder Client** (VS Code extension)
2. **MongoDB Compass** or **mongosh** (for database queries)
3. **Your running server** (npm run dev)
4. **Valid JWT token** (login first)

### Initial Setup:
```bash
# 1. Start your server
npm run dev

# 2. Server should be running on http://localhost:5000
```

### Get Your Auth Token:
```http
POST http://localhost:5000/api/auth/login
Content-Type: application/json

{
  "email": "your@email.com",
  "password": "yourpassword"
}
```
**Save the token from response** - You'll use it in Authorization header for all protected routes.

---

## 🧩 PHASE 1 — HAPPY PATH (Baseline Truth)

> "If this fails → nothing else matters."

---

### 🟢 TEST CASE 1 — Full ONLINE Order Flow

**Objective:** Verify complete end-to-end order lifecycle with full payment

#### Step 1: Check Initial Inventory State

**Tool:** MongoDB Compass / mongosh

```javascript
// In MongoDB, find a product you'll use for testing
db.products.findOne({ isActive: true })
// Note the _id

// Check its inventory
db.inventories.findOne({ productId: ObjectId("YOUR_PRODUCT_ID") })
```

**Record:**
- Product ID: `__________________`
- Total Stock: `__________________`
- Reserved Stock: `__________________`
- Available: `__________________`

---

#### Step 2: Create Order Intent

**Tool:** Postman

```http
POST http://localhost:5000/api/orders
Authorization: Bearer YOUR_JWT_TOKEN
Content-Type: application/json

{
  "items": [
    {
      "productId": "YOUR_PRODUCT_ID",
      "quantity": 2
    }
  ]
}
```

**Expected Response:**
```json
{
  "message": "Order intent created successfully",
  "orderIntent": {
    "_id": "...",
    "userId": "...",
    "status": "RESERVED",
    "totalAmount": 999,
    "expiresAt": "...",
    "items": [...]
  }
}
```

**Save:** `orderIntentId = _________________`

**✅ Validate in Database:**

```javascript
// Check OrderIntent
db.orderintents.findOne({ _id: ObjectId("YOUR_ORDER_INTENT_ID") })

// Expected:
// status: "RESERVED"
// totalAmount: (should match product price × quantity)
// expiresAt: (should be ~15 minutes from now)

// Check Inventory Reservation
db.inventoryreservations.find({ orderIntentId: ObjectId("YOUR_ORDER_INTENT_ID") })

// Expected:
// - Should have reservation record(s)
// - quantity: 2
// - status: "RESERVED"
// - expiresAt: matches orderIntent

// Check Inventory Stock
db.inventories.findOne({ productId: ObjectId("YOUR_PRODUCT_ID") })

// Expected:
// reservedStock: increased by 2
// totalStock: unchanged (not deducted yet)
```

---

#### Step 3: Initiate ONLINE Payment

**Tool:** Postman

```http
POST http://localhost:5000/api/payments/orders/YOUR_ORDER_INTENT_ID/pay
Authorization: Bearer YOUR_JWT_TOKEN
Content-Type: application/json

{
  "paymentType": "ONLINE"
}
```

**Expected Response:**
```json
{
  "message": "Payment initiated successfully",
  "data": {
    "gatewayOrderId": "order_...",
    "amount": 999,
    "currency": "INR",
    "key": "rzp_test_..."
  }
}
```

**Save:** 
- `gatewayOrderId = _________________`
- `amount = _________________`

**✅ Validate in Database:**

```javascript
// Check Payment record
db.payments.findOne({ orderIntentId: ObjectId("YOUR_ORDER_INTENT_ID") })

// Expected:
// paymentStatus: "PENDING"
// gatewayOrderId: "order_..."
// expectedAmount: 999
// paymentType: "ONLINE"

// Check OrderIntent status
db.orderintents.findOne({ _id: ObjectId("YOUR_ORDER_INTENT_ID") })

// Expected:
// status: "PAYMENT_IN_PROGRESS"
```

---

#### Step 4: Complete Razorpay Test Payment

**Manual Process:**

Since you're testing, you'll simulate payment verification manually.

**Tool:** Postman

```http
POST http://localhost:5000/api/payments/verify
Content-Type: application/json

{
  "razorpay_order_id": "YOUR_GATEWAY_ORDER_ID",
  "razorpay_payment_id": "pay_test_123456789",
  "razorpay_signature": "GENERATE_THIS"
}
```

**How to Generate Test Signature:**

```javascript
// In Node.js console or use online tool
const crypto = require('crypto');

const body = "YOUR_GATEWAY_ORDER_ID|pay_test_123456789";
const secret = "YOUR_RAZORPAY_KEY_SECRET"; // from .env

const signature = crypto
  .createHmac('sha256', secret)
  .update(body)
  .digest('hex');

console.log(signature);
```

**Use this signature in the verify request above.**

**Expected Response:**
```json
{
  "success": true,
  "message": "Payment verified successfully",
  "payment": {
    "_id": "...",
    "paymentStatus": "SUCCESS",
    "paidAmount": 999,
    ...
  }
}
```

---

#### Step 5: Verify PAYMENT_VERIFIED Event Fired

**Check Server Console:**

You should see logs like:
```
🔔 PAYMENT_VERIFIED event emitted for payment: ...
✅ Order created successfully from PAYMENT_VERIFIED event
```

---

#### Step 6: Verify Order Created

**✅ Validate in Database:**

```javascript
// Find the order
db.orders.find({ orderIntentId: ObjectId("YOUR_ORDER_INTENT_ID") })

// Expected:
// status: "CONFIRMED"
// orderNumber: (auto-generated)
// paymentId: (should be linked)
// totalAmount: 999
// orderType: "ONLINE"

// Get the orderId for next check
```

---

#### Step 7: Verify Stock Deducted

```javascript
// Check Inventory
db.inventories.findOne({ productId: ObjectId("YOUR_PRODUCT_ID") })

// Expected:
// totalStock: DECREASED by 2
// reservedStock: DECREASED by 2 (reservation consumed)

// Example: If initial was totalStock: 100, reservedStock: 0
// After intent: totalStock: 100, reservedStock: 2
// After payment: totalStock: 98, reservedStock: 0
```

---

#### Step 8: Verify Reservation Consumed

```javascript
// Check Reservation
db.inventoryreservations.find({ orderIntentId: ObjectId("YOUR_ORDER_INTENT_ID") })

// Expected:
// status: "CONSUMED"
// consumedAt: (timestamp set)
```

---

#### Step 9: Verify OrderIntent Status

```javascript
db.orderintents.findOne({ _id: ObjectId("YOUR_ORDER_INTENT_ID") })

// Expected:
// status: "CONVERTED"
// convertedOrderId: ObjectId(...)
```

---

### ✅ TEST CASE 1 CHECKLIST

- [✅] OrderIntent status = CONVERTED
- [✅] Payment status = SUCCESS
- [✅] Payment paidAmount = expectedAmount (999)
- [✅] Order exists with status = CONFIRMED
- [✅] Order.paymentId is linked correctly
- [✅] Inventory totalStock reduced by 2
- [✅] Inventory reservedStock reduced by 2
- [✅] Reservation status = CONSUMED
- [✅] No errors in server logs

---

### 🟢 TEST CASE 2 — Partial COD Flow

**Objective:** Verify advance payment of ₹199, rest COD

#### Step 1: Check Initial State
Same as Test Case 1

#### Step 2: Create Order Intent
Same as Test Case 1

Save: `orderIntentId = _________________`

---

#### Step 3: Initiate PARTIAL_COD Payment

**Tool:** Postman

```http
POST http://localhost:5000/api/payments/orders/YOUR_ORDER_INTENT_ID/pay
Authorization: Bearer YOUR_JWT_TOKEN
Content-Type: application/json

{
  "paymentType": "PARTIAL_COD"
}
```

**Expected Response:**
```json
{
  "message": "Payment initiated successfully",
  "data": {
    "gatewayOrderId": "order_...",
    "amount": 199,  // <-- MUST be 199 (advance)
    "currency": "INR",
    "key": "rzp_test_..."
  }
}
```

**✅ Validate:** Amount should be **₹199** (not full order amount)

---

#### Step 4: Verify Payment (₹199)

Generate signature for ₹199 payment:

```javascript
const body = "YOUR_GATEWAY_ORDER_ID|pay_test_cod_123";
const secret = "YOUR_RAZORPAY_KEY_SECRET";

const signature = crypto
  .createHmac('sha256', secret)
  .update(body)
  .digest('hex');
```

```http
POST http://localhost:5000/api/payments/verify
Content-Type: application/json

{
  "razorpay_order_id": "YOUR_GATEWAY_ORDER_ID",
  "razorpay_payment_id": "pay_test_cod_123",
  "razorpay_signature": "YOUR_GENERATED_SIGNATURE"
}
```

---

#### Step 5: Validate Database

```javascript
// Check Payment
db.payments.findOne({ orderIntentId: ObjectId("YOUR_ORDER_INTENT_ID") })

// Expected:
// paymentStatus: "SUCCESS"
// paymentType: "PARTIAL_COD"
// paidAmount: 199  // <-- CRITICAL
// expectedAmount: 199

// Check Order
db.orders.findOne({ orderIntentId: ObjectId("YOUR_ORDER_INTENT_ID") })

// Expected:
// status: "CONFIRMED"
// orderType: "PARTIAL_COD"
// totalAmount: (full order amount, e.g., 999)
// paidAmount: 199

// Stock behavior: Same as ONLINE (fully deducted)
```

---

### ✅ TEST CASE 2 CHECKLIST

- [ ] Payment.paymentType = "PARTIAL_COD"
- [ ] Payment.paidAmount = 199 (NOT full amount)
- [ ] Order created with status = CONFIRMED
- [ ] Order.orderType = "PARTIAL_COD"
- [ ] Order.totalAmount shows full price (e.g., 999)
- [ ] Stock deducted fully
- [ ] Reservation consumed

---

## 🧩 PHASE 2 — FAILURE SAFETY

> "VERY IMPORTANT: System must reject attacks and invalid states"

---

### 🔴 TEST CASE 3 — Payment Signature Tampering

**Objective:** Verify system rejects tampered signatures

#### Step 1: Create Order Intent
Follow Test Case 1 steps 1-3 (up to payment initiation)

Save: `gatewayOrderId = _________________`

---

#### Step 2: Manually Create WRONG Signature

```javascript
// Instead of correct signature, use wrong one:
const wrongSignature = "abc123_this_is_fake_signature";
```

---

#### Step 3: Try to Verify with Wrong Signature

```http
POST http://localhost:5000/api/payments/verify
Content-Type: application/json

{
  "razorpay_order_id": "YOUR_GATEWAY_ORDER_ID",
  "razorpay_payment_id": "pay_test_tampered",
  "razorpay_signature": "abc123_this_is_fake_signature"
}
```

**Expected Response:**
```json
{
  "success": false,
  "message": "Payment verification failed"
}
```

---

#### Step 4: Validate Database State

```javascript
// Check Payment
db.payments.findOne({ gatewayOrderId: "YOUR_GATEWAY_ORDER_ID" })

// Expected:
// paymentStatus: "FAILED"
// paidAmount: 0
// gatewayPaymentId: (may or may not be set)

// Check Order - should NOT exist
db.orders.find({ orderIntentId: ObjectId("YOUR_ORDER_INTENT_ID") })
// Expected: NO ORDER CREATED

// Check Stock - should be RELEASED
db.inventories.findOne({ productId: ObjectId("YOUR_PRODUCT_ID") })
// Expected:
// reservedStock: back to 0 (released)

// Check Reservation
db.inventoryreservations.find({ orderIntentId: ObjectId("YOUR_ORDER_INTENT_ID") })
// Expected:
// status: "RELEASED" (not CONSUMED)
```

---

### ✅ TEST CASE 3 CHECKLIST

- [ ] Payment verification API returned error
- [ ] Payment status = FAILED
- [ ] Order was NOT created
- [ ] Stock was released (reservedStock decreased)
- [ ] Reservation status = RELEASED
- [ ] Server logs show signature mismatch error

---

### 🔴 TEST CASE 4 — Amount Mismatch Attack

**Objective:** Prevent paying less than expected amount

**Note:** This is difficult to test manually with Razorpay test mode since you can't actually control what Razorpay charges. This test verifies the *code logic* is in place.

#### What to Verify in Code:

```javascript
// Open: controllers/payment.controller.js
// Look for the verifyPayment function

// Should have check like:
if (razorpayOrder.amount !== payment.expectedAmount * 100) {
  // Reject payment
}
```

**Manual Code Audit:**
1. Open [controllers/payment.controller.js](controllers/payment.controller.js)
2. Find the `verifyPayment` function
3. Look for amount validation logic
4. Confirm it compares:
   - `razorpayOrder.amount` (from gateway)
   - `payment.expectedAmount * 100` (our expected)

If this check exists ✅ Pass
If missing ⚠️ Need to add

---

### 🔴 TEST CASE 5 — Duplicate Webhook Replay

**Objective:** Prevent duplicate order creation from replayed webhooks

#### Setup: Get a Successful Webhook Payload

After completing a successful payment (Test Case 1), check your server logs for:

```
🪝 Webhook received: payment.captured
Webhook payload: { ... }
```

Copy the entire payload.

---

#### Step 1: Send Webhook Once (Normal)

This already happened in Test Case 1. Note the `orderId` created.

---

#### Step 2: Replay Same Webhook 5 Times

**Tool:** Postman

```http
POST http://localhost:5000/api/payments/webhook
Content-Type: application/json
x-razorpay-signature: YOUR_WEBHOOK_SIGNATURE

[Paste exact same webhook payload 5 times]
```

**Note:** Generating valid webhook signature is complex. For manual testing, you can:

**Option A:** Temporarily disable webhook signature check in development:
```javascript
// In payment.controller.js -> razorpayWebhook
// Comment out signature verification for this test only
// NEVER do this in production
```

**Option B:** Check server logs after each replay attempt

---

#### Step 3: Validate Database

```javascript
// Count orders for this payment
db.orders.countDocuments({ 
  paymentId: ObjectId("YOUR_PAYMENT_ID") 
})

// Expected: 1 (only one order, despite 5 webhook calls)

// Check if webhook events are logged
db.webhookevents.find({ 
  "payload.razorpay_payment_id": "YOUR_RAZORPAY_PAYMENT_ID" 
})

// Count: May be multiple, but order count should still be 1
```

---

### ✅ TEST CASE 5 CHECKLIST

- [ ] Only ONE order created despite multiple webhook calls
- [ ] Payment status remains SUCCESS (not duplicated)
- [ ] Stock only deducted once
- [ ] Check server logs for "Duplicate webhook" or "Already processed" messages

---

## 🧩 PHASE 3 — INVENTORY RACE CONDITIONS

> "Concurrency testing - The most critical"

---

### 🟡 TEST CASE 6 — Double Checkout Race

**Objective:** Two users try to buy the last stock simultaneously

#### Setup: Create Product with Limited Stock

```javascript
// In MongoDB
db.inventories.updateOne(
  { productId: ObjectId("YOUR_PRODUCT_ID") },
  { 
    $set: { 
      totalStock: 1,  // Only 1 item left
      reservedStock: 0 
    } 
  }
)
```

---

#### Step 1: Prepare Two User Sessions

**User A:** Login and get JWT token
```http
POST http://localhost:5000/api/auth/login
{ "email": "userA@test.com", "password": "..." }
```
Save: `tokenA = _________________`

**User B:** Login and get JWT token
```http
POST http://localhost:5000/api/auth/login
{ "email": "userB@test.com", "password": "..." }
```
Save: `tokenB = _________________`

---

#### Step 2: Simultaneous Checkout

**Open TWO Postman tabs side by side**

**Tab 1 (User A):**
```http
POST http://localhost:5000/api/orders
Authorization: Bearer TOKEN_A
Content-Type: application/json

{
  "items": [
    { "productId": "YOUR_PRODUCT_ID", "quantity": 1 }
  ]
}
```

**Tab 2 (User B):**
```http
POST http://localhost:5000/api/orders
Authorization: Bearer TOKEN_B
Content-Type: application/json

{
  "items": [
    { "productId": "YOUR_PRODUCT_ID", "quantity": 1 }
  ]
}
```

**Click SEND on both tabs as fast as possible** (within 1 second of each other)

---

#### Step 3: Check Responses

**Expected:**
- **One user:** Gets success (status 200/201)
  ```json
  {
    "message": "Order intent created successfully",
    "orderIntent": { ... }
  }
  ```

- **Other user:** Gets failure (status 400)
  ```json
  {
    "message": "Insufficient stock for \"Product Name\". Available: 0, Requested: 1"
  }
  ```

---

#### Step 4: Validate Database

```javascript
// Check inventory
db.inventories.findOne({ productId: ObjectId("YOUR_PRODUCT_ID") })

// Expected:
// totalStock: 1 (unchanged)
// reservedStock: 1 (only one reservation succeeded)

// Check reservations count
db.inventoryreservations.countDocuments({
  productId: ObjectId("YOUR_PRODUCT_ID"),
  status: "RESERVED"
})

// Expected: 1 (not 2)
```

---

### ✅ TEST CASE 6 CHECKLIST

- [ ] Only ONE user successfully created order intent
- [ ] Other user got "Insufficient stock" error
- [ ] Inventory reservedStock = 1 (not 2)
- [ ] No overselling occurred
- [ ] Database transaction protected the race condition

---

### 🟡 TEST CASE 7 — Expiry + Payment Race

**Objective:** Payment completes exactly when expiry job runs

This is the **hardest test** to do manually. Here's the approach:

#### Setup: Create OrderIntent Close to Expiry

1. Create order intent (Test Case 1, steps 1-2)
2. Note the `expiresAt` timestamp
3. Wait until ~30 seconds before expiry

---

#### Step 1: Prepare Payment Verification

Have your payment verify request ready but DON'T send yet:

```http
POST http://localhost:5000/api/payments/verify
Content-Type: application/json

{
  "razorpay_order_id": "YOUR_GATEWAY_ORDER_ID",
  "razorpay_payment_id": "pay_test_race",
  "razorpay_signature": "YOUR_SIGNATURE"
}
```

---

#### Step 2: Watch Server Logs

Your server runs expiry job every 60 seconds. Watch for:
```
⏰ Starting OrderIntent expiry job...
```

---

#### Step 3: Send Payment AT THE EXACT MOMENT Job Runs

This requires timing. When you see the job log appear, immediately click SEND on payment verify.

**Goal:** Create a race condition where:
- Expiry job tries to release reservation
- Payment tries to consume reservation

---

#### Step 4: Check Which Won

```javascript
// Check OrderIntent
db.orderintents.findOne({ _id: ObjectId("YOUR_ORDER_INTENT_ID") })

// Outcome A - Payment Won (Expected):
// status: "CONVERTED"
// Order should exist

// Outcome B - Expiry Won (Bad):
// status: "EXPIRED"
// Order should NOT exist

// Check Reservation
db.inventoryreservations.find({ orderIntentId: ObjectId("YOUR_ORDER_INTENT_ID") })

// If payment won: status = "CONSUMED"
// If expiry won: status = "RELEASED"
```

---

### ✅ TEST CASE 7 CHECKLIST

- [ ] If payment completed in time → Order created, stock consumed
- [ ] If expired first → Payment rejected, stock released
- [ ] NO scenario where both happen (order created AND stock released)
- [ ] System chose ONE outcome cleanly

**Note:** This test validates the **transactional integrity** of your expiry job and payment flow.

---

## 🧩 PHASE 4 — EVENT SYSTEM INTEGRITY

---

### 🔵 TEST CASE 8 — Manual Event Replay

**Objective:** Emit PAYMENT_VERIFIED event twice, ensure order created only once

This requires code access to manually emit events.

#### Step 1: Complete a Payment Successfully

Follow Test Case 1 completely. Note the `paymentId`.

---

#### Step 2: Manually Emit Event Again

**Option A: Using Node.js REPL (from terminal)**

```bash
# In your project directory
node
```

```javascript
// In Node REPL
import('./utils/paymentEvents.js').then(module => {
  const { paymentEventEmitter } = module;
  const mongoose = await import('mongoose');
  
  paymentEventEmitter.emit('PAYMENT_VERIFIED', {
    paymentId: mongoose.Types.ObjectId('YOUR_PAYMENT_ID')
  });
  
  console.log('Event emitted manually');
});
```

**Option B: Add temporary debug endpoint**

In `routes/debug.routes.js`:
```javascript
router.post('/emit-payment-event/:paymentId', async (req, res) => {
  const { paymentEventEmitter } = await import('../utils/paymentEvents.js');
  paymentEventEmitter.emit('PAYMENT_VERIFIED', {
    paymentId: req.params.paymentId
  });
  res.json({ message: 'Event emitted' });
});
```

Then:
```http
POST http://localhost:5000/api/debug/emit-payment-event/YOUR_PAYMENT_ID
```

---

#### Step 3: Check for Duplicate Orders

```javascript
db.orders.countDocuments({ 
  paymentId: ObjectId("YOUR_PAYMENT_ID") 
})

// Expected: 1 (not 2)
```

---

### ✅ TEST CASE 8 CHECKLIST

- [ ] Only ONE order exists for the payment
- [ ] Stock only deducted once
- [ ] Second event emit was idempotent (safe to replay)
- [ ] Server logs may show "Order already exists" or similar

---

### 🔵 TEST CASE 9 — PAYMENT_FAILED After SUCCESS

**Objective:** Delayed FAILED event should be ignored if payment already successful

#### Step 1: Complete Successful Payment

Test Case 1, full flow. Payment is SUCCESS, order created.

---

#### Step 2: Manually Emit PAYMENT_FAILED Event

Using debug endpoint or REPL:

```javascript
paymentEventEmitter.emit('PAYMENT_FAILED', {
  paymentId: mongoose.Types.ObjectId('YOUR_PAYMENT_ID')
});
```

---

#### Step 3: Validate No Rollback Happened

```javascript
// Check Payment - should STAY success
db.payments.findOne({ _id: ObjectId("YOUR_PAYMENT_ID") })
// Expected: paymentStatus still "SUCCESS"

// Check Order - should STILL exist
db.orders.findOne({ paymentId: ObjectId("YOUR_PAYMENT_ID") })
// Expected: Order exists, status "CONFIRMED"

// Check Stock - should STAY deducted
// (No re-addition to stock)
```

---

### ✅ TEST CASE 9 CHECKLIST

- [ ] Payment status remains SUCCESS
- [ ] Order still exists
- [ ] Stock NOT re-added
- [ ] System ignored out-of-order FAILED event
- [ ] Check server logs for "Payment already in final state" or similar

---

## 🧩 PHASE 5 — LIFECYCLE COMPLETENESS

---

### 🟣 TEST CASE 10 — Expired Intent Cleanup

**Objective:** Unpaid order intent expires and releases stock

#### Step 1: Create Order Intent

```http
POST http://localhost:5000/api/orders
Authorization: Bearer YOUR_JWT_TOKEN
Content-Type: application/json

{
  "items": [
    { "productId": "YOUR_PRODUCT_ID", "quantity": 2 }
  ]
}
```

**Expected:** Status 200, `orderIntentId` returned, stock reserved.

---

#### Step 2: Do NOT Pay - Just Wait

Check when it expires:
```javascript
db.orderintents.findOne({ _id: ObjectId("YOUR_ORDER_INTENT_ID") })
// Check expiresAt field
```

**Wait for expiry time** (default: 15 minutes)

Or, for faster testing, manually set expiry to 2 minutes ago:
```javascript
db.orderintents.updateOne(
  { _id: ObjectId("YOUR_ORDER_INTENT_ID") },
  { $set: { expiresAt: new Date(Date.now() - 120000) } }
)
```

---

#### Step 3: Wait for Expiry Job to Run

Server runs expiry job every 60 seconds. Watch logs:
```
⏰ Starting OrderIntent expiry job...
🗑️ Expired 1 order intent(s)
```

---

#### Step 4: Validate Cleanup

```javascript
// Check OrderIntent
db.orderintents.findOne({ _id: ObjectId("YOUR_ORDER_INTENT_ID") })
// Expected: status = "EXPIRED"

// Check Reservation
db.inventoryreservations.find({ orderIntentId: ObjectId("YOUR_ORDER_INTENT_ID") })
// Expected: status = "RELEASED"

// Check Inventory
db.inventories.findOne({ productId: ObjectId("YOUR_PRODUCT_ID") })
// Expected: reservedStock decreased by 2 (released back)
```

---

### ✅ TEST CASE 10 CHECKLIST

- [ ] OrderIntent status changed to EXPIRED
- [ ] Reservation status = RELEASED
- [ ] reservedStock decreased (stock freed)
- [ ] Expiry job logs show processing
- [ ] Stock is now available for other users

---

## 🧩 PHASE 6 — SECURITY ABUSE SCENARIOS

> "Real-world attacks"

---

### ⚫ TEST CASE 11 — Direct Order Creation Attempt

**Objective:** Verify user cannot create order without payment

#### Attempt 1: Call Order Creation API Directly (if exists)

Check if there's a direct order creation endpoint:
```javascript
// Search in routes/order.routes.js
```

**Expected:** NO direct POST /api/orders to create final Order (only OrderIntent creation)

---

#### Attempt 2: Manual Database Insert

```javascript
// Try to insert order directly
db.orders.insertOne({
  userId: ObjectId("YOUR_USER_ID"),
  orderNumber: "FAKE-12345",
  status: "CONFIRMED",
  totalAmount: 0, // trying to get free order
  items: [...]
})
```

**Can you do this?** Yes (MongoDB doesn't prevent it)

**What should happen in production?**
- Add database-level validators
- Add application-level checks that all orders MUST have:
  - Valid `paymentId`
  - Matching payment status
  - Stock deducted

**Validate:**
```javascript
// Check if your system would accept this fake order
// Key question: What happens when you fetch orders?
```

**✅ If your code requires paymentId validation everywhere → PASS**
**⚠️ If fake orders can be created → Need to add validation**

---

### ⚫ TEST CASE 12 — Reuse Old PaymentId

**Objective:** Prevent replaying old successful payment

#### Step 1: Complete a Successful Payment

Test Case 1 fully. Note the payment details:
- `razorpay_order_id`
- `razorpay_payment_id`
- `razorpay_signature`

---

#### Step 2: Create New Order Intent

Follow Test Case 1, steps 1-2. Get new `orderIntentId`.

---

#### Step 3: Try Payment Verify with OLD Payment Details

```http
POST http://localhost:5000/api/payments/verify
Content-Type: application/json

{
  "razorpay_order_id": "OLD_ORDER_ID_FROM_PREVIOUS_PAYMENT",
  "razorpay_payment_id": "OLD_PAYMENT_ID",
  "razorpay_signature": "OLD_SIGNATURE"
}
```

**Expected Behavior:**

**Option A (Ideal):** 
```json
{ "success": false, "message": "Payment already processed" }
```

**Option B (Also OK):**
```json
{ "success": false, "message": "Payment does not match this order intent" }
```

---

#### Step 4: Validate No New Order Created

```javascript
// Check orders for old payment
db.orders.countDocuments({ 
  paymentId: ObjectId("OLD_PAYMENT_ID") 
})
// Expected: Still 1 (original order only)

// Check if new order intent got converted
db.orderintents.findOne({ _id: ObjectId("NEW_ORDER_INTENT_ID") })
// Expected: status NOT "CONVERTED" (should still be "PAYMENT_IN_PROGRESS" or "RESERVED")
```

---

### ✅ TEST CASE 12 CHECKLIST

- [ ] Old payment cannot be reused
- [ ] New order intent NOT converted
- [ ] System validates payment belongs to current order
- [ ] Signature verification includes order matching

---

## 🧩 PHASE 7 — STRESS SIMULATION (Optional But Gold)

**Note:** This requires scripting, but here's the manual simulation approach:

### ⚡ TEST CASE 13 — Concurrent Orders

#### Setup: Create 5 User Accounts

```http
POST http://localhost:5000/api/auth/signup
Content-Type: application/json

{ "email": "test1@example.com", "password": "Test123!", "name": "Test User 1" }
{ "email": "test2@example.com", "password": "Test123!", "name": "Test User 2" }
... repeat for 5 users
```

Get JWT tokens for all 5.

---

#### Test: Simultaneous Order Creation

**Open 5 Postman tabs**

All tabs send this request **at the same time**:
```http
POST http://localhost:5000/api/orders
Authorization: Bearer USER_X_TOKEN
Content-Type: application/json

{
  "items": [
    { "productId": "SAME_PRODUCT_ID", "quantity": 2 }
  ]
}
```

Make sure product has enough stock (e.g., 20 items).

---

#### What to Check:

```javascript
// Check total reservations
db.inventoryreservations.aggregate([
  { $match: { productId: ObjectId("YOUR_PRODUCT_ID"), status: "RESERVED" } },
  { $group: { _id: null, total: { $sum: "$quantity" } } }
])

// Expected: 10 (5 users × 2 items)

// Check inventory
db.inventories.findOne({ productId: ObjectId("YOUR_PRODUCT_ID") })
// reservedStock should = 10

// Check for any failed requests
// Some may fail due to rate limiting (expected)
// None should fail due to race conditions
```

---

## 🚀 PHASE 8 — ENHANCEMENT OPPORTUNITIES

After completing all tests, review these gaps:

### ⭐ Enhancement 1 — Payment Reconciliation Job

**Current State:** No automated reconciliation

**What to Add:**
```javascript
// scripts/reconcilePayments.js (already exists!)
// Run nightly:
node scripts/reconcilePayments.js
```

**Manual Check:**
```javascript
// Find payments SUCCESS but no order
db.payments.find({
  paymentStatus: "SUCCESS",
  $expr: {
    $eq: [
      { $size: { $ifNull: [{ $objectToArray: "$orderId" }, []] } },
      0
    ]
  }
})

// These are orphaned payments → need investigation
```

---

### ⭐ Enhancement 2 — Inventory Drift Detector

**Manual Check Now:**
```javascript
db.inventories.find({
  $expr: { $gt: ["$reservedStock", "$totalStock"] }
})

// Expected: No results
// If results exist → DATA CORRUPTION
```

**Automated Job to Add:**
```javascript
// scripts/checkInventoryHealth.js
// Alert if: reservedStock + sold > totalStock
```

---

### ⭐ Enhancement 3 — Event Audit Table

**Current State:** Events are not logged

**What to Add:**
```javascript
// models/paymentEvent.model.js
const paymentEventSchema = new Schema({
  eventType: String,
  paymentId: ObjectId,
  emittedAt: Date,
  processedAt: Date,
  result: String,
  error: String
});
```

**Track:**
- When event fired
- When event processed
- Outcome (success/duplicate/error)

---

## 📅 SUGGESTED TESTING TIMELINE

### 🕘 Morning (9 AM - 12 PM) — FUNCTIONAL TESTS

**Time: 3 hours**

- [ ] Test Case 1: Full ONLINE flow (30 min)
- [ ] Test Case 2: Partial COD flow (20 min)
- [ ] Test Case 3: Signature tampering (20 min)
- [ ] Test Case 4: Amount validation check (10 min - Code audit)
- [ ] Test Case 5: Duplicate webhook (30 min)
- [ ] Document findings (1 hour)

---

### 🕛 Noon (12 PM - 2 PM) — LUNCH + FAILURE TESTS

**Time: 1 hour testing**

- [ ] Test Case 6: Race condition (30 min)
- [ ] Test Case 7: Expiry race (30 min - requires patience)

---

### 🕓 Afternoon (2 PM - 5 PM) — ADVANCED TESTS

**Time: 3 hours**

- [ ] Test Case 8: Event replay (30 min)
- [ ] Test Case 9: Out-of-order events (20 min)
- [ ] Test Case 10: Expiry cleanup (30 min)
- [ ] Test Case 11: Security audit (30 min)
- [ ] Test Case 12: Payment replay (30 min)
- [ ] Test Case 13: Concurrency (30 min)
- [ ] Document findings (30 min)

---

### 🕗 Evening (5 PM - 6 PM) — REVIEW & IMPROVE

- [ ] Review all findings
- [ ] List discovered issues by priority
- [ ] Plan fixes for critical issues
- [ ] Design enhancements (reconciliation, monitoring)

---

## 📝 TESTING CHECKLIST MASTER

### Critical Safety Features:
- [ ] Payment signature validation works
- [ ] Amount verification prevents underpayment
- [ ] Stock cannot be oversold (race condition safe)
- [ ] Duplicate webhooks don't create duplicate orders
- [ ] Failed payments release stock
- [ ] Expired intents release stock
- [ ] Events are idempotent (safe to replay)

### Data Integrity:
- [ ] reservedStock + sold ≤ totalStock (always)
- [ ] Every order has a valid payment
- [ ] Every SUCCESS payment has an order
- [ ] Inventory matches reality

### Edge Cases:
- [ ] Concurrent checkouts handled correctly
- [ ] Payment vs expiry race is deterministic
- [ ] Out-of-order events don't corrupt state
- [ ] Old payments can't be replayed

---

## 🧠 MINDSET FOR TOMORROW

### Don't Ask:
❌ "Does it work?"

### Ask:
✅ "How can I break this?"
✅ "What happens if X comes before Y?"
✅ "Can a user cheat the system?"
✅ "What if the server crashes exactly here?"

---

## 📊 TRACKING YOUR RESULTS

Create a simple spreadsheet or document:

| Test Case | Status | Issue Found | Severity | Notes |
|-----------|--------|-------------|----------|-------|
| TC1 - ONLINE Flow | ✅ Pass | None | - | Everything works |
| TC3 - Signature Tamper | ⚠️ Fail | Stock not released | High | Need to add PAYMENT_FAILED event handling |
| TC6 - Race Condition | ✅ Pass | None | - | Database transaction works |
| ... | | | | |

---

## 🎯 FINAL NOTES

1. **Take Screenshots:** Capture Postman responses and database states
2. **Save Logs:** Copy server console output for each test
3. **Document Timing:** Note if any operation is slow (>2 seconds)
4. **Track Changes:** If you fix something mid-testing, note it
5. **Stay Systematic:** Don't skip tests even if things look good

---

## 🆘 TROUBLESHOOTING

### If Server Crashes During Test:
1. Note which test case caused it
2. Check server logs for error stack trace
3. Capture database state immediately
4. Restart server and document the crash

### If Database Gets Corrupted:
```javascript
// Reset specific order intent
db.orderintents.deleteOne({ _id: ObjectId("...") })
db.inventoryreservations.deleteMany({ orderIntentId: ObjectId("...") })
db.payments.deleteMany({ orderIntentId: ObjectId("...") })
db.orders.deleteMany({ orderIntentId: ObjectId("...") })

// Manually fix inventory
db.inventories.updateOne(
  { productId: ObjectId("...") },
  { 
    $set: { reservedStock: 0 },
    $set: { totalStock: ORIGINAL_STOCK }
  }
)
```

---

## ✅ DONE!

You now have a **complete manual testing battle plan** that mirrors production-grade QA.

> "A system isn't proven until you've tried to break it and failed."

Good luck! 🚀
