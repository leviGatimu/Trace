using System.Runtime.InteropServices;
using Microsoft.Win32;
using Trace.Contracts;
using Trace.Tracker.Diagnostics;

namespace Trace.Tracker.Windows;

/// <summary>
/// What the System page shows: CPU, GPU and memory use, connected devices, and
/// the programs running now. Read on request while the page is open; nothing
/// here is ever written to the database.
/// </summary>
internal sealed class SystemMonitor(Func<IReadOnlyDictionary<string, (long Id, string Name)>> profiles)
{
    private readonly object _gate = new();
    private readonly WindowsProcessSource _processes = new();
    private readonly Lazy<string> _cpuName = new(ReadCpuName);
    private readonly Lazy<List<(string Name, long? MemoryBytes)>> _gpus = new(ReadGpus);

    private (long Idle, long Kernel, long User)? _lastSystem;
    private Dictionary<(uint Pid, long Created), (long Cpu, long At)> _lastProcess = [];
    private IntPtr _pdh;
    private IntPtr _gpuEngine;
    private IntPtr _gpuMemory;
    private bool _pdhTried;
    private (long At, List<ConnectedDevice> Devices)? _devices;

    public SystemLive Read(long nowUtcMs)
    {
        lock (_gate)
        {
            var processes = ReadProcesses(nowUtcMs, out var count);
            return new SystemLive(
                nowUtcMs,
                new CpuLive(_cpuName.Value, Environment.ProcessorCount, ReadCpu()),
                ReadMemory(),
                ReadGpu(),
                ReadDevices(nowUtcMs),
                count,
                processes);
        }
    }

    /* -- CPU and memory ------------------------------------------------- */

    private double ReadCpu()
    {
        if (!NativeMethods.GetSystemTimes(out var idle, out var kernel, out var user))
        {
            return 0;
        }

        var previous = _lastSystem;
        _lastSystem = (idle, kernel, user);
        if (previous is not { } last)
        {
            return 0;
        }

        // Kernel time includes idle time.
        var total = (kernel - last.Kernel) + (user - last.User);
        var busy = total - (idle - last.Idle);
        return total <= 0 ? 0 : Math.Clamp(busy * 100.0 / total, 0, 100);
    }

    private static MemoryLive ReadMemory()
    {
        var status = new NativeMethods.MEMORYSTATUSEX { dwLength = (uint)Marshal.SizeOf<NativeMethods.MEMORYSTATUSEX>() };
        return NativeMethods.GlobalMemoryStatusEx(ref status)
            ? new MemoryLive((long)status.ullTotalPhys, (long)(status.ullTotalPhys - status.ullAvailPhys))
            : new MemoryLive(0, 0);
    }

    private static string ReadCpuName()
    {
        try
        {
            using var key = Registry.LocalMachine.OpenSubKey(@"HARDWARE\DESCRIPTION\System\CentralProcessor\0");
            return (key?.GetValue("ProcessorNameString") as string)?.Trim() ?? "Processor";
        }
        catch (Exception ex) when (ex is System.Security.SecurityException or UnauthorizedAccessException or IOException)
        {
            return "Processor";
        }
    }

    /* -- GPU ------------------------------------------------------------ */

    /// <summary>
    /// GPU use as Task Manager computes it: for each adapter, each engine
    /// type's utilisation is summed across its engines, and the busiest type
    /// is the adapter's figure.
    /// </summary>
    private GpuLive? ReadGpu()
    {
        var adapters = _gpus.Value;
        if (!EnsurePdh())
        {
            return adapters.Count == 0 ? null : new GpuLive(adapters.Select(a => a.Name).ToList(), 0, null, adapters.Max(a => a.MemoryBytes));
        }

        NativeMethods.PdhCollectQueryData(_pdh);

        var byEngine = new Dictionary<(string Luid, string Type), double>();
        foreach (var (name, value) in ReadArray(_gpuEngine, NativeMethods.PDH_FMT_DOUBLE))
        {
            var luid = Between(name, "luid_", "_phys");
            var type = name[(name.IndexOf("engtype_", StringComparison.Ordinal) + 8)..];
            if (luid is null)
            {
                continue;
            }

            byEngine[(luid, type)] = byEngine.GetValueOrDefault((luid, type)) + value;
        }

        var usage = byEngine.Count == 0 ? 0 : byEngine.GroupBy(e => e.Key.Luid).Max(g => g.Max(e => e.Value));

        long? memoryUsed = null;
        foreach (var (_, value) in ReadArray(_gpuMemory, NativeMethods.PDH_FMT_LARGE))
        {
            memoryUsed = Math.Max(memoryUsed ?? 0, (long)value);
        }

        return new GpuLive(
            adapters.Select(a => a.Name).DefaultIfEmpty("Graphics").ToList(),
            Math.Clamp(usage, 0, 100),
            memoryUsed,
            adapters.Count == 0 ? null : adapters.Max(a => a.MemoryBytes));
    }

