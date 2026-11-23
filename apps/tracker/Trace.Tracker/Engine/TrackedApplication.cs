using Trace.Tracker.Identity;

namespace Trace.Tracker.Engine;

/// <summary>
/// What Trace knows about the application behind a window.
///
/// Plain data, deliberately in the Engine namespace rather than Windows: the
/// state machine reasons about applications, not about window handles, and must
/// stay testable without Windows in the picture.
/// </summary>
/// <param name="ProcessId">The process that actually owns the visible window.</param>
/// <param name="Executable">
/// Normalised (lowercased) filename, e.g. <c>chrome.exe</c>. This is the
/// application identity key — DOCS/specs/data-and-database.md §4 — and the key the
/// exclusion list matches on, so an excluded application cannot slip through by
/// being installed to a different path.
/// </param>
/// <param name="DisplayName">Friendly name, e.g. <c>Google Chrome</c>.</param>
/// <param name="ExecutablePath">
/// Full path, or null when the process could not be opened (protected or
/// elevated). Recorded honestly as null rather than guessed.
/// </param>
/// <param name="Category">The registry's category, or null when Trace does not know one.</param>
/// <param name="PackageFamily">The MSIX package family for a packaged app, otherwise null.</param>
/// <param name="IdentitySource">Where <paramref name="DisplayName"/> came from.</param>
/// <param name="IdentityVersion">
/// The resolver version that produced this identity. 0 means "not resolved by
/// the current rules", so the backfill will revisit the row.
/// </param>
/// <param name="ProfileKey">The profile to join; null means the executable is its own profile.</param>
/// <param name="ProfileLink">Why it joins that profile.</param>
internal sealed record TrackedApplication(
    uint ProcessId,
    string Executable,
    string DisplayName,
    string? ExecutablePath,
    string? Category = null,
    string? PackageFamily = null,
    IdentitySource IdentitySource = IdentitySource.Filename,
    int IdentityVersion = 0,
    string? ProfileKey = null,
    ProfileLink ProfileLink = ProfileLink.Self);
