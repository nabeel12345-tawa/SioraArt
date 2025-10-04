export const config = {
  api: {
    bodyParser: false
  }
};

import nodemailer from 'nodemailer';
import formidable from 'formidable';
import fs from 'fs';

function buildItemLines(fields) {
  const lines = [];
  const count = Math.min(Number(fields.item_count || 0) || 0, 50);
  const max = Math.max(count, 10);
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

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ ok: false, error: 'Method Not Allowed' });
    return;
  }

  const form = formidable({ multiples: true, keepExtensions: true });

  try {
    const { fields, files } = await new Promise((resolve, reject) => {
      form.parse(req, (err, flds, fls) => (err ? reject(err) : resolve({ fields: flds, files: fls })));
    });

    const toEmail = (fields.to_email || process.env.ORDER_TO_EMAIL || 'Sewarselawi133@gmail.com').toString();
    const replyTo = (fields['customer-email'] || fields.customer_email || '').toString();

    // Normalize attachments: accept my_file, files[], or any file field
    const fileCandidates = [];
    const pushMaybe = (v) => { if (!v) return; if (Array.isArray(v)) v.forEach(pushMaybe); else fileCandidates.push(v); };
    pushMaybe(files['my_file']);
    pushMaybe(files['files[]']);
    Object.values(files || {}).forEach(pushMaybe);

    const attachments = fileCandidates.filter(Boolean).map((f) => ({
      filename: f.originalFilename || f.newFilename || (f.filepath ? f.filepath.split('/').pop() : 'attachment'),
      content: fs.readFileSync(f.filepath),
      contentType: f.mimetype || undefined
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

    res.status(200).json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message || 'send failed' });
  }
}

