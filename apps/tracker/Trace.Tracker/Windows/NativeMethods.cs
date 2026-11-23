using System.Runtime.InteropServices;

namespace Trace.Tracker.Windows;

/// <summary>
/// The complete Win32 surface Trace uses. Nothing outside this
/// <c>Windows/</c> folder references it — the rest of the tracker consumes
/// plain C# signals and has no idea Win32 exists.
///
/// What is deliberately absent matters as much as what is here. There is no
/// SetWindowsHookEx, no keyboard or mouse hook, no GetAsyncKeyState, no
/// clipboard API, no screen-capture API, no UI Automation into other processes,
/// and no DLL injection. That is both the privacy contract in DOCS/specs/privacy.md §3
/// and what keeps the binary from resembling malware to endpoint protection
/// (DOCS/specs/windows-integration.md &amp; Application Lifecycle.md §32).
/// </summary>
internal static partial class NativeMethods
{
    // -----------------------------------------------------------------------
    // Foreground window and titles
    // -----------------------------------------------------------------------

    [LibraryImport("user32.dll")]
    internal static partial IntPtr GetForegroundWindow();

    [LibraryImport("user32.dll", SetLastError = true)]
    internal static partial uint GetWindowThreadProcessId(IntPtr hWnd, out uint lpdwProcessId);

    [LibraryImport("user32.dll", EntryPoint = "GetWindowTextLengthW", SetLastError = true)]
    internal static partial int GetWindowTextLength(IntPtr hWnd);

    // Buffer-filling APIs take raw char* rather than char[]. A managed array
    // would need runtime marshalling disabled assembly-wide (SYSLIB1051); a
    // pointer needs nothing and copies nothing. Callers pin with `fixed`.
    [LibraryImport("user32.dll", EntryPoint = "GetWindowTextW", SetLastError = true)]
    internal static unsafe partial int GetWindowText(IntPtr hWnd, char* lpString, int nMaxCount);

    [LibraryImport("user32.dll", EntryPoint = "GetClassNameW", SetLastError = true)]
    internal static unsafe partial int GetClassName(IntPtr hWnd, char* lpClassName, int nMaxCount);

    [LibraryImport("user32.dll")]
    [return: MarshalAs(UnmanagedType.Bool)]
    internal static partial bool IsWindow(IntPtr hWnd);

    [LibraryImport("user32.dll")]
    [return: MarshalAs(UnmanagedType.Bool)]
    internal static partial bool EnumChildWindows(IntPtr hWndParent, IntPtr lpEnumFunc, IntPtr lParam);

