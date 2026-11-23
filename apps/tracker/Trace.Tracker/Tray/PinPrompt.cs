using System.Windows.Forms;

namespace Trace.Tracker.Tray;

/// <summary>
/// Asks for the Trace PIN when Pause or Quit is chosen from the tray, so those
/// work with the dashboard closed. Native chrome, like the tray menu itself.
/// </summary>
internal static class PinPrompt
{
    /// <param name="action">Finishes "Enter your Trace PIN to …".</param>
    /// <param name="check">Returns null when the PIN unlocks Trace, otherwise the message to show.</param>
    /// <returns>True once unlocked; false if cancelled.</returns>
    public static bool Ask(string action, Func<string, string?> check)
    {
        using var form = new Form
        {
            Text = "Trace",
            FormBorderStyle = FormBorderStyle.FixedDialog,
            StartPosition = FormStartPosition.CenterScreen,
            MinimizeBox = false,
            MaximizeBox = false,
            ShowInTaskbar = true,
            TopMost = true,
            AutoScaleMode = AutoScaleMode.Dpi,
            AutoSize = true,
            AutoSizeMode = AutoSizeMode.GrowAndShrink,
            Padding = new Padding(16),
        };

        var layout = new TableLayoutPanel { AutoSize = true, ColumnCount = 1, Dock = DockStyle.Fill };
        var heading = new Label
        {
            Text = $"Enter your Trace PIN to {action}.",
            AutoSize = true,
            MaximumSize = new Size(360, 0),
            Margin = new Padding(0, 0, 0, 10),
        };
        var input = new TextBox { UseSystemPasswordChar = true, Width = 300, MaxLength = 32 };
        var hint = new Label
        {
            Text = "Or type your recovery code.",
            AutoSize = true,
            ForeColor = SystemColors.GrayText,
            Margin = new Padding(0, 4, 0, 0),
        };
        var error = new Label
        {
            AutoSize = true,
            MaximumSize = new Size(360, 0),
            ForeColor = Color.Firebrick,
            Margin = new Padding(0, 8, 0, 0),
            Visible = false,
        };
        var ok = new Button { Text = "Unlock", AutoSize = true };
        var cancel = new Button { Text = "Cancel", AutoSize = true, DialogResult = DialogResult.Cancel };
        var buttons = new FlowLayoutPanel
        {
            FlowDirection = FlowDirection.RightToLeft,
            AutoSize = true,
            Dock = DockStyle.Fill,
            Margin = new Padding(0, 14, 0, 0),
        };
        buttons.Controls.AddRange([cancel, ok]);
        layout.Controls.AddRange([heading, input, hint, error, buttons]);
        form.Controls.Add(layout);
        form.AcceptButton = ok;
        form.CancelButton = cancel;

        var unlocked = false;
        ok.Click += (_, _) =>
        {
            var problem = check(input.Text);
            if (problem is null)
            {
                unlocked = true;
                form.DialogResult = DialogResult.OK;
                return;
            }

            error.Text = problem;
            error.Visible = true;
            input.SelectAll();
            input.Focus();
        };

        form.Shown += (_, _) =>
        {
            form.Activate();
            input.Focus();
        };
        form.ShowDialog();
        return unlocked;
    }
}