    private bool EnsurePdh()
    {
        if (_pdhTried)
        {
            return _pdh != IntPtr.Zero;
        }

        _pdhTried = true;
        if (NativeMethods.PdhOpenQuery(null, IntPtr.Zero, out _pdh) != 0
            || NativeMethods.PdhAddEnglishCounter(_pdh, @"\GPU Engine(*)\Utilization Percentage", IntPtr.Zero, out _gpuEngine) != 0)
        {
            Log.Info("GPU counters are not available on this machine.");
            _pdh = IntPtr.Zero;
            return false;
        }

        NativeMethods.PdhAddEnglishCounter(_pdh, @"\GPU Adapter Memory(*)\Dedicated Usage", IntPtr.Zero, out _gpuMemory);
        NativeMethods.PdhCollectQueryData(_pdh);
        return true;
    }

    /// <summary>A wildcard counter's values, by instance name.</summary>
    private static List<(string Name, double Value)> ReadArray(IntPtr counter, uint format)
    {
        var result = new List<(string, double)>();
        if (counter == IntPtr.Zero)
        {
            return result;
        }

        uint size = 0;
        var status = NativeMethods.PdhGetFormattedCounterArray(counter, format, ref size, out _, IntPtr.Zero);
        if (status != NativeMethods.PDH_MORE_DATA || size == 0)
        {
            return result;
        }

        var buffer = Marshal.AllocHGlobal((int)size);
        try
        {
            if (NativeMethods.PdhGetFormattedCounterArray(counter, format, ref size, out var count, buffer) != 0)
            {
                return result;
            }

            // PDH_FMT_COUNTERVALUE_ITEM_W: name pointer, then a status and the value.
            var stride = IntPtr.Size + 16;
            for (var i = 0; i < count; i++)
            {
                var item = buffer + i * stride;
                var name = Marshal.PtrToStringUni(Marshal.ReadIntPtr(item)) ?? string.Empty;
                var value = format == NativeMethods.PDH_FMT_LARGE
                    ? Marshal.ReadInt64(item + IntPtr.Size + 8)
                    : BitConverter.Int64BitsToDouble(Marshal.ReadInt64(item + IntPtr.Size + 8));
                result.Add((name, value));
            }
        }
        finally
        {
            Marshal.FreeHGlobal(buffer);
        }

        return result;
    }

    /// <summary>Graphics adapters and their dedicated memory, from the display class in the registry.</summary>
    private static List<(string Name, long? MemoryBytes)> ReadGpus()
    {
        var gpus = new List<(string, long?)>();
        try
        {
            using var display = Registry.LocalMachine.OpenSubKey(@"SYSTEM\CurrentControlSet\Control\Class\{4d36e968-e325-11ce-bfc1-08002be10318}");
            foreach (var sub in display?.GetSubKeyNames() ?? [])
            {
                if (!sub.All(char.IsAsciiDigit))
                {
                    continue;
                }

                using var key = display!.OpenSubKey(sub);
                if (key?.GetValue("DriverDesc") is not string name || name.Contains("Basic Display", StringComparison.OrdinalIgnoreCase))
                {
                    continue;
                }

                long? memory = key.GetValue("HardwareInformation.qwMemorySize") switch
                {
                    long value => value,
                    byte[] bytes when bytes.Length >= 8 => BitConverter.ToInt64(bytes),
                    byte[] bytes when bytes.Length >= 4 => BitConverter.ToUInt32(bytes),
                    int value => (uint)value,
                    _ => null,
                };
                if (!gpus.Any(g => g.Item1 == name))
                {
                    gpus.Add((name, memory));
                }
            }
        }
        catch (Exception ex) when (ex is System.Security.SecurityException or UnauthorizedAccessException or IOException)
        {
            Log.Debug($"Could not read graphics adapters: {ex.Message}");
        }

        return gpus;
    }

    private static string? Between(string text, string start, string end)
    {
        var from = text.IndexOf(start, StringComparison.Ordinal);
        if (from < 0)
        {
            return null;
        }

        from += start.Length;
        var to = text.IndexOf(end, from, StringComparison.Ordinal);
        return to < 0 ? null : text[from..to];
    }

