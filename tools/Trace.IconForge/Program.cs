using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;

namespace Trace.IconForge;

/// <summary>
/// Draws the Trace mark and writes the icon assets.
///
/// The logo is generated from code rather than checked in as an opaque binary,
/// so it can be adjusted, re-rendered at any size, and reviewed as a diff. Run
/// it with the repository root as the argument; it writes into `brand/`.
/// </summary>
internal static class Program
{
    private static int Main(string[] args)
    {
        var root = args.Length > 0 ? args[0] : Directory.GetCurrentDirectory();
        var output = Path.Combine(root, "brand");
        Directory.CreateDirectory(output);

        // Application icon: the mark on its tile, for the window, the Start
        // menu and the installer.
        WriteIco(Path.Combine(output, "trace.ico"), size => Render(size, Variant.Tile));
        WritePng(Path.Combine(output, "trace-256.png"), Render(256, Variant.Tile));
        WritePng(Path.Combine(output, "trace-logo.png"), RenderWordmark());

        // Tray icons: no tile, because a Windows tray icon sits directly on the
        // taskbar and a filled square would read as a badge rather than a mark.
        // Two states, because DOCS/Privacy.md §11 requires that whether Trace is
        // recording is always visible.
        WriteIco(Path.Combine(output, "trace-tray.ico"), size => Render(size, Variant.TrayActive));
        WriteIco(Path.Combine(output, "trace-tray-paused.ico"), size => Render(size, Variant.TrayPaused));

        // A magnified sheet of the sizes Windows actually draws, so the mark can
        // be judged at the size it will be seen rather than at 256.
        WritePng(Path.Combine(output, "trace-preview.png"), RenderPreview());

        Console.WriteLine($"Wrote Trace brand assets to {output}");
        return 0;
    }

    private enum Variant
    {
        Tile,
        TrayActive,
        TrayPaused,
    }

    // The palette from DOCS/UI and UX-design.md, so the mark belongs to the
    // same product as the interface.
    private static readonly Color Ink = Color.FromArgb(0xF5, 0xF5, 0xF5);
    private static readonly Color InkDim = Color.FromArgb(0x8B, 0x90, 0x99);
    private static readonly Color Accent = Color.FromArgb(0x4C, 0x8D, 0xFF);
    private static readonly Color Tile = Color.FromArgb(0x14, 0x17, 0x1C);

