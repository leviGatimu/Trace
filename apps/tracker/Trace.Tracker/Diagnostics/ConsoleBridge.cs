using System.Runtime.InteropServices;
using System.Text;

namespace Trace.Tracker.Diagnostics;

/// <summary>
/// The tracker is a WinExe, so it has no console of its own — which is correct
/// for a background process that must never flash a black window at logon.
///
/// For <c>--diagnose</c> we still want output in the terminal the developer
/// typed the command into, so we attach to the parent process's console. If
/// there is no parent console (double-clicked, or launched by the installer),
/// output is silently discarded rather than a console being conjured up.
/// </summary>
internal static partial class ConsoleBridge
{
    private const uint AttachParentProcess = 0xFFFFFFFF;

    private static bool _attached;

    [LibraryImport("kernel32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static partial bool AttachConsole(uint dwProcessId);

    private static bool _attemptedAttach;

    public static void Attach()
    {
        if (_attemptedAttach)
        {
            return;
        }

        _attemptedAttach = true;

        // Two cases must both work:
        //  * launched from a terminal — attach to the parent's console;
        //  * launched with stdout redirected to a pipe or file (CI, tooling) —
        //    there is no console to attach to, but the handle is already valid.
        AttachConsole(AttachParentProcess);

        try
        {
            var stdout = Console.OpenStandardOutput();
            if (stdout == Stream.Null)
            {
                return;
            }

            // UTF-8: window titles are recorded verbatim and routinely contain
            // non-ASCII. The code page must be able to render what the tracker
            // actually saw, or diagnosing a title bug becomes guesswork.
            try
            {
                Console.OutputEncoding = new UTF8Encoding(encoderShouldEmitUTF8Identifier: false);
            }
            catch (IOException)
            {
                // No console attached (output is redirected); the writer below
                // still emits UTF-8.
            }

            // A freshly attached console leaves Console.Out pointing at the
            // pre-attach (null) writer, so it must be replaced either way.
            Console.SetOut(new StreamWriter(stdout, new UTF8Encoding(false)) { AutoFlush = true });
            _attached = true;
        }
        catch (IOException)
        {
            // No console and no redirect: output is discarded rather than a
            // window being conjured up behind the user's back.
        }
    }

    public static void WriteLine(string text = "")
    {
        Attach();

        if (_attached)
        {
            Console.WriteLine(text);
        }
    }

    public static void WriteHelp()
    {
        WriteLine();
        // ASCII only. Diagnostic output is read from consoles and redirected
        // files with a variety of code pages; a stray em-dash renders as mojibake
        // and buys nothing in a developer tool.
        WriteLine("Trace Tracker - background activity recorder for Trace.");
        WriteLine();
        WriteLine("  TraceTracker.exe               Run normally (tray + tracking).");
        WriteLine("  TraceTracker.exe --diagnose    Print live Windows state; writes nothing.");
        WriteLine("  TraceTracker.exe --help        This message.");
        WriteLine();
        WriteLine($"  Data:     {TracePaths.DataDirectory}");
        WriteLine($"  Logs:     {TracePaths.LogDirectory}");
        WriteLine();
    }
}
