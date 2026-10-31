#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use base64::{engine::general_purpose::STANDARD, Engine};
use serde::{Deserialize, Serialize};
use std::{
    collections::{HashMap, HashSet},
    io::Cursor,
    path::PathBuf,
    sync::{
        atomic::{AtomicBool, Ordering},
        Mutex,
    },
};
use tauri::{Emitter, Manager};
#[cfg(not(windows))]
use tauri_plugin_autostart::ManagerExt;
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};
use tauri_plugin_notification::NotificationExt;
use tauri_plugin_opener::OpenerExt;
mod cursor_capture;
mod desktop_capture;
mod recording;
#[cfg(windows)]
mod startup;

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Settings {
    auto_copy_link: bool,
    close_after_upload: bool,
    notifications: bool,
    remember_region: bool,
    show_cursor: bool,
    language: String,
    format: String,
    jpeg_quality: u8,
    save_directory: String,
    launch_at_startup: bool,
    proxy_url: String,
    upload_provider: String,
    upload_endpoint: String,
    shortcuts: HashMap<String, Vec<String>>,
}
impl Default for Settings {
    fn default() -> Self {
        let region = if cfg!(target_os = "macos") {
            vec!["CommandOrControl+Shift+S".into()]
        } else {
            vec!["PrintScreen".into(), "CommandOrControl+Shift+S".into()]
        };
        let save = if cfg!(target_os = "macos") {
            vec!["CommandOrControl+Shift+F".into()]
        } else {
            vec!["Shift+PrintScreen".into()]
        };
        Self {
            auto_copy_link: true,
            close_after_upload: true,
            notifications: true,
            remember_region: false,
            show_cursor: false,
            language: "tr".into(),
            format: "png".into(),
            jpeg_quality: 90,
            save_directory: String::new(),
            launch_at_startup: false,
            proxy_url: String::new(),
            upload_provider: "lightshot".into(),
            upload_endpoint: String::new(),
            shortcuts: HashMap::from([
                ("region".into(), region),
                ("fullscreenSave".into(), save),
                ("fullscreenUpload".into(), vec![]),
            ]),
        }
    }
}
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct Capture {
    id: String,
    action: String,
    origin_x: i32,
    origin_y: i32,
    data_url: String,
    width: u32,
    height: u32,
    scale_factor: f64,
    monitors: Vec<desktop_capture::DesktopRect>,
    active_monitor: Option<usize>,
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct HistoryEntry {
    id: String,
    created_at: String,
    kind: String,
    location: String,
}
struct AppState {
    settings: Mutex<Settings>,
    capture: Mutex<Option<Capture>>,
    history: Mutex<Vec<HistoryEntry>>,
    busy: AtomicBool,
    settings_busy: Mutex<()>,
    shortcut_error: Mutex<Option<String>>,
}
type Result<T> = std::result::Result<T, String>;
fn error(e: impl std::fmt::Display) -> String {
    e.to_string()
}
fn data_path(app: &tauri::AppHandle, name: &str) -> Result<PathBuf> {
    let dir = app.path().app_data_dir().map_err(error)?;
    std::fs::create_dir_all(&dir).map_err(error)?;
    Ok(dir.join(name))
}
// Atomic replacement on Unix; Windows rename cannot replace, so use MoveFileExW.
#[cfg(target_os = "windows")]
fn replace_file(from: &std::path::Path, to: &std::path::Path) -> Result<()> {
    use std::os::windows::ffi::OsStrExt;
    #[link(name = "kernel32")]
    extern "system" {
        fn MoveFileExW(a: *const u16, b: *const u16, flags: u32) -> i32;
    }
    let a: Vec<u16> = from.as_os_str().encode_wide().chain(Some(0)).collect();
    let b: Vec<u16> = to.as_os_str().encode_wide().chain(Some(0)).collect();
    if unsafe { MoveFileExW(a.as_ptr(), b.as_ptr(), 1 | 8) } == 0 {
        Err(error(std::io::Error::last_os_error()))
    } else {
        Ok(())
    }
}
#[cfg(not(target_os = "windows"))]
fn replace_file(from: &std::path::Path, to: &std::path::Path) -> Result<()> {
    std::fs::rename(from, to).map_err(error)
}
fn persist<T: Serialize>(app: &tauri::AppHandle, name: &str, value: &T) -> Result<()> {
    let path = data_path(app, name)?;
    let tmp = path.with_extension("tmp");
    let bytes = serde_json::to_vec_pretty(value).map_err(error)?;
    use std::io::Write;
    let mut file = std::fs::File::create(&tmp).map_err(error)?;
    file.write_all(&bytes).map_err(error)?;
    file.sync_all().map_err(error)?;
    drop(file);
    replace_file(&tmp, &path)
}
fn read<T: serde::de::DeserializeOwned>(app: &tauri::AppHandle, name: &str) -> Option<T> {
    std::fs::read(data_path(app, name).ok()?)
        .ok()
        .and_then(|b| serde_json::from_slice(&b).ok())
}
fn https_url(value: &str) -> Result<url::Url> {
    let u = url::Url::parse(value).map_err(|_| "Geçerli HTTPS adresi gerekli".to_string())?;
    if u.scheme() != "https"
        || u.host_str().is_none()
        || !u.username().is_empty()
        || u.password().is_some()
    {
        return Err("Kimlik bilgisi içermeyen HTTPS adresi gerekli".into());
    }
    Ok(u)
}
fn validate(s: &Settings) -> Result<Vec<(Shortcut, String)>> {
    if !["tr", "en"].contains(&s.language.as_str())
        || !["png", "jpeg"].contains(&s.format.as_str())
        || !(1..=100).contains(&s.jpeg_quality)
    {
        return Err("Dil, biçim veya JPEG kalitesi geçersiz".into());
    }
    if s.show_cursor && !cfg!(windows) {
        return Err("Bu sürümde imleç yakalama desteklenmiyor; seçeneği kapatın".into());
    }
    if !["lightshot", "custom"].contains(&s.upload_provider.as_str()) {
        return Err("Yükleme sağlayıcısı geçersiz".into());
    }
    if s.upload_provider == "custom" {
        https_url(&s.upload_endpoint)?;
    }
    if !s.proxy_url.is_empty() {
        let u = url::Url::parse(&s.proxy_url).map_err(error)?;
        if !["http", "https"].contains(&u.scheme())
            || u.host_str().is_none()
            || !u.username().is_empty()
            || u.password().is_some()
        {
            return Err("Vekil sunucu için kimlik bilgisi içermeyen HTTP(S) adresi gerekli".into());
        }
    }
    let mut used = HashSet::new();
    let mut result = vec![];
    for (action, keys) in &s.shortcuts {
        if !["region", "fullscreenSave", "fullscreenUpload"].contains(&action.as_str()) {
            return Err("Kısayol işlevi geçersiz".into());
        }
        if keys.len() > 12 {
            return Err("Bir işlem en fazla 12 kısayol kullanabilir".into());
        }
        for key in keys {
            let k: Shortcut = key.parse().map_err(error)?;
            if !used.insert(k.id()) {
                return Err(format!("Tekrarlanan kısayol: {key}"));
            }
            result.push((k, action.clone()));
        }
    }
    Ok(result)
}
fn register(app: &tauri::AppHandle, s: &Settings) -> Result<()> {
    for (shortcut, action) in validate(s)? {
        app.global_shortcut()
            .on_shortcut(shortcut, move |app, _, event| {
                if event.state() == ShortcutState::Pressed {
                    let a = app.clone();
                    let action = action.clone();
                    tauri::async_runtime::spawn(async move {
                        if let Err(e) = start_capture(a.clone(), action).await {
                            let _ = a.emit("capture-error", &e);
                            notify(&a, "ByShoot", &e);
                        }
                    });
                }
            })
            .map_err(error)?;
    }
    Ok(())
}
fn notify(app: &tauri::AppHandle, title: &str, body: &str) {
    if app
        .state::<AppState>()
        .settings
        .lock()
        .unwrap()
        .notifications
    {
        let _ = app.notification().builder().title(title).body(body).show();
    }
}
fn history(app: &tauri::AppHandle, kind: &str, location: String) {
    let state = app.state::<AppState>();
    let mut list = state.history.lock().unwrap();
    let now = chrono::Utc::now();
    list.insert(
        0,
        HistoryEntry {
            id: now.timestamp_nanos_opt().unwrap_or_default().to_string(),
            created_at: now.to_rfc3339(),
            kind: kind.into(),
            location,
        },
    );
    list.truncate(100);
    let _ = persist(app, "history.json", &*list);
    let _ = app.emit("history-changed", ());
}
#[tauri::command]
fn get_settings(app: tauri::AppHandle) -> Settings {
    let mut settings = app.state::<AppState>().settings.lock().unwrap().clone();
    if let Ok(enabled) = startup_enabled(&app) {
        settings.launch_at_startup = enabled;
    }
    settings
}
#[tauri::command]
fn get_native_status(app: tauri::AppHandle) -> serde_json::Value {
    serde_json::json!({"shortcutError":app.state::<AppState>().shortcut_error.lock().unwrap().clone()})
}
#[tauri::command]
fn save_settings(app: tauri::AppHandle, settings: Settings) -> Result<()> {
    let state = app.state::<AppState>();
    let _guard = state.settings_busy.lock().unwrap();
    validate(&settings)?;
    let old = state.settings.lock().unwrap().clone();
    app.global_shortcut().unregister_all().map_err(error)?;
    if let Err(e) = register(&app, &settings) {
        let _ = app.global_shortcut().unregister_all();
        let restored = register(&app, &old);
        return Err(format!(
            "Kısayol kaydedilemedi: {e}; geri yükleme: {}",
            restored.err().unwrap_or_else(|| "tamam".into())
        ));
    }

    let change = if settings.launch_at_startup {
        set_startup(&app, true)
    } else {
        set_startup(&app, false)
    };
    if let Err(e) = change {
        let _ = app.global_shortcut().unregister_all();
        let _ = register(&app, &old);
        return Err(error(e));
    }
    if let Err(e) = persist(&app, "settings.json", &settings) {
        let _ = app.global_shortcut().unregister_all();
        let _ = register(&app, &old);
        if old.launch_at_startup {
            let _ = set_startup(&app, true);
        } else {
            let _ = set_startup(&app, false);
        }
        return Err(e);
    }
    *state.settings.lock().unwrap() = settings;
    *state.shortcut_error.lock().unwrap() = None;
    app.emit("settings-changed", ()).map_err(error)
}
#[tauri::command]
async fn start_capture(app: tauri::AppHandle, action: String) -> Result<()> {
    if !["region", "fullscreenSave", "fullscreenUpload"].contains(&action.as_str()) {
        return Err("Yakalama işlevi geçersiz".into());
    }
    let state = app.state::<AppState>();
    if state.capture.lock().unwrap().is_some() {
        return Ok(());
    }
    if state.busy.swap(true, Ordering::SeqCst) {
        return Ok(());
    }
    let main_was_visible = app
        .get_webview_window("main")
        .and_then(|w| w.is_visible().ok())
        .unwrap_or(false);
    let overlay_was_visible = app
        .get_webview_window("capture")
        .and_then(|w| w.is_visible().ok())
        .unwrap_or(false);
    let result = capture_inner(&app, &action).await;
    if result.is_err() {
        if !overlay_was_visible {
            let _ = close_capture(app.clone(), None);
        }
        if main_was_visible {
            if let Some(w) = app.get_webview_window("main") {
                let _ = w.show();
                let _ = w.set_focus();
            }
        }
    }
    state.busy.store(false, Ordering::SeqCst);
    result
}
async fn capture_inner(app: &tauri::AppHandle, action: &str) -> Result<()> {
    let overlay = app
        .get_webview_window("capture")
        .ok_or("Yakalama penceresi hazır değil")?;
    if overlay.is_visible().map_err(error)? {
        return Err("Önce mevcut yakalamayı bitirin".into());
    }
    if app.state::<AppState>().settings.lock().unwrap().show_cursor && !cfg!(windows) {
        return Err("İmleç yakalama desteklenmiyor".into());
    }
    let cursor_frame = if app.state::<AppState>().settings.lock().unwrap().show_cursor {
        cursor_capture::snapshot()?
    } else {
        None
    };
    if action == "region" {
        return capture_virtual_desktop(app, &overlay, cursor_frame).await;
    }
    let cursor = capture_cursor(&overlay)?;
    let monitor = app
        .monitor_from_point(cursor.x, cursor.y)
        .map_err(error)?
        .or(app.primary_monitor().map_err(error)?)
        .ok_or("Ekran bulunamadı")?;
    let pos = *monitor.position();
    let size = *monitor.size();
    let scale = monitor.scale_factor();
    if let Some(main) = app.get_webview_window("main") {
        if main.is_visible().map_err(error)? {
            main.hide().map_err(error)?;
            tokio::time::sleep(std::time::Duration::from_millis(100)).await;
        }
    }
    let capture_action = action.to_owned();
    let capture = tauri::async_runtime::spawn_blocking(move || -> Result<Capture> {
        let monitors = xcap::Monitor::all().map_err(error)?;
        // Match physical monitor origin; platform metadata differs, fall back to cursor containment.
        let origin = if cfg!(target_os = "macos") {
            (
                (pos.x as f64 / scale).round() as i32,
                (pos.y as f64 / scale).round() as i32,
            )
        } else {
            (pos.x, pos.y)
        };
        let m = monitors
            .iter()
            .find(|m| m.x().ok() == Some(origin.0) && m.y().ok() == Some(origin.1))
            .or_else(|| {
                monitors.iter().find(|m| {
                    let (Ok(x), Ok(y), Ok(w), Ok(h)) = (m.x(), m.y(), m.width(), m.height()) else {
                        return false;
                    };
                    cursor.x >= x as f64
                        && cursor.x < (x as f64 + w as f64)
                        && cursor.y >= y as f64
                        && cursor.y < (y as f64 + h as f64)
                })
            })
            .ok_or("Etkin ekran yakalanamadı")?;
        let mut image = m.capture_image().map_err(|e| {
            format!("Ekran yakalanamadı. macOS Ekran Kaydı iznini kontrol edin: {e}")
        })?;
        if let Some(cursor) = cursor_frame {
            cursor_capture::draw_on(&cursor, &mut image, origin.0 as f64, origin.1 as f64, 1.0);
        }
        let (width, height) = image.dimensions();
        use image::ImageEncoder;
        let mut bytes = Vec::new();
        image::codecs::png::PngEncoder::new_with_quality(
            &mut bytes,
            image::codecs::png::CompressionType::Fast,
            image::codecs::png::FilterType::Sub,
        )
        .write_image(
            image.as_raw(),
            width,
            height,
            image::ExtendedColorType::Rgba8,
        )
        .map_err(error)?;
        Ok(Capture {
            action: capture_action,
            origin_x: pos.x,
            origin_y: pos.y,
            id: chrono::Utc::now()
                .timestamp_nanos_opt()
                .unwrap_or_default()
                .to_string(),
            data_url: format!("data:image/png;base64,{}", STANDARD.encode(bytes)),
            width,
            height,
            scale_factor: scale,
            monitors: Vec::new(),
            active_monitor: None,
        })
    })
    .await
    .map_err(error)??;
    *app.state::<AppState>().capture.lock().unwrap() = Some(capture);
    #[cfg(not(target_os = "macos"))]
    {
        overlay
            .set_position(tauri::PhysicalPosition::new(pos.x, pos.y))
            .map_err(error)?;
        overlay
            .set_size(tauri::PhysicalSize::new(size.width, size.height))
            .map_err(error)?;
    }
    #[cfg(target_os = "macos")]
    {
        // Use target monitor logical coordinates so mixed-DPI moves don't depend on the old window scale.
        overlay
            .set_position(tauri::LogicalPosition::new(
                pos.x as f64 / scale,
                pos.y as f64 / scale,
            ))
            .map_err(error)?;
        overlay
            .set_size(tauri::LogicalSize::new(
                size.width as f64 / scale,
                size.height as f64 / scale,
            ))
            .map_err(error)?;
    }
    align_capture_client(&overlay, pos.x, pos.y, size.width, size.height)?;
    // Keep the overlay hidden until its decoded screenshot and first frame are ready.
    overlay
        .emit("capture-ready", serde_json::json!({"action":action}))
        .map_err(error)
}
async fn capture_virtual_desktop(
    app: &tauri::AppHandle,
    overlay: &tauri::WebviewWindow,
    cursor_frame: Option<cursor_capture::CursorFrame>,
) -> Result<()> {
    let cursor = capture_cursor(overlay)?;
    if let Some(main) = app.get_webview_window("main") {
        if main.is_visible().map_err(error)? {
            main.hide().map_err(error)?;
            tokio::time::sleep(std::time::Duration::from_millis(100)).await;
        }
    }
    let frame = tauri::async_runtime::spawn_blocking(move || {
        let mut frame = desktop_capture::capture_desktop()?;
        if let Some(cursor) = cursor_frame {
            cursor_capture::draw_on(
                &cursor,
                &mut frame.image,
                frame.origin_x as f64,
                frame.origin_y as f64,
                frame.coordinate_scale,
            );
        }
        Ok::<_, String>(frame)
    })
    .await
    .map_err(error)??;
    let cursor_x = (cursor.x - frame.origin_x as f64) * frame.coordinate_scale;
    let cursor_y = (cursor.y - frame.origin_y as f64) * frame.coordinate_scale;
    let active_monitor = frame.monitors.iter().position(|m| {
        cursor_x >= m.x as f64
            && cursor_x < m.x as f64 + m.width as f64
            && cursor_y >= m.y as f64
            && cursor_y < m.y as f64 + m.height as f64
    });
    #[cfg(not(target_os = "macos"))]
    {
        overlay
            .set_position(tauri::PhysicalPosition::new(frame.origin_x, frame.origin_y))
            .map_err(error)?;
        overlay
            .set_size(tauri::PhysicalSize::new(
                frame.image.width(),
                frame.image.height(),
            ))
            .map_err(error)?;
        align_capture_client(
            overlay,
            frame.origin_x,
            frame.origin_y,
            frame.image.width(),
            frame.image.height(),
        )?;
    }
    #[cfg(target_os = "macos")]
    {
        overlay
            .set_position(tauri::LogicalPosition::new(
                frame.origin_x as f64,
                frame.origin_y as f64,
            ))
            .map_err(error)?;
        overlay
            .set_size(tauri::LogicalSize::new(
                frame.image.width() as f64 / frame.coordinate_scale,
                frame.image.height() as f64 / frame.coordinate_scale,
            ))
            .map_err(error)?;
    }
    // A spanning window has one renderer DPI. Read its actual scale after placement,
    // rather than borrowing the cursor monitor's scale for the entire desktop.
    let scale = overlay.scale_factor().map_err(error)?;
    let origin = overlay.inner_position().map_err(error)?;
    let size = overlay.inner_size().map_err(error)?;
    let capture = tauri::async_runtime::spawn_blocking(move || -> Result<Capture> {
        let ratio_x = size.width as f64 / frame.image.width() as f64;
        let ratio_y = size.height as f64 / frame.image.height() as f64;
        let monitors = frame
            .monitors
            .iter()
            .map(|m| desktop_capture::DesktopRect {
                x: (m.x as f64 * ratio_x).round() as u32,
                y: (m.y as f64 * ratio_y).round() as u32,
                width: (m.width as f64 * ratio_x).round() as u32,
                height: (m.height as f64 * ratio_y).round() as u32,
            })
            .collect();
        #[cfg(target_os = "macos")]
        let image = if frame.image.dimensions() != (size.width, size.height) {
            if size.width > 32768
                || size.height > 32768
                || size.width as u64 * size.height as u64 > 64_000_000
            {
                return Err("Ekranların toplam görüntüsü çok büyük".into());
            }
            image::imageops::resize(
                &frame.image,
                size.width,
                size.height,
                image::imageops::FilterType::Triangle,
            )
        } else {
            frame.image
        };
        #[cfg(not(target_os = "macos"))]
        let image = {
            if (origin.x, origin.y, size.width, size.height)
                != (
                    frame.origin_x,
                    frame.origin_y,
                    frame.image.width(),
                    frame.image.height(),
                )
            {
                return Err("Tüm ekranlar için yakalama penceresi hizalanamadı".into());
            }
            frame.image
        };
        use image::ImageEncoder;
        let mut bytes = Vec::new();
        image::codecs::png::PngEncoder::new_with_quality(
            &mut bytes,
            image::codecs::png::CompressionType::Fast,
            image::codecs::png::FilterType::Sub,
        )
        .write_image(
            image.as_raw(),
            image.width(),
            image.height(),
            image::ExtendedColorType::Rgba8,
        )
        .map_err(error)?;
        Ok(Capture {
            id: chrono::Utc::now()
                .timestamp_nanos_opt()
                .unwrap_or_default()
                .to_string(),
            action: "region".into(),
            origin_x: origin.x,
            origin_y: origin.y,
            width: image.width(),
            height: image.height(),
            scale_factor: scale,
            monitors,
            active_monitor,
            data_url: format!("data:image/png;base64,{}", STANDARD.encode(bytes)),
        })
    })
    .await
    .map_err(error)??;
    *app.state::<AppState>().capture.lock().unwrap() = Some(capture);
    overlay
        .emit("capture-ready", serde_json::json!({"action":"region"}))
        .map_err(error)
}
fn capture_matches(capture: &Option<Capture>, id: &str) -> bool {
    capture.as_ref().is_some_and(|capture| capture.id == id)
}
fn corrected_outer_position(
    target: (i32, i32),
    outer: (i32, i32),
    inner: (i32, i32),
) -> (i32, i32) {
    (
        target.0 - (inner.0 - outer.0),
        target.1 - (inner.1 - outer.1),
    )
}
fn align_capture_client(
    window: &tauri::WebviewWindow,
    x: i32,
    y: i32,
    width: u32,
    height: u32,
) -> Result<()> {
    if window.inner_size().map_err(error)? != tauri::PhysicalSize::new(width, height) {
        window
            .set_size(tauri::PhysicalSize::new(width, height))
            .map_err(error)?;
    }
    let outer = window.outer_position().map_err(error)?;
    let inner = window.inner_position().map_err(error)?;
    let corrected = corrected_outer_position((x, y), (outer.x, outer.y), (inner.x, inner.y));
    if corrected != (outer.x, outer.y) {
        window
            .set_position(tauri::PhysicalPosition::new(corrected.0, corrected.1))
            .map_err(error)?;
    }
    Ok(())
}
#[cfg(target_os = "windows")]
fn disable_capture_transitions(window: &tauri::WebviewWindow) -> Result<()> {
    #[link(name = "dwmapi")]
    extern "system" {
        fn DwmSetWindowAttribute(
            hwnd: *mut std::ffi::c_void,
            attribute: u32,
            value: *const std::ffi::c_void,
            size: u32,
        ) -> i32;
    }
    let disabled: i32 = 1;
    let result = unsafe {
        DwmSetWindowAttribute(
            window.hwnd().map_err(error)?.0,
            3,
            (&disabled as *const i32).cast(),
            std::mem::size_of::<i32>() as u32,
        )
    };
    if result < 0 {
        return Err(format!("Yakalama pencere geçişi kapatılamadı: {result}"));
    }
    Ok(())
}
#[tauri::command]
fn present_capture(app: tauri::AppHandle, capture_id: String) -> Result<()> {
    let state = app.state::<AppState>();
    let capture = state.capture.lock().unwrap();
    if !capture_matches(&capture, &capture_id) {
        return Err("Yakalama iptal edildi veya değişti".into());
    }
    let overlay = app
        .get_webview_window("capture")
        .ok_or("Yakalama penceresi hazır değil")?;
    let current = capture.as_ref().unwrap();
    let inner = overlay.inner_position().map_err(error)?;
    let size = overlay.inner_size().map_err(error)?;
    if (inner.x, inner.y, size.width, size.height)
        != (
            current.origin_x,
            current.origin_y,
            current.width,
            current.height,
        )
    {
        return Err("Yakalama penceresi ekran pikselleriyle hizalanamadı".into());
    }
    overlay.show().map_err(error)?;
    overlay.set_focus().map_err(error)
}
#[cfg(not(target_os = "macos"))]
fn capture_cursor(w: &tauri::WebviewWindow) -> Result<tauri::PhysicalPosition<f64>> {
    w.cursor_position().map_err(error)
}
#[cfg(target_os = "macos")]
fn capture_cursor(_w: &tauri::WebviewWindow) -> Result<tauri::PhysicalPosition<f64>> {
    // CGEvent coordinates and xcap display bounds use global logical points on macOS.
    #[repr(C)]
    struct Point {
        x: f64,
        y: f64,
    }
    #[link(name = "CoreGraphics", kind = "framework")]
    extern "C" {
        fn CGEventCreate(source: *const std::ffi::c_void) -> *const std::ffi::c_void;
        fn CGEventGetLocation(event: *const std::ffi::c_void) -> Point;
    }
    #[link(name = "CoreFoundation", kind = "framework")]
    extern "C" {
        fn CFRelease(value: *const std::ffi::c_void);
    }
    unsafe {
        let event = CGEventCreate(std::ptr::null());
        if event.is_null() {
            return Err("İmleç konumu alınamadı".into());
        }
        let p = CGEventGetLocation(event);
        CFRelease(event);
        Ok(tauri::PhysicalPosition::new(p.x, p.y))
    }
}
#[tauri::command]
fn get_capture(app: tauri::AppHandle) -> Result<Capture> {
    app.state::<AppState>()
        .capture
        .lock()
        .unwrap()
        .clone()
        .ok_or("Henüz ekran yakalanmadı".into())
}
fn current_capture_id(app: &tauri::AppHandle) -> Result<String> {
    app.state::<AppState>()
        .capture
        .lock()
        .unwrap()
        .as_ref()
        .map(|c| c.id.clone())
        .ok_or("Henüz ekran yakalanmadı".into())
}
#[tauri::command]
fn close_capture(app: tauri::AppHandle, capture_id: Option<String>) -> Result<()> {
    let state = app.state::<AppState>();
    let mut capture = state.capture.lock().unwrap();
    if capture_id
        .as_ref()
        .is_some_and(|id| !capture_matches(&capture, id))
    {
        return Ok(());
    }
    if let Some(w) = app.get_webview_window("capture") {
        w.hide().map_err(error)?;
    }
    *capture = None;
    Ok(())
}
#[tauri::command]
fn abort_capture(app: tauri::AppHandle, capture_id: String, message: String) -> Result<()> {
    if !capture_matches(
        &app.state::<AppState>().capture.lock().unwrap(),
        &capture_id,
    ) {
        return Ok(());
    }
    close_capture(app.clone(), Some(capture_id))?;
    show_main_on_pointer_monitor(&app)?;
    app.emit("capture-error", message).map_err(error)
}
fn decode(data: &str) -> Result<image::DynamicImage> {
    let raw = data
        .strip_prefix("data:image/png;base64,")
        .ok_or("PNG görüntü verisi gerekli")?;
    if raw.len() > 90_000_000 {
        return Err("Görüntü çok büyük".into());
    }
    let bytes = STANDARD.decode(raw).map_err(error)?;
    let mut reader = image::ImageReader::new(Cursor::new(bytes))
        .with_guessed_format()
        .map_err(error)?;
    let mut limits = image::Limits::default();
    limits.max_image_width = Some(32768);
    limits.max_image_height = Some(32768);
    limits.max_alloc = Some(512 * 1024 * 1024);
    reader.limits(limits);
    reader.decode().map_err(error)
}
fn encode(img: &image::DynamicImage, s: &Settings) -> Result<Vec<u8>> {
    let mut bytes = Cursor::new(Vec::new());
    if s.format == "jpeg" {
        image::codecs::jpeg::JpegEncoder::new_with_quality(&mut bytes, s.jpeg_quality)
            .encode_image(&img.to_rgb8())
            .map_err(error)?;
    } else {
        img.write_to(&mut bytes, image::ImageFormat::Png)
            .map_err(error)?;
    }
    Ok(bytes.into_inner())
}
#[tauri::command]
async fn copy_image(app: tauri::AppHandle, data_url: String) -> Result<()> {
    let capture_id = current_capture_id(&app)?;
    tauri::async_runtime::spawn_blocking(move || {
        let rgba = decode(&data_url)?.to_rgba8();
        let (width, height) = rgba.dimensions();
        let mut clipboard = arboard::Clipboard::new().map_err(error)?;
        clipboard
            .set_image(arboard::ImageData {
                width: width as usize,
                height: height as usize,
                bytes: std::borrow::Cow::Owned(rgba.into_raw()),
            })
            .map_err(error)?;
        history(&app, "copy", String::new());
        close_capture(app.clone(), Some(capture_id))?;
        notify(&app, "ByShoot", "Görüntü panoya kopyalandı");
        Ok(())
    })
    .await
    .map_err(error)?
}
#[tauri::command]
async fn save_image(app: tauri::AppHandle, data_url: String) -> Result<Option<String>> {
    let capture_id = current_capture_id(&app)?;
    let s = get_settings(app.clone());
    let extension = if s.format == "jpeg" { "jpg" } else { "png" };
    let name = format!(
        "ByShoot-{}.{}",
        chrono::Local::now().format("%Y%m%d-%H%M%S"),
        extension
    );
    let mut dialog = app
        .dialog()
        .file()
        .set_title("Ekran görüntüsünü kaydet")
        .set_file_name(&name)
        .add_filter("Image", &[extension]);
    // The overlay spans the virtual desktop. Using it directly as the owner
    // lets Windows center the dialog in a gap between physical monitors.
    let parent = app
        .get_webview_window("capture")
        .ok_or("Yakalama penceresi hazır değil")?;
    #[cfg(windows)]
    let dialog_parent = capture_dialog_parent(&app, &parent)?;
    #[cfg(not(windows))]
    let dialog_parent = parent.clone();
    dialog = dialog.set_parent(&dialog_parent);
    if !s.save_directory.is_empty() {
        dialog = dialog.set_directory(&s.save_directory);
    }
    let (tx, rx) = tokio::sync::oneshot::channel();
    dialog.save_file(move |path| {
        let _ = tx.send(path);
    });
    let Some(file) = rx.await.map_err(error)? else {
        if parent.is_visible().unwrap_or(false) {
            let _ = parent.set_focus();
        }
        return Ok(None);
    };
    let path = file.into_path().map_err(error)?;
    let location = path.to_string_lossy().to_string();
    let a = app.clone();
    let l = location.clone();
    tauri::async_runtime::spawn_blocking(move || -> Result<()> {
        let bytes = encode(&decode(&data_url)?, &s)?;
        std::fs::write(&path, bytes).map_err(error)?;
        history(&a, "save", l);
        Ok(())
    })
    .await
    .map_err(error)??;
    close_capture(app.clone(), Some(capture_id))?;
    notify(&app, "ByShoot", "Görüntü kaydedildi");
    Ok(Some(location))
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn ordinary_windows_center_inside_one_monitor_including_negative_origins() {
        assert_eq!(
            centered_in_work_area((-1920, 40), (1920, 1040), (620, 460)),
            (-1270, 330)
        );
        assert_eq!(
            centered_in_work_area((2560, -1440), (2560, 1400), (930, 690)),
            (3375, -1085)
        );
        assert_eq!(
            centered_in_work_area((0, 0), (500, 400), (620, 460)),
            (0, 0)
        );
    }
    #[test]
    fn straddling_and_disconnected_window_positions_need_recovery() {
        let left = (-1920, 0, 1920, 1040);
        assert!(rect_contained((-1500, 100, 620, 460), left));
        assert!(!rect_contained((-300, 100, 620, 460), left));
        assert!(!rect_contained((2000, 100, 620, 460), left));
        assert!(!rect_contained((-1500, 800, 620, 460), left));
    }
    #[test]
    fn client_origin_compensation_preserves_desktop_pixels() {
        assert_eq!(corrected_outer_position((0, 0), (0, 0), (1, 1)), (-1, -1));
        assert_eq!(
            corrected_outer_position((-1920, 0), (-1920, 0), (-1912, 8)),
            (-1928, -8)
        );
        assert_eq!(
            corrected_outer_position((2560, -1440), (2560, -1440), (2560, -1440)),
            (2560, -1440)
        );
    }
    #[test]
    fn startup_launch_is_quiet_but_manual_launch_opens_main() {
        assert!(!should_show_main(&[
            "byshoot.exe".into(),
            "--background".into()
        ]));
        assert!(should_show_main(&["byshoot.exe".into()]));
    }
    #[test]
    fn late_frame_cannot_present_a_cancelled_or_replaced_capture() {
        let capture = Some(Capture {
            id: "current".into(),
            action: "region".into(),
            origin_x: 0,
            origin_y: 0,
            data_url: String::new(),
            width: 1,
            height: 1,
            scale_factor: 1.0,
            monitors: Vec::new(),
            active_monitor: None,
        });
        assert!(capture_matches(&capture, "current"));
        assert!(!capture_matches(&capture, "previous"));
        assert!(!capture_matches(&None, "current"));
    }
    #[test]
    #[ignore = "requires a real desktop and screen capture permission"]
    fn real_monitor_capture_smoke() {
        let start = std::time::Instant::now();
        let monitors = xcap::Monitor::all().expect("monitor enumeration");
        let monitor = monitors
            .iter()
            .find(|m| m.is_primary().unwrap_or(false))
            .or_else(|| monitors.first())
            .expect("physical monitor");
        let image = monitor.capture_image().expect("real desktop capture");
        assert!(image.width() > 0 && image.height() > 0);
        println!(
            "Real monitor capture: {}x{}, {} ms; pixels not saved",
            image.width(),
            image.height(),
            start.elapsed().as_millis()
        );
    }
    #[test]
    fn default_shortcuts_are_distinct_and_valid() {
        assert!(!validate(&Settings::default()).unwrap().is_empty());
    }
    #[test]
    fn duplicate_shortcuts_across_actions_are_rejected() {
        let mut s = Settings::default();
        let key = s.shortcuts["region"][0].clone();
        s.shortcuts.insert("fullscreenUpload".into(), vec![key]);
        assert!(validate(&s).unwrap_err().contains("Tekrarlanan"));
    }
    #[test]
    fn control_and_super_chords_remain_distinct() {
        let mut settings = Settings::default();
        settings.shortcuts.insert(
            "region".into(),
            vec!["Control+Shift+A".into(), "Super+Shift+A".into()],
        );
        assert!(validate(&settings).is_ok());
    }
    #[test]
    fn unsupported_cursor_and_bad_quality_are_rejected() {
        let mut s = Settings::default();
        s.show_cursor = true;
        assert_eq!(validate(&s).is_ok(), cfg!(windows));
        s.show_cursor = false;
        s.jpeg_quality = 0;
        assert!(validate(&s).is_err());
    }
    #[test]
    fn upload_urls_require_https_and_no_credentials() {
        for u in [
            "http://example.com",
            "javascript:alert(1)",
            "https://user:pass@example.com",
            "file:///secret",
        ] {
            assert!(https_url(u).is_err());
        }
        assert!(https_url("https://example.com/share/123").is_ok());
    }
    #[test]
    fn image_export_roundtrips_png_and_jpeg() {
        let img = image::DynamicImage::ImageRgba8(image::RgbaImage::from_pixel(
            12,
            8,
            image::Rgba([40, 90, 120, 255]),
        ));
        let mut s = Settings::default();
        let png = encode(&img, &s).unwrap();
        let data = format!("data:image/png;base64,{}", STANDARD.encode(&png));
        assert_eq!(decode(&data).unwrap().width(), 12);
        s.format = "jpeg".into();
        let jpg = encode(&img, &s).unwrap();
        assert_eq!(image::load_from_memory(&jpg).unwrap().height(), 8);
        assert!(decode("data:image/png;base64,bad").is_err());
    }
}
#[tauri::command]
async fn upload_image(app: tauri::AppHandle, data_url: String) -> Result<String> {
    let capture_id = current_capture_id(&app)?;
    let s = get_settings(app.clone());
    if s.upload_provider == "lightshot" {
        return Err("Bu sürüm için desteklenen bir Prnt.sc/Lightshot yükleme API'si doğrulanamadı. Doğrudan yükleme şu anda kullanılamıyor. Özel HTTPS yükleme sunucusu ayarlayın veya dosyayı kaydedip prnt.sc üzerinden yükleyin.".into());
    }
    let endpoint = https_url(&s.upload_endpoint)?;
    let settings = s.clone();
    let bytes =
        tauri::async_runtime::spawn_blocking(move || encode(&decode(&data_url)?, &settings))
            .await
            .map_err(error)??;
    let mut builder = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(45))
        .redirect(reqwest::redirect::Policy::none());
    if !s.proxy_url.is_empty() {
        builder = builder.proxy(reqwest::Proxy::all(&s.proxy_url).map_err(error)?);
    }
    let ext = if s.format == "jpeg" { "jpg" } else { "png" };
    let mime = if s.format == "jpeg" {
        "image/jpeg"
    } else {
        "image/png"
    };
    let part = reqwest::multipart::Part::bytes(bytes)
        .file_name(format!("byshoot.{ext}"))
        .mime_str(mime)
        .map_err(error)?;
    let mut response = builder
        .build()
        .map_err(error)?
        .post(endpoint)
        .multipart(reqwest::multipart::Form::new().part("image", part))
        .send()
        .await
        .map_err(|e| format!("Yükleme bağlantısı başarısız: {e}"))?;
    if !response.status().is_success() {
        return Err(format!(
            "Yükleme sunucusu hata döndürdü: {}",
            response.status()
        ));
    }
    let mut body = Vec::new();
    while let Some(chunk) = response.chunk().await.map_err(error)? {
        if body.len() + chunk.len() > 65536 {
            return Err("Sunucu yanıtı çok büyük".into());
        }
        body.extend_from_slice(&chunk);
    }
    let json: serde_json::Value = serde_json::from_slice(&body)
        .map_err(|_| "Sunucu JSON {\"url\":\"https://...\"} döndürmeli".to_string())?;
    let link = json
        .get("url")
        .and_then(|v| v.as_str())
        .ok_or("Yanıtta url alanı bulunamadı")?;
    https_url(link)?;
    if s.auto_copy_link {
        arboard::Clipboard::new()
            .map_err(error)?
            .set_text(link)
            .map_err(error)?;
    }
    history(&app, "upload", link.into());
    if s.close_after_upload {
        close_capture(app.clone(), Some(capture_id))?;
    }
    notify(&app, "ByShoot", "Görüntü yüklendi");
    Ok(link.into())
}
#[tauri::command]
fn get_history(app: tauri::AppHandle) -> Vec<HistoryEntry> {
    app.state::<AppState>().history.lock().unwrap().clone()
}
#[tauri::command]
fn open_location(app: tauri::AppHandle, location: String) -> Result<()> {
    let entries = get_history(app.clone());
    if !entries
        .iter()
        .any(|h| h.location == location && !location.is_empty())
    {
        return Err("Konum geçmişte bulunamadı".into());
    }
    if location.starts_with("https://") {
        https_url(&location)?;
        app.opener().open_url(location, None::<&str>).map_err(error)
    } else {
        let path = PathBuf::from(&location);
        if !path.is_file() {
            return Err("Dosya bulunamadı".into());
        }
        app.opener().reveal_item_in_dir(path).map_err(error)
    }
}
#[tauri::command]
fn quit_app(app: tauri::AppHandle) {
    // Tauri ultimately calls process::exit, which does not drop managed state.
    // Finalize the media container before even the fallback immediate exit.
    recording::shutdown(&app);
    app.exit(0)
}
fn should_show_main(args: &[String]) -> bool {
    !args.iter().any(|arg| arg == "--background")
}

