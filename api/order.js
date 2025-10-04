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
  const count = Math.min(Number(fields.item_count || 0) || 0, 100);
  const max = Math.max(count, 30);
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
    const totalItems = Math.max(30, Number(fields.item_count || 0) || 0);
    let html = '<div style="font-family:system-ui,Segoe UI,Arial,sans-serif;white-space:pre-wrap">';
    html += `<h2 style=\"margin:0 0 8px\">New order received</h2>`;
    html += `<p><strong>Customer</strong><br>` +
            `Name: ${fields.customer_name || ''}<br>` +
            `Phone: ${fields.customer_phone || ''}<br>` +
            `Instagram: ${fields.customer_instagram || ''}<br>` +
            `Email: ${fields.customer_email || ''}</p>`;
    html += `<p><strong>Delivery</strong><br>` +
            `Method: ${fields.delivery_method || ''}<br>` +
            `Notes: ${fields.delivery_notes || ''}</p>`;
    html += `<p><strong>Quick Summary</strong><br>${(fields.order_summary || '').replace(/\n/g,'<br>')}</p>`;
    html += `<p><strong>Totals</strong><br>` +
            `Order total: ${fields.order_total || ''}<br>` +
            `Item count: ${fields.item_count || ''}</p>`;
    html += '<hr style="border:none;border-top:1px solid #ddd;margin:12px 0">';
    html += '<h3 style="margin:8px 0">Item Details</h3>';
    for (let i = 1; i <= totalItems; i++) {
      const p = fields[`item${i}_product`] || '';
      const price = fields[`item${i}_price`] || '';
      const opts = fields[`item${i}_options`] || '';
      const files = fields[`item${i}_files`] || '';
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
