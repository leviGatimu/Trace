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
/// and no DLL injection. That is both the privacy contract in DOCS/Privacy.md §3
/// and what keeps the binary from resembling malware to endpoint protection
/// (DOCS/Windows Integration &amp; Application Lifecycle.md §32).
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
    // Idle detection
    //
    // GetLastInputInfo returns a tick count and nothing else. No key code, no
    // coordinate, no content. It answers exactly one question — "how long since
    // the user last interacted?" — which is the whole of what DOCS/Privacy.md §3
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
