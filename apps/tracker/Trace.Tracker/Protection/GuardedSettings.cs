using Trace.Contracts;

namespace Trace.Tracker.Protection;

/// <summary>
/// The settings that decide whether, and how much, Trace records. With a PIN
/// set, turning any of them down needs it; turning them up never does.
///
/// Display preferences (clock format, theme, logging) are deliberately left
/// out: changing them hides nothing.
/// </summary>
internal sealed record GuardedSettings(
    bool TrackingEnabled,
    bool StartWithWindows,
    bool RecordWindowTitles,
    IReadOnlyList<string> ExcludedExecutables,
    RetentionPolicy Retention,
    bool ImportWindowsRecords,
    bool RecordBackgroundApps)
{
    public static GuardedSettings From(Contracts.Settings settings) => new(
        settings.TrackingEnabled,
        settings.StartWithWindows,
        settings.RecordWindowTitles,
        settings.ExcludedExecutables,
        settings.Retention,
        settings.ImportWindowsRecords,
        settings.RecordBackgroundApps);

    public Contracts.Settings ApplyTo(Contracts.Settings settings) => settings with
    {
        TrackingEnabled = TrackingEnabled,
        StartWithWindows = StartWithWindows,
        RecordWindowTitles = RecordWindowTitles,
        ExcludedExecutables = ExcludedExecutables,
        Retention = Retention,
        ImportWindowsRecords = ImportWindowsRecords,
        RecordBackgroundApps = RecordBackgroundApps,
    };

    /// <summary>Records list equality, which the generated record equality does not do.</summary>
    public bool SameAs(GuardedSettings other) =>
        TrackingEnabled == other.TrackingEnabled
        && StartWithWindows == other.StartWithWindows
        && RecordWindowTitles == other.RecordWindowTitles
        && ExcludedExecutables.Order(StringComparer.Ordinal)
            .SequenceEqual(other.ExcludedExecutables.Order(StringComparer.Ordinal), StringComparer.Ordinal)
        && Retention == other.Retention
        && ImportWindowsRecords == other.ImportWindowsRecords
        && RecordBackgroundApps == other.RecordBackgroundApps;

    /// <summary>
    /// What going from <paramref name="before"/> to <paramref name="after"/>
    /// would switch off or reduce, as phrases that finish "Enter your PIN to …".
    /// Empty when nothing is weakened.
    /// </summary>
    public static IReadOnlyList<string> Weakenings(GuardedSettings before, GuardedSettings after)
    {
        var found = new List<string>();

        if (before.TrackingEnabled && !after.TrackingEnabled)
        {
            found.Add("pause recording");
        }

        if (before.StartWithWindows && !after.StartWithWindows)
        {
            found.Add("stop Trace starting with Windows");
        }

        if (before.RecordWindowTitles && !after.RecordWindowTitles)
        {
            found.Add("stop recording window titles");
        }

        var added = after.ExcludedExecutables
            .Except(before.ExcludedExecutables, StringComparer.OrdinalIgnoreCase)
            .ToList();
        if (added.Count > 0)
        {
            found.Add($"stop recording {string.Join(", ", added)}");
        }

        if (Days(after.Retention) < Days(before.Retention))
        {
            found.Add($"keep history for less time ({Describe(after.Retention)})");
        }

        if (before.ImportWindowsRecords && !after.ImportWindowsRecords)
        {
            found.Add("stop copying Windows power and sign-in records");
        }

        if (before.RecordBackgroundApps && !after.RecordBackgroundApps)
        {
            found.Add("stop recording background apps");
        }

        return found;
    }

    private static int Days(RetentionPolicy policy) => policy switch
    {
        RetentionPolicy.THIRTY_DAYS => 30,
        RetentionPolicy.NINETY_DAYS => 90,
        RetentionPolicy.ONE_YEAR => 365,
        _ => int.MaxValue,
    };

    private static string Describe(RetentionPolicy policy) => policy switch
    {
        RetentionPolicy.THIRTY_DAYS => "30 days",
        RetentionPolicy.NINETY_DAYS => "90 days",
        RetentionPolicy.ONE_YEAR => "one year",
        _ => "forever",
    };
}
