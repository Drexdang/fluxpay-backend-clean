require('dotenv').config();
console.log('🔑 Loaded secret key:', process.env.PAYSTACK_SECRET_KEY ? 'YES (first 10 chars: ' + process.env.PAYSTACK_SECRET_KEY.substring(0,10) + '...)' : '❌ NOT LOADED');

const express = require('express');
const cors = require('cors');
const axios = require('axios');

const app = express();
app.use(cors());
app.use(express.json());

// Paystack Secret Key
const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY;

// ============ NIGERIAN BILL SERVICES (Add this BEFORE billProviders) ==========
const NIGERIAN_BILL_SERVICES = {
    electricity: {
        'abuja': { name: 'Abuja Electric (AEDC)', serviceId: 'ABUJA-ELECTRIC' },
        'eko': { name: 'Eko Electric', serviceId: 'EKO-ELECTRIC' },
        'ikeja': { name: 'Ikeja Electric', serviceId: 'IKEJA-ELECTRIC' },
        'ibadan': { name: 'Ibadan Electric', serviceId: 'IBADAN-ELECTRIC' },
        'portharcourt': { name: 'PH Electric (PHED)', serviceId: 'PHED-ELECTRIC' },
        'benin': { name: 'Benin Electric (BEDC)', serviceId: 'BENIN-ELECTRIC' },
        'enugu': { name: 'Enugu Electric (EEDC)', serviceId: 'ENUGU-ELECTRIC' },
        'kaduna': { name: 'Kaduna Electric (KAEDCO)', serviceId: 'KADUNA-ELECTRIC' },
        'jos': { name: 'Jos Electric (JED)', serviceId: 'JOS-ELECTRIC' }
    },
    airtime: {
        'mtn': { name: 'MTN Nigeria', serviceId: 'MTN-AIRTIME' },
        'glo': { name: 'GLO Nigeria', serviceId: 'GLO-AIRTIME' },
        'airtel': { name: 'Airtel Nigeria', serviceId: 'AIRTEL-AIRTIME' },
        '9mobile': { name: '9mobile Nigeria', serviceId: '9MOBILE-AIRTIME' }
    },
    cabletv: {
        'dstv': { name: 'DStv', serviceId: 'DSTV-SUBSCRIPTION' },
        'gotv': { name: 'GOtv', serviceId: 'GOTV-SUBSCRIPTION' },
        'startimes': { name: 'StarTimes', serviceId: 'STARTIMES-SUBSCRIPTION' },
        'showmax': { name: 'Showmax', serviceId: 'SHOWMAX-SUBSCRIPTION' }
    },
    internet: {
        'mtn': { name: 'MTN Data', serviceId: 'MTN-DATA' },
        'glo': { name: 'GLO Data', serviceId: 'GLO-DATA' },
        'airtel': { name: 'Airtel Data', serviceId: 'AIRTEL-DATA' },
        '9mobile': { name: '9mobile Data', serviceId: '9MOBILE-DATA' },
        'spectranet': { name: 'Spectranet', serviceId: 'SPECTRANET-DATA' },
        'smile': { name: 'Smile', serviceId: 'SMILE-DATA' }
    }
};

// ============ EMAIL CONFIGURATION (Optional) ============
let emailTransporter = null;
try {
    const nodemailer = require('nodemailer');
    emailTransporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
            user: process.env.EMAIL_USER || '',
            pass: process.env.EMAIL_PASS || ''
        }
    });
    console.log('📧 Email service initialized');
} catch (error) {
    console.log('⚠️ Email service not available (nodemailer not installed)');
}

