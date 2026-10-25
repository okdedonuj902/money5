// Vercel Serverless Function：每月提醒信
// 由 Vercel Cron 每天早上 9 點（台灣）呼叫一次，符合設定日期才寄信
const admin = require("firebase-admin");
const nodemailer = require("nodemailer");

const ALLOWED = ["okdedonuj@gmail.com", "tobyyang20@gmail.com"];

function getAdmin() {
  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)),
    });
  }
  return admin;
}

async function sendMail(items, subject) {
  const to = (process.env.REMINDER_TO || ALLOWED.join(",")).split(",").map(s => s.trim()).filter(Boolean);
  const appUrl = process.env.APP_URL || "";
  const list = items.map(i => `<li style="margin:6px 0">${i}</li>`).join("");
  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD },
  });
  await transporter.sendMail({
    from: `"Toby and Yvette 的理財幫手" <${process.env.GMAIL_USER}>`,
    to: to.join(","),
    subject,
    html: `<div style="font-family:sans-serif;color:#4A4035;line-height:1.7">
      <p>嗨～這個月記得到理財幫手輸入：</p>
      <ul>${list}</ul>
      ${appUrl ? `<p><a href="${appUrl}" style="color:#7C9E87;font-weight:bold">👉 打開理財幫手</a></p>` : ""}
      <p style="color:#9A9080;font-size:12px">這是系統每月自動寄出的提醒信。</p></div>`,
  });
}

// 兩種提醒：收入＋信用卡帳單（預設每月 5 號）、存款（預設每月最後一天，day=0 代表月底）
const RULES = [
  { key: "bills", dayField: "billsDay", defDay: 5, sentField: "lastSentBills",
    items: ["收入", "信用卡帳單"], subject: "❤️ 理財幫手提醒：請輸入本月收入與信用卡帳單" },
  { key: "savings", dayField: "savingsDay", defDay: 0, sentField: "lastSentSavings",
    items: ["存款"], subject: "❤️ 理財幫手提醒：請輸入本月存款" },
];

module.exports = async (req, res) => {
  try {
    const fb = getAdmin();
    const db = fb.firestore();
    const ref = db.doc("settings/reminder");
    const cfg = (await ref.get()).data() || {};

    // 手動「寄測試信」：用登入者的 Firebase 身分驗證
    if (req.query.test) {
      const m = (req.headers.authorization || "").match(/^Bearer (.+)$/);
      if (!m) return res.status(401).json({ error: "未登入" });
      const dec = await fb.auth().verifyIdToken(m[1]);
      if (!ALLOWED.includes((dec.email || "").toLowerCase())) return res.status(403).json({ error: "沒有權限" });
      await sendMail(["收入", "信用卡帳單", "存款"], "❤️ 理財幫手提醒（測試信）");
      return res.status(200).json({ ok: true });
    }

    // 排程呼叫：驗證 Vercel Cron 密碼
    if (process.env.CRON_SECRET && req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
      return res.status(401).json({ error: "unauthorized" });
    }
    if (!cfg.enabled) return res.status(200).json({ skipped: "disabled" });

    const tw = new Date(Date.now() + 8 * 3600 * 1000); // 台灣時間
    const y = tw.getUTCFullYear(), mo = tw.getUTCMonth(), d = tw.getUTCDate();
    const lastDay = new Date(Date.UTC(y, mo + 1, 0)).getUTCDate();
    const ym = `${y}-${String(mo + 1).padStart(2, "0")}`;
    const sent = [], skipped = [];
    for (const r of RULES) {
      const day = cfg[r.dayField] ?? r.defDay;
      const target = day === 0 ? lastDay : Math.min(day, lastDay);
      if (d !== target) { skipped.push(`${r.key}: not today`); continue; }
      if (cfg[r.sentField] === ym) { skipped.push(`${r.key}: already sent`); continue; }
      await sendMail(r.items, r.subject);
      await ref.set({ [r.sentField]: ym }, { merge: true });
      sent.push(r.key);
    }
    return res.status(200).json({ ok: true, sent, skipped });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: e.message });
  }
};
