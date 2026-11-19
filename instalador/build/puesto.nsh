!include "nsDialogs.nsh"
!include "LogicLib.nsh"
!include "WinMessages.nsh"

!ifndef BUILD_UNINSTALLER
  Var PollingStartupCheckbox
  Var PollingStartupState

  !macro customWelcomePage
    Page custom PollingStartupPage PollingStartupPageLeave
  !macroend

  Function PollingStartupPage
    nsDialogs::Create 1018
    Pop $0
    ${If} $0 == error
      Abort
    ${EndIf}
    ${NSD_CreateLabel} 0 0 100% 24u "Opciones del Municipio Escolar – Puesto de votación"
    Pop $0
    ${NSD_CreateCheckbox} 0 32u 100% 20u "Iniciar el puesto al iniciar sesión en Windows"
    Pop $PollingStartupCheckbox
    nsDialogs::Show
  FunctionEnd

  Function PollingStartupPageLeave
    ${NSD_GetState} $PollingStartupCheckbox $PollingStartupState
  FunctionEnd
!endif

!macro customInstall
  ${If} $PollingStartupState == ${BST_CHECKED}
    WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "MunicipioEscolarPuesto" "$\"$INSTDIR\${APP_EXECUTABLE_FILENAME}$\""
  ${Else}
    DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "MunicipioEscolarPuesto"
  ${EndIf}
!macroend

!macro customUnInstall
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "MunicipioEscolarPuesto"
!macroend
