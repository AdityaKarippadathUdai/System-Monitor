# SysMon Pro — Cross-Platform Desktop & Web Hardware Monitor

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![React](https://img.shields.io/badge/React-19.0-61dafb?logo=react&logoColor=black)](https://react.dev/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-v4.0-38bdf8?logo=tailwindcss&logoColor=white)](https://tailwindcss.com/)
[![Tauri](https://img.shields.io/badge/Tauri-v2.0-ffc131?logo=tauri&logoColor=black)](https://v2.tauri.app/)
[![Rust](https://img.shields.io/badge/Rust-2021_Edition-dea584?logo=rust&logoColor=black)](https://www.rust-lang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-v18+-339933?logo=node.js&logoColor=white)](https://nodejs.org/)

**SysMon Pro** is a real-time, cross-platform hardware telemetry and process monitoring application supporting **Linux** (Ubuntu, Arch Linux, Fedora, Debian) and **Windows 10 / Windows 11** natively through a unified React 19 UI and dual backend engine:

1. **Native Desktop Engine (Tauri v2 + Rust)**: Automatically detects the host OS at runtime and compiles OS-native telemetry backends (`#[cfg(target_os = "linux")]` and `#[cfg(target_os = "windows")]`) with `tokio::task::spawn_blocking` and live `system_metrics_stream` IPC events.
2. **Web / Full-Stack Mode (Node.js + Express + Vite)**: Embedded Express server serving live host telemetry on port `3000` via `systeminformation` and native OS probes.

Unsupported sensors on any machine are reported as `null` in telemetry payloads and displayed honestly as `N/A` in the UI—never fabricated or replaced with synthetic values.

---

## Cross-Platform Telemetry Architecture

### Platform Detection & Unified Data Contracts
The Rust backend emits identical camelCase Serde structures (`SystemOverview`, `ProcessInfo`, `PingResult`, `KillResult`) on both Linux and Windows so the React + Zustand frontend renders seamlessly without platform forks.

| Subsystem | Linux Native Implementation | Windows 10/11 Native Implementation |
|---|---|---|
| **CPU** | `sysinfo` + `/sys/devices/system/cpu/cpufreq`, `/sys/class/hwmon` / `/sys/class/thermal`, sysfs L1/L2/L3 cache, `/proc/loadavg` | `sysinfo` + Win32 Registry (`~MHz`, `VendorIdentifier`), PDH `\Processor Information(_Total)\% Processor Performance`, `\Thermal Zone Information(*)\Temperature`, `loadAverage: null` |
| **Memory** | `/proc/meminfo` (Total, Used, Available, Free, Cached, Buffers, Swap, Virtual Memory normalized to bytes) | Win32 `GlobalMemoryStatusEx` + PDH `\Memory\Cache Bytes` & `\Paging File(_Total)\% Usage` (Physical RAM + Windows Page File / Commit Charge) |
| **GPU & VRAM** | Multi-GPU detection (hybrid iGPU + dGPU): NVIDIA (`nvml-wrapper` + `nvidia-smi` fallback), AMD (`sysfs`/`amdgpu` + `hwmon`), Intel (`sysfs`/`drm` + `hwmon`) | Multi-GPU detection via **DXGI** (`CreateDXGIFactory1` + `IDXGIAdapter3::QueryVideoMemoryInfo`) + **PDH** (`\GPU Engine(*)` & `\GPU Adapter Memory(*)`) + **NVML/`nvidia-smi`** (supports laptops e.g. RTX 3050 + iGPU) |
| **Disk & I/O** | Mounted partitions (`sysinfo::Disks`), `/proc/diskstats` delta read/write throughput & IOPS, `/sys/block/*/queue/rotational`, NVMe `hwmon` thermals | Drive letters (`C:`, `D:`, `E:`, etc.), `SystemDrive` detection, PDH `\LogicalDisk(*)` read/write bytes/sec & IOPS |
| **Network** | `/sys/class/net/*` + `libc::getifaddrs` (Wi-Fi, Ethernet, VPN, Virtual, Loopback; IPv4/IPv6/MAC; delta RX/TX rates) + async ICMP/TCP latency ping | Win32 `GetAdaptersAddresses` (`IfType` classification, operational status, IPv4/IPv6/MAC) + async ICMP/TCP latency ping (`CREATE_NO_WINDOW`) |
| **Processes** | `sysinfo` + `Users` + `/proc/<pid>/status` threads + safe `SIGTERM` (`libc::kill`) | `sysinfo` + `Users` + safe `EnumWindows`/`WM_CLOSE` then `TerminateProcess` |
| **System Info** | `/etc/os-release`, DMI sysfs (`sys_vendor`, `product_name`), display server (`Wayland`/`X11`) & DE, `/proc` thread count | Win32 Registry (`Windows 11` build `>= 22000` detection, BIOS vendor/model), DWM, PDH `\System\Threads` |

### Process Termination Safety
SysMon Pro enforces strict safety boundaries on both platforms:
- Blocks PID `0`, PID `1` (`init`/`systemd`), Windows System PID `4`, the monitoring process itself, and critical OS processes (`smss.exe`, `csrss.exe`, `wininit.exe`, `services.exe`, `lsass.exe`, `winlogon.exe`, etc.).
- Requires a two-step inline confirmation before issuing termination requests.
- Does not silently escalate privileges; `EPERM` / `ERROR_ACCESS_DENIED` errors are surfaced cleanly to the user.

---

## Prerequisites

### Node.js (Required for Frontend & Web Mode)
- **Node.js**: `v18+` (`v20` or `v22` recommended) and `npm`

### Native Desktop Toolchains (Tauri v2 + Rust)

#### Linux (Ubuntu / Debian)
```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
sudo apt-get update
sudo apt-get install -y \
  libwebkit2gtk-4.1-dev \
  build-essential \
  curl \
  wget \
  file \
  libxdo-dev \
  libssl-dev \
  libayatana-appindicator3-dev \
  librsvg2-dev \
  patchelf \
  libfuse2
```

#### Linux (Arch Linux / Fedora)
- **Arch Linux**: `sudo pacman -Syu --needed webkit2gtk-4.1 base-devel curl wget openssl libappindicator-gtk3 librsvg patchelf`
- **Fedora**: `sudo dnf groupinstall "C Development Tools and Libraries" && sudo dnf install webkit2gtk4.1-devel openssl-devel libappindicator-gtk3-devel librsvg2-devel patchelf`

#### Windows 10 / Windows 11
1. Install [Rustup (x86_64-pc-windows-msvc)](https://rustup.rs/).
2. Install [Microsoft C++ Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/) with the **Desktop development with C++** workload and Windows 10/11 SDK.
3. Ensure Microsoft Edge WebView2 Runtime is available (preinstalled on Windows 10/11).

---

## Running & Building

```bash
# Install dependencies
npm install
```

### Web Mode (Port 3000)
```bash
npm run dev
```
Starts the Express + Vite server at `http://localhost:3000` with REST endpoints:
- `GET /api/system/ping`
- `GET /api/system/overview`
- `GET /api/system/processes`
- `GET /api/system/network-ping?target=1.1.1.1`
- `POST /api/system/kill`

### Native Desktop Development (Linux or Windows)
```bash
npm run tauri dev
```

### Production Installers (`.deb` and `.exe`) — Quick Reference

| Target Package | Host OS | Command | Output File |
|---|---|---|---|
| **Linux `.deb`** | Ubuntu / Debian | `npm run tauri build -- --bundles deb` | `src-tauri/target/release/bundle/deb/SysMon Pro_1.3.0_amd64.deb` |
| **Linux `.deb` + `.AppImage`** | Linux | `npm run tauri build` | `src-tauri/target/release/bundle/deb/*.deb` & `appimage/*.AppImage` |
| **Windows `.exe` (Cross-Compile)** | Ubuntu / Debian | `npm run build:windows` | `src-tauri/target/x86_64-pc-windows-msvc/release/bundle/nsis/SysMon Pro_1.3.0_x64-setup.exe` |
| **Windows `.exe` (Native)** | Windows 10 / 11 | `npm run tauri build -- --bundles nsis` | `src-tauri\target\release\bundle\nsis\SysMon Pro_1.3.0_x64-setup.exe` |
| **Windows `.exe` + `.msi`** | Windows 10 / 11 | `npm run tauri build` | `nsis\*-setup.exe` & `msi\*_x64_en-US.msi` |

---

### Option 1: Creating a Linux `.deb` Package (Ubuntu / Debian)

> **Requirement**: Building `.deb` packages requires running on Linux with WebKitGTK and Tauri system libraries installed.

1. **Install system dependencies** (Ubuntu / Debian):
   ```bash
   sudo apt-get update
   sudo apt-get install -y \
     libwebkit2gtk-4.1-dev \
     build-essential \
     curl \
     wget \
     file \
     libxdo-dev \
     libssl-dev \
     libayatana-appindicator3-dev \
     librsvg2-dev \
     patchelf \
     libfuse2
   ```

2. **Install Rust** (skip if already installed):
   ```bash
   curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
   source "$HOME/.cargo/env"
   ```

3. **Install Node dependencies and build the `.deb` installer**:
   ```bash
   npm install
   npm run tauri build -- --bundles deb
   ```
   *(To build both `.deb` and `.AppImage` at once, run `npm run tauri build` — `src-tauri/tauri.linux.conf.json` configures both targets automatically on Linux.)*

4. **Locate, verify, and install the generated `.deb` file**:
   ```bash
   # Inspect generated .deb package
   ls -lh src-tauri/target/release/bundle/deb/*.deb
   dpkg-deb --info src-tauri/target/release/bundle/deb/*.deb

   # Install locally on Ubuntu / Debian
   sudo apt install ./src-tauri/target/release/bundle/deb/*.deb
   ```
   After installation, launch **SysMon Pro** from your application menu or run `sysmon-desktop` in a terminal. To uninstall later:
   ```bash
   sudo apt remove sysmon-desktop
   ```

---

### Option 2: Creating a Windows `.exe` Installer from Ubuntu / Debian Linux (`cargo-xwin`)

You can cross-compile a standalone **Windows 10/11 x64 NSIS `.exe` setup installer** directly from Ubuntu/Debian Linux without a Windows machine.

1. **Run the automated cross-compilation setup script**:
   ```bash
   chmod +x scripts/setup-windows-cross-compile.sh
   ./scripts/setup-windows-cross-compile.sh
   ```
   This script checks existing tools (without overwriting system configs) and installs any missing requirements:
   - `llvm`, `clang`, `lld`, and `nsis` (`makensis`)
   - Rust stable toolchain + `x86_64-pc-windows-msvc` target
   - `cargo-xwin` (for Windows CRT & Windows SDK headers/import libraries)

   If you just installed Rust in this terminal session, reload your `PATH`:
   ```bash
   source "$HOME/.cargo/env"
   ```

2. **Install npm dependencies**:
   ```bash
   npm install
   ```

3. **(Optional) Verify TypeScript and Rust Windows cross-compilation first**:
   ```bash
   npm run lint
   (cd src-tauri && cargo xwin check --target x86_64-pc-windows-msvc)
   ```

4. **Build the Windows x64 `.exe` installer**:
   ```bash
   npm run build:windows
   ```
   Under the hood, this runs:
   `npm run tauri build -- --runner cargo-xwin --target x86_64-pc-windows-msvc --bundles nsis`
   - Builds the React 19 + Vite production frontend (`dist/`).
   - Cross-compiles the native Rust monitoring engine for Windows x64 (`x86_64-pc-windows-msvc`).
   - Downloads/caches Microsoft CRT & Windows SDK files into `~/.cache/cargo-xwin/xwin` on first run.
   - Packages the standalone NSIS `.exe` installer (with embedded WebView2 bootstrapper and `src-tauri/icons/icon.ico`).

5. **Locate and verify the generated `.exe` installer**:
   ```bash
   ls -lh "src-tauri/target/x86_64-pc-windows-msvc/release/bundle/nsis/"*.exe
   file "src-tauri/target/x86_64-pc-windows-msvc/release/bundle/nsis/"*.exe
   # Expected output file:
   #   src-tauri/target/x86_64-pc-windows-msvc/release/bundle/nsis/SysMon Pro_1.3.0_x64-setup.exe
   #   (PE32+ executable (GUI) x86-64, for MS Windows)
   ```
   Copy the `.exe` to any Windows 10 or Windows 11 x64 PC and double-click it to install **SysMon Pro** (no Node.js or Rust needed on the target PC).

   **Troubleshooting Linux-to-Windows cross-compilation**:
   - `cargo: command not found` or `cargo-xwin not found`: run `source "$HOME/.cargo/env"`.
   - Low-memory build machine: limit parallel Rust jobs via `CARGO_BUILD_JOBS=2 npm run build:windows`.
   - `makensis` missing: run `sudo apt-get install -y nsis`.

---

### Option 3: Creating a Windows `.exe` (and `.msi`) Natively on Windows 10 / 11

1. **Install prerequisites** on Windows 10/11 (x64):
   - [Node.js](https://nodejs.org/) (`v18+`)
   - [Rustup (`x86_64-pc-windows-msvc`)](https://rustup.rs/)
   - [Microsoft C++ Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/) (**Desktop development with C++** + Windows 10/11 SDK)
   - [NSIS](https://nsis.sourceforge.io/) (or let Tauri CLI fetch/use its bundled NSIS toolchain)

2. **Install dependencies and build**:
   ```powershell
   npm install

   # Build ONLY the NSIS .exe installer:
   npm run tauri build -- --bundles nsis

   # OR build both NSIS (.exe) and WiX (.msi) installers:
   npm run tauri build
   ```

3. **Locate the generated installers**:
   ```text
   src-tauri\target\release\bundle\nsis\SysMon Pro_1.3.0_x64-setup.exe
   src-tauri\target\release\bundle\msi\SysMon Pro_1.3.0_x64_en-US.msi
   ```

---

### Option 4: Automated CI Builds via GitHub Actions

Two GitHub Actions workflows build downloadable `.deb` and `.exe` installers automatically on pushes to `main`/`master`, pull requests, manual runs (`workflow_dispatch`), and `v*` tags:

- **`.github/workflows/build.yml`** (`ubuntu-22.04`): Builds `.deb` and `.AppImage` and uploads the `SysMon-Pro-Linux-x64` artifact.
- **`.github/workflows/build-windows.yml`** (`windows-latest`): Builds NSIS `.exe` and `.msi`, uploads the `SysMon-Pro-Windows-x64-Setup` artifact, and attaches both installers to a **GitHub Release** whenever you push a version tag (e.g. `git tag v1.3.0 && git push origin v1.3.0`).

---

## Directory Layout

```text
src/
├── components/        # ResourceCard, CpuCoreGrid, GpuCard, DiskCard, NetworkCard, ProcessTable, ProcessDetails, SystemDetails
├── hooks/             # useSystemStats (Tauri event stream + Web polling), useProcesses
├── pages/             # Overview, Processes, Cpu, Memory, Gpu, Disk, Network, Settings
├── services/          # Unified Tauri v2 IPC + Express HTTP client
├── store/             # Zustand state + circular metric history
├── types/             # Null-safe TypeScript contracts mirroring Rust models
└── utils/             # Formatters returning 'N/A' for unavailable telemetry

src-tauri/src/
├── cpu/               # mod.rs, linux.rs (sysfs/hwmon/loadavg), windows.rs (Registry/PDH)
├── disk/              # mod.rs (/proc/diskstats & Windows PDH \LogicalDisk(*))
├── gpu/               # detection.rs, nvidia.rs (NVML/nvidia-smi), amd.rs, intel.rs (sysfs + DXGI/PDH)
├── memory/            # mod.rs (/proc/meminfo & GlobalMemoryStatusEx + PDH)
├── network/           # mod.rs (/sys/class/net + getifaddrs, Windows GetAdaptersAddresses, async ping)
├── platform/          # mod.rs, linux.rs, windows.rs (OS detection, DMI/Registry, thread counts)
├── processes/         # mod.rs (process inspection & guarded SIGTERM / WM_CLOSE + TerminateProcess)
├── models.rs          # Unified Serde camelCase telemetry structs
├── sys_monitor.rs     # Thread-safe MonitorEngine orchestrator
└── main.rs            # Tauri v2 setup, async IPC commands, single-loop emitter, clean shutdown
```

---

## License

MIT License — see [LICENSE](LICENSE).
