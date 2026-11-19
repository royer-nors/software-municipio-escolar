!include "nsDialogs.nsh"
!include "LogicLib.nsh"
!include "WinMessages.nsh"

!ifndef BUILD_UNINSTALLER
  Var ServerStartupCheckbox
  Var ServerStartupState

  !macro customWelcomePage
    Page custom ServerStartupPage ServerStartupPageLeave
  !macroend

  Function ServerStartupPage
    nsDialogs::Create 1018
    Pop $0
    ${If} $0 == error
      Abort
    ${EndIf}
    ${NSD_CreateLabel} 0 0 100% 24u "Opciones del Municipio Escolar Servidor"
    Pop $0
    ${NSD_CreateCheckbox} 0 32u 100% 20u "Iniciar el servidor al iniciar sesión en Windows"
    Pop $ServerStartupCheckbox
    nsDialogs::Show
  FunctionEnd

  Function ServerStartupPageLeave
    ${NSD_GetState} $ServerStartupCheckbox $ServerStartupState
  FunctionEnd
!endif

!macro customInstall
  ${If} $ServerStartupState == ${BST_CHECKED}
    WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "MunicipioEscolarServidor" "$\"$INSTDIR\${APP_EXECUTABLE_FILENAME}$\""
  ${Else}
    DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "MunicipioEscolarServidor"
  ${EndIf}
  nsExec::ExecToLog '"$SYSDIR\netsh.exe" advfirewall firewall delete rule name="Municipio Escolar Servidor TCP 3000"'
  Pop $0
  nsExec::ExecToLog '"$SYSDIR\netsh.exe" advfirewall firewall add rule name="Municipio Escolar Servidor TCP 3000" dir=in action=allow protocol=TCP localport=3000 profile=private'
  Pop $0
  ${If} $0 != 0
    MessageBox MB_ICONEXCLAMATION|MB_OK "No se pudo crear automáticamente la regla del Firewall. Permite la entrada TCP por el puerto 3000 en el perfil Privado de Windows."
  ${EndIf}
!macroend

!macro customUnInstall
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "MunicipioEscolarServidor"
  nsExec::ExecToLog '"$SYSDIR\netsh.exe" advfirewall firewall delete rule name="Municipio Escolar Servidor TCP 3000"'
  Pop $0
!macroend
