; Windows uninstall (Settings -> Apps -> Capital Kranti -> Uninstall): the
; same clean-up as the Mac's in-app Uninstall. The paper's archive (past
; issues, settings, the AI key) is kept unless the editor says otherwise, so a
; reinstall picks it up again.

!macro customUnInstall
  ; the app and its engine, if still running
  nsExec::Exec 'taskkill /IM "Capital Kranti.exe" /T /F'
  ; the evening wake task and log-in start
  nsExec::Exec 'schtasks /Delete /TN "Capital Kranti (wake)" /F'
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "in.capitalkranti.newsroom"
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "electron.app.Capital Kranti"
  ${ifNot} ${isUpdated}
    MessageBox MB_YESNO|MB_ICONQUESTION "Keep the paper's archive (past issues and settings) to use again later?$\r$\n$\r$\nChoose No to remove everything." /SD IDYES IDYES keep
      RMDir /r "$APPDATA\Capital Kranti"
    keep:
  ${endIf}
!macroend
