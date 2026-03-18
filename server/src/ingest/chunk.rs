use text_splitter::{ChunkConfig, MarkdownSplitter};
use tiktoken_rs::CoreBPE;

use super::ContentType;

/// A chunk of text split from a document, with positional metadata.
#[derive(Debug)]
pub struct Chunk {
    /// The chunk text content.
    pub content: String,
    /// Sequential index of this chunk within the document (0-based).
    pub chunk_index: usize,
    /// Character offset from the start of the source document.
    pub char_offset: usize,
    /// Character length of this chunk.
    pub char_length: usize,
}

/// Split a document's text into chunks sized by token count.
///
/// Uses `MarkdownSplitter` for markdown content (respects heading boundaries,
/// code blocks, etc.) and `TextSplitter` for CSV/plain text.
///
/// `max_tokens` is the maximum number of tokens per chunk (measured by the
/// cl100k_base tokenizer, which is a reasonable proxy for Voyage AI models).
pub fn split_document(text: &str, content_type: ContentType, max_tokens: usize) -> Vec<Chunk> {
    let tokenizer = tiktoken_rs::cl100k_base().expect("failed to load cl100k_base tokenizer");

    match content_type {
        ContentType::Markdown => split_markdown(text, &tokenizer, max_tokens),
        ContentType::Csv => split_plain(text, &tokenizer, max_tokens),
    }
}

fn split_markdown(text: &str, tokenizer: &CoreBPE, max_tokens: usize) -> Vec<Chunk> {
    let config = ChunkConfig::new(max_tokens).with_sizer(tokenizer);
    let splitter = MarkdownSplitter::new(config);

    splitter
        .chunk_char_indices(text)
        .enumerate()
        .map(|(chunk_index, idx)| Chunk {
            content: idx.chunk.to_string(),
            chunk_index,
            char_offset: idx.char_offset,
            char_length: idx.chunk.chars().count(),
        })
        .collect()
}

fn split_plain(text: &str, tokenizer: &CoreBPE, max_tokens: usize) -> Vec<Chunk> {
    use text_splitter::TextSplitter;

    let config = ChunkConfig::new(max_tokens).with_sizer(tokenizer);
    let splitter = TextSplitter::new(config);

    splitter
        .chunk_char_indices(text)
        .enumerate()
        .map(|(chunk_index, idx)| Chunk {
            content: idx.chunk.to_string(),
            chunk_index,
            char_offset: idx.char_offset,
            char_length: idx.chunk.chars().count(),
        })
        .collect()
}
