Attribute VB_Name = "mod_myK9Qv3_ASCA"
Option Compare Database
Option Explicit

' ==========================================================================
' mod_myK9Qv3_ASCA - myK9Q v3 API Integration Module for ASCA Scent Detection
' ==========================================================================
'
' This module is based on the AKC Scent Work v3 module (mod_myK9Qv3.bas)
' and adapted for ASCA Scent Detection trials.
'
' REQUIRED DEPENDENCIES:
' ----------------------
' 1. mod_Global.bas - Must contain:
'    - SUPABASE_URL_2 (Public Const) - myK9Q v3 Supabase project URL
'    - SUPABASE_KEY_2 (Public Const) - myK9Q v3 Supabase anon key
'    - JsonSafe(str) - JSON string escaping function
'    - ParseSupabaseDate(dateString) - Parses Supabase timestamps
'    - FormatTimeValue(timeValue) - Formats time as MM:SS
'
' 2. mod_License.bas - Must contain:
'    - CheckInternetConnectivity() - Returns True if internet is available
'    - myK9Q_License_Status(iShowID, strClubname) - License validation function
'    - WebRequest(strAction, strProduct, strKey, strClubname, dExpDate) - API call
'
' 3. JsonConverter.bas - VBA-JSON parser (ParseJson function)
'    Download from: https://github.com/VBA-tools/VBA-JSON
'
' 4. dlg_ScoredEntriesWarning form - For scored entries protection dialogs
'    (Optional - this module uses simple MsgBox dialogs as fallback)
'
' REQUIRED FORM: dlg_ScoredEntriesWarning
' ----------------------------------------
' This module requires a custom form named "dlg_ScoredEntriesWarning" for
' displaying scored entries warnings with clear button labels.
'
' Form Requirements:
'   - Name: dlg_ScoredEntriesWarning
'   - Pop Up: Yes, Modal: Yes, Border Style: Dialog
'   - Public variable: ReturnValue As Integer
'   - Controls: lblClassName (Label), txtEntryList (TextBox), lblTitle (Label),
'               lblMessage (Label), btnCancel, btnKeepScores, btnOverwrite (Command Buttons)
'   - Button handlers set ReturnValue (0=Cancel, 1=Keep, 2=Overwrite)
'     and use Me.Visible = False (NOT DoCmd.Close)
'
' KEY DIFFERENCES FROM AKC MODULE:
' --------------------------------
' - Organization field = "ASCA Scent Detection" (instead of "AKC Scent Work")
' - Club name field = txtASCAClubName (instead of txtAKCClubName)
' - ASCA-specific time limits apply (Novice 2:30, Open 3:00, etc.)
' - ASCA-specific NQ/EX reasons supported
'
' See docs/access-integration/README.md for setup instructions.
'
' ==========================================================================
' === CORE UPLOAD AND DELETE ROUTINES
' ==========================================================================

Public Sub myK9Q_Upload_ASCA_v3(strCalledBy As String)
41210     On Error GoTo myK9Q_Upload_Error

          Dim iShowID As Long, iTrialID As Long, iClassID As Long

          ' Initial setup - Auto-detect context from active form if strCalledBy is empty
          Dim strFormName As String
41215     On Error Resume Next
41216     strFormName = Screen.ActiveForm.Name
41217     On Error GoTo myK9Q_Upload_Error

          ' Auto-detect if parameter wasn't passed (ribbon context)
          If strCalledBy = "" Then
              If InStr(1, strFormName, "Trial", vbTextCompare) > 0 Then
                  strCalledBy = "Trial"
              ElseIf InStr(1, strFormName, "Class", vbTextCompare) > 0 Then
                  strCalledBy = "Class"
              End If
          End If

41220     If strCalledBy = "Trial" Then
41225         ' Try multiple ways to get TrialID from the active form
41230         On Error Resume Next
41231         iTrialID = Nz(Screen.ActiveForm!trialID, 0)
41232         If iTrialID = 0 Then iTrialID = Nz(Screen.ActiveForm!txtTrialID, 0)
41233         If iTrialID = 0 Then iTrialID = Nz(Screen.ActiveForm.txtTrialID, 0)
41234         On Error GoTo myK9Q_Upload_Error
41235         ' Get ShowID from tbl_Trial using TrialID
41240         iShowID = Nz(DLookup("ShowID_FK", "tbl_Trial", "TrialID = " & iTrialID), 0)
41250     ElseIf strCalledBy = "Class" Then
41255         On Error Resume Next
41260         iClassID = Nz(Screen.ActiveForm!classID, 0)
41261         If iClassID = 0 Then iClassID = Nz(Screen.ActiveForm!txtClassID, 0)
41265         iTrialID = Nz(Screen.ActiveForm!trialID, 0)
41266         If iTrialID = 0 Then iTrialID = Nz(Screen.ActiveForm!txtTrialID, 0)
41267         On Error GoTo myK9Q_Upload_Error
41270         ' Get ShowID from tbl_Trial using TrialID
41280         iShowID = Nz(DLookup("ShowID_FK", "tbl_Trial", "TrialID = " & iTrialID), 0)
41290     End If

          ' License Check - trust the stored status (same as UpdateShowDetails)
          Dim strmyK9Q As String
41300     strmyK9Q = Nz(DLookup("MobileAppLicKeyStatus", "tbl_Show", "showID = " & iShowID), "")
41310     If InStr(1, strmyK9Q, "Active and Valid", vbTextCompare) = 0 And _
             InStr(1, strmyK9Q, "activated", vbTextCompare) = 0 Then
41320         MsgBox "Unable to Upload data without a Valid myK9Q License Key." & vbCrLf & vbCrLf & _
                   "ShowID: " & iShowID & vbCrLf & _
                   "Current Status: [" & strmyK9Q & "]" & vbCrLf & vbCrLf & _
                   "Use 'Activate Key' to activate your license, then try again.", vbInformation, "myK9Q License Key"
41330         Exit Sub
41340     End If

          ' ==========================================================
          ' SCORED ENTRIES PROTECTION CHECK
          ' ==========================================================
          Dim strScoredList As String
          Dim intUserChoice As Integer
          Dim lngUnlocked As Long
          Dim blnOverwriteScores As Boolean
          blnOverwriteScores = False  ' Default: protect existing scores

          If strCalledBy = "Trial" Then
              ' TRIAL-LEVEL CHECK: Check ALL classes in the trial
              strScoredList = CheckScoredEntriesForTrial_ASCA_v3(iShowID, iTrialID)

              If strScoredList <> "" Then
                  intUserChoice = ShowTrialScoredEntriesWarning(strScoredList)

                  Select Case intUserChoice
                      Case vbAbort   ' Cancel
                          MsgBox "Upload cancelled.", vbInformation, "Upload Cancelled"
                          Exit Sub

                      Case vbIgnore  ' Upload Anyway (scores protected)
                          ' Continue - database trigger will protect scores

                      Case vbRetry   ' Unlock & Overwrite
                          lngUnlocked = UnlockTrialForReupload_ASCA_v3(iShowID, iTrialID)
                          blnOverwriteScores = True  ' Flag to reset scores in entry upload
                          MsgBox lngUnlocked & " entries unlocked for overwrite." & vbCrLf & _
                                 "Scores CAN now be overwritten.", vbExclamation, "Entries Unlocked"
                  End Select
              End If

          ElseIf strCalledBy = "Class" Then
              ' CLASS-LEVEL CHECK: Check just this class
              strScoredList = CheckScoredEntries_ASCA_v3(iShowID, iClassID)

              If strScoredList <> "" Then
                  Dim strClassName As String
                  strClassName = Nz(DLookup("Element", "tbl_Class", "classID = " & iClassID), "") & " " & _
                                 Nz(DLookup("Level", "tbl_Class", "classID = " & iClassID), "")

                  intUserChoice = ShowScoredEntriesWarning(strScoredList, strClassName)

                  Select Case intUserChoice
                      Case vbAbort   ' Cancel
                          MsgBox "Upload cancelled.", vbInformation, "Upload Cancelled"
                          Exit Sub

                      Case vbIgnore  ' Upload Anyway (scores protected)
                          ' Continue - database trigger will protect scores

                      Case vbRetry   ' Unlock & Overwrite
                          lngUnlocked = UnlockClassForReupload_ASCA_v3(iShowID, iClassID)
                          blnOverwriteScores = True  ' Flag to reset scores in entry upload
                          MsgBox lngUnlocked & " entries unlocked for overwrite." & vbCrLf & _
                                 "Scores CAN now be overwritten.", vbExclamation, "Entries Unlocked"
                  End Select
              End If
          End If
          ' ==========================================================
          ' END SCORED ENTRIES PROTECTION CHECK
          ' ==========================================================

41350     DoCmd.OpenForm "frm_Progress_myK9Q", acNormal

          ' UPLOAD SHOW
41360     Forms!frm_Progress_myK9Q.lblCurrentTask.Caption = "Uploading Show ID: " & iShowID
41370     Forms!frm_Progress_myK9Q.Repaint
          Dim strNote As String
41380     strNote = Nz(DLookup("note", "tbl_show", "showID = " & iShowID), " ")
41390     strNote = Replace(strNote, "<div>", "")
41400     strNote = Replace(strNote, "</div>", "")
41410     Call SyncShowViaAPI_ASCA_v3(iShowID, strNote)

          ' UPLOAD TRIALS
41420     Forms!frm_Progress_myK9Q.lblCurrentTask.Caption = "Uploading Trial ID: " & iTrialID
41430     Forms!frm_Progress_myK9Q.Repaint
41440     Call SyncTrialsViaAPI_ASCA_v3(iTrialID, iShowID)

          ' UPLOAD CLASSES