    /// <summary>
    /// The mark: a "T" whose stem ends in a bright node.
    ///
    /// The letterform carries the name and stays legible at 16 pixels, which is
    /// the size that actually matters in a tray full of other icons. The node at
    /// the foot is the trace itself — the mark left behind — and it is the one
    /// place the accent colour appears, so tracking and paused are
    /// distinguishable at a glance.
    /// </summary>
    private static Bitmap Render(int size, Variant variant)
    {
        var bitmap = new Bitmap(size, size, PixelFormat.Format32bppArgb);

        using var graphics = Graphics.FromImage(bitmap);
        graphics.SmoothingMode = SmoothingMode.AntiAlias;
        graphics.InterpolationMode = InterpolationMode.HighQualityBicubic;
        graphics.PixelOffsetMode = PixelOffsetMode.HighQuality;
        graphics.Clear(Color.Transparent);

        // Everything is expressed as a fraction of the canvas so the mark is
        // identical at 16 and at 256.
        float U(double fraction) => (float)(fraction * size);

        var isTile = variant == Variant.Tile;

        if (isTile)
        {
            using var background = new SolidBrush(Tile);
            using var tile = RoundedRect(0, 0, size, size, U(0.22));
            graphics.FillPath(background, tile);

            // A hairline edge, the same one the interface uses to separate
            // surfaces, so the tile does not float when placed on dark chrome.
            using var edge = new Pen(Color.FromArgb(20, 255, 255, 255), Math.Max(1f, U(0.008)));
            graphics.DrawPath(edge, tile);
        }

        // Inset the glyph inside the tile; on the tray it uses nearly the whole
        // canvas, because a tray icon is already small.
        var inset = isTile ? 0.235 : 0.09;
        var left = U(inset);
        var right = U(1 - inset);
        var top = U(isTile ? 0.20 : 0.08);
        var width = right - left;

        var barHeight = U(isTile ? 0.115 : 0.155);
        var stemWidth = U(isTile ? 0.115 : 0.155);
        var stemLeft = left + ((width - stemWidth) / 2f);

        var glyph = variant == Variant.TrayPaused ? InkDim : Ink;
        var node = variant switch
        {
            Variant.TrayPaused => InkDim,
            _ => Accent,
        };

        using var glyphBrush = new SolidBrush(glyph);
        using var nodeBrush = new SolidBrush(node);

        // Crossbar.
        using (var bar = RoundedRect(left, top, width, barHeight, barHeight / 2.4f))
        {
            graphics.FillPath(glyphBrush, bar);
        }

        // Stem, stopping just short of the node so the node reads as the mark
        // left behind rather than part of the letter. The gap is deliberately
        // narrow: any wider and the glyph stops reading as a T and starts
        // reading as an upside-down exclamation mark.
        var stemTop = top + barHeight + U(0.022);
        var nodeDiameter = U(isTile ? 0.145 : 0.21);
        var bottom = U(isTile ? 0.82 : 0.95);
        var stemHeight = bottom - nodeDiameter - U(0.022) - stemTop;

        using (var stem = RoundedRect(stemLeft, stemTop, stemWidth, stemHeight, stemWidth / 2.4f))
        {
            graphics.FillPath(glyphBrush, stem);
        }

        var nodeLeft = left + ((width - nodeDiameter) / 2f);
        graphics.FillEllipse(nodeBrush, nodeLeft, bottom - nodeDiameter, nodeDiameter, nodeDiameter);

        return bitmap;
    }

    /// <summary>The mark beside the wordmark, for documentation and the installer.</summary>
    private static Bitmap RenderWordmark()
    {
        const int height = 256;
        const int width = 1100;

        var bitmap = new Bitmap(width, height, PixelFormat.Format32bppArgb);

        using var graphics = Graphics.FromImage(bitmap);
        graphics.SmoothingMode = SmoothingMode.AntiAlias;
        graphics.TextRenderingHint = System.Drawing.Text.TextRenderingHint.AntiAliasGridFit;

        // On the product's own surface colour rather than transparent: the
        // wordmark is near-white, and a transparent PNG of near-white text is
        // invisible everywhere it is likely to be previewed.
        graphics.Clear(Color.FromArgb(0x0D, 0x0F, 0x12));

        using var mark = Render(height, Variant.Tile);
        graphics.DrawImage(mark, 0, 0, height, height);

        using var font = new Font("Segoe UI", 96f, FontStyle.Regular, GraphicsUnit.Pixel);
        using var text = new SolidBrush(Ink);
        graphics.DrawString("TRACE", font, text, height + 40f, 62f);

        using var tagline = new Font("Segoe UI", 34f, FontStyle.Regular, GraphicsUnit.Pixel);
        using var taglineBrush = new SolidBrush(InkDim);
        graphics.DrawString("Your computer, remembered.", tagline, taglineBrush, height + 46f, 168f);

        return bitmap;
    }

