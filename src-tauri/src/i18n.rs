#[derive(Clone, Copy)]
pub enum Key {
    TrayCapture,
    TraySettings,
    TrayQuit,
    TrayTooltip,
    CaptureTitle,
    CaptureFailed,
    ShortcutsFailed,
    ImageCopied,
    ImageSaved,
    ImageUploaded,
    SaveImage,
    ImageFilter,
    SaveRecording,
    RecordingFilter,
}

const TR: [&str; 14] = [
    "Alan yakala",
    "Ayarlar",
    "Çıkış",
    "ByShoot - Ekran yakalama",
    "ByShoot - Ekran yakalama",
    "Ekran yakalanamadı. Ayrıntılar için uygulamayı kontrol edin.",
    "Kısayollar kaydedilemedi. Ayarlardan değiştirin.",
    "Görüntü panoya kopyalandı",
    "Görüntü kaydedildi",
    "Görüntü yüklendi",
    "Ekran görüntüsünü kaydet",
    "Görüntü",
    "Kaydı kaydet",
    "Kayıt",
];
const EN: [&str; 14] = [
    "Capture region",
    "Settings",
    "Quit",
    "ByShoot - Screen capture",
    "ByShoot - Screen capture",
    "Screen capture failed. Check the app for details.",
    "Could not register shortcuts. Change them in Settings.",
    "Image copied to clipboard",
    "Image saved",
    "Image uploaded",
    "Save screenshot",
    "Image",
    "Save recording",
    "Recording",
];

pub fn text(language: &str, key: Key) -> &'static str {
    let messages = if language == "en" { &EN } else { &TR };
    messages[key as usize]
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn languages_cover_the_same_keys() {
        let keys = [
            Key::TrayCapture,
            Key::TraySettings,
            Key::TrayQuit,
            Key::TrayTooltip,
            Key::CaptureTitle,
            Key::CaptureFailed,
            Key::ShortcutsFailed,
            Key::ImageCopied,
            Key::ImageSaved,
            Key::ImageUploaded,
            Key::SaveImage,
            Key::ImageFilter,
            Key::SaveRecording,
            Key::RecordingFilter,
        ];
        assert_eq!(keys.len(), TR.len());
        assert_eq!(TR.len(), EN.len());
        for key in keys {
            assert!(!text("tr", key).is_empty());
            assert!(!text("en", key).is_empty());
        }
    }
}
