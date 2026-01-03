Attribute VB_Name = "mod_myK9Q"
Option Compare Database
Option Explicit
Private Declare PtrSafe Sub Sleep Lib "kernel32" (ByVal dwMilliseconds As Long)

Public Sub LinkPostgres(Optional bolForce As Boolean = False)
          Dim strCon

          'Driver={PostgreSQL ANSI};Server=IP address;Port=5432;Database=myDataBase;Uid=myUsername;Pwd=myPassword;
          'strCnn = "ODBC;DRIVER={PostgreSQL ANSI};Server=db.ggreahsjqzombkvagxle.supabase.co;Port=5432;Database=postgres;Uid=postgres;Pwd=XsjX8EoQr9tduoJl"
          'MSysObject Connect Field
          'DRIVER={PostgreSQL ANSI};DATABASE=postgres;SERVER=db.ggreahsjqzombkvagxle.supabase.co;PORT=5432;CA=d;A7=100;B0=255;B1=8190;BI=0;C2=;D6=-101;CX=1c305008b;A1=7.4
          
23520     strCon = "ODBC;DRIVER={PostgreSQL ANSI};Server=aws-0-us-west-1.pooler.supabase.com;Port=5432;Database=postgres;Uid=postgres.ggreahsjqzombkvagxle;Pwd=XsjX8EoQr9tduoJl"
          
          'Delete Linked Tables First
23530     Call DeleteLinkPostgres
          
          'Link myK9Q Postgres Tables
23540     DoCmd.TransferDatabase acLink, "ODBC", strCon, acTable, "public.tbl_show_queue", "public_tbl_show_queue"
23550     DoCmd.TransferDatabase acLink, "ODBC", strCon, acTable, "public.tbl_trial_queue", "public_tbl_trial_queue"
23560     DoCmd.TransferDatabase acLink, "ODBC", strCon, acTable, "public.tbl_class_queue", "public_tbl_class_queue"
23570     DoCmd.TransferDatabase acLink, "ODBC", strCon, acTable, "public.tbl_entry_queue", "public_tbl_entry_queue"

End Sub

Public Sub DeleteLinkPostgres()

      Dim td As DAO.TableDef

23580     For Each td In CurrentDb.TableDefs
              'Debug.Print td.Name
              
23590         If td.Name = "public_tbl_show_queue" Then
23600             CurrentDb.TableDefs.Delete td.Name
23610         ElseIf td.Name = "public_tbl_trial_queue" Then
23620             CurrentDb.TableDefs.Delete td.Name
23630         ElseIf td.Name = "public_tbl_class_queue" Then
23640             CurrentDb.TableDefs.Delete td.Name
23650         ElseIf td.Name = "public_tbl_entry_queue" Then
23660             CurrentDb.TableDefs.Delete td.Name
23670         End If
              
23680     Next
End Sub

Public Function myK9Q_License_Status(iShowID As Integer, strClubname As String)

23690   On Error Resume Next

        Dim strAction As String, strKey As String, strStartDate As String, strProduct As String
        Dim db As DAO.Database
        Dim rs As DAO.Recordset
        Dim dExpDate As Date
        
23700   If CheckInternetConnectivity = True Then

23710       Set db = CurrentDb
23720       Set rs = db.OpenRecordset("SELECT MobileAppLicKey, MobileAppLicKeyStatus FROM tbl_Show WHERE ShowID = " & iShowID)
          
          
23730       strAction = "status-check"
23740       strProduct = "myK9Q"
          
23750       strStartDate = DLookup("StartDate", "tbl_Show", "showID = " & iShowID)
23760       strKey = DLookup("MobileAppLicKey", "tbl_Show", "showID = " & iShowID)
23770       strClubname = strClubname & "-" & strStartDate
          
          
23780       If InStr(1, strKey, "myK9Q") Then
23790           rs.Edit
23800           rs!MobileAppLicKeyStatus = "Verifying Key Status"
23810           rs!MobileAppLicKeyStatus = WebRequest(strAction, strProduct, strKey, strClubname, dExpDate)
23820           rs.Update
                
23830           If InStr(rs!MobileAppLicKeyStatus, "License key is Active") Then
23840               myK9Q_License_Status = True
23850           Else
23860               myK9Q_License_Status = False
23870           End If
23880       End If

23890   Else
23900       MsgBox "Unable to validate License Keywithout Internet Connectivity", vbInformation, "No Internet Connectivity"
23910       Exit Function
23920   End If

End Function

Public Sub myK9QDelete(strCalledBy)

          Dim strMobileAppLicKey As String
          Dim iClassID As Integer
          Dim iTrialID As Integer
          Dim iShowID As Integer
          Dim strResult As String
          Dim intEntries As Integer
          Dim intEntriesA As Integer
          Dim strSQL As String
          Dim qdf As QueryDef
          Dim strElement As String
          Dim strLevel As String
          Dim rs As DAO.Recordset
          Dim db As DAO.Database
          Dim intCount As Integer
          Dim i As Integer
          
          
