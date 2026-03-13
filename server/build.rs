use std::fmt::Write as _;
use std::fs;
use std::io::Write;
use std::path::Path;

fn main() {
    // Use BUILD env var if set (e.g., from Docker build args), otherwise detect from git
    let build_info = std::env::var("BUILD").unwrap_or_else(|_| {
        let hash = std::process::Command::new("git")
            .args(["rev-parse", "--short", "HEAD"])
            .output()
            .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string())
            .unwrap_or_default();
        let dirty = std::process::Command::new("git")
            .args(["diff", "--quiet"])
            .status()
            .map(|s| !s.success())
            .unwrap_or(false);
        format!("{}{}", hash, if dirty { "-dirty" } else { "" })
    });
    println!("cargo:rustc-env=BUILD={build_info}");
    println!(
        "cargo:rustc-env=PROFILE={}",
        std::env::var("PROFILE").unwrap()
    );

    generate_migrations();
}

fn generate_migrations() {
    let migrations_dir = Path::new("src/db/migrations");
    let out_dir = std::env::var("OUT_DIR").unwrap();
    let out_path = Path::new(&out_dir).join("migrations.rs");

    // Collect all .surql files
    let mut migrations: Vec<String> = fs::read_dir(migrations_dir)
        .expect("Failed to read migrations directory")
        .filter_map(|entry| {
            let entry = entry.ok()?;
            let path = entry.path();
            if path.extension()? == "surql" {
                Some(path.file_stem()?.to_string_lossy().into_owned())
            } else {
                None
            }
        })
        .collect();

    // Sort by filename (datetime prefix ensures correct order)
    migrations.sort();

    // Generate the code
    let mut code = String::from("const MIGRATIONS: &[(&str, &str)] = &[\n");
    for name in &migrations {
        writeln!(
            code,
            "    (\"{name}\", include_str!(concat!(env!(\"CARGO_MANIFEST_DIR\"), \"/src/db/migrations/{name}.surql\"))),"
        )
        .unwrap();
    }
    code.push_str("];\n");

    // Write to OUT_DIR
    let mut file = fs::File::create(&out_path).expect("Failed to create migrations.rs");
    file.write_all(code.as_bytes())
        .expect("Failed to write migrations.rs");

    // Re-run build script if migrations change
    println!("cargo:rerun-if-changed={}", migrations_dir.display());
}
