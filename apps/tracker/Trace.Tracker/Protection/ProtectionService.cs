using System.Text.Json;
using Microsoft.Data.Sqlite;
using Trace.Contracts;
using Trace.Tracker.Data;
using Trace.Tracker.Diagnostics;
using Trace.Tracker.Engine;
using Trace.Tracker.Ipc;
using Trace.Tracker.Settings;

namespace Trace.Tracker.Protection;

/// <summary>The scheduled task that starts Trace again after it is ended. Faked in tests.</summary>
internal interface IAutoRestart
{
    /// <summary>Installed, switched on, and pointing at this tracker.</summary>
    bool IsActive();

    void Install();

    /// <summary>Switched off but kept, for a quit with the PIN: the next start switches it back on.</summary>
    void Disable();

    void Remove();
}

/// <summary>
/// The Trace PIN: who may pause, quit or weaken recording, and the log of
/// every time someone did or tried.
///
/// Enforced here in the tracker, not in the dashboard. The pipe is open to
/// anything running as this Windows user, so a check that lived only in the
/// window could be stepped around by talking to the pipe directly.
///
/// What this cannot do, and the dashboard says so: stop someone signed in as
/// you from ending the process or deleting the program. It makes those
/// visible instead. Auto-restart brings Trace back within a minute, and the
/// log records the stop.
/// </summary>
internal sealed class ProtectionService
{
    public static readonly TimeSpan UnlockWindow = TimeSpan.FromMinutes(5);
    public const int FreeAttempts = 5;
    private static readonly TimeSpan FirstLockout = TimeSpan.FromMinutes(1);
    private static readonly TimeSpan LongestLockout = TimeSpan.FromHours(1);

    private readonly TraceDatabase _database;
    private readonly IClock _clock;
    private readonly IAutoRestart _autoRestart;
    private readonly int _iterations;
    private readonly Lock _gate = new();

    private StoredPin? _record;
    private long _unlockedUntil;

    // Refreshed by EnsureAutoRestart, so a status request never starts schtasks.
    private volatile bool _autoRestartActive;

    public ProtectionService(TraceDatabase database, IClock clock, IAutoRestart autoRestart, int iterations = Secrets.DefaultIterations)
    {
        _database = database;
        _clock = clock;
        _autoRestart = autoRestart;
        _iterations = iterations;
        _record = _database.Read(ReadRecord);
    }

    /// <summary>Raised after anything is added to the log, so the dashboard can refresh.</summary>
    public event Action? Logged;

    public bool Enabled
    {
        get
        {
            lock (_gate)
            {
                return _record is not null;
            }
        }
    }

    public ProtectionStatus Status()
    {
        lock (_gate)
        {
            var now = _clock.UtcNowMs;
            return new ProtectionStatus(
                _record is not null,
                _record is not null && _unlockedUntil > now ? _unlockedUntil : null,
                _record is not null && _record.LockedOutUntil > now ? _record.LockedOutUntil : null,
                _record?.FailedAttempts ?? 0,
                _record is not null && _autoRestartActive);
        }
    }

    /// <summary>
    /// Throws <see cref="IpcErrorCode.E_LOCKED"/> unless no PIN is set or the
    /// PIN was entered within the last few minutes.
    /// </summary>
    /// <param name="action">Finishes the sentence "Enter your Trace PIN to …".</param>
    public void Demand(string action)
    {
        lock (_gate)
        {
            if (_record is null || _unlockedUntil > _clock.UtcNowMs)
            {
                return;
            }

            throw new IpcException(IpcErrorCode.E_LOCKED, LockedMessage(action));
        }
    }

    /// <summary>Sets the PIN, or changes it (which needs the old one first). Returns the new recovery code.</summary>
    public ProtectionSetupResult Setup(string? pin, Contracts.Settings current)
    {
        if (Secrets.ProblemWithPin(pin) is { } problem)
        {
            throw new IpcException(IpcErrorCode.E_BAD_PARAMS, problem);
        }

        string recoveryCode;
        bool changing;
        lock (_gate)
        {
            changing = _record is not null;
            if (changing)
            {
                Demand("change the PIN");
            }

            recoveryCode = Secrets.NewRecoveryCode();
            var (pinHash, pinSalt) = Secrets.Hash(pin!, _iterations);
            var (recoveryHash, recoverySalt) = Secrets.Hash(Secrets.NormaliseRecoveryCode(recoveryCode), _iterations);
            var record = new StoredPin(
                pinHash, pinSalt, recoveryHash, recoverySalt, _iterations, 0, 0,
                Serialise(GuardedSettings.From(current)), _clock.UtcNowMs);

            _database.Write(connection => WriteRecord(connection, record));
            _record = record;

            // Locked straight away: setting a PIN is the moment its owner
            // expects things to become guarded.
            _unlockedUntil = 0;
        }

        Record(changing ? "pin-changed" : "protection-on",
            changing ? "The Trace PIN was changed." : "A Trace PIN was set. Pausing, quitting and turning settings down now need it.");
        EnsureAutoRestart(logRepair: false);
        return new ProtectionSetupResult(recoveryCode, Status());
    }