23930     iShowID = TempVars!tmpShowID.Value
23940     strMobileAppLicKey = Nz(DLookup("MobileAppLicKey", "tbl_Show", "showID = " & iShowID), 0)
23950     TempVars.Add "tmpMobileAppLicKey", strMobileAppLicKey

23960     If strMobileAppLicKey = "0" Then
23970           MsgBox "Show does not have an active myK9Q App License Key"
23980           Exit Sub
23990     End If
          
24000     strResult = MsgBox("Are you sure you want to Delete data from myK9Q?", vbQuestion + vbYesNo, "Delete myK9Q Data")
          
24010     If strResult = vbYes Then
              'Link myK9Q Tables
24020         Call LinkPostgres
          
24030     If strCalledBy = "Show" Then

              'Progress
24040         intEntries = DCount("entryID", "tbl_Entry", "ShowID_FK = " & iShowID)
24050         DoCmd.OpenForm "frm_Progress_myK9Q"
24060         Forms!frm_Progress_myK9Q.lblCurrentTask.Caption = "Deleting " & intEntries & " Entries for Show ID: " & iShowID
24070         Forms!frm_Progress_myK9Q.Repaint

              'Delete Show
24080         strSQL = "DELETE * FROM public_tbl_show_queue WHERE mobile_app_lic_key = '" & strMobileAppLicKey & "';"
              'Debug.Print strSQL
24090         CurrentDb.Execute strSQL
              
              'Delete Trials
24100         strSQL = "DELETE * FROM public_tbl_trial_queue WHERE mobile_app_lic_key = '" & strMobileAppLicKey & "';"
24110         CurrentDb.Execute strSQL
              
              'Delete Classes
24120         strSQL = "DELETE * FROM public_tbl_class_queue WHERE mobile_app_lic_key = '" & strMobileAppLicKey & "';"
24130         CurrentDb.Execute strSQL
              
              'Delete Entries for Show
              'Novice
24140         strSQL = "DELETE FROM public.tbl_entry_queue WHERE level = 'Novice' AND mobile_app_lic_key = '" & strMobileAppLicKey & "';"
              'Debug.Print strSQL
24150         CurrentDb.Execute strSQL

              'Open
24160         strSQL = "DELETE FROM public.tbl_entry_queue WHERE level = 'Open' AND mobile_app_lic_key = '" & strMobileAppLicKey & "';"
              'Debug.Print strSQL
24170         CurrentDb.Execute strSQL
              
              'Advanced
24180         strSQL = "DELETE FROM public.tbl_entry_queue WHERE level = 'Advanced' AND mobile_app_lic_key = '" & strMobileAppLicKey & "';"
              'Debug.Print strSQL
24190         CurrentDb.Execute strSQL
              
              'Excellent
24200         strSQL = "DELETE FROM public.tbl_entry_queue WHERE level = 'Excellent' AND mobile_app_lic_key = '" & strMobileAppLicKey & "';"
              'Debug.Print strSQL
24210         CurrentDb.Execute strSQL
              



24220     ElseIf strCalledBy = "Trial" Then
              
              'Progress
24230         iTrialID = TempVars!tmpTrialID.Value
24240         intEntries = DCount("entryID", "public_tbl_entry_queue", "trialid_fk = " & iTrialID)

24250         DoCmd.OpenForm "frm_Progress_myK9Q"
24260         Forms!frm_Progress_myK9Q.lblCurrentTask.Caption = "Deleting " & intEntries & " Entries for Trial ID: " & iTrialID
24270         Forms!frm_Progress_myK9Q.Repaint


                'Get list of Class IDs in Trial
24280           strSQL = "Select DISTINCT public_tbl_entry_queue.classID_fk from public_tbl_entry_queue where public_tbl_entry_queue.trialid_fk = " & iTrialID & ";"

24290           Set db = CurrentDb
24300           Set rs = db.OpenRecordset(strSQL)
                
24310           If Not rs.BOF And Not rs.EOF Then
24320               rs.MoveLast
24330               rs.MoveFirst
24340               intCount = rs.RecordCount
        
                    'Loop through classes and delete entries
24350               For i = 1 To intCount
24360                   iClassID = rs!ClassID_FK
24370                   intEntries = DCount("entryID", "tbl_Entry", "ClassID_FK = " & iClassID)

24380                   Forms!frm_Progress_myK9Q.lblCurrentTask.Caption = "Deleting " & intEntries & " Entries for Class ID: " & iClassID
24390                   Forms!frm_Progress_myK9Q.Repaint
                        
24400                   strSQL = "DELETE public_tbl_entry_queue.classid_fkID FROM public_tbl_entry_queue WHERE classid_fk = " & iClassID & ";"
24410                   DoCmd.RunSQL strSQL
24420                   rs.MoveNext
24430               Next
24440           End If

              'Delete from Trial Table
