FROM rust:1.82-bookworm AS builder
WORKDIR /app
COPY Cargo.toml Cargo.toml
COPY src src
RUN cargo build --release

FROM debian:bookworm-slim
WORKDIR /app
RUN apt-get update && apt-get install -y ca-certificates && rm -rf /var/lib/apt/lists/*
COPY --from=builder /app/target/release/ascend-todo-server /usr/local/bin/ascend-todo-server
EXPOSE 8080
CMD ["ascend-todo-server"]