    /// <summary>Checks a PIN or recovery code. Wrong tries count towards a lockout that survives restarts.</summary>
    public ProtectionStatus Unlock(string? secret)
    {
        string? entry = null;
        string? failure = null;

        lock (_gate)
        {
            var now = _clock.UtcNowMs;
            if (_record is null)
            {
                return Status();
            }

            if (_record.LockedOutUntil > now)
            {
                throw new IpcException(IpcErrorCode.E_LOCKED, LockedOutMessage(_record.LockedOutUntil));
            }

            var given = (secret ?? string.Empty).Trim();
            var byPin = given.Length > 0 && Secrets.Verify(given, _record.PinHash, _record.PinSalt, _record.Iterations);
            var byRecovery = !byPin && given.Length >= 16
                && Secrets.Verify(Secrets.NormaliseRecoveryCode(given), _record.RecoveryHash, _record.RecoverySalt, _record.Iterations);

            if (byPin || byRecovery)
            {
                _record = _record with { FailedAttempts = 0, LockedOutUntil = 0 };
                _unlockedUntil = now + (long)UnlockWindow.TotalMilliseconds;
                if (byRecovery)
                {
                    entry = "The recovery code was used to unlock Trace.";
                }
            }
            else
            {
                var attempts = _record.FailedAttempts + 1;
                var lockedOutUntil = 0L;
                if (attempts >= FreeAttempts)
                {
                    var doublings = Math.Min(attempts - FreeAttempts, 6);
                    var length = TimeSpan.FromTicks(Math.Min(FirstLockout.Ticks << doublings, LongestLockout.Ticks));
                    lockedOutUntil = now + (long)length.TotalMilliseconds;
                }

                _record = _record with { FailedAttempts = attempts, LockedOutUntil = lockedOutUntil };
                failure = lockedOutUntil > 0
                    ? LockedOutMessage(lockedOutUntil)
                    : $"That PIN is not right. {FreeAttempts - attempts} more {(FreeAttempts - attempts == 1 ? "try" : "tries")} before Trace stops accepting PINs for a while.";
            }

            var saved = _record;
            _database.Write(connection => WriteAttempts(connection, saved.FailedAttempts, saved.LockedOutUntil));
        }

        if (entry is not null)
        {
            Record("recovery-used", entry);
        }

        if (failure is not null)
        {
            var record = _record!;
            Record("wrong-pin", $"A wrong PIN was entered ({record.FailedAttempts} in a row).");
            if (record.LockedOutUntil > 0)
            {
                Record("locked-out", "Too many wrong PINs. Trace stopped accepting PINs for a while.");
            }

            throw new IpcException(IpcErrorCode.E_LOCKED, failure);
        }

        return Status();
    }

    public ProtectionStatus LockNow()
    {
        lock (_gate)
        {
            _unlockedUntil = 0;
        }

        return Status();
    }

    public ProtectionStatus Disable()
    {
        lock (_gate)
        {
            if (_record is null)
            {
                return Status();
            }

            Demand("turn protection off");
            _database.Write(connection =>
            {
                using var command = connection.CreateCommand();
                command.CommandText = "DELETE FROM protection;";
                command.ExecuteNonQuery();
            });
            _record = null;
            _unlockedUntil = 0;
        }

        SafeAutoRestart(r => r.Remove());
        _autoRestartActive = false;
        Record("protection-off", "Protection was turned off. Pausing and quitting no longer need a PIN.");
        return Status();
    }

