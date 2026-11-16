#!/usr/bin/env bash
set -euo pipefail

echo "============================================================"
echo " SysMon Pro - Windows x64 Cross-Compilation Setup (Linux)"
echo "============================================================"

# Ensure cargo/rustup bin directory is on PATH if already installed
if [ -f "$HOME/.cargo/env" ]; then
  # shellcheck disable=SC1091
  source "$HOME/.cargo/env"
fi
export PATH="$HOME/.cargo/bin:$PATH"

# Determine privilege escalation command cleanly (avoid overwriting configs)
if [ "$(id -u)" -eq 0 ]; then
  SUDO=""
elif command -v sudo >/dev/null 2>&1; then
  SUDO="sudo"
else
  echo "Error: root privileges or sudo are required to install system packages." >&2
  exit 1
fi

APT_UPDATED=0
ensure_apt_pkg() {
  local pkg="$1"
  if dpkg -s "$pkg" >/dev/null 2>&1; then
    echo "[ok] apt package already installed: $pkg"
  else
    if [ "$APT_UPDATED" -eq 0 ]; then
      echo "[..] Updating apt package index..."
      $SUDO apt-get update -qq
      APT_UPDATED=1
    fi
    echo "[..] Installing apt package: $pkg"
    DEBIAN_FRONTEND=noninteractive $SUDO apt-get install -y --no-install-recommends "$pkg"
  fi
}

# 1. Check / install curl & ca-certificates (needed for rustup/xwin downloads)
for base_pkg in curl ca-certificates build-essential pkg-config; do
  ensure_apt_pkg "$base_pkg"
done

# 2. Check / install Node.js and npm
if command -v node >/dev/null 2>&1 && command -v npm >/dev/null 2>&1; then
  echo "[ok] Node.js $(node -v) and npm $(npm -v) already installed"
else
  ensure_apt_pkg nodejs
  ensure_apt_pkg npm
fi

# 3. Check / install LLVM, Clang, LLD, and NSIS
for xcompile_pkg in llvm clang lld nsis; do
  ensure_apt_pkg "$xcompile_pkg"
done

# Verify key LLVM/NSIS tools are resolvable
for tool in clang lld-link llvm-ar llvm-dlltool makensis; do
  if command -v "$tool" >/dev/null 2>&1; then
    echo "[ok] Found tool: $tool ($(command -v "$tool"))"
  else
    echo "[warn] Tool '$tool' not found on PATH after installing llvm/clang/lld/nsis"
  fi
done

# 4. Check / install Rustup & Rust stable toolchain
if command -v rustup >/dev/null 2>&1 && command -v cargo >/dev/null 2>&1 && command -v rustc >/dev/null 2>&1; then
  echo "[ok] Rust already installed: $(rustc --version)"
else
  echo "[..] Installing Rust stable toolchain via rustup..."
  curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --default-toolchain stable
  # shellcheck disable=SC1091
  source "$HOME/.cargo/env"
fi

# Ensure stable toolchain is installed without clobbering user's custom default if present
if ! rustup toolchain list | grep -q "^stable"; then
  echo "[..] Installing Rust stable toolchain..."
  rustup toolchain install stable
fi

# 5. Install Windows x64 MSVC target
if rustup target list --installed | grep -q "^x86_64-pc-windows-msvc$"; then
  echo "[ok] Rust target already installed: x86_64-pc-windows-msvc"
else
  echo "[..] Adding Rust target: x86_64-pc-windows-msvc"
  rustup target add x86_64-pc-windows-msvc
fi

# 6. Install cargo-xwin (handles Windows CRT / WinSDK headers & import libs via xwin)
if cargo xwin --version >/dev/null 2>&1 || command -v cargo-xwin >/dev/null 2>&1; then
  echo "[ok] cargo-xwin already installed: $(cargo xwin --version 2>/dev/null || cargo-xwin --version)"
else
  echo "[..] Installing cargo-xwin..."
  CARGO_XWIN_INSTALLED=0
  ARCH="$(uname -m)"
  if [ "$ARCH" = "x86_64" ]; then
    XWIN_ARCHIVE="cargo-xwin-v0.23.1.x86_64-unknown-linux-musl.tar.gz"
  elif [ "$ARCH" = "aarch64" ]; then
    XWIN_ARCHIVE="cargo-xwin-v0.23.1.aarch64-unknown-linux-musl.tar.gz"
  else
    XWIN_ARCHIVE=""
  fi

  if [ -n "$XWIN_ARCHIVE" ]; then
    TMP_XWIN="$(mktemp -d)"
    if curl -fsSL "https://github.com/rust-cross/cargo-xwin/releases/download/v0.23.1/${XWIN_ARCHIVE}" -o "$TMP_XWIN/${XWIN_ARCHIVE}" \
      && tar -xzf "$TMP_XWIN/${XWIN_ARCHIVE}" -C "$HOME/.cargo/bin" cargo-xwin \
      && chmod +x "$HOME/.cargo/bin/cargo-xwin"; then
      echo "[ok] Installed prebuilt cargo-xwin: $(cargo xwin --version 2>/dev/null || echo 'v0.23.1')"
      CARGO_XWIN_INSTALLED=1
    fi
    rm -rf "$TMP_XWIN"
  fi

  if [ "$CARGO_XWIN_INSTALLED" -eq 0 ]; then
    echo "[..] Falling back to building cargo-xwin from crates.io (bounded parallelism)..."
    cargo install --locked -j "${CARGO_BUILD_JOBS:-2}" cargo-xwin
  fi
fi

# Note: cargo-xwin downloads and caches the Windows CRT & Windows SDK into
# ~/.cache/cargo-xwin/xwin automatically on the first cross-compilation build.

# 7. Also check Linux Tauri WebKitGTK development libraries (informational, non-destructive)
echo ""
echo "Checking Linux native Tauri libraries (for 'npm run tauri build'):"
missing_linux_pkgs=()
for libpkg in libwebkit2gtk-4.1-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev; do
  if dpkg -s "$libpkg" >/dev/null 2>&1; then
    echo "[ok] $libpkg"
  else
    missing_linux_pkgs+=("$libpkg")
  fi
done
if [ "${#missing_linux_pkgs[@]}" -gt 0 ]; then
  echo "[info] Optional Linux native bundle libraries not installed: ${missing_linux_pkgs[*]}"
  echo "       Install them on Ubuntu if building native Linux .deb/.AppImage:"
  echo "       sudo apt-get install -y ${missing_linux_pkgs[*]}"
fi

echo ""
echo "============================================================"
echo " Verification Summary"
echo "============================================================"
echo " Node.js:   $(node -v)"
echo " npm:       $(npm -v)"
echo " Rustc:     $(rustc --version)"
echo " Cargo:     $(cargo --version)"
echo " Targets:   $(rustup target list --installed | tr '\n' ' ')"
echo " cargo-xwin:$(cargo xwin --version 2>/dev/null || echo ' installed')"
echo " Clang:     $(clang --version | head -n 1)"
echo " LLD:       $(lld-link --version 2>/dev/null | head -n 1 || lld --version | head -n 1)"
echo " NSIS:      $(makensis -VERSION)"
echo "============================================================"
echo " Windows cross-compilation setup complete."
echo " Run 'npm run build:windows' to build the Windows x64 .exe installer."