24450         strSQL = "DELETE public_tbl_trial_queue.trialid FROM public_tbl_trial_queue WHERE public_tbl_trial_queue.mobile_app_lic_key = '" & strMobileAppLicKey & "' AND public_tbl_trial_queue.trialid = " & iTrialID & ";"
              'Debug.Print strSQL
24460         CurrentDb.Execute strSQL
              
              'Delete from Class Table
24470         strSQL = "DELETE public_tbl_class_queue.trialid_fk FROM public_tbl_class_queue WHERE public_tbl_class_queue.mobile_app_lic_key = '" & strMobileAppLicKey & "' AND public_tbl_class_queue.trialid_fk = " & iTrialID & ";"
              'Debug.Print strSQL
24480         CurrentDb.Execute strSQL

24490     ElseIf strCalledBy = "Class" Then
              
              'Progress
24500         iClassID = TempVars!tmpClassID.Value
24510         intEntries = DCount("entryID", "tbl_Entry", "ClassID_FK = " & iClassID)
              
24520         DoCmd.OpenForm "frm_Progress_myK9Q"
24530         Forms!frm_Progress_myK9Q.lblCurrentTask.Caption = "Deleting " & intEntries & " Entries for Class ID: " & iClassID
24540         Forms!frm_Progress_myK9Q.Repaint

24550         strSQL = "DELETE public_tbl_entry_queue.classid_fk FROM public_tbl_entry_queue WHERE mobile_app_lic_key = '" & strMobileAppLicKey & "' AND classid_fk = " & iClassID & ";"
24560         CurrentDb.Execute strSQL
              
24570         If Forms!frm_Class_Main.txtSection = "-" Then
24580           strSQL = "DELETE public_tbl_class_queue.classid FROM public_tbl_class_queue WHERE mobile_app_lic_key = '" & strMobileAppLicKey & "' AND classid = " & iClassID & ";"
24590           CurrentDb.Execute strSQL

24600         Else
                  'Figure out if A or B entries exist for this class
24610             iTrialID = Forms!frm_Class_Main.txtTrialID
24620             strElement = Forms!frm_Class_Main.txtElement
24630             strLevel = Forms!frm_Class_Main.txtLevel
24640             intEntriesA = DCount("entryID", "public_tbl_entry_queue", "element = '" & strElement & "' AND level = '" & strLevel & "' AND mobile_app_lic_key = '" & strMobileAppLicKey & "' AND trialid_fk = " & iTrialID)
                
24650             If intEntriesA = 0 Then
24660                 strSQL = "DELETE public_tbl_class_queue.classid FROM public_tbl_class_queue WHERE mobile_app_lic_key = '" & strMobileAppLicKey & "' AND element = '" & strElement & "' AND level = '" & strLevel & "' AND trialid_fk = " & iTrialID & ";"
24670                 CurrentDb.Execute strSQL
24680             End If
24690         End If
              
24700     End If
          
24710     DoCmd.Close acForm, "frm_Progress_myK9Q", acSaveNo
          
24720     MsgBox "Requested Data has been Deleted from the myK9Q app", vbInformation, "Data Deleted"
24730   End If

End Sub

Public Sub myK9Q_Class_Result_Download()

          Dim iEntries As Integer
          Dim iShowID As Integer
          Dim iTrialID As Integer
          Dim iClassID As Integer
          Dim iEntryID As Integer
          Dim iCount As Integer
          Dim i As Integer
          Dim strSQL As String
          Dim strMobileAppLicKey As String
          Dim db As DAO.Database
          Dim rs As DAO.Recordset
          Dim strmyK9Q As String
          Dim strClubname As String
          Dim intCount As Integer
          Dim iClubID As Integer
          
24740     Set db = CurrentDb
          
          'Link myK9Q Tables
24750     Call LinkPostgres
          
24760     iClassID = Forms!frm_Class_Main.txtClassID
24770     iTrialID = DLookup("trialID_FK", "tbl_Class", "classID = " & iClassID)
24780     iShowID = DLookup("ShowID_FK", "tbl_Trial", "trialID = " & iTrialID)
24790     iClubID = Nz(DLookup("ClubID_FK", "tbl_Show", "ShowID = " & iShowID), 0)
24800     strMobileAppLicKey = DLookup("MobileAppLicKey", "tbl_Show", "showID = " & iShowID)

          'Check if Valid License
24810     strmyK9Q = Nz(DLookup("MobileAppLicKeyStatus", "tbl_Show", "showID = " & iShowID), 0)
          
24820     If InStr(1, strmyK9Q, "Active and Valid") Then

24830             strClubname = Forms!frm_Class_Main.txtASCAClubName
24840             intCount = 1
24850             i = 1
          
                  'Progress Bar
