pub mod amd;
pub mod detection;
pub mod intel;
pub mod nvidia;

use crate::models::GpuStats;

pub struct GpuMonitor {
    nvidia: nvidia::NvidiaMonitor,
    #[cfg(target_os = "windows")]
    win_pdh: detection::WindowsGpuPdhMonitor,
}

impl GpuMonitor {
    pub fn new() -> Self {
        Self {
            nvidia: nvidia::NvidiaMonitor::new(),
            #[cfg(target_os = "windows")]
            win_pdh: detection::WindowsGpuPdhMonitor::new(),
        }
    }

    pub fn collect(&mut self) -> Vec<GpuStats> {
        #[cfg(target_os = "windows")]
        {
            detection::collect_windows_gpus(&mut self.nvidia, &mut self.win_pdh)
        }
        #[cfg(target_os = "linux")]
        {
            detection::collect_linux_gpus(&mut self.nvidia)
        }
        #[cfg(not(any(target_os = "linux", target_os = "windows")))]
        {
            self.nvidia.collect()
        }
    }
}
