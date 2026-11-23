using System.Reflection;
using System.Text.Json;

namespace Trace.Tracker.Identity;

/// <summary>One application Trace recognises.</summary>
/// <param name="Key">
/// Stable profile key, derived from the name ("WhatsApp" becomes <c>app:whatsapp</c>).
/// Every executable listed under the entry joins this one profile.
/// </param>
/// <param name="Packages">
/// The package names the entry claims. An executable found inside one of them
/// is linked by package identity; one matched only by its filename is not.
/// </param>
internal sealed record RegistryEntry(string Name, string Category, string Key, IReadOnlySet<string> Packages);

/// <summary>
/// Trace's own list of applications it recognises by name and category.
///
/// A list, not a heuristic. Publishers write whatever they like into a version
/// resource ("WhatsApp.Root", "copilotapphost", "Dwm"), and no rule recovers a
/// human name from that reliably. Applications not listed here fall back to
/// their package or version resource, so the list only has to cover what a
/// heuristic gets wrong and what deserves a category.
///
/// Shipped inside the binary, so it can never disagree with the code reading it.
/// Bump <c>version</c> in <c>registry.json</c> whenever an entry changes: that is
/// what makes Trace re-resolve the applications already in the history.
/// </summary>
internal sealed class ApplicationRegistry
{
    private const string ResourceName = "Trace.Tracker.Identity.registry.json";

    private readonly Dictionary<string, RegistryEntry> _byExecutable;
    private readonly Dictionary<string, RegistryEntry> _byPackage;

    private ApplicationRegistry(
        int version,
        IReadOnlyList<string> categories,
        Dictionary<string, RegistryEntry> byExecutable,
        Dictionary<string, RegistryEntry> byPackage)
    {
        Version = version;
        Categories = categories;
        _byExecutable = byExecutable;
        _byPackage = byPackage;
    }

    // Declared before Default on purpose: static fields initialise in textual
    // order, and Default parses the registry with these options.
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNameCaseInsensitive = true,
        ReadCommentHandling = JsonCommentHandling.Skip,
        AllowTrailingCommas = true,
    };

    public static ApplicationRegistry Default { get; } = LoadEmbedded();

    public int Version { get; }

    public IReadOnlyList<string> Categories { get; }

    public int Count => _byExecutable.Values.Concat(_byPackage.Values).Distinct().Count();

    /// <summary>
    /// The entry for this application. The executable is checked first: one
    /// package can ship several executables, and a listed executable is the more
    /// specific claim.
    /// </summary>
    public RegistryEntry? Find(string executable, string? packageName)
    {
        if (_byExecutable.TryGetValue(executable, out var entry))
        {
            return entry;
        }

        return packageName is not null && _byPackage.TryGetValue(packageName, out entry)
            ? entry
            : null;
    }

    /// <summary>
    /// Parses and validates a registry document. Throws on anything ambiguous,
    /// such as an executable claimed twice or a category that is not declared, so
    /// a bad edit fails the test suite rather than mislabelling someone's history.
    /// </summary>
    public static ApplicationRegistry Parse(string json)
    {
        var document = JsonSerializer.Deserialize<RegistryDocument>(json, JsonOptions)
            ?? throw new InvalidDataException("The application registry is empty.");

        if (document.Version < 1)
        {
            throw new InvalidDataException("The application registry needs a positive version.");
        }

        var categories = document.Categories ?? [];
        var byExecutable = new Dictionary<string, RegistryEntry>(StringComparer.OrdinalIgnoreCase);
        var byPackage = new Dictionary<string, RegistryEntry>(StringComparer.OrdinalIgnoreCase);
        var keys = new HashSet<string>(StringComparer.Ordinal);

        foreach (var application in document.Applications ?? [])
        {
            if (string.IsNullOrWhiteSpace(application.Name))
            {
                throw new InvalidDataException("An application in the registry has no name.");
            }

            if (application.Category is null || !categories.Contains(application.Category))
            {
                throw new InvalidDataException(
                    $"'{application.Name}' uses the undeclared category '{application.Category}'.");
            }

            var executables = application.Executables ?? [];
            var packages = application.Packages ?? [];
            if (executables.Count == 0 && packages.Count == 0)
            {
                throw new InvalidDataException($"'{application.Name}' has no executable or package to match.");
            }

            var name = application.Name.Trim();
            var key = ProfileKeys.ForRegistryName(name);
            if (!keys.Add(key))
            {
                throw new InvalidDataException($"Two applications share the profile key '{key}'.");
            }

            var entry = new RegistryEntry(
                name,
                application.Category!,
                key,
                new HashSet<string>(packages, StringComparer.OrdinalIgnoreCase));

            foreach (var executable in executables)
            {
                if (executable != executable.ToLowerInvariant() || !executable.EndsWith(".exe", StringComparison.Ordinal))
                {
                    throw new InvalidDataException(
                        $"'{executable}' must be a lowercase filename ending in .exe, as Trace stores it.");
                }

                if (!byExecutable.TryAdd(executable, entry))
                {
                    throw new InvalidDataException($"'{executable}' is listed under two applications.");
                }
            }

            foreach (var package in packages)
            {
                if (package.Contains('_', StringComparison.Ordinal))
                {
                    throw new InvalidDataException(
                        $"'{package}' must be a package name, not a family or full name.");
                }

                if (!byPackage.TryAdd(package, entry))
                {
                    throw new InvalidDataException($"Package '{package}' is listed under two applications.");
                }
            }
        }

        return new ApplicationRegistry(document.Version, categories, byExecutable, byPackage);
    }

    private static ApplicationRegistry LoadEmbedded()
    {
        using var stream = Assembly.GetExecutingAssembly().GetManifestResourceStream(ResourceName)
            ?? throw new InvalidOperationException($"{ResourceName} is missing from the build.");
        using var reader = new StreamReader(stream);
        return Parse(reader.ReadToEnd());
    }

    private sealed record RegistryDocument(
        int Version,
        List<string>? Categories,
        List<RegistryApplication>? Applications);

    private sealed record RegistryApplication(
        string? Name,
        string? Category,
        List<string>? Executables,
        List<string>? Packages);
}
