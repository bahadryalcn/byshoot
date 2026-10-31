//! Explicit, local recording. FFmpeg is an optional machine dependency, never downloaded.
use serde::{Deserialize, Serialize};
use std::{
    fs,
    io::{Read, Seek, SeekFrom, Write},
    path::{Path, PathBuf},
    process::{Child, Command, Stdio},
    sync::Mutex,
    time::{Duration, Instant},
};
use tauri::Manager;
use tauri_plugin_dialog::DialogExt;

type Result<T> = std::result::Result<T, String>;
#[derive(Default)]
pub struct RecordingState(Mutex<Inner>);
#[derive(Default)]
struct Inner {
    session: Option<Session>,
    pending: Option<PathBuf>,
    error: Option<String>,
    saving: bool,
    recovered: bool,
}
struct Session {
    child: Child,
    path: PathBuf,
    log: PathBuf,
    started: Instant,
}
impl Drop for Session {
    fn drop(&mut self) {
        let _ = finish_child(&mut self.child);
    }
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Status {
    recording: bool,
    pending_path: Option<String>,
    elapsed_seconds: u64,
    error: Option<String>,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Sources {
    monitors: Vec<Screen>,
    audio_devices: Vec<String>,
    available: bool,
    message: Option<String>,
}
#[derive(Serialize)]
pub struct Screen {
    id: u32,
    name: String,
    width: u32,
    height: u32,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RecordingOptions {
    mode: String,
    monitor_id: Option<u32>,
    audio_device: Option<String>,
}

fn command() -> Command {
    let mut c = Command::new("ffmpeg");
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        c.creation_flags(0x08000000);
    }
    c
}
fn device_names(log: &str) -> Vec<String> {
    log.lines()
        .filter(|line| line.trim_end().ends_with("(audio)"))
        .filter_map(|line| {
            let a = line.find('"')?;
            let b = line.rfind('"')?;
            (b > a).then(|| line[a + 1..b].to_string())
        })
        .collect()
}
fn devices() -> Result<Vec<String>> {
    let out=command().args(["-hide_banner","-list_devices","true","-f","dshow","-i","dummy"]).output()
        .map_err(|_| "Kayıt için FFmpeg bulunamadı. ffmpeg.exe dosyasını PATH'e ekleyip ByShoot'u yeniden açın.".to_string())?;
    Ok(device_names(&String::from_utf8_lossy(&out.stderr)))
}
#[tauri::command]
pub async fn recording_sources() -> Result<Sources> {
    tauri::async_runtime::spawn_blocking(|| {
        if !cfg!(windows) {
            return Ok(Sources {
                monitors: vec![],
                audio_devices: vec![],
                available: false,
                message: Some("Ses/video kaydı şu anda Windows'ta kullanılabilir.".into()),
            });
        }
        let monitors = xcap::Monitor::all()
            .map_err(crate::error)?
            .into_iter()
            .map(|m| {
                Ok(Screen {
                    id: m.id().map_err(crate::error)?,
                    name: m.name().map_err(crate::error)?,
                    width: m.width().map_err(crate::error)?,
                    height: m.height().map_err(crate::error)?,
                })
            })
            .collect::<Result<Vec<_>>>()?;
        match devices() {
            Ok(audio_devices) => Ok(Sources {
                monitors,
                audio_devices,
                available: true,
                message: None,
            }),
            Err(e) => Ok(Sources {
                monitors,
                audio_devices: vec![],
                available: false,
                message: Some(e),
            }),
        }
    })
    .await
    .map_err(crate::error)?
}
fn finish_child(child: &mut Child) -> Result<std::process::ExitStatus> {
    if let Some(status) = child.try_wait().map_err(crate::error)? {
        return Ok(status);
    }
    if let Some(stdin) = child.stdin.as_mut() {
        let _ = stdin.write_all(b"q\n");
    }
    let deadline = Instant::now() + Duration::from_secs(8);
    loop {
        if let Some(status) = child.try_wait().map_err(crate::error)? {
            return Ok(status);
        }
        if Instant::now() > deadline {
            let _ = child.kill();
            let _ = child.wait();
            return Err("Kayıt zamanında kapanmadı. Kurtarma dosyası korunuyor.".into());
        }
        std::thread::sleep(Duration::from_millis(50));
    }
}
fn valid_media(path: &Path) -> bool {
    let Ok(mut file) = fs::File::open(path) else {
        return false;
    };
    let Ok(size) = file.metadata().map(|m| m.len()) else {
        return false;
    };
    let mut head = [0; 12];
    if file.read_exact(&mut head).is_err() {
        return false;
    }
    match path.extension().and_then(|s| s.to_str()) {
        Some("wav") => {
            if &head[..4] != b"RIFF" || &head[8..12] != b"WAVE" {
                return false;
            }
            let mut offset = 12u64;
            while offset.saturating_add(8) <= size {
                if file.seek(SeekFrom::Start(offset)).is_err() {
                    return false;
                }
                let mut header = [0; 8];
                if file.read_exact(&mut header).is_err() {
                    return false;
                }
                let length = u32::from_le_bytes(header[4..8].try_into().unwrap()) as u64;
                if &header[..4] == b"data" {
                    return length > 0 && size > offset + 8;
                }
                offset = offset.saturating_add(8 + length + (length % 2));
            }
            false
        }
        Some("mp4") => {
            if &head[4..8] != b"ftyp" {
                return false;
            }
            let mut offset = 0u64;
            while offset.saturating_add(8) <= size {
                if file.seek(SeekFrom::Start(offset)).is_err() {
                    return false;
                }
                let mut header = [0; 8];
                if file.read_exact(&mut header).is_err() {
                    return false;
                }
                let length = u32::from_be_bytes(header[..4].try_into().unwrap()) as u64;
                if &header[4..8] == b"mdat" && length > 8 && offset.saturating_add(length) <= size {
                    return true;
                }
                if length < 8 {
                    return false;
                }
                offset = offset.saturating_add(length);
            }
            false
        }
        _ => false,
    }
}
fn log_tail(path: &Path) -> String {
    fs::read_to_string(path)
        .unwrap_or_default()
        .chars()
        .rev()
        .take(1200)
        .collect::<String>()
        .chars()
        .rev()
        .collect()
}
fn directory(app: &tauri::AppHandle) -> Result<PathBuf> {
    Ok(app
        .path()
        .app_data_dir()
        .map_err(crate::error)?
        .join("recordings"))
}
fn recover(app: &tauri::AppHandle, inner: &mut Inner) -> Result<()> {
    if inner.recovered {
        return Ok(());
    }
    inner.recovered = true;
    let dir = directory(app)?;
    if let Ok(bytes) = fs::read(dir.join("pending.json")) {
        if let Ok(name) = serde_json::from_slice::<String>(&bytes) {
            // The manifest contains a filename, never an arbitrary local path.
            if Path::new(&name).file_name().and_then(|s| s.to_str()) == Some(name.as_str()) {
                let path = dir.join(name);
                if valid_media(&path) {
                    inner.pending = Some(path);
                } else if path.exists() {
                    inner.error = Some(format!(
                        "Önceki kayıt tamamlanamadı. Kurtarma dosyası: {}",
                        path.display()
                    ));
                }
            }
        }
    }
    Ok(())
}
fn update(inner: &mut Inner) {
    let exited = inner
        .session
        .as_mut()
        .and_then(|s| s.child.try_wait().ok().flatten());
    if let Some(exit) = exited {
        let session = inner.session.take().unwrap();
        if valid_media(&session.path) {
            inner.pending = Some(session.path.clone());
        }
        inner.error = Some(format!(
            "Kayıt beklenmeden durdu ({exit}). {} Kurtarma: {}",
            log_tail(&session.log),
            session.path.display()
        ));
    }
}
fn status(app: tauri::AppHandle) -> Result<Status> {
    let state = app.state::<RecordingState>();
    let mut inner = state.0.lock().map_err(crate::error)?;
    recover(&app, &mut inner)?;
    update(&mut inner);
    Ok(Status {
        recording: inner.session.is_some(),
        pending_path: inner
            .pending
            .as_ref()
            .map(|p| p.to_string_lossy().into_owned()),
        elapsed_seconds: inner
            .session
            .as_ref()
            .map_or(0, |s| s.started.elapsed().as_secs()),
        error: inner.error.clone(),
    })
}
#[tauri::command]
pub async fn recording_status(app: tauri::AppHandle) -> Result<Status> {
    tauri::async_runtime::spawn_blocking(move || status(app))
        .await
        .map_err(crate::error)?
}
/// Explicit quit must finalize the media container before Tauri exits the process.
pub fn shutdown(app: &tauri::AppHandle) {
    let state = app.state::<RecordingState>();
    if let Ok(mut inner) = state.0.lock() {
        if let Some(mut session) = inner.session.take() {
            let _ = finish_child(&mut session.child);
        }
    };
}
fn recording_args(
    options: &RecordingOptions,
    screen: Option<(i32, i32, u32, u32)>,
) -> Result<Vec<String>> {
    if !["audio", "video"].contains(&options.mode.as_str()) {
        return Err("Geçersiz kayıt türü.".into());
    }
    if options.mode == "audio" && options.audio_device.is_none() {
        return Err("Ses kaydı için bir ses girişi seçin.".into());
    }
    let mut args = vec![
        "-hide_banner".into(),
        "-loglevel".into(),
        "warning".into(),
        "-y".into(),
    ];
    if options.mode == "video" {
        let (x, y, w, h) =
            screen.ok_or("Kaydedilecek ekran bulunamadı; ekran listesini yenileyin.")?;
        if w < 2 || h < 2 {
            return Err("Ekran boyutu geçersiz.".into());
        }
        args.extend([
            "-thread_queue_size".into(),
            "512".into(),
            "-f".into(),
            "gdigrab".into(),
            "-framerate".into(),
            "30".into(),
            "-offset_x".into(),
            x.to_string(),
            "-offset_y".into(),
            y.to_string(),
            "-video_size".into(),
            format!("{w}x{h}"),
            "-i".into(),
            "desktop".into(),
        ]);
    }
    if let Some(audio) = options.audio_device.as_ref() {
        args.extend([
            "-thread_queue_size".into(),
            "512".into(),
            "-f".into(),
            "dshow".into(),
            "-i".into(),
            format!("audio={audio}"),
        ]);
    }
    if options.mode == "video" {
        args.extend(
            [
                "-c:v",
                "libx264",
                "-preset",
                "ultrafast",
                "-crf",
                "23",
                "-vf",
                "pad=ceil(iw/2)*2:ceil(ih/2)*2",
                "-pix_fmt",
                "yuv420p",
                "-movflags",
                "+frag_keyframe+empty_moov",
            ]
            .map(String::from),
        );
        if options.audio_device.is_some() {
            args.extend(["-c:a", "aac"].map(String::from));
        } else {
            args.push("-an".into())
        }
    } else {
        args.extend(["-vn", "-c:a", "pcm_s16le"].map(String::from));
    }
    Ok(args)
}
#[tauri::command]
pub async fn start_recording(app: tauri::AppHandle, options: RecordingOptions) -> Result<()> {
    tauri::async_runtime::spawn_blocking(move || {
        if !cfg!(windows) {
            return Err("Kayıt şu anda Windows'ta kullanılabilir.".into());
        }
        let state = app.state::<RecordingState>();
        let mut inner = state.0.lock().map_err(crate::error)?;
        recover(&app, &mut inner)?;
        update(&mut inner);
        if inner.session.is_some() || inner.saving {
            return Err("Bir kayıt işlemi zaten sürüyor.".into());
        }
        if inner.pending.is_some() {
            return Err("Önce önceki kaydı dosyaya kaydedin.".into());
        }
        if let Some(audio) = options.audio_device.as_ref() {
            if !devices()?.contains(audio) {
                return Err("Seçilen ses girişi artık bağlı değil; listeyi yenileyin.".into());
            }
        }
        let screen = if options.mode == "video" {
            let m = xcap::Monitor::all()
                .map_err(crate::error)?
                .into_iter()
                .find(|m| m.id().ok() == options.monitor_id)
                .ok_or("Kaydedilecek ekran bulunamadı.")?;
            Some((
                m.x().map_err(crate::error)?,
                m.y().map_err(crate::error)?,
                m.width().map_err(crate::error)?,
                m.height().map_err(crate::error)?,
            ))
        } else {
            None
        };
        let args = recording_args(&options, screen)?;
        let dir = directory(&app)?;
        fs::create_dir_all(&dir).map_err(crate::error)?;
        let extension = if options.mode == "video" {
            "mp4"
        } else {
            "wav"
        };
        let path = dir.join(format!(
            "ByShoot-{}.{}",
            chrono::Local::now().format("%Y%m%d-%H%M%S-%f"),
            extension
        ));
        let log = path.with_extension("log");
        let stderr = fs::File::create(&log).map_err(crate::error)?;
        let child = command()
            .args(args)
            .arg(&path)
            .stdin(Stdio::piped())
            .stdout(Stdio::null())
            .stderr(stderr)
            .spawn()
            .map_err(|e| format!("FFmpeg başlatılamadı: {e}. ffmpeg.exe PATH içinde olmalı."))?;
        inner.session = Some(Session {
            child,
            path,
            log,
            started: Instant::now(),
        });
        inner.error = None;
        let name = inner
            .session
            .as_ref()
            .unwrap()
            .path
            .file_name()
            .unwrap()
            .to_string_lossy()
            .into_owned();
        if let Err(e) = fs::write(
            dir.join("pending.json"),
            serde_json::to_vec(&name).map_err(crate::error)?,
        ) {
            inner.session = None;
            return Err(format!("Kurtarma bilgisi yazılamadı: {e}"));
        }
        std::thread::sleep(Duration::from_millis(300));
        update(&mut inner);
        if inner.session.is_none() {
            return Err(inner.error.clone().unwrap_or("Kayıt başlatılamadı.".into()));
        }
        Ok(())
    })
    .await
    .map_err(crate::error)?
}
#[tauri::command]
pub async fn stop_recording(app: tauri::AppHandle) -> Result<String> {
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<RecordingState>();
        let mut inner = state.0.lock().map_err(crate::error)?;
        let mut session = inner.session.take().ok_or("Etkin kayıt yok.")?;
        let exit = finish_child(&mut session.child);
        if valid_media(&session.path) {
            inner.pending = Some(session.path.clone());
        }
        let location = session.path.to_string_lossy().into_owned();
        match exit {
            Ok(status) if status.success() && inner.pending.is_some() => {
                inner.error = None;
                Ok(location)
            }
            other => {
                let e = format!(
                    "Kayıt tamamlanamadı ({other:?}). {} Kurtarma: {location}",
                    log_tail(&session.log)
                );
                inner.error = Some(e.clone());
                Err(e)
            }
        }
    })
    .await
    .map_err(crate::error)?
}
#[tauri::command]
pub async fn save_recording(app: tauri::AppHandle) -> Result<Option<String>> {
    let source = {
        let state = app.state::<RecordingState>();
        let mut inner = state.0.lock().map_err(crate::error)?;
        if inner.saving {
            return Err("Kaydetme işlemi zaten sürüyor.".into());
        }
        let path = inner
            .pending
            .clone()
            .ok_or("Kaydedilecek tamamlanmış kayıt yok.")?;
        inner.saving = true;
        path
    };
    let result = async {
        let name = source.file_name().unwrap_or_default().to_string_lossy();
        let extension = source.extension().unwrap_or_default().to_string_lossy();
        let parent = app
            .get_webview_window("main")
            .ok_or("Ana pencere bulunamadı.")?;
        let (tx, rx) = tokio::sync::oneshot::channel();
        app.dialog()
            .file()
            .set_parent(&parent)
            .set_title("Kaydı kaydet")
            .set_file_name(name.as_ref())
            .add_filter("Kayıt", &[extension.as_ref()])
            .save_file(move |path| {
                let _ = tx.send(path);
            });
        let Some(file) = rx.await.map_err(crate::error)? else {
            return Ok(None);
        };
        let dest = file.into_path().map_err(crate::error)?;
        let location = dest.to_string_lossy().into_owned();
        let source_copy = source.clone();
        tauri::async_runtime::spawn_blocking(move || -> Result<()> {
            save_completed_recording(&source_copy, &dest)
        })
        .await
        .map_err(crate::error)??;
        Ok(Some(location))
    }
    .await;
    let state = app.state::<RecordingState>();
    let mut inner = state.0.lock().map_err(crate::error)?;
    inner.saving = false;
    if matches!(&result, Ok(Some(_))) {
        inner.pending = None;
        inner.error = None;
        let _ = fs::remove_file(directory(&app)?.join("pending.json"));
    }
    result
}

