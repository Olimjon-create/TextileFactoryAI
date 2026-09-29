' TextileCore - qo'riqchini oynasiz ishga tushiradi. "open" argumenti bilan - tayyor bo'lgach brauzerni ham ochadi.
Set sh = CreateObject("WScript.Shell")
dir = CreateObject("Scripting.FileSystemObject").GetParentFolderName(WScript.ScriptFullName)
extra = ""
If WScript.Arguments.Count > 0 Then
  If LCase(WScript.Arguments(0)) = "open" Then extra = " -OpenBrowser"
End If
sh.Run "powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File """ & dir & "\supervisor.ps1""" & extra, 0, False
