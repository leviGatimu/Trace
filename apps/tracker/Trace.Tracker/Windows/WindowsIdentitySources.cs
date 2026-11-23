using System.Collections.Concurrent;
using System.Diagnostics;
using Trace.Tracker.Diagnostics;
using Trace.Tracker.Identity;
using Windows.Management.Deployment;

namespace Trace.Tracker.Windows;

/// <summary>
/// The real <see cref="IIdentitySources"/>: version resources from disk, package
/// display names from the Windows package manager.
///
/// Both answers are cached for the life of the process. A foreground change
/// resolves an application every time, and neither a file's version resource
/// nor an installed package's name changes underneath a running tracker.
/// </summary>
internal sealed class WindowsIdentitySources : IIdentitySources
{
    public static readonly WindowsIdentitySources Instance = new();

    private readonly ConcurrentDictionary<string, VersionNames?> _versionNames =
        new(StringComparer.OrdinalIgnoreCase);

    private readonly ConcurrentDictionary<string, string?> _packageNames =
        new(StringComparer.OrdinalIgnoreCase);

    private readonly Lazy<PackageManager?> _packageManager = new(CreatePackageManager);

    private WindowsIdentitySources()
    {
    }

    public VersionNames? ReadVersionNames(string executablePath) =>
        _versionNames.GetOrAdd(executablePath, static path =>
        {
            try
            {
                var info = FileVersionInfo.GetVersionInfo(path);
                return new VersionNames(info.FileDescription, info.ProductName);
            }
            catch (FileNotFoundException)
            {
                return null; // uninstalled since it was recorded
            }
            catch (IOException ex)
            {
                Log.Debug($"Could not read version info for {Log.Redact(path)}: {ex.Message}");
                return null;
            }
            catch (UnauthorizedAccessException)
            {
                return null;
            }
        });

    /// <summary>
    /// Reads the display name through <see cref="PackageManager"/> for the current
    /// user. That needs no elevation, and the name it returns is already
    /// localised from the manifest's resources, so "ms-resource:" strings never
    /// reach the history.
    /// </summary>
    public string? ReadPackageDisplayName(string packageFamilyName) =>
        _packageNames.GetOrAdd(packageFamilyName, family =>
        {
            var manager = _packageManager.Value;
            if (manager is null)
            {
                return null;
            }

            try
            {
                // Several versions can be installed side by side during an update;
                // they share a display name, so any one of them will do.
                return manager.FindPackagesForUser(string.Empty, family).FirstOrDefault()?.DisplayName;
            }
            catch (Exception ex) when (ex is System.Runtime.InteropServices.COMException
                                           or UnauthorizedAccessException
                                           or ArgumentException)
            {
                Log.Debug($"Could not read the package name for {family}: {ex.Message}");
                return null;
            }
        });

    /// <summary>The installed package's logo image on disk, or null.</summary>
    public string? ReadPackageLogoPath(string packageFamilyName)
    {
        var manager = _packageManager.Value;
        if (manager is null)
        {
            return null;
        }

        try
        {
            var logo = manager.FindPackagesForUser(string.Empty, packageFamilyName).FirstOrDefault()?.Logo;
            return logo is { IsFile: true } ? logo.LocalPath : null;
        }
        catch (Exception ex) when (ex is System.Runtime.InteropServices.COMException
                                       or UnauthorizedAccessException
                                       or ArgumentException
                                       or InvalidOperationException)
        {
            Log.Debug($"Could not read the package logo for {packageFamilyName}: {ex.Message}");
            return null;
        }
    }

    private static PackageManager? CreatePackageManager()
    {
        try
        {
            return new PackageManager();
        }
        catch (Exception ex) when (ex is System.Runtime.InteropServices.COMException
                                       or TypeInitializationException
                                       or PlatformNotSupportedException)
        {
            // No package manager means no packaged-app names, not no tracking.
            Log.Error("The Windows package manager is unavailable; packaged apps will be named from their files.", ex);
            return null;
        }
    }
}
