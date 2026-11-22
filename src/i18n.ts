import type { Settings } from "./contracts";

export type Language = Settings["language"];

const tr = {
  // ── Settings ──────────────────────────────────────────────
  "settings.title": "Ayarlar",
  "settings.subtitle": "Ekran yakalama, tam istediğin gibi.",
  "settings.general": "Genel",
  "settings.keys": "Kısayollar",
  "settings.file": "Dosya",
  "settings.upload": "Yükleme ve vekil sunucu",
  "settings.save": "Değişiklikleri kaydet",
  "settings.cancel": "Vazgeç",
  "settings.saved": "Ayarlar kaydedildi.",
  "settings.saving": "Kaydediliyor…",
  "settings.desktop":
    "Önizleme modu · Ekran yakalama, sistem kısayolları ve başlangıç ayarları için masaüstü uygulaması gerekir.",
  "settings.system": "Sistem",
  "settings.startupHint": "Tepside sessizce başlar.",
  "settings.behavior": "Yakalama davranışı",
  "settings.autoCopyLink": "Yüklemeden sonra bağlantıyı kopyala",
  "settings.closeAfterUpload": "Yükleme tamamlanınca düzenleyiciyi kapat",
  "settings.notifications": "Kopyalama ve kaydetme bildirimlerini göster",
  "settings.rememberRegion": "Son seçilen alanı hatırla",
  "settings.showCursor": "İmleci ekran görüntüsüne ekle",
  "settings.cursorHint":
    "İmleç yakalama Windows masaüstü uygulamasında kullanılabilir",
  "settings.launchAtStartup": "Bilgisayar açıldığında başlat",
  "settings.language": "Uygulama dili",
  "settings.region": "Alan seç ve düzenle",
  "settings.fullscreenSave": "Tam ekranı hemen kaydet",
  "settings.fullscreenUpload": "Tam ekranı hemen yükle",
  "settings.keyHint":
    "Aynı işlem için birden fazla kısayol ekleyebilirsin. Bir kısayolu kaldırmak için × düğmesine bas. Liste boşsa işlem için kısayol kapalıdır.",
  "settings.add": "Kısayol ekle",
  "settings.removeShortcut": "Kısayolu kaldır: {key}",
  "settings.record": "Tuşlara bas… (Esc: iptal)",
  "settings.disabled": "Kısayol atanmadı",
  "settings.duplicate": "Bu kısayol başka bir işleme atanmış.",
  "settings.maxShortcuts": "Bir işlem için en fazla 12 kısayol eklenebilir.",
  "settings.unsupportedKey":
    "Bu tuş desteklenmiyor. Bir harf, rakam, işlev tuşu, sayısal tuş takımı tuşu veya PrintScreen kullan.",
  "settings.shortcutModifier":
    "Bu tuş için Ctrl, Alt veya Windows/⌘ tuşlarından birini de bas. Yalnızca PrintScreen ve F1–F24 tek başına kullanılabilir.",
  "settings.format": "Görüntü biçimi",
  "settings.quality": "JPEG kalitesi",
  "settings.directory": "Varsayılan kayıt klasörü",
  "settings.directoryHint": "Boş bırakılırsa her kayıtta konum seçilir.",
  "settings.provider": "Yükleme hizmeti",
  "settings.endpoint": "Özel HTTPS yükleme adresi",
  "settings.proxy": "Vekil sunucu (isteğe bağlı)",
  "settings.proxyHint":
    "Örnek: http://sunucu:8080. Bu sürümde kullanıcı adı/parola içeren vekil sunucular desteklenmiyor.",
  "settings.disclosure":
    "Yüklenen ekran görüntüleri herkese açık bir bağlantı oluşturur. Hassas bilgileri önce gizle. Tam ekran yükleme kısayolu, tüm ekran için paylaşım onayını açar; varsayılan olarak kapalıdır.",
  "settings.endpointError":
    "Özel yükleme adresi geçerli bir HTTPS adresi olmalı; kullanıcı adı/parola içermemeli.",
  "settings.proxyError":
    "Kullanıcı adı/parola içermeyen geçerli bir HTTP veya HTTPS vekil sunucu adresi gir.",
  "settings.reset": "Değişiklikler geri alındı.",
  "settings.unsaved": "Kaydedilmemiş değişiklikler",
  "settings.lightshotNote":
    "Prnt.sc (Lightshot) doğrudan yükleme için belgelenmiş bir API sunmuyor; bu yüzden seçilemez. Özel HTTPS sunucusu kullanabilir veya görüntüyü kaydedip prnt.sc üzerinden yükleyebilirsin.",
  "settings.lightshotError":
    "Lightshot yükleme hizmeti bu sürümde kullanılamıyor.",
  "settings.custom": "Özel sunucu",
  "settings.nativeOnly": "Masaüstü uygulamasında kullanılabilir",
  "settings.fileHint":
    "PNG keskin metinler için uygundur. JPEG daha küçük dosya üretir.",
  "settings.enabled": "Etkin",
  "settings.failed": "Ayarlar kaydedilemedi. ",

  // ── Editor ────────────────────────────────────────────────
  "editor.label": "Ekran görüntüsü düzenleyici",
  "editor.canvasLabel": "Alan seçmek veya çizmek için sürükleyin",
  "editor.guideSelect": "Yakalamak istediğiniz alanı seçin",
  "editor.cancel": "Vazgeç",
  "editor.toolsLabel": "Çizim araçları",
  "editor.actionsLabel": "Görüntü işlemleri",
  "editor.shareTitle": "Görüntüyü paylaş",
  "editor.shareDefaultBody":
    "Bu görüntü herkese açık bir bağlantıyla paylaşılır. Hassas bilgileri gizlediğinizden emin olun.",
  "editor.shareBody":
    "Görüntü ayarladığınız yükleme servisine gönderilecek: {endpoint}. Oluşturulan bağlantıya erişebilen kişiler görüntüyü görebilir. Hassas bilgileri gizlediğinizden emin olun.",
  "editor.shareConfirm": "Yükle ve bağlantı oluştur",
  "editor.noteLabel": "Not metni",
  "editor.notePlaceholder": "Notunuzu yazın…",
  "editor.tool.select": "Seç / taşı",
  "editor.tool.pen": "Kalem",
  "editor.tool.highlight": "Vurgula",
  "editor.tool.arrow": "Ok",
  "editor.tool.rectangle": "Dikdörtgen",
  "editor.tool.ellipse": "Elips",
  "editor.tool.text": "Not ekle",
  "editor.tool.marker": "Numara",
  "editor.tool.pixelate": "Pikselleştir",
  "editor.color": "Çizim rengi",
  "editor.width": "Çizgi kalınlığı",
  "editor.undo": "Geri al (Ctrl/Cmd+Z)",
  "editor.redo": "Yinele (Ctrl/Cmd+Shift+Z)",
  "editor.copy": "Kopyala",
  "editor.copyTitle": "Panoya kopyala (Ctrl/Cmd+C)",
  "editor.save": "Kaydet",
  "editor.saveTitle": "Dosyaya kaydet (Ctrl/Cmd+S)",
  "editor.share": "↑ Paylaş",
  "editor.shareButtonTitle": "Bağlantıyla paylaş",
  "editor.newArea": "Yeni alan",
  "editor.newAreaTitle": "Alanı yeniden seç",
  "editor.closeTitle": "Vazgeç (Esc)",
  "editor.copied": "Kopyalandı",
  "editor.copyFailed": "Kopyalanamadı",
  "editor.demoEnded": "Demo tamamlandı. Yeniden denemek için sayfayı yenileyin.",
  "editor.selectAreaFirst": "Önce bir alan seçin.",
  "editor.invalidArea": "Geçerli bir alan seçin.",
  "editor.uploadDemo":
    "Yükleme masaüstü uygulamasında kullanılabilir. Demo görüntüsü internete gönderilmedi.",
  "editor.shareDemo":
    "Bağlantıyla paylaşım masaüstü uygulamasında kullanılabilir. Demo görüntüsü internete gönderilmedi.",
  "editor.uploading": "Görüntü yükleniyor…",
  "editor.linkReady": "Paylaşım bağlantısı: {url}",
  "editor.linkReadyCopied":
    "Paylaşım bağlantısı (panoya kopyalandı): {url}",
  "editor.noEndpoint":
    "Önce Ayarlar → Yükleme ve vekil sunucu bölümünde bir yükleme servisi adresi ekleyin.",
  "editor.waiting": "Yakalama kısayolu bekleniyor",
  "editor.viewportTimeout":
    "Ekran ölçeği hazırlanamadı. Yakalamayı yeniden başlatın.",
  "editor.captureFailed": "Ekran yakalanamadı: {error}",
  "editor.demoTitle":
    "byshoot   /   Örnek çalışma alanı — bu gerçek ekran görüntünüz değildir",
  "editor.demoNav1": "Çalışma alanı",
  "editor.demoNav2": "Genel bakış",
  "editor.demoNav3": "Dosyalar",
  "editor.demoNav4": "Paylaşımlar",
  "editor.demoNav5": "Ayarlar",
  "editor.demoHeadline": "Fikri göster. Birlikte netleştir.",
  "editor.demoSub": "Alan seçin; oklar, şekiller ve notlarla anlatın.",
  "editor.demoHint": "DEMO · Hassas bilgiler için pikselleştirme aracını deneyin.",

  // ── Annotations ───────────────────────────────────────────
  "annotation.editTitle": "Notu düzenle",
  "annotation.editConfirm": "Notu güncelle",
  "annotation.addTitle": "Not ekle",
  "annotation.addConfirm": "Notu ekle",

  // ── Region picker ─────────────────────────────────────────
  "region.help": "Alanı sürükleyin · Enter veya çift tıklama: onayla · Esc: iptal",

  // ── Main window (to wire in main.ts) ──────────────────────
  "nav.capture": "Yakalama",
  "nav.recording": "Kayıt",
  "nav.history": "Geçmiş",
  "nav.settings": "Ayarlar",
  "nav.main": "Ana gezinme",
  "app.brandLabel": "ByShoot · Yakalamaya dön",
  "app.dismiss": "Bildirimi kapat",
  "app.footerNative": "Kısayoldan veya sistem tepsisinden hazır",
  "app.footerBrowser": "Tarayıcı önizlemesi",
  "app.settingsReadFailed":
    "Ayarlar okunamadı, varsayılanlar gösteriliyor: {error}",
  "app.unsavedConfirm":
    "Kaydedilmemiş ayar değişiklikleri var. Sayfadan ayrılırsan kaybolacak. Devam edilsin mi?",
  "app.overwriteConfirm":
    "Kayıtlı ayarlar okunamadı: {error}\n\nKaydedersen mevcut ayar dosyasının üzerine yazılır. Devam edilsin mi?",
  "app.saveCancelled": "Kaydetme iptal edildi.",
  "app.historyUpdateFailed": "Geçmiş güncellenemedi: {error}",
  "app.settingsLoadFailed":
    "Ayarlar yüklenemedi: {error}. Kaydedersen mevcut ayar dosyasının üzerine yazılır.",
  "app.shortcutFailed":
    "Sistem kısayolu kaydedilemedi: {error}. Ayarlar → Kısayollar bölümünden başka bir tuş seç.",
  "capture.title": "Ekran görüntüsü al",
  "capture.subtitle":
    "Ekran görüntüsüne not ekle, çiz veya hassas bilgileri gizle.",
  "capture.selectArea": "Alan seç",
  "capture.openDemo": "Demoyu aç",
  "capture.noShortcut": "Kısayol eklemek için Ayarlar’a git.",
  "capture.demoHint": "Örnek görüntü üzerinde dene · Masaüstünü yakalamaz.",
  "capture.otherActions": "Diğer yakalama işlemleri",
  "capture.fullscreen": "Tam ekranı kaydet",
  "capture.fullscreenHint": "İşaretçinin bulunduğu ekran",
  "capture.record": "Ses veya video kaydı",
  "capture.recordHint": "Ekranını ya da ses girişini kaydet",
  "history.title": "Son işlemler",
  "history.subtitle": "Kaydettiğin dosyalar ve paylaştığın bağlantılar.",
  "history.clear": "Tümünü temizle",
  "history.refresh": "Geçmişi yenile",
  "history.loading": "Geçmiş yükleniyor…",
  "history.clearConfirm":
    "Tüm geçmiş kayıtları silinsin mi? Dosyalar ve bağlantılar silinmez, yalnızca bu liste temizlenir.",
  "history.emptyTitle": "İlk görüntünle başla",
  "history.emptyBody":
    "Kaydettiğin, kopyaladığın ve paylaştığın görüntülerin işlemleri burada görünür.",
  "history.saved": "Dosyaya kaydedildi",
  "history.copied": "Panoya kopyalandı",
  "history.linkCreated": "Bağlantı oluşturuldu",
  "history.pixelsCopied": "Görüntü pikselleri panoya kopyalandı.",
  "history.copyLink": "Bağlantıyı kopyala",
  "history.linkCopied": "Bağlantı panoya kopyalandı.",
  "history.delete": "Bu kaydı sil",
  "history.loadFailed":
    "Geçmiş okunamadı. Yenile düğmesiyle tekrar deneyebilirsin.",
  "banner.recording": "Kayıt sürüyor · {time}",
  "banner.ready": "Kaydın hazır. Dosyaya kaydet.",
  "banner.stopped": "Kayıt durdu. Ayrıntıları kontrol et.",
  "banner.stop": "Durdur",
  "banner.stopping": "Durduruluyor…",
  "banner.open": "Kaydı aç",
  "banner.paused": "Kayıt duraklatıldı · {time}",
  "banner.pause": "Duraklat",
  "banner.resume": "Devam et",

  // ── Recording page (to wire in recording.ts) ──────────────
  "rec.title": "Ses ve video kaydı",
  "rec.subtitle": "Ekranınızı ya da yalnızca sesi dosyaya kaydedin.",
  "rec.modeLabel": "Kayıt türü",
  "rec.modeVideo": "Ekran videosu",
  "rec.modeAudio": "Yalnız ses",
  "rec.screen": "Ekran",
  "rec.screenAria": "Kaydedilecek ekran",
  "rec.screensLoading": "Ekranlar okunuyor…",
  "rec.noScreens": "Ekran bulunamadı",
  "rec.screenDesktopOnly": "Masaüstü uygulamasında seçilir",
  "rec.area": "Kayıt alanı",
  "rec.areaFull": "Tüm ekran",
  "rec.areaSelected": "Alan seç",
  "rec.audioInput": "Ses girişi",
  "rec.noAudio": "Ses olmadan",
  "rec.helpSummary": "Sistem sesini nasıl kaydederim?",
  "rec.helpBody":
    "Bilgisayarınızda sunulan Stereo Mix veya sanal ses kablosu girişini seçin. Yalnızca bu girişe yönlendirilen ses kaydedilir. Mikrofon seçimi yalnız o mikrofonu kaydeder.",
  "rec.clockLabel": "Kayıt süresi",
  "rec.start": "Kaydı başlat",
  "rec.starting": "Başlatılıyor…",
  "rec.stop": "Kaydı durdur",
  "rec.stopping": "Durduruluyor…",
  "rec.saveFile": "Dosyaya kaydet",
  "rec.savingFile": "Kaydediliyor…",
  "rec.refresh": "Yenile",
  "rec.refreshing": "Okunuyor…",
  "rec.refreshAria": "Ekranları ve ses girişlerini yenile",
  "rec.recoverySummary": "Kayıt geçici olarak korunuyor",
  "rec.recoveryBody": "Kaydetmeyi iptal etseniz de bu dosya korunur.",
  "rec.pause": "Duraklat",
  "rec.pausing": "Duraklatılıyor…",
  "rec.resume": "Devam et",
  "rec.resuming": "Devam ediliyor…",
  "rec.pickArea": "Alan seç",
  "rec.state.paused": "Kayıt duraklatıldı",
  "rec.state.starting": "Kayıt başlatılıyor",
  "rec.state.stopping": "Kayıt tamamlanıyor",
  "rec.state.saving": "Dosya kaydediliyor",
  "rec.state.recording": "Kayıt sürüyor",
  "rec.state.pending": "Kaydedilmeyi bekliyor",
  "rec.state.desktopOnly": "Masaüstü uygulamasında kullanılabilir",
  "rec.state.preparing": "Kayıt hazırlanıyor",
  "rec.state.unavailable": "Kayıt kullanılamıyor",
  "rec.state.ready": "Kayda hazır",
  "rec.hint.checking": "Ses girişleri kontrol ediliyor…",
  "rec.hint.noInputs":
    "Ses girişi bulunamadı. Mikrofonunuzu bağlayıp Yenile’ye basın.",
  "rec.hint.pickInput": "Kaydı başlatmak için bir ses girişi seçin.",
  "rec.hint.silent": "Video sessiz kaydedilir.",
  "rec.hint.recordingInput": "Seçtiğiniz ses girişi kaydediliyor.",
  "rec.stoppedSave": "Kayıt durdu. Dosyaya kaydedebilirsiniz.",
  "rec.noScreensRefresh":
    "Ekran bulunamadı. Bağlantıyı kontrol edip Yenile’ye basın.",
  "rec.started": "Kayıt başladı. Bu pencereyi küçültebilirsiniz.",
  "rec.savedTo": "Kaydedildi: {path}",
  "rec.saveCancelled": "Kaydetme iptal edildi. Kayıt korunuyor.",
  "rec.desktopOnlyNote":
    "Ses ve video kaydı Windows masaüstü uygulamasında kullanılabilir.",
} as const;