41450     If strCalledBy = "Class" Then
41460         Forms!frm_Progress_myK9Q.lblCurrentTask.Caption = "Uploading Class ID: " & iClassID
41470         Forms!frm_Progress_myK9Q.Repaint
41480         Call SyncClassesViaAPI_ASCA_v3(iTrialID, iShowID, iClassID)
41490     Else
41500         Forms!frm_Progress_myK9Q.lblCurrentTask.Caption = "Uploading all Classes for Trial ID: " & iTrialID
41510         Forms!frm_Progress_myK9Q.Repaint
41520         Call SyncClassesViaAPI_ASCA_v3(iTrialID, iShowID)
41530     End If

          ' UPLOAD ENTRIES
41540     If strCalledBy = "Class" Then
41550         Forms!frm_Progress_myK9Q.lblCurrentTask.Caption = "Uploading Entries for Class ID: " & iClassID
41560         Forms!frm_Progress_myK9Q.Repaint
41570         Call SyncEntriesViaAPI_ASCA_v3(iTrialID, iShowID, iClassID, blnOverwriteScores)
41580     Else
41590         Forms!frm_Progress_myK9Q.lblCurrentTask.Caption = "Uploading all Entries for Trial ID: " & iTrialID
41600         Forms!frm_Progress_myK9Q.Repaint
41610         Call SyncEntriesViaAPI_ASCA_v3(iTrialID, iShowID, 0, blnOverwriteScores)
41620     End If

41630     DoCmd.Close acForm, "frm_Progress_myK9Q", acSaveNo
41640     MsgBox "myK9Q v3 Upload for ASCA Scent Detection is Complete!", vbInformation, "Upload Complete"

myK9Q_Upload_Exit:
41650     Exit Sub
myK9Q_Upload_Error:
41660     DoCmd.Close acForm, "frm_Progress_myK9Q", acSaveNo
41670     MsgBox "An unexpected error occurred in myK9Q_Upload_ASCA_v3:" & vbCrLf & "Error #" & Err.Number & ": " & Err.Description, vbCritical
41680     Resume myK9Q_Upload_Exit
End Sub

Public Sub myK9QDelete_ASCA_v3(strCalledBy As String)
41690     On Error GoTo Delete_Main_Error

          Dim strMobileAppLicKey As String, filterString As String
          Dim iClassID As Long, iTrialID As Long, iShowID As Long
          Dim strResult As VbMsgBoxResult

41700     If strCalledBy = "Show" Then
41710         iShowID = Forms!frm_Show.txtShowID
41720     ElseIf strCalledBy = "Trial" Then
41730         iShowID = Forms!frm_Trial.txtShowID
41740         iTrialID = Forms!frm_Trial.txtTrialID
41750     ElseIf strCalledBy = "Class" Then
41760         iShowID = Forms!frm_Class_Main.txtShowID
41770         iTrialID = Forms!frm_Class_Main.txtTrialID
41780         iClassID = Forms!frm_Class_Main.txtClassID
41790     End If

41800     strMobileAppLicKey = Nz(DLookup("MobileAppLicKey", "tbl_Show", "showID = " & iShowID), "")
41810     If strMobileAppLicKey = "" Then Exit Sub

41820     strResult = MsgBox("Are you sure you want to delete the corresponding ASCA data from the Supabase database?", vbQuestion + vbYesNo, "Confirm Supabase Delete")
41830     If strResult = vbNo Then Exit Sub

41840     DoCmd.OpenForm "frm_Progress_myK9Q", acNormal

41850     If strCalledBy = "Show" Then
41860         filterString = "license_key=eq." & strMobileAppLicKey
41870         Call DeleteFromSupabase_ASCA_v3("shows", filterString)
41880     ElseIf strCalledBy = "Trial" Then
              Dim supaShowID As Long
41890         supaShowID = GetSupabaseShowID_ASCA_v3(strMobileAppLicKey)
41900         If supaShowID > 0 Then
41910             filterString = "show_id=eq." & supaShowID & "&access_trial_id=eq." & iTrialID
41920             Call DeleteFromSupabase_ASCA_v3("trials", filterString)
41930         End If
41940     ElseIf strCalledBy = "Class" Then
41950         filterString = "access_show_id=eq." & iShowID & "&access_class_id=eq." & iClassID
41960         Call DeleteFromSupabase_ASCA_v3("classes", filterString)
41970     End If

41980     DoCmd.Close acForm, "frm_Progress_myK9Q", acSaveNo
41990     MsgBox "ASCA Delete completed.", vbInformation

Delete_Main_Exit:
42000     Exit Sub
Delete_Main_Error:
42010     MsgBox "Error in myK9QDelete_ASCA_v3: " & Err.Description, vbCritical
42020     Resume Delete_Main_Exit
End Sub


' ==========================================================================
' === SYNC (UPLOAD) SUB-ROUTINES
' ==========================================================================

Public Sub SyncShowViaAPI_ASCA_v3(ByVal lngShowID As Long, ByVal strNote As String)
42900     On Error GoTo Error_Handler
          Dim db As DAO.Database, rs As DAO.Recordset, strSQL As String, qdf As DAO.QueryDef
          Const TABLE_NAME As String = "shows"
          Dim http As Object, json As String, recordsArray As String

42910     Set db = CurrentDb
42920     strSQL = "SELECT C.ASCAClubName, C.Website AS ClubWebsite, S.MobileAppLicKey, S.startdate, S.enddate, S.showid, S.showname, S.eventurl, " & _
                     "P1.FullName AS Secretary, P1.Email AS SecretaryEmail, P1.phone AS SecretaryPhone, " & _
                     "P2.FullName AS Chairman, P2.Email AS ChairmanEmail, P2.phone AS ChairmanPhone, " & _
                     "S.SiteName, S.SiteAddress, S.SiteCity, ST.StateName, S.SiteZip " & _
                     "INTO temp_ForShowSync FROM ((((tbl_Show AS S LEFT JOIN tbl_Club AS C ON S.ClubID_FK = C.clubID) LEFT JOIN tbl_Person AS P1 ON S.SecretaryID_FK = P1.personID) LEFT JOIN tbl_Person AS P2 ON S.ChairmanID_FK = P2.personID) LEFT JOIN tbl_State AS ST ON S.SiteStateID_FK = ST.stateID) " & _
                     "WHERE S.showID = " & lngShowID
42930     DoCmd.SetWarnings False
42940     On Error Resume Next
42950     db.Execute "DROP TABLE temp_ForShowSync"
42960     db.QueryDefs.Delete "temp_MakeShowQuery"
42970     On Error GoTo Error_Handler
42980     Set qdf = db.CreateQueryDef("temp_MakeShowQuery", strSQL)
42990     DoCmd.OpenQuery "temp_MakeShowQuery"
43000     db.QueryDefs.Delete "temp_MakeShowQuery"
43010     Set qdf = Nothing
43020     DoCmd.SetWarnings True

43030     Set rs = db.OpenRecordset("temp_ForShowSync")
43040     If rs.RecordCount = 0 Then GoTo Exit_Sub

43050     recordsArray = "["
43060     rs.MoveFirst
          ' KEY DIFFERENCE: organization = "ASCA Scent Detection"
