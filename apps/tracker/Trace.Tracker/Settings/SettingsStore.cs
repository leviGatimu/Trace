using System.Text.Json;
using Trace.Contracts;
using Trace.Tracker.Diagnostics;

namespace Trace.Tracker.Settings;

/// <summary>
/// Owns <c>settings.json</c>.
///
/// The tracker is the sole owner, as it is for the database: the UI reads and
/// writes settings over IPC. That keeps one process responsible for enforcing
/// them, so a setting can never be honoured by the dashboard and ignored by the
/// thing actually doing the recording.
///
/// Nothing secret is stored here, so no DPAPI protection is applied. If that
/// ever changes, this is the one place that would need it.
/// </summary>
internal sealed class SettingsStore
{
    private readonly string _path;
    private readonly Lock _gate = new();
    private Contracts.Settings _current;

    public SettingsStore(string path)
    {
        _path = path;
        _current = Load(path);
    }

    /// <summary>Raised after a successful save, so the tracker can re-read live settings.</summary>
    public event Action<Contracts.Settings>? Changed;

    public Contracts.Settings Current
    {
        get
        {
            lock (_gate)
            {
                return _current;
            }
        }
    }

    public static Contracts.Settings Defaults() => new(
        TrackingEnabled: true,
        RecordWindowTitles: true,
        IdleDetectionEnabled: true,
        IdleThresholdSeconds: 300,
        ExcludedExecutables: [],
        // Forever, per the resolved decision in the implementation plan §14A:
        // automatically deleting history undermines the entire premise.
        Retention: RetentionPolicy.FOREVER,
        // Off until the user opts in during onboarding. Consent to run at logon
        // belongs to the user, not to the installer.
        StartWithWindows: false,
        LaunchMinimised: false,
        // Follow Windows unless the user says otherwise: whichever clock they
        // already read everywhere else on the machine.
        ClockFormat: ClockFormat.SYSTEM,
        Theme: ThemePreference.DARK,
        DeveloperLogging: false,
        DataDirectory: TracePaths.DataDirectory,
        OnboardingCompleted: false);

    public Contracts.Settings Save(Contracts.Settings settings)
    {
        lock (_gate)
        {
            var normalised = Normalise(settings);
            WriteAtomically(_path, normalised);
            _current = normalised;

            Log.DeveloperLogging = normalised.DeveloperLogging;

            Changed?.Invoke(normalised);
            return normalised;
        }
    }

    /// <summary>Applies a change to the current settings and persists the result.</summary>
    public Contracts.Settings Update(Func<Contracts.Settings, Contracts.Settings> change)
    {
        lock (_gate)
        {
            return Save(change(_current));
        }
    }

    private static Contracts.Settings Load(string path)
    {
        if (!File.Exists(path))
        {
            return Defaults();
        }

        try
        {
            var json = File.ReadAllText(path);
            var loaded = JsonSerializer.Deserialize<Contracts.Settings>(json, ContractJson.Options);

            if (loaded is null)
            {
                Log.Warn("settings.json was empty; using defaults.");
                return Defaults();
            }

            return Normalise(loaded);
        }
        catch (Exception ex) when (ex is JsonException or IOException or UnauthorizedAccessException)
        {
            // Falling back to defaults would silently resume tracking for
            // someone who had paused it, so the safe default matters: Normalise
            // is not involved here, and the user is told rather than surprised.
            Log.Error(
                "settings.json could not be read; falling back to defaults with tracking paused.", ex);

            return Defaults() with { TrackingEnabled = false };
        }
    }

    /// <summary>
    /// Repairs values that would otherwise misbehave, and re-derives the
    /// read-only ones so a hand-edited file cannot point Trace at another
    /// directory.
    /// </summary>
    private static Contracts.Settings Normalise(Contracts.Settings settings) => settings with
    {
        // A threshold under a minute would mark a reader idle mid-paragraph;
        // over two hours it stops meaning anything.
        IdleThresholdSeconds = Math.Clamp(settings.IdleThresholdSeconds, 60, 7200),
        ExcludedExecutables = settings.ExcludedExecutables
            .Where(e => !string.IsNullOrWhiteSpace(e))
            .Select(e => e.Trim().ToLowerInvariant())
            .Distinct(StringComparer.Ordinal)
            .Order(StringComparer.Ordinal)
            .ToArray(),
        DataDirectory = TracePaths.DataDirectory,
    };

    /// <summary>
    /// Writes to a temporary file and replaces, so a crash mid-write cannot
    /// leave a truncated settings file — which on next start would read as
    /// corrupt and pause tracking.
    /// </summary>
    private static void WriteAtomically(string path, Contracts.Settings settings)
    {
        var directory = Path.GetDirectoryName(path)!;
        Directory.CreateDirectory(directory);

        var temporary = Path.Combine(directory, $".settings.{Guid.NewGuid():N}.tmp");
        var json = JsonSerializer.Serialize(
            settings, new JsonSerializerOptions(ContractJson.Options) { WriteIndented = true });

        try
        {
            File.WriteAllText(temporary, json);

            if (File.Exists(path))
            {
                File.Replace(temporary, path, destinationBackupFileName: null);
            }
            else
            {
                File.Move(temporary, path);
            }
        }
        finally
        {
            if (File.Exists(temporary))
            {
                try
                {
                    File.Delete(temporary);
                }
                catch (IOException)
                {
                }
            }
        }
    }
}
