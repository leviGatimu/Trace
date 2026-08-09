using System.Reflection;

namespace Trace.Tracker;

/// <summary>
/// The tracker's own version, read from assembly metadata so there is exactly
/// one place it is defined (Trace.Tracker.csproj &lt;Version&gt;). Reported to
/// the UI in <c>system.hello</c>.
/// </summary>
public static class TrackerVersion
{
    public static string Value { get; } =
        typeof(TrackerVersion).Assembly
            .GetCustomAttribute<AssemblyInformationalVersionAttribute>()?.InformationalVersion
            .Split('+')[0]
        ?? typeof(TrackerVersion).Assembly.GetName().Version?.ToString()
        ?? "0.0.0";
}