// ============ SEND EMAIL NOTIFICATION FUNCTION ============
async function sendEmailNotification(recipientEmail, recipientName, amount, senderName, reference, type = 'credit', additionalData = {}) {
    if (!emailTransporter) {
        console.log('⚠️ Email skipped - no email transporter');
        return false;
    }
    
    try {
        const isCredit = type === 'credit';
        const subject = isCredit 
            ? `💰 You received ${formatNaira(amount)} from ${senderName}`
            : `💸 You sent ${formatNaira(amount)} to ${recipientName}`;
        
        const mailOptions = {
            from: `"FluxPay" <${process.env.EMAIL_USER || 'fluxpay@example.com'}>`,
            to: recipientEmail,
            subject: subject,
            html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px;">
                    <h2 style="color: #7c3aed;">⚡ FluxPay Transaction</h2>
                    <p>Hello ${recipientName},</p>
                    <h3 style="color: ${isCredit ? '#10b981' : '#ef4444'};">${formatNaira(amount)}</h3>
                    <p><strong>Reference:</strong> ${reference}</p>
                    <p><strong>Date:</strong> ${new Date().toLocaleString()}</p>
                    <p><strong>Status:</strong> Completed</p>
                    <hr>
                    <p style="font-size: 12px; color: #666;">FluxPay - Secure Digital Banking</p>
                </div>
            `
        };
        
        const result = await emailTransporter.sendMail(mailOptions);
        console.log(`✅ Email sent to ${recipientEmail}`);
        return true;
    } catch (error) {
        console.error('❌ Email error:', error.message);
        return false;
    }
}

// ============ SEND NOTIFICATION ENDPOINT ============
app.post('/api/notify/transaction', async (req, res) => {
    const { recipientEmail, recipientName, amount, senderName, transactionRef, type } = req.body;
    
    console.log(`📧 Sending email notification to ${recipientEmail}`);
    
    try {
        const emailSent = await sendEmailNotification(
            recipientEmail, recipientName, amount, senderName, transactionRef, type || 'credit'
        );
        
        return res.json({
            status: true,
            message: emailSent ? 'Email notification sent' : 'Email failed, but transaction completed',
            emailSent: emailSent
        });
    } catch (error) {
        console.error('❌ Notification error:', error);
        return res.status(500).json({
            status: false,
            message: 'Failed to send notification'
        });
    }
});

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
                amount: amount * 100,
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

// ============ WEBHOOK ============
app.post('/api/paystack/webhook', (req, res) => {
    const event = req.body;
    console.log('📨 Webhook received:', event.event);
    res.sendStatus(200);
});

// ============ GET BILL SERVICE ID ============
app.get('/api/paystack/bill/service/:category/:provider', (req, res) => {
    const { category, provider } = req.params;
    const service = NIGERIAN_BILL_SERVICES[category]?.[provider];
    
    if (service) {
        res.json({ status: true, data: service });
    } else {
        res.status(404).json({ status: false, message: 'Service not found' });
    }
});

// ============ PAYSTACK BILL VALIDATION ============
app.post('/api/paystack/bill/validate', async (req, res) => {
    const { serviceId, billerCode, variationCode, amount } = req.body;
    
    console.log(`🔍 Validating bill: Service: ${serviceId}, Biller: ${billerCode}, Amount: ${amount}`);
    
    if (!serviceId || !billerCode) {
        return res.status(400).json({
            status: false,
            message: 'Service ID and biller code are required'
        });
    }
    
    try {
        const requestBody = {
            service_id: serviceId,
            biller_code: billerCode,
            amount: amount ? amount * 100 : 10000
        };
        
        if (variationCode) {
            requestBody.variation_code = variationCode;
        }
        
        console.log('📤 Paystack validation request:', JSON.stringify(requestBody, null, 2));
        
        const response = await axios.post(
            'https://api.paystack.co/bill/validate',
            requestBody,
            {
                headers: {
                    Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
                    'Content-Type': 'application/json'
                }
            }
        );
        
        console.log('📥 Paystack validation response:', JSON.stringify(response.data, null, 2));
        
        if (response.data.status) {
            return res.json({
                status: true,
                data: {
                    customer_name: response.data.data.customer_name || 'Customer',
                    customer_address: response.data.data.customer_address || 'N/A',
                    amount_due: response.data.data.amount ? response.data.data.amount / 100 : amount,
                    due_date: response.data.data.due_date || null
                }
            });
        } else {
            return res.status(400).json({
                status: false,
                message: response.data.message || 'Validation failed. Please check the meter number.'
            });
        }
    } catch (error) {
        console.error('❌ Paystack validation error:', error.response?.data || error.message);
        
        // Check if it's a 404 - means service not available
        if (error.response?.status === 404) {
            return res.status(404).json({
                status: false,
                message: 'Bill payment service not available. Please contact support to enable bill payments on your Paystack account.'
            });
        }
        
        return res.status(500).json({
            status: false,
            message: error.response?.data?.message || 'Network error. Please try again.'
        });
    }
});

// ============ PROCESS BILL PAYMENT ============
app.post('/api/paystack/bill/pay', async (req, res) => {
    const { serviceId, billerCode, variationCode, amount, customerId, metadata } = req.body;
    
    console.log(`💸 Processing bill payment: Service: ${serviceId}, Biller: ${billerCode}, Amount: ${amount}`);
    
    if (!serviceId || !billerCode || !amount) {
        return res.status(400).json({
            status: false,
            message: 'Service ID, biller code, and amount are required'
        });
    }
    
    try {
        const requestBody = {
            service_id: serviceId,
            biller_code: billerCode,
            amount: amount * 100,
            subscriber_id: customerId || billerCode
        };
        
        if (variationCode) {
            requestBody.variation_code = variationCode;
        }
        
        if (metadata) {
            requestBody.metadata = metadata;
        }
        
        console.log('📤 Paystack payment request:', JSON.stringify(requestBody, null, 2));
        
        const response = await axios.post(
            'https://api.paystack.co/bill/pay',
            requestBody,
            {
                headers: {
                    Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
                    'Content-Type': 'application/json'
                }
            }
        );
        
        console.log('📥 Paystack payment response:', JSON.stringify(response.data, null, 2));
        
        if (response.data.status) {
            return res.json({
                status: true,
                data: {
                    reference: response.data.data.reference,
                    transaction_id: response.data.data.transaction_id,
                    amount: response.data.data.amount / 100,
                    customer_name: response.data.data.customer_name
                }
            });
        } else {
            return res.status(400).json({
                status: false,
                message: response.data.message || 'Payment failed'
            });
        }
    } catch (error) {
        console.error('❌ Paystack payment error:', error.response?.data || error.message);
        
        if (error.response?.status === 404) {
            return res.status(404).json({
                status: false,
                message: 'Bill payment service not available. Please contact support to enable bill payments on your Paystack account.'
            });
        }
        
        return res.status(500).json({
            status: false,
            message: error.response?.data?.message || 'Payment processing failed'
        });
    }
});

function formatNaira(amount) {
    return new Intl.NumberFormat('en-NG', { 
        style: 'currency', 
        currency: 'NGN', 
        minimumFractionDigits: 2 
    }).format(amount);
}

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
    console.log(`   POST /api/paystack/webhook`);
    console.log(`   POST /api/notify/transaction`);
    console.log(`   GET  /api/paystack/bill/service/:category/:provider`);
    console.log(`   POST /api/paystack/bill/validate`);
    console.log(`   POST /api/paystack/bill/pay\n`);
});