export type I18nKey = keyof typeof tr;

const en: Record<I18nKey, string> = {
  // Settings
  "settings.title": "Settings",
  "settings.subtitle": "Screen capture, your way.",
  "settings.general": "General",
  "settings.keys": "Shortcuts",
  "settings.file": "Files",
  "settings.upload": "Upload and proxy",
  "settings.save": "Save changes",
  "settings.cancel": "Cancel",
  "settings.saved": "Settings saved.",
  "settings.saving": "Saving…",
  "settings.desktop":
    "Preview mode · Screen capture, global shortcuts and startup settings require the desktop app.",
  "settings.system": "System",
  "settings.startupHint": "Starts quietly in the tray.",
  "settings.behavior": "Capture behavior",
  "settings.autoCopyLink": "Copy the link after upload",
  "settings.closeAfterUpload": "Close the editor after upload",
  "settings.notifications": "Show copy and save notifications",
  "settings.rememberRegion": "Remember the last selected area",
  "settings.showCursor": "Include the cursor in screenshots",
  "settings.cursorHint": "Cursor capture is available in the Windows desktop app",
  "settings.launchAtStartup": "Launch at computer startup",
  "settings.language": "App language",
  "settings.region": "Select an area and annotate",
  "settings.fullscreenSave": "Save full screen immediately",
  "settings.fullscreenUpload": "Upload full screen immediately",
  "settings.keyHint":
    "Add several shortcuts for the same action. Press × to remove one. An empty list disables shortcuts for that action.",
  "settings.add": "Add shortcut",
  "settings.removeShortcut": "Remove shortcut: {key}",
  "settings.record": "Press keys… (Esc: cancel)",
  "settings.disabled": "No shortcut assigned",
  "settings.duplicate": "This shortcut is already assigned to another action.",
  "settings.maxShortcuts": "An action can have up to 12 shortcuts.",
  "settings.unsupportedKey":
    "Use a letter, digit, function key, numpad key or PrintScreen.",
  "settings.shortcutModifier":
    "Also hold Ctrl, Alt or Windows/⌘ for this key. Only PrintScreen and F1–F24 work on their own.",
  "settings.format": "Image format",
  "settings.quality": "JPEG quality",
  "settings.directory": "Default save folder",
  "settings.directoryHint": "Leave empty to choose a location each time.",
  "settings.provider": "Upload service",
  "settings.endpoint": "Custom HTTPS upload URL",
  "settings.proxy": "Proxy server (optional)",
  "settings.proxyHint":
    "Example: http://server:8080. Proxy authentication is not supported in this version.",
  "settings.disclosure":
    "Uploaded screenshots create a public link. Hide sensitive information first. A full-screen upload shortcut opens confirmation for sharing the entire screen; it is disabled by default.",
  "settings.endpointError":
    "Enter a valid HTTPS upload URL without a username or password.",
  "settings.proxyError":
    "Enter a valid HTTP or HTTPS proxy URL without a username or password.",
  "settings.reset": "Changes discarded.",
  "settings.unsaved": "Unsaved changes",
  "settings.lightshotNote":
    "Prnt.sc (Lightshot) does not offer a documented direct upload API, so it cannot be selected. Use a custom HTTPS server, or save the image and upload it on prnt.sc.",
  "settings.lightshotError":
    "The Lightshot upload service is unavailable in this version.",
  "settings.custom": "Custom server",
  "settings.nativeOnly": "Available in the desktop app",
  "settings.fileHint": "PNG keeps text sharp. JPEG produces smaller files.",
  "settings.enabled": "Enabled",
  "settings.failed": "Could not save settings. ",

  // Editor
  "editor.label": "Screenshot editor",
  "editor.canvasLabel": "Drag to select an area or draw",
  "editor.guideSelect": "Select the area to capture",
  "editor.cancel": "Cancel",
  "editor.toolsLabel": "Drawing tools",
  "editor.actionsLabel": "Image actions",
  "editor.shareTitle": "Share image",
  "editor.shareDefaultBody":
    "This image is shared through a public link. Make sure sensitive information is hidden.",
  "editor.shareBody":
    "The image will be sent to your upload service: {endpoint}. Anyone with the generated link can view it. Make sure sensitive information is hidden.",
  "editor.shareConfirm": "Upload and create link",
  "editor.noteLabel": "Note text",
  "editor.notePlaceholder": "Write your note…",
  "editor.tool.select": "Select / move",
  "editor.tool.pen": "Pen",
  "editor.tool.highlight": "Highlight",
  "editor.tool.arrow": "Arrow",
  "editor.tool.rectangle": "Rectangle",
  "editor.tool.ellipse": "Ellipse",
  "editor.tool.text": "Add note",
  "editor.tool.marker": "Number",
  "editor.tool.pixelate": "Pixelate",
  "editor.color": "Drawing color",
  "editor.width": "Line width",
  "editor.undo": "Undo (Ctrl/Cmd+Z)",
  "editor.redo": "Redo (Ctrl/Cmd+Shift+Z)",
  "editor.copy": "Copy",
  "editor.copyTitle": "Copy to clipboard (Ctrl/Cmd+C)",
  "editor.save": "Save",
  "editor.saveTitle": "Save to file (Ctrl/Cmd+S)",
  "editor.share": "↑ Share",
  "editor.shareButtonTitle": "Share with a link",
  "editor.newArea": "New area",
  "editor.newAreaTitle": "Select the area again",
  "editor.closeTitle": "Cancel (Esc)",
  "editor.copied": "Copied",
  "editor.copyFailed": "Could not copy",
  "editor.demoEnded": "Demo finished. Reload the page to try again.",
  "editor.selectAreaFirst": "Select an area first.",
  "editor.invalidArea": "Select a valid area.",
  "editor.uploadDemo":
    "Upload is available in the desktop app. The demo image was not sent over the internet.",
  "editor.shareDemo":
    "Link sharing is available in the desktop app. The demo image was not sent over the internet.",
  "editor.uploading": "Uploading image…",
  "editor.linkReady": "Share link: {url}",
  "editor.linkReadyCopied": "Share link (copied to clipboard): {url}",
  "editor.noEndpoint":
    "First add an upload service URL under Settings → Upload and proxy.",
  "editor.waiting": "Waiting for the capture shortcut",
  "editor.viewportTimeout":
    "Could not prepare the screen scale. Restart the capture.",
  "editor.captureFailed": "Could not capture the screen: {error}",
  "editor.demoTitle":
    "byshoot   /   Sample workspace — this is not your real screen",
  "editor.demoNav1": "Workspace",
  "editor.demoNav2": "Overview",
  "editor.demoNav3": "Files",
  "editor.demoNav4": "Shares",
  "editor.demoNav5": "Settings",
  "editor.demoHeadline": "Show the idea. Clarify it together.",
  "editor.demoSub": "Select an area; explain with arrows, shapes and notes.",
  "editor.demoHint": "DEMO · Try the pixelate tool on sensitive information.",

  // Annotations
  "annotation.editTitle": "Edit note",
  "annotation.editConfirm": "Update note",
  "annotation.addTitle": "Add note",
  "annotation.addConfirm": "Add note",

  // Region picker
  "region.help": "Drag to select · Enter or double-click: confirm · Esc: cancel",

  // Main window
  "nav.capture": "Capture",
  "nav.recording": "Record",
  "nav.history": "History",
  "nav.settings": "Settings",
  "nav.main": "Main navigation",
  "app.brandLabel": "ByShoot · Back to capture",
  "app.dismiss": "Dismiss notification",
  "app.footerNative": "Ready from the shortcut or the system tray",
  "app.footerBrowser": "Browser preview",
  "app.settingsReadFailed": "Could not read settings, showing defaults: {error}",
  "app.unsavedConfirm":
    "You have unsaved settings changes. They will be lost if you leave this page. Continue?",
  "app.overwriteConfirm":
    "Saved settings could not be read: {error}\n\nSaving will overwrite the existing settings file. Continue?",
  "app.saveCancelled": "Save cancelled.",
  "app.historyUpdateFailed": "Could not update history: {error}",
  "app.settingsLoadFailed":
    "Could not load settings: {error}. Saving will overwrite the existing settings file.",
  "app.shortcutFailed":
    "Could not register the system shortcut: {error}. Choose a different key under Settings → Shortcuts.",
  "capture.title": "Take a screenshot",
  "capture.subtitle": "Annotate, draw on or hide sensitive details in a screenshot.",
  "capture.selectArea": "Select area",
  "capture.openDemo": "Open demo",
  "capture.noShortcut": "Go to Settings to add a shortcut.",
  "capture.demoHint": "Try it on a sample image · It does not capture your desktop.",
  "capture.otherActions": "Other capture actions",
  "capture.fullscreen": "Save full screen",
  "capture.fullscreenHint": "The screen under the pointer",
  "capture.record": "Audio or video recording",
  "capture.recordHint": "Record your screen or an audio input",
  "history.title": "Recent activity",
  "history.subtitle": "Files you saved and links you shared.",
  "history.clear": "Clear all",
  "history.refresh": "Refresh history",
  "history.loading": "Loading history…",
  "history.clearConfirm":
    "Clear all history entries? Files and links are not deleted; only this list is cleared.",
  "history.emptyTitle": "Start with your first screenshot",
  "history.emptyBody":
    "Screenshots you save, copy and share will appear here.",
  "history.saved": "Saved to file",
  "history.copied": "Copied to clipboard",
  "history.linkCreated": "Link created",
  "history.pixelsCopied": "Image pixels were copied to the clipboard.",
  "history.copyLink": "Copy link",
  "history.linkCopied": "Link copied to clipboard.",
  "history.delete": "Delete this entry",
  "history.loadFailed": "Could not read history. Use the refresh button to try again.",
  "banner.recording": "Recording · {time}",
  "banner.ready": "Your recording is ready. Save it to a file.",
  "banner.stopped": "Recording stopped. Check the details.",
  "banner.stop": "Stop",
  "banner.stopping": "Stopping…",
  "banner.open": "Open recording",
  "banner.paused": "Recording paused · {time}",
  "banner.pause": "Pause",
  "banner.resume": "Resume",

  // Recording page
  "rec.title": "Audio and video recording",
  "rec.subtitle": "Record your screen or just audio to a file.",
  "rec.modeLabel": "Recording type",
  "rec.modeVideo": "Screen video",
  "rec.modeAudio": "Audio only",
  "rec.screen": "Screen",
  "rec.screenAria": "Screen to record",
  "rec.screensLoading": "Reading screens…",
  "rec.noScreens": "No screen found",
  "rec.screenDesktopOnly": "Chosen in the desktop app",
  "rec.area": "Recording area",
  "rec.areaFull": "Full screen",
  "rec.areaSelected": "Select area",
  "rec.audioInput": "Audio input",
  "rec.noAudio": "No audio",
  "rec.helpSummary": "How do I record system audio?",
  "rec.helpBody":
    "Choose the Stereo Mix or virtual audio cable input offered on your computer. Only audio routed to that input is recorded. Choosing a microphone records only that microphone.",
  "rec.clockLabel": "Recording time",
  "rec.start": "Start recording",
  "rec.starting": "Starting…",
  "rec.stop": "Stop recording",
  "rec.stopping": "Stopping…",
  "rec.saveFile": "Save to file",
  "rec.savingFile": "Saving…",
  "rec.refresh": "Refresh",
  "rec.refreshing": "Reading…",
  "rec.refreshAria": "Refresh screens and audio inputs",
  "rec.recoverySummary": "Recording is temporarily kept",
  "rec.recoveryBody": "This file is kept even if you cancel saving.",
  "rec.pause": "Pause",
  "rec.pausing": "Pausing…",
  "rec.resume": "Resume",
  "rec.resuming": "Resuming…",
  "rec.pickArea": "Select area",
  "rec.state.paused": "Recording paused",
  "rec.state.starting": "Starting recording",
  "rec.state.stopping": "Finishing recording",
  "rec.state.saving": "Saving file",
  "rec.state.recording": "Recording",
  "rec.state.pending": "Waiting to be saved",
  "rec.state.desktopOnly": "Available in the desktop app",
  "rec.state.preparing": "Preparing to record",
  "rec.state.unavailable": "Recording unavailable",
  "rec.state.ready": "Ready to record",
  "rec.hint.checking": "Checking audio inputs…",
  "rec.hint.noInputs":
    "No audio input found. Connect a microphone and press Refresh.",
  "rec.hint.pickInput": "Choose an audio input to start recording.",
  "rec.hint.silent": "The video is recorded without sound.",
  "rec.hint.recordingInput": "Recording the selected audio input.",
  "rec.stoppedSave": "Recording stopped. You can save it to a file.",
  "rec.noScreensRefresh": "No screen found. Check the connection and press Refresh.",
  "rec.started": "Recording started. You can minimize this window.",
  "rec.savedTo": "Saved: {path}",
  "rec.saveCancelled": "Save cancelled. The recording is kept.",
  "rec.desktopOnlyNote":
    "Audio and video recording is available in the Windows desktop app.",
};

export const dictionaries: Record<Language, Record<I18nKey, string>> = {
  tr,
  en,
};

let current: Language = "tr";

export function getLanguage(): Language {
  return current;
}

export function setLanguage(lang: Language): void {
  current = lang === "en" ? "en" : "tr";
  if (typeof document !== "undefined")
    document.documentElement.lang = current;
}

/** Translate `key`, replacing `{name}` placeholders from `params`. */
export function t(
  key: I18nKey,
  params?: Record<string, string | number>,
): string {
  const text = dictionaries[current][key];
  if (!params) return text;
  return text.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in params ? String(params[name]) : match,
  );
}

/** BCP-47 locale for Intl / toLocale* formatting. */
export function dateLocale(): string {
  return current === "en" ? "en-US" : "tr-TR";
}