43070     json = "{" & _
                """license_key"":""" & JsonSafe(Nz(rs!MobileAppLicKey, "")) & """," & _
                """show_name"":""" & JsonSafe(Nz(rs!ShowName, "")) & """," & _
                """club_name"":""" & JsonSafe(Nz(rs!ASCAClubName, "")) & """," & _
                """start_date"":""" & Format(Nz(rs!StartDate, Now), "yyyy-mm-dd") & """," & _
                """end_date"":""" & Format(Nz(rs!EndDate, Now), "yyyy-mm-dd") & """," & _
                """organization"":""ASCA Scent Detection""," & _
                """show_type"":""Regular""," & _
                """site_name"":""" & JsonSafe(Nz(rs!SiteName, "")) & """," & _
                """site_address"":""" & JsonSafe(Nz(rs!SiteAddress, "")) & """," & _
                """site_city"":""" & JsonSafe(Nz(rs!SiteCity, "")) & """," & _
                """site_state"":""" & JsonSafe(Nz(rs!StateName, "")) & """," & _
                """site_zip"":""" & JsonSafe(Nz(rs!SiteZip, "")) & """," & _
                """secretary_name"":""" & JsonSafe(Nz(rs!Secretary, "")) & """," & _
                """secretary_email"":""" & JsonSafe(Nz(rs!SecretaryEmail, "")) & """," & _
                """secretary_phone"":""" & JsonSafe(Nz(rs!SecretaryPhone, "")) & """," & _
                """chairman_name"":""" & JsonSafe(Nz(rs!Chairman, "")) & """," & _
                """chairman_email"":""" & JsonSafe(Nz(rs!ChairmanEmail, "")) & """," & _
                """chairman_phone"":""" & JsonSafe(Nz(rs!ChairmanPhone, "")) & """," & _
                """event_url"":""" & JsonSafe(Nz(rs!eventurl, "")) & """," & _
                """website"":""" & JsonSafe(Nz(rs!ClubWebsite, "")) & """," & _
                """notes"":""" & JsonSafe(strNote) & """" & _
            "}"
43080     recordsArray = recordsArray & json & "]"
43090     rs.Close

43100     Set http = CreateObject("MSXML2.ServerXMLHttp.6.0")
43110     http.Open "POST", SUPABASE_URL_2 & "/rest/v1/" & TABLE_NAME & "?on_conflict=license_key", False
43120     http.setRequestHeader "apikey", SUPABASE_KEY_2
43130     http.setRequestHeader "Authorization", "Bearer " & SUPABASE_KEY_2
43140     http.setRequestHeader "Content-Type", "application/json"
43150     http.setRequestHeader "Prefer", "resolution=merge-duplicates"
43160     http.send recordsArray
43170     If http.Status < 200 Or http.Status >= 300 Then MsgBox "API Error (ASCA Show): " & http.Status & " - " & http.responseText, vbCritical
43180     Set http = Nothing
Exit_Sub:
43190     On Error Resume Next
43200     db.Execute "DROP TABLE temp_ForShowSync"
43210     db.QueryDefs.Delete "temp_MakeShowQuery"
43220     Set db = Nothing: Set rs = Nothing: Set http = Nothing: Set qdf = Nothing
43230     Exit Sub
Error_Handler:
43240     MsgBox "Error in SyncShowViaAPI_ASCA_v3: " & Err.Description, vbCritical
43250     Resume Exit_Sub
End Sub

Private Sub SyncTrialsViaAPI_ASCA_v3(ByVal lngTrialID As Long, ByVal lngShowID As Long)
43260     On Error GoTo Error_Handler
          Dim db As DAO.Database, rs As DAO.Recordset, strSQL As String
          Const TABLE_NAME As String = "trials"
          Dim http As Object, json As String, recordsArray As String
          Dim supaShowID As Long, strLicenseKey As String

43270     strLicenseKey = Nz(DLookup("MobileAppLicKey", "tbl_Show", "ShowID = " & lngShowID), "")
43280     supaShowID = GetSupabaseShowID_ASCA_v3(strLicenseKey)
43290     If supaShowID = 0 Then GoTo Exit_Sub

43300     Set db = CurrentDb
43310     strSQL = "SELECT T.TrialName, T.trial_long_date, T.TrialNumber, T.trialID, T.TrialType FROM tbl_Trial AS T WHERE T.trialID = " & lngTrialID
43320     Set rs = db.OpenRecordset(strSQL, dbOpenSnapshot)
43330     If rs.EOF Then GoTo Exit_Sub

43340     rs.MoveFirst
43350     recordsArray = "["
43360     json = "{" & _
                    """show_id"": " & supaShowID & "," & _
                    """trial_name"": """ & JsonSafe(Nz(rs!TrialName, "")) & """," & _
                    """trial_date"": """ & Format(GetDateFromString(rs!trial_long_date), "yyyy-mm-dd") & """," & _
                    """trial_number"": " & ExtractNumber(rs!TrialNumber) & "," & _
                    """trial_type"": """ & JsonSafe(Nz(rs!TrialType, "")) & """," & _
                    """access_trial_id"": " & Nz(rs!trialID, 0) & "" & _
                "}"
43370     recordsArray = recordsArray & json & "]"
43380     rs.Close

43390     Set http = CreateObject("MSXML2.ServerXMLHttp.6.0")
43400     http.Open "POST", SUPABASE_URL_2 & "/rest/v1/" & TABLE_NAME & "?on_conflict=show_id,trial_number,trial_date", False
43410     http.setRequestHeader "apikey", SUPABASE_KEY_2
43420     http.setRequestHeader "Authorization", "Bearer " & SUPABASE_KEY_2
43430     http.setRequestHeader "Content-Type", "application/json"
43440     http.setRequestHeader "Prefer", "resolution=merge-duplicates"
43450     http.send recordsArray
43460     If http.Status < 200 Or http.Status >= 300 Then MsgBox "API Error (ASCA Trial): " & http.Status & " - " & http.responseText, vbCritical
43470     Set http = Nothing
Exit_Sub:
43480     Set db = Nothing: Set rs = Nothing: Set http = Nothing
43490     Exit Sub
Error_Handler:
43500     MsgBox "Error in SyncTrialsViaAPI_ASCA_v3: " & Err.Description, vbCritical
43510     Resume Exit_Sub
End Sub

Private Sub SyncClassesViaAPI_ASCA_v3(ByVal lngTrialID As Long, ByVal lngShowID As Long, Optional ByVal lngClassID As Long = 0)
43520     On Error GoTo Error_Handler
          Dim db As DAO.Database, rs As DAO.Recordset, strSQL As String
          Const TABLE_NAME As String = "classes"
          Dim http As Object, json As String, recordsArray As String
          Dim supaTrialID As Long, strLicenseKey As String, filterClause As String

43530     strLicenseKey = Nz(DLookup("MobileAppLicKey", "tbl_Show", "showID = " & lngShowID), "")
43540     supaTrialID = GetSupabaseTrialID_ASCA_v3(strLicenseKey, lngTrialID)
43550     If supaTrialID = 0 Then GoTo Exit_Sub

43560     If lngClassID > 0 Then filterClause = "C.classID = " & lngClassID Else filterClause = "C.TrialID_FK = " & lngTrialID

43570     Set db = CurrentDb
43580     strSQL = "SELECT C.classID, C.Element, C.Level, C.Section, P.FullName AS JudgeName, " & _
                   "C.ClassOrder, C.TimeLimit, C.TimeLimit2, C.TimeLimit3 " & _
                   "FROM tbl_Class AS C LEFT JOIN tbl_Person AS P ON C.JudgeID_FK = P.personID WHERE " & filterClause
43590     Set rs = db.OpenRecordset(strSQL, dbOpenSnapshot)
43600     If rs.EOF Then GoTo Exit_Sub

43610     recordsArray = "["
43620     Do While Not rs.EOF
43630         json = "{" & _
                        """trial_id"": " & supaTrialID & "," & _
                        """element"": """ & JsonSafe(Nz(rs!Element, "")) & """," & _
                        """level"": """ & JsonSafe(Nz(rs![Level], "")) & """," & _
                        """section"": """ & JsonSafe(Nz(rs!Section, "")) & """," & _
                        """judge_name"": """ & JsonSafe(Nz(rs!JudgeName, "")) & """," & _
                        """class_order"": " & Nz(rs!ClassOrder, 0) & "," & _
                        """time_limit_seconds"": " & TimeToJsonValue(rs!TimeLimit) & "," & _
                        """time_limit_area2_seconds"": " & TimeToJsonValue(rs!TimeLimit2) & "," & _
                        """time_limit_area3_seconds"": " & TimeToJsonValue(rs!TimeLimit3) & "," & _
                        """area_count"": 1," & _
                        """access_class_id"": " & Nz(rs!classID, 0) & "," & _
                        """access_trial_id"": " & lngTrialID & "," & _
                        """access_show_id"": " & lngShowID & "" & _
                    "}"
43640         recordsArray = recordsArray & json & ","
43650         rs.MoveNext
43660     Loop
43670     rs.Close

43680     If Len(recordsArray) > 1 Then recordsArray = Left(recordsArray, Len(recordsArray) - 1) & "]" Else GoTo Exit_Sub

43690     Set http = CreateObject("MSXML2.ServerXMLHttp.6.0")
43700     http.Open "POST", SUPABASE_URL_2 & "/rest/v1/" & TABLE_NAME & "?on_conflict=trial_id,element,level,section", False
43710     http.setRequestHeader "apikey", SUPABASE_KEY_2
43720     http.setRequestHeader "Authorization", "Bearer " & SUPABASE_KEY_2
43730     http.setRequestHeader "Content-Type", "application/json"
43740     http.setRequestHeader "Prefer", "resolution=merge-duplicates"
43750     http.send recordsArray
43760     If http.Status < 200 Or http.Status >= 300 Then MsgBox "API Error (ASCA Class): " & http.Status & " - " & http.responseText, vbCritical
43770     Set http = Nothing
Exit_Sub:
43780     Set db = Nothing: Set rs = Nothing: Set http = Nothing
43790     Exit Sub
Error_Handler:
43800     MsgBox "Error in SyncClassesViaAPI_ASCA_v3: " & Err.Description, vbCritical
43810     Resume Exit_Sub
End Sub

Private Sub SyncEntriesViaAPI_ASCA_v3(ByVal lngTrialID As Long, ByVal lngShowID As Long, Optional ByVal lngClassID As Long = 0, Optional ByVal blnResetScores As Boolean = False)
43820     On Error GoTo Error_Handler
          Dim db As DAO.Database, rs As DAO.Recordset, strSQL As String
          Const TABLE_NAME As String = "entries"
          Dim http As Object, json As String, recordsArray As String, filterClause As String
          Dim classIdMap As Scripting.Dictionary
43830     Set classIdMap = New Scripting.Dictionary

43840     If lngClassID > 0 Then filterClause = "E.classID_FK = " & lngClassID Else filterClause = "E.TrialID_FK = " & lngTrialID

43850     Set db = CurrentDb
43860     strSQL = "SELECT E.entryID, E.classID_FK, E.Armband, P.FullName AS HandlerName, D.CallName, B.BreedName, E.ExhibitorOrder, " & _
                   "E.Qualified, E.NQ, E.Excused, E.Absent, E.Withdrawn, " & _
                   "E.NQReason, E.ExcusedReason, E.WithdrawnReason, " & _
                   "E.SearchTime, E.AreaTime1, E.AreaTime2, E.AreaTime3, " & _
                   "E.FaultHE, E.FaultSC, E.FaultDS, " & _
                   "E.PlacementSort, E.CorrectCount, E.IncorrectCount, " & _
                   "E.CorrectScore, E.IncorrectScore, E.FinishScore, E.FaultHEScore, E.FaultSCScore, E.FaultDSScore " & _
                   "FROM (((tbl_Entry AS E LEFT JOIN tbl_Person AS P ON E.HandlerID_FK = P.personID) " & _
                   "LEFT JOIN tbl_Exhibitor AS D ON E.exhibitorID_FK = D.exhibitorID) " & _
                   "LEFT JOIN tbl_Breed AS B ON D.ASCABreedID_FK = B.breedID) " & _
                   "WHERE " & filterClause
43870     Set rs = db.OpenRecordset(strSQL, dbOpenSnapshot)
43880     If rs.EOF Then GoTo Exit_Sub

          Dim uniqueClassIDs As String
43890     rs.MoveFirst
43900     Do While Not rs.EOF
43910         If Not classIdMap.Exists(CStr(rs!ClassID_FK)) Then
43920             classIdMap.Add CStr(rs!ClassID_FK), 0
43930             uniqueClassIDs = uniqueClassIDs & rs!ClassID_FK & ","
43940         End If
43950         rs.MoveNext
43960     Loop

43970     If uniqueClassIDs = "" Then GoTo Exit_Sub
43980     uniqueClassIDs = Left(uniqueClassIDs, Len(uniqueClassIDs) - 1)

43990     Set http = CreateObject("MSXML2.ServerXMLHttp.6.0")
          Dim fullUrl As String
