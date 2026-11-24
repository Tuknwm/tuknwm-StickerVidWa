# Video to Sticker + sound

A WhatsApp bot that turns a video into a **sticker with sound**.

## Requirements

- Node.js 20+
- [ffmpeg](https://ffmpeg.org/) on your `PATH` (with `libwebp` and `libopus`)

## Setup

1. Install ffmpeg. It is a separate program and is **not** installed by `npm install`.

   | OS | Command |
   |---|---|
   | Windows | `winget install ffmpeg` |
   | Ubuntu / Debian | `sudo apt install ffmpeg` |
   | macOS | `brew install ffmpeg` |

   Check it works from any folder (restart the terminal after installing):

   ```bash
   ffmpeg -version
   ```

   Without ffmpeg the bot still logs in, but replying to a video returns an error.

2. Install the Node packages: Go to the folder, right click open terminal then

   ```bash
   npm install
   ```

3. If done, Set your bot's phone number (country code, digits only) in `index.js`:

   ```js
   const PHONE = '62xxxxxxxxxxx';
   ```

## Run
Still in the terminal then type
```bash
npm start
```

On first run the terminal prints a **pairing code**. On the bot's phone open
WhatsApp → **Linked devices** → **Link a device** → **Link with phone number instead**, then enter the code.
Wait for `Bot tersambung.` (connected) before sending commands.

The login is saved in `session/`, so later restarts connect without pairing.
If `session/` is deleted, just pair again.

## Usage

Reply to a message with these commands :
```bash
.audiosticker
```
So first send a video into the bot or in grup and then replay it and type **.audiosticker**.
| Reply to | Result |
|---|---|
| Video | Animated sticker from the video, with its sound |


Video limits:

- Max **10 seconds**. Longer videos are cut to the first 10 seconds; shorter ones are used as-is.
- Stickers must stay under **500 KB**. The bot lowers frame rate and quality step by step until it fits, or replies with an error if it can't.
- The video must have audio.

## How it works

- ffmpeg converts the video to a 512×512 animated WebP and its audio to Opus mono 16 kHz ~16 kbps.
  WhatsApp only plays sticker sound when the audio matches its voice-note format.
- The audio is uploaded as a voice note with a generated waveform, then attached to the sticker
  through an unofficial `audioStickerMessage` protobuf field.

##

Audio sticker code credit: Yusro GTG. (i guess? i took it from randoom people)
