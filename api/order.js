export const config = {
  api: {
    bodyParser: false
  }
};

import nodemailer from 'nodemailer';
import formidable from 'formidable';
import fs from 'fs';

// Helper to read a field safely as a string (formidable can return arrays)
function val(fields, key) {
  const v = fields?.[key];
  if (Array.isArray(v)) return v[0] ?? '';
  if (v === undefined || v === null) return '';
  return typeof v === 'string' ? v : String(v);
}

function buildItemLines(fields) {
  const lines = [];
  const count = Math.min(Number(val(fields, 'item_count') || 0) || 0, 100);
  const max = Math.max(count, 30);
  for (let i = 1; i <= max; i++) {
    const p = val(fields, `item${i}_product`);
    const price = val(fields, `item${i}_price`);
    const opts = val(fields, `item${i}_options`);
    const files = val(fields, `item${i}_files`);
    if (!p && !price && !opts && !files) {
      lines.push(`${i})`);
      continue;
    }
    lines.push(`${i}) ${p || ''} — ${price || ''} — ${opts || ''} — Files: ${files || ''}`);
  }
  return lines.join('\n');
}

function buildBody(fields) {
  const name = val(fields, 'customer_name');
  const phone = val(fields, 'customer_phone');
  const instagram = val(fields, 'customer_instagram');
  const email = val(fields, 'customer_email');
  const method = val(fields, 'delivery_method');
  const notes = val(fields, 'delivery_notes');
  const orderSummary = val(fields, 'order_summary');
  const orderTotal = val(fields, 'order_total');
  const itemCount = val(fields, 'item_count');
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
  const name = val(fields, 'customer_name') || 'Customer';
  const itemCount = val(fields, 'item_count') || '0';
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

    const toEmail = (val(fields, 'to_email') || process.env.ORDER_TO_EMAIL || 'Sewarselawi133@gmail.com').toString();
    const replyTo = (val(fields, 'customer-email') || val(fields, 'customer_email') || '').toString();

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

    // Group attachments by item index from filename like: itemN-...
    const groups = {};
    const counters = {};
    attachments.forEach((att) => {
      const m = /^item(\d+)-/i.exec(att.filename || '');
      const key = m ? m[1] : 'misc';
      counters[key] = (counters[key] || 0) + 1;
      att.cid = `img-${key}-${counters[key]}`; // use as inline cid in HTML
      (groups[key] ||= []).push(att);
    });

    const subject = buildSubject(fields);
    const text = buildBody(fields);
    // Build HTML so each image appears under its item number
    const totalItems = Math.max(30, Number(val(fields, 'item_count') || 0) || 0);
    let html = '<div style="font-family:system-ui,Segoe UI,Arial,sans-serif;white-space:pre-wrap">';
    html += `<h2 style=\"margin:0 0 8px\">New order received</h2>`;
    html += `<p><strong>Customer</strong><br>` +
            `Name: ${val(fields,'customer_name')}<br>` +
            `Phone: ${val(fields,'customer_phone')}<br>` +
            `Instagram: ${val(fields,'customer_instagram')}<br>` +
            `Email: ${val(fields,'customer_email')}</p>`;
    html += `<p><strong>Delivery</strong><br>` +
            `Method: ${val(fields,'delivery_method')}<br>` +
            `Notes: ${val(fields,'delivery_notes')}</p>`;
    html += `<p><strong>Quick Summary</strong><br>${String(val(fields,'order_summary') || '').replace(/\r?\n/g,'<br>')}</p>`;
    html += `<p><strong>Totals</strong><br>` +
            `Order total: ${val(fields,'order_total')}<br>` +
            `Item count: ${val(fields,'item_count')}</p>`;
    html += '<hr style="border:none;border-top:1px solid #ddd;margin:12px 0">';
    html += '<h3 style="margin:8px 0">Item Details</h3>';
    for (let i = 1; i <= totalItems; i++) {
      const p = val(fields, `item${i}_product`);
      const price = val(fields, `item${i}_price`);
      const opts = val(fields, `item${i}_options`);
      const files = val(fields, `item${i}_files`);
      html += `<div style=\"margin:10px 0 14px\">`;
      html += `<div style=\"font-weight:700\">${i}) ${p} — ${price}</div>`;
      if (opts) html += `<div style=\"color:#444;margin-top:2px\">${opts}</div>`;
      if (files) html += `<div style=\"color:#666;margin-top:2px\">Files: ${files}</div>`;
      const list = groups[String(i)] || [];
      list.forEach((att) => {
        html += `<div style=\"margin:8px 0 2px;font-weight:600\">Image for item ${i}</div>`;
        html += `<img src=\"cid:${att.cid}\" alt=\"item ${i}\" style=\"max-width:520px;border:1px solid #eee;border-radius:8px;display:block\">`;
      });
      html += `</div>`;
    }
    if (groups['misc']?.length) {
      html += '<h3>Other Files</h3>';
      groups['misc'].forEach((att) => {
        html += `<div style=\"margin:8px 0 2px;font-weight:600\">File</div>`;
        html += `<img src=\"cid:${att.cid}\" alt=\"file\" style=\"max-width:520px;border:1px solid #eee;border-radius:8px;display:block\">`;
      });
    }
    html += '</div>';

    const transporter = getTransport();
    const fromName = process.env.MAIL_FROM_NAME || 'Siora Art';
    const fromEmail = process.env.MAIL_FROM_EMAIL || process.env.SMTP_USER;
    const from = `${fromName} <${fromEmail}>`;

    await transporter.sendMail({
      from,
      to: toEmail,
      subject,
      text,
      html,
      attachments,
      replyTo: replyTo || undefined
    });

    res.status(200).json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message || 'send failed' });
  }
}
