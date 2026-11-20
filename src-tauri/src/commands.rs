//! Comandos `invoke` do OpenDesign desktop.
//!
//! Tudo que entra e sai daqui é JSON serializável. O frontend chama via
//! `window.__TAURI_INTERNALS__.invoke` (envolvido por `src/client/lib/tauri-bridge.ts`).
//! Por padrão nenhum caminho é aceito do frontend: arquivos ficam sob o app
//! data dir, com nomes sanitizados. A única exceção é o `destination` opcional
//! dos exports, que vem do diálogo nativo "Salvar como" (plugin dialog) — e só
//! é aceito se vier acompanhado do nonce one-shot emitido por `pick_save_path`
//! para aquele mesmo caminho. A extensão continua sendo validada antes de gravar.

use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager, State};
use tauri_plugin_dialog::DialogExt;

/// Versão do envelope dos arquivos `.json` de design.
const DESIGN_VERSION: u8 = 1;
/// Limites defensivos: um design é JSON de canvas, um export é PNG/PDF em base64.
const MAX_DOCUMENT_BYTES: usize = 32 * 1024 * 1024;
const MAX_EXPORT_BYTES: usize = 64 * 1024 * 1024;
const MAX_NAME_LEN: usize = 80;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DesignFileInfo {
    pub id: String,
    pub name: String,
    pub path: String,
    pub modified_at: u64,
}

/// Formato do arquivo salvo em `<app data dir>/designs/<id>.json`.
/// `document` é a string JSON do snapshot montado pelo frontend — guardada
/// textualmente para não perder tipos nem exigir um schema compartilhado Rust/TS.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StoredDesign {
    pub version: u8,
    pub id: String,
    pub name: String,
    pub document: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportResult {
    pub path: String,
    pub bytes: u64,
}

/// Nonces one-shot emitidos por `pick_save_path`: nonce -> caminho escolhido.
/// Nenhum `destination` vindo do frontend é aceito sem um nonce ainda não usado.
#[derive(Default)]
pub struct ExportTokens {
    tokens: Mutex<HashMap<String, String>>,
    seq: AtomicU64,
}

/// Retorno do diálogo nativo. `path`/`nonce` são `null` quando o usuário cancela.
/// O nome `nonce` é o contrato já usado pelo frontend (`tauri-bridge.ts`).
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SavePathTicket {
    pub path: Option<String>,
    pub nonce: Option<String>,
}

impl ExportTokens {
    fn issue(&self, path: String) -> String {
        let seq = self.seq.fetch_add(1, Ordering::Relaxed);
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_nanos())
            .unwrap_or(0);
        let nonce = format!("exp-{}-{seq}-{nanos:016x}", std::process::id());
        if let Ok(mut tokens) = self.tokens.lock() {
            tokens.insert(nonce.clone(), path);
        }
        nonce
    }

    /// Consome o nonce apenas se ele foi emitido para exatamente este caminho.
    fn consume(&self, nonce: &str, destination: &str) -> Result<(), String> {
        let mut tokens = self
            .tokens
            .lock()
            .map_err(|_| "estado de nonces de export indisponível".to_string())?;
        let issued = tokens
            .get(nonce)
            .ok_or_else(|| "nonce de export inválido ou já usado".to_string())?;
        if issued.trim() != destination.trim() {
            return Err("nonce de export não corresponde ao caminho escolhido".to_string());
        }
        tokens.remove(nonce);
        Ok(())
    }
}

// ── helpers ───────────────────────────────────────────────────────────

fn data_dir(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map_err(|e| format!("diretório de dados do app indisponível: {e}"))
}

fn designs_dir(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(data_dir(app)?.join("designs"))
}

fn exports_dir(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(data_dir(app)?.join("exports"))
}

fn ensure_dir(dir: &Path) -> Result<(), String> {
    fs::create_dir_all(dir)
        .map_err(|e| format!("não foi possível criar {}: {e}", dir.display()))
}

