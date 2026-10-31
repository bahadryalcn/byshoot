//! One frozen image of the complete desktop, including negative monitor origins.
use image::{imageops, RgbaImage};

const MAX_EDGE: u32 = 32_768;
const MAX_PIXELS: u64 = 64_000_000;

pub struct DesktopFrame {
    pub image: RgbaImage,
    pub origin_x: i32,
    pub origin_y: i32,
    /// Pixels per desktop coordinate: physical Windows coordinates, logical macOS points.
    pub coordinate_scale: f64,
    pub monitors: Vec<DesktopRect>,
}

#[derive(Clone, Copy, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DesktopRect {
    pub x: u32,
    pub y: u32,
    pub width: u32,
    pub height: u32,
}

#[derive(Clone, Copy)]
struct Bounds {
    x: i32,
    y: i32,
    width: u32,
    height: u32,
}

struct Layout {
    origin_x: i32,
    origin_y: i32,
    width: u32,
    height: u32,
    scale: f64,
}

fn checked_layout(bounds: &[Bounds], scale: f64) -> Result<Layout, String> {
    if bounds.is_empty() {
        return Err("Ekran bulunamadı.".into());
    }
    if !scale.is_finite() || scale <= 0.0 {
        return Err("Geçersiz ekran ölçeği.".into());
    }
    if bounds.iter().any(|b| b.width == 0 || b.height == 0) {
        return Err("Geçersiz ekran boyutu.".into());
    }
    let origin_x = bounds.iter().map(|b| b.x).min().unwrap();
    let origin_y = bounds.iter().map(|b| b.y).min().unwrap();
    let right = bounds
        .iter()
        .map(|b| i64::from(b.x) + i64::from(b.width))
        .max()
        .unwrap();
    let bottom = bounds
        .iter()
        .map(|b| i64::from(b.y) + i64::from(b.height))
        .max()
        .unwrap();
    let width = ((right - i64::from(origin_x)) as f64 * scale).round();
    let height = ((bottom - i64::from(origin_y)) as f64 * scale).round();
    if width < 1.0
        || height < 1.0
        || width > f64::from(MAX_EDGE)
        || height > f64::from(MAX_EDGE)
        || width * height > MAX_PIXELS as f64
    {
        return Err(
            "Tüm ekranların birleşik görüntüsü çok büyük (en fazla 64 milyon piksel).".into(),
        );
    }
    Ok(Layout {
        origin_x,
        origin_y,
        width: width as u32,
        height: height as u32,
        scale,
    })
}

fn allocate_desktop(layout: &Layout) -> Result<RgbaImage, String> {
    let length = layout.width as usize * layout.height as usize * 4;
    let mut pixels = Vec::new();
    pixels
        .try_reserve_exact(length)
        .map_err(|_| "Ekran görüntüsü için yeterli bellek yok.".to_string())?;
    pixels.resize(length, 0);
    // Nonexistent desktop areas between screens remain opaque black.
    for alpha in pixels.iter_mut().skip(3).step_by(4) {
        *alpha = 255;
    }
    RgbaImage::from_raw(layout.width, layout.height, pixels)
        .ok_or_else(|| "Ekran görüntüsü oluşturulamadı.".to_string())
}

fn place_image(
    desktop: &mut RgbaImage,
    layout: &Layout,
    bounds: Bounds,
    image: RgbaImage,
) -> Result<(), String> {
    if image.width() == 0 || image.height() == 0 {
        return Err("Bir ekranın görüntüsü boş döndü.".into());
    }
    // Round shared endpoints rather than independent widths, so adjacent screens
    // cannot gain a seam at fractional scale factors.
    let x =
        ((i64::from(bounds.x) - i64::from(layout.origin_x)) as f64 * layout.scale).round() as u32;
    let y =
        ((i64::from(bounds.y) - i64::from(layout.origin_y)) as f64 * layout.scale).round() as u32;
    let right = ((i64::from(bounds.x) + i64::from(bounds.width) - i64::from(layout.origin_x))
        as f64
        * layout.scale)
        .round() as u32;
    let bottom = ((i64::from(bounds.y) + i64::from(bounds.height) - i64::from(layout.origin_y))
        as f64
        * layout.scale)
        .round() as u32;
    let width = right - x;
    let height = bottom - y;
    if right > desktop.width() || bottom > desktop.height() || width == 0 || height == 0 {
        return Err("Ekran yerleşimi görüntü sınırlarını aşıyor.".into());
    }
    if image.width() == width && image.height() == height {
        imageops::replace(desktop, &image, i64::from(x), i64::from(y));
    } else {
        let normalized = imageops::resize(&image, width, height, imageops::FilterType::Triangle);
        imageops::replace(desktop, &normalized, i64::from(x), i64::from(y));
    }
    Ok(())
}