    /* -- Programs running now --------------------------------------------- */

    private List<LiveProcess> ReadProcesses(long nowUtcMs, out int count)
    {
        var snapshot = _processes.Snapshot();
        count = snapshot.Count;
        var names = profiles();
        var next = new Dictionary<(uint, long), (long Cpu, long At)>();
        var groups = new Dictionary<string, (int Count, double Cpu, long Memory)>(StringComparer.Ordinal);
        var cores = Math.Max(1, Environment.ProcessorCount);

        foreach (var process in snapshot)
        {
            var handle = NativeMethods.OpenProcess(NativeMethods.PROCESS_QUERY_LIMITED_INFORMATION, false, process.Pid);
            long cpuTime = 0;
            long memory = 0;
            if (handle != IntPtr.Zero)
            {
                try
                {
                    if (NativeMethods.GetProcessTimes(handle, out _, out _, out var kernel, out var user))
                    {
                        cpuTime = kernel + user;
                    }

                    if (NativeMethods.GetProcessMemoryInfo(handle, out var counters, (uint)Marshal.SizeOf<NativeMethods.PROCESS_MEMORY_COUNTERS>()))
                    {
                        memory = (long)counters.WorkingSetSize;
                    }
                }
                finally
                {
                    NativeMethods.CloseHandle(handle);
                }
            }

            var key = (process.Pid, process.CreatedUtcMs ?? 0);
            next[key] = (cpuTime, nowUtcMs);
            var percent = 0.0;
            if (_lastProcess.TryGetValue(key, out var last) && nowUtcMs > last.At)
            {
                // CPU time is in 100 ns units; wall time in ms.
                percent = (cpuTime - last.Cpu) / 10_000.0 / (nowUtcMs - last.At) / cores * 100;
            }

            var group = groups.GetValueOrDefault(process.Executable);
            groups[process.Executable] = (group.Count + 1, group.Cpu + Math.Max(0, percent), group.Memory + memory);
        }

        _lastProcess = next;
        return groups
            .Select(pair =>
            {
                var known = names.TryGetValue(pair.Key, out var profile) ? profile : ((long Id, string Name)?)null;
                return new LiveProcess(
                    pair.Key,
                    known?.Name ?? pair.Key,
                    known?.Id,
                    pair.Value.Count,
                    Math.Round(Math.Clamp(pair.Value.Cpu, 0, 100), 1),
                    pair.Value.Memory);
            })
            .OrderByDescending(process => process.CpuPercent)
            .ThenByDescending(process => process.MemoryBytes)
            .ToList();
    }

    /* -- Connected devices ------------------------------------------------ */

    /// <summary>Re-read at most every few seconds: walking the device tree is the slowest part.</summary>
    private List<ConnectedDevice> ReadDevices(long nowUtcMs)
    {
        if (_devices is { } cached && nowUtcMs - cached.At < 4_000)
        {
            return cached.Devices;
        }

        var devices = DeviceList.Read();
        _devices = (nowUtcMs, devices);
        return devices;
    }
}

/// <summary>The devices present now, sorted into the kinds people recognise.</summary>
internal static class DeviceList
{
    /// <summary>Entries that describe plumbing rather than something you plugged in.</summary>
    private static readonly string[] Plumbing =
    [
        "root hub", "generic usb hub", "usb composite", "host controller", "vendor-defined", "consumer control",
        "system controller", "enumerator", "radio", "rfcomm", "le enumerator", "device identification service",
        "generic attribute", "generic access", "avrcp", "transport", "converted portable device",
        " service", "root print queue", "gamepad bus", "synthetic",
    ];

