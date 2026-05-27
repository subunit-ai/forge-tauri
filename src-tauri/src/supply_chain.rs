use sha2::{Digest, Sha256};
use std::{
    fs::File,
    io::Read,
    path::{Path, PathBuf},
};

pub const SIDECAR_NAME: &str = "subunit-bridge";
// HINWEIS: `bun --compile` ist NICHT byte-deterministisch → dieser Pin gilt für genau das
// lokale Sidecar-Artefakt. Für CI muss der Pin aus dem Build-Manifest (scripts/sidecar-sha256.txt)
// des jeweiligen Builds kommen statt hartcodiert (offene Codex-Politur, siehe Plan Phase 4).
pub const PINNED_SHA256_HEX: &str =
    "417c5b1ac3dd8b0f4e54a2319b4e295e776c2ebbac3ce30efd8a1c2ea532333d";

const PINNED_SHA256: [u8; 32] = [
    0x41, 0x7c, 0x5b, 0x1a, 0xc3, 0xdd, 0x8b, 0x0f, 0x4e, 0x54, 0xa2, 0x31, 0x9b, 0x4e, 0x29, 0x5e,
    0x77, 0x6c, 0x2e, 0xbb, 0xac, 0x3c, 0xe3, 0x0e, 0xfd, 0x8a, 0x1c, 0x2e, 0xa5, 0x32, 0x33, 0x3d,
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
