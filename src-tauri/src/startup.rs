//! Per-user Windows startup registration with a quoted executable path.
const RUN: &str = r"Software\Microsoft\Windows\CurrentVersion\Run";
const APPROVAL: &str = r"Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run";
const NAME: &str = "byshoot";

fn command(path: &std::path::Path) -> String {
    format!("\"{}\" --background", path.display())
}

pub fn set(enabled: bool) -> Result<(), String> {
    let root = &windows_registry::CURRENT_USER;
    let key = root.create(RUN).map_err(|e| e.to_string())?;
    if enabled {
        let path = std::env::current_exe().map_err(|e| e.to_string())?;
        key.set_string(NAME, command(&path))
            .map_err(|e| e.to_string())?;
        root.create(APPROVAL)
            .map_err(|e| e.to_string())?
            .set_bytes(
                NAME,
                windows_registry::Type::Bytes,
                &[2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
            )
            .map_err(|e| e.to_string())?;
        if !is_enabled()? {
            return Err("Windows başlangıç kaydı doğrulanamadı".into());
        }
    } else if key.get_string(NAME).is_ok() {
        key.remove_value(NAME).map_err(|e| e.to_string())?;
    }
    Ok(())
}

pub fn is_enabled() -> Result<bool, String> {
    let root = &windows_registry::CURRENT_USER;
    let value = match root.open(RUN).and_then(|k| k.get_string(NAME)) {
        Ok(v) => v,
        Err(e) if e.code().0 as u32 == 0x80070002 => return Ok(false),
        Err(e) => return Err(e.to_string()),
    };
    let path = value
        .strip_prefix('"')
        .and_then(|v| v.split_once('"'))
        .map(|(p, _)| p);
    if !path.is_some_and(|p| std::path::Path::new(p).is_file()) {
        return Ok(false);
    }
    match root.open(APPROVAL).and_then(|k| k.get_value(NAME)) {
        Ok(v) => Ok(v.first().is_some_and(|v| *v == 2 || *v == 6)),
        Err(e) if e.code().0 as u32 == 0x80070002 => Ok(true),
        Err(e) => Err(e.to_string()),
    }
}

#[cfg(test)]
mod tests {
    #[test]
    fn quotes_paths_and_keeps_background_argument_separate() {
        assert_eq!(
            super::command(std::path::Path::new(r"C:\My Apps\ByShoot.exe")),
            r#""C:\My Apps\ByShoot.exe" --background"#
        );
    }
}
