# syntax=docker/dockerfile:1

# Stage 1: Base image with cargo-chef for Rust dependency caching
FROM ubuntu:24.04 AS chef
RUN apt-get update && apt-get install -y curl build-essential pkg-config libssl-dev clang libclang-dev \
  && rm -rf /var/lib/apt/lists/*
RUN curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --default-toolchain 1.89.0
ENV PATH="/root/.cargo/bin:${PATH}"
RUN cargo install cargo-chef
WORKDIR /app

# Stage 2: Generate dependency recipe
FROM chef AS planner
COPY Cargo.toml Cargo.lock ./
COPY server/Cargo.toml server/
COPY connector/Cargo.toml connector/
RUN mkdir -p server/src connector/src \
  && touch server/src/main.rs connector/src/main.rs \
  && mkdir -p server/src/db/migrations
RUN cargo chef prepare --recipe-path recipe.json

# Stage 3: Build only dependencies (cached layer)
FROM chef AS deps
ARG PROFILE=release
COPY --from=planner /app/recipe.json recipe.json
RUN --mount=type=cache,target=/root/.cargo/registry \
  --mount=type=cache,target=/root/.cargo/git \
  --mount=type=cache,target=/app/target \
  if [ "$PROFILE" = "release" ]; then \
  cargo chef cook --release --recipe-path recipe.json; \
  else \
  cargo chef cook --recipe-path recipe.json; \
  fi

# Stage 4: Build the actual application
FROM deps AS builder
ARG PROFILE=release
ARG BUILD=unknown
COPY Cargo.toml Cargo.lock ./
COPY server/ server/
COPY connector/ connector/
ENV BUILD=${BUILD}
RUN --mount=type=cache,target=/root/.cargo/registry \
  --mount=type=cache,target=/root/.cargo/git \
  --mount=type=cache,target=/app/target \
  if [ "$PROFILE" = "release" ]; then \
  cargo build --release --bin azor-server \
  && cp /app/target/release/azor-server /app/azor-server; \
  else \
  cargo build --bin azor-server \
  && cp /app/target/debug/azor-server /app/azor-server; \
  fi

# Stage 5: Minimal runtime image
FROM gcr.io/distroless/cc-debian13 AS runtime
COPY --from=builder /app/azor-server /usr/local/bin/
CMD ["azor-server"]
