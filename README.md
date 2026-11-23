# SysMon Pro — Cross-Platform Desktop & Web Hardware Monitor

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Version](https://img.shields.io/badge/Version-1.3.0-indigo.svg)](src-tauri/tauri.conf.json)
[![React](https://img.shields.io/badge/React-19.0-61dafb?logo=react&logoColor=black)](https://react.dev/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-v4.0-38bdf8?logo=tailwindcss&logoColor=white)](https://tailwindcss.com/)
[![Tauri](https://img.shields.io/badge/Tauri-v2.12-ffc131?logo=tauri&logoColor=black)](https://v2.tauri.app/)
[![Rust](https://img.shields.io/badge/Rust-2021_Edition-dea584?logo=rust&logoColor=black)](https://www.rust-lang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-v22_LTS-339933?logo=node.js&logoColor=white)](https://nodejs.org/)

**SysMon Pro** is a real-time, cross-platform hardware telemetry and process monitoring suite built for **Linux** (Ubuntu, Debian, Arch Linux, Fedora) and **Windows 10 / Windows 11**. It pairs a unified **React 19 + TypeScript + Tailwind CSS v4** interface with a dual backend architecture:

1. **Native Desktop Engine (Tauri v2 + Rust)**: Automatically detects the host OS at runtime and compiles native telemetry collectors (`#[cfg(target_os = "linux")]` and `#[cfg(target_os = "windows")]`) inside a thread-safe `MonitorEngine`. Telemetry streams to the UI over low-latency `system_metrics_stream` IPC events via `tokio::task::spawn_blocking`.
2. **Full-Stack Web Engine (Node.js + Express + Vite)**: Runs on port `3000` using `systeminformation` and OS-native probes, allowing remote or browser-based inspection with automatic fallback when the Tauri runtime is not active.

> **Honest Telemetry Policy**: Unsupported hardware sensors (such as CPU package temperature on virtual machines or fan speed on integrated GPUs) are emitted as `null` in telemetry payloads and rendered explicitly as `N/A` in the UI. SysMon Pro never fabricates or interpolates fake sensor readings.

---

## Table of Contents

- [Features & Application Views](#features--application-views)
- [Tech Stack](#tech-stack)
- [Cross-Platform Telemetry Architecture](#cross-platform-telemetry-architecture)
  - [Linux vs. Windows Subsystem Collectors](#linux-vs-windows-subsystem-collectors)
  - [Process Termination Safety](#process-termination-safety)
- [API & IPC Reference](#api--ipc-reference)
  - [Tauri v2 Desktop IPC Commands & Events](#tauri-v2-desktop-ipc-commands--events)
  - [Express HTTP REST Endpoints (Web Mode)](#express-http-rest-endpoints-web-mode)
  - [Unified Telemetry Data Contracts](#unified-telemetry-data-contracts)
- [Prerequisites](#prerequisites)
- [Running in Development & Web Production Mode](#running-in-development--web-production-mode)
- [Building Native Installers (`.deb`, `.AppImage`, `.exe`, `.msi`)](#building-native-installers-deb-appimage-exe-msi)
  - [Option 1: Linux `.deb` & `.AppImage` (Ubuntu / Debian)](#option-1-creating-a-linux-deb-and-appimage-package-ubuntu--debian)
  - [Option 2: Windows `.exe` Cross-Compilation from Ubuntu Linux (`cargo-xwin`)](#option-2-creating-a-windows-exe-installer-from-ubuntu--debian-linux-cargo-xwin)
  - [Option 3: Native Windows `.exe` & `.msi` on Windows 10 / 11](#option-3-creating-a-windows-exe-and-msi-natively-on-windows-10--11)
  - [Option 4: Automated CI/CD Builds via GitHub Actions](#option-4-automated-ci-builds-via-github-actions)
- [NPM Scripts & Configuration Reference](#npm-scripts--configuration-reference)
- [Directory Layout](#directory-layout)
- [Troubleshooting](#troubleshooting)
- [License](#license)

---

## Features & Application Views

SysMon Pro organizes live system telemetry into eight dedicated views backed by a **Zustand** store (`src/store/systemStore.ts`) with a configurable circular history buffer (`30s`, `60s`, or `120s`):

| View | Key Capabilities |
|---|---|
| **Overview** | Health status badge (`healthy`, `moderate`, `warning`, `critical`), summary resource cards for CPU, RAM, active GPU, storage, and network, plus synchronized multi-metric live charts. |
| **Processes** | Real-time searchable, sortable, and filterable (`all`, `app`, `background`, `system`) process table with compact row mode, per-process detail drawer (PID, PPID, user, executable path, command line, threads, priority, CPU/RAM history), and guarded process termination. |
| **CPU** | Aggregate utilization, per-logical-core usage grid (`CpuCoreGrid`), live vs. max clock frequency (GHz), package temperature (`°C` / `°F`), vendor normalization (`Intel` / `AMD`), L1/L2/L3 cache breakdown, power governor / Windows Power Plan, and Linux 1m/5m/15m load averages. |
| **Memory** | Physical RAM breakdown (Total, Used, Available, Free, Cached, Buffers), Swap / Windows Page File usage, total Virtual / Commit memory utilization, and hardware DIMM type/speed when exposed by the OS. |
| **GPU** | Multi-GPU detection prioritizing discrete GPUs (`dGPU`) while keeping integrated graphics (`iGPU`) selectable. Tracks GPU utilization, dedicated VRAM usage/budget, temperature, board power draw vs. power limit, core/memory clocks, fan speed, PCI bus ID / LUID, driver version, and compute API (`CUDA` / `DirectX 12 / DXGI` / `OpenGL / Vulkan`). |
| **Disk** | Enumerates mounted filesystems/drive letters, flags the OS system partition (`/` on Linux, `SystemDrive` on Windows), classifies SSD/NVMe vs. HDD vs. Removable storage, and tracks live read/write throughput (bytes/sec), IOPS, and Linux NVMe `hwmon` temperatures. |
| **Network** | Lists physical and virtual interfaces (`wifi`, `ethernet`, `vpn`, `virtual`, `loopback`) with IPv4, IPv6, MAC address, operational link state, cumulative RX/TX bytes, live RX/TX speeds, and an interactive **ICMP + TCP latency ping tool** (`1.1.1.1`, custom hostnames/IPs, configurable fallback port). |
| **Settings** | Controls polling intervals (`250ms` Turbo 4 Hz, `500ms`, `1000ms`, `1500ms`, `2000ms`, `5000ms`), chart timeframe (`30s`, `60s`, `120s`), temperature unit (`°C` / `°F`), CPU/GPU temperature badge toggles, compact process table toggle, live IPC latency/throughput diagnostics + 25-sample IPC speed benchmark, static hardware inspection, and **JSON telemetry snapshot export**. |

Additional global controls include **Pause / Resume** telemetry freezing in the header, persistent settings in `localStorage` (`sysmon_settings`), and desktop system tray integration.

---

## Tech Stack

| Layer | Technologies |
|---|---|
| **Frontend UI** | React 19, TypeScript 5.8, Vite 6, Tailwind CSS v4 (`@tailwindcss/vite`), Zustand 5, Recharts 3, Lucide React, Motion |
| **Native Desktop** | Tauri v2 (`tauri` 2.12, `tauri-plugin-shell` 2.6), Rust (2021 edition), `tokio`, `serde` / `serde_json`, `chrono` |
| **Native Hardware Crates** | `sysinfo` 0.30, `nvml-wrapper` 0.10, `libc` 0.2 (Linux), `windows` 0.52 (Windows Win32, PDH, DXGI, IpHelper, Registry) |
| **Web / Full-Stack Fallback** | Node.js 22+, Express 4, `systeminformation` 5, `tsx`, `esbuild` |

---

## Cross-Platform Telemetry Architecture

### Platform Detection & Dual-Engine Bridge
- **Runtime Bridge (`src/services/systemMonitor.ts`, `src/services/tauriBridge.ts`)**: Checks `window.__TAURI__` / `window.__TAURI_INTERNALS__`. When running inside the desktop app, all commands invoke Rust IPC directly and subscribe to the `system_metrics_stream` event loop (`src-tauri/src/main.rs`). When opened in a browser via `npm run dev` or `npm run start`, the UI switches transparently to the Express REST API on port `3000`.
- **Single-Loop Rust Emitter**: `MonitorEngine` (`src-tauri/src/sys_monitor.rs`) wraps stateful collectors inside a `Mutex`, runs sampling on Tokio's blocking thread pool (`tokio::task::spawn_blocking`), and enforces a single background stream loop with dynamic interval clamping (`250ms`–`10000ms`).
- **Unified Schema**: Both Rust (`src-tauri/src/models.rs`) and Express (`server.ts`) serialize identical `camelCase` payloads matching `src/types/system.ts` and `src/types/process.ts`.

### Linux vs. Windows Subsystem Collectors

| Subsystem | Linux Native Implementation (`#[cfg(target_os = "linux")]`) | Windows 10/11 Native Implementation (`#[cfg(target_os = "windows")]`) |
|---|---|---|
| **CPU** | `sysinfo` + `/sys/devices/system/cpu/cpufreq`, `/sys/class/hwmon` / `/sys/class/thermal`, sysfs L1/L2/L3 cache sizes, `/proc/loadavg` | `sysinfo` + Win32 Registry (`~MHz`, `VendorIdentifier`), PDH `\Processor Information(_Total)\% Processor Performance`, `\Thermal Zone Information(*)\Temperature`, `loadAverage: null` |
| **Memory** | `/proc/meminfo` (Total, Used, Available, Free, Cached, Buffers, Swap, Virtual Memory normalized to bytes) | Win32 `GlobalMemoryStatusEx` + PDH `\Memory\Cache Bytes` & `\Paging File(_Total)\% Usage` (Physical RAM + Windows Page File / Commit Charge) |
| **GPU & VRAM** | Multi-GPU detection: NVIDIA (`nvml-wrapper` + `nvidia-smi` fallback), AMD (`sysfs`/`amdgpu` + `hwmon`), Intel (`sysfs`/`drm` + `hwmon`) | Multi-GPU detection via **DXGI** (`CreateDXGIFactory1` + `IDXGIAdapter1::GetDesc1` + `IDXGIAdapter3::QueryVideoMemoryInfo`) + **PDH** (`\GPU Engine(*)` & `\GPU Adapter Memory(*)`) + **NVML / `nvidia-smi`** (supports hybrid dGPU + iGPU laptops) |
| **Disk & I/O** | `sysinfo::Disks`, `/proc/diskstats` delta throughput & IOPS, `/sys/block/*/queue/rotational`, NVMe `hwmon` thermals | Drive letters (`C:`, `D:`, etc.), `SystemDrive` detection, PDH `\LogicalDisk(*)` read/write bytes/sec & IOPS |
| **Network** | `/sys/class/net/*` + `libc::getifaddrs` (Wi-Fi, Ethernet, VPN, Virtual, Loopback; IPv4/IPv6/MAC; delta RX/TX rates) + async ICMP/TCP ping | Win32 `GetAdaptersAddresses` (`IfType` classification, `OperStatus`, IPv4/IPv6/MAC) + async ICMP/TCP ping (`CREATE_NO_WINDOW`) |
| **Processes** | `sysinfo` + `Users` + `/proc/<pid>/status` threads + safe `SIGTERM` (`libc::kill`) | `sysinfo` + `Users` + safe `EnumWindows`/`WM_CLOSE` graceful close followed by `TerminateProcess` |
| **System Info** | `/etc/os-release`, DMI sysfs (`sys_vendor`, `product_name`), display server (`Wayland`/`X11`) & DE, `/proc` thread count | Win32 Registry (`Windows 11` build `>= 22000` detection, BIOS vendor/model), DWM, PDH `\System\Threads` |

### Process Termination Safety
SysMon Pro enforces strict guardrails on both Linux and Windows before terminating any process:
- **Protected PIDs**: Refuses PID `0`, PID `1` (`init` / `systemd`), Windows System PID `4`, and the SysMon Pro process itself (`std::process::id()` / `process.pid`).
- **Protected OS Binaries**: Blocks `init`, `systemd`, `kthreadd`, `system`, `system idle process`, `registry`, `smss.exe`, `csrss.exe`, `wininit.exe`, `services.exe`, `lsass.exe`, and `winlogon.exe`.
- **Two-Step UI Confirmation**: Requires explicit inline confirmation in the UI before sending a kill request.
- **No Silent Elevation**: Never spawns UAC prompts or `sudo`. Insufficient permissions return clear `EPERM` / `ERROR_ACCESS_DENIED` messages.

---

## API & IPC Reference

### Tauri v2 Desktop IPC Commands & Events
Registered in `src-tauri/src/main.rs`:

| Channel | Type | Arguments / Payload | Description |
|---|---|---|---|
| `system_metrics_stream` | Event (Rust → UI) | `SystemOverview` | Emitted continuously by the single background Tokio loop at `poll_interval_ms`. |
| `ping` | Command | — | Returns `"pong"` for round-trip IPC latency benchmarking. |
| `get_system_overview` | Command | — | Returns an immediate `SystemOverview` snapshot (`cpu`, `memory`, `gpus`, `disks`, `network`, `systemInfo`, `timestamp`, `overallStatus`). |
| `get_processes` | Command | — | Returns `Vec<ProcessInfo>` sorted by CPU and memory usage. |
| `kill_process` | Command | `{ pid: number }` | Runs safety checks and terminates the target PID; returns `KillResult` (`{ success, message }`). |
| `set_polling_interval` | Command | `{ intervalMs: number }` | Clamps polling interval to `250..=10000` ms and updates the background stream loop. |
| `ping_target` | Command | `{ target: string, port?: number }` | Validates hostname/IP, runs native OS `ping` (ICMP), and falls back to async `TcpStream::connect` (2000ms timeout) if ICMP is blocked. |

### Express HTTP REST Endpoints (Web Mode)
Served on `http://0.0.0.0:3000` by `server.ts`:

| Method & Path | Parameters / Body | Response |
|---|---|---|
| `GET /api/system/ping` | — | `{ status: "ok", timestamp }` |
| `GET /api/system/overview` | — | Full `SystemOverview` JSON payload |
| `GET /api/system/processes` | — | `ProcessInfo[]` sorted by CPU% then memory |
| `GET /api/system/network-ping` | `?target=1.1.1.1&port=443` | `PingResult` (`{ target, latencyMs, reachable, method, error, timestamp }`) |
| `POST /api/system/kill` | `{ "pid": 1234 }` | `{ success: boolean, message: string }` (`400`/`403`/`500` on invalid, protected, or unauthorized PIDs) |

### Unified Telemetry Data Contracts
- **`SystemOverview`** (`src/types/system.ts` ↔ `src-tauri/src/models.rs`):
  - `cpu`: `usagePercent`, `frequencyGhz`, `maxFrequencyGhz`, `temperatureC`, `coresCount`, `threadsCount`, `manufacturer`, `modelName`, `loadAverage`, `perCoreUsage[]`, `cache { l1, l2, l3 }`, `governor`, `uptimeSeconds`
  - `memory`: `totalBytes`, `usedBytes`, `availableBytes`, `cachedBytes`, `buffersBytes`, `freeBytes`, `usagePercent`, `swapTotalBytes`, `swapUsedBytes`, `swapFreeBytes`, `swapPercent`, `virtualTotalBytes`, `virtualUsedBytes`, `virtualPercent`, `type`, `speedMhz`
  - `gpus[]`: `id`, `name`, `vendor`, `gpuType`, `driverVersion`, `utilizationPercent`, `vramTotalBytes`, `vramUsedBytes`, `vramUsagePercent`, `temperatureC`, `powerWatts`, `powerLimitWatts`, `coreClockMhz`, `memoryClockMhz`, `fanSpeedPercent`, `pciBusId`, `computeCapability`
  - `disks[]`: `id`, `name`, `mountPoint`, `filesystem`, `totalBytes`, `usedBytes`, `availableBytes`, `usagePercent`, `readSpeedBytesSec`, `writeSpeedBytesSec`, `readOpsSec`, `writeOpsSec`, `temperatureC`, `isSystem`, `diskType`
  - `network`: `downloadSpeedBytesSec`, `uploadSpeedBytesSec`, `totalDownloadedBytes`, `totalUploadedBytes`, `activeInterface`, `interfaces[]`
  - `systemInfo`: `osName`, `osVersion`, `kernelVersion`, `hostname`, `architecture`, `manufacturer`, `model`, `uptimeSeconds`, `bootTime`, `platform`, `cpuModel`, `totalMemoryGB`, `processCount`, `threadCount`, `displayServer`, `desktopEnvironment`

---

## Prerequisites

### Node.js (Required for All Modes)
- **Node.js**: `v18+` (**Node.js v22 LTS** recommended, matching CI) and **npm** (`v10+`).
- Note on `package-lock.json`: The repository lockfile includes cross-platform optional native dependencies (such as `@rollup/rollup-win32-x64-msvc`, `@rollup/rollup-linux-x64-gnu`, `@tailwindcss/oxide-*`, `lightningcss-*`, and `@esbuild/*`). Always install dependencies cleanly with:
  ```bash
  npm ci --include=optional
  ```

### Native Desktop Toolchains (Tauri v2 + Rust)

#### Linux — Ubuntu / Debian
```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
source "$HOME/.cargo/env"

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

#### Linux — Arch Linux & Fedora
- **Arch Linux**:
  ```bash
  sudo pacman -Syu --needed webkit2gtk-4.1 base-devel curl wget openssl libappindicator-gtk3 librsvg patchelf
  ```
- **Fedora**:
  ```bash
  sudo dnf groupinstall "C Development Tools and Libraries"
  sudo dnf install webkit2gtk4.1-devel openssl-devel libappindicator-gtk3-devel librsvg2-devel patchelf
  ```

#### Windows 10 / Windows 11 (x64)
1. Install [Node.js v22 LTS](https://nodejs.org/).
2. Install [Rustup (`x86_64-pc-windows-msvc`)](https://rustup.rs/).
3. Install [Microsoft C++ Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/) with the **Desktop development with C++** workload and **Windows 10/11 SDK**.
4. Ensure **Microsoft Edge WebView2 Runtime** is installed (preinstalled on Windows 10/11; the NSIS installer also embeds the WebView2 bootstrapper automatically).
5. Install [NSIS](https://nsis.sourceforge.io/) if building `.exe` installers locally (`choco install nsis -y`).

---

## Running in Development & Web Production Mode

1. **Install npm dependencies** (preserving platform-specific native optional packages):
   ```bash
   npm ci --include=optional
   ```

2. **Web Development Mode (Express + Vite HMR-disabled middleware on port `3000`)**:
   ```bash
   npm run dev
   ```
   Open `http://localhost:3000` in your browser.

3. **Web Production Build & Server**:
   ```bash
   npm run build
   NODE_ENV=production npm run start
   ```
   `npm run build` compiles the Vite React frontend into `dist/` and bundles `server.ts` into `dist/server.cjs`.

4. **TypeScript Typecheck**:
   ```bash
   npm run lint
   ```

5. **Native Desktop Development Mode (Linux or Windows)**:
   ```bash
   npm run tauri dev
   ```
   Launches the Vite/Express dev server (`beforeDevCommand`) and opens the native Tauri v2 desktop window (`1320x860`, dark theme) with system tray support.

---

## Building Native Installers (`.deb`, `.AppImage`, `.exe`, `.msi`)

### Quick Reference

| Target Package | Host OS | Command | Output Path |
|---|---|---|---|
| **Linux `.deb`** | Ubuntu / Debian | `npm run tauri build -- --bundles deb` | `src-tauri/target/release/bundle/deb/SysMon Pro_1.3.0_amd64.deb` |
| **Linux `.deb` + `.AppImage`** | Linux | `npm run tauri build -- --bundles deb,appimage` | `src-tauri/target/release/bundle/deb/*.deb` & `appimage/*.AppImage` |
| **Windows `.exe` (Cross-Compile)** | Ubuntu / Debian | `npm run build:windows` | `src-tauri/target/x86_64-pc-windows-msvc/release/bundle/nsis/SysMon Pro_1.3.0_x64-setup.exe` |
| **Windows `.exe` (Native)** | Windows 10 / 11 | `npm run tauri build -- --bundles nsis` | `src-tauri\target\release\bundle\nsis\SysMon Pro_1.3.0_x64-setup.exe` |
| **Windows `.exe` + `.msi`** | Windows 10 / 11 | `npm run tauri build -- --bundles nsis,msi` | `nsis\*-setup.exe` & `msi\*_x64_en-US.msi` |

---

### Option 1: Creating a Linux `.deb` and `.AppImage` Package (Ubuntu / Debian)

> **Requirement**: Native Linux packages must be built on Linux with `libwebkit2gtk-4.1-dev` and the Tauri system libraries installed.

1. **Install system dependencies and Rust** (see [Linux — Ubuntu / Debian](#linux--ubuntu--debian)).
2. **Install Node dependencies and verify compilation**:
   ```bash
   npm ci --include=optional
   npm run lint
   (cd src-tauri && cargo check --all-targets)
   ```
3. **Build `.deb` and/or `.AppImage`**:
   ```bash
   # Build .deb only:
   npm run tauri build -- --bundles deb

   # Build both .deb and .AppImage:
   npm run tauri build -- --bundles deb,appimage

   # Or use the Linux config override explicitly:
   npm run tauri build -- --config src-tauri/tauri.linux.conf.json
   ```
4. **Inspect, install, or run**:
   ```bash
   # Inspect generated .deb metadata
   ls -lh src-tauri/target/release/bundle/deb/*.deb
   dpkg-deb --info src-tauri/target/release/bundle/deb/*.deb

   # Install .deb locally on Ubuntu / Debian
   sudo apt install ./src-tauri/target/release/bundle/deb/*.deb

   # Or run the portable AppImage directly
   chmod +x src-tauri/target/release/bundle/appimage/*.AppImage
   ./src-tauri/target/release/bundle/appimage/*.AppImage
   ```
   After installing the `.deb`, launch **SysMon Pro** from your desktop menu (category: `Utility`) or run `sysmon-desktop`. Uninstall with `sudo apt remove sysmon-desktop`.

---

### Option 2: Creating a Windows `.exe` Installer from Ubuntu / Debian Linux (`cargo-xwin`)

You can cross-compile a genuine **Windows 10/11 x64 NSIS `.exe` setup installer** directly from Ubuntu/Debian Linux without a Windows VM.

1. **Run the automated setup script** (`scripts/setup-windows-cross-compile.sh`):
   ```bash
   chmod +x scripts/setup-windows-cross-compile.sh
   ./scripts/setup-windows-cross-compile.sh
   ```
   The script inspects existing tools without overwriting configs and installs only what is missing:
   - `curl`, `ca-certificates`, `build-essential`, `pkg-config`
   - `llvm`, `clang`, `lld`, and `nsis` (`makensis`)
   - Node.js & npm (if not installed)
   - Rust stable toolchain + `x86_64-pc-windows-msvc` target
   - `cargo-xwin` (prebuilt binary or `cargo install --locked cargo-xwin`)

   Reload `PATH` if Rust was newly installed:
   ```bash
   source "$HOME/.cargo/env"
   ```

2. **Install npm dependencies**:
   ```bash
   npm ci --include=optional
   ```

3. **(Optional) Verify TypeScript & Windows Rust typechecking first**:
   ```bash
   npm run lint
   (cd src-tauri && cargo xwin check --target x86_64-pc-windows-msvc)
   ```

4. **Build the Windows x64 `.exe` installer**:
   ```bash
   npm run build:windows
   ```
   This executes:
   ```bash
   npm run tauri build -- --runner cargo-xwin --target x86_64-pc-windows-msvc --bundles nsis
   ```
   - Compiles the React 19 + Vite frontend into `dist/`.
   - Cross-compiles the Rust native monitoring engine for `x86_64-pc-windows-msvc`.
   - Downloads and caches the Windows CRT & Windows SDK libraries into `~/.cache/cargo-xwin/xwin` on first run.
   - Packages the NSIS `.exe` installer with `src-tauri/icons/icon.ico` and the embedded WebView2 bootstrapper.

5. **Verify the generated `.exe` artifact**:
   ```bash
   ls -lh "src-tauri/target/x86_64-pc-windows-msvc/release/bundle/nsis/"*.exe
   file "src-tauri/target/x86_64-pc-windows-msvc/release/bundle/nsis/"*.exe
   # Expected output:
   #   src-tauri/target/x86_64-pc-windows-msvc/release/bundle/nsis/SysMon Pro_1.3.0_x64-setup.exe
   #   PE32+ executable (GUI) x86-64, for MS Windows
   ```

---

### Option 3: Creating a Windows `.exe` (and `.msi`) Natively on Windows 10 / 11

1. **Install prerequisites** (Node.js 22, Rust MSVC, C++ Build Tools + Windows SDK, NSIS).
2. **Clean-install dependencies & verify Rollup native module**:
   ```powershell
   npm ci --include=optional
   npm ls rollup @rollup/rollup-win32-x64-msvc
   npm run lint
   npm run build
   ```
3. **Build Windows installers**:
   ```powershell
   # Verify Windows Rust compilation
   Push-Location src-tauri
   cargo check --all-targets
   Pop-Location

   # Build NSIS (.exe) only:
   npm run tauri build -- --bundles nsis

   # Or build BOTH NSIS (.exe) and WiX (.msi):
   npm run tauri build -- --bundles nsis,msi
   ```
4. **Generated installers**:
   ```text
   src-tauri\target\release\bundle\nsis\SysMon Pro_1.3.0_x64-setup.exe
   src-tauri\target\release\bundle\msi\SysMon Pro_1.3.0_x64_en-US.msi
   ```
   The NSIS installer creates the `SysMon Pro` Start Menu folder, supports per-user or per-machine installation (`installMode: "both"`), embeds the WebView2 bootstrapper, uses LZMA compression, and registers uninstallation in Windows Settings.

---

### Option 4: Automated CI Builds via GitHub Actions

Two independent workflows build artifacts on pushes to `main`/`master`, pull requests, manual triggers (`workflow_dispatch`), and `v*` version tags:

- **`.github/workflows/build.yml`** (`ubuntu-22.04`, Node 22):
  - Installs WebKitGTK & Tauri Linux dependencies, runs `npm ci --include=optional`, `npm run lint`, `npm run build`, `cargo check --all-targets`, and `npm run tauri build -- --bundles deb,appimage`.
  - Uploads the **`SysMon-Pro-Linux-x64`** artifact containing `.deb` and `.AppImage`.
- **`.github/workflows/build-windows.yml`** (`windows-latest`, Node 22, `x86_64-pc-windows-msvc`):
  - Ensures `makensis` is installed, performs a clean `npm ci --include=optional`, verifies `@rollup/rollup-win32-x64-msvc`, runs `npm run lint`, `npm run build`, `cargo check --all-targets`, and `npm run tauri build -- --bundles nsis,msi`.
  - Verifies non-empty `.exe` and `.msi` outputs, uploads the **`SysMon-Pro-Windows-x64-Setup`** artifact, and automatically publishes a **GitHub Release** when pushing a `v*` tag (e.g., `git tag v1.3.0 && git push origin v1.3.0`).

---

## NPM Scripts & Configuration Reference

### `package.json` Scripts

| Script | Command | Purpose |
|---|---|---|
| `npm run dev` | `tsx server.ts` | Start full-stack Express + Vite server on port `3000`. |
| `npm run build` | `vite build && esbuild server.ts ...` | Build production React bundle (`dist/`) and Node server (`dist/server.cjs`). |
| `npm run start` | `node dist/server.cjs` | Run compiled production web server (`NODE_ENV=production`). |
| `npm run preview` | `vite preview` | Preview built static frontend assets via Vite. |
| `npm run lint` | `tsc --noEmit` | Run strict TypeScript typechecking across the frontend and server. |
| `npm run tauri` | `tauri` | Invoke Tauri v2 CLI (`dev`, `build`, `info`). |
| `npm run build:windows` | `npm run tauri build -- --runner cargo-xwin --target x86_64-pc-windows-msvc --bundles nsis` | Cross-compile Windows x64 NSIS `.exe` installer from Linux. |
| `npm run clean` | `rm -rf dist server.js` | Remove built frontend and server output artifacts. |

### Tauri Configuration Files
- **`src-tauri/tauri.conf.json`**: Product name (`SysMon Pro`), version (`1.3.0`), bundle identifier (`com.sysmon.desktop`), window dimensions (`1320x860`, dark theme), tray icon (`icons/icon.png`), valid Tauri v2 `bundle.category` (`"Utility"`), and Windows NSIS/WiX/WebView2 configuration.
- **`src-tauri/tauri.linux.conf.json`**: Overrides `bundle.targets` to `["deb", "appimage"]` for Linux builds.
- **`src-tauri/capabilities/default.json`**: Grants `core:default`, `core:event:default`, and `shell:default` permissions to the desktop window.

---

## Directory Layout

```text
.
├── .github/workflows/
│   ├── build.yml                       # Ubuntu CI workflow (.deb & .AppImage)
│   └── build-windows.yml               # Windows CI workflow (NSIS .exe, .msi & GitHub Releases)
├── scripts/
│   ├── generate_app_icon.py            # Generates desktop/mobile app icon assets
│   └── setup-windows-cross-compile.sh  # Installs LLVM/Clang/LLD/NSIS/cargo-xwin on Ubuntu
├── src/
│   ├── components/                     # CircularProgress, CpuCoreGrid, DiskCard, GpuCard, Header,
│   │                                   # LiveChart, NetworkCard, ProcessDetails, ProcessTable,
│   │                                   # ResourceCard, Sidebar, StatusIndicator, SystemDetails,
│   │                                   # SystemInfo, UsageBar
│   ├── hooks/                          # useSystemStats (Tauri event stream + HTTP polling), useProcesses
│   ├── pages/                          # Overview, Processes, Cpu, Memory, Gpu, Disk, Network, Settings
│   ├── services/                       # systemMonitor.ts, tauriBridge.ts (IPC + REST fallback + benchmark)
│   ├── store/                          # systemStore.ts (Zustand state, settings, history buffer)
│   ├── types/                          # system.ts, process.ts (camelCase contracts)
│   ├── utils/                          # Null-safe formatters returning 'N/A' for missing sensors
│   ├── App.tsx                         # Main shell, sidebar navigation, responsive header
│   ├── index.css                       # Tailwind CSS v4 entry and custom utility styles
│   └── main.tsx                        # React 19 mount entry
├── src-tauri/
│   ├── capabilities/default.json       # Tauri v2 window & IPC capability permissions
│   ├── icons/                          # .ico, .icns, PNG desktop/mobile icon sets
│   ├── src/
│   │   ├── cpu/                        # mod.rs, linux.rs (sysfs/hwmon/loadavg), windows.rs (Registry/PDH)
│   │   ├── disk/                       # mod.rs (/proc/diskstats & Windows PDH \LogicalDisk(*))
│   │   ├── gpu/                        # mod.rs, detection.rs, nvidia.rs (NVML/nvidia-smi), amd.rs, intel.rs
│   │   ├── memory/                     # mod.rs (/proc/meminfo & GlobalMemoryStatusEx + PDH)
│   │   ├── network/                    # mod.rs (/sys/class/net + getifaddrs, GetAdaptersAddresses, async ping)
│   │   ├── platform/                   # mod.rs, linux.rs, windows.rs (OS detection, DMI/Registry, thread counts)
│   │   ├── processes/                  # mod.rs (process inspection & guarded SIGTERM / WM_CLOSE + TerminateProcess)
│   │   ├── models.rs                   # Unified Serde camelCase telemetry structs
│   │   ├── sys_monitor.rs              # Thread-safe MonitorEngine orchestrator
│   │   └── main.rs                     # Tauri v2 builder, async IPC commands, single-loop emitter
│   ├── Cargo.toml                      # Rust dependencies & Windows 0.52 Win32/PDH/DXGI features
│   ├── tauri.conf.json                 # Primary Tauri v2 + Windows NSIS/WiX bundle config
│   └── tauri.linux.conf.json           # Linux .deb / .AppImage bundle override
├── server.ts                           # Express + Vite/static production server (port 3000)
├── package.json                        # Scripts & frontend/Node dependencies
├── package-lock.json                   # Cross-platform npm lockfile (Linux, Windows, macOS native packages)
└── LICENSE                             # MIT License
```

---

## Troubleshooting

- **`Cannot find module @rollup/rollup-win32-x64-msvc` on Windows**:
  Delete `node_modules` and reinstall cleanly with optional dependencies enabled:
  ```powershell
  Remove-Item -Recurse -Force node_modules -ErrorAction SilentlyContinue
  npm ci --include=optional
  npm ls rollup @rollup/rollup-win32-x64-msvc
  ```
- **`Found version mismatched Tauri packages` during `tauri build`**:
  Ensure `@tauri-apps/api`, `@tauri-apps/plugin-shell`, and `@tauri-apps/cli` in `package.json` / `package-lock.json` match the minor versions of `tauri` and `tauri-plugin-shell` in `src-tauri/Cargo.lock`, then run `npm ci --include=optional`.
- **Low-memory Linux-to-Windows cross-compilation**:
  Limit parallel Rust compiler jobs to prevent OOM kills:
  ```bash
  CARGO_BUILD_JOBS=2 npm run build:windows
  ```
- **`cargo: command not found` or `makensis` missing on Ubuntu**:
  Reload your Rust environment with `source "$HOME/.cargo/env"` and verify `nsis` is installed (`sudo apt-get install -y nsis`).

---

## License

MIT License — see [LICENSE](LICENSE) for full details.