44000     fullUrl = SUPABASE_URL_2 & "/rest/v1/classes?select=id,access_class_id&access_show_id=eq." & lngShowID & "&access_class_id=in.(" & uniqueClassIDs & ")"
44010     http.Open "GET", fullUrl, False
44020     http.setRequestHeader "apikey", SUPABASE_KEY_2
44030     http.setRequestHeader "Authorization", "Bearer " & SUPABASE_KEY_2
44040     http.send

44050     If http.Status = 200 Then
              Dim responseText As String
              responseText = http.responseText

              Dim pos As Long, endPos As Long
              Dim idVal As String, accessIdVal As String
              pos = 1
              Do While True
                  pos = InStr(pos, responseText, """id"":")
                  If pos = 0 Then Exit Do
                  pos = pos + 5
                  endPos = InStr(pos, responseText, ",")
                  If endPos = 0 Then endPos = InStr(pos, responseText, "}")
                  idVal = Trim(Mid(responseText, pos, endPos - pos))

                  pos = InStr(pos, responseText, """access_class_id"":")
                  If pos = 0 Then Exit Do
                  pos = pos + 18
                  endPos = InStr(pos, responseText, "}")
                  If endPos = 0 Then Exit Do
                  accessIdVal = Trim(Mid(responseText, pos, endPos - pos))

                  classIdMap(accessIdVal) = CLng(Val(idVal))
                  pos = endPos
              Loop
44120     Else
44130         GoTo Exit_Sub
44140     End If
44150     Set http = Nothing

44160     recordsArray = "["
44170     rs.MoveFirst
44180     Do While Not rs.EOF
              Dim supaClassID As Long
44190         supaClassID = classIdMap(CStr(rs!ClassID_FK))
44200         If supaClassID > 0 Then
44210             json = "{" & _
                            """class_id"": " & supaClassID & "," & _
                            """armband_number"": " & Nz(rs!Armband, 0) & "," & _
                            """handler_name"": """ & JsonSafe(Nz(rs!HandlerName, "N/A")) & """," & _
                            """dog_call_name"": """ & JsonSafe(Nz(rs!CallName, "N/A")) & """," & _
                            """dog_breed"": """ & JsonSafe(Nz(rs!BreedName, "N/A")) & """," & _
                            """exhibitor_order"": " & Nz(rs!ExhibitorOrder, 0) & "," & _
                            """entry_status"": ""no-status""," & _
                            """access_entry_id"": " & Nz(rs!entryID, 0) & "," & _
                            """access_class_id"": " & Nz(rs!ClassID_FK, 0) & "," & _
                            """access_trial_id"": " & lngTrialID & "," & _
                            """access_show_id"": " & lngShowID

              ' If overwriting scores (user chose Overwrite), include ACTUAL Access scoring data
              If blnResetScores Then
                  Dim strResultStatus As String
                  Dim strReason As String
                  Dim lngTotalFaults As Long
                  Dim blnIsScored As Boolean

                  If Nz(rs!Qualified, False) = True Then
                      strResultStatus = "qualified"
                      blnIsScored = True
                  ElseIf Nz(rs!NQ, False) = True Then
                      strResultStatus = "nq"
                      strReason = Nz(rs!NQReason, "")
                      blnIsScored = True
                  ElseIf Nz(rs!Excused, False) = True Then
                      strResultStatus = "excused"
                      strReason = Nz(rs!ExcusedReason, "")
                      blnIsScored = True
                  ElseIf Nz(rs!Absent, False) = True Then
                      strResultStatus = "absent"
                      blnIsScored = True
                  ElseIf Nz(rs!Withdrawn, False) = True Then
                      strResultStatus = "withdrawn"
                      strReason = Nz(rs!WithdrawnReason, "")
                      blnIsScored = True
                  Else
                      strResultStatus = "pending"
                      blnIsScored = False
                  End If

                  lngTotalFaults = Nz(rs!FaultHE, 0) + Nz(rs!FaultSC, 0) + Nz(rs!FaultDS, 0)

                  json = json & "," & _
                            """is_scored"": " & LCase(CStr(blnIsScored)) & "," & _
                            """result_status"": """ & strResultStatus & """," & _
                            """search_time_seconds"": " & ConvertTimeToSeconds(Nz(rs!SearchTime, "")) & "," & _
                            """area1_time_seconds"": " & ConvertTimeToSeconds(Nz(rs!AreaTime1, "")) & "," & _
                            """area2_time_seconds"": " & ConvertTimeToSeconds(Nz(rs!AreaTime2, "")) & "," & _
                            """area3_time_seconds"": " & ConvertTimeToSeconds(Nz(rs!AreaTime3, "")) & "," & _
                            """total_faults"": " & lngTotalFaults & "," & _
                            """total_correct_finds"": " & Nz(rs!CorrectCount, 0) & "," & _
                            """total_incorrect_finds"": " & Nz(rs!IncorrectCount, 0) & "," & _
                            """final_placement"": " & Nz(rs!PlacementSort, 0) & "," & _
                            """total_score"": " & (Nz(rs!CorrectScore, 0) + Nz(rs!IncorrectScore, 0) + Nz(rs!FinishScore, 0) + Nz(rs!FaultHEScore, 0) + Nz(rs!FaultSCScore, 0) + Nz(rs!FaultDSScore, 0)) & "," & _
                            """points_earned"": 0," & _
                            """scoring_completed_at"": null"

                  If strReason <> "" Then
                      json = json & "," & """disqualification_reason"": """ & JsonSafe(strReason) & """"
                  Else
                      json = json & "," & """disqualification_reason"": null"
                  End If
              End If

              json = json & "}"
44220             recordsArray = recordsArray & json & ","
44230         End If
44240         rs.MoveNext
44250     Loop
44260     rs.Close

44270     If Len(recordsArray) <= 1 Then GoTo Exit_Sub
44280     recordsArray = Left(recordsArray, Len(recordsArray) - 1) & "]"

44290     Set http = CreateObject("MSXML2.ServerXMLHttp.6.0")
44300     http.Open "POST", SUPABASE_URL_2 & "/rest/v1/" & TABLE_NAME & "?on_conflict=class_id,armband_number", False
44310     http.setRequestHeader "apikey", SUPABASE_KEY_2
44320     http.setRequestHeader "Authorization", "Bearer " & SUPABASE_KEY_2
44330     http.setRequestHeader "Content-Type", "application/json"
44340     http.setRequestHeader "Prefer", "resolution=merge-duplicates"
44350     http.send recordsArray
44360     If http.Status < 200 Or http.Status >= 300 Then MsgBox "API Error (ASCA Entry): " & http.Status & " - " & http.responseText, vbCritical
Exit_Sub:
44370     On Error Resume Next
44380     Set db = Nothing: Set rs = Nothing: Set http = Nothing
44390     Set classIdMap = Nothing
44400     Exit Sub
Error_Handler:
44410     MsgBox "Error in SyncEntriesViaAPI_ASCA_v3: " & Err.Description, vbCritical
44420     Resume Exit_Sub
End Sub

' ==========================================================================
' === UPDATE SHOW DETAILS
' ==========================================================================

Public Sub UpdateShowDetails_ASCA_v3()
52500   On Error GoTo UpdateShow_Error

        Dim strmyK9Q As String
        Dim strClubname As String
        Dim strChairmanName As String
        Dim strChairmanEmail As String
        Dim strChairmanPhone As String
        Dim strSecretaryName As String
        Dim strSecretaryEmail As String
        Dim strSecretaryPhone As String
        Dim strSiteState As String
        Dim strClubWebsite As String
        Dim strNote As String
        Dim iShowID As Long
        Dim iClubID As Long
        Dim strLicenseKey As String
        Dim http As Object
        Dim json As String

        ' Get show and club info
52510   iShowID = Forms!frm_Show.txtShowID
52520   iClubID = Nz(DLookup("ClubID_FK", "tbl_Show", "ShowID = " & iShowID), 0)
52525   strLicenseKey = Nz(DLookup("MobileAppLicKey", "tbl_Show", "showID = " & iShowID), "")

        ' Check if license key exists
52530   If strLicenseKey = "" Then
52535       MsgBox "No myK9Q License Key entered. Please enter a license key first.", vbInformation, "myK9Q License Key"
52536       Exit Sub
52537   End If

        ' Check current license status (trust the stored status - don't re-verify every time)
        ' The license domain includes the show date when activated, but status-check uses just
        ' the club name, causing a mismatch. User should use "Activate Key" if not activated.
52540   strmyK9Q = Nz(DLookup("MobileAppLicKeyStatus", "tbl_Show", "showID = " & iShowID), "")

52550   If InStr(1, strmyK9Q, "Active and Valid", vbTextCompare) = 0 And _
           InStr(1, strmyK9Q, "activated", vbTextCompare) = 0 Then
52560       MsgBox "Unable to Upload data without a Valid myK9Q License Key." & vbCrLf & vbCrLf & _
                   "Current Status: " & strmyK9Q & vbCrLf & vbCrLf & _
                   "Use 'Activate Key' to activate your license, then try again.", vbInformation, "myK9Q License Key"
52570       Exit Sub
52580   End If

        ' Get club name for website lookup below
52590   strClubname = Nz(DLookup("ASCAClubName", "tbl_Club", "ClubID = " & iClubID), "")

        ' Gather show details
