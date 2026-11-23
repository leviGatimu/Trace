using System.Diagnostics.Eventing.Reader;
using System.Globalization;
using System.Security.Principal;
using Trace.Tracker.Coverage;
using Trace.Tracker.Diagnostics;

namespace Trace.Tracker.Windows;

/// <summary>
/// Reads power, boot and sign-in records from the Windows System log.
///
/// Read-only, and readable without administrator rights. Only the records in
/// <see cref="Recognised"/> are read; everything else in the log is never
/// touched. Sign-in records are kept only for the current Windows account:
/// another account's sessions are none of Trace's business.
/// </summary>
internal sealed class SystemLogSource : IWindowsRecordSource
{
    private const string LogName = "System";

    /// <summary>
    /// The records Trace uses, by provider and event id. Verified on Windows 11
    /// against Event Viewer; see DOCS/product/trace-2.0-plan.md §0.1.
    /// </summary>
    private static readonly Dictionary<(string Provider, int EventId), WindowsRecordKind> Recognised = new()
    {
        [("Microsoft-Windows-Kernel-General", 12)] = WindowsRecordKind.Boot,
        [("Microsoft-Windows-Kernel-General", 13)] = WindowsRecordKind.Shutdown,
        [("Microsoft-Windows-Kernel-Power", 41)] = WindowsRecordKind.UnexpectedShutdown,
        [("Microsoft-Windows-Kernel-Power", 42)] = WindowsRecordKind.Sleep,
        [("Microsoft-Windows-Kernel-Power", 107)] = WindowsRecordKind.Wake,
        [("Microsoft-Windows-Power-Troubleshooter", 1)] = WindowsRecordKind.Wake,
        [("Microsoft-Windows-Winlogon", 7001)] = WindowsRecordKind.SignIn,
        [("Microsoft-Windows-Winlogon", 7002)] = WindowsRecordKind.SignOut,
    };

    public static SystemLogSource Instance { get; } = new();

    public IReadOnlyList<WindowsRecord> ReadSince(long fromUtcMs)
    {
        var since = DateTimeOffset.FromUnixTimeMilliseconds(Math.Max(0, fromUtcMs)).UtcDateTime
            .ToString("yyyy-MM-ddTHH:mm:ss.fffZ", CultureInfo.InvariantCulture);
        var query = new EventLogQuery(LogName, PathType.LogName, BuildQuery(since));
        using var currentUser = WindowsIdentity.GetCurrent();
        var sid = currentUser.User;

        var records = new List<WindowsRecord>();
        try
        {
            using var reader = new EventLogReader(query);
            for (var record = reader.ReadEvent(); record is not null; record = reader.ReadEvent())
            {
                using (record)
                {
                    if (ToWindowsRecord(record, sid) is { } recognised)
                    {
                        records.Add(recognised);
                    }
                }
            }
        }
        catch (Exception ex) when (ex is EventLogException or UnauthorizedAccessException)
        {
            Log.Warn($"The Windows System log could not be read: {ex.Message}");
        }

        return records;
    }

    private static string BuildQuery(string sinceUtc)
    {
        var byProvider = Recognised.Keys
            .GroupBy(key => key.Provider)
            .Select(group =>
                $"(Provider[@Name='{group.Key}'] and ({string.Join(" or ", group.Select(k => $"EventID={k.EventId}"))}))");

        return $"*[System[({string.Join(" or ", byProvider)}) and TimeCreated[@SystemTime>='{sinceUtc}']]]";
    }

    private static WindowsRecord? ToWindowsRecord(EventRecord record, SecurityIdentifier? currentUser)
    {
        if (record.RecordId is not { } recordId
            || record.TimeCreated is not { } created
            || record.ProviderName is not { } provider
            || !Recognised.TryGetValue((provider, record.Id), out var kind))
        {
            return null;
        }

        if (kind is WindowsRecordKind.SignIn or WindowsRecordKind.SignOut
            && !BelongsTo(record, currentUser))
        {
            return null;
        }

        return new WindowsRecord(
            LogName,
            recordId,
            provider,
            record.Id,
            new DateTimeOffset(created.ToUniversalTime()).ToUnixTimeMilliseconds(),
            kind);
    }

    /// <summary>Winlogon carries the account's SID in its event data.</summary>
    private static bool BelongsTo(EventRecord record, SecurityIdentifier? currentUser) =>
        currentUser is not null
        && record.Properties.Any(property => property.Value switch
        {
            SecurityIdentifier sid => sid == currentUser,
            string text => string.Equals(text, currentUser.Value, StringComparison.OrdinalIgnoreCase),
            _ => false,
        });
}
