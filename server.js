const express = require('express');
const cors = require('cors');
const axios = require('axios');

const app = express();
app.use(cors());
app.use(express.json());

// Paystack Secret Key
const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY;

// ============ HEALTH CHECK ============
app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'OK', 
        timestamp: new Date().toISOString(),
        service: 'FluxPay Payment Backend'
    });
});

// ============ VERIFY BANK ACCOUNT ============
app.post('/api/paystack/verify-account', async (req, res) => {
    const { accountNumber, bankCode } = req.body;
    
    console.log(`🔍 Verifying account: ${accountNumber} (${bankCode})`);
    
    if (!accountNumber || !bankCode) {
        return res.status(400).json({ 
            status: false, 
            message: 'Account number and bank code are required' 
        });
    }
    
    try {
        const response = await axios.get(
            `https://api.paystack.co/bank/resolve?account_number=${accountNumber}&bank_code=${bankCode}`,
            {
                headers: {
                    Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`
                }
            }
        );
        
        console.log('✅ Verification successful:', response.data.data.account_name);
        
        if (response.data.status) {
            return res.json({
                status: true,
                data: {
                    account_name: response.data.data.account_name,
                    account_number: response.data.data.account_number,
                    bank_code: bankCode
                }
            });
        } else {
            return res.status(400).json({
                status: false,
                message: response.data.message || 'Account verification failed'
            });
        }
    } catch (error) {
        console.error('❌ Paystack API Error:', error.response?.data || error.message);
        return res.status(500).json({
            status: false,
            message: error.response?.data?.message || 'Error verifying account. Please try again.'
        });
    }
});

// ============ CREATE TRANSFER RECIPIENT ============
app.post('/api/paystack/create-recipient', async (req, res) => {
    const { name, accountNumber, bankCode } = req.body;
    
    console.log(`📝 Creating recipient: ${name} - ${accountNumber}`);
    
    try {
        const response = await axios.post(
            'https://api.paystack.co/transferrecipient',
            {
                type: 'nuban',
                name: name,
                account_number: accountNumber,
                bank_code: bankCode,
                currency: 'NGN'
            },
            {
                headers: {
                    Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
                    'Content-Type': 'application/json'
                }
            }
        );
        
        if (response.data.status) {
            console.log('✅ Recipient created:', response.data.data.recipient_code);
            return res.json({
                status: true,
                data: {
                    recipient_code: response.data.data.recipient_code,
                    name: response.data.data.name,
                    details: response.data.data.details
                }
            });
        } else {
            return res.status(400).json({
                status: false,
                message: response.data.message || 'Failed to create recipient'
            });
        }
    } catch (error) {
        console.error('❌ Create Recipient Error:', error.response?.data || error.message);
        return res.status(500).json({
            status: false,
            message: error.response?.data?.message || 'Error creating recipient'
        });
    }
});

// ============ INITIATE TRANSFER ============
app.post('/api/paystack/initiate-transfer', async (req, res) => {
    const { amount, recipientCode, reason } = req.body;
    
    console.log(`💸 Initiating transfer: ₦${amount} to ${recipientCode}`);
    
    try {
        const response = await axios.post(
            'https://api.paystack.co/transfer',
            {
                source: 'balance',
                amount: amount * 100, // Convert to kobo
                recipient: recipientCode,
                reason: reason || 'FluxPay withdrawal'
            },
            {
                headers: {
                    Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
                    'Content-Type': 'application/json'
                }
            }
        );
        
        if (response.data.status) {
            console.log('✅ Transfer initiated:', response.data.data.reference);
            return res.json({
                status: true,
                data: {
                    reference: response.data.data.reference,
                    transfer_code: response.data.data.transfer_code,
                    amount: response.data.data.amount / 100,
                    status: response.data.data.status
                }
            });
        } else {
            return res.status(400).json({
                status: false,
                message: response.data.message || 'Transfer failed'
            });
        }
    } catch (error) {
        console.error('❌ Transfer Error:', error.response?.data || error.message);
        return res.status(500).json({
            status: false,
            message: error.response?.data?.message || 'Error initiating transfer'
        });
    }
});

// ============ GET BANK LIST ============
app.get('/api/paystack/banks', async (req, res) => {
    try {
        const response = await axios.get(
            'https://api.paystack.co/bank?currency=NGN',
            {
                headers: {
                    Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`
                }
            }
        );
        
        if (response.data.status) {
            return res.json({
                status: true,
                data: response.data.data
            });
        } else {
            return res.status(400).json({
                status: false,
                message: 'Failed to fetch banks'
            });
        }
    } catch (error) {
        console.error('❌ Bank list error:', error.message);
        return res.status(500).json({
            status: false,
            message: 'Error fetching banks'
        });
    }
});

// ============ WEBHOOK (for payment confirmations) ============
app.post('/api/paystack/webhook', (req, res) => {
    const event = req.body;
    console.log('📨 Webhook received:', event.event);
    
    // Handle different webhook events
    switch(event.event) {
        case 'charge.success':
            console.log('💰 Payment successful:', event.data.reference);
            // Update your database here
            break;
        case 'transfer.success':
            console.log('✅ Transfer successful:', event.data.reference);
            break;
        case 'transfer.failed':
            console.log('❌ Transfer failed:', event.data.reference);
            break;
    }
    
    res.sendStatus(200);
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`\n🚀 FluxPay Backend Server Running`);
    console.log(`📍 http://localhost:${PORT}`);
    console.log(`📡 Endpoints:`);
    console.log(`   GET  /api/health`);
    console.log(`   POST /api/paystack/verify-account`);
    console.log(`   POST /api/paystack/create-recipient`);
    console.log(`   POST /api/paystack/initiate-transfer`);
    console.log(`   GET  /api/paystack/banks`);
    console.log(`   POST /api/paystack/webhook\n`);
});