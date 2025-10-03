import express from 'express';
import multer from 'multer';
import dotenv from 'dotenv';
import cors from 'cors';
import nodemailer from 'nodemailer';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const app = express();
app.use(cors());

// Multer in-memory storage for attachments
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: Number(process.env.FILE_SIZE_LIMIT || 8 * 1024 * 1024) // 8MB per file default
  }
});

function buildItemLines(fields) {
  const lines = [];
  const count = Math.min(Number(fields.item_count || 0) || 0, 50);
  const max = Math.max(count, 10); // show at least 10 lines if placeholders exist
  for (let i = 1; i <= max; i++) {
    const p = fields[`item${i}_product`];
    const price = fields[`item${i}_price`];
    const opts = fields[`item${i}_options`];
    const files = fields[`item${i}_files`];
    if (!p && !price && !opts && !files) {
      lines.push(`${i})`);
      continue;
    }
    lines.push(`${i}) ${p || ''} — ${price || ''} — ${opts || ''} — Files: ${files || ''}`);
  }
  return lines.join('\n');
}

function buildBody(fields) {
  const name = fields.customer_name || '';
  const phone = fields.customer_phone || '';
  const instagram = fields.customer_instagram || '';
  const email = fields.customer_email || '';
  const method = fields.delivery_method || '';
  const notes = fields.delivery_notes || '';
  const orderSummary = fields.order_summary || '';
  const orderTotal = fields.order_total || '';
  const itemCount = fields.item_count || '';
  const itemDetails = buildItemLines(fields);

  return [
    'New order received.\n',
    'Customer',
    `- Name: ${name}`,
    `- Phone: ${phone}`,
    `- Instagram: ${instagram}`,
    `- Email: ${email}`,
    '',
    'Delivery',
    `- Method: ${method}`,
    `- Notes: ${notes}`,
    '',
    'Quick Summary',
    orderSummary,
    '',
    'Totals',
    `- Order total: ${orderTotal}`,
    `- Item count: ${itemCount}`,
    '',
    'Item Details',
    itemDetails
  ].join('\n');
}

function buildSubject(fields) {
  const name = fields.customer_name || 'Customer';
  const itemCount = fields.item_count || '0';
  return `New order — ${name} — Items: ${itemCount}`;
}

function getTransport() {
  const host = process.env.SMTP_HOST || 'smtp.gmail.com';
  const port = Number(process.env.SMTP_PORT || 465);
  const secure = String(process.env.SMTP_SECURE || 'true').toLowerCase() !== 'false';
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!user || !pass) {
    throw new Error('SMTP_USER/SMTP_PASS are not set');
  }
  return nodemailer.createTransport({ host, port, secure, auth: { user, pass } });
}

app.post('/api/order', upload.any(), async (req, res) => {
  try {
    // Convert fields to plain object of strings
    const fields = Object.fromEntries(
      Object.entries(req.body || {}).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v])
    );

    const toEmail = (fields.to_email || process.env.ORDER_TO_EMAIL || 'nabeel.moh.2008@gmail.com').toString();
    const replyTo = (fields.customer_email || '').toString();

    const attachments = (req.files || []).map((f) => ({
      filename: f.originalname || f.fieldname,
      content: f.buffer,
      contentType: f.mimetype
    }));

    const subject = buildSubject(fields);
    const text = buildBody(fields);

    const transporter = getTransport();
    const fromName = process.env.MAIL_FROM_NAME || 'Siora Art';
    const fromEmail = process.env.MAIL_FROM_EMAIL || process.env.SMTP_USER;
    const from = `${fromName} <${fromEmail}>`;

    await transporter.sendMail({
      from,
      to: toEmail,
      subject,
      text,
      attachments,
      replyTo: replyTo || undefined
    });

    res.json({ ok: true });
  } catch (err) {
    console.error('Send failed:', err);
    res.status(500).json({ ok: false, error: err.message || 'send failed' });
  }
});

const port = Number(process.env.PORT || 3001);
// Serve static site from project root so frontend and API share origin
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const webRoot = path.resolve(__dirname, '..');
app.use(express.static(webRoot));

// Fallback to index.html for non-API routes
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/')) return next();
  res.sendFile(path.join(webRoot, 'index.html'));
});

app.listen(port, () => {
  console.log(`Order mailer listening on http://localhost:${port}`);
});
