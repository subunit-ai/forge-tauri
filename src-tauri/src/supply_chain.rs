use sha2::{Digest, Sha256};
use std::{
    fs::File,
    io::Read,
    path::{Path, PathBuf},
};

pub const SIDECAR_NAME: &str = "subunit-bridge";
pub const PINNED_SHA256_HEX: &str =
    "dfddafb94b70be520b772d67a25c618a81b6fb3d9ea113b052c4967e9d3c0bf7";

const PINNED_SHA256: [u8; 32] = [
    0xdf, 0xdd, 0xaf, 0xb9, 0x4b, 0x70, 0xbe, 0x52, 0x0b, 0x77, 0x2d, 0x67, 0xa2, 0x5c, 0x61, 0x8a,
    0x81, 0xb6, 0xfb, 0x3d, 0x9e, 0xa1, 0x13, 0xb0, 0x52, 0xc4, 0x96, 0x7e, 0x9d, 0x3c, 0x0b, 0xf7,
];

pub fn resolved_sidecar_path() -> Result<PathBuf, String> {
    let exe_path = std::env::current_exe()
        .map_err(|error| format!("failed to resolve current executable path: {error}"))?;
    let exe_dir = exe_path
        .parent()
        .ok_or_else(|| "failed to resolve current executable directory".to_string())?;
    let base_dir = if exe_dir.ends_with("deps") {
        exe_dir.parent().unwrap_or(exe_dir)
    } else {
        exe_dir
    };

    let mut sidecar_path = base_dir.join(SIDECAR_NAME);

    #[cfg(windows)]
    {
        if sidecar_path.extension().is_none() {
            sidecar_path.as_mut_os_string().push(".exe");
        }
    }

    #[cfg(not(windows))]
    {
        if sidecar_path.extension().is_some_and(|ext| ext == "exe") {
            sidecar_path.set_extension("");
        }
    }

    Ok(sidecar_path)
}

pub fn verify_resolved_sidecar() -> Result<PathBuf, String> {
    let sidecar_path = resolved_sidecar_path()?;
    verify_sidecar(&sidecar_path)?;
    Ok(sidecar_path)
}

pub fn verify_sidecar(path: &Path) -> Result<(), String> {
    let actual = sha256_file(path)
        .map_err(|error| format!("failed to hash sidecar at {}: {error}", path.display()))?;

    if constant_time_eq_32(&actual, &PINNED_SHA256) {
        return Ok(());
    }

    Err(format!(
        "sidecar integrity check failed for {}: expected SHA-256 {}, got {}",
        path.display(),
        PINNED_SHA256_HEX,
        hex_encode(&actual)
    ))
}

fn sha256_file(path: &Path) -> std::io::Result<[u8; 32]> {
    let mut file = File::open(path)?;
    let mut hasher = Sha256::new();
    let mut buffer = [0_u8; 64 * 1024];

    loop {
        let read = file.read(&mut buffer)?;
        if read == 0 {
            break;
        }
        hasher.update(&buffer[..read]);
    }

    let digest = hasher.finalize();
    let mut bytes = [0_u8; 32];
    bytes.copy_from_slice(&digest);
    Ok(bytes)
}

fn constant_time_eq_32(left: &[u8; 32], right: &[u8; 32]) -> bool {
    let mut diff = 0_u8;
    for index in 0..32 {
        diff |= left[index] ^ right[index];
    }
    diff == 0
}

fn hex_encode(bytes: &[u8]) -> String {
    const HEX: &[u8; 16] = b"0123456789abcdef";
    let mut output = String::with_capacity(bytes.len() * 2);
    for byte in bytes {
        output.push(HEX[(byte >> 4) as usize] as char);
        output.push(HEX[(byte & 0x0f) as usize] as char);
    }
    output
}
