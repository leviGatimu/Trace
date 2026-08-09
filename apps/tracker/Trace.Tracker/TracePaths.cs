namespace Trace.Tracker;

/// <summary>
/// Every filesystem location Trace uses, resolved once.
///
/// All of it lives under the current Windows user's LocalAppData, which is what
/// makes the per-user isolation in DOCS/Windows Integration &amp; Application
/// Lifecycle.md §26 structural rather than a convention: two Windows accounts
/// resolve to two different roots and can never see each other's history.
///
/// LocalAppData is deliberate over AppData (Roaming): activity history is
/// machine-specific and must not be synced to a domain profile or the cloud.
/// </summary>
public static class TracePaths
{
    /// <summary>%LOCALAPPDATA%\Trace</summary>
    public static string Root { get; } = Path.Combine(
        Environment.GetFolderPath(
            Environment.SpecialFolder.LocalApplicationData,
            Environment.SpecialFolderOption.DoNotVerify),
        "Trace");

    /// <summary>%LOCALAPPDATA%\Trace\Data</summary>
    public static string DataDirectory { get; } = Path.Combine(Root, "Data");

    /// <summary>%LOCALAPPDATA%\Trace\Data\activity.db</summary>
    public static string DatabaseFile { get; } = Path.Combine(DataDirectory, "activity.db");

    /// <summary>%LOCALAPPDATA%\Trace\Logs</summary>
    public static string LogDirectory { get; } = Path.Combine(Root, "Logs");

    /// <summary>%LOCALAPPDATA%\Trace\settings.json</summary>
    public static string SettingsFile { get; } = Path.Combine(Root, "settings.json");

    /// <summary>
    /// Creates the directory tree if absent. Called once at startup, before
    /// anything tries to open a file.
    /// </summary>
    public static void EnsureCreated()
    {
        Directory.CreateDirectory(Root);
        Directory.CreateDirectory(DataDirectory);
        Directory.CreateDirectory(LogDirectory);
    }

    /// <summary>
    /// Path for a database quarantined by a failed integrity check. Timestamped
    /// so repeated failures never overwrite the previous evidence.
    /// </summary>
    public static string QuarantinedDatabaseFile(DateTimeOffset when) =>
        Path.Combine(DataDirectory, $"activity.corrupt-{when:yyyyMMdd-HHmmss}.db");

    /// <summary>
    /// True when <paramref name="path"/> resolves inside Trace's own data tree.
    /// Export refuses such destinations so a user cannot be talked into
    /// overwriting their own database with an export of it.
    /// </summary>
    public static bool IsInsideDataDirectory(string path)
    {
        var full = Path.GetFullPath(path);
        var root = Path.GetFullPath(Root);
        return full.StartsWith(
            root.EndsWith(Path.DirectorySeparatorChar) ? root : root + Path.DirectorySeparatorChar,
            StringComparison.OrdinalIgnoreCase);
    }
}