52640   strChairmanName = Nz(DLookup("FullName", "tbl_Person", "personID = " & Nz(Forms!frm_Show.ChairmanID_FK, 0)), "")
52650   strChairmanEmail = Nz(DLookup("Email", "tbl_Person", "personID = " & Nz(Forms!frm_Show.ChairmanID_FK, 0)), "")
52660   strChairmanPhone = Nz(DLookup("Phone", "tbl_Person", "personID = " & Nz(Forms!frm_Show.ChairmanID_FK, 0)), "")
52670   strSecretaryName = Nz(DLookup("FullName", "tbl_Person", "personID = " & Nz(Forms!frm_Show.SecretaryID_FK, 0)), "")
52680   strSecretaryEmail = Nz(DLookup("Email", "tbl_Person", "personID = " & Nz(Forms!frm_Show.SecretaryID_FK, 0)), "")
52690   strSecretaryPhone = Nz(DLookup("Phone", "tbl_Person", "personID = " & Nz(Forms!frm_Show.SecretaryID_FK, 0)), "")
52700   strSiteState = Nz(DLookup("StateName", "tbl_State", "StateID = " & Nz(Forms!frm_Show.SiteStateID_FK, 0)), "")
52710   strClubWebsite = Nz(DLookup("Website", "tbl_Club", "ClubID = " & iClubID), "")
52720   strNote = Nz(DLookup("note", "tbl_show", "showID = " & iShowID), "")
52730   strNote = Replace(strNote, "<div>", "")
52740   strNote = Replace(strNote, "</div>", "")

        ' Build JSON for PATCH request
52750   json = "{" & _
                   """chairman_name"":""" & JsonSafe(strChairmanName) & """," & _
                   """chairman_email"":""" & JsonSafe(strChairmanEmail) & """," & _
                   """chairman_phone"":""" & JsonSafe(strChairmanPhone) & """," & _
                   """secretary_name"":""" & JsonSafe(strSecretaryName) & """," & _
                   """secretary_email"":""" & JsonSafe(strSecretaryEmail) & """," & _
                   """secretary_phone"":""" & JsonSafe(strSecretaryPhone) & """," & _
                   """website"":""" & JsonSafe(strClubWebsite) & """," & _
                   """event_url"":""" & JsonSafe(Nz(Forms!frm_Show.eventurl, "")) & """," & _
                   """site_name"":""" & JsonSafe(Nz(Forms!frm_Show.SiteName, "")) & """," & _
                   """site_address"":""" & JsonSafe(Nz(Forms!frm_Show.SiteAddress, "")) & """," & _
                   """site_city"":""" & JsonSafe(Nz(Forms!frm_Show.SiteCity, "")) & """," & _
                   """site_state"":""" & JsonSafe(strSiteState) & """," & _
                   """site_zip"":""" & JsonSafe(Nz(Forms!frm_Show.SiteZip, "")) & """," & _
                   """notes"":""" & JsonSafe(strNote) & """" & _
                "}"

        ' Send PATCH request to update show
52760   Set http = CreateObject("MSXML2.ServerXMLHTTP.6.0")
52770   http.Open "PATCH", SUPABASE_URL_2 & "/rest/v1/shows?license_key=eq." & strLicenseKey, False
52780   http.setRequestHeader "apikey", SUPABASE_KEY_2
52790   http.setRequestHeader "Authorization", "Bearer " & SUPABASE_KEY_2
52800   http.setRequestHeader "Content-Type", "application/json"
52810   http.setRequestHeader "Prefer", "return=representation"
52820   http.send json

52830   If http.Status >= 200 And http.Status < 300 Then
52835       If http.responseText = "[]" Then
52836           MsgBox "Show not found in myK9Q database. Activate the myK9Q license key to upload the show first.", vbExclamation, "Show Not Found"
52837       Else
52840           MsgBox "Show Details updated in myK9Q cloud database", vbInformation, "Show Details Update"
52838       End If
52850   Else
52860       MsgBox "Error updating show details:" & vbCrLf & http.Status & " - " & http.responseText, vbCritical, "Update Failed"
52870   End If

52880   Set http = Nothing
52890   Exit Sub

UpdateShow_Error:
52900   MsgBox "Error in UpdateShowDetails_ASCA_v3: " & Err.Description, vbCritical
52910   Set http = Nothing
End Sub

' ==========================================================================
' === DOWNLOAD ROUTINE
' ==========================================================================

Public Sub myK9Q_Class_Result_Download_ASCA_v3()
42030     On Error GoTo Download_Error

          Dim iClassID As Long, iShowID As Long
          Dim db As DAO.Database, http As Object
          Dim jsonResponse As String, classJsonResponse As String
          Dim parsedJson As Object, dataItem As Object, parsedClassJson As Object
          Dim strSQL As String
          Dim updatedCount As Long
          Dim classTimeLimitSeconds As Double
          Dim classTimeLimit2Seconds As Double
          Dim classTimeLimit3Seconds As Double
          Dim rsClass As DAO.Recordset

          ' Debug tracking variable
          Dim strDebugStep As String
          strDebugStep = "Initializing"

42050     Set db = CurrentDb
          strDebugStep = "Getting ClassID from form"
42060     iClassID = Forms!frm_Class_Main.txtClassID
          strDebugStep = "Getting ShowID via DLookup, TrialID=" & Nz(Forms!frm_Class_Main.txtTrialID, 0)
42070     iShowID = DLookup("ShowID_FK", "tbl_Trial", "TrialID = " & Forms!frm_Class_Main.txtTrialID)
          strDebugStep = "Got IDs: ClassID=" & iClassID & ", ShowID=" & iShowID

          ' ==========================================================
          ' SCORED ENTRIES PROTECTION CHECK (Protect Access scores)
          ' ==========================================================
          Dim strScoredListAccess As String
          Dim intUserChoice As Integer
          Dim blnOverwriteAccessScores As Boolean
          Dim strClassName As String
          blnOverwriteAccessScores = False

          strDebugStep = "Checking scored entries in Access"
          strScoredListAccess = CheckScoredEntriesInAccess_ASCA_v3(iClassID)

          If strScoredListAccess <> "" Then
              strClassName = Nz(DLookup("Element", "tbl_Class", "classID = " & iClassID), "") & " " & _
                             Nz(DLookup("Level", "tbl_Class", "classID = " & iClassID), "")

              intUserChoice = ShowAccessScoredEntriesWarning(strScoredListAccess, strClassName)

              Select Case intUserChoice
                  Case vbAbort
                      MsgBox "Download cancelled.", vbInformation, "Download Cancelled"
                      Exit Sub

                  Case vbIgnore
                      MsgBox "Download cancelled. Access scores preserved.", vbInformation, "Scores Protected"
                      Exit Sub

                  Case vbRetry
                      blnOverwriteAccessScores = True
              End Select
          End If
          ' ==========================================================

          strDebugStep = "Opening progress form"
42080     DoCmd.OpenForm "frm_Progress_myK9Q", acNormal
42090     Forms!frm_Progress_myK9Q.lblCurrentTask.Caption = "Downloading ASCA results for Class ID: " & iClassID
42100     Forms!frm_Progress_myK9Q.Repaint

          strDebugStep = "Creating HTTP object"
42110     Set http = CreateObject("MSXML2.ServerXMLHttp.6.0")

          ' --- Get the Class Time Limit First ---
          strDebugStep = "Fetching class time limits from Supabase"
          Dim strClassUrl As String
          strClassUrl = SUPABASE_URL_2 & "/rest/v1/classes?select=time_limit_seconds,time_limit_area2_seconds,time_limit_area3_seconds&access_class_id=eq." & iClassID
42120     http.Open "GET", strClassUrl, False
42130     http.setRequestHeader "apikey", SUPABASE_KEY_2
42140     http.setRequestHeader "Authorization", "Bearer " & SUPABASE_KEY_2
          strDebugStep = "Sending class time limit request"
42150     http.send
          strDebugStep = "Class request returned status: " & http.Status
42160     If http.Status = 200 Then
          strDebugStep = "Parsing class JSON response"
42170         Set parsedClassJson = ParseJson(http.responseText)
          strDebugStep = "Checking parsed class JSON"
42180         If Not parsedClassJson Is Nothing And parsedClassJson.count > 0 Then
42190             classTimeLimitSeconds = CDbl(Nz(parsedClassJson(1)("time_limit_seconds"), 0))
42195             classTimeLimit2Seconds = CDbl(Nz(parsedClassJson(1)("time_limit_area2_seconds"), 0))
42197             classTimeLimit3Seconds = CDbl(Nz(parsedClassJson(1)("time_limit_area3_seconds"), 0))

                  ' Sync Time Limits back to Access tbl_Class
                  On Error Resume Next
                  Set rsClass = db.OpenRecordset("SELECT * FROM tbl_Class WHERE classID = " & iClassID, dbOpenDynaset)

                  If Not rsClass.EOF Then
                      rsClass.Edit
                      Dim lngSeconds As Long

                      If classTimeLimitSeconds > 0 Then
                          lngSeconds = CLng(classTimeLimitSeconds)
                          rsClass!TimeLimit = Format(lngSeconds \ 60, "00") & ":" & Format(lngSeconds Mod 60, "00")
                      Else
                          rsClass!TimeLimit = Null
                      End If

                      If classTimeLimit2Seconds > 0 Then
                          lngSeconds = CLng(classTimeLimit2Seconds)
                          rsClass!TimeLimit2 = Format(lngSeconds \ 60, "00") & ":" & Format(lngSeconds Mod 60, "00")
                      Else
                          rsClass!TimeLimit2 = Null
                      End If

                      If classTimeLimit3Seconds > 0 Then
                          lngSeconds = CLng(classTimeLimit3Seconds)
                          rsClass!TimeLimit3 = Format(lngSeconds \ 60, "00") & ":" & Format(lngSeconds Mod 60, "00")
                      Else
                          rsClass!TimeLimit3 = Null
                      End If

                      rsClass.Update
                  End If

                  rsClass.Close
                  Set rsClass = Nothing
                  On Error GoTo Download_Error

42200         End If
42210     End If

          ' --- Get all ENTRIES with their result data ---
          strDebugStep = "Fetching entries from Supabase"
          Dim strEntriesUrl As String
          strEntriesUrl = SUPABASE_URL_2 & "/rest/v1/entries?select=access_entry_id,result_status,disqualification_reason,search_time_seconds,area1_time_seconds,area2_time_seconds,area3_time_seconds,total_faults,total_correct_finds,total_incorrect_finds,no_finish_count,is_scored,final_placement&access_class_id=eq." & iClassID
