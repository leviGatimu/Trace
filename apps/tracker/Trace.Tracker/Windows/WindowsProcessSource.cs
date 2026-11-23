using Trace.Tracker.Processes;

namespace Trace.Tracker.Windows;

/// <summary>
/// The processes running in this user's Windows session, from a Toolhelp
/// snapshot. Services, other accounts' sessions and the kernel's own processes
/// are in other sessions and never listed.
///
/// A process's start time and path are read once, the first time it is seen,
/// and remembered while it keeps the same id and executable name.
/// </summary>
internal sealed class WindowsProcessSource : IProcessSource
{
    private readonly uint _session;
    private readonly Dictionary<uint, (string Executable, long? Created, string? Path)> _known = [];

    public WindowsProcessSource()
    {
        _session = NativeMethods.ProcessIdToSessionId((uint)Environment.ProcessId, out var session) ? session : uint.MaxValue;
    }

    public unsafe IReadOnlyList<ObservedProcess> Snapshot()
    {
        var snapshot = NativeMethods.CreateToolhelp32Snapshot(NativeMethods.TH32CS_SNAPPROCESS, 0);
        if (snapshot == IntPtr.Zero || snapshot == new IntPtr(-1))
        {
            return [];
        }

        var processes = new List<ObservedProcess>();
        var seen = new HashSet<uint>();
        try
        {
            var entry = new NativeMethods.PROCESSENTRY32W { dwSize = (uint)sizeof(NativeMethods.PROCESSENTRY32W) };
            for (var more = NativeMethods.Process32First(snapshot, &entry); more; more = NativeMethods.Process32Next(snapshot, &entry))
            {
                var pid = entry.th32ProcessID;
                if (pid == 0 || !NativeMethods.ProcessIdToSessionId(pid, out var session) || session != _session)
                {
                    continue;
                }

                var executable = new string(entry.szExeFile).ToLowerInvariant();
                seen.Add(pid);
                if (!_known.TryGetValue(pid, out var known) || known.Executable != executable)
                {
                    known = (executable, ReadCreated(pid), ProcessIdentity.TryGetExecutablePath(pid));
                    _known[pid] = known;
                }

                processes.Add(new ObservedProcess(pid, entry.th32ParentProcessID, executable, known.Path, known.Created));
            }
        }
        finally
        {
            NativeMethods.CloseHandle(snapshot);
        }

        foreach (var gone in _known.Keys.Where(pid => !seen.Contains(pid)).ToList())
        {
            _known.Remove(gone);
        }

        return processes;
    }

    private static long? ReadCreated(uint pid)
    {
        var handle = NativeMethods.OpenProcess(NativeMethods.PROCESS_QUERY_LIMITED_INFORMATION, false, pid);
        if (handle == IntPtr.Zero)
        {
            return null;
        }

        try
        {
            return NativeMethods.GetProcessTimes(handle, out var created, out _, out _, out _)
                ? DateTimeOffset.FromFileTime(created).ToUnixTimeMilliseconds()
                : null;
        }
        finally
        {
            NativeMethods.CloseHandle(handle);
        }
    }
}
