<img src="public/brand/byshoot-mark.png" width="48" height="48" alt="ByShoot">

# ByShoot

Capture a screenshot, add a note, and get back to work. A small desktop utility
built with Rust, Tauri and TypeScript using the system WebView.

[Download for Windows](https://github.com/bahadryalcn/byshoot/releases/latest) ·
[Report an issue](https://github.com/bahadryalcn/byshoot/issues)

## What it does

- Select an area across multiple monitors, including negative screen positions.
- Draw, highlight, add arrows and notes, number steps, or pixelate private details.
- Copy image pixels to the clipboard or save PNG/JPEG files.
- Record a selected monitor to MP4, optionally with an audio input, or record
  audio alone to WAV on Windows.
- Set global shortcuts, include the Windows cursor, remember a selected region,
  and start quietly in the system tray.
- Upload screenshots to your own HTTPS service after confirmation.

The application interface is Turkish; settings also support English. Screenshot
support is included for Windows and macOS. Prebuilt downloads currently target
Windows x64; macOS must be built on a Mac.

## Get started

Download and extract the Windows ZIP from Releases, then run `ByShoot.exe`.
Windows requires WebView2. Builds are unsigned, so Windows may show a publisher
warning. Closing the main window keeps ByShoot in the system tray; choose
**Çıkış** to quit.

Press **PrintScreen** or **Ctrl+Shift+S** to select an area. Draw or annotate,
then press **Ctrl+C** to copy or **Ctrl+S** to save. **Esc** cancels. Undo and
redo use **Ctrl+Z** and **Ctrl+Shift+Z**. On macOS, use **Cmd** instead of Ctrl;
the default capture shortcut is **Cmd+Shift+S**.

### Recording

Open **Kayıt**, choose **Ekran videosu** or **Yalnız ses**, select the monitor
and audio input, then choose **Kaydı başlat**. Stop with **Kaydı durdur** and
save with **Dosyaya kaydet**. A stop control stays available while navigating
other pages. Minimizing keeps recording active; quitting finalizes the file.

Recording needs FFmpeg on `PATH` with `gdigrab`, `dshow`, `libx264` and AAC
support. FFmpeg is not bundled or downloaded automatically. Screenshots do not
require it. Video can be silent; audio-only recording requires an input.
Computer playback audio requires a Stereo Mix or virtual audio input exposed
by Windows. Direct system loopback, mixing multiple inputs, cropped-region
recording and macOS recording are not supported.

Cancelling a save keeps the recording recoverable after restarting ByShoot.
After a successful save to another location, the current temporary recording
and its log are removed. Failed saves keep the recovery copy. Older recovery
files from previous versions are left untouched.

### Sharing and privacy

Screenshots and recordings stay local unless you explicitly upload a screenshot.
History stores operation metadata and paths or links, rather than screenshot
pixels. Settings, history and pending recordings live in the application's local
data directory. Startup is off by default.

Direct Prnt.sc upload is unavailable. You can copy/save an image or configure
your own HTTPS upload endpoint under **Ayarlar → Yükleme ve vekil sunucu**.
The endpoint receives a multipart `image` file and must return:

```json
{ "url": "https://example.com/share/image-id" }
```

Returned links must be HTTPS without embedded credentials. Uploading requires
confirmation; redirects are disabled. Authenticated proxies are unsupported.

## Development

Use Node.js 24, pnpm 12.11.2, stable Rust and the
[Tauri prerequisites](https://v2.tauri.app/start/prerequisites/) for your platform.
macOS screen capture requires Screen Recording permission in System Settings.

```sh
pnpm install --frozen-lockfile
pnpm tauri dev
```

Browser preview uses `pnpm dev` at `http://127.0.0.1:1420`. The capture demo
uses a synthetic image; it cannot record the desktop or register system shortcuts.

```sh
pnpm build
pnpm test
cargo test --manifest-path src-tauri/Cargo.toml
pnpm tauri build --no-bundle
```

The executable is written to `src-tauri/target/release/`. To test FFmpeg without
capturing a real screen or microphone:

```sh
cargo test --manifest-path src-tauri/Cargo.toml synthetic_video_and_audio_finalize -- --ignored
```

## License

MIT. See [LICENSE](LICENSE). Dependency notices are in
[THIRD_PARTY_NOTICES.txt](THIRD_PARTY_NOTICES.txt).