24860             DoCmd.OpenForm "frm_Progress_myK9Q", acNormal
24870             Forms!frm_Progress_myK9Q.lblCurrentTask.Caption = "Verifying License Key for Club ID: " & iClubID
                
24880             Call myK9Q_License_Status(iShowID, strClubname)
24890             intCount = DCount("entryID", "tbl_Entry", "TrialID_FK = " & iTrialID)

24900     Else
24910         MsgBox "Unable to Upload data without a Valid myK9Q License Key. Check myK9Q License Key and Status and Retry.", vbInformation, "myK9Q License Key"
24920         Exit Sub
24930     End If
          
          'Progress Dialog
24940     iEntries = DCount("entryID", "tbl_Entry", "ClassID_FK = " & iClassID)
24950     DoCmd.OpenForm "frm_Progress_myK9Q"
24960     Forms!frm_Progress_myK9Q.lblCurrentTask.Caption = "Downloading Results for " & iEntries & " Entries for Class ID: " & iClassID
24970     Forms!frm_Progress_myK9Q.Repaint

          'Update Class Time Limits
24980     strSQL = "UPDATE public_tbl_class_queue INNER JOIN tbl_Class ON public_tbl_class_queue.classid = tbl_Class.classID SET tbl_Class.TimeLimit = [public_tbl_class_queue].[time_limit], tbl_Class.TimeLimit2 = [public_tbl_class_queue].[time_limit2], tbl_Class.TimeLimit3 = [public_tbl_class_queue].[time_limit3] " & _
                   "WHERE (((public_tbl_class_queue.classid) = " & [TempVars]![tmpClassID] & "));"
          'Debug.Print strSQL
24990     db.Execute strSQL
                
                
          'Update Results in Entry table from myK9Q
25000     strSQL = "UPDATE tbl_Show INNER JOIN ((public_tbl_entry_queue INNER JOIN tbl_Entry ON public_tbl_entry_queue.entryid = tbl_Entry.entryID) INNER JOIN tbl_Trial ON tbl_Entry.TrialID_FK = tbl_Trial.trialID) ON (tbl_Show.MobileAppLicKey = public_tbl_entry_queue.mobile_app_lic_key) AND (tbl_Show.showID = tbl_Trial.ShowID_FK) SET tbl_Entry.NQReason = [public_tbl_entry_queue].[Reason], tbl_Entry.SearchTime = [public_tbl_entry_queue].[search_time], tbl_Entry.AreaTime1 = [public_tbl_entry_queue].[areatime1], tbl_Entry.AreaTime2 = [public_tbl_entry_queue].[areatime2], tbl_Entry.AreaTime3 = [public_tbl_entry_queue].[areatime3], tbl_Entry.FaultHE = [public_tbl_entry_queue].[fault_count], tbl_Entry.result_text = [public_tbl_entry_queue].[result_text] " & _
                   "WHERE (((tbl_Entry.classID_FK)=" & iClassID & ") AND mobile_app_lic_key = '" & strMobileAppLicKey & "' AND ((tbl_Entry.Qualified)=False) AND ((tbl_Entry.NQ)=False) AND ((tbl_Entry.Excused)=False) AND ((tbl_Entry.Absent)=False) AND ((tbl_Entry.Withdrawn)=False));"
          'Debug.Print strSQL
25010     db.Execute strSQL
          
25020     strSQL = "SELECT tbl_Entry.entryID, tbl_Entry.classID_FK, tbl_Show.MobileAppLicKeyStatus, tbl_Entry.result_text, tbl_Entry.Qualified, tbl_Entry.NQ, tbl_Entry.Excused, tbl_Entry.Absent, tbl_Entry.Withdrawn " & _
                   "FROM tbl_Show INNER JOIN tbl_Entry ON tbl_Show.showID = tbl_Entry.showID_FK " & _
                   "WHERE tbl_Entry.classID_FK = " & iClassID & " AND tbl_Show.MobileAppLicKey = '" & strMobileAppLicKey & "' AND tbl_Entry.result_text Is Not Null AND tbl_Entry.Qualified = False AND tbl_Entry.NQ = False AND tbl_Entry.Excused = False AND tbl_Entry.Absent = False  AND tbl_Entry.Withdrawn = False;"
          'Debug.Print strSQL
25030     Set rs = db.OpenRecordset(strSQL)
            
25040     If Not rs.BOF And Not rs.EOF Then
25050         rs.MoveLast
25060         rs.MoveFirst
25070         iCount = rs.RecordCount
25080         strSQL = ""

              'Loop and update entries
25090         For i = 1 To iCount
25100             iEntryID = rs!entryID
                  'Debug.Print iEntryID & " - " & rs!result_text
                  