    public static unsafe List<ConnectedDevice> Read()
    {
        var set = NativeMethods.SetupDiGetClassDevs(IntPtr.Zero, IntPtr.Zero, IntPtr.Zero, NativeMethods.DIGCF_PRESENT | NativeMethods.DIGCF_ALLCLASSES);
        if (set == IntPtr.Zero || set == new IntPtr(-1))
        {
            return [];
        }

        var devices = new List<ConnectedDevice>();
        try
        {
            var data = new NativeMethods.SP_DEVINFO_DATA { cbSize = (uint)Marshal.SizeOf<NativeMethods.SP_DEVINFO_DATA>() };
            for (uint index = 0; NativeMethods.SetupDiEnumDeviceInfo(set, index, ref data); index++)
            {
                var deviceClass = Property(set, ref data, NativeMethods.SPDRP_CLASS);
                var name = Property(set, ref data, NativeMethods.SPDRP_FRIENDLYNAME) ?? Property(set, ref data, NativeMethods.SPDRP_DEVICEDESC);
                if (deviceClass is null || name is null)
                {
                    continue;
                }

                var instance = InstanceId(set, ref data) ?? string.Empty;
                var kind = KindOf(deviceClass, name, instance);
                if (kind is null || Plumbing.Any(word => name.Contains(word, StringComparison.OrdinalIgnoreCase)))
                {
                    continue;
                }

                var manufacturer = Property(set, ref data, NativeMethods.SPDRP_MFG);
                var label = kind == "storage" && name.Length <= 4 && name.Contains(':', StringComparison.Ordinal)
                    ? $"Drive {name.TrimEnd(Path.DirectorySeparatorChar)}"
                    : Tidy(name);
                devices.Add(new ConnectedDevice(label, kind, ConnectionOf(instance, kind), manufacturer?.Trim('(', ')', ' ')));
            }
        }
        finally
        {
            NativeMethods.SetupDiDestroyDeviceInfoList(set);
        }

        // One keyboard often appears as several HID collections: show it once.
        return devices
            .GroupBy(device => (device.Kind, device.Name, device.Connection))
            .Select(group => group.First())
            .OrderBy(device => device.Kind, StringComparer.Ordinal)
            .ThenBy(device => device.Name, StringComparer.OrdinalIgnoreCase)
            .ToList();
    }

    private static string? KindOf(string deviceClass, string name, string instance) => deviceClass switch
    {
        "Keyboard" => "keyboard",
        "Mouse" => "mouse",
        "AudioEndpoint" => name.Contains("Microphone", StringComparison.OrdinalIgnoreCase)
            || name.Contains("Mic ", StringComparison.OrdinalIgnoreCase) ? "microphone" : "speaker",
        "Camera" or "Image" => "camera",
        "Monitor" => "display",
        "DiskDrive" => "storage",
        // A drive letter here is a removable drive, not a phone.
        "WPD" => name.Length <= 4 && name.Contains(':', StringComparison.Ordinal) ? "storage" : "phone",
        "Printer" or "PrintQueue" => name.Contains("PDF", StringComparison.OrdinalIgnoreCase)
            || name.Contains("OneNote", StringComparison.OrdinalIgnoreCase)
            || name.Contains("XPS", StringComparison.OrdinalIgnoreCase)
            || name.Contains("Fax", StringComparison.OrdinalIgnoreCase) ? null : "printer",
        "Bluetooth" when !instance.StartsWith("USB", StringComparison.OrdinalIgnoreCase)
            && !instance.StartsWith("PCI", StringComparison.OrdinalIgnoreCase) => "bluetooth",
        "HIDClass" when name.Contains("game controller", StringComparison.OrdinalIgnoreCase)
            || name.Contains("Xbox", StringComparison.OrdinalIgnoreCase)
            || name.Contains("gamepad", StringComparison.OrdinalIgnoreCase) => "controller",
        "XnaComposite" or "XboxComposite" => "controller",
        _ => null,
    };

    private static string ConnectionOf(string instance, string kind)
    {
        if (instance.Contains("BTH", StringComparison.OrdinalIgnoreCase)
            || instance.Contains("{00001124", StringComparison.OrdinalIgnoreCase)
            || instance.Contains("{00001812", StringComparison.OrdinalIgnoreCase)
            || kind == "bluetooth")
        {
            return "Bluetooth";
        }

        if (instance.StartsWith("USB", StringComparison.OrdinalIgnoreCase) || instance.Contains("VID_", StringComparison.OrdinalIgnoreCase))
        {
            return "USB";
        }

        return "Built-in";
    }

    private static string Tidy(string name) => name.Replace("  ", " ", StringComparison.Ordinal).Trim();

    private static unsafe string? Property(IntPtr set, ref NativeMethods.SP_DEVINFO_DATA data, uint property)
    {
        var buffer = stackalloc byte[1024];
        if (!NativeMethods.SetupDiGetDeviceRegistryProperty(set, ref data, property, out _, buffer, 1024, out var size) || size < 2)
        {
            return null;
        }

        var text = new string((char*)buffer, 0, (int)(size / 2)).TrimEnd('\0');
        return string.IsNullOrWhiteSpace(text) ? null : text;
    }

    private static unsafe string? InstanceId(IntPtr set, ref NativeMethods.SP_DEVINFO_DATA data)
    {
        var buffer = stackalloc char[512];
        return NativeMethods.SetupDiGetDeviceInstanceId(set, ref data, buffer, 512, out _) ? new string(buffer) : null;
    }
}