fn modified_millis(path: &Path) -> u64 {
    fs::metadata(path)
        .and_then(|m| m.modified())
        .ok()
        .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

/// Mantém só caracteres seguros para nome de arquivo. Nunca aceita `/`, `\`,
/// `..`, unidades do Windows etc. — o frontend manda só um "id", nunca um path.
fn safe_stem(raw: &str, fallback: &str) -> String {
    let mut out = String::with_capacity(raw.len().min(MAX_NAME_LEN));
    for c in raw.trim().chars() {
        if out.len() >= MAX_NAME_LEN {
            break;
        }
        if c.is_ascii_alphanumeric() || c == '-' || c == '_' {
            out.push(c);
        } else if !out.ends_with('-') {
            out.push('-');
        }
    }
    let trimmed = out.trim_matches('-').to_string();
    if trimmed.is_empty() {
        return fallback.to_string();
    }
    // `CON`, `NUL`, `COM1`… são dispositivos reservados no Windows.
    let upper = trimmed.to_ascii_uppercase();
    let reserved = matches!(upper.as_str(), "CON" | "PRN" | "AUX" | "NUL")
        || (upper.len() == 4
            && (upper.starts_with("COM") || upper.starts_with("LPT"))
            && upper.as_bytes()[3].is_ascii_digit());
    if reserved {
        format!("od-{trimmed}")
    } else {
        trimmed
    }
}

fn info_from(id: &str, name: &str, path: &Path) -> DesignFileInfo {
    DesignFileInfo {
        id: id.to_string(),
        name: name.to_string(),
        path: path.to_string_lossy().into_owned(),
        modified_at: modified_millis(path),
    }
}

fn read_envelope(path: &Path) -> Result<StoredDesign, String> {
    let text = fs::read_to_string(path)
        .map_err(|e| format!("não foi possível ler {}: {e}", path.display()))?;
    let stored: StoredDesign = serde_json::from_str(&text)
        .map_err(|e| format!("design inválido em {}: {e}", path.display()))?;
    if stored.version != DESIGN_VERSION {
        return Err(format!(
            "design {} usa versão {} (esperada {})",
            path.display(),
            stored.version,
            DESIGN_VERSION
        ));
    }
    Ok(stored)
}

fn decode_base64(input: &str) -> Result<Vec<u8>, String> {
    let mut out = Vec::with_capacity(input.len() / 4 * 3);
    let mut acc: u32 = 0;
    let mut bits: u32 = 0;
    let mut padded = false;

    for (i, byte) in input.bytes().enumerate() {
        let value = match byte {
            b'\r' | b'\n' | b' ' | b'\t' => continue,
            b'=' => {
                padded = true;
                continue;
            }
            b'A'..=b'Z' => byte - b'A',
            b'a'..=b'z' => byte - b'a' + 26,
            b'0'..=b'9' => byte - b'0' + 52,
            b'+' => 62,
            b'/' => 63,
            _ => return Err(format!("base64 inválido na posição {i}")),
        } as u32;

        if padded {
            return Err("base64: '=' encontrado antes do fim".into());
        }

        acc = (acc << 6) | value;
        bits += 6;
        if bits >= 8 {
            bits -= 8;
            out.push((acc >> bits) as u8);
            acc &= (1u32 << bits) - 1;
        }
    }

    if out.is_empty() {
        return Err("base64 vazio".into());
    }
    Ok(out)
}

fn decode_data_url(data_url: &str) -> Result<(&str, Vec<u8>), String> {
    let marker = data_url
        .find(";base64,")
        .ok_or("data URL sem ';base64,'")?;
    let header = &data_url[..marker];
    let mime = header
        .strip_prefix("data:")
        .ok_or("data URL sem prefixo 'data:'")?;
    if mime.is_empty() {
        return Err("data URL sem MIME type".into());
    }
    let bytes = decode_base64(&data_url[marker + ";base64,".len()..])?;
    Ok((mime, bytes))
}

// ── designs ───────────────────────────────────────────────────────────

/// Salva um snapshot (JSON já serializado pelo frontend) em
/// `<app data dir>/designs/<id>.json`. `id` ausente é derivado de `name`.
#[tauri::command]
pub fn save_design(
    app: AppHandle,
    id: Option<String>,
    name: String,
    document: String,
) -> Result<DesignFileInfo, String> {
    let name = name.trim();
    if name.is_empty() {
        return Err("nome do design é obrigatório".into());
    }
    if document.trim().is_empty() {
        return Err("documento do design está vazio".into());
    }
    if document.len() > MAX_DOCUMENT_BYTES {
        return Err(format!(
            "design grande demais ({} bytes > {} bytes)",
            document.len(),
            MAX_DOCUMENT_BYTES
        ));
    }

    let id = safe_stem(id.as_deref().unwrap_or(name), "design");
    let dir = designs_dir(&app)?;
    ensure_dir(&dir)?;
    let path = dir.join(format!("{id}.json"));

    let stored = StoredDesign {
        version: DESIGN_VERSION,
        id: id.clone(),
        name: name.to_string(),
        document,
    };
    let text = serde_json::to_string_pretty(&stored)
        .map_err(|e| format!("não foi possível serializar o design: {e}"))?;
    fs::write(&path, text)
        .map_err(|e| format!("não foi possível salvar {}: {e}", path.display()))?;

    Ok(info_from(&id, name, &path))
}

/// Lê o envelope; o frontend decide o que fazer com `document` (string JSON).
#[tauri::command]
pub fn load_design(app: AppHandle, id: String) -> Result<StoredDesign, String> {
    let id = safe_stem(&id, "design");
    let path = designs_dir(&app)?.join(format!("{id}.json"));
    if !path.is_file() {
        return Err(format!("design '{id}' não encontrado"));
    }
    read_envelope(&path)
}

#[tauri::command]
pub fn list_designs(app: AppHandle) -> Result<Vec<DesignFileInfo>, String> {
    let dir = designs_dir(&app)?;
    if !dir.exists() {
        return Ok(Vec::new());
    }

    let mut designs = Vec::new();
    let entries = fs::read_dir(&dir)
        .map_err(|e| format!("não foi possível listar {}: {e}", dir.display()))?;
    for entry in entries.flatten() {
        let path = entry.path();
        if path.extension().and_then(|e| e.to_str()) != Some("json") {
            continue;
        }
        // Arquivo corrompido/estranho não derruba a listagem.
        if let Ok(stored) = read_envelope(&path) {
            designs.push(info_from(&stored.id, &stored.name, &path));
        }
    }
    designs.sort_by(|a, b| b.modified_at.cmp(&a.modified_at));
    Ok(designs)
}

#[tauri::command]
pub fn delete_design(app: AppHandle, id: String) -> Result<(), String> {
    let id = safe_stem(&id, "design");
    let path = designs_dir(&app)?.join(format!("{id}.json"));
    if !path.is_file() {
        return Err(format!("design '{id}' não encontrado"));
    }
    fs::remove_file(&path)
        .map_err(|e| format!("não foi possível excluir {}: {e}", path.display()))
}

// ── exports ───────────────────────────────────────────────────────────

/// Abre o diálogo nativo "Salvar como" no lado Rust e devolve o caminho junto
/// com um nonce one-shot. O frontend deve repassar AMBOS a export_png/export_pdf;
/// o nonce só é aceito uma vez e apenas para o caminho emitido aqui.
#[tauri::command]
pub async fn pick_save_path(
    app: AppHandle,
    state: State<'_, ExportTokens>,
    filename: String,
    kind: String,
) -> Result<SavePathTicket, String> {
    let ext = match kind.as_str() {
        "png" => "png",
        "pdf" => "pdf",
        other => return Err(format!("tipo de export desconhecido: '{other}'")),
    };

    let stem = safe_stem(&filename, "export");
    let chosen = app
        .dialog()
        .file()
        .set_title(if ext == "png" {
            "Salvar imagem PNG"
        } else {
            "Salvar documento PDF"
        })
        .add_filter(ext.to_ascii_uppercase(), &[ext])
        .set_file_name(format!("{stem}.{ext}"))
        .blocking_save_file();

    let Some(file_path) = chosen else {
        return Ok(SavePathTicket {
            path: None,
            nonce: None,
        });
    };
    let path = file_path
        .into_path()
        .map_err(|e| format!("caminho escolhido inválido: {e}"))?;

    // Valida a extensão antes de emitir o nonce: não gastamos o nonce num
    // caminho que o export rejeitaria de qualquer forma.
    match path.extension().and_then(|e| e.to_str()) {
        Some(current) if current.eq_ignore_ascii_case(ext) => {}
        Some(current) => {
            return Err(format!(
                "extensão '{current}' não corresponde ao export .{ext}"
            ));
        }
        None => {}
    }

    let path = path.to_string_lossy().into_owned();
    let nonce = state.issue(path.clone());
    Ok(SavePathTicket {
        path: Some(path),
        nonce: Some(nonce),
    })
}

fn write_export(
    app: &AppHandle,
    tokens: &ExportTokens,
    data_url: &str,
    filename: &str,
    ext: &str,
    allowed_mime: fn(&str) -> bool,
    destination: Option<&str>,
    nonce: Option<&str>,
) -> Result<ExportResult, String> {
    let (mime, bytes) = decode_data_url(data_url)?;
    if !allowed_mime(mime) {
        return Err(format!(
            "MIME inesperado para export {ext}: '{mime}'"
        ));
    }
    if bytes.is_empty() || bytes.len() > MAX_EXPORT_BYTES {
        return Err(format!(
            "export vazio ou grande demais ({} bytes)",
            bytes.len()
        ));
    }

    let suffix = format!(".{ext}");
    let path = match destination.map(str::trim).filter(|p| !p.is_empty()) {
        Some(chosen) => {
            // Caminho escolhido no diálogo nativo. A extensão precisa bater com
            // o formato do export para não sobrescrever outro tipo de arquivo.
            let mut path = PathBuf::from(chosen);
            match path.extension().and_then(|e| e.to_str()) {
                Some(current) if current.eq_ignore_ascii_case(ext) => {}
                Some(current) => {
                    return Err(format!(
                        "extensão '{current}' não corresponde ao export .{ext}"
                    ));
                }
                None => {
                    let mut os = path.into_os_string();
                    os.push(&suffix);
                    path = PathBuf::from(os);
                }
            }
            // O frontend NUNCA escolhe um destino por conta própria: ele só
            // repete o caminho/devolve o nonce que `pick_save_path` emitiu.
            let nonce = nonce
                .map(str::trim)
                .filter(|t| !t.is_empty())
                .ok_or_else(|| {
                    "destino escolhido exige nonce one-shot de pick_save_path".to_string()
                })?;
            tokens.consume(nonce, chosen)?;
            path
        }
        None => {
            // Fallback: grava em <app data dir>/exports/ como antes.
            // Remove a extensão antes de sanitizar para não virar "nome-png.png".
            let lower = filename.to_ascii_lowercase();
            let stem_raw = if lower.ends_with(&suffix) {
                &filename[..filename.len() - suffix.len()]
            } else {
                filename
            };
            let stem = safe_stem(stem_raw, "export");
            let dir = exports_dir(app)?;
            ensure_dir(&dir)?;
            dir.join(format!("{stem}.{ext}"))
        }
    };

    // O diretório escolhido no diálogo já existe; create_dir_all é inofensivo
    // e cobre o caso de o usuário ter digitado uma pasta nova no nome.
    if let Some(parent) = path.parent() {
        if !parent.as_os_str().is_empty() {
            ensure_dir(parent)?;
        }
    }
    fs::write(&path, &bytes)
        .map_err(|e| format!("não foi possível salvar {}: {e}", path.display()))?;

    Ok(ExportResult {
        path: path.to_string_lossy().into_owned(),
        bytes: bytes.len() as u64,
    })
}

#[tauri::command]
pub fn export_png(
    app: AppHandle,
    state: State<'_, ExportTokens>,
    data_url: String,
    filename: String,
    destination: Option<String>,
    nonce: Option<String>,
) -> Result<ExportResult, String> {
    write_export(
        &app,
        state.inner(),
        &data_url,
        &filename,
        "png",
        |mime| mime.eq_ignore_ascii_case("image/png"),
        destination.as_deref(),
        nonce.as_deref(),
    )
}

#[tauri::command]
pub fn export_pdf(
    app: AppHandle,
    state: State<'_, ExportTokens>,
    data_url: String,
    filename: String,
    destination: Option<String>,
    nonce: Option<String>,
) -> Result<ExportResult, String> {
    write_export(
        &app,
        state.inner(),
        &data_url,
        &filename,
        "pdf",
        |mime| {
            mime.eq_ignore_ascii_case("application/pdf")
                || mime.eq_ignore_ascii_case("application/octet-stream")
        },
        destination.as_deref(),
        nonce.as_deref(),
    )
}