42220     http.Open "GET", strEntriesUrl, False
42230     http.setRequestHeader "apikey", SUPABASE_KEY_2
42240     http.setRequestHeader "Authorization", "Bearer " & SUPABASE_KEY_2
          strDebugStep = "Sending entries request"
42250     http.send
          strDebugStep = "Entries request returned status: " & http.Status

42260     If http.Status <> 200 Then
              strDebugStep = "Entries request FAILED with status: " & http.Status & " - " & http.responseText
              GoTo Download_Exit
          End If

42440     DoCmd.SetWarnings False
42430     jsonResponse = http.responseText
          strDebugStep = "Got entries response, length: " & Len(Nz(jsonResponse, ""))
42450     If Len(Nz(jsonResponse, "")) < 5 Then GoTo FinalizeDownload

          strDebugStep = "Parsing entries JSON"
42460     Set parsedJson = ParseJson(jsonResponse)
          strDebugStep = "Parsed JSON, checking if valid"
42470     If Not parsedJson Is Nothing And parsedJson.count > 0 Then
          strDebugStep = "Processing " & parsedJson.count & " entries"
42480         For Each dataItem In parsedJson
                  Dim accessEntryID As Long
42490             accessEntryID = CLng(Nz(dataItem("access_entry_id"), 0))

42530             If accessEntryID > 0 Then
                      If Nz(dataItem("is_scored"), False) = True Then
                          Dim blnScoredInAccess As Boolean
                          blnScoredInAccess = IsEntryScoredInAccess(accessEntryID)

                          If blnScoredInAccess And Not blnOverwriteAccessScores Then
                              GoTo NextEntry
                          End If

42540                     strSQL = "UPDATE tbl_Entry SET " & _
                                    "NQReason = '" & JsonSafe(Nz(dataItem("disqualification_reason"), "None")) & "', " & _
                                    "SearchTime = '" & ConvertSecondsToTimeFormat(dataItem("search_time_seconds")) & "', " & _
                                    "AreaTime1 = '" & ConvertSecondsToTimeFormat(dataItem("area1_time_seconds")) & "', " & _
                                    "AreaTime2 = '" & ConvertSecondsToTimeFormat(dataItem("area2_time_seconds")) & "', " & _
                                    "AreaTime3 = '" & ConvertSecondsToTimeFormat(dataItem("area3_time_seconds")) & "', " & _
                                    "FaultHE = " & Nz(dataItem("total_faults"), 0) & ", " & _
                                    "result_text = '" & JsonSafe(Nz(dataItem("result_status"), "None")) & "', " & _
                                    "CorrectCount = " & Nz(dataItem("total_correct_finds"), 0) & ", " & _
                                    "IncorrectCount = " & Nz(dataItem("total_incorrect_finds"), 0) & ", " & _
                                    "FinishCount = " & Nz(dataItem("no_finish_count"), 0) & " " & _
                                "WHERE entryID = " & accessEntryID
42550                     db.Execute strSQL, dbFailOnError

                          Dim SearchTime As Double
                          Dim Area1Time As Double
                          Dim Area2Time As Double
                          Dim Area3Time As Double
42560                     SearchTime = CDbl(Nz(dataItem("search_time_seconds"), 0))
                          Area1Time = CDbl(Nz(dataItem("area1_time_seconds"), 0))
                          Area2Time = CDbl(Nz(dataItem("area2_time_seconds"), 0))
                          Area3Time = CDbl(Nz(dataItem("area3_time_seconds"), 0))

42570                     Select Case LCase(Nz(dataItem("result_status"), "pending"))
                              Case "qualified"
42580                             strSQL = "UPDATE tbl_Entry SET Qualified = True, NQ = False, Absent = False, Excused = False, Withdrawn = False, Millisecs1 = " & CLng(Area1Time * 1000) & ", Millisecs2 = " & CLng(Area2Time * 1000) & ", Millisecs3 = " & CLng(Area3Time * 1000) & " WHERE entryID = " & accessEntryID
42590                         Case "nq"
42600                             strSQL = "UPDATE tbl_Entry SET NQ = True, Qualified = False, Absent = False, Excused = False, Withdrawn = False, Millisecs1 = 0, Millisecs2 = 0, Millisecs3 = 0 WHERE entryID = " & accessEntryID
42610                         Case "absent"
42620                             strSQL = "UPDATE tbl_Entry SET Absent = True, Qualified = False, NQ = False, Excused = False, Withdrawn = False, Millisecs1 = 0, Millisecs2 = 0, Millisecs3 = 0 WHERE entryID = " & accessEntryID
42630                         Case "excused"
42640                             strSQL = "UPDATE tbl_Entry SET Excused = True, ExcusedReason = '" & JsonSafe(Nz(dataItem("disqualification_reason"), "")) & "', Qualified = False, NQ = False, Absent = False, Withdrawn = False, Millisecs1 = 0, Millisecs2 = 0, Millisecs3 = 0 WHERE entryID = " & accessEntryID
42650                         Case "withdrawn"
42660                             strSQL = "UPDATE tbl_Entry SET Withdrawn = True, Qualified = False, NQ = False, Absent = False, Excused = False, Millisecs1 = 0, Millisecs2 = 0, Millisecs3 = 0 WHERE entryID = " & accessEntryID
42670                         Case Else
42680                             strSQL = "UPDATE tbl_Entry SET Qualified = False, NQ = False, Absent = False, Excused = False, Withdrawn = False, Millisecs1 = 0, Millisecs2 = 0, Millisecs3 = 0 WHERE entryID = " & accessEntryID
42690                     End Select
42700                     db.Execute strSQL, dbFailOnError

42710                     updatedCount = updatedCount + 1
                      End If
42720             End If
NextEntry:
42730         Next dataItem
42740     End If

FinalizeDownload:
          strDebugStep = "Calling Class_Placements"
42760     Call Class_Placements

          strDebugStep = "Closing progress form"
42770     DoCmd.Close acForm, "frm_Progress_myK9Q", acSaveNo
          strDebugStep = "Requerying form"
42780     Forms!frm_Class_Main.Requery
42790     MsgBox "ASCA Download complete. " & updatedCount & " entries were updated.", vbInformation, "Download Complete"

Download_Exit:
42800     On Error Resume Next
42810     DoCmd.SetWarnings True
42820     Set db = Nothing: Set http = Nothing: Set parsedJson = Nothing
42830     Set dataItem = Nothing: Set parsedClassJson = Nothing
          Set rsClass = Nothing
42840     Exit Sub

Download_Error:
          ' IMPORTANT: Capture error info BEFORE any cleanup operations clear it
          Dim errNum As Long, errDesc As String
          errNum = Err.Number
          errDesc = Err.Description

42850     On Error Resume Next
42860     DoCmd.Close acForm, "frm_Progress_myK9Q", acSaveNo
42870     On Error GoTo 0
42880     MsgBox "An error occurred during ASCA download:" & vbCrLf & vbCrLf & _
                   "Step: " & strDebugStep & vbCrLf & vbCrLf & _
                   "Error Number: " & errNum & vbCrLf & _
                   "Description: " & errDesc, vbCritical, "Download Failed"
42890     Resume Download_Exit
End Sub


' ==========================================================================
' === HELPER FUNCTIONS (ASCA-specific naming)
' ==========================================================================

Private Sub DeleteFromSupabase_ASCA_v3(ByVal TableName As String, ByVal filter As String)
44430     On Error GoTo Delete_Error
          Dim http As Object, fullUrl As String
44440     If SUPABASE_URL_2 = "https_YOUR_SECOND_URL.supabase.co" Or SUPABASE_KEY_2 = "your_second_supabase_key_here" Then Exit Sub
44450     Set http = CreateObject("MSXML2.ServerXMLHttp.6.0")
44460     fullUrl = SUPABASE_URL_2 & "/rest/v1/" & TableName & "?" & filter
44470     http.Open "DELETE", fullUrl, False
44480     http.setRequestHeader "apikey", SUPABASE_KEY_2
44490     http.setRequestHeader "Authorization", "Bearer " & SUPABASE_KEY_2
44500     http.send
44510     If http.Status <> 204 And http.Status <> 404 Then MsgBox "API DELETE Error on table '" & TableName & "':" & vbCrLf & http.Status & " - " & http.statusText & vbCrLf & http.responseText, vbCritical
44520     Set http = Nothing
44530     Exit Sub
Delete_Error:
44540     MsgBox "An error occurred in DeleteFromSupabase_ASCA_v3:" & vbCrLf & Err.Description, vbCritical
44550     Set http = Nothing
End Sub

Private Function GetSupabaseShowID_ASCA_v3(ByVal licenseKey As String) As Long
44560     On Error GoTo GetID_Error
          Dim http As Object, jsonResponse As String, parsedJson As Object
44570     GetSupabaseShowID_ASCA_v3 = 0
44580     If IsNull(licenseKey) Or licenseKey = "" Then Exit Function
44590     Set http = CreateObject("MSXML2.ServerXMLHttp.6.0")
          Dim fullUrl As String
44600     fullUrl = SUPABASE_URL_2 & "/rest/v1/shows?select=id&license_key=eq." & licenseKey
44610     http.Open "GET", fullUrl, False
44620     http.setRequestHeader "apikey", SUPABASE_KEY_2
44630     http.setRequestHeader "Authorization", "Bearer " & SUPABASE_KEY_2
44640     http.send
44650     If http.Status = 200 Then
44660         jsonResponse = http.responseText
44670         Set parsedJson = ParseJson(jsonResponse)
44680         If Not parsedJson Is Nothing Then
                  ' ParseJson returns a Collection for arrays - access by index (1-based)
                  If parsedJson.count > 0 Then
                      Dim firstItem As Object
                      Set firstItem = parsedJson(1)
                      GetSupabaseShowID_ASCA_v3 = CLng(Val(firstItem("id")))
                  End If
              End If
44690     End If
GetID_Exit:
44700     Set http = Nothing: Set parsedJson = Nothing
44710     Exit Function
GetID_Error:
44720     Resume GetID_Exit
End Function

