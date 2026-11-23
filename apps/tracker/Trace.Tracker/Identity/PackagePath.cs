namespace Trace.Tracker.Identity;

/// <summary>A packaged (MSIX / Store) application's identity, read from where it is installed.</summary>
/// <param name="Name">The package name, e.g. <c>5319275A.WhatsAppDesktop</c>.</param>
/// <param name="FamilyName">
/// Name plus publisher id, e.g. <c>5319275A.WhatsAppDesktop_cv1g1gvanyjgm</c>.
/// Stable across updates, unlike the full name, which carries the version.
/// </param>
internal sealed record PackageInfo(string Name, string FamilyName);

/// <summary>
/// Recognises a packaged application from its executable path.
///
/// Packaged apps are installed to <c>…\WindowsApps\&lt;PackageFullName&gt;\…</c>,
/// and a package full name is <c>Name_Version_Architecture_ResourceId_PublisherId</c>.
/// Package names cannot contain an underscore, so the five fields split cleanly.
///
/// Reading identity from the path rather than from the live process means the
/// same rule names an application at the moment it is recorded and, later, from
/// history alone, long after the process has gone.
/// </summary>
internal static class PackagePath
{
    private const string PackagesFolder = "WindowsApps";

    public static PackageInfo? TryParse(string? executablePath)
    {
        if (string.IsNullOrEmpty(executablePath))
        {
            return null;
        }

        var segments = executablePath.Split(['\\', '/'], StringSplitOptions.RemoveEmptyEntries);
        var folder = Array.FindLastIndex(
            segments, s => s.Equals(PackagesFolder, StringComparison.OrdinalIgnoreCase));

        // The full-name folder must exist and be followed by at least the
        // executable itself; a path ending at the folder is not an app.
        if (folder < 0 || folder + 1 >= segments.Length - 1)
        {
            return null;
        }

        // ResourceId (the fourth field) is usually empty, which is why almost
        // every installed package folder contains a double underscore:
        // Microsoft.Windows.Photos_2026.11090.22001.0_x64__8wekyb3d8bbwe.
        var parts = segments[folder + 1].Split('_');
        if (parts.Length != 5)
        {
            return null;
        }

        var (name, version, architecture, publisherId) = (parts[0], parts[1], parts[2], parts[4]);
        if (name.Length == 0 || version.Length == 0 || architecture.Length == 0 || publisherId.Length == 0)
        {
            return null;
        }
        return new PackageInfo(name, $"{name}_{publisherId}");
    }
}
