//! Capture the real system cursor before showing the selection overlay.
use image::{imageops::FilterType, Rgba, RgbaImage};

pub struct CursorFrame {
    pub image: RgbaImage,
    pub x: i32,
    pub y: i32,
    /// Raster pixels per global coordinate unit (Windows coordinates are physical).
    pub coordinate_scale: f64,
    inverted: Vec<bool>,
}

pub fn snapshot() -> Result<Option<CursorFrame>, String> {
    #[cfg(target_os = "windows")]
    {
        windows::snapshot()
    }
    #[cfg(not(target_os = "windows"))]
    {
        Err("Bu platformda sistem imleci yakalama henüz desteklenmiyor.".into())
    }
}

/// Composite in the screenshot's coordinate space, clipping at every desktop edge.
pub fn draw_on(
    frame: &CursorFrame,
    target: &mut RgbaImage,
    origin_x: f64,
    origin_y: f64,
    coordinate_scale: f64,
) {
    let ratio = coordinate_scale / frame.coordinate_scale;
    if !ratio.is_finite() || ratio <= 0.0 {
        return;
    }
    let width = (frame.image.width() as f64 * ratio).round().max(1.0) as u32;
    let height = (frame.image.height() as f64 * ratio).round().max(1.0) as u32;
    let image = image::imageops::resize(&frame.image, width, height, FilterType::Nearest);
    let left = ((frame.x as f64 - origin_x) * coordinate_scale).round() as i64;
    let top = ((frame.y as f64 - origin_y) * coordinate_scale).round() as i64;
    for (x, y, pixel) in image.enumerate_pixels() {
        let (tx, ty) = (left + x as i64, top + y as i64);
        if tx < 0 || ty < 0 || tx >= target.width() as i64 || ty >= target.height() as i64 {
            continue;
        }
        let source_x = ((x as f64 / ratio).floor() as u32).min(frame.image.width() - 1);
        let source_y = ((y as f64 / ratio).floor() as u32).min(frame.image.height() - 1);
        let inverted = frame.inverted[(source_y * frame.image.width() + source_x) as usize];
        let destination = target.get_pixel_mut(tx as u32, ty as u32);
        if inverted {
            for channel in 0..3 {
                destination[channel] = 255 - destination[channel];
            }
        } else {
            let alpha = pixel[3] as u32;
            let destination_alpha = destination[3] as u32;
            let output_alpha = alpha * 255 + destination_alpha * (255 - alpha);
            for channel in 0..3 {
                destination[channel] = if output_alpha == 0 {
                    0
                } else {
                    ((pixel[channel] as u32 * alpha * 255
                        + destination[channel] as u32 * destination_alpha * (255 - alpha)
                        + output_alpha / 2)
                        / output_alpha) as u8
                };
            }
            destination[3] = ((output_alpha + 127) / 255) as u8;
        }
    }
}

/// DrawIconEx supports both alpha cursors and the older AND/XOR cursor format.
/// Two backgrounds distinguish transparent, opaque, blended, and inverted pixels.
fn decode_cursor(black: &[u8], white: &[u8], width: u32, height: u32) -> (RgbaImage, Vec<bool>) {
    let mut image = RgbaImage::new(width, height);
    let mut inverted = vec![false; (width * height) as usize];
    for (index, pixel) in image.pixels_mut().enumerate() {
        let offset = index * 4;
        let b = &black[offset..offset + 3];
        let w = &white[offset..offset + 3];
        if (0..3).any(|c| w[c] < b[c]) {
            inverted[index] = true;
            continue;
        }
        let alpha = 255 - (w[0] as u16 - b[0] as u16);
        let channel = |c: usize| {
            if alpha == 0 {
                0
            } else {
                ((b[c] as u32 * 255 + alpha as u32 / 2) / alpha as u32).min(255) as u8
            }
        };
        *pixel = Rgba([channel(2), channel(1), channel(0), alpha as u8]);
    }
    (image, inverted)
}

