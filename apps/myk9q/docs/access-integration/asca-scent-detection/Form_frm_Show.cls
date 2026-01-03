VERSION 1.0 CLASS
BEGIN
  MultiUse = -1  'True
END
Attribute VB_Name = "Form_frm_Show"
Attribute VB_GlobalNameSpace = False
Attribute VB_Creatable = True
Attribute VB_PredeclaredId = True
Attribute VB_Exposed = False
Option Compare Database
Option Explicit

Private Sub cmdDeleteShow_Click()
          Dim iShowID As Integer, iTrialID As Integer, intClassID As Integer, iResponse As Integer, intCount As Integer, i As Integer, ii As Integer
          Dim strSQL As String
          Dim db As DAO.Database
          Dim rsRun As DAO.Recordset
          Dim rstrTrial As DAO.Recordset
          
14750     Set db = CurrentDb
          
14760     iResponse = MsgBox("All Entries, Classesand Trials in this Show and the Show will be deleted. This cannot be undone." & vbCr & vbCr & "Do you wish to continue?", vbYesNo + vbQuestion, "Continue")

14770     If iResponse = vbYes Then
14780         DoCmd.SetWarnings False
14790         iShowID = Me.txtShowID
              
              'Get All Trial IDs
14800         strSQL = "SELECT tbl_Trial.ShowID_FK, tbl_Trial.trialID FROM tbl_Trial WHERE (((tbl_Trial.ShowID_FK)=" & iShowID & "));"
              
14810         Set rstrTrial = db.OpenRecordset(strSQL)
                

14820         If Not rstrTrial.BOF And Not rstrTrial.EOF Then
14830             rstrTrial.MoveLast
14840             rstrTrial.MoveFirst
14850             intCount = rstrTrial.RecordCount
                  
                  'Loop and delete Trials
14860             For i = 1 To intCount
14870                 iTrialID = rstrTrial!trialID
                      
                      'Get All Run IDs
14880                 strSQL = "SELECT tbl_Class.TrialID_FK, tbl_Class.ClassID FROM tbl_Class WHERE (((tbl_Class.TrialID_FK)=" & iTrialID & "));"
14890                 Set db = CurrentDb
14900                 Set rsRun = db.OpenRecordset(strSQL)
              
14910                 If Not rsRun.BOF And Not rsRun.EOF Then
14920                     rsRun.MoveLast
14930                     rsRun.MoveFirst
14940                     intCount = rsRun.RecordCount
                          
                          'Loop and delete entries and runs
14950                     For ii = 1 To intCount
14960                         intClassID = rsRun!classID
14970                         Call DeleteEntriesClass(intClassID)
14980                         Call DeleteClass(intClassID)
14990                         rsRun.MoveNext
15000                     Next
15010                 End If
                      
15020                 Call DeleteTrial(iTrialID)
15030                 rstrTrial.MoveNext
15040             Next
15050         End If
              
15060         Call DeleteShow(iShowID)
15070         DoCmd.SetWarnings True
15080         MsgBox "All Entries, Classesand Trials in this Show and the Show have been deleted.", vbInformation, "Deleted"
15090     End If
End Sub

Private Sub cmdActivateKey_Click()
38010     On Error GoTo Activate_Error

          Dim strAction As String, strKey As String, strClubname As String, strProduct As String
          Dim dExpDate As Date, iClubID As Integer
          Dim strNote As String
          Dim iShowID As Long ' Use Long for IDs for safety
          
38020     DoCmd.RunCommand acCmdSaveRecord
          
38030     iClubID = Me.ClubID_FK
38040     iShowID = Me.showID ' Get the showID from the current form record
38050     strKey = Nz(Me.MobileAppLicKey, "NONE")
          
38060     If strKey = "" Or strKey = "NONE" Then
38070         MsgBox "Enter a valid License Key and try again.", vbCritical, "License Key Not Valid"
38080     Else
              ' --- License Activation (unchanged) ---
38090         strAction = "activate"
38100         strProduct = "myK9Q"
38110         strClubname = DLookup("ASCAClubName", "tbl_Club", "clubID = " & iClubID)
38120         strClubname = strClubname & "-" & Me.StartDate
              
              ' Assuming WebRequest is a function you have that returns the status string
38130         Me.txtMobileAppLicKeyStatus = WebRequest(strAction, strProduct, strKey, strClubname, dExpDate)
38140         MsgBox Me.txtMobileAppLicKeyStatus, vbInformation, "License Status"
              
              ' Optionally, re-check the status
38150         strAction = "status-check"
38160         Me.txtMobileAppLicKeyStatus = WebRequest(strAction, strProduct, strKey, strClubname, dExpDate)
38170     End If

          ' --- REFACTORED: Use the API to sync the show record ---
38180     If InStr(Me.txtMobileAppLicKeyStatus, "License key is Active") Then
              
              ' 1. Get the cleaned note field, just like the old code did.
              '    Using iShowID which we captured at the top.
38190         strNote = Nz(DLookup("note", "tbl_show", "showID = " & iShowID), " ")
38200         strNote = Replace(strNote, "<div>", "")
38210         strNote = Replace(strNote, "</div>", "")
                                          
              ' 2. Call our robust, existing API sync function.
              '    This single line replaces the entire old strSQL and DoCmd.RunSQL block.
38220         Call SyncShowViaAPI_ASCA_v3(iShowID, strNote)
              'Call SyncShowViaAPI(iShowID, strNote)
                      
              ' 3. Save the main record on the form again to ensure status is saved.
38230         DoCmd.RunCommand acCmdSaveRecord
              
38240         MsgBox "Show information has been successfully synced to myK9Q.", vbInformation, "Sync Complete"
              
38250     End If

38260     Exit Sub

Activate_Error:
38270     MsgBox "An error occurred during key activation: " & vbCrLf & Err.Description, vbCritical
End Sub

Private Sub cmdPrintFlyer_Click()
15360     DoCmd.OpenForm "frm_myK9QFlyer_Dialog"
End Sub

Private Sub eventurl_AfterUpdate()
15370   DoCmd.RunCommand acCmdSaveRecord
End Sub

Private Sub Form_Current()

      'Dim iShowID As Integer
      'Dim iClubID As Integer

        'Get Show ID
        'Debug.Print Forms![frm_Show]![txtShowID].Value
15380   TempVars.Add "tmpShowID", Forms![frm_Show]![txtShowID].Value
15390   TempVars.Add "tmpMobileAppLicKey", Forms![frm_Show]![txtMobileAppLicKey].Value
End Sub

Private Sub Form_Load()
15400     On Error Resume Next
15410     Me.SplitFormSize = Nz(DLookup("ShowSplitFormSize", "tbl_Preferences"), 22155)
15420     DoCmd.GoToRecord acDataForm, "frm_Show", acGoTo, 1
End Sub

