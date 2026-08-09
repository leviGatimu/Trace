using System.Collections.Concurrent;
using System.Diagnostics;
using System.Runtime.InteropServices;
using Trace.Tracker.Diagnostics;
using Trace.Tracker.Engine;

namespace Trace.Tracker.Windows;

/// <summary>
/// Resolves a foreground window handle to the application behind it.
///
/// Two things here are more subtle than they look:
///
///  1. <b>UWP / packaged apps.</b> For Settings, Calculator, Store apps and
///     anything else hosted by the modern app frame, GetWindowThreadProcessId
///     returns <c>ApplicationFrameHost.exe</c> rather than the real application.
///     Without the child-window resolution below, every such app records under
///     one meaningless name. The product documentation does not anticipate this.
///
///  2. <b>Friendly names.</b> The history must read "Google Chrome", not
///     "chrome.exe", so the executable's version resource is consulted. That
///     costs a file read, so results are cached per path for the process
///     lifetime — a given executable's description does not change underneath us.
/// </summary>
internal static class ProcessIdentity
{
    private const string AppFrameHostExecutable = "applicationframehost.exe";
    private const string CoreWindowClass = "Windows.UI.Core.CoreWindow";
    private const int MaxPathChars = 32768;
    private const int MaxClassNameChars = 256;

    private static readonly ConcurrentDictionary<string, string> DisplayNameCache =
        new(StringComparer.OrdinalIgnoreCase);

    /// <summary>
    /// Resolves the application owning <paramref name="hWnd"/>, or null when the
    /// window is gone or the process cannot be identified at all.
    /// </summary>
    public static TrackedApplication? Resolve(IntPtr hWnd)
    {
        if (hWnd == IntPtr.Zero || !NativeMethods.IsWindow(hWnd))
        {
            return null;
        }

        if (NativeMethods.GetWindowThreadProcessId(hWnd, out var processId) == 0 || processId == 0)
        {
            return null;
        }

        var path = TryGetExecutablePath(processId);
        var executable = NormaliseExecutable(path, processId);

        // UWP host: the visible window belongs to ApplicationFrameHost, but the
        // real application owns a CoreWindow child. Re-point at that.
        if (executable == AppFrameHostExecutable)
        {
            var realProcessId = TryResolveHostedProcessId(hWnd, processId);
            if (realProcessId is { } hosted && hosted != processId)
            {
                processId = hosted;
                path = TryGetExecutablePath(processId);
                executable = NormaliseExecutable(path, processId);
            }
        }

        if (string.IsNullOrEmpty(executable))
        {
            return null;
        }

        return new TrackedApplication(
            processId,
            executable,
            ResolveDisplayName(path, executable),
            path);
    }

    /// <summary>
    /// Reads the title of <paramref name="hWnd"/> verbatim.
    ///
    /// DOCS/Tracking.md closing note: store the raw title exactly as Windows
    /// reports it and clean only at presentation time, so the underlying history
    /// stays reliable. Capped at <paramref name="maxChars"/> because a few
    /// applications put an entire document into their title bar.
    /// </summary>
    public static string? GetWindowTitle(IntPtr hWnd, int maxChars = 512)
    {
        if (hWnd == IntPtr.Zero || !NativeMethods.IsWindow(hWnd))
        {
            return null;
        }

        var length = NativeMethods.GetWindowTextLength(hWnd);
        if (length <= 0)
        {
            return null;
        }

        var buffer = new char[Math.Min(length, maxChars) + 1];

        int copied;
        unsafe
        {
            fixed (char* pBuffer = buffer)
            {
                copied = NativeMethods.GetWindowText(hWnd, pBuffer, buffer.Length);
            }
        }

        if (copied <= 0)
        {
            return null;
        }

        var title = new string(buffer, 0, copied).Trim();
        return title.Length == 0 ? null : title;
    }

    /// <summary>
    /// The CoreWindow child of an ApplicationFrameHost window belongs to the
    /// real packaged application. Returns its process id, or null if this window
    /// has no such child.
    /// </summary>
    private static uint? TryResolveHostedProcessId(IntPtr hWnd, uint hostProcessId)
    {
        uint? found = null;

        NativeMethods.EnumWindowsProc callback = (child, _) =>
        {
            if (GetClassName(child) != CoreWindowClass)
            {
                return true; // keep looking
            }

            if (NativeMethods.GetWindowThreadProcessId(child, out var childProcessId) != 0
                && childProcessId != 0
                && childProcessId != hostProcessId)
            {
                found = childProcessId;
                return false; // stop
            }

            return true;
        };

        var callbackPointer = Marshal.GetFunctionPointerForDelegate(callback);
        try
        {
            NativeMethods.EnumChildWindows(hWnd, callbackPointer, IntPtr.Zero);
        }
        finally
        {
            // The delegate must outlive the native call that holds its pointer.
            GC.KeepAlive(callback);
        }

        return found;
    }

