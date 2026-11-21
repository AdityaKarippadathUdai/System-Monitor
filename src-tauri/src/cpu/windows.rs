use super::{extract_component_cpu_temp, normalize_manufacturer, CpuPlatformDetails};
use crate::models::CpuCache;
use std::ffi::c_void;
use sysinfo::Components;
use windows::{
    core::{w, PCWSTR},
    Win32::System::{
        Performance::{
            PdhAddEnglishCounterW, PdhCloseQuery, PdhCollectQueryData,
            PdhGetFormattedCounterValue, PdhOpenQueryW, PDH_FMT_COUNTERVALUE, PDH_FMT_DOUBLE,
        },
        Registry::{HKEY_LOCAL_MACHINE, RRF_RT_REG_DWORD, RRF_RT_REG_SZ, RegGetValueW},
    },
};

type PdhQuery = isize;
type PdhCounter = isize;

pub struct WindowsCpuMonitor {
    query: Option<PdhQuery>,
    perf_counter: Option<PdhCounter>,
    temp_counter: Option<PdhCounter>,
    base_mhz: Option<u32>,
    vendor_id: Option<String>,
    initialized_sample: bool,
}

// PDH handles are exclusively accessed behind MonitorEngine's Mutex.
unsafe impl Send for WindowsCpuMonitor {}
unsafe impl Sync for WindowsCpuMonitor {}

impl WindowsCpuMonitor {
    pub fn new() -> Self {
        let cpu_key = w!(r#"HARDWARE\DESCRIPTION\System\CentralProcessor\0"#);
        let base_mhz = read_hklm_dword(cpu_key, w!("~MHz"));
        let vendor_id = read_hklm_string(cpu_key, w!("VendorIdentifier"));

        let mut query: PdhQuery = 0;
        let mut perf_counter: PdhCounter = 0;
        let mut temp_counter: PdhCounter = 0;

        let (q_opt, p_opt, t_opt) = unsafe {
            if PdhOpenQueryW(PCWSTR::null(), 0, &mut query) == 0 {
                let p_ok = PdhAddEnglishCounterW(
                    query,
                    w!(r#"\Processor Information(_Total)\% Processor Performance"#),
                    0,
                    &mut perf_counter,
                ) == 0;

                let t_ok = PdhAddEnglishCounterW(
                    query,
                    w!(r#"\Thermal Zone Information(*)\Temperature"#),
                    0,
                    &mut temp_counter,
                ) == 0;

                let _ = PdhCollectQueryData(query);
                (
                    Some(query),
                    if p_ok { Some(perf_counter) } else { None },
                    if t_ok { Some(temp_counter) } else { None },
                )
            } else {
                (None, None, None)
            }
        };

        Self {
            query: q_opt,
            perf_counter: p_opt,
            temp_counter: t_opt,
            base_mhz,
            vendor_id,
            initialized_sample: false,
        }
    }

    pub fn collect_details(
        &mut self,
        components: &Components,
        sysinfo_freq_ghz: Option<f32>,
        raw_vendor: String,
    ) -> CpuPlatformDetails {
        let mut live_freq_ghz = sysinfo_freq_ghz;
        let mut thermal_zone_temp: Option<f32> = None;

        if let Some(q) = self.query {
            unsafe {
                if PdhCollectQueryData(q) == 0 {
                    if self.initialized_sample {
                        if let Some(c) = self.perf_counter {
                            let mut val = PDH_FMT_COUNTERVALUE::default();
                            if PdhGetFormattedCounterValue(c, PDH_FMT_DOUBLE, None, &mut val) == 0 {
                                let pct = val.Anonymous.doubleValue;
                                if pct > 0.0 && pct < 400.0 {
                                    if let Some(base) = self.base_mhz {
                                        let ghz = (base as f64 * (pct / 100.0)) / 1000.0;
                                        live_freq_ghz = Some(((ghz as f32) * 100.0).round() / 100.0);
                                    }
                                }
                            }
                        }
                    }
                    self.initialized_sample = true;

                    if let Some(tc) = self.temp_counter {
                        let mut val = PDH_FMT_COUNTERVALUE::default();
                        if PdhGetFormattedCounterValue(tc, PDH_FMT_DOUBLE, None, &mut val) == 0 {
                            let raw_k = val.Anonymous.doubleValue;
                            // Windows Thermal Zone Information reports Kelvin (or tenths of Kelvin on some OEMs)
                            let celsius = if raw_k > 2000.0 {
                                (raw_k / 10.0) - 273.15
                            } else if raw_k > 200.0 {
                                raw_k - 273.15
                            } else {
                                raw_k
                            };
                            if celsius > 5.0 && celsius < 125.0 {
                                thermal_zone_temp = Some(((celsius as f32) * 10.0).round() / 10.0);
                            }
                        }
                    }
                }
            }
        }

        let max_frequency_ghz = self
            .base_mhz
            .filter(|&m| m > 0)
            .map(|m| ((m as f32 / 1000.0) * 100.0).round() / 100.0);

        let vendor = self
            .vendor_id
            .clone()
            .unwrap_or_else(|| raw_vendor.clone());

        let temperature_c = extract_component_cpu_temp(components).or(thermal_zone_temp);

        CpuPlatformDetails {
            frequency_ghz: live_freq_ghz.or(max_frequency_ghz),
            max_frequency_ghz,
            temperature_c,
            manufacturer: normalize_manufacturer(&vendor, ""),
            cache: CpuCache {
                l1: None,
                l2: None,
                l3: None,
            },
            governor: Some("Windows Power Plan".to_string()),
            load_average: None,
        }
    }
}

impl Drop for WindowsCpuMonitor {
    fn drop(&mut self) {
        if let Some(q) = self.query.take() {
            unsafe {
                let _ = PdhCloseQuery(q);
            }
        }
    }
}

fn read_hklm_dword(sub_key: PCWSTR, value_name: PCWSTR) -> Option<u32> {
    unsafe {
        let mut val: u32 = 0;
        let mut cb_data: u32 = std::mem::size_of::<u32>() as u32;
        if RegGetValueW(
            HKEY_LOCAL_MACHINE,
            sub_key,
            value_name,
            RRF_RT_REG_DWORD,
            None,
            Some(&mut val as *mut u32 as *mut c_void),
            Some(&mut cb_data),
        )
        .is_ok()
            && val > 0
        {
            Some(val)
        } else {
            None
        }
    }
}

fn read_hklm_string(sub_key: PCWSTR, value_name: PCWSTR) -> Option<String> {
    unsafe {
        let mut cb_data: u32 = 0;
        if RegGetValueW(
            HKEY_LOCAL_MACHINE,
            sub_key,
            value_name,
            RRF_RT_REG_SZ,
            None,
            None,
            Some(&mut cb_data),
        )
        .is_err()
            || cb_data == 0
        {
            return None;
        }
        let buf_len = (cb_data as usize) / std::mem::size_of::<u16>() + 1;
        let mut buffer = vec![0u16; buf_len];
        if RegGetValueW(
            HKEY_LOCAL_MACHINE,
            sub_key,
            value_name,
            RRF_RT_REG_SZ,
            None,
            Some(buffer.as_mut_ptr() as *mut c_void),
            Some(&mut cb_data),
        )
        .is_err()
        {
            return None;
        }
        while let Some(&0) = buffer.last() {
            buffer.pop();
        }
        let s = String::from_utf16_lossy(&buffer).trim().to_string();
        if s.is_empty() {
            None
        } else {
            Some(s)
        }
    }
}