fn centered_in_work_area(origin: (i32, i32), area: (u32, u32), size: (u32, u32)) -> (i32, i32) {
    // Saturation also handles a window larger than a small display: its title
    // bar remains reachable instead of being placed above or left of the screen.
    (
        origin
            .0
            .saturating_add((area.0.saturating_sub(size.0) / 2) as i32),
        origin
            .1
            .saturating_add((area.1.saturating_sub(size.1) / 2) as i32),
    )
}

fn pointer_monitor(
    app: &tauri::AppHandle,
    window: &tauri::WebviewWindow,
) -> Result<tauri::Monitor> {
    let pointer = capture_cursor(window)?;
    app.monitor_from_point(pointer.x, pointer.y)
        .map_err(error)?
        .or(app.primary_monitor().map_err(error)?)
        .ok_or("Ekran bulunamadı".into())
}

fn show_main_on_pointer_monitor(app: &tauri::AppHandle) -> Result<()> {
    let window = app
        .get_webview_window("main")
        .ok_or("Ana pencere hazır değil")?;
    let position = window.outer_position().map_err(error)?;
    let size = window.outer_size().map_err(error)?;
    let on_one_monitor = app
        .available_monitors()
        .map_err(error)?
        .iter()
        .any(|monitor| {
            let area = monitor.work_area();
            rect_contained(
                (position.x, position.y, size.width, size.height),
                (
                    area.position.x,
                    area.position.y,
                    area.size.width,
                    area.size.height,
                ),
            )
        });
    // An already visible utility belongs where the user put it. Reopening it
    // from the tray follows the monitor where the action was initiated.
    if !window.is_visible().map_err(error)?
        || window.is_minimized().map_err(error)?
        || !on_one_monitor
    {
        let monitor = pointer_monitor(app, &window)?;
        let area = monitor.work_area();
        // Move first so Windows applies the destination monitor's DPI before
        // reading the physical frame size used for centering.
        window.set_position(area.position).map_err(error)?;
        let size = window.outer_size().map_err(error)?;
        let (x, y) = centered_in_work_area(
            (area.position.x, area.position.y),
            (area.size.width, area.size.height),
            (size.width, size.height),
        );
        window
            .set_position(tauri::PhysicalPosition::new(x, y))
            .map_err(error)?;
    }
    window.unminimize().map_err(error)?;
    window.show().map_err(error)?;
    window.set_focus().map_err(error)
}