25110             If rs!result_text = "Qualified" Then
25120                 strSQL = "UPDATE tbl_Entry SET tbl_Entry.Qualified = True WHERE tbl_Entry.entryID = " & iEntryID & ";"
25130             ElseIf rs!result_text = "NQ" Then
25140                 strSQL = "UPDATE tbl_Entry SET tbl_Entry.NQ = True WHERE tbl_Entry.entryID = " & iEntryID & ";"
25150             ElseIf rs!result_text = "Absent" Then
25160                 strSQL = "UPDATE tbl_Entry SET tbl_Entry.Absent = True WHERE tbl_Entry.entryID = " & iEntryID & ";"
25170             ElseIf rs!result_text = "EX" Then
25180                 strSQL = "UPDATE tbl_Entry SET tbl_Entry.Excused = True WHERE tbl_Entry.entryID = " & iEntryID & ";"
25190             ElseIf rs!result_text = "WD" Then
25200                 strSQL = "UPDATE tbl_Entry SET tbl_Entry.Withdrawn = True WHERE tbl_Entry.entryID = " & iEntryID & ";"
25210             End If

25220             If strSQL <> "" Then
25230               db.Execute strSQL
25240             End If
                  
25250             rs.MoveNext
25260         Next
25270     End If
            
          'Calculate Placements
25280     Call Class_Placements
          
25290     DoCmd.Close acForm, "frm_Progress_myK9Q", acSaveNo
25300     Forms!frm_Class_Main.Refresh
25310     MsgBox "Only entries with no results will be updated. " & vbCr & vbCr & iEntries & " entries in the class and " & iCount & " entries updated." & vbCr & vbCr & "You may need to refresh the class page.", vbInformation, "Download Complete"

End Sub

Public Sub myK9Q_Upload()

          'On Error GoTo fError
25320 On Error Resume Next

          'Export for Adding myK9Q Entries
          Dim iShowID As Integer
          Dim iTrialID As Integer
          Dim strSQL As String
          Dim strmyK9Q As String
          Dim strClubname As String
          Dim intCount As Long
          
          Dim db As DAO.Database
          Dim rs As DAO.Recordset
          Dim i As Long
          'Dim strFileName As String
          Dim api_url As String
          'Dim strFilePath As String, strFileField As String, strDataPairs As String
          Dim strLicenseStatus
          Dim iEntries As Integer
          Dim iClubID As Integer
          Dim iEntryID As Integer
                   
          'Link myK9Q Tables
25330     Call LinkPostgres
          
25340     iShowID = Forms!frm_Trial.txtShowID
25350     iTrialID = Forms!frm_Trial.txtTrialID
25360     TempVars.Add "tmpmyK9QClassID", [TempVars]![tmpClassID].Value
          
25370     iClubID = Nz(DLookup("ClubID_FK", "tbl_Show", "ShowID = " & iShowID), 0)

25380     strmyK9Q = Nz(DLookup("MobileAppLicKeyStatus", "tbl_Show", "showID = " & iShowID), 0)

          'Check if Valid License
25390     If InStr(1, strmyK9Q, "Active and Valid") Then

25400             strClubname = Forms!frm_Trial.txtASCAClubName
25410             intCount = 1
25420             i = 1
          
                  'Progress Bar
25430             DoCmd.OpenForm "frm_Progress_myK9Q", acNormal
25440             Forms!frm_Progress_myK9Q.lblCurrentTask.Caption = "Verifying License Key for Club ID: " & iClubID
                
25450             Call myK9Q_License_Status(iShowID, strClubname)
25460             intCount = DCount("entryID", "tbl_Entry", "TrialID_FK = " & iTrialID)

25470     Else
25480         MsgBox "Unable to Upload data without a Valid myK9Q License Key. Check myK9Q License Key and Status and Retry.", vbInformation, "myK9Q License Key"
25490         Exit Sub
25500     End If
              
              
          'Append myK9Q tables
25510     strLicenseStatus = DLookup("MobileAppLicKeyStatus", "tbl_Show", "showID = " & iShowID)
          
25520     If InStr(1, strLicenseStatus, "Active and Valid") Then

25530       Set db = CurrentDb

            'Debug.Print TempVars.tmpCalledFrom.value
              
            'Insert Trials
25540       Forms!frm_Progress_myK9Q.lblCurrentTask.Caption = "Uploading Trial ID: " & iTrialID
25550       Forms!frm_Progress_myK9Q.Repaint

25560       DoCmd.SetWarnings False
           
25570           strSQL = "INSERT INTO public_tbl_show_queue ( clubname, mobile_app_lic_key, startdate, enddate, showid, showname, org, eventurl ) " & _
                         "SELECT qry_myK9Q_tbl_show_queue.ASCAClubName, qry_myK9Q_tbl_show_queue.MobileAppLicKey, qry_myK9Q_tbl_show_queue.startdate, qry_myK9Q_tbl_show_queue.enddate, qry_myK9Q_tbl_show_queue.showid, qry_myK9Q_tbl_show_queue.showname, 'ASCA Scent Detection', qry_myK9Q_tbl_show_queue.eventurl " & _
                         "FROM qry_myK9Q_tbl_show_queue LEFT JOIN public_tbl_show_queue ON (qry_myK9Q_tbl_show_queue.showid = public_tbl_show_queue.showid) AND (qry_myK9Q_tbl_show_queue.MobileAppLicKey = public_tbl_show_queue.mobile_app_lic_key) " & _
                         "WHERE (((public_tbl_show_queue.showid) Is Null));"
                         