fn monitor_rect(layout: &Layout, bounds: Bounds) -> DesktopRect {
    let x =
        ((i64::from(bounds.x) - i64::from(layout.origin_x)) as f64 * layout.scale).round() as u32;
    let y =
        ((i64::from(bounds.y) - i64::from(layout.origin_y)) as f64 * layout.scale).round() as u32;
    let right = ((i64::from(bounds.x) + i64::from(bounds.width) - i64::from(layout.origin_x))
        as f64
        * layout.scale)
        .round() as u32;
    let bottom = ((i64::from(bounds.y) + i64::from(bounds.height) - i64::from(layout.origin_y))
        as f64
        * layout.scale)
        .round() as u32;
    DesktopRect {
        x,
        y,
        width: right - x,
        height: bottom - y,
    }
}

pub fn capture_desktop() -> Result<DesktopFrame, String> {
    let monitors = xcap::Monitor::all().map_err(|e| e.to_string())?;
    let mut bounds = Vec::with_capacity(monitors.len());
    #[allow(unused_mut)]
    let mut coordinate_scale: f64 = 1.0;
    for monitor in &monitors {
        bounds.push(Bounds {
            x: monitor.x().map_err(|e| e.to_string())?,
            y: monitor.y().map_err(|e| e.to_string())?,
            width: monitor.width().map_err(|e| e.to_string())?,
            height: monitor.height().map_err(|e| e.to_string())?,
        });
        #[cfg(target_os = "macos")]
        {
            let scale = f64::from(monitor.scale_factor().map_err(|e| e.to_string())?);
            if !scale.is_finite() || scale <= 0.0 {
                return Err("Geçersiz ekran ölçeği.".into());
            }
            coordinate_scale = coordinate_scale.max(scale);
        }
    }
    let layout = checked_layout(&bounds, coordinate_scale)?;
    let rectangles = bounds
        .iter()
        .map(|bounds| monitor_rect(&layout, *bounds))
        .collect();
    let mut image = allocate_desktop(&layout)?;
    for (monitor, bounds) in monitors.iter().zip(bounds) {
        let frame = monitor.capture_image().map_err(|e| e.to_string())?;
        place_image(&mut image, &layout, bounds, frame)?;
    }
    Ok(DesktopFrame {
        image,
        origin_x: layout.origin_x,
        origin_y: layout.origin_y,
        coordinate_scale,
        monitors: rectangles,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use image::Rgba;
    fn b(x: i32, y: i32, width: u32, height: u32) -> Bounds {
        Bounds {
            x,
            y,
            width,
            height,
        }
    }
    fn compose(screens: &[(Bounds, RgbaImage)], scale: f64) -> DesktopFrame {
        let layout =
            checked_layout(&screens.iter().map(|(b, _)| *b).collect::<Vec<_>>(), scale).unwrap();
        let mut image = allocate_desktop(&layout).unwrap();
        for (bounds, pixels) in screens {
            place_image(&mut image, &layout, *bounds, pixels.clone()).unwrap();
        }
        DesktopFrame {
            image,
            origin_x: layout.origin_x,
            origin_y: layout.origin_y,
            coordinate_scale: scale,
            monitors: screens
                .iter()
                .map(|(bounds, _)| monitor_rect(&layout, *bounds))
                .collect(),
        }
    }
    fn solid(width: u32, height: u32, color: [u8; 4]) -> RgbaImage {
        RgbaImage::from_pixel(width, height, Rgba(color))
    }

    #[test]
    fn three_monitors_share_a_continuous_desktop() {
        let frame = compose(
            &[
                (b(0, 0, 3, 2), solid(3, 2, [255, 0, 0, 255])),
                (b(3, 0, 4, 2), solid(4, 2, [0, 255, 0, 255])),
                (b(7, 0, 2, 2), solid(2, 2, [0, 0, 255, 255])),
            ],
            1.0,
        );
        assert_eq!(frame.image.dimensions(), (9, 2));
        assert_eq!(frame.image.get_pixel(2, 1).0, [255, 0, 0, 255]);
        assert_eq!(frame.image.get_pixel(3, 1).0, [0, 255, 0, 255]);
        assert_eq!(frame.image.get_pixel(7, 1).0, [0, 0, 255, 255]);
    }

    #[test]
    fn negative_origins_and_different_sizes_preserve_gaps() {
        let frame = compose(
            &[
                (b(-3, 1, 3, 2), solid(3, 2, [255, 0, 0, 255])),
                (b(0, 0, 4, 3), solid(4, 3, [0, 255, 0, 255])),
                (b(1, -2, 2, 2), solid(2, 2, [0, 0, 255, 255])),
            ],
            1.0,
        );
        assert_eq!((frame.origin_x, frame.origin_y), (-3, -2));
        assert_eq!(frame.image.dimensions(), (7, 5));
        assert_eq!(frame.image.get_pixel(0, 0).0, [0, 0, 0, 255]);
        assert_eq!(frame.image.get_pixel(0, 3).0, [255, 0, 0, 255]);
        assert_eq!(frame.image.get_pixel(3, 2).0, [0, 255, 0, 255]);
        assert_eq!(frame.image.get_pixel(4, 0).0, [0, 0, 255, 255]);
    }

    #[test]
    fn mixed_retina_density_is_normalized_in_logical_coordinates() {
        let frame = compose(
            &[
                (b(-2, 0, 2, 2), solid(2, 2, [255, 0, 0, 255])),
                (b(0, 0, 3, 2), solid(6, 4, [0, 255, 0, 255])),
            ],
            2.0,
        );
        assert_eq!(frame.image.dimensions(), (10, 4));
        assert_eq!(frame.coordinate_scale, 2.0);
        assert_eq!(frame.image.get_pixel(3, 3).0, [255, 0, 0, 255]);
        assert_eq!(frame.image.get_pixel(4, 3).0, [0, 255, 0, 255]);
    }

    #[test]
    fn fractional_scale_uses_shared_edges_without_seams() {
        let frame = compose(
            &[
                (b(0, 0, 3, 2), solid(3, 2, [255, 0, 0, 255])),
                (b(3, 0, 3, 2), solid(3, 2, [0, 255, 0, 255])),
            ],
            1.25,
        );
        assert_eq!(frame.image.dimensions(), (8, 3));
        assert_eq!(frame.image.get_pixel(3, 1).0, [255, 0, 0, 255]);
        assert_eq!(frame.image.get_pixel(4, 1).0, [0, 255, 0, 255]);
    }

    #[test]
    fn invalid_or_excessive_desktops_are_rejected_before_allocation() {
        assert!(checked_layout(&[], 1.0).is_err());
        assert!(checked_layout(&[b(0, 0, 0, 1)], 1.0).is_err());
        assert!(checked_layout(&[b(i32::MIN, 0, 1, 1), b(i32::MAX, 0, 1, 1)], 1.0).is_err());
        assert!(checked_layout(&[b(0, 0, 16_000, 8_000)], 1.0).is_err());
        assert!(checked_layout(&[b(0, 0, 1, 1)], f64::NAN).is_err());
    }

    #[test]
    #[ignore = "Requires desktop screen-recording access; captures only in memory"]
    fn actual_desktop_capture_smoke() {
        let monitors = xcap::Monitor::all().expect("enumerate physical monitors");
        eprintln!("Desktop monitor count: {}", monitors.len());
        for monitor in monitors {
            eprintln!(
                "Monitor bounds: x={} y={} width={} height={} scale={}",
                monitor.x().unwrap(),
                monitor.y().unwrap(),
                monitor.width().unwrap(),
                monitor.height().unwrap(),
                monitor.scale_factor().unwrap()
            );
        }
        let started = std::time::Instant::now();
        let frame = capture_desktop().expect("capture complete desktop");
        eprintln!(
            "Desktop frame: origin=({}, {}) size={}x{} coordinate_scale={} elapsed_ms={}",
            frame.origin_x,
            frame.origin_y,
            frame.image.width(),
            frame.image.height(),
            frame.coordinate_scale,
            started.elapsed().as_millis()
        );
        assert!(!frame.monitors.is_empty());
        assert!(frame.image.width() > 0 && frame.image.height() > 0);
    }
}
