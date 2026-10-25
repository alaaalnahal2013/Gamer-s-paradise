using System;
using System.Diagnostics;
using System.IO;

public class Launcher {
    public static void Main(string[] args) {
        string dir = AppDomain.CurrentDomain.BaseDirectory;
        string pyw = Path.Combine(dir, ".venv", "Scripts", "pythonw.exe");
        string script = Path.Combine(dir, "app_desktop.py");
        string distExe = Path.Combine(dir, "dist", "Gamer's paradise", "Gamer's paradise.exe");
        
        ProcessStartInfo psi = null;
        if (File.Exists(pyw) && File.Exists(script)) {
            psi = new ProcessStartInfo(pyw, "\"" + script + "\"");
        } else if (File.Exists(distExe)) {
            psi = new ProcessStartInfo(distExe);
        } else {
            psi = new ProcessStartInfo("cmd.exe", "/c start http://127.0.0.1:8000");
        }
        
        psi.WorkingDirectory = dir;
        psi.UseShellExecute = true;
        try {
            Process.Start(psi);
        } catch (Exception) { }
    }
}