fn save_completed_recording(source: &Path, destination: &Path) -> Result<()> {
    let original = fs::canonicalize(source).map_err(crate::error)?;
    match fs::canonicalize(destination) {
        // Includes relative paths, directory aliases and file symlinks. The
        // recovery file itself can be selected as the user's final location.
        Ok(saved) if saved == original => return Ok(()),
        Ok(_) => {}
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => {}
        Err(e) => return Err(crate::error(e)),
    }
    copy_recording(source, destination)?;

    // Resolve again after the atomic replacement. Never delete the saved file
    // through an alternate spelling of the same path.
    let saved = fs::canonicalize(destination).map_err(crate::error)?;
    if fs::canonicalize(source).map_err(crate::error)? == saved {
        return Ok(());
    }
    let log = source.with_extension("log");
    match fs::canonicalize(&log) {
        // The user may even choose the former diagnostic filename as output.
        Ok(path) if path == saved => {}
        Ok(_) => fs::remove_file(&log).map_err(|e| {
            format!("Dosya kaydedildi ancak geçici kayıt günlüğü temizlenemedi: {e}")
        })?,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => {}
        Err(e) => return Err(crate::error(e)),
    }
    fs::remove_file(source)
        .map_err(|e| format!("Dosya kaydedildi ancak geçici kayıt temizlenemedi: {e}"))
}

