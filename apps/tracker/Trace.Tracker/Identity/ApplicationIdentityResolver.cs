namespace Trace.Tracker.Identity;

/// <summary>The two names an executable's version resource can carry.</summary>
internal sealed record VersionNames(string? FileDescription, string? ProductName);

/// <summary>
/// What the resolver needs from Windows. A seam, so the naming rules can be
/// tested against any machine's applications without that machine.
/// </summary>
internal interface IIdentitySources
{
    VersionNames? ReadVersionNames(string executablePath);

    /// <summary>The installed package's display name, or null when it is not installed.</summary>
    string? ReadPackageDisplayName(string packageFamilyName);
}

/// <summary>
/// Names an application, strongest source first:
///
///   1. Trace's registry: a curated name and category.
///   2. The package manifest, for packaged apps. Their version resource holds a
///      build name ("WhatsApp.Root"); the manifest holds what the user sees.
///   3. The version resource: FileDescription, then ProductName.
///   4. The filename, title-cased: a guess, and labelled as one.
/// </summary>
internal sealed class ApplicationIdentityResolver(ApplicationRegistry registry, IIdentitySources sources)
{
    /// <summary>
    /// Changes whenever a rule here or an entry in the registry does. Stored on
    /// each application, so rows named under older rules are re-resolved.
    /// </summary>
    public int Version => ResolverRulesVersion * 1000 + registry.Version;

    /// <summary>Bump when the resolution rules below change.</summary>
    private const int ResolverRulesVersion = 2;

    public ResolvedIdentity Resolve(string executable, string? executablePath)
    {
        var package = PackagePath.TryParse(executablePath);

        var entry = registry.Find(executable, package?.Name);
        if (entry is not null)
        {
            var link = package is not null && entry.Packages.Contains(package.Name)
                ? ProfileLink.Package
                : ProfileLink.ExecutableName;
            return new ResolvedIdentity(
                entry.Name, entry.Category, package?.FamilyName, IdentitySource.Registry, entry.Key, link);
        }

        if (package is not null && Clean(sources.ReadPackageDisplayName(package.FamilyName)) is { } packageName)
        {
            return new ResolvedIdentity(
                packageName, null, package.FamilyName, IdentitySource.Package,
                ProfileKeys.ForPackage(package.FamilyName), ProfileLink.Package);
        }

        if (!string.IsNullOrEmpty(executablePath) && sources.ReadVersionNames(executablePath) is { } names)
        {
            if ((Clean(names.FileDescription) ?? Clean(names.ProductName)) is { } versionName)
            {
                return new ResolvedIdentity(
                    versionName, null, package?.FamilyName, IdentitySource.VersionInfo,
                    ProfileKeys.ForExecutable(executable), ProfileLink.Self);
            }
        }

        return new ResolvedIdentity(
            TitleCaseExecutable(executable), null, package?.FamilyName, IdentitySource.Filename,
            ProfileKeys.ForExecutable(executable), ProfileLink.Self);
    }

    /// <summary>
    /// Turns a name from Windows into one worth showing, or null.
    ///
    /// Windows Notepad's FileDescription is literally "Notepad.exe", so a
    /// trailing ".exe" is removed. An unresolved manifest resource
    /// ("ms-resource:AppName") is not a name at all.
    /// </summary>
    internal static string? Clean(string? value)
    {
        var trimmed = value?.Trim();
        if (string.IsNullOrEmpty(trimmed)
            || trimmed.StartsWith("ms-resource:", StringComparison.OrdinalIgnoreCase))
        {
            return null;
        }

        if (trimmed.EndsWith(".exe", StringComparison.OrdinalIgnoreCase))
        {
            trimmed = trimmed[..^4].Trim();
        }

        return string.IsNullOrEmpty(trimmed) ? null : trimmed;
    }

    internal static string TitleCaseExecutable(string executable)
    {
        var stem = Path.GetFileNameWithoutExtension(executable);
        if (string.IsNullOrEmpty(stem))
        {
            return "Unknown application";
        }

        return char.ToUpperInvariant(stem[0]) + stem[1..];
    }
}
