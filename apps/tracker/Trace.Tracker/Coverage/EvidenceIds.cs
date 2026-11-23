using System.Text.RegularExpressions;

namespace Trace.Tracker.Coverage;

/// <summary>
/// The ids a record is cited by: <c>S-</c> a foreground span, <c>W-</c> a window
/// title span, <c>E-</c> a raw event, <c>WR-</c> a copied Windows record.
///
/// Each is the row's primary key, so it names the same record for as long as
/// that record exists. Caveat: SQLite can reuse the highest key after the newest
/// rows are deleted, so an id cited before a "delete range" covering the newest
/// history may later name a different record.
/// </summary>
internal static partial class EvidenceIds
{
    public static string Session(long id) => $"S-{id}";

    public static string Window(long id) => $"W-{id}";

    public static string Event(long id) => $"E-{id}";

    public static string WindowsRecord(long id) => $"WR-{id}";

    /// <summary>Recognises an id typed into search, in any case and with surrounding spaces.</summary>
    public static (string Prefix, long Id)? TryParse(string text)
    {
        var match = Pattern().Match(text.Trim());
        return match.Success && long.TryParse(match.Groups[2].Value, out var id)
            ? (match.Groups[1].Value.ToUpperInvariant(), id)
            : null;
    }

    [GeneratedRegex(@"^(S|W|E|WR)-(\d{1,18})$", RegexOptions.IgnoreCase)]
    private static partial Regex Pattern();
}