fn copy_recording(source: &Path, destination: &Path) -> Result<()> {
    let mut input = fs::File::open(source).map_err(crate::error)?;
    let temporary = destination.with_file_name(format!(
        ".byshoot-{}-{}.tmp",
        std::process::id(),
        chrono::Local::now().format("%Y%m%d%H%M%S%f")
    ));
    let mut output = fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&temporary)
        .map_err(crate::error)?;
    let copied = (|| {
        std::io::copy(&mut input, &mut output).map_err(crate::error)?;
        output.sync_all().map_err(crate::error)
    })();
    drop(output);
    if let Err(e) = copied {
        let _ = fs::remove_file(&temporary);
        return Err(e);
    }
    if let Err(e) = crate::replace_file(&temporary, destination) {
        let _ = fs::remove_file(&temporary);
        return Err(e);
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    fn save_test_directory(name: &str) -> PathBuf {
        let directory = std::env::temp_dir().join(format!(
            "byshoot-save-{name}-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        fs::create_dir(&directory).unwrap();
        directory
    }
    #[test]
    fn successful_save_removes_only_this_recovery_and_log() {
        let dir = save_test_directory("cleanup");
        let source = dir.join("pending.mp4");
        let log = source.with_extension("log");
        let destination = dir.join("saved.mp4");
        let unrelated = dir.join("old-recording.mp4");
        fs::write(&source, b"new recording").unwrap();
        fs::write(&log, b"diagnostic").unwrap();
        fs::write(&destination, b"previous destination").unwrap();
        fs::write(&unrelated, b"older recording").unwrap();
        save_completed_recording(&source, &destination).unwrap();
        assert_eq!(fs::read(&destination).unwrap(), b"new recording");
        assert!(!source.exists());
        assert!(!log.exists());
        assert_eq!(fs::read(&unrelated).unwrap(), b"older recording");
        fs::remove_file(destination).unwrap();
        fs::remove_file(unrelated).unwrap();
        fs::remove_dir(dir).unwrap();
    }
    #[test]
    fn saving_to_same_file_through_path_alias_preserves_it() {
        let dir = save_test_directory("alias");
        let source = dir.join("pending.wav");
        let log = source.with_extension("log");
        let subdir = dir.join("folder");
        fs::create_dir(&subdir).unwrap();
        fs::write(&source, b"recording").unwrap();
        fs::write(&log, b"diagnostic").unwrap();
        let alias = subdir.join("..").join("pending.wav");
        save_completed_recording(&source, &alias).unwrap();
        assert_eq!(fs::read(&source).unwrap(), b"recording");
        assert!(log.exists());
        fs::remove_file(source).unwrap();
        fs::remove_file(log).unwrap();
        fs::remove_dir(subdir).unwrap();
        fs::remove_dir(dir).unwrap();
    }
    #[test]
    fn choosing_diagnostic_filename_as_destination_does_not_delete_saved_media() {
        let dir = save_test_directory("log-destination");
        let source = dir.join("pending.mp4");
        let destination = source.with_extension("log");
        fs::write(&source, b"recording").unwrap();
        fs::write(&destination, b"diagnostic").unwrap();
        save_completed_recording(&source, &destination).unwrap();
        assert_eq!(fs::read(&destination).unwrap(), b"recording");
        assert!(!source.exists());
        fs::remove_file(destination).unwrap();
        fs::remove_dir(dir).unwrap();
    }
    #[test]
    fn failed_destination_replacement_preserves_recovery_and_existing_data() {
        let dir = save_test_directory("failed-copy");
        let source = dir.join("pending.mp4");
        let log = source.with_extension("log");
        let destination = dir.join("occupied");
        fs::create_dir(&destination).unwrap();
        let existing = destination.join("existing.mp4");
        fs::write(&source, b"recording").unwrap();
        fs::write(&log, b"diagnostic").unwrap();
        fs::write(&existing, b"previous destination data").unwrap();
        assert!(save_completed_recording(&source, &destination).is_err());
        assert_eq!(fs::read(&source).unwrap(), b"recording");
        assert_eq!(fs::read(&log).unwrap(), b"diagnostic");
        assert_eq!(fs::read(&existing).unwrap(), b"previous destination data");
        assert_eq!(fs::read_dir(&dir).unwrap().count(), 3);
        fs::remove_file(source).unwrap();
        fs::remove_file(log).unwrap();
        fs::remove_file(existing).unwrap();
        fs::remove_dir(destination).unwrap();
        fs::remove_dir(dir).unwrap();
    }
    #[test]
    fn parses_only_audio_devices() {
        assert_eq!(device_names("[dshow] \"Mic (USB)\" (audio)\n[dshow] \"Camera\" (video)\n Alternative name \"secret\""),vec!["Mic (USB)"]);
    }
    #[test]
    fn negative_origins_and_audio_names_are_separate_args() {
        let o = RecordingOptions {
            mode: "video".into(),
            monitor_id: Some(1),
            audio_device: Some("Microphone space & name".into()),
        };
        let a = recording_args(&o, Some((-2560, -100, 2560, 1440))).unwrap();
        assert!(a.windows(2).any(|w| w == ["-offset_x", "-2560"]));
        assert!(a.contains(&"audio=Microphone space & name".into()));
        assert!(a.contains(&"2560x1440".into()));
    }
    #[test]
    fn audio_requires_device_and_video_requires_screen() {
        let o = RecordingOptions {
            mode: "audio".into(),
            monitor_id: None,
            audio_device: None,
        };
        assert!(recording_args(&o, None).is_err());
        let v = RecordingOptions {
            mode: "video".into(),
            ..o
        };
        assert!(recording_args(&v, None).is_err());
    }
    #[test]
    fn rejects_unknown_modes() {
        assert!(recording_args(
            &RecordingOptions {
                mode: "other".into(),
                monitor_id: None,
                audio_device: None
            },
            None
        )
        .is_err());
    }
    #[test]
    #[ignore = "Requires local FFmpeg; uses synthetic video and sound, never the user's screen/microphone"]
    fn synthetic_video_and_audio_finalize() {
        let directory =
            std::env::temp_dir().join(format!("byshoot-recording-test-{}", std::process::id()));
        fs::create_dir_all(&directory).unwrap();
        for extension in ["mp4", "wav"] {
            let path = directory.join(format!("synthetic.{extension}"));
            let mut c = command();
            c.args([
                "-hide_banner",
                "-loglevel",
                "error",
                "-y",
                "-re",
                "-f",
                "lavfi",
                "-i",
                "sine=frequency=440:sample_rate=44100",
            ]);
            if extension == "mp4" {
                c.args([
                    "-re",
                    "-f",
                    "lavfi",
                    "-i",
                    "testsrc=size=64x64:rate=10",
                    "-c:v",
                    "libx264",
                    "-preset",
                    "ultrafast",
                    "-pix_fmt",
                    "yuv420p",
                    "-c:a",
                    "aac",
                    "-movflags",
                    "+frag_keyframe+empty_moov",
                ]);
            } else {
                c.args(["-c:a", "pcm_s16le"]);
            }
            let mut child = c
                .arg(&path)
                .stdin(Stdio::piped())
                .stdout(Stdio::null())
                .stderr(Stdio::null())
                .spawn()
                .unwrap();
            std::thread::sleep(Duration::from_millis(1200));
            assert!(finish_child(&mut child).unwrap().success());
            assert!(valid_media(&path), "Invalid synthetic {}", path.display());
            let decoded = command()
                .args(["-hide_banner", "-loglevel", "error", "-i"])
                .arg(&path)
                .args(["-f", "null", "-"])
                .output()
                .unwrap();
            assert!(
                decoded.status.success(),
                "Synthetic recording did not decode: {}",
                String::from_utf8_lossy(&decoded.stderr)
            );
            fs::remove_file(path).unwrap();
        }
        fs::remove_dir(directory).unwrap();
    }
}
