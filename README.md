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

### Production Bundles (Platform Independent)
Build on **Linux** to generate `.deb` and `.AppImage` packages:
```bash
npm run tauri build -- --bundles deb,appimage
# Outputs:
#   src-tauri/target/release/bundle/deb/*.deb
#   src-tauri/target/release/bundle/appimage/*.AppImage
```

Build on **Windows 10 / 11 (x64)** with Rust MSVC, Node.js, and WebView2 to generate the standalone **NSIS `.exe`** and **`.msi`** installers:
```powershell
npm install
npm run tauri build
# Or build only the NSIS .exe setup installer:
npm run tauri build -- --bundles nsis
# Outputs:
#   src-tauri/target/release/bundle/nsis/SysMon Pro_1.3.0_x64-setup.exe
#   src-tauri/target/release/bundle/msi/SysMon Pro_1.3.0_x64_en-US.msi
```

### Automated CI Builds (Linux & Windows)
- **`.github/workflows/build-windows.yml`**: Runs natively on `windows-latest` (`x86_64-pc-windows-msvc`), ensures NSIS is installed, verifies TypeScript + Rust compilation, builds the standalone Windows x64 `.exe` (NSIS) and `.msi` installers, uploads `SysMon-Pro-Windows-x64-Setup` as a downloadable artifact, and automatically publishes a GitHub Release when a `v*` tag is pushed.
- **`.github/workflows/build.yml`**: Runs natively on `ubuntu-22.04` to produce `.deb` and `.AppImage` packages.

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