Private Function GetSupabaseTrialID_ASCA_v3(ByVal licenseKey As String, ByVal accessTrialID As Long) As Long
44730     On Error GoTo GetID_Error
          Dim http As Object, jsonResponse As String, parsedJson As Object, supaShowID As Long
44740     GetSupabaseTrialID_ASCA_v3 = 0
44750     If accessTrialID = 0 Or licenseKey = "" Then Exit Function
44760     supaShowID = GetSupabaseShowID_ASCA_v3(licenseKey)
44770     If supaShowID = 0 Then Exit Function
44780     Set http = CreateObject("MSXML2.ServerXMLHttp.6.0")
          Dim fullUrl As String
44790     fullUrl = SUPABASE_URL_2 & "/rest/v1/trials?select=id&show_id=eq." & supaShowID & "&access_trial_id=eq." & accessTrialID
44800     http.Open "GET", fullUrl, False
44810     http.setRequestHeader "apikey", SUPABASE_KEY_2
44820     http.setRequestHeader "Authorization", "Bearer " & SUPABASE_KEY_2
44830     http.send
44840     If http.Status = 200 Then
44850         jsonResponse = http.responseText
44860         Set parsedJson = ParseJson(jsonResponse)
44870         If Not parsedJson Is Nothing Then
                  ' ParseJson returns a Collection for arrays - access by index (1-based)
                  If parsedJson.count > 0 Then
                      Dim firstItem As Object
                      Set firstItem = parsedJson(1)
                      GetSupabaseTrialID_ASCA_v3 = CLng(Val(firstItem("id")))
                  End If
              End If
44880     End If
GetID_Exit:
44890     Set http = Nothing: Set parsedJson = Nothing
44900     Exit Function
GetID_Error:
44910     Resume GetID_Exit
End Function

Private Function GetSupabaseClassID_ASCA_v3(ByVal licenseKey As String, ByVal accessClassID As Long) As Long
44920     On Error GoTo GetID_Error
          Dim http As Object, jsonResponse As String, parsedJson As Object, accessShowID As Long
44930     GetSupabaseClassID_ASCA_v3 = 0
44940     If accessClassID = 0 Or licenseKey = "" Then Exit Function
44950     On Error Resume Next
44960     accessShowID = DLookup("ShowID", "tbl_Show", "MobileAppLicKey = '" & licenseKey & "'")
44970     On Error GoTo GetID_Error
44980     If accessShowID = 0 Then Exit Function
44990     Set http = CreateObject("MSXML2.ServerXMLHttp.6.0")
          Dim fullUrl As String
45000     fullUrl = SUPABASE_URL_2 & "/rest/v1/classes?select=id&access_show_id=eq." & accessShowID & "&access_class_id=eq." & accessClassID
45010     http.Open "GET", fullUrl, False
45020     http.setRequestHeader "apikey", SUPABASE_KEY_2
45030     http.setRequestHeader "Authorization", "Bearer " & SUPABASE_KEY_2
45040     http.send
45050     If http.Status = 200 Then
45060         jsonResponse = http.responseText
45070         Set parsedJson = ParseJson(jsonResponse)
45080         If Not parsedJson Is Nothing Then
                  ' ParseJson returns a Collection for arrays - access by index (1-based)
                  If parsedJson.count > 0 Then
                      Dim firstItem As Object
                      Set firstItem = parsedJson(1)
                      GetSupabaseClassID_ASCA_v3 = CLng(Val(firstItem("id")))
                  End If
              End If
45090     End If
GetID_Exit:
45110     Set http = Nothing: Set parsedJson = Nothing
45120     Exit Function
GetID_Error:
45130     MsgBox "Error in GetSupabaseClassID_ASCA_v3: " & Err.Description, vbCritical
45140     Resume GetID_Exit
End Function

' ==========================================================================
' === SCORED ENTRY PROTECTION FUNCTIONS (ASCA-specific)
' ==========================================================================

Private Function CheckScoredEntries_ASCA_v3(ByVal lngShowID As Long, ByVal lngClassID As Long) As String
    On Error GoTo Check_Error

    Dim http As Object, jsonResponse As String, parsedJson As Object, dataItem As Object
    Dim supaClassID As Long, strLicenseKey As String
    Dim result As String

    strLicenseKey = Nz(DLookup("MobileAppLicKey", "tbl_Show", "showID = " & lngShowID), "")
    supaClassID = GetSupabaseClassID_ASCA_v3(strLicenseKey, lngClassID)

    If supaClassID = 0 Then
        CheckScoredEntries_ASCA_v3 = ""
        Exit Function
    End If

    Set http = CreateObject("MSXML2.ServerXMLHttp.6.0")
    Dim fullUrl As String
    fullUrl = SUPABASE_URL_2 & "/rest/v1/entries?select=armband_number,dog_call_name,handler_name&class_id=eq." & supaClassID & "&is_scored=eq.true"

    http.Open "GET", fullUrl, False
    http.setRequestHeader "apikey", SUPABASE_KEY_2
    http.setRequestHeader "Authorization", "Bearer " & SUPABASE_KEY_2
    http.send

    result = ""
    If http.Status = 200 Then
        Set parsedJson = ParseJson(http.responseText)
        If Not parsedJson Is Nothing And parsedJson.count > 0 Then
            For Each dataItem In parsedJson
                result = result & Nz(dataItem("armband_number"), "?") & "|" & _
                         Nz(dataItem("dog_call_name"), "Unknown") & "|" & _
                         Nz(dataItem("handler_name"), "Unknown") & ";"
            Next dataItem
        End If
    End If

    CheckScoredEntries_ASCA_v3 = result

Check_Exit:
    Set http = Nothing: Set parsedJson = Nothing: Set dataItem = Nothing
    Exit Function
Check_Error:
    CheckScoredEntries_ASCA_v3 = ""
    Resume Check_Exit
End Function

Private Function CheckScoredEntriesForTrial_ASCA_v3(ByVal lngShowID As Long, ByVal lngTrialID As Long) As String
    ' Placeholder - implement similar to AKC version if needed
    CheckScoredEntriesForTrial_ASCA_v3 = ""
End Function

Private Function CheckScoredEntriesInAccess_ASCA_v3(ByVal lngClassID As Long) As String
    ' Check for entries scored in Access (local database)
    On Error GoTo Check_Error

    Dim db As DAO.Database, rs As DAO.Recordset, strSQL As String
    Dim result As String

    Set db = CurrentDb
    strSQL = "SELECT E.Armband, D.CallName, P.FullName AS HandlerName " & _
             "FROM ((tbl_Entry AS E LEFT JOIN tbl_Exhibitor AS D ON E.exhibitorID_FK = D.exhibitorID) " & _
             "LEFT JOIN tbl_Person AS P ON E.HandlerID_FK = P.personID) " & _
             "WHERE E.classID_FK = " & lngClassID & " AND " & _
             "(E.Qualified = True OR E.NQ = True OR E.Excused = True OR E.Absent = True OR E.Withdrawn = True)"

    Set rs = db.OpenRecordset(strSQL, dbOpenSnapshot)

    result = ""
    Do While Not rs.EOF
        result = result & Nz(rs!Armband, "?") & "|" & _
                 Nz(rs!CallName, "Unknown") & "|" & _
                 Nz(rs!HandlerName, "Unknown") & ";"
        rs.MoveNext
    Loop

    rs.Close
    CheckScoredEntriesInAccess_ASCA_v3 = result

Check_Exit:
    Set db = Nothing: Set rs = Nothing
    Exit Function
Check_Error:
    CheckScoredEntriesInAccess_ASCA_v3 = ""
    Resume Check_Exit
End Function

Private Function UnlockTrialForReupload_ASCA_v3(ByVal lngShowID As Long, ByVal lngTrialID As Long) As Long
    ' Placeholder - implement if needed
    UnlockTrialForReupload_ASCA_v3 = 0
End Function

Private Function UnlockClassForReupload_ASCA_v3(ByVal lngShowID As Long, ByVal lngClassID As Long) As Long
    ' Placeholder - implement if needed
    UnlockClassForReupload_ASCA_v3 = 0
End Function

' ==========================================================================
' === DIALOG HELPER FUNCTIONS
' === These show the scored entries warning dialogs
' ==========================================================================

Private Function ShowTrialScoredEntriesWarning(ByVal strScoredList As String) As Integer
    ' Shows warning dialog for trial-level upload with scored entries
    ' Returns: vbAbort (Cancel), vbIgnore (Upload Anyway), vbRetry (Unlock & Overwrite)
    On Error GoTo Warning_Error

    If strScoredList = "" Then
        ShowTrialScoredEntriesWarning = vbIgnore  ' No scored entries, proceed
        Exit Function
    End If

    Dim result As VbMsgBoxResult
    result = MsgBox("WARNING: Some entries in this trial have already been scored in myK9Q." & vbCrLf & vbCrLf & _
                    "Scored entries:" & vbCrLf & FormatScoredList(strScoredList) & vbCrLf & vbCrLf & _
                    "Choose an option:" & vbCrLf & _
                    "YES = Upload Anyway (existing scores protected)" & vbCrLf & _
                    "NO = Cancel Upload" & vbCrLf & _
                    "CANCEL = Unlock & Overwrite scores", _
                    vbYesNoCancel + vbExclamation, "Scored Entries Found")

    Select Case result
        Case vbYes
            ShowTrialScoredEntriesWarning = vbIgnore  ' Upload anyway
        Case vbNo
            ShowTrialScoredEntriesWarning = vbAbort   ' Cancel
        Case vbCancel
            ShowTrialScoredEntriesWarning = vbRetry   ' Unlock & overwrite
    End Select
    Exit Function

Warning_Error:
    ShowTrialScoredEntriesWarning = vbAbort
End Function