    /// <summary>Remembers the guarded settings as allowed, so a later hand edit can be told apart.</summary>
    public void Remember(Contracts.Settings settings)
    {
        lock (_gate)
        {
            if (_record is null)
            {
                return;
            }

            var json = Serialise(GuardedSettings.From(settings));
            if (json == _record.Guarded)
            {
                return;
            }

            _record = _record with { Guarded = json };
            _database.Write(connection =>
            {
                using var command = connection.CreateCommand();
                command.CommandText = "UPDATE protection SET guarded_settings = $g WHERE id = 1;";
                command.Parameters.AddWithValue("$g", json);
                command.ExecuteNonQuery();
            });
        }
    }

    /// <summary>
    /// At startup: puts back guarded settings that were changed in
    /// settings.json while Trace was not looking, or lost because the file
    /// could not be read. Without a PIN, only says what happened.
    /// </summary>
    public void CheckSettingsFile(SettingsStore settings)
    {
        GuardedSettings? allowed;
        lock (_gate)
        {
            allowed = _record is null ? null : Deserialise(_record.Guarded);
        }

        if (allowed is null)
        {
            if (settings.LoadFailed)
            {
                Record("settings-unreadable", "settings.json could not be read, so Trace started paused.");
            }

            return;
        }

        var found = GuardedSettings.From(settings.Current);
        if (found.SameAs(allowed))
        {
            return;
        }

        var weakened = GuardedSettings.Weakenings(allowed, found);
        if (settings.LoadFailed)
        {
            Record("settings-unreadable", "settings.json could not be read. Trace kept recording with your protected settings.");
        }
        else
        {
            Record("settings-edited", weakened.Count > 0
                ? $"settings.json was edited outside Trace to {string.Join("; ", weakened)}. Trace put it back."
                : "settings.json was edited outside Trace. Trace put the protected settings back.");
        }

        settings.Update(current => allowed.ApplyTo(current));
    }

    /// <summary>Reinstalls or switches the auto-restart task back on if it is missing or off.</summary>
    public void EnsureAutoRestart(bool logRepair)
    {
        if (!Enabled)
        {
            return;
        }

        if (SafeIsActive())
        {
            _autoRestartActive = true;
            return;
        }

        _autoRestartActive = SafeAutoRestart(r => r.Install()) && SafeIsActive();
        if (_autoRestartActive && logRepair)
        {
            Record("auto-restart-repaired", "The auto-restart task had been removed or switched off. Trace put it back.");
        }
    }

    /// <summary>A quit with the PIN: auto-restart is switched off until Trace next starts.</summary>
    public void SuspendAutoRestart()
    {
        if (Enabled)
        {
            SafeAutoRestart(r => r.Disable());
            _autoRestartActive = false;
        }
    }

    // -- the log --------------------------------------------------------------

    public void Record(string kind, string detail, long? fromMs = null, long? toMs = null)
    {
        try
        {
            _database.Write(connection =>
            {
                using var command = connection.CreateCommand();
                command.CommandText =
                    "INSERT INTO tamper_log (at, kind, detail, from_ms, to_ms) VALUES ($at, $k, $d, $f, $t);";
                command.Parameters.AddWithValue("$at", _clock.UtcNowMs);
                command.Parameters.AddWithValue("$k", kind);
                command.Parameters.AddWithValue("$d", detail);
                command.Parameters.AddWithValue("$f", (object?)fromMs ?? DBNull.Value);
                command.Parameters.AddWithValue("$t", (object?)toMs ?? DBNull.Value);
                command.ExecuteNonQuery();
            });
        }
        catch (Exception ex) when (ex is SqliteException or ObjectDisposedException)
        {
            Log.Warn($"Could not write to the tamper log: {ex.Message}");
            return;
        }

        Log.Info($"Tamper log: {kind}.");
        Logged?.Invoke();
    }

    public IReadOnlyList<TamperEntry> List(int limit) =>
        _database.Read(connection =>
        {
            using var command = connection.CreateCommand();
            command.CommandText =
                "SELECT id, at, kind, detail, from_ms, to_ms FROM tamper_log ORDER BY at DESC, id DESC LIMIT $n;";
            command.Parameters.AddWithValue("$n", Math.Clamp(limit, 1, 1000));
            var entries = new List<TamperEntry>();
            using var reader = command.ExecuteReader();
            while (reader.Read())
            {
                entries.Add(new TamperEntry(
                    reader.GetInt64(0),
                    reader.GetInt64(1),
                    reader.GetString(2),
                    reader.GetString(3),
                    reader.IsDBNull(4) ? null : reader.GetInt64(4),
                    reader.IsDBNull(5) ? null : reader.GetInt64(5)));
            }

            return (IReadOnlyList<TamperEntry>)entries;
        });

