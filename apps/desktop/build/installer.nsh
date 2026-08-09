; Trace installer customisations.
;
; Two things the default installer cannot know about: the tracker is a separate
; process that must be stopped before its files are replaced or removed, and the
; user's activity history is theirs to keep or destroy — never something to
; delete or preserve by surprise (DOCS/Privacy.md §23).

!macro StopTracker
  ; The tracker has no window to close, so there is nothing gentler to send it.
  ; A hard stop is safe: an unclean exit is a case Trace already handles, and on
  ; next start it closes the interrupted session at the last heartbeat rather
  ; than inventing time.
  nsExec::Exec 'taskkill /IM TraceTracker.exe /F'
  Sleep 500
!macroend

!macro RemoveStartupEntry
  ; Written by the tracker when the user enables "Start with Windows". Leaving
  ; it behind would point at a deleted executable at every sign-in.
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "Trace"
!macroend

; --- install -----------------------------------------------------------------

!macro customInit
  !insertmacro StopTracker
!macroend

; --- uninstall ---------------------------------------------------------------

!macro customUnInit
  !insertmacro StopTracker
!macroend

!macro customUnInstall
  !insertmacro RemoveStartupEntry

  ${ifNot} ${isUpdated}
    ; Only ask on a real uninstall. During an update the history must survive
    ; untouched (DOCS/Windows Integration §29-30).
    MessageBox MB_YESNO|MB_ICONQUESTION \
      "Delete your Trace activity history from this computer?$\r$\n$\r$\n\
      Your history is stored at:$\r$\n\
      $LOCALAPPDATA\Trace$\r$\n$\r$\n\
      Choosing No leaves it there, so you can back it up or remove it yourself \
      later. This cannot be undone." \
      /SD IDNO IDYES deleteData IDNO keepData

    deleteData:
      RMDir /r "$LOCALAPPDATA\Trace"
      Goto dataDone

    keepData:
      ; Deliberately nothing. The user's data is the user's.

    dataDone:
  ${endIf}
!macroend