    /// <summary>Callback for <see cref="EnumChildWindows"/>. Return false to stop enumeration.</summary>
    internal delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);

    // -----------------------------------------------------------------------
    // Process identity
    // -----------------------------------------------------------------------

    /// <summary>
    /// The minimum access right that yields an executable path. Unlike
    /// PROCESS_QUERY_INFORMATION it succeeds for same-user processes without
    /// elevation, which is what lets Trace run as asInvoker.
    /// </summary>
    internal const uint PROCESS_QUERY_LIMITED_INFORMATION = 0x1000;

    [LibraryImport("kernel32.dll", SetLastError = true)]
    internal static partial IntPtr OpenProcess(
        uint dwDesiredAccess,
        [MarshalAs(UnmanagedType.Bool)] bool bInheritHandle,
        uint dwProcessId);

    [LibraryImport("kernel32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    internal static partial bool CloseHandle(IntPtr hObject);

    [LibraryImport("kernel32.dll", EntryPoint = "QueryFullProcessImageNameW", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    internal static unsafe partial bool QueryFullProcessImageName(
        IntPtr hProcess,
        uint dwFlags,
        char* lpExeName,
        ref uint lpdwSize);

    // -----------------------------------------------------------------------
    // Running processes (background apps, opt-in)
    //
    // A Toolhelp snapshot lists each process's id, parent id and executable
    // name, and nothing else: no command line, no memory, no modules. Reading
    // a process's start time needs only the same limited right as its path.
    // -----------------------------------------------------------------------

    internal const uint TH32CS_SNAPPROCESS = 0x00000002;

    [StructLayout(LayoutKind.Sequential)]
    internal unsafe struct PROCESSENTRY32W
    {
        public uint dwSize;
        public uint cntUsage;
        public uint th32ProcessID;
        public UIntPtr th32DefaultHeapID;
        public uint th32ModuleID;
        public uint cntThreads;
        public uint th32ParentProcessID;
        public int pcPriClassBase;
        public uint dwFlags;
        public fixed char szExeFile[260];
    }

    [LibraryImport("kernel32.dll", SetLastError = true)]
    internal static partial IntPtr CreateToolhelp32Snapshot(uint dwFlags, uint th32ProcessID);

    [LibraryImport("kernel32.dll", EntryPoint = "Process32FirstW", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    internal static unsafe partial bool Process32First(IntPtr hSnapshot, PROCESSENTRY32W* lppe);

    [LibraryImport("kernel32.dll", EntryPoint = "Process32NextW", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    internal static unsafe partial bool Process32Next(IntPtr hSnapshot, PROCESSENTRY32W* lppe);

    [LibraryImport("kernel32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    internal static partial bool GetProcessTimes(
        IntPtr hProcess, out long lpCreationTime, out long lpExitTime, out long lpKernelTime, out long lpUserTime);

    [LibraryImport("kernel32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    internal static partial bool ProcessIdToSessionId(uint dwProcessId, out uint pSessionId);

    // -----------------------------------------------------------------------
    // System page (live only; nothing here is stored)
    //
    // Whole-machine CPU and memory, GPU utilisation from Windows' own
    // performance counters, and the list of connected devices by name and
    // class. No device is opened, read from or written to.
    // -----------------------------------------------------------------------

    [LibraryImport("kernel32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    internal static partial bool GetSystemTimes(out long lpIdleTime, out long lpKernelTime, out long lpUserTime);

    [StructLayout(LayoutKind.Sequential)]
    internal struct MEMORYSTATUSEX
    {
        public uint dwLength;
        public uint dwMemoryLoad;
        public ulong ullTotalPhys;
        public ulong ullAvailPhys;
        public ulong ullTotalPageFile;
        public ulong ullAvailPageFile;
        public ulong ullTotalVirtual;
        public ulong ullAvailVirtual;
        public ulong ullAvailExtendedVirtual;
    }

    [LibraryImport("kernel32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    internal static partial bool GlobalMemoryStatusEx(ref MEMORYSTATUSEX lpBuffer);

    [StructLayout(LayoutKind.Sequential)]
    internal struct PROCESS_MEMORY_COUNTERS
    {
        public uint cb;
        public uint PageFaultCount;
        public UIntPtr PeakWorkingSetSize;
        public UIntPtr WorkingSetSize;
        public UIntPtr QuotaPeakPagedPoolUsage;
        public UIntPtr QuotaPagedPoolUsage;
        public UIntPtr QuotaPeakNonPagedPoolUsage;
        public UIntPtr QuotaNonPagedPoolUsage;
        public UIntPtr PagefileUsage;
        public UIntPtr PeakPagefileUsage;
    }

    [LibraryImport("kernel32.dll", EntryPoint = "K32GetProcessMemoryInfo", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    internal static partial bool GetProcessMemoryInfo(IntPtr hProcess, out PROCESS_MEMORY_COUNTERS counters, uint cb);

    internal const uint PDH_FMT_DOUBLE = 0x00000200;
    internal const uint PDH_FMT_LARGE = 0x00000400;
    internal const uint PDH_MORE_DATA = 0x800007D2;

    [LibraryImport("pdh.dll", EntryPoint = "PdhOpenQueryW", StringMarshalling = StringMarshalling.Utf16)]
    internal static partial uint PdhOpenQuery(string? dataSource, IntPtr userData, out IntPtr query);

    [LibraryImport("pdh.dll", EntryPoint = "PdhAddEnglishCounterW", StringMarshalling = StringMarshalling.Utf16)]
    internal static partial uint PdhAddEnglishCounter(IntPtr query, string counterPath, IntPtr userData, out IntPtr counter);

    [LibraryImport("pdh.dll")]
    internal static partial uint PdhCollectQueryData(IntPtr query);

    [LibraryImport("pdh.dll", EntryPoint = "PdhGetFormattedCounterArrayW")]
    internal static partial uint PdhGetFormattedCounterArray(
        IntPtr counter, uint format, ref uint bufferSize, out uint itemCount, IntPtr itemBuffer);

    internal const uint DIGCF_PRESENT = 0x00000002;
    internal const uint DIGCF_ALLCLASSES = 0x00000004;
    internal const uint SPDRP_DEVICEDESC = 0x00000000;
    internal const uint SPDRP_CLASS = 0x00000007;
    internal const uint SPDRP_MFG = 0x0000000B;
    internal const uint SPDRP_FRIENDLYNAME = 0x0000000C;

    [StructLayout(LayoutKind.Sequential)]
    internal struct SP_DEVINFO_DATA
    {
        public uint cbSize;
        public Guid ClassGuid;
        public uint DevInst;
        public UIntPtr Reserved;
    }

    [LibraryImport("setupapi.dll", EntryPoint = "SetupDiGetClassDevsW", SetLastError = true)]
    internal static partial IntPtr SetupDiGetClassDevs(IntPtr classGuid, IntPtr enumerator, IntPtr hwndParent, uint flags);

    [LibraryImport("setupapi.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    internal static partial bool SetupDiEnumDeviceInfo(IntPtr deviceInfoSet, uint memberIndex, ref SP_DEVINFO_DATA deviceInfoData);

    [LibraryImport("setupapi.dll", EntryPoint = "SetupDiGetDeviceRegistryPropertyW", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    internal static unsafe partial bool SetupDiGetDeviceRegistryProperty(
        IntPtr deviceInfoSet, ref SP_DEVINFO_DATA deviceInfoData, uint property, out uint propertyRegDataType,
        byte* propertyBuffer, uint propertyBufferSize, out uint requiredSize);

    [LibraryImport("setupapi.dll", EntryPoint = "SetupDiGetDeviceInstanceIdW", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    internal static unsafe partial bool SetupDiGetDeviceInstanceId(
        IntPtr deviceInfoSet, ref SP_DEVINFO_DATA deviceInfoData, char* deviceInstanceId, uint deviceInstanceIdSize, out uint requiredSize);

    [LibraryImport("setupapi.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    internal static partial bool SetupDiDestroyDeviceInfoList(IntPtr deviceInfoSet);

    // -----------------------------------------------------------------------
    // Idle detection
    //
    // GetLastInputInfo returns a tick count and nothing else. No key code, no
    // coordinate, no content. It answers exactly one question — "how long since
    // the user last interacted?" — which is the whole of what DOCS/specs/privacy.md §3
    // permits.
    // -----------------------------------------------------------------------

    [StructLayout(LayoutKind.Sequential)]
    internal struct LASTINPUTINFO
    {
        public uint cbSize;
        public uint dwTime;
    }

    [LibraryImport("user32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    internal static partial bool GetLastInputInfo(ref LASTINPUTINFO plii);

    [LibraryImport("kernel32.dll")]
    internal static partial ulong GetTickCount64();

    // -----------------------------------------------------------------------
    // Foreground / title change events
    // -----------------------------------------------------------------------

    internal const uint EVENT_SYSTEM_FOREGROUND = 0x0003;
    internal const uint EVENT_OBJECT_NAMECHANGE = 0x800C;
    internal const uint WINEVENT_OUTOFCONTEXT = 0x0000;
    internal const uint WINEVENT_SKIPOWNPROCESS = 0x0002;
    internal const int OBJID_WINDOW = 0;
    internal const int CHILDID_SELF = 0;

    /// <summary>
    /// Out-of-context hook callback. Runs on the thread that owns the hook's
    /// message pump, so it must return promptly — every implementation here does
    /// nothing but enqueue a signal.
    /// </summary>
    internal delegate void WinEventProc(
        IntPtr hWinEventHook,
        uint eventType,
        IntPtr hwnd,
        int idObject,
        int idChild,
        uint dwEventThread,
        uint dwmsEventTime);

    [LibraryImport("user32.dll", SetLastError = true)]
    internal static partial IntPtr SetWinEventHook(
        uint eventMin,
        uint eventMax,
        IntPtr hmodWinEventProc,
        IntPtr lpfnWinEventProc,
        uint idProcess,
        uint idThread,
        uint dwFlags);

    [LibraryImport("user32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    internal static partial bool UnhookWinEvent(IntPtr hWinEventHook);

    // -----------------------------------------------------------------------
    // Session (lock/unlock) notifications
    // -----------------------------------------------------------------------

    internal const int WM_WTSSESSION_CHANGE = 0x02B1;
    internal const int WTS_SESSION_LOCK = 0x7;
    internal const int WTS_SESSION_UNLOCK = 0x8;
    internal const int WTS_SESSION_LOGOFF = 0x5;
    internal const int NOTIFY_FOR_THIS_SESSION = 0;

    [LibraryImport("wtsapi32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    internal static partial bool WTSRegisterSessionNotification(IntPtr hWnd, uint dwFlags);

    [LibraryImport("wtsapi32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    internal static partial bool WTSUnRegisterSessionNotification(IntPtr hWnd);

    // -----------------------------------------------------------------------
    // Power and shutdown notifications
    // -----------------------------------------------------------------------

    internal const int WM_POWERBROADCAST = 0x0218;
    internal const int PBT_APMSUSPEND = 0x0004;
    internal const int PBT_APMRESUMESUSPEND = 0x0007;
    internal const int PBT_APMRESUMEAUTOMATIC = 0x0012;

    internal const int WM_QUERYENDSESSION = 0x0011;
    internal const int WM_ENDSESSION = 0x0016;

    /// <summary>
    /// Registers a short, honest reason for briefly delaying shutdown while the
    /// open session is closed and the WAL is checkpointed. Always paired with
    /// <see cref="ShutdownBlockReasonDestroy"/>.
    /// </summary>
    [LibraryImport("user32.dll", EntryPoint = "ShutdownBlockReasonCreate", SetLastError = true,
        StringMarshalling = StringMarshalling.Utf16)]
    [return: MarshalAs(UnmanagedType.Bool)]
    internal static partial bool ShutdownBlockReasonCreate(IntPtr hWnd, string pwszReason);

    [LibraryImport("user32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    internal static partial bool ShutdownBlockReasonDestroy(IntPtr hWnd);
}