25580           DoCmd.RunSQL strSQL
              
25590       If TempVars!tmpCalledFrom.Value = "Class" Then
25600           strSQL = "INSERT INTO public_tbl_trial_queue ( clubname, mobile_app_lic_key, trial_date, trial_number, trialID, org ) " & _
                         "SELECT qry_myK9Q_tbl_trial_queue_class.ASCAClubName, qry_myK9Q_tbl_trial_queue_class.MobileAppLicKey, qry_myK9Q_tbl_trial_queue_class.trial_long_date, qry_myK9Q_tbl_trial_queue_class.TrialNumber, qry_myK9Q_tbl_trial_queue_class.trialID, 'ASCA Scent Detection' " & _
                         "FROM qry_myK9Q_tbl_trial_queue_class LEFT JOIN public_tbl_trial_queue ON (qry_myK9Q_tbl_trial_queue_class.trialID = public_tbl_trial_queue.trialid) AND (qry_myK9Q_tbl_trial_queue_class.MobileAppLicKey = public_tbl_trial_queue.mobile_app_lic_key) " & _
                         "WHERE (((public_tbl_trial_queue.trialid) Is Null)) " & _
                         "ORDER BY qry_myK9Q_tbl_trial_queue_class.trialID;"
25610       Else
25620           strSQL = "INSERT INTO public_tbl_trial_queue ( clubname, mobile_app_lic_key, trial_date, trial_number, trialID, org ) " & _
                         "SELECT qry_myK9Q_tbl_trial_queue_trial.ASCAClubName, qry_myK9Q_tbl_trial_queue_trial.MobileAppLicKey, qry_myK9Q_tbl_trial_queue_trial.trial_long_date, qry_myK9Q_tbl_trial_queue_trial.TrialNumber, qry_myK9Q_tbl_trial_queue_trial.trialID, 'ASCA Scent Detection' " & _
                         "FROM qry_myK9Q_tbl_trial_queue_trial LEFT JOIN public_tbl_trial_queue ON (qry_myK9Q_tbl_trial_queue_trial.trialID = public_tbl_trial_queue.trialid) AND (qry_myK9Q_tbl_trial_queue_trial.MobileAppLicKey = public_tbl_trial_queue.mobile_app_lic_key) " & _
                         "WHERE (((public_tbl_trial_queue.trialid) Is Null)) " & _
                         "ORDER BY qry_myK9Q_tbl_trial_queue_trial.trialID;"
25630       End If
                     
            'Debug.Print strSQL
25640       DoCmd.RunSQL strSQL


            'Insert Classes
25650       Forms!frm_Progress_myK9Q.lblCurrentTask.Caption = "Uploading Classes for Trial ID: " & iTrialID
25660       Forms!frm_Progress_myK9Q.Repaint
                     
25670       If TempVars!tmpCalledFrom = "Class" Then
25680           strSQL = "INSERT INTO public_tbl_class_queue ( mobile_app_lic_key, class_order, classID, TrialID_FK, trial_date, trial_number, Element, [Level], [Section], judge_name, time_limit, time_limit2, time_limit3, areas ) " & _
                         "SELECT qry_myK9Q_tbl_class_queue_class.MobileAppLicKey, qry_myK9Q_tbl_class_queue_class.ClassOrder, qry_myK9Q_tbl_class_queue_class.classID, qry_myK9Q_tbl_class_queue_class.TrialID_FK, qry_myK9Q_tbl_class_queue_class.trial_long_date, qry_myK9Q_tbl_class_queue_class.TrialNumber, qry_myK9Q_tbl_class_queue_class.Element, qry_myK9Q_tbl_class_queue_class.Level, qry_myK9Q_tbl_class_queue_class.Section, qry_myK9Q_tbl_class_queue_class.judge_name, qry_myK9Q_tbl_class_queue_class.Time_Limit, qry_myK9Q_tbl_class_queue_class.Time_Limit2, qry_myK9Q_tbl_class_queue_class.Time_Limit3, qry_myK9Q_tbl_class_queue_class.Areas " & _
                         "FROM qry_myK9Q_tbl_class_queue_class LEFT JOIN public_tbl_class_queue ON (qry_myK9Q_tbl_class_queue_class.MobileAppLicKey = public_tbl_class_queue.mobile_app_lic_key) AND (qry_myK9Q_tbl_class_queue_class.classID = public_tbl_class_queue.classid) " & _
                         "WHERE (((public_tbl_class_queue.classid) Is Null)) " & _
                         "ORDER BY qry_myK9Q_tbl_class_queue_class.classID;"
