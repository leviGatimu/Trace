using System.Security.Cryptography;
using System.Text;

namespace Trace.Tracker.Protection;

/// <summary>
/// Hashing for the Trace PIN and its recovery code.
///
/// PBKDF2-HMAC-SHA256 with a random 16-byte salt per secret, compared in
/// constant time. A short PIN can still be brute-forced from a stolen database
/// file, whatever the hash; what stops guessing at the keyboard is the lockout
/// in <see cref="ProtectionService"/>, which persists across restarts.
/// </summary>
internal static class Secrets
{
    /// <summary>OWASP's figure for PBKDF2-HMAC-SHA256. About a third of a second here.</summary>
    public const int DefaultIterations = 600_000;

    public const int MinPinLength = 4;
    public const int MaxPinLength = 12;

    // Crockford's base32 without I, L, O and U: nothing in it can be misread
    // for another character when copied off a screen by hand.
    private const string RecoveryAlphabet = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
    private const int RecoveryLength = 16;

    public static (byte[] Hash, byte[] Salt) Hash(string secret, int iterations)
    {
        var salt = RandomNumberGenerator.GetBytes(16);
        return (Derive(secret, salt, iterations), salt);
    }

    public static bool Verify(string secret, byte[] hash, byte[] salt, int iterations) =>
        CryptographicOperations.FixedTimeEquals(Derive(secret, salt, iterations), hash);

    /// <summary>Null when the PIN is acceptable, otherwise what is wrong with it.</summary>
    public static string? ProblemWithPin(string? pin)
    {
        if (string.IsNullOrEmpty(pin) || !pin.All(char.IsAsciiDigit))
        {
            return "The PIN must be digits only.";
        }

        if (pin.Length is < MinPinLength or > MaxPinLength)
        {
            return $"The PIN must be {MinPinLength} to {MaxPinLength} digits.";
        }

        // Everyone's first guesses. Refused rather than warned about: a PIN
        // anyone would try first protects nothing.
        if (pin.Distinct().Count() == 1 || "0123456789012".Contains(pin, StringComparison.Ordinal)
                                        || "9876543210987".Contains(pin, StringComparison.Ordinal))
        {
            return "That PIN is too easy to guess. Avoid repeated or consecutive digits.";
        }

        return null;
    }

    /// <summary>A new recovery code, formatted XXXX-XXXX-XXXX-XXXX.</summary>
    public static string NewRecoveryCode()
    {
        var characters = RandomNumberGenerator.GetItems<char>(RecoveryAlphabet, RecoveryLength);
        var builder = new StringBuilder(RecoveryLength + 3);
        for (var i = 0; i < characters.Length; i++)
        {
            if (i > 0 && i % 4 == 0)
            {
                builder.Append('-');
            }

            builder.Append(characters[i]);
        }

        return builder.ToString();
    }

    /// <summary>The recovery code as hashed: no separators, upper case, and O read as 0, I and L as 1.</summary>
    public static string NormaliseRecoveryCode(string code)
    {
        var builder = new StringBuilder(code.Length);
        foreach (var raw in code)
        {
            var c = char.ToUpperInvariant(raw);
            if (c is '-' or ' ')
            {
                continue;
            }

            builder.Append(c switch
            {
                'O' => '0',
                'I' or 'L' => '1',
                _ => c,
            });
        }

        return builder.ToString();
    }

    private static byte[] Derive(string secret, byte[] salt, int iterations) =>
        Rfc2898DeriveBytes.Pbkdf2(Encoding.UTF8.GetBytes(secret), salt, iterations, HashAlgorithmName.SHA256, 32);
}
