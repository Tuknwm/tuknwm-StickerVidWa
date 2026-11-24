import makeWASocket, { useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } from '@whiskeysockets/baileys';
import pino from 'pino';
import { readdirSync } from 'node:fs';

const PHONE = '628xxxxxxxxxx'; // nomor bot: kode negara + angka saja, tanpa + atau spasi
const PREFIX = /^[.!#/]/;

// load plugins/*.js -> map of command name -> plugin
const commands = new Map();
for (const f of readdirSync('./plugins').filter(f => f.endsWith('.js'))) {
  const plugin = (await import(`./plugins/${f}`)).default;
  for (const n of plugin.name) commands.set(n, plugin);
}

async function start() {
  const { state, saveCreds } = await useMultiFileAuthState('./session');
  const { version } = await fetchLatestBaileysVersion();
  const subaru = makeWASocket({ version, auth: state, logger: pino({ level: 'silent' }) });

  subaru.ev.on('creds.update', saveCreds);

  if (!subaru.authState.creds.registered) {
    setTimeout(async () => {
      const code = await subaru.requestPairingCode(PHONE);
      console.log(`\nKode pairing: ${code}\nWA > Perangkat tertaut > Tautkan dengan nomor telepon\n`);
    }, 3000);
  }

  subaru.ev.on('connection.update', ({ connection, lastDisconnect }) => {
    if (connection === 'open') console.log('Bot tersambung.');
    if (connection === 'close') {
      const code = lastDisconnect?.error?.output?.statusCode;
      if (code === DisconnectReason.loggedOut) return console.log('Logout. Hapus folder session lalu jalankan ulang.');
      start();
    }
  });

  subaru.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;
    for (const msg of messages) {
      const c = msg.message;
      if (!c) continue;
      const text = c.conversation || c.extendedTextMessage?.text || c.imageMessage?.caption || c.videoMessage?.caption || '';
      if (!PREFIX.test(text)) continue;
      const plugin = commands.get(text.slice(1).trim().split(/\s+/)[0].toLowerCase());
      if (!plugin) continue;

      const from = msg.key.remoteJid;
      const m = {
        from,
        text,
        quoted: c.extendedTextMessage?.contextInfo?.quotedMessage,
        reply: t => subaru.sendMessage(from, { text: t }, { quoted: msg }),
      };
      await plugin.run({ subaru, m }).catch(e => console.error(e));
    }
  });
}

start();