25690       Else
25700           strSQL = "INSERT INTO public_tbl_class_queue ( mobile_app_lic_key, class_order, classID, TrialID_FK, trial_date, trial_number, Element, [Level], [Section], judge_name, time_limit, time_limit2, time_limit3, areas ) " & _
                         "SELECT qry_myK9Q_tbl_class_queue_trial.MobileAppLicKey, qry_myK9Q_tbl_class_queue_trial.ClassOrder, qry_myK9Q_tbl_class_queue_trial.classID, qry_myK9Q_tbl_class_queue_trial.TrialID_FK, qry_myK9Q_tbl_class_queue_trial.trial_long_date, qry_myK9Q_tbl_class_queue_trial.TrialNumber, qry_myK9Q_tbl_class_queue_trial.Element, qry_myK9Q_tbl_class_queue_trial.Level, qry_myK9Q_tbl_class_queue_trial.Section, qry_myK9Q_tbl_class_queue_trial.judge_name, qry_myK9Q_tbl_class_queue_trial.Time_Limit, qry_myK9Q_tbl_class_queue_trial.Time_Limit2, qry_myK9Q_tbl_class_queue_trial.Time_Limit3, qry_myK9Q_tbl_class_queue_trial.Areas " & _
                         "FROM qry_myK9Q_tbl_class_queue_trial LEFT JOIN public_tbl_class_queue ON (qry_myK9Q_tbl_class_queue_trial.MobileAppLicKey = public_tbl_class_queue.mobile_app_lic_key) AND (qry_myK9Q_tbl_class_queue_trial.classID = public_tbl_class_queue.classid) " & _
                         "WHERE (((public_tbl_class_queue.classid) Is Null)) " & _
                         "ORDER BY qry_myK9Q_tbl_class_queue_trial.classID;"
25710       End If

            'Debug.Print strSQL
25720       DoCmd.RunSQL strSQL
            
            'Insert Entries
25730       iEntries = DCount("entryID", "tbl_Entry", "classID_FK = " & [TempVars]![tmpmyK9QClassID].Value)
25740       Forms!frm_Progress_myK9Q.lblCurrentTask.Caption = "Uploading " & iEntries & " Entries for Class ID: " & [TempVars]![tmpmyK9QClassID].Value
25750       Forms!frm_Progress_myK9Q.Repaint
                     
25760       If TempVars!tmpCalledFrom = "Class" Then
25770           strSQL = "INSERT INTO public_tbl_entry_queue ( mobile_app_lic_key, entryID, TrialID_FK, classID_FK, trial_date, trial_number, Element, [Level], [Section], exhibitor_order, Armband, Exclude, call_name, breed, handler ) " & _
                         "SELECT qry_myK9Q_tbl_entry_queue_class.MobileAppLicKey, qry_myK9Q_tbl_entry_queue_class.entryID, qry_myK9Q_tbl_entry_queue_class.TrialID_FK, qry_myK9Q_tbl_entry_queue_class.classID_FK, qry_myK9Q_tbl_entry_queue_class.trial_long_date, qry_myK9Q_tbl_entry_queue_class.TrialNumber, qry_myK9Q_tbl_entry_queue_class.Element, qry_myK9Q_tbl_entry_queue_class.Level, qry_myK9Q_tbl_entry_queue_class.Section, qry_myK9Q_tbl_entry_queue_class.ExhibitorOrder, qry_myK9Q_tbl_entry_queue_class.Armband, qry_myK9Q_tbl_entry_queue_class.Exclude, qry_myK9Q_tbl_entry_queue_class.CallName, qry_myK9Q_tbl_entry_queue_class.BreedName, qry_myK9Q_tbl_entry_queue_class.HandlerName " & _
                         "FROM qry_myK9Q_tbl_entry_queue_class LEFT JOIN public_tbl_entry_queue ON (qry_myK9Q_tbl_entry_queue_class.entryID = public_tbl_entry_queue.entryid) AND (qry_myK9Q_tbl_entry_queue_class.MobileAppLicKey = public_tbl_entry_queue.mobile_app_lic_key) " & _
                         "WHERE (((public_tbl_entry_queue.entryID) Is Null)) " & _
                         "ORDER BY qry_myK9Q_tbl_entry_queue_class.entryID;"
                         
                'Debug.Print strSQL
                         
25780           DoCmd.RunSQL strSQL
25790       Else
            
25800           strSQL = "SELECT tbl_Class.TrialID_FK, tbl_Class.classID FROM tbl_Class WHERE tbl_Class.TrialID_FK = " & iTrialID & " ORDER BY tbl_Class.classID;"
                
                'Debug.Print strSQL
                            
25810           Set rs = db.OpenRecordset(strSQL)
              
25820           If Not rs.BOF And Not rs.EOF Then
25830               rs.MoveLast
25840               rs.MoveFirst
25850               intCount = rs.RecordCount
                
