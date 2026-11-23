namespace Trace.Tracker.Identity;

/// <summary>
/// Who an application is, as far as Trace can tell, and how it knows.
///
/// <see cref="Source"/> is kept with the name rather than thrown away. The
/// history is only trustworthy if a reader can see where each label came from:
/// a name from Trace's own registry is a claim Trace makes; a title-cased
/// filename is a guess, and should read as one.
/// </summary>
/// <param name="ProfileKey">
/// The profile this executable belongs to (see <see cref="ProfileKeys"/>). Several
/// executables share one profile: WhatsApp.exe and WhatsApp.Root.exe are one app.
/// </param>
/// <param name="ProfileLink">Why the executable was put in that profile.</param>
internal sealed record ResolvedIdentity(
    string Name,
    string? Category,
    string? PackageFamily,
    IdentitySource Source,
    string ProfileKey,
    ProfileLink ProfileLink);

/// <summary>
/// How an executable was linked to its application profile, strongest first.
/// Shown in the UI: a package link is verified by Windows, a name link is Trace's inference.
/// </summary>
internal enum ProfileLink
{
    /// <summary>Installed inside the profile's package: verified by the package identity.</summary>
    Package,

    /// <summary>Matched by filename alone. Any file can be called whatsapp.exe, so this is inferred.</summary>
    ExecutableName,

    /// <summary>Nothing links it to anything else: the executable is its own profile.</summary>
    Self,
}

/// <summary>The keys that name a profile. A key never changes once written.</summary>
internal static class ProfileKeys
{
    public static string ForRegistryName(string name)
    {
        var slug = new System.Text.StringBuilder();
        foreach (var c in name.ToLowerInvariant())
        {
            if (char.IsAsciiLetterOrDigit(c))
            {
                slug.Append(c);
            }
            else if (slug.Length > 0 && slug[^1] != '-')
            {
                slug.Append('-');
            }
        }

        return "app:" + slug.ToString().TrimEnd('-');
    }

    public static string ForPackage(string familyName) => "package:" + familyName.ToLowerInvariant();

    public static string ForExecutable(string executable) => "exe:" + executable;
}

/// <summary>Where an application's name came from, strongest first.</summary>
internal enum IdentitySource
{
    /// <summary>Trace's curated registry (<c>Identity/registry.json</c>).</summary>
    Registry,

    /// <summary>The display name in the app's MSIX / Store package manifest.</summary>
    Package,

    /// <summary>The executable's version resource (FileDescription, then ProductName).</summary>
    VersionInfo,

    /// <summary>Nothing better was available: the executable's filename, title-cased.</summary>
    Filename,
}

internal static class IdentitySourceNames
{
    /// <summary>The value stored in <c>applications.identity_source</c>.</summary>
    public static string ToStorage(this IdentitySource source) => source switch
    {
        IdentitySource.Registry => "registry",
        IdentitySource.Package => "package",
        IdentitySource.VersionInfo => "version-info",
        IdentitySource.Filename => "filename",
        _ => throw new ArgumentOutOfRangeException(nameof(source), source, null),
    };

    /// <summary>The value stored in <c>applications.profile_link</c>.</summary>
    public static string ToStorage(this ProfileLink link) => link switch
    {
        ProfileLink.Package => "package",
        ProfileLink.ExecutableName => "executable-name",
        ProfileLink.Self => "self",
        _ => throw new ArgumentOutOfRangeException(nameof(link), link, null),
    };
}