fn rect_contained(rect: (i32, i32, u32, u32), area: (i32, i32, u32, u32)) -> bool {
    i64::from(rect.0) >= i64::from(area.0)
        && i64::from(rect.1) >= i64::from(area.1)
        && i64::from(rect.0) + i64::from(rect.2) <= i64::from(area.0) + i64::from(area.2)
        && i64::from(rect.1) + i64::from(rect.3) <= i64::from(area.1) + i64::from(area.3)
}

#[cfg(windows)]
fn capture_dialog_parent(
    app: &tauri::AppHandle,
    overlay: &tauri::WebviewWindow,
) -> Result<tauri::WebviewWindow> {
    let anchor = app
        .get_webview_window("capture-dialog-owner")
        .ok_or("Dosya penceresi hazır değil")?;
    let monitor = pointer_monitor(app, overlay)?;
    let area = monitor.work_area();
    anchor.set_position(area.position).map_err(error)?;
    anchor.set_size(area.size).map_err(error)?;
    Ok(anchor)
}
fn startup_enabled(app: &tauri::AppHandle) -> Result<bool> {
    #[cfg(windows)]
    {
        let _ = app;
        startup::is_enabled()
    }
    #[cfg(not(windows))]
    {
        app.autolaunch().is_enabled().map_err(error)
    }
}
fn set_startup(app: &tauri::AppHandle, enabled: bool) -> Result<()> {
    #[cfg(windows)]
    {
        let _ = app;
        startup::set(enabled)
    }
    #[cfg(not(windows))]
    {
        if enabled {
            app.autolaunch().enable().map_err(error)
        } else {
            app.autolaunch().disable().map_err(error)
        }
    }
}
fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, args, _| {
            if !should_show_main(&args) {
                return;
            }
            let _ = show_main_on_pointer_monitor(app);
        }))
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            Some(vec!["--background"]),
        ))
        .manage(AppState {
            settings: Mutex::new(Settings::default()),
            capture: Mutex::new(None),
            history: Mutex::new(vec![]),
            busy: AtomicBool::new(false),
            settings_busy: Mutex::new(()),
            shortcut_error: Mutex::new(None),
        })
        .manage(recording::RecordingState::default())
        .setup(|app| {
            let handle = app.handle();
            let s = read::<Settings>(handle, "settings.json")
                .filter(|s| validate(s).is_ok())
                .unwrap_or_default();
            *app.state::<AppState>().settings.lock().unwrap() = s.clone();
            *app.state::<AppState>().history.lock().unwrap() =
                read(handle, "history.json").unwrap_or_default();
            let overlay = tauri::WebviewWindowBuilder::new(
                app,
                "capture",
                tauri::WebviewUrl::App("index.html?capture=1".into()),
            )
            .title("ByShoot Capture")
            .visible(false)
            .decorations(false)
            .shadow(false)
            .resizable(false)
            .always_on_top(true)
            .skip_taskbar(true)
            .build()?;
            #[cfg(target_os = "windows")]
            if let Err(e) = disable_capture_transitions(&overlay) {
                eprintln!("{e}");
            }
            // Invisible, monitor-sized native owner for file dialogs. Its owner
            // is the always-on-top capture window, preserving the z-order chain
            // without using the virtual desktop's center as a dialog location.
            #[cfg(windows)]
            tauri::WebviewWindowBuilder::new(
                app,
                "capture-dialog-owner",
                tauri::WebviewUrl::External(url::Url::parse("about:blank")?),
            )
            .title("ByShoot")
            .visible(false)
            .decorations(false)
            .shadow(false)
            .skip_taskbar(true)
            .always_on_top(true)
            .parent(&overlay)?
            .build()?;
            #[cfg(not(target_os = "windows"))]
            let _ = overlay;
            if s.launch_at_startup {
                if let Err(e) = set_startup(handle, true) {
                    notify(
                        handle,
                        "ByShoot",
                        &format!("Başlangıç kaydı güncellenemedi: {e}"),
                    );
                }
            }
            if let Err(e) = register(handle, &s) {
                *app.state::<AppState>().shortcut_error.lock().unwrap() = Some(e.clone());
                let _ = handle.global_shortcut().unregister_all();
                let _ = handle.emit("capture-error", &e);
                eprintln!("Global shortcuts unavailable: {e}");
                notify(
                    handle,
                    "ByShoot",
                    &format!("Kısayollar kaydedilemedi: {e}. Ayarlardan değiştirin."),
                );
            }
            use tauri::menu::{Menu, MenuItem};
            let capture = MenuItem::with_id(app, "capture", "Alan yakala", true, None::<&str>)?;
            let settings = MenuItem::with_id(app, "settings", "Ayarlar", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "Çıkış", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&capture, &settings, &quit])?;
            let mut tray = tauri::tray::TrayIconBuilder::new()
                .tooltip("ByShoot")
                .menu(&menu)
                .on_menu_event(|app, event| match event.id().as_ref() {
                    "capture" => {
                        let a = app.clone();
                        tauri::async_runtime::spawn(async move {
                            if let Err(e) = start_capture(a.clone(), "region".into()).await {
                                notify(&a, "ByShoot", &e);
                            }
                        });
                    }
                    "settings" => {
                        let _ = show_main_on_pointer_monitor(app);
                        if let Some(w) = app.get_webview_window("main") {
                            let _ = w.emit("settings-requested", ());
                        }
                    }
                    "quit" => quit_app(app.clone()),
                    _ => {}
                });
            if let Some(icon) = app.default_window_icon() {
                tray = tray.icon(icon.clone());
            }
            tray.build(app)?;
            if should_show_main(&std::env::args().collect::<Vec<_>>()) {
                show_main_on_pointer_monitor(handle).map_err(std::io::Error::other)?;
            }
            Ok(())
        })
        .on_window_event(|w, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = w.hide();
                if w.label() == "capture" {
                    *w.state::<AppState>().capture.lock().unwrap() = None;
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            get_settings,
            get_native_status,
            save_settings,
            start_capture,
            get_capture,
            present_capture,
            abort_capture,
            copy_image,
            save_image,
            upload_image,
            close_capture,
            get_history,
            open_location,
            quit_app,
            recording::recording_sources,
            recording::recording_status,
            recording::start_recording,
            recording::stop_recording,
            recording::save_recording
        ])
        .build(tauri::generate_context!())
        .expect("ByShoot desktop runtime failed")
        .run(|app, event| {
            // Covers orderly OS/runtime exits as well as the explicit quit
            // controls. shutdown is idempotent when the session is finalized.
            if let tauri::RunEvent::Exit = event {
                recording::shutdown(app);
            }
        });
}