25860               For i = 1 To intCount
25870                   TempVars.Add "tmpmyK9QClassID", rs!classID.Value
                        'Debug.Print i & " - " & TempVars!tmpmyK9QClassID
                        
25880                   iEntries = DCount("entryID", "tbl_Entry", "classID_FK = " & [TempVars]![tmpmyK9QClassID].Value)
25890                   Forms!frm_Progress_myK9Q.lblCurrentTask.Caption = "Uploading " & iEntries & " Entries for Class ID: " & [TempVars]![tmpmyK9QClassID].Value
25900                   Forms!frm_Progress_myK9Q.Repaint
                        
25910                   strSQL = "INSERT INTO public_tbl_entry_queue ( mobile_app_lic_key, entryID, TrialID_FK, classID_FK, trial_date, trial_number, Element, [Level], [Section], exhibitor_order, Armband, Exclude, call_name, breed, handler ) " & _
                                 "SELECT qry_myK9Q_tbl_entry_queue_class.MobileAppLicKey, qry_myK9Q_tbl_entry_queue_class.entryID, qry_myK9Q_tbl_entry_queue_class.TrialID_FK, qry_myK9Q_tbl_entry_queue_class.classID_FK, qry_myK9Q_tbl_entry_queue_class.trial_long_date, qry_myK9Q_tbl_entry_queue_class.TrialNumber, qry_myK9Q_tbl_entry_queue_class.Element, qry_myK9Q_tbl_entry_queue_class.Level, qry_myK9Q_tbl_entry_queue_class.Section, qry_myK9Q_tbl_entry_queue_class.ExhibitorOrder, qry_myK9Q_tbl_entry_queue_class.Armband, qry_myK9Q_tbl_entry_queue_class.Exclude, qry_myK9Q_tbl_entry_queue_class.CallName, qry_myK9Q_tbl_entry_queue_class.BreedName, qry_myK9Q_tbl_entry_queue_class.HandlerName " & _
                                 "FROM qry_myK9Q_tbl_entry_queue_class LEFT JOIN public_tbl_entry_queue ON (qry_myK9Q_tbl_entry_queue_class.entryID = public_tbl_entry_queue.entryid) AND (qry_myK9Q_tbl_entry_queue_class.MobileAppLicKey = public_tbl_entry_queue.mobile_app_lic_key) " & _
                                 "WHERE (((public_tbl_entry_queue.entryID) Is Null)) " & _
                                 "ORDER BY qry_myK9Q_tbl_entry_queue_class.entryID;"
                    
                        'Debug.Print strSQL
                        
25920                   DoCmd.RunSQL strSQL
25930                   rs.MoveNext
25940               Next
25950           End If
25960       End If
            
            'Remove Deleted Entries for example Move Ups
25970       strSQL = "SELECT tbl_Deleted_Entry_Temp.MobileAppLicKey, tbl_Deleted_Entry_Temp.entryID, tbl_Deleted_Entry_Temp.showID " & _
                     "FROM tbl_Deleted_Entry_Temp " & _
                     "WHERE tbl_Deleted_Entry_Temp.showID = " & iShowID & ";"
            
25980       Set rs = db.OpenRecordset(strSQL)
              
25990       If Not rs.BOF And Not rs.EOF Then
26000           rs.MoveLast
26010           rs.MoveFirst
26020           intCount = rs.RecordCount

                'Loop and delete entries
26030           For i = 1 To intCount
26040               iEntryID = rs!entryID
                    'Debug.Print iEntryID
26050               strSQL = "DELETE public_tbl_entry_queue.entryID FROM public_tbl_entry_queue WHERE entryID = " & iEntryID & ";"
26060                DoCmd.RunSQL strSQL
26070               rs.MoveNext
26080           Next
26090       End If

            'Close Progress
26100       DoCmd.Close acForm, "frm_Progress_myK9Q", acSaveNo

26110       MsgBox "myK9Q Upload for Trial ID " & iTrialID & " Complete", vbInformation, "myK9Q Upload Complete"
26120       DoCmd.SetWarnings True
                  
            'Cleanup
            'db.QueryDefs.Delete "tmpExport"
26130       db.Close
26140       Set db = Nothing
            'Set qd = Nothing
            'Set fd = Nothing
26150   Else
26160       MsgBox "License Key is not Active or Invalid", vbInformation, "License Key"
26170   End If



fError_Exit:
26180     On Error Resume Next
26190     Exit Sub

fError:
      'Debug.Print Err.Number
26200     Select Case Err.Number

             Case 2501
                  'Do Nothing
                  
26210         Case 3155
                  'Do Nothing
                  
26220         Case Else
                  'MsgBox "Error: " & Err.Number & vbCrLf & Err.Description & vbCrLf & "Line: " & Erl, vbCritical, "Warning", Err.HelpFile, Err.HelpContext
26230     End Select

End Sub

