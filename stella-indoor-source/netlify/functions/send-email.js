/**
 * Netlify Function: Send transactional email via Brevo (formerly Sendinblue)
 *
 * Endpoint: POST /.netlify/functions/send-email
 * Body: { toEmail, toName, subject, message, ...bookingDetails }
 *
 * Setup:
 * 1. Sign up at https://app.brevo.com (free, 300 emails/day)
 * 2. Get API key: SMTP & API → API Keys → Create new key
 * 3. In Netlify dashboard → Site settings → Environment variables
 * 4. Add: BREVO_API_KEY = your-api-key
 * 5. Optional: ALLOWED_ORIGINS = https://stellaindoor.netlify.app,https://admin.yoursite.com
 */

const BREVO_API_URL = 'https://api.brevo.com/v3/smtp/email';
const SENDER = { email: 'stellasportshub@gmail.com', name: 'Stella Indoor Sports Hub' };

// Allowed origins: configure via ALLOWED_ORIGINS env var (comma-separated).
// Defaults to the known Stella Indoor Netlify site + local development.
function getAllowedOrigins() {
  const env = process.env.ALLOWED_ORIGINS;
  if (env) return env.split(',').map((o) => o.trim()).filter(Boolean);
  return [
    'https://stellaindoor.netlify.app',
    'http://localhost:5173',
    'http://localhost:4173',
    'http://127.0.0.1:5173',
    'http://127.0.0.1:4173',
  ];
}

function getCorsHeaders(origin) {
  const allowed = getAllowedOrigins();
  const allowOrigin = allowed.includes(origin) ? origin : allowed[0];
  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json',
  };
}

exports.handler = async (event) => {
  const origin = event.headers.origin || event.headers.Origin || '';
  const CORS_HEADERS = getCorsHeaders(origin);

  // Handle CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: CORS_HEADERS, body: '' };
  }

  // Only accept POST
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  // Check Brevo API key
  const apiKey = process.env.BREVO_API_KEY;
  if (!apiKey) {
    console.error('[send-email] BREVO_API_KEY not set');
    return {
      statusCode: 500,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: 'Server config error: BREVO_API_KEY not set' }),
    };
  }

  // Parse body
  let data;
  try {
    data = JSON.parse(event.body);
  } catch {
    return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Invalid JSON' }) };
  }

  const { toEmail, toName, subject, message, bookingRef, courtName, bookingDate, startTime, endTime, duration, totalPrice, clientName, clientPhone, teamName, soccerBall, bibs, addonsList } = data;

  if (!toEmail || !subject) {
    return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Missing toEmail or subject' }) };
  }

  // Build HTML email
  const htmlContent = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8">
<style>
body{font-family:Arial,sans-serif;background:#f5f5f5;margin:0;padding:20px}
.container{max-width:600px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 10px rgba(0,0,0,0.1)}
.header{background:#1B7A40;color:#fff;padding:30px;text-align:center}
.header h1{margin:0;font-size:22px}
.content{padding:30px}
.content p{line-height:1.6;color:#333}
.details{background:#f9f9f9;border-radius:8px;padding:20px;margin:20px 0}
.details table{width:100%;border-collapse:collapse}
.details td{padding:10px 0;border-bottom:1px solid #eee}
.details td:first-child{font-weight:bold;color:#555;width:40%}
.footer{background:#1a1a1a;color:#888;padding:20px;text-align:center;font-size:12px}
</style>
</head>
<body>
<div class="container">
  <div class="header"><h1>Stella Indoor Sports Hub</h1></div>
  <div class="content">
    <p>Dear ${toName || clientName || 'Valued Client'},</p>
    <p>${message || ''}</p>
    <div class="details">
      <table>
        <tr><td>Booking Reference</td><td>${bookingRef || 'N/A'}</td></tr>
        <tr><td>Court</td><td>${courtName || 'N/A'}</td></tr>
        <tr><td>Date</td><td>${bookingDate || 'N/A'}</td></tr>
        <tr><td>Time</td><td>${startTime || 'N/A'} - ${endTime || 'N/A'}</td></tr>
        <tr><td>Duration</td><td>${duration || 'N/A'}</td></tr>
        <tr><td>Total Price</td><td>${totalPrice || 'N/A'}</td></tr>
        <tr><td>Client</td><td>${clientName || 'N/A'}</td></tr>
        <tr><td>Phone</td><td>${clientPhone || 'N/A'}</td></tr>
        <tr><td>Team</td><td>${teamName || 'N/A'}</td></tr>
        <tr><td>Soccer Balls</td><td>${soccerBall || 'No'}</td></tr>
        <tr><td>Bibs</td><td>${bibs || 'No'}</td></tr>
        <tr><td>Add-ons</td><td>${addonsList || 'None'}</td></tr>
      </table>
    </div>
    <p><em>Please present this email as proof of your booking upon arrival. Payment is due at the venue.</em></p>
  </div>
  <div class="footer"><strong>Stella Indoor Sports Hub</strong><br>39 Ruth First Road, Durban, 4001</div>
</div>
</body>
</html>`;

  try {
    const response = await fetch(BREVO_API_URL, {
      method: 'POST',
      headers: { 'accept': 'application/json', 'api-key': apiKey, 'content-type': 'application/json' },
      body: JSON.stringify({
        sender: SENDER,
        to: [{ email: toEmail, name: toName || clientName || toEmail }],
        subject: subject,
        htmlContent: htmlContent,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[send-email] Brevo HTTP ${response.status}: ${errorText}`);
      return { statusCode: 502, headers: CORS_HEADERS, body: JSON.stringify({ error: `Brevo error ${response.status}: ${errorText}` }) };
    }

    const result = await response.json();
    console.log(`[send-email] Sent to ${toEmail}, msgId: ${result.messageId}`);
    return { statusCode: 200, headers: CORS_HEADERS, body: JSON.stringify({ success: true, messageId: result.messageId }) };

  } catch (err) {
    console.error('[send-email] Exception:', err.message);
    return { statusCode: 500, headers: CORS_HEADERS, body: JSON.stringify({ error: err.message }) };
  }
};
