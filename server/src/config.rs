use std::net::{IpAddr, Ipv4Addr, SocketAddr};

use serde::Deserialize;

#[derive(Debug, Clone, Deserialize)]
pub struct Config {
    #[serde(default = "default_host")]
    pub host: IpAddr,
    #[serde(default = "default_port")]
    pub port: u16,

    pub db_uri: String,
    pub db_user: String,
    pub db_pass: String,

    /// Maximum chunk size in tokens for text splitting. Default: 448.
    #[serde(default = "default_chunk_size")]
    pub chunk_size: usize,

    /// Voyage AI API key for generating embeddings.
    // TODO: remove Option
    #[serde(default)]
    pub voyage_api_key: Option<String>,
}

const fn default_host() -> IpAddr {
    IpAddr::V4(Ipv4Addr::UNSPECIFIED)
}

const fn default_port() -> u16 {
    7600
}

const fn default_chunk_size() -> usize {
    448
}

impl Config {
    pub fn from_env() -> Result<Self, envy::Error> {
        envy::prefixed("AZOR_").from_env()
    }

    #[must_use]
    pub const fn addr(&self) -> SocketAddr {
        SocketAddr::new(self.host, self.port)
    }
}