    /// <summary>
    /// Renders the small sizes at 1:1 and magnified, on a taskbar-like ground.
    /// Anti-aliasing is what breaks a mark at 16 pixels, and it cannot be judged
    /// from the 256 version.
    /// </summary>
    private static Bitmap RenderPreview()
    {
        int[] sizes = [16, 20, 24, 32];
        (Variant Variant, string Label)[] variants =
        [
            (Variant.TrayActive, "tray · tracking"),
            (Variant.TrayPaused, "tray · paused"),
            (Variant.Tile, "app icon"),
        ];

        const int scale = 6;
        const int cell = 32 * scale;
        const int padding = 28;

        var width = padding + (sizes.Length * (cell + padding));
        var height = padding + (variants.Length * (cell + padding + 24));

        var bitmap = new Bitmap(width, height, PixelFormat.Format32bppArgb);
        using var graphics = Graphics.FromImage(bitmap);
        graphics.Clear(Color.FromArgb(0x20, 0x20, 0x20)); // a Windows 11 taskbar
        graphics.InterpolationMode = InterpolationMode.NearestNeighbor;
        graphics.PixelOffsetMode = PixelOffsetMode.Half;

        using var label = new Font("Segoe UI", 15f, FontStyle.Regular, GraphicsUnit.Pixel);
        using var labelBrush = new SolidBrush(Color.FromArgb(0x8B, 0x90, 0x99));

        var y = padding;

        foreach (var (variant, text) in variants)
        {
            var x = padding;

            foreach (var size in sizes)
            {
                using var icon = Render(size, variant);
                var drawn = size * scale;
                graphics.DrawImage(icon, x, y, drawn, drawn);
                graphics.DrawString($"{size}px", label, labelBrush, x, y + cell + 2);
                x += cell + padding;
            }

            graphics.DrawString(text, label, labelBrush, padding, y + cell + 2 + 18);
            y += cell + padding + 24;
        }

        return bitmap;
    }

    private static GraphicsPath RoundedRect(float x, float y, float width, float height, float radius)
    {
        radius = Math.Min(radius, Math.Min(width, height) / 2f);
        var path = new GraphicsPath();

        if (radius <= 0.5f)
        {
            path.AddRectangle(new RectangleF(x, y, width, height));
            return path;
        }

        var diameter = radius * 2f;
        path.AddArc(x, y, diameter, diameter, 180, 90);
        path.AddArc(x + width - diameter, y, diameter, diameter, 270, 90);
        path.AddArc(x + width - diameter, y + height - diameter, diameter, diameter, 0, 90);
        path.AddArc(x, y + height - diameter, diameter, diameter, 90, 90);
        path.CloseFigure();

        return path;
    }

    private static void WritePng(string path, Bitmap bitmap)
    {
        using (bitmap)
        {
            bitmap.Save(path, ImageFormat.Png);
        }

        Console.WriteLine($"  {Path.GetFileName(path)}");
    }

    /// <summary>
    /// Writes a multi-resolution .ico.
    ///
    /// Each entry is a PNG, which Windows has supported inside .ico since Vista.
    /// Storing the small sizes as PNG rather than DIB avoids hand-rolling the
    /// AND mask, and keeps the alpha channel exact — which matters for a tray
    /// icon composited onto an unknown taskbar colour.
    /// </summary>
    private static void WriteIco(string path, Func<int, Bitmap> render)
    {
        int[] sizes = [16, 20, 24, 32, 40, 48, 64, 128, 256];

        var images = new List<byte[]>();
        foreach (var size in sizes)
        {
            using var bitmap = render(size);
            using var buffer = new MemoryStream();
            bitmap.Save(buffer, ImageFormat.Png);
            images.Add(buffer.ToArray());
        }

        using var file = File.Create(path);
        using var writer = new BinaryWriter(file);

        writer.Write((short)0); // reserved
        writer.Write((short)1); // 1 = icon
        writer.Write((short)sizes.Length);

        var offset = 6 + (16 * sizes.Length);

        for (var i = 0; i < sizes.Length; i++)
        {
            // 256 is encoded as 0 in a single byte.
            writer.Write((byte)(sizes[i] >= 256 ? 0 : sizes[i]));
            writer.Write((byte)(sizes[i] >= 256 ? 0 : sizes[i]));
            writer.Write((byte)0); // palette size
            writer.Write((byte)0); // reserved
            writer.Write((short)1); // colour planes
            writer.Write((short)32); // bits per pixel
            writer.Write(images[i].Length);
            writer.Write(offset);

            offset += images[i].Length;
        }

        foreach (var image in images)
        {
            writer.Write(image);
        }

        Console.WriteLine($"  {Path.GetFileName(path)} ({sizes.Length} sizes)");
    }
}
