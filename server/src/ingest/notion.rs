use std::io::{Cursor, Read};

use super::{ContentType, ExtractError, ExtractedDocument};

/// Extract all markdown and csv documents from a Notion export zip archive.
///
/// Notion exports are typically zip-in-zip: the outer archive contains one or
/// more `ExportBlock-*.zip` files which hold the actual content. This function
/// handles the nesting recursively — any `.zip` entry found inside is read
/// into memory and processed the same way.
pub fn extract_from_zip(data: &[u8]) -> Result<Vec<ExtractedDocument>, ExtractError> {
    let cursor = Cursor::new(data);
    let mut archive = zip::ZipArchive::new(cursor)?;
    let mut documents = Vec::new();

    for i in 0..archive.len() {
        let mut entry = archive.by_index(i)?;

        if entry.is_dir() {
            continue;
        }

        let path = entry.name().to_string();

        // Nested zip — read into memory and recurse.
        if path.ends_with(".zip") {
            let mut inner_bytes = Vec::with_capacity(entry.size() as usize);
            entry.read_to_end(&mut inner_bytes)?;
            documents.extend(extract_from_zip(&inner_bytes)?);
            continue;
        }

        let content_type = if path.ends_with(".md") {
            ContentType::Markdown
        } else if path.ends_with(".csv") {
            ContentType::Csv
        } else {
            continue;
        };

        let mut buf = String::new();
        entry
            .read_to_string(&mut buf)
            .map_err(|_| ExtractError::InvalidUtf8 { path: path.clone() })?;

        if buf.trim().is_empty() {
            continue;
        }

        let origin_url = notion_url_from_path(&path);

        documents.push(ExtractedDocument {
            source_path: path,
            content: buf,
            content_type,
            origin_url,
        });
    }

    Ok(documents)
}

/// Try to reconstruct a Notion page URL from a Notion export file path.
///
/// Notion export paths look like:
///   "Some Page Name abc123def456.md"
///   "Parent abc123/Child def456.md"
///
/// The last 32 hex chars before the extension are the page ID.
/// We reconstruct: `https://notion.so/<url-encoded-name>-<page-id>`
fn notion_url_from_path(path: &str) -> Option<String> {
    let file_name = path.rsplit('/').next()?;
    let stem = file_name
        .strip_suffix(".md")
        .or_else(|| file_name.strip_suffix(".csv"))?;

    if stem.len() < 33 {
        return None;
    }

    let (name_part, maybe_id) = stem.rsplit_once(' ')?;
    let id = maybe_id.trim();

    if id.len() != 32 || !id.chars().all(|c| c.is_ascii_hexdigit()) {
        return None;
    }

    let encoded_name = urlencoding::encode(name_part);
    Some(format!("https://notion.so/{encoded_name}-{id}"))
}
