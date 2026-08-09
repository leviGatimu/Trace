using Trace.Contracts;

namespace Trace.Tracker.Data.Queries;

/// <summary>
/// Search across the recorded history — window titles and application names.
///
/// A substring <c>LIKE</c> rather than FTS5. FTS5 tokenises on word boundaries,
/// which is wrong for this data: window titles are full of paths, filenames and
/// hyphenated fragments, and someone searching "github" expects to find
/// "GitHub - Google Chrome" as readily as "main.ts" inside "project-x/main.ts".
/// A trigram-tokenised FTS index could do both, at the cost of a shadow table
/// that doubles the write path. Revisit if profiling on a multi-year history
/// says it is needed; until then this stays simple and correct.
/// </summary>
internal sealed class SearchQueries
{
    private readonly TraceDatabase _database;

    public SearchQueries(TraceDatabase database)
    {
        _database = database;
    }

    public List<SearchResult> Search(SearchQueryParams query, long nowUtcMs)
    {
        var text = query.Text.Trim();
        if (text.Length < SearchQueryParams.MinTextLength)
        {
            // Anything shorter matches most of the history and helps nobody.
            return [];
        }

        var limit = Math.Clamp(query.Limit ?? SearchQueryParams.DefaultLimit, 1,
            SearchQueryParams.MaxLimit);
        var from = query.FromUtcMs ?? long.MinValue;
        var to = query.ToUtcMs ?? long.MaxValue;

        return _database.Read(connection =>
        {
            using var command = connection.CreateCommand();

            // Two arms, one result set: a session matches either because a
            // window shown during it matched, or because the application itself
            // did. Window matches rank first — they say more about what the user
            // was actually doing.
            command.CommandText =
                """
                SELECT * FROM (
                    SELECT s.id, s.application_id, a.name, a.executable,
                           w.title AS matched_title, 'title' AS matched_on,
                           s.started_at, s.ended_at,
                           MAX(w.duration_seconds) AS rank_duration
                      FROM window_sessions w
                      JOIN sessions s ON s.id = w.session_id
                      JOIN applications a ON a.id = s.application_id
                     WHERE w.title LIKE $pattern ESCAPE '\'
                       AND s.started_at >= $from AND s.started_at < $to
                     GROUP BY s.id, w.title

                    UNION ALL

                    SELECT s.id, s.application_id, a.name, a.executable,
                           NULL, 'application',
                           s.started_at, s.ended_at,
                           s.active_seconds
                      FROM sessions s
                      JOIN applications a ON a.id = s.application_id
                     WHERE (a.name LIKE $pattern ESCAPE '\'
                            OR a.executable LIKE $pattern ESCAPE '\')
                       AND s.started_at >= $from AND s.started_at < $to
                )
                ORDER BY started_at DESC, matched_on, rank_duration DESC
                LIMIT $limit;
                """;

            command.Parameters.AddWithValue("$pattern", $"%{EscapeLike(text)}%");
            command.Parameters.AddWithValue("$from", from);
            command.Parameters.AddWithValue("$to", to);
            command.Parameters.AddWithValue("$limit", limit);

            var results = new List<SearchResult>();
            using var reader = command.ExecuteReader();

            while (reader.Read())
            {
                var startedAt = reader.GetInt64(6);
                var endedAt = reader.IsDBNull(7) ? (long?)null : reader.GetInt64(7);

                results.Add(new SearchResult(
                    reader.GetInt64(0),
                    reader.GetInt64(1),
                    reader.GetString(2),
                    reader.GetString(3),
                    reader.IsDBNull(4) ? null : reader.GetString(4),
                    reader.GetString(5),
                    startedAt,
                    endedAt,
                    (int)(((endedAt ?? nowUtcMs) - startedAt) / 1000)));
            }

            return results;
        });
    }

    /// <summary>
    /// Escapes the wildcards LIKE would otherwise interpret. Without this,
    /// searching for a literal <c>%</c> or <c>_</c> — both common in window
    /// titles — would silently match everything.
    /// </summary>
    private static string EscapeLike(string text) => text
        .Replace(@"\", @"\\", StringComparison.Ordinal)
        .Replace("%", @"\%", StringComparison.Ordinal)
        .Replace("_", @"\_", StringComparison.Ordinal);
}