Private Function ShowScoredEntriesWarning(ByVal strScoredList As String, ByVal strClassName As String) As Integer
    ' Shows warning dialog for class-level upload with scored entries
    ' Returns: vbAbort (Cancel), vbIgnore (Upload Anyway), vbRetry (Unlock & Overwrite)
    On Error GoTo Warning_Error

    If strScoredList = "" Then
        ShowScoredEntriesWarning = vbIgnore  ' No scored entries, proceed
        Exit Function
    End If

    Dim result As VbMsgBoxResult
    result = MsgBox("WARNING: Some entries in " & strClassName & " have already been scored in myK9Q." & vbCrLf & vbCrLf & _
                    "Scored entries:" & vbCrLf & FormatScoredList(strScoredList) & vbCrLf & vbCrLf & _
                    "Choose an option:" & vbCrLf & _
                    "YES = Upload Anyway (existing scores protected)" & vbCrLf & _
                    "NO = Cancel Upload" & vbCrLf & _
                    "CANCEL = Unlock & Overwrite scores", _
                    vbYesNoCancel + vbExclamation, "Scored Entries Found - " & strClassName)

    Select Case result
        Case vbYes
            ShowScoredEntriesWarning = vbIgnore  ' Upload anyway
        Case vbNo
            ShowScoredEntriesWarning = vbAbort   ' Cancel
        Case vbCancel
            ShowScoredEntriesWarning = vbRetry   ' Unlock & overwrite
    End Select
    Exit Function

Warning_Error:
    ShowScoredEntriesWarning = vbAbort
End Function

Private Function ShowAccessScoredEntriesWarning(ByVal strScoredList As String, ByVal strClassName As String) As Integer
    ' Shows warning dialog for download when Access has scored entries
    ' Returns: vbAbort (Cancel), vbIgnore (Keep Access), vbRetry (Overwrite Access)
    On Error GoTo Warning_Error

    If strScoredList = "" Then
        ShowAccessScoredEntriesWarning = vbRetry  ' No scored entries, proceed with download
        Exit Function
    End If

    Dim result As VbMsgBoxResult
    result = MsgBox("WARNING: Some entries in " & strClassName & " have already been scored in Access." & vbCrLf & vbCrLf & _
                    "Scored entries:" & vbCrLf & FormatScoredList(strScoredList) & vbCrLf & vbCrLf & _
                    "Choose an option:" & vbCrLf & _
                    "YES = Overwrite Access scores with myK9Q scores" & vbCrLf & _
                    "NO = Keep Access scores (cancel download)" & vbCrLf & _
                    "CANCEL = Cancel download", _
                    vbYesNoCancel + vbExclamation, "Access Scores Found - " & strClassName)

    Select Case result
        Case vbYes
            ShowAccessScoredEntriesWarning = vbRetry   ' Overwrite Access
        Case vbNo
            ShowAccessScoredEntriesWarning = vbIgnore  ' Keep Access
        Case vbCancel
            ShowAccessScoredEntriesWarning = vbAbort   ' Cancel
    End Select
    Exit Function

Warning_Error:
    ShowAccessScoredEntriesWarning = vbAbort
End Function

Private Function FormatScoredList(ByVal strScoredList As String) As String
    ' Formats the scored entries list for display
    ' Input: "armband|dog|handler;armband|dog|handler;..."
    ' Output: "  #armband - dog (handler)\n  #armband - dog (handler)\n..."
    On Error Resume Next

    If strScoredList = "" Then
        FormatScoredList = "(none)"
        Exit Function
    End If

    Dim entries() As String
    Dim parts() As String
    Dim result As String
    Dim i As Long

    entries = Split(strScoredList, ";")
    result = ""

    For i = 0 To UBound(entries)
        If entries(i) <> "" Then
            parts = Split(entries(i), "|")
            If UBound(parts) >= 2 Then
                result = result & "  #" & parts(0) & " - " & parts(1) & " (" & parts(2) & ")" & vbCrLf
            End If
        End If
    Next i

    If result = "" Then result = "(none)"
    FormatScoredList = result
End Function

Private Function IsEntryScoredInAccess(ByVal lngEntryID As Long) As Boolean
    ' Check if an entry has been scored in Access
    On Error GoTo Check_Error

    Dim db As DAO.Database, rs As DAO.Recordset, strSQL As String

    Set db = CurrentDb
    strSQL = "SELECT Qualified, NQ, Excused, Absent, Withdrawn FROM tbl_Entry WHERE entryID = " & lngEntryID
    Set rs = db.OpenRecordset(strSQL, dbOpenSnapshot)

    IsEntryScoredInAccess = False
    If Not rs.EOF Then
        If Nz(rs!Qualified, False) = True Or _
           Nz(rs!NQ, False) = True Or _
           Nz(rs!Excused, False) = True Or _
           Nz(rs!Absent, False) = True Or _
           Nz(rs!Withdrawn, False) = True Then
            IsEntryScoredInAccess = True
        End If
    End If

    rs.Close
    Set rs = Nothing: Set db = Nothing
    Exit Function

Check_Error:
    IsEntryScoredInAccess = False
End Function

' ==========================================================================
' === SHARED UTILITY FUNCTIONS
' === Note: These may already exist in mod_myK9Qv3.bas
' === If so, you can remove these and use the shared versions
' ==========================================================================

Private Function TimeToJsonValue(ByVal timeValue As Variant) As String
    On Error Resume Next

    If IsNull(timeValue) Or Nz(timeValue, "") = "" Then
        TimeToJsonValue = "null"
        Exit Function
    End If

    Dim seconds As Long
    seconds = ParseTimeToSeconds_ASCA(timeValue)

    If seconds = 0 Then
        TimeToJsonValue = "null"
    Else
        TimeToJsonValue = CStr(seconds)
    End If
End Function

Private Function AreaCountToJsonValue(ByVal areaCount As Variant) As String
    On Error Resume Next

    Dim count As Long
    count = Nz(areaCount, 0)

    If count <= 0 Then
        AreaCountToJsonValue = "null"
    Else
        AreaCountToJsonValue = CStr(count)
    End If
End Function

Private Function ParseTimeToSeconds_ASCA(ByVal timeValue As Variant) As Long
    On Error Resume Next
    If IsNull(timeValue) Or timeValue = "" Then ParseTimeToSeconds_ASCA = 0: Exit Function
    Dim cleanString As String
    cleanString = CStr(timeValue)
    cleanString = Replace(cleanString, ":", "")
    cleanString = Right("0000" & cleanString, 4)
    Dim minutes As Long, seconds As Long
    minutes = CLng(Left(cleanString, 2))
    seconds = CLng(Right(cleanString, 2))
    ParseTimeToSeconds_ASCA = (minutes * 60) + seconds
    If Err.Number <> 0 Then ParseTimeToSeconds_ASCA = 0: Err.Clear
End Function

Private Function ConvertTimeToSeconds(ByVal timeStr As Variant) As Double
    On Error Resume Next
    If IsNull(timeStr) Or Nz(timeStr, "") = "" Then
        ConvertTimeToSeconds = 0
        Exit Function
    End If

    Dim parts() As String
    Dim minutes As Double, seconds As Double

    If InStr(timeStr, ":") > 0 Then
        parts = Split(CStr(timeStr), ":")
        minutes = CDbl(Nz(parts(0), 0))
        seconds = CDbl(Nz(parts(1), 0))
        ConvertTimeToSeconds = (minutes * 60) + seconds
    Else
        ConvertTimeToSeconds = CDbl(Nz(timeStr, 0))
    End If
End Function

Private Function ConvertSecondsToTimeFormat(ByVal totalSeconds As Variant) As String
    On Error GoTo FormatError

    Dim dblSeconds As Double
    dblSeconds = CDbl(Nz(totalSeconds, 0))

    If dblSeconds <= 0 Then
        ConvertSecondsToTimeFormat = "00:00.00"
        Exit Function
    End If

    Dim minutes As Long
    Dim seconds As Long
    Dim hundredths As Long

    minutes = Int(dblSeconds) \ 60
    seconds = Int(dblSeconds) Mod 60
    hundredths = Round((dblSeconds - Int(dblSeconds)) * 100, 0)

    ConvertSecondsToTimeFormat = Format(minutes, "00") & ":" & Format(seconds, "00") & "." & Format(hundredths, "00")
    Exit Function

FormatError:
    ConvertSecondsToTimeFormat = "00:00.00"
End Function

Private Function ExtractNumber(ByVal inputText As Variant) As Long
    On Error Resume Next
    Dim cleanText As String, i As Integer, result As String
    cleanText = Nz(inputText, "0")
    result = ""
    For i = 1 To Len(cleanText)
        If IsNumeric(Mid(cleanText, i, 1)) Then result = result & Mid(cleanText, i, 1)
    Next i
    ExtractNumber = CLng(Nz(result, "0"))
    If Err.Number <> 0 Then ExtractNumber = 0: Err.Clear
End Function

Private Function GetDateFromString(ByVal dateText As Variant) As Date
    On Error GoTo DateError
    Dim cleanText As String
    cleanText = Nz(dateText, "")
    If InStr(cleanText, ",") > 0 Then cleanText = Trim(Mid(cleanText, InStr(cleanText, ",") + 1))
    If IsDate(cleanText) Then GetDateFromString = CDate(cleanText) Else GetDateFromString = Date
    Exit Function
DateError:
    GetDateFromString = Date
End Function

' NOTE: JsonSafe() is provided by mod_Global.bas - do not duplicate here

' ==========================================================================
' === EXTERNAL FUNCTION STUBS
' === These functions should exist in your Access database
' === If not, uncomment and implement them
' ==========================================================================

' NOTE: CalculateScores and Class_Placements should already exist in your
' Access database (typically in a scoring/results module). If you get
' "Sub or Function not defined" errors for these, you need to either:
' 1. Ensure your existing scoring module is loaded
' 2. Or uncomment and implement these placeholder functions:

' Private Sub CalculateScores()
'     ' Placeholder - implement your score calculation logic
'     ' This typically recalculates total scores, etc.
' End Sub

' Private Sub Class_Placements()
'     ' Placeholder - implement your placement calculation logic
'     ' This typically assigns 1st, 2nd, 3rd, etc. based on scores/times
' End Sub