#[cfg(target_os = "windows")]
mod windows {
    use super::*;
    use std::{
        ffi::c_void,
        mem::{size_of, zeroed},
        ptr::null_mut,
    };
    type Handle = *mut c_void;
    #[repr(C)]
    struct Point {
        x: i32,
        y: i32,
    }
    #[repr(C)]
    struct CursorInfo {
        size: u32,
        flags: u32,
        cursor: Handle,
        position: Point,
    }
    #[repr(C)]
    struct IconInfo {
        is_icon: i32,
        hotspot_x: u32,
        hotspot_y: u32,
        mask: Handle,
        color: Handle,
    }
    #[repr(C)]
    struct Bitmap {
        kind: i32,
        width: i32,
        height: i32,
        stride: i32,
        planes: u16,
        depth: u16,
        bits: Handle,
    }
    #[repr(C)]
    struct BitmapHeader {
        size: u32,
        width: i32,
        height: i32,
        planes: u16,
        depth: u16,
        compression: u32,
        image_size: u32,
        x_density: i32,
        y_density: i32,
        colors: u32,
        important: u32,
    }
    #[repr(C)]
    struct BitmapInfo {
        header: BitmapHeader,
        colors: [u32; 1],
    }
    #[link(name = "user32")]
    extern "system" {
        fn GetCursorInfo(info: *mut CursorInfo) -> i32;
        fn CopyIcon(icon: Handle) -> Handle;
        fn GetIconInfo(icon: Handle, info: *mut IconInfo) -> i32;
        fn DestroyIcon(icon: Handle) -> i32;
        fn DrawIconEx(
            dc: Handle,
            x: i32,
            y: i32,
            icon: Handle,
            width: i32,
            height: i32,
            frame: u32,
            brush: Handle,
            flags: u32,
        ) -> i32;
    }
    #[link(name = "gdi32")]
    extern "system" {
        fn CreateCompatibleDC(dc: Handle) -> Handle;
        fn DeleteDC(dc: Handle) -> i32;
        fn DeleteObject(object: Handle) -> i32;
        fn GetObjectW(object: Handle, length: i32, result: *mut c_void) -> i32;
        fn CreateDIBSection(
            dc: Handle,
            info: *const BitmapInfo,
            usage: u32,
            bits: *mut Handle,
            section: Handle,
            offset: u32,
        ) -> Handle;
        fn SelectObject(dc: Handle, object: Handle) -> Handle;
        fn GdiFlush() -> i32;
    }
    struct Icon(Handle);
    impl Drop for Icon {
        fn drop(&mut self) {
            unsafe {
                DestroyIcon(self.0);
            }
        }
    }
    struct Object(Handle);
    impl Drop for Object {
        fn drop(&mut self) {
            if !self.0.is_null() {
                unsafe {
                    DeleteObject(self.0);
                }
            }
        }
    }
    struct Dc(Handle);
    impl Drop for Dc {
        fn drop(&mut self) {
            unsafe {
                DeleteDC(self.0);
            }
        }
    }
    struct Selected {
        dc: Handle,
        previous: Handle,
    }
    impl Drop for Selected {
        fn drop(&mut self) {
            unsafe {
                SelectObject(self.dc, self.previous);
            }
        }
    }
    fn failure(operation: &str) -> String {
        format!(
            "İmleç yakalanamadı ({operation}): {}",
            std::io::Error::last_os_error()
        )
    }