    private static string GetClassName(IntPtr hWnd)
    {
        var buffer = new char[MaxClassNameChars];

        int copied;
        unsafe
        {
            fixed (char* pBuffer = buffer)
            {
                copied = NativeMethods.GetClassName(hWnd, pBuffer, buffer.Length);
            }
        }

        return copied <= 0 ? string.Empty : new string(buffer, 0, copied);
    }

    /// <summary>
    /// Full executable path, or null when the process cannot be opened.
    /// PROCESS_QUERY_LIMITED_INFORMATION succeeds for same-user processes
    /// without elevation; elevated and protected processes will legitimately
    /// fail here and that is recorded as null rather than guessed at.
    /// </summary>
    private static string? TryGetExecutablePath(uint processId)
    {
        var handle = NativeMethods.OpenProcess(
            NativeMethods.PROCESS_QUERY_LIMITED_INFORMATION, false, processId);

        if (handle == IntPtr.Zero)
        {
            return null;
        }

        try
        {
            var buffer = new char[MaxPathChars];
            var size = (uint)buffer.Length;

            unsafe
            {
                fixed (char* pBuffer = buffer)
                {
                    // On success `size` is rewritten with the character count
                    // actually written, excluding the terminator.
                    return NativeMethods.QueryFullProcessImageName(handle, 0, pBuffer, ref size)
                        ? new string(buffer, 0, (int)size)
                        : null;
                }
            }
        }
        finally
        {
            NativeMethods.CloseHandle(handle);
        }
    }

    /// <summary>
    /// The application identity key. Prefers the path's filename; falls back to
    /// the process name, which is readable without opening the process and so
    /// still works for elevated processes.
    /// </summary>
    private static string NormaliseExecutable(string? path, uint processId)
    {
        if (!string.IsNullOrEmpty(path))
        {
            return Path.GetFileName(path).ToLowerInvariant();
        }

        try
        {
            using var process = Process.GetProcessById((int)processId);
            var name = process.ProcessName;
            return string.IsNullOrEmpty(name) ? string.Empty : name.ToLowerInvariant() + ".exe";
        }
        catch (ArgumentException)
        {
            return string.Empty; // process already exited
        }
        catch (InvalidOperationException)
        {
            return string.Empty;
        }
    }

    /// <summary>
    /// "chrome.exe" -> "Google Chrome". Falls back through FileDescription,
    /// ProductName, then a title-cased filename, so there is always something
    /// human-readable and it is always derived from the executable itself.
    /// </summary>
    private static string ResolveDisplayName(string? path, string executable)
    {
        if (string.IsNullOrEmpty(path))
        {
            return TitleCaseExecutable(executable);
        }

        return DisplayNameCache.GetOrAdd(path, static p =>
        {
            try
            {
                var info = FileVersionInfo.GetVersionInfo(p);

                // Not every publisher writes a human name here. Windows Notepad,
                // for instance, sets FileDescription to the literal string
                // "Notepad.exe", which would put a filename in the user's
                // history. Strip a filename-shaped description back to its stem.
                var description = Clean(info.FileDescription);
                if (description is not null)
                {
                    return description;
                }

                var product = Clean(info.ProductName);
                if (product is not null)
                {
                    return product;
                }
            }
            catch (FileNotFoundException)
            {
            }
            catch (IOException ex)
            {
                Log.Debug($"Could not read version info for {Log.Redact(p)}: {ex.Message}");
            }
            catch (UnauthorizedAccessException)
            {
            }

            return TitleCaseExecutable(Path.GetFileName(p));
        });
    }

    /// <summary>
    /// Normalises a version-resource string into something worth showing a user,
    /// or null if there is nothing usable. Trailing ".exe" is removed so a
    /// filename-shaped description becomes a name.
    /// </summary>
    private static string? Clean(string? value)
    {
        var trimmed = value?.Trim();
        if (string.IsNullOrEmpty(trimmed))
        {
            return null;
        }

        if (trimmed.EndsWith(".exe", StringComparison.OrdinalIgnoreCase))
        {
            trimmed = trimmed[..^4].Trim();
        }

        return string.IsNullOrEmpty(trimmed) ? null : trimmed;
    }

    private static string TitleCaseExecutable(string executable)
    {
        var stem = Path.GetFileNameWithoutExtension(executable);
        if (string.IsNullOrEmpty(stem))
        {
            return "Unknown application";
        }

        return char.ToUpperInvariant(stem[0]) + stem[1..];
    }
}