    // -- plumbing ---------------------------------------------------------------

    private string LockedMessage(string action) =>
        _record is { } record && record.LockedOutUntil > _clock.UtcNowMs
            ? LockedOutMessage(record.LockedOutUntil)
            : $"Enter your Trace PIN to {action}.";

    private string LockedOutMessage(long until)
    {
        var minutes = Math.Max(1, (int)Math.Ceiling((until - _clock.UtcNowMs) / 60_000.0));
        return $"Too many wrong PINs. Try again in {minutes} {(minutes == 1 ? "minute" : "minutes")}.";
    }

    private bool SafeIsActive()
    {
        try
        {
            return _autoRestart.IsActive();
        }
        catch (Exception ex) when (ex is IOException or InvalidOperationException or System.ComponentModel.Win32Exception)
        {
            Log.Warn($"Could not check the auto-restart task: {ex.Message}");
            return false;
        }
    }

    private bool SafeAutoRestart(Action<IAutoRestart> work)
    {
        try
        {
            work(_autoRestart);
            return true;
        }
        catch (Exception ex) when (ex is IOException or InvalidOperationException or System.ComponentModel.Win32Exception or UnauthorizedAccessException)
        {
            Log.Warn($"Could not update the auto-restart task: {ex.Message}");
            return false;
        }
    }

    private static string Serialise(GuardedSettings settings) => JsonSerializer.Serialize(settings, ContractJson.Options);

    private static GuardedSettings? Deserialise(string json)
    {
        try
        {
            return JsonSerializer.Deserialize<GuardedSettings>(json, ContractJson.Options);
        }
        catch (JsonException ex)
        {
            Log.Warn($"The protected settings could not be read: {ex.Message}");
            return null;
        }
    }

    private static StoredPin? ReadRecord(SqliteConnection connection)
    {
        using var command = connection.CreateCommand();
        command.CommandText =
            "SELECT pin_hash, pin_salt, recovery_hash, recovery_salt, iterations, failed_attempts, " +
            "locked_out_until, guarded_settings, created_at FROM protection WHERE id = 1;";
        using var reader = command.ExecuteReader();
        if (!reader.Read())
        {
            return null;
        }

        return new StoredPin(
            (byte[])reader[0], (byte[])reader[1], (byte[])reader[2], (byte[])reader[3],
            reader.GetInt32(4), reader.GetInt32(5), reader.GetInt64(6), reader.GetString(7), reader.GetInt64(8));
    }

    private static void WriteRecord(SqliteConnection connection, StoredPin record)
    {
        using var command = connection.CreateCommand();
        command.CommandText =
            "INSERT OR REPLACE INTO protection (id, pin_hash, pin_salt, recovery_hash, recovery_salt, iterations, " +
            "failed_attempts, locked_out_until, guarded_settings, created_at) " +
            "VALUES (1, $ph, $ps, $rh, $rs, $it, $fa, $lo, $g, $c);";
        command.Parameters.AddWithValue("$ph", record.PinHash);
        command.Parameters.AddWithValue("$ps", record.PinSalt);
        command.Parameters.AddWithValue("$rh", record.RecoveryHash);
        command.Parameters.AddWithValue("$rs", record.RecoverySalt);
        command.Parameters.AddWithValue("$it", record.Iterations);
        command.Parameters.AddWithValue("$fa", record.FailedAttempts);
        command.Parameters.AddWithValue("$lo", record.LockedOutUntil);
        command.Parameters.AddWithValue("$g", record.Guarded);
        command.Parameters.AddWithValue("$c", record.CreatedAt);
        command.ExecuteNonQuery();
    }

    private static void WriteAttempts(SqliteConnection connection, int attempts, long lockedOutUntil)
    {
        using var command = connection.CreateCommand();
        command.CommandText = "UPDATE protection SET failed_attempts = $a, locked_out_until = $l WHERE id = 1;";
        command.Parameters.AddWithValue("$a", attempts);
        command.Parameters.AddWithValue("$l", lockedOutUntil);
        command.ExecuteNonQuery();
    }

    private sealed record StoredPin(
        byte[] PinHash,
        byte[] PinSalt,
        byte[] RecoveryHash,
        byte[] RecoverySalt,
        int Iterations,
        int FailedAttempts,
        long LockedOutUntil,
        string Guarded,
        long CreatedAt);
}
