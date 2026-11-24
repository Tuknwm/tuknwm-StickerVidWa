import { prepareWAMessageMedia, downloadContentFromMessage, MEDIA_PATH_MAP } from '@whiskeysockets/baileys';
import { randomBytes } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { writeFile, readFile, rm, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const run = promisify(execFile);
const MAX_SEC = 10; // batas resmi stiker animasi WA; video lebih panjang dipotong, lebih pendek dipakai apa adanya
const MAX_BYTES = 500 * 1024; // batas ukuran stiker animasi WA
const STEPS = [[12, 40], [10, 30], [8, 20], [6, 10]]; // [fps, kualitas]: diturunkan bertahap sampai muat
// voice note asli diunggah sebagai ptt (CDN t62.7117), Baileys cuma punya /mms/audio (t62.7114) dan suara stiker tidak mau bunyi
MEDIA_PATH_MAP.ptt ??= '/mms/ptt';
let patched = false;

const download = async (msg, type) => {
  const chunks = [];
  for await (const c of await downloadContentFromMessage(msg, type)) chunks.push(c);
  return Buffer.concat(chunks);
};

// video -> { webp: stiker animasi 512x512, ogg: suara opus ptt }
const fromVideo = async video => {
  const dir = await mkdtemp(join(tmpdir(), 'astk-'));
  try {
    const src = join(dir, 'in.mp4'), webp = join(dir, 'out.webp'), ogg = join(dir, 'out.ogg');
    await writeFile(src, await download(video, 'video'));
    let sticker;
    for (const [fps, q] of STEPS) {
      await run('ffmpeg', ['-y', '-i', src, '-t', MAX_SEC, '-an', '-vf',
        `fps=${fps},scale=512:512:force_original_aspect_ratio=decrease,format=rgba,pad=512:512:-1:-1:color=0x00000000`,
        '-c:v', 'libwebp', '-loop', '0', '-q:v', q, '-preset', 'default', webp]);
      sticker = await readFile(webp);
      if (sticker.length <= MAX_BYTES) break;
    }
    if (sticker.length > MAX_BYTES) throw new Error('Video terlalu ramai, stiker tetap lebih dari 500KB. Coba video yang lebih pendek.');
    // suara stiker WA cuma mau bunyi kalau formatnya seperti voice note asli: opus mono 16 kHz ~16 kbps
    await run('ffmpeg', ['-y', '-i', src, '-t', MAX_SEC, '-vn', '-ac', '1', '-ar', '16000', '-c:a', 'libopus', '-b:a', '16k', '-application', 'voip', ogg])
      .catch(() => { throw new Error('Video tidak ada suaranya.'); });
    // waveform 64 batang (0-100) seperti voice note asli WA
    const { stdout } = await run('ffmpeg', ['-i', ogg, '-ac', '1', '-ar', '8000', '-f', 's16le', '-'], { encoding: 'buffer', maxBuffer: 1 << 26 });
    const pcm = new Int16Array(stdout.buffer, stdout.byteOffset, stdout.length >> 1);
    const block = Math.max(1, Math.floor(pcm.length / 64));
    const bars = Array.from({ length: 64 }, (_, i) => {
      let sum = 0;
      for (let j = i * block; j < (i + 1) * block && j < pcm.length; j++) sum += Math.abs(pcm[j]);
      return sum / block;
    });
    const peak = Math.max(...bars) || 1;
    const waveform = Uint8Array.from(bars, b => Math.round((b / peak) * 100));
    return { webp: sticker, ogg: await readFile(ogg), waveform };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
};

export default {
  name: ['yusrogtg', 'audiosticker', 'figurinhasom'],
  description: 'Yusro GTG - Membuat stiker dengan audio.',
  run: async ({ subaru, m }) => {
    try {
      const video = m.quoted?.videoMessage;
      let audio = m.quoted?.audioMessage;
      let sticker = { url: './database/imgs/rfig.webp' };

      if (!audio && !video) {
        return m.reply(
          'Reply *video* atau audio *ptt true* untuk membuat stiker audio.\n\nSource: Yusro GTG'
        );
      }

      if (video) {
        const { webp, ogg, waveform } = await fromVideo(video);
        sticker = webp;
        audio = (await prepareWAMessageMedia(
          { audio: ogg, ptt: true, mimetype: 'audio/ogg; codecs=opus', waveform, seconds: Math.min(video.seconds || MAX_SEC, MAX_SEC) },
          { upload: (file, opts) => subaru.waUploadToServer(file, { ...opts, mediaType: 'ptt' }) },
        )).audioMessage;
      }

      for (const [src, animated] of [[sticker, !!video]]) {
        const p = await prepareWAMessageMedia(
          { sticker: src },
          { upload: subaru.waUploadToServer },
        );
        if (animated) p.stickerMessage.isAnimated = true;

        const M = p.constructor;

        // patch sekali saja; kalau diulang tiap command, field audio ikut ter-encode berkali-kali
        if (!patched) {
          patched = true;
          [
            [M, 'audioStickerMessage', 1074, M.FutureProofMessage],
            [M.StickerMessage, 'audioMessage', 210, M.AudioMessage],
          ].forEach(([type, field, tag, schema]) => {
            type.encode = (encode => (message, writer) =>
              message[field]
                ? schema
                    .encode(
                      message[field],
                      encode(message, writer).uint32(tag).fork(),
                    )
                    .ldelim()
                : encode(message, writer))(type.encode);
          });
        }

        p.stickerMessage.audioMessage = audio;

        await subaru.relayMessage(
          m.from,
          {
            __proto__: p,
            audioStickerMessage: {
              message: p,
            },
            messageContextInfo: {
              messageSecret: randomBytes(32),
            },
          },
          {},
        );
      }

    } catch (error) {
      console.error('[YUSRO GTG] Error audiosticker:', error);
      await m.reply(String(error));
    }
  },
};
