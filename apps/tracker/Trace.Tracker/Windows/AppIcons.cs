using System.Collections.Concurrent;
using System.Drawing;
using System.Drawing.Imaging;
using Trace.Tracker.Diagnostics;

namespace Trace.Tracker.Windows;

/// <summary>
/// An application's real icon, as a PNG.
///
/// Read from the executable's own icon resource, or, for a packaged (Store)
/// app whose executable has none, from its package logo. Saved once under
/// <c>%LOCALAPPDATA%\Trace\Icons</c>, so an app uninstalled later keeps the
/// icon it had, and served to the dashboard as a data URL.
/// Icons are pictures of installed software, not activity, but they still show
/// what was used, so "delete everything" removes them.
/// </summary>
internal static class AppIcons
{
    private const int Size = 64;

    public static string Directory => Path.Combine(TracePaths.Root, "Icons");

    /// <summary>Data URLs by executable; null means "none could be found", and is remembered too.</summary>
    private static readonly ConcurrentDictionary<string, string?> Cache = new(StringComparer.Ordinal);

    public static string? DataUrl(string executable, string? path, string? packageFamily) =>
        Cache.GetOrAdd(executable, _ => Load(executable, path, packageFamily));

    public static void Forget()
    {
        Cache.Clear();
        try
        {
            if (System.IO.Directory.Exists(Directory))
            {
                System.IO.Directory.Delete(Directory, recursive: true);
            }
        }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException)
        {
            Log.Warn($"Could not remove the icon cache: {ex.Message}");
        }
    }

    private static string? Load(string executable, string? path, string? packageFamily)
    {
        var file = Path.Combine(Directory, SafeName(executable) + ".png");
        try
        {
            if (!File.Exists(file))
            {
                var png = FromExecutable(path) ?? FromPackage(packageFamily);
                if (png is null)
                {
                    return null;
                }

                System.IO.Directory.CreateDirectory(Directory);
                File.WriteAllBytes(file, png);
            }

            return "data:image/png;base64," + Convert.ToBase64String(File.ReadAllBytes(file));
        }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException or System.Runtime.InteropServices.ExternalException or ArgumentException)
        {
            Log.Debug($"No icon for {executable}: {ex.Message}");
            return null;
        }
    }

    private static byte[]? FromExecutable(string? path)
    {
        if (string.IsNullOrEmpty(path) || !File.Exists(path))
        {
            return null;
        }

        using var icon = Icon.ExtractIcon(path, 0, Size);
        if (icon is null)
        {
            return null;
        }

        using var bitmap = icon.ToBitmap();
        using var stream = new MemoryStream();
        bitmap.Save(stream, ImageFormat.Png);
        return stream.ToArray();
    }

    /// <summary>
    /// The package logo. The manifest names a logo such as <c>StoreLogo.png</c>,
    /// but what is installed is usually its scaled variants
    /// (<c>StoreLogo.scale-200.png</c>), so the largest of those is used.
    /// </summary>
    private static byte[]? FromPackage(string? packageFamily)
    {
        if (string.IsNullOrEmpty(packageFamily)
            || WindowsIdentitySources.Instance.ReadPackageLogoPath(packageFamily) is not { } logo)
        {
            return null;
        }

        if (File.Exists(logo))
        {
            return File.ReadAllBytes(logo);
        }

        var folder = Path.GetDirectoryName(logo);
        if (folder is null || !System.IO.Directory.Exists(folder))
        {
            return null;
        }

        var stem = Path.GetFileNameWithoutExtension(logo);
        var best = System.IO.Directory.GetFiles(folder, stem + ".scale-*.png")
            .OrderByDescending(candidate => candidate.Length)
            .ThenByDescending(candidate => candidate, StringComparer.Ordinal)
            .FirstOrDefault();
        return best is null ? null : File.ReadAllBytes(best);
    }

    private static string SafeName(string executable) =>
        string.Concat(executable.Select(c => Path.GetInvalidFileNameChars().Contains(c) ? '_' : c));
}
