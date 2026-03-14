pub mod chunk;
pub mod embed;
pub mod notion;

use thiserror::Error;

// ---------------------------------------------------------------------------
// Shared types used by all extractors
// ---------------------------------------------------------------------------

/// A single document extracted from an upload archive.
#[derive(Debug)]
pub struct ExtractedDocument {
    /// Original file path inside the archive.
    pub source_path: String,
    /// The file content as a UTF-8 string.
    pub content: String,
    /// Detected content type based on file extension.
    pub content_type: ContentType,
    /// Reconstructed origin URL if derivable from the file path, otherwise `None`.
    pub origin_url: Option<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ContentType {
    Markdown,
    Csv,
}

impl ContentType {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Markdown => "markdown",
            Self::Csv => "csv",
        }
    }
}

#[derive(Debug, Error)]
pub enum ExtractError {
    #[error("Invalid zip archive: {0}")]
    Zip(#[from] zip::result::ZipError),
    #[error("Failed to read file entry: {0}")]
    Io(#[from] std::io::Error),
    #[error("File is not valid UTF-8: {path}")]
    InvalidUtf8 { path: String },
}
