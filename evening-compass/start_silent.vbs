' Invisible Background Launcher for Seneca Bot
Set WshShell = CreateObject("WScript.Shell")
WshShell.CurrentDirectory = "c:\Users\Андрей\.cursor\психотип и анализ себя\evening-compass"
WshShell.Run "node bot.js", 0, False