    pub fn snapshot() -> Result<Option<CursorFrame>, String> {
        unsafe {
            let mut cursor: CursorInfo = zeroed();
            cursor.size = size_of::<CursorInfo>() as u32;
            if GetCursorInfo(&mut cursor) == 0 {
                return Err(failure("GetCursorInfo"));
            }
            if cursor.flags & 1 == 0 || cursor.cursor.is_null() {
                return Ok(None);
            }
            let copied = Icon(CopyIcon(cursor.cursor));
            if copied.0.is_null() {
                return Err(failure("CopyIcon"));
            }
            let mut info: IconInfo = zeroed();
            if GetIconInfo(copied.0, &mut info) == 0 {
                return Err(failure("GetIconInfo"));
            }
            let _mask = Object(info.mask);
            let _color = Object(info.color);
            let mut bitmap: Bitmap = zeroed();
            let dimensions = if info.color.is_null() {
                info.mask
            } else {
                info.color
            };
            if GetObjectW(
                dimensions,
                size_of::<Bitmap>() as i32,
                &mut bitmap as *mut _ as Handle,
            ) == 0
            {
                return Err(failure("GetObject"));
            }
            let width = bitmap.width;
            let height = bitmap.height.abs() / if info.color.is_null() { 2 } else { 1 };
            if width <= 0 || height <= 0 || width > 4096 || height > 4096 {
                return Err("Geçersiz sistem imleci boyutu.".into());
            }
            let dc = Dc(CreateCompatibleDC(null_mut()));
            if dc.0.is_null() {
                return Err(failure("CreateCompatibleDC"));
            }
            let mut dib_info: BitmapInfo = zeroed();
            dib_info.header = BitmapHeader {
                size: size_of::<BitmapHeader>() as u32,
                width,
                height: -height,
                planes: 1,
                depth: 32,
                compression: 0,
                image_size: 0,
                x_density: 0,
                y_density: 0,
                colors: 0,
                important: 0,
            };
            let mut bits: Handle = null_mut();
            let dib = Object(CreateDIBSection(
                dc.0,
                &dib_info,
                0,
                &mut bits,
                null_mut(),
                0,
            ));
            if dib.0.is_null() || bits.is_null() {
                return Err(failure("CreateDIBSection"));
            }
            let previous = SelectObject(dc.0, dib.0);
            if previous.is_null() || previous as isize == -1 {
                return Err(failure("SelectObject"));
            }
            let _selection = Selected { dc: dc.0, previous };
            let pixels = std::slice::from_raw_parts_mut(
                bits as *mut u8,
                width as usize * height as usize * 4,
            );
            let mut render = |background: u8| -> Result<Vec<u8>, String> {
                pixels.fill(background);
                if DrawIconEx(dc.0, 0, 0, copied.0, width, height, 0, null_mut(), 3 | 0x10) == 0 {
                    return Err(failure("DrawIconEx"));
                }
                if GdiFlush() == 0 {
                    return Err(failure("GdiFlush"));
                }
                Ok(pixels.to_vec())
            };
            let black = render(0)?;
            let white = render(255)?;
            let (image, inverted) = decode_cursor(&black, &white, width as u32, height as u32);
            Ok(Some(CursorFrame {
                image,
                x: cursor.position.x - info.hotspot_x as i32,
                y: cursor.position.y - info.hotspot_y as i32,
                coordinate_scale: 1.0,
                inverted,
            }))
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[cfg(target_os = "windows")]
    #[test]
    #[ignore = "Requires an interactive Windows desktop; does not save or move the cursor"]
    fn system_cursor_smoke() {
        if let Some(frame) = snapshot().expect("read current system cursor") {
            assert!(frame.image.width() > 0 && frame.image.height() > 0);
            assert!(
                frame.image.pixels().any(|pixel| pixel[3] > 0)
                    || frame.inverted.iter().any(|pixel| *pixel)
            );
            println!(
                "Current cursor raster: {}x{}",
                frame.image.width(),
                frame.image.height()
            );
        } else {
            println!("System cursor is currently hidden.");
        }
    }
    #[test]
    fn reconstructs_alpha_opaque_transparent_and_xor() {
        let (image, inverted) = decode_cursor(
            &[0, 0, 0, 0, 10, 20, 30, 0, 32, 64, 96, 0, 255, 255, 255, 0],
            &[
                255, 255, 255, 0, 10, 20, 30, 0, 159, 191, 223, 0, 0, 0, 0, 0,
            ],
            4,
            1,
        );
        assert_eq!(image.get_pixel(0, 0)[3], 0);
        assert_eq!(*image.get_pixel(1, 0), Rgba([30, 20, 10, 255]));
        assert_eq!(*image.get_pixel(2, 0), Rgba([191, 128, 64, 128]));
        assert!(inverted[3]);
    }
    #[test]
    fn clips_negative_desktop_edges_and_preserves_inversion() {
        let frame = CursorFrame {
            image: RgbaImage::from_pixel(2, 2, Rgba([255, 0, 0, 255])),
            x: -11,
            y: -21,
            coordinate_scale: 1.0,
            inverted: vec![false, false, false, true],
        };
        let mut target = RgbaImage::from_pixel(2, 2, Rgba([20, 40, 60, 255]));
        draw_on(&frame, &mut target, -10.0, -20.0, 1.0);
        assert_eq!(*target.get_pixel(0, 0), Rgba([235, 215, 195, 255]));
        assert_eq!(*target.get_pixel(1, 1), Rgba([20, 40, 60, 255]));
    }
    #[test]
    fn scales_cursor_with_capture_coordinates() {
        let frame = CursorFrame {
            image: RgbaImage::from_pixel(1, 1, Rgba([255, 0, 0, 255])),
            x: 2,
            y: 1,
            coordinate_scale: 1.0,
            inverted: vec![false],
        };
        let mut target = RgbaImage::new(8, 6);
        draw_on(&frame, &mut target, 0.0, 0.0, 2.0);
        assert_eq!(*target.get_pixel(4, 2), Rgba([255, 0, 0, 255]));
        assert_eq!(*target.get_pixel(5, 3), Rgba([255, 0, 0, 255]));
        assert_eq!(*target.get_pixel(3, 2), Rgba([0, 0, 0, 0]));
    }
}
