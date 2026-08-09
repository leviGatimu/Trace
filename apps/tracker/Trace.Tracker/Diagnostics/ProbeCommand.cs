using System.IO.Pipes;
using System.Text;
using System.Text.Json;
using Trace.Contracts;
using Trace.Tracker.Ipc;

namespace Trace.Tracker.Diagnostics;

/// <summary>
/// <c>TraceTracker.exe --probe</c> — an IPC client that exercises the contract
/// against a running tracker.
///
/// The read path's equivalent of <c>--dump</c>: it proves the pipe, the framing
/// and every query handler work against a real database before any of the
/// dashboard exists. It also stands in for the UI in one important respect —
/// local-day boundaries are computed here and sent as UTC, exactly as the
/// contract requires of a client (§4).
/// </summary>
internal static class ProbeCommand
{
    private static readonly UTF8Encoding Utf8 = new(encoderShouldEmitUTF8Identifier: false);

    public static int Run()
    {
        ConsoleBridge.Attach();

        var pipeName = PipeServer.PipeNameForCurrentUser();
        ConsoleBridge.WriteLine();
        ConsoleBridge.WriteLine($"Connecting to \\\\.\\pipe\\{pipeName}");

        using var client = new NamedPipeClientStream(
            ".", pipeName, PipeDirection.InOut, PipeOptions.Asynchronous);

        try
        {
            client.Connect(3000);
        }
        catch (TimeoutException)
        {
            ConsoleBridge.WriteLine();
            ConsoleBridge.WriteLine("No tracker is listening. Start TraceTracker.exe first.");
            return ExitCodes.Fatal;
        }

        using var writer = new StreamWriter(client, Utf8, leaveOpen: true) { AutoFlush = true };
        using var reader = new StreamReader(client, Utf8, leaveOpen: true);

        var id = 0;
        var failures = 0;

        // The client owns the timezone: local-day bounds are computed here and
        // sent as UTC, so the tracker never has to guess where the user is.
        var todayStart = new DateTimeOffset(DateTime.Today, DateTimeOffset.Now.Offset);
        var from = todayStart.ToUnixTimeMilliseconds();
        var to = todayStart.AddDays(1).ToUnixTimeMilliseconds();
        var range = new { fromUtcMs = from, toUtcMs = to };

        ConsoleBridge.WriteLine($"Local day: {todayStart:yyyy-MM-dd HH:mm zzz} -> UTC [{from}, {to})");
        ConsoleBridge.WriteLine(new string('=', 78));

        object?[] probes =
        [
            null,                                                   // system.hello
            null,                                                   // system.status
            null,                                                   // activity.getCurrent
            range,                                                  // activity.getDay
            new { fromUtcMs = from, toUtcMs = to, minSessionSeconds = 5 },
            range,                                                  // applications.list
            null,                                                   // settings.get
            new { text = "e", limit = 5 },                          // search: too short, expect []
        ];

        string[] methods =
        [
            IpcMethods.SystemHello,
            IpcMethods.SystemStatus,
            IpcMethods.ActivityGetCurrent,
            IpcMethods.ActivityGetDay,
            IpcMethods.ActivityGetTimeline,
            IpcMethods.ApplicationsList,
            IpcMethods.SettingsGet,
            IpcMethods.SearchQuery,
        ];

        for (var i = 0; i < methods.Length; i++)
        {
            if (!Call(writer, reader, (++id).ToString(), methods[i], probes[i]))
            {
                failures++;
            }
        }

        // Follow-ups that need an id discovered from an earlier call.
        var applicationId = FirstApplicationId(writer, reader, ref id, range);
        if (applicationId is { } appId)
        {
            if (!Call(writer, reader, (++id).ToString(), IpcMethods.ApplicationsGetDetail,
                    new { applicationId = appId, fromUtcMs = from, toUtcMs = to }))
            {
                failures++;
            }
        }
        else
        {
            ConsoleBridge.WriteLine();
            ConsoleBridge.WriteLine("(no applications recorded yet; skipped applications.getDetail)");
        }

        // Error paths matter as much as the happy ones: a client must be able to
        // trust that a bad request fails cleanly rather than corrupting state.
        ConsoleBridge.WriteLine();
        ConsoleBridge.WriteLine("EXPECTED FAILURES");
        ConsoleBridge.WriteLine(new string('-', 78));
        Call(writer, reader, (++id).ToString(), "nonsense.method", null, expectFailure: true);
        Call(writer, reader, (++id).ToString(), IpcMethods.ActivityGetDay,
            new { fromUtcMs = to, toUtcMs = from }, expectFailure: true);
        Call(writer, reader, (++id).ToString(), IpcMethods.DataDeleteAll,
            new { confirm = "yes" }, expectFailure: true);
        Call(writer, reader, (++id).ToString(), IpcMethods.DataExport,
            new { absolutePath = "not-absolute.json" }, expectFailure: true);

        ConsoleBridge.WriteLine();
        ConsoleBridge.WriteLine(failures == 0
            ? "All probes succeeded."
            : $"{failures} probe(s) failed.");

        return failures == 0 ? ExitCodes.Ok : ExitCodes.Fatal;
    }

    private static long? FirstApplicationId(
        StreamWriter writer, StreamReader reader, ref int id, object range)
    {
        var response = Send(writer, reader, (++id).ToString(), IpcMethods.ApplicationsList, range);

        try
        {
            using var document = JsonDocument.Parse(response);
            var result = document.RootElement.GetProperty("result");

            return result.GetArrayLength() == 0
                ? null
                : result[0].GetProperty("applicationId").GetInt64();
        }
        catch (Exception ex) when (ex is JsonException or KeyNotFoundException
                                       or InvalidOperationException)
        {
            return null;
        }
    }

    private static bool Call(
        StreamWriter writer,
        StreamReader reader,
        string id,
        string method,
        object? parameters,
        bool expectFailure = false)
    {
        var response = Send(writer, reader, id, method, parameters);
        var ok = response.Contains("\"ok\":true", StringComparison.Ordinal);
        var succeeded = ok != expectFailure;

        ConsoleBridge.WriteLine();
        ConsoleBridge.WriteLine($"{(succeeded ? "  ok " : "FAIL")}  {method}");
        ConsoleBridge.WriteLine(Indent(Prettify(response)));

        return succeeded;
    }

    private static string Send(
        StreamWriter writer, StreamReader reader, string id, string method, object? parameters)
    {
        var request = parameters is null
            ? $$"""{"id":"{{id}}","method":"{{method}}"}"""
            : $$"""
                {"id":"{{id}}","method":"{{method}}","params":{{JsonSerializer.Serialize(
                    parameters, ContractJson.Options)}}}
                """.ReplaceLineEndings(string.Empty);

        writer.WriteLine(request);
        return reader.ReadLine() ?? "(no response - connection closed)";
    }

    /// <summary>Re-indents a response, truncated so one big day does not fill the screen.</summary>
    private static string Prettify(string json)
    {
        try
        {
            using var document = JsonDocument.Parse(json);
            var pretty = JsonSerializer.Serialize(
                document.RootElement, new JsonSerializerOptions { WriteIndented = true });

            var lines = pretty.Split(Environment.NewLine);
            return lines.Length <= 40
                ? pretty
                : string.Join(Environment.NewLine, lines.Take(40))
                  + $"{Environment.NewLine}    ... ({lines.Length - 40} more lines)";
        }
        catch (JsonException)
        {
            return json;
        }
    }

    private static string Indent(string text) =>
        string.Join(
            Environment.NewLine,
            text.Split(Environment.NewLine).Select(line => "      " + line));
}
