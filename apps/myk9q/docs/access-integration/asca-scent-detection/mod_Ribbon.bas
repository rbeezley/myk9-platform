Attribute VB_Name = "mod_Ribbon"
Option Compare Database
Option Explicit
Public objRibbon As IRibbonUI


Public Sub fncOnAction(control As IRibbonControl)
36920     On Error GoTo fError

          Dim strPDf As String, strXFDF As String, strCalledBy As String
          Dim iRecCount As Integer
          Dim iSub As Integer
          Dim strSQL As String
          Dim strHD As String
          Dim strQuery As String
          Dim iResult As Integer
          Dim strClubname As String
          Dim iTrialID As Integer
          Dim strElement As String
          Dim strLevel As String
          Dim strSection As String
              
36930     Select Case control.ID
          
      'HOME -------------------------------------------------------------------------
              Case "btNewShow"
36940             DoCmd.OpenForm "frm_Show_DE"
              
36950         Case "btNewTrial"
36960             DoCmd.OpenForm "frm_Trial_DE"
                  
36970         Case "btNewClass"
36980             DoCmd.OpenForm "frm_Class_DE"
              
36990         Case "btNewPerson"
37000             DoCmd.OpenForm "frm_Person_DE"
              
37010         Case "btNewDog"
37020             DoCmd.OpenForm "frm_Exhibitor_DE"
              
37030         Case "btEnterDog_Home"
37040             DoCmd.OpenForm "frm_Entry_DE"

37050         Case "btImportFile"
37060             TempVars.Add "tmpCalledFrom", "HomeImport"
37070             Call BackUpAndCompactBE(True)
37080             DoCmd.OpenForm "frm_Import_Instructions"
            
37090         Case "btViewShowDetails"
37100             iRecCount = DCount("ShowID", "tbl_Show", "ShowStatus = 'Open'")
37110             If iRecCount > 0 Then
                      'TempVars.Add "tmpShowFilter", "open"
37120             Else
37130                 iRecCount = DCount("ShowID", "tbl_Show", "ShowStatus = 'Closed'")
37140                 If iRecCount > 0 Then
                          'TempVars.Add "tmpShowFilter", "closed"
37150                 Else
37160                     MsgBox "There are no Shows in the database", vbInformation, "No Shows Found"
37170                     Exit Sub
37180                 End If
37190             End If
37200             DoCmd.OpenForm "frm_Show"
              
37210         Case "btViewShowList"
37220             DoCmd.OpenForm "frm_Show_List", View:=acFormDS
              
37230         Case "btViewTrialDetails"
37240             iRecCount = DCount("TrialID", "tbl_Trial", "TrialStatus = 'Open'")
37250             If iRecCount > 0 Then
                      'TempVars.Add "tmpTrialFilter", "open"
37260             Else
37270                 iRecCount = DCount("TrialID", "tbl_Trial", "TrialStatus = 'Closed'")
37280                 If iRecCount > 0 Then
                          'TempVars.Add "tmpTrialFilter", "closed"
37290                 Else
37300                     MsgBox "There are no Trials in the database", vbInformation, "No Trials Found"
37310                     Exit Sub
37320                 End If
37330             End If
37340             DoCmd.OpenForm "frm_Trial"
              
37350         Case "btViewTrialList"
37360             DoCmd.OpenForm "frm_Trial_List", View:=acFormDS
              
37370         Case "btViewClassDetails"
37380             iRecCount = DCount("ClassID", "tbl_Class", "ClassStatus = 'Open'")
37390             If iRecCount > 0 Then
                      'TempVars.Add "tmpClassFilter", "open"
37400             Else
37410                 iRecCount = DCount("ClassID", "tbl_Class", "ClassStatus = 'Closed'")
37420                 If iRecCount > 0 Then
                          'TempVars.Add "tmpClassFilter", "closed"
37430                 Else
37440                     MsgBox "There are no Classes in the database", vbInformation, "No ClassesFound"
37450                     Exit Sub
37460                 End If
37470             End If
37480             DoCmd.OpenForm "frm_Class_Main"
              
37490         Case "btViewClassList"
37500             DoCmd.OpenForm "frm_Class_List", View:=acFormDS
              
37510         Case "btViewPeopleDetails"
37520             iRecCount = DCount("PersonID", "tbl_Person")
37530             If iRecCount > 0 Then
37540                 DoCmd.OpenForm "frm_Person_Main"
37550             Else
37560                 MsgBox "There are no People in the database", vbInformation, "No People Found"
37570                 Exit Sub
37580             End If
              
37590         Case "btViewPeopleList"
37600             DoCmd.OpenForm "frm_People_List", View:=acFormDS
              
37610         Case "btViewDogsDetails"
37620             iRecCount = DCount("ExhibitorID", "tbl_Exhibitor", "DogStatus = 'Active'")
37630             If iRecCount > 0 Then
37640                 TempVars.Add "tmpDogFilter", "Active"
37650             Else
37660                 iRecCount = DCount("ExhibitorID", "tbl_Exhibitor", "DogStatus = 'Inactive'")
37670                 If iRecCount > 0 Then
37680                    TempVars.Add "tmpDogFilter", "Inactive"
37690                 Else
37700                    MsgBox "There are no Shows in the database", vbInformation, "No Dogs Found"
37710                     Exit Sub
37720                End If
37730            End If
37740            DoCmd.OpenForm "frm_Exhibitor_Main"
           
37750         Case "btViewDogsList"
37760               TempVars.Add "tmpDogFilter", "Active"
37770             DoCmd.OpenForm "frm_Dogs_List", View:=acFormDS
              
37780         Case "btViewScoreboard"
37790             DoCmd.OpenForm "frm_Trial_Scoreboard_Dialog"
              
37800         Case "btViewClub"
37810             DoCmd.OpenForm "frm_Club"
              
37820         Case "btViewEntriesList"
37830             TempVars.Add "tmpCalledFrom", "Home"
37840               TempVars.Add "tmpEntryShowID", "*"
37850               TempVars.Add "tmpEntryTrialID", "*"
37860               TempVars.Add "tmpEntryClassID", "*"
37870             DoCmd.OpenForm "frm_Entry_Split", , , , , , "qry_Entry_List"
              
37880         Case "btBackup"
37890             Call BackUpAndCompactBE(False)
              
37900         Case "btUpdates"
37910               Call BackUpAndCompactBE(True)
                    'Shell Application.CurrentProject.path & "\SSEInternetUpdater.exe /CHECK /NSIU"
37920               Application.FollowHyperlink "https://myk9t.com/product/mySCT-upgrade/", , True
                
37930         Case "btRefreshLinks"
37940               Call Refresh_Links
37950               MsgBox "Link Refresh Complete", vbInformation, "Refresh Links"

37960         Case "btRelink"
37970             DoCmd.OpenForm "frm_Relink_Dialog"

37980         Case "btLinkTableManager"
37990             MsgBox "This will open the Link Table Manager which will refresh all the linked tables. This requires the Full version of Microsoft Access and will not work with the Runtime version." & vbCr & vbCr & "Click Select ALL then Click OK on the next screen." & vbCr & vbCr & "After tables are refreshed click Close.", vbInformation, "Link Table Manager"
38000             RunCommand acCmdLinkedTableManager
              
38010         Case "btReferenceInfo"
38020             Call ReferenceInfo

38030         Case "btUpdateDataVersion"
38040             DoCmd.SetWarnings False
38050             DoCmd.RunSQL "UPDATE USysVersion_myShare_UBE, USysVersion_Data_UBE SET USysVersion_myShare_UBE.ubeVersion = 0, USysVersion_Data_UBE.ubeVersion = 0;"
38060             DoCmd.SetWarnings True
38070             MsgBox "Data File Versions have been update. Please Restart the Application", vbInformation, "Restart Required"
38080             DoCmd.Quit
              
38090         Case "btImportLog"
38100             DoCmd.OpenForm "frm_Import_Log", acFormDS

38110         Case "btmyK9QURL"
38120           DoCmd.OpenForm "frm_myK9Q_URL"
                
38130         Case "btUserGuide"
38140             Application.FollowHyperlink "Documents\mySCT User-Guide.pdf"
              
38150         Case "btForum"
38160             Application.FollowHyperlink "https://myk9t.com/forums/", , True
              
38170         Case "btOnlineDocs"
38180             Application.FollowHyperlink "https://myk9t.com/docs/", , True
              
38190         Case "btTicket"
38200             Application.FollowHyperlink "https://myk9t.com/support/", , True
              
38210         Case "btScreen"
38220             Application.FollowHyperlink "https://www.myk9t.com/zoom-meetings/", , True
                      
38230         Case "btASCARules"
38240             Application.FollowHyperlink "Documents\ASCA_scentdetrules.pdf"
                          
38250         Case "btAbout"
38260             DoCmd.OpenForm "frm_About_Main"
              
38270         Case "btExit"
38280             iResult = MsgBox("Would you like to Backup your Data Files before Exiting?", vbYesNo + vbQuestion + vbDefaultButton2, "Backup Data Files")
38290             If iResult = 7 Then
38300                 DoCmd.Quit
38310             Else
38320                 Call BackUpAndCompactBE(False)
38330                 DoCmd.Quit
38340             End If


          
      'SHOW -------------------------------------------------------------------------

38350         Case "btCustomEntryForm"
38360             DoCmd.OpenReport "rpt_Show_Entry_Form_Custom_Blank", acViewPreview
              
38370         Case "btEnterDog_Show"
38380             DoCmd.OpenForm "frm_Entry_DE"
              
38390         Case "btOnlineEntries"
38400             TempVars.Add "tmpCalledFrom", "OnlineEntries"
38410             Call BackUpAndCompactBE(True)
38420             DoCmd.OpenForm "frm_Online_Import_Instructions"
              
38430         Case "btShowArmbandLabels"
38440             TempVars.Add "tmpCalledFrom", "Show"
38450             DoCmd.OpenForm "frm_Armband_Dialog"
              
38460         Case "btArmbandRenumber"
38470             DoCmd.OpenForm "frm_Armband_Renumber_Dialog"

38480         Case "btShowCheckinSheet"
38490             TempVars.Add "tmpLicense", DLookup("SCT_LicKey", "UsysClubLicense", "ClubID = " & Forms!frm_Show.txtClubID)
38500             strSQL = "SELECT * FROM [qry_CheckIn] WHERE ShowID = TempVars!tmpShowID;"
38510             DoCmd.OpenReport "rpt_Checkin", acViewPreview, , , , strSQL
                  
38520         Case "btShowDailyCheckinSheet"
38530             TempVars.Add "tmpLicense", DLookup("SCT_LicKey", "UsysClubLicense", "ClubID = " & Forms!frm_Show.txtClubID)
38540             DoCmd.OpenForm "frm_Checkin_Report_Dialog"
              
38550         Case "btShowEnvelopeLabels"
38560             TempVars.Add "tmpCalledFrom", "Show"
38570             DoCmd.OpenForm "frm_Show_Envelope_Dialog"
                  
38580         Case "btShowScoreSheet"
38590             TempVars.Add "tmpLicense", DLookup("SCT_LicKey", "UsysClubLicense", "ClubID = " & Forms!frm_Show.txtClubID)
38600             TempVars.Add "tmpCalledFrom", "Show"
38610             DoCmd.OpenForm "frm_ScoreSheets_Dialog"
                  
38620         Case "btShowScoreSheetLabels"
38630             TempVars.Add "tmpCalledFrom", "Show"
38640             DoCmd.OpenForm "frm_ScoreSheet_Labels_Dialog"

38650         Case "btShowCatalog"
38660             DoCmd.OpenReport "rpt_Show_Catalog_Main", acViewPreview
              
38670         Case "btShowJudgingCounts"
38680             DoCmd.OpenReport "rpt_Show_Judging_Counts", acViewPreview

38690         Case "btShowEntryCounts"
38700             DoCmd.OpenReport "rpt_Show_Entry_Counts", acViewPreview

38710         Case "btShowBreedCounts"
38720             DoCmd.OpenReport "rpt_Show_Breed_Counts_Main", acViewPreview
              
38730         Case "btJudgingSchedulePortrait"
38740             DoCmd.OpenReport "rpt_Show_Judging_Schedule_Portrait", acViewPreview
              
38750         Case "btJudgingScheduleLandscape"
38760             DoCmd.OpenReport "rpt_Show_Judging_Schedule_Landscape", acViewPreview
              
38770         Case "btStewardReport"
38780             DoCmd.OpenReport "rpt_Steward_Report", acViewPreview

38790         Case "btFinancialReport"
38800             DoCmd.OpenReport "rpt_Show_Financial", acViewPreview

38810         Case "btViewShowEntriesList"
38820             TempVars.Add "tmpCalledFrom", "Show"
38830             TempVars.Add "tmpEntryShowID", TempVars!tmpShowID.Value
38840             TempVars.Add "tmpEntryTrialID", "*"
38850             TempVars.Add "tmpEntryClassID", "*"
38860             DoCmd.OpenForm "frm_Entry_Split", , , , , , "qry_Entry_List"
                            
38870         Case "btShowResultExport"
38880             Call xmlMain

38890         Case "btShowResultExport1"
38900             Call xmlMain
                            
38910         Case "btShowResultCatalog"
38920             TempVars.Add "tmpLicense", DLookup("SCT_LicKey", "UsysClubLicense", "ClubID = " & Forms!frm_Show.txtClubID)
38930             DoCmd.OpenReport "rpt_Show_Results_Main", acViewPreview
                  
38940         Case "btShowResultPost"
38950             TempVars.Add "tmpLicense", DLookup("SCT_LicKey", "UsysClubLicense", "ClubID = " & Forms!frm_Show.txtClubID)
38960             TempVars.Add "tmpCalledFrom", "Show"
38970             DoCmd.OpenForm "frm_Result_Report_Dialog"

38980         Case "btShowResultPostBreed"
38990             TempVars.Add "tmpLicense", DLookup("SCT_LicKey", "UsysClubLicense", "ClubID = " & Forms!frm_Show.txtClubID)
39000             TempVars.Add "tmpCalledFrom", "Show"
39010             DoCmd.OpenReport "rpt_Results_Post_Breed", acViewPreview, , , , "SELECT * FROM qry_Results_Post WHERE qry_Results_Post.ShowID = " & TempVars!tmpShowID & ";"
                         
39020         Case "btShowResultLabels"
39030             TempVars.Add "tmpCalledFrom", "Show"
39040             DoCmd.OpenForm "frm_Result_Label_Dialog"
                  
39050         Case "btShowEmailAllExhibitors"
39060             strCalledBy = "ShowEmailAllExhibitors"
39070             TempVars.Add "tmpEmailTemplate", "ShowEmailAllExhibitors"
39080             Call CheckEmailTemplate
39090             Call PopulateEmailTemporary(strCalledBy)
39100             DoCmd.OpenForm "frm_Show_Email_AllExhibitors_Select"

39110         Case "btShowEmailEnteredExhibitors"
39120             strCalledBy = "ShowEmailEnteredExhibitors"
39130             TempVars.Add "tmpEmailTemplate", "ShowEmailEnteredExhibitors"
39140             Call CheckEmailTemplate
39150             Call PopulateEmailTemporary(strCalledBy)
39160             DoCmd.OpenForm "frm_Show_Email_EnteredExhibitors_Select"
              
39170         Case "btPostEvalForm"
39180             strPDf = "Forms\ASCA_ScentPostEvaluationForm.pdf"
39190             strXFDF = "Forms\ASCA_ScentPostEvaluationForm.xfdf"
39200             Call PostEval_PDF(strPDf, strXFDF)

39210         Case "btGrossReceiptsForm"
39220             strPDf = "Forms\ASCA_ScentDetectionGrossReceiptsReport.pdf"
39230             strXFDF = "Forms\ASCA_ScentDetectionGrossReceiptsReport.xfdf"
39240             Call GrossReceipts_PDF(strPDf, strXFDF)

39250         Case "btmyK9QFlyer"
39260             DoCmd.OpenForm "frm_myK9QFlyer_Dialog"

39270         Case "btmyK9QShowDetails"
39280               Call UpdateShowDetails_ASCA_v3
                    
                               
39530         Case "btJudgesReport"
39540             DoCmd.OpenForm "frm_Judges_Report_Dialog"
              
39550         Case "btShowStats"
39560             Call ShowStats
              
39570         Case "btCloseOutShow"
39580             Call CloseShow
                  
39600         Case "btDeleteShow"
39610             Call btDeleteShow

39620         Case "btDeletemyK9QShow"
39630             iResult = MsgBox("This will delete data from the myK9Q App and cannot be undone." & vbCr & vbCr & "Do you wish to continue?", vbYesNo + vbQuestion, "Continue")

39640               If iResult = vbYes Then
39650                   strCalledBy = "Show"
39660               Call myK9QDelete_ASCA_v3(strCalledBy)
39670               End If
                   
39740         Case "btCloseTabShow"
39750             DoCmd.SetWarnings False
39760             DoCmd.RunSQL "UPDATE tbl_Preferences SET tbl_Preferences.ShowSplitFormSize = " & Forms!frm_Show.SplitFormSize
39770             DoCmd.Close acForm, "frm_Show", acSaveYes
39780             DoCmd.SetWarnings True
              
      'TRIAL -------------------------------------------------------------------------
39790         Case "btEnterDog_Trial"
39800             DoCmd.OpenForm "frm_Entry_DE"
                  
39810         Case "btTrialStats"
39820             Call TrialStats
              
39830         Case "btTrialSecretaryReport"
39840              DoCmd.OpenReport "rpt_Trial_Secretary_Report", acViewPreview
                  
39850         Case "btTrialRoster"
39860              DoCmd.OpenReport "rpt_Trial_Roster", acViewPreview
              
39870         Case "btCloseOutTrial"
39880             Call CloseTrial
              
39890         Case "btTrialArmbandLabels"
39900             TempVars.Add "tmpCalledFrom", "Trial"
39910             DoCmd.OpenForm "frm_Armband_Dialog"
              
39920         Case "btTrialCheckinSheet"
39930             TempVars.Add "tmpLicense", DLookup("SCT_LicKey", "UsysClubLicense", "ClubID = " & Forms!frm_Trial.txtClubID)
                  'Debug.Print TempVars!tmpLicense
39940             strSQL = "SELECT * FROM [qry_CheckIn] WHERE trialID = TempVars!tmpTrialID;"

39950             DoCmd.OpenReport "rpt_Checkin", acViewPreview, , , , strSQL

39960         Case "btTrialCheckinSheetCombined"
                  'strSQL = "SELECT * FROM [qry_CheckIn] WHERE trialID = TempVars!tmpTrialID;"
39970             DoCmd.OpenReport "rpt_Checkin_Combined", acViewPreview ', , , , strSQL
              
39980         Case "btTrialScoreSheet"
39990             TempVars.Add "tmpLicense", DLookup("SCT_LicKey", "UsysClubLicense", "ClubID = " & Forms!frm_Trial.txtClubID)
40000             TempVars.Add "tmpCalledFrom", "Trial"
40010             DoCmd.OpenForm "frm_ScoreSheets_Dialog"
              
40020         Case "btTrialScoreSheetLabels"
40030             TempVars.Add "tmpCalledFrom", "Trial"
40040             DoCmd.OpenForm "frm_ScoreSheet_Labels_Dialog"
                  
40050         Case "btMultipleDogs"
40060             DoCmd.OpenReport "rpt_Trial_Multiple_Dogs", acViewPreview

40070         Case "btViewTrialEntriesList"
40080             TempVars.Add "tmpCalledFrom", "Trial"
40090             TempVars.Add "tmpEntryShowID", "*"
40100             TempVars.Add "tmpEntryTrialID", TempVars!tmpTrialID.Value
40110             TempVars.Add "tmpEntryClassID", "*"
40120             DoCmd.OpenForm "frm_Entry_Split", , , , , , "qry_Entry_List"

40130         Case "btTrialResultExport"

40140         Case "btTrialResultCatalog"
40150             TempVars.Add "tmpLicense", DLookup("SCT_LicKey", "UsysClubLicense", "ClubID = " & Forms!frm_Trial.txtClubID)
40160             DoCmd.OpenReport "rpt_Trial_Results_Main", acViewPreview
                  
40170         Case "btTrialResultPost"
40180             TempVars.Add "tmpLicense", DLookup("SCT_LicKey", "UsysClubLicense", "ClubID = " & Forms!frm_Trial.txtClubID)
40190             TempVars.Add "tmpCalledFrom", "Trial"
40200             DoCmd.OpenForm "frm_Result_Report_Dialog"

40210         Case "btTrialResultPostBreed"
40220             TempVars.Add "tmpLicense", DLookup("SCT_LicKey", "UsysClubLicense", "ClubID = " & Forms!frm_Trial.txtClubID)
40230             TempVars.Add "tmpCalledFrom", "Trial"
40240             DoCmd.OpenReport "rpt_Results_Post_Breed", acViewPreview, , , , "SELECT * FROM qry_Results_Post WHERE qry_Results_Post.TrialID = " & TempVars!tmpTrialID & ";"
                         
40250         Case "btTrialResultLabels"
40260             TempVars.Add "tmpCalledFrom", "Trial"
40270             DoCmd.OpenForm "frm_Result_Label_Dialog"

40280         Case "btHIT_Novice"
40290             TempVars.Add "tmpCalledFrom", "Trial"
40300             TempVars.Add "tmpLevel", "Novice"
40310             DoCmd.OpenReport "rpt_Trial_HIT", acViewPreview

40320         Case "btHIT_Open"
40330             TempVars.Add "tmpCalledFrom", "Trial"
40340             TempVars.Add "tmpLevel", "Open"
40350             DoCmd.OpenReport "rpt_Trial_HIT", acViewPreview
                    
40360         Case "btHIT_Advanced"
40370             TempVars.Add "tmpCalledFrom", "Trial"
40380             TempVars.Add "tmpLevel", "Advanced"
40390             DoCmd.OpenReport "rpt_Trial_HIT", acViewPreview
                    
40400         Case "btHIT_Excellent"
40410             TempVars.Add "tmpCalledFrom", "Trial"
40420             TempVars.Add "tmpLevel", "Excellent"
40430             DoCmd.OpenReport "rpt_Trial_HIT", acViewPreview
                    


40440         Case "btHCD_Novice"
40450             strHD = Nz(DLookup("ClassID", "tbl_Class", "TrialID_FK = " & TempVars!tmpTrialID & " AND Element = 'Handler Discrimination'"), "0")
              
40460             If strHD = 0 Then
40470                 MsgBox "The High Combined Report only applies when Handler Discrimination is offered.", vbInformation, "HCD Report"
40480             Else
40490                 TempVars.Add "tmpCalledFrom", "Trial"
40500                 TempVars.Add "tmpLevel", "Novice"
40510                 DoCmd.OpenReport "rpt_Trial_HCD", acViewPreview
40520             End If

40530         Case "btHCD_Open"
40540              strHD = Nz(DLookup("ClassID", "tbl_Class", "TrialID_FK = " & TempVars!tmpTrialID & " AND Element = 'Handler Discrimination'"), "0")
              
40550              If strHD = 0 Then
40560                  MsgBox "The High Combined Report only applies when Handler Discrimination is offered.", vbInformation, "HCD Report"
40570              Else
40580                  TempVars.Add "tmpCalledFrom", "Trial"
40590                  TempVars.Add "tmpLevel", "Open"
40600                  DoCmd.OpenReport "rpt_Trial_HCD", acViewPreview
40610              End If
                    
40620         Case "btHCD_Advanced"
40630             strHD = Nz(DLookup("ClassID", "tbl_Class", "TrialID_FK = " & TempVars!tmpTrialID & " AND Element = 'Handler Discrimination'"), "0")
              
40640             If strHD = 0 Then
40650                 MsgBox "The High Combined Report only applies when Handler Discrimination is offered.", vbInformation, "HCD Report"
40660             Else
40670                 TempVars.Add "tmpCalledFrom", "Trial"
40680                 TempVars.Add "tmpLevel", "Advanced"
40690                 DoCmd.OpenReport "rpt_Trial_HCD", acViewPreview
40700             End If
                
40710         Case "btHCD_Excellent"
40720              strHD = Nz(DLookup("ClassID", "tbl_Class", "TrialID_FK = " & TempVars!tmpTrialID & " AND Element = 'Handler Discrimination'"), "0")
              
40730              If strHD = 0 Then
40740                  MsgBox "The High Combined Report only applies when Handler Discrimination is offered.", vbInformation, "HCD Report"
40750              Else
40760                  TempVars.Add "tmpCalledFrom", "Trial"
40770                  TempVars.Add "tmpLevel", "Excellent"
40780                  DoCmd.OpenReport "rpt_Trial_HCD", acViewPreview
40790              End If
                   

                    
40800         Case "btHSJ_Novice"
40810             TempVars.Add "tmpCalledFrom", "Trial"
40820             TempVars.Add "tmpLevel", "Novice"
40830             DoCmd.OpenReport "rpt_Trial_HSJ", acViewPreview

40840         Case "btHSJ_Open"
40850             TempVars.Add "tmpCalledFrom", "Trial"
40860             TempVars.Add "tmpLevel", "Opens"
40870             DoCmd.OpenReport "rpt_Trial_HSJ", acViewPreview
                  
40880         Case "btHSJ_Advanced"
40890             TempVars.Add "tmpCalledFrom", "Trial"
40900             TempVars.Add "tmpLevel", "Advanced"
40910             DoCmd.OpenReport "rpt_Trial_HSJ", acViewPreview
                  
40920         Case "btHSJ_Excellent"
40930             TempVars.Add "tmpCalledFrom", "Trial"
40940             TempVars.Add "tmpLevel", "Excellent"
40950             DoCmd.OpenReport "rpt_Trial_HSJ", acViewPreview
                  

                  
40960         Case "btDeleteTrial"
40970             Call btDeleteTrial

40980         Case "btmyK9QUploadTrial"
40990               TempVars.Add "tmpCalledFrom", "Trial"
41000               Call myK9Q_Upload_ASCA_v3(strCalledBy)

41010         Case "btDeletemyK9QTrial"
41020               iResult = MsgBox("This will delete data from the myK9Q App and cannot be undone." & vbCr & vbCr & "Do you wish to continue?", vbYesNo + vbQuestion, "Continue")

41030               If iResult = vbYes Then
41040                   strCalledBy = "Trial"
41050                   Call myK9QDelete_ASCA_v3(strCalledBy)
41060               End If
            
41070         Case "btCloseTabTrial"
41080             DoCmd.SetWarnings False
41090             DoCmd.RunSQL "UPDATE tbl_Preferences SET tbl_Preferences.TrialSplitFormSize = " & Forms!frm_Trial.SplitFormSize
41100             DoCmd.Close acForm, "frm_Trial", acSaveYes
41110             DoCmd.SetWarnings True
          
      'CLASSES  -------------------------------------------------------------------------
41120         Case "btClassArmbandLabels"
41130             TempVars.Add "tmpCalledFrom", "Class"
41140             DoCmd.OpenForm "frm_Armband_Dialog"
              
41150         Case "btClassCheckinSheet"
41160             TempVars.Add "tmpLicense", DLookup("SCT_LicKey", "UsysClubLicense", "ClubID = " & Forms!frm_Class_Main.txtClubID)
41170             strSQL = "SELECT * FROM [qry_CheckIn] WHERE classID = TempVars!tmpClassID;"
                  'Debug.Print strSQL
41180             DoCmd.OpenReport "rpt_Checkin", acViewPreview, , , , strSQL
              
41190         Case "btClassScoreSheet"
41200             TempVars.Add "tmpLicense", DLookup("SCT_LicKey", "UsysClubLicense", "ClubID = " & Forms!frm_Class_Main.txtClubID)
41210             TempVars.Add "tmpCalledFrom", "Class"
41220             DoCmd.OpenForm "frm_ScoreSheets_Dialog"
                      
41230         Case "btClassScoreSheetLabels"
41240             TempVars.Add "tmpCalledFrom", "Class"
41250             DoCmd.OpenForm "frm_ScoreSheet_Labels_Dialog"
              
41260         Case "btViewClassEntriesList"
41270             TempVars.Add "tmpCalledFrom", "Class"
41280             TempVars.Add "tmpEntryShowID", "*"
41290             TempVars.Add "tmpEntryTrialID", "*"
41300             TempVars.Add "tmpEntryClassID", TempVars!tmpClassID.Value
41310             DoCmd.OpenForm "frm_Entry_Split", , , , , , "qry_Entry_List"
            
41320         Case "btClassResultExport"
            
41330         Case "btClassResultCatalog"
41340             TempVars.Add "tmpLicense", DLookup("SCT_LicKey", "UsysClubLicense", "ClubID = " & Forms!frm_Class_Main.txtClubID)

41350             If IsNull(Forms![frm_Class_Main].txtTimeLimit1) Or Forms![frm_Class_Main].txtTimeLimit1 = "" Or Forms![frm_Class_Main].txtTimeLimit1 = "0000" Then
41360                 MsgBox "Please set Time Limit for Area 1 provided by the judge on the Class page.", vbInformation, "Time Limit Missing"
41370                 Exit Sub
41380             End If
                  
41390             If Forms![frm_Class_Main].txtTimeLimit2.visible = True Then
41400                 If IsNull(Forms![frm_Class_Main].txtTimeLimit2) Or Forms![frm_Class_Main].txtTimeLimit2 = "" Or Forms![frm_Class_Main].txtTimeLimit2 = "0000" Then
41410                     MsgBox "Please set Time Limit for Area 2 provided by the judge on the Class page.", vbInformation, "Time Limit Missing"
41420                     Exit Sub
41430                 End If
41440             End If
                  
                  'If Forms![frm_Class_Main].txtTimeLimit3.visible = True Then
                      'If IsNull(Forms![frm_Class_Main].txtTimeLimit3) Or Forms![frm_Class_Main].txtTimeLimit3 = "" Or Forms![frm_Class_Main].txtTimeLimit3 = "0000" Then
                          'MsgBox "Please set Time Limit for Area 3 provided by the judge on the Class page.", vbInformation, "Time Limit Missing"
                          'Exit Sub
                      'End If
                  'End If
          
41450             DoCmd.OpenReport "rpt_Class_Results_Main", acViewPreview
                  
41460         Case "btClassResultPost"
41470             TempVars.Add "tmpLicense", DLookup("SCT_LicKey", "UsysClubLicense", "ClubID = " & Forms!frm_Class_Main.txtClubID)
41480             TempVars.Add "tmpCalledFrom", "Class"
41490             DoCmd.OpenForm "frm_Result_Report_Dialog"

41500         Case "btClassResultPostBreed"
41510             TempVars.Add "tmpLicense", DLookup("SCT_LicKey", "UsysClubLicense", "ClubID = " & Forms!frm_Class_Main.txtClubID)
41520             TempVars.Add "tmpCalledFrom", "Class"
41530             DoCmd.OpenReport "rpt_Results_Post_Breed", acViewPreview, , , , "SELECT * FROM qry_Results_Post WHERE qry_Results_Post.ClassID = " & TempVars!tmpClassID & ";"
              
41540         Case "btClassResultLabels"
41550             TempVars.Add "tmpCalledFrom", "Class"
41560             DoCmd.OpenForm "frm_Result_Label_Dialog"
              
41570         Case "btCloseOutClass"
41580             Call Class_Placements
41590             Call CloseClass
                  
41600         Case "btDeleteClass"
41610             Call btDeleteClass

41620         Case "btDeletemyK9QClass"
41630           iResult = MsgBox("This will delete data from the myK9Q App and cannot be undone." & vbCr & vbCr & "Do you wish to continue?", vbYesNo + vbQuestion, "Continue")

41640           If iResult = vbYes Then
41650               strCalledBy = "Class"
41660               Call myK9QDelete_ASCA_v3(strCalledBy)
41670           End If

41680         Case "btCloseTabClass"
41690             DoCmd.SetWarnings False
41700             DoCmd.RunSQL "UPDATE tbl_Preferences SET tbl_Preferences.ClassSplitFormSize = " & Forms!frm_Class_Main.SplitFormSize
41710             DoCmd.Close acForm, "frm_Class_Main", acSaveYes
41720             DoCmd.SetWarnings True

41730         Case "btmyK9QUploadClass"
41740               strCalledBy = "Class"
41750               Call myK9Q_Upload_ASCA_v3(strCalledBy)

41760         Case "btmyK9QDownload"
41770             Call myK9Q_Class_Result_Download_ASCA_v3

                  
      'PEOPLE -------------------------------------------------------------------------
41780         Case "btDeletePeople"
41790             Call btDeletePeople

41800         Case "btExportPeople"
41810             TempVars.Add "tmpExportName", "People"
41820                 strQuery = "SELECT qry_People_List_Export_Breed.FullName AS FullName, qry_People_List_Export_Breed.Address AS StreetAddress, qry_People_List_Export_Breed.City AS City, qry_People_List_Export_Breed.StateName AS State, qry_People_List_Export_Breed.ZipCode AS ZipCode, qry_People_List_Export_Breed.Email AS  Email, qry_People_List_Export_Breed.Phone AS Phone, qry_People_List_Export_Breed.ASCARegistrationNumber AS ASCARegistrationNumber, qry_People_List_Export_Breed.CallName AS CallName, qry_People_List_Export_Breed.RegisteredName AS ASCARegisteredName, qry_People_List_Export_Breed.tbl_Breed.BreedName AS ASCABreed, qry_People_List_Export_Breed.VarietyName AS ASCAVariety, qry_People_List_Export_Breed.Gender AS Gender, qry_People_List_Export_Breed.DateofBirth AS DateofBirth, qry_People_List_Export_Breed.Breeder AS Breeder, qry_People_List_Export_Breed.Sire AS Sire, qry_People_List_Export_Breed.Dam AS Dam FROM qry_People_List_Export_Breed"
                  'Debug.Print strQuery
                    
41830             Call exportQuery(strQuery)

41840         Case "btCloseTabPerson"
41850             DoCmd.SetWarnings False
41860             DoCmd.RunSQL "UPDATE tbl_Preferences SET tbl_Preferences.PersonSplitFormSize = " & Forms!frm_Person_Main.SplitFormSize
41870             DoCmd.Close acForm, "frm_Person_Main", acSaveYes
41880             DoCmd.SetWarnings True
                    
              
      'EXHIBITOR -------------------------------------------------------------------------
41890         Case "btEnterThisExhibitor"
41900             Call EnterThisExhibitor
              
41910         Case "btExhibitorVerification"
41920             DoCmd.OpenReport "rpt_Exhibitor_Information", acViewPreview

41930         Case "btExhibitorsReport"
41940             DoCmd.OpenForm "frm_Exhibitor_List_Dialog"
              
41950         Case "btASCAEntryForm"
41960             strPDf = "Forms\SW-EntryForm.pdf"
41970             strXFDF = "Forms\SW-EntryForm.xfdf"
41980             Call PDF(strPDf, strXFDF)
              
41990         Case "btASCATransferForm"
42000             strPDf = "Forms\SW-Transfer.pdf"
42010             strXFDF = "Forms\SW-Transfer.xfdf"
42020             Call PDF(strPDf, strXFDF)
                  
42030         Case "btDeleteDog"
42040             Call btDeleteDog

42050         Case "btExportDogs"
42060             TempVars.Add "tmpExportName", "Dogs"
42070                 strQuery = "SELECT qry_Dogs_List_Export.FullName AS FullName, qry_Dogs_List_Export.Address AS StreetAddress, qry_Dogs_List_Export.City AS City, qry_Dogs_List_Export.StateName AS State, qry_Dogs_List_Export.ZipCode AS ZipCode, qry_Dogs_List_Export.Email AS  Email, qry_Dogs_List_Export.Phone AS Phone, qry_Dogs_List_Export.ASCARegistrationNumber AS ASCARegistrationNumber, qry_Dogs_List_Export.CallName AS CallName, qry_Dogs_List_Export.RegisteredName AS ASCARegisteredName, qry_Dogs_List_Export.tbl_Breed.BreedName AS ASCABreed, qry_Dogs_List_Export.VarietyName AS ASCAVariety, qry_Dogs_List_Export.Gender AS Gender, qry_Dogs_List_Export.DateofBirth AS DateofBirth, qry_Dogs_List_Export.Breeder AS Breeder, qry_Dogs_List_Export.Sire AS Sire, qry_Dogs_List_Export.Dam AS Dam FROM qry_Dogs_List_Export" '& Replace(Forms!frm_Dogs_List.RecordSource, ";", "") & ";"
                  'Debug.Print strQuery

42080             Call exportQuery(strQuery)

42090         Case "btCloseTabExhibitor"
42100             DoCmd.SetWarnings False
42110             DoCmd.RunSQL "UPDATE tbl_Preferences SET tbl_Preferences.DogSplitFormSize = " & Forms!frm_Exhibitor_Main.SplitFormSize
42120             DoCmd.Close acForm, "frm_Exhibitor_Main", acSaveYes
42130             DoCmd.SetWarnings True
             
      'CLUB -------------------------------------------------------------------------
42140         Case "btNewClub"
42150             DoCmd.OpenForm "frm_Club_DE"
          
42160         Case "btDeleteClub"
42170               Call btDeleteClub
                    

      'ENTRIES -------------------------------------------------------------------------
42180         Case "btExportEntries"
42190            TempVars.Add "tmpExportName", "Entries"
                 'If Forms!frm_Entry_Split.filter = "" Then
42200                 strQuery = "SELECT qry_Entry_List.FullName AS FullName, qry_Entry_List.Address AS StreetAddress, qry_Entry_List.City AS City, qry_Entry_List.StateName AS State, qry_Entry_List.ZipCode AS ZipCode, qry_Entry_List.Email AS  Email, qry_Entry_List.Phone AS Phone, " & _
                                  "qry_Entry_List.ASCARegistrationNumber AS ASCARegistrationNumber, qry_Entry_List.CallName AS CallName, qry_Entry_List.RegisteredName AS ASCARegisteredName, qry_Entry_List.tbl_Breed.BreedName AS ASCABreed, qry_Entry_List.Variety AS Variety, qry_Entry_List.Gender AS Gender, " & _
                                  "qry_Entry_List.DateofBirth AS DateofBirth, qry_Entry_List.Breeder AS Breeder, qry_Entry_List.Sire AS Sire, qry_Entry_List.Dam AS Dam, qry_Entry_List.Armband AS Armband, qry_Entry_List.EventID AS EventID, " & _
                                  "qry_Entry_List.TrialDate AS TrialDate, qry_Entry_List.TrialNumber AS TrialNumber, qry_Entry_List.Element AS Element, qry_Entry_List.[Level] AS [Level], qry_Entry_List.Section AS Section, qry_Entry_List.AmountPaid AS AmountPaid FROM " & Replace(Forms!frm_Entry_Split.RecordSource, ";", "") & ";"
                  'Debug.Print strQuery
                  'Else
                       'strQuery = "SELECT qry_Entry_List.FullName AS FullName, qry_Entry_List.Address AS StreetAddress, qry_Entry_List.City AS City, qry_Entry_List.StateName AS State, qry_Entry_List.ZipCode AS ZipCode, qry_Entry_List.Email AS  Email, qry_Entry_List.Phone AS Phone, " & _
                                  "qry_Entry_List.ASCARegistrationNumber AS ASCARegistrationNumber, qry_Entry_List.CallName AS CallName, qry_Entry_List.RegisteredName AS ASCARegisteredName, qry_Entry_List.tbl_Breed.BreedName AS ASCABreed, qry_Entry_List.Variety AS Variety, qry_Entry_List.Gender AS Gender, " & _
                                  "qry_Entry_List.DateofBirth AS DateofBirth, qry_Entry_List.Breeder AS Breeder, qry_Entry_List.Sire AS Sire, qry_Entry_List.Dam AS Dam, qry_Entry_List.Armband AS Armband, qry_Entry_List.EventID AS EventID, " & _
                                  "qry_Entry_List.TrialDate AS TrialDate, qry_Entry_List.TrialNumber AS TrialNumber, qry_Entry_List.Element AS Element, qry_Entry_List.[Level] AS [Level], qry_Entry_List.Section AS Section, qry_Entry_List.AmountPaid AS AmountPaid FROM " & Replace(Forms!frm_Entry_Split.RecordSource, ";", "") & " WHERE " & Forms!frm_Entry_Split.filter
                  'End If
                  
42210             Call exportQuery(strQuery)


          'OTHER--------------------------------------------------------------------------
          
42220       Case Else
42230             MsgBox "Clicked the button: " & control.ID, vbInformation, "Warning"

42240       End Select


fError_Exit:
42250     On Error Resume Next
42260     Exit Sub
fError:
      'Debug.Print Err.Number
42270     Select Case Err.Number

              Case 2501
                'Do Nothing
42280         Case Else
42290           MsgBox "Error: " & Err.Number & vbCrLf & Err.Description & vbCrLf & "Line: " & Erl, vbCritical, "Warning", Err.HelpFile, Err.HelpContext

42300     End Select
42310     Resume fError_Exit
42320     Resume
End Sub

Sub fncOnChange(control As IRibbonControl, strText As String)
42330     On Error GoTo fError
42340     Select Case control.ID
              Case "xx"
42350             MsgBox "Value Editbox: " & strText, vbInformation, "Warning"
42360         Case Else
42370             MsgBox "Value Editbox: " & strText, vbInformation, "Warning"
42380     End Select
fError_Exit:
42390     On Error Resume Next
42400     Exit Sub
fError:
42410     MsgBox "Error: " & Err.Number & vbCrLf & Err.Description & vbCrLf & "Line: " & Erl, vbCritical, "Warning", Err.HelpFile, Err.HelpContext

42420     Resume fError_Exit
42430     Resume
End Sub

Public Sub fncOnShowBackstage(contextObject As Object)
     'objRibbon.Invalidate
End Sub

Public Function fncOpenObject(nameObject As String, Optional typeObject As Byte = 4)
42440     On Error GoTo fError

42450     Select Case typeObject
              Case 1 'form
42460             DoCmd.OpenForm nameObject
42470         Case 2 'report
42480             DoCmd.OpenReport nameObject, acViewPreview
42490         Case 3 ' query
42500             DoCmd.OpenQuery nameObject
42510         Case Else
42520             MsgBox "Select the correct object type." & vbCrLf & vbCrLf & "1 - Form" & vbCrLf & "2 - Report" & vbCrLf & "3 - Query", vbInformation, "Warning"
42530     End Select
fError_Exit:
42540     On Error Resume Next
42550     Exit Function
fError:
42560     MsgBox "Error: " & Err.Number & vbCrLf & Err.Description & vbCrLf & "Line: " & Erl, vbCritical, "Warning", Err.HelpFile, Err.HelpContext

42570     Resume fError_Exit
42580     Resume
End Function

Public Sub fncRibbon(ribbon As IRibbonUI)
          'On Error Resume Next
          '-------------------------------------------------------------
          'objRibbon will be used to make changes
          'in the ribbon at runtime
          '------------------------------------------------------------
42590     Set objRibbon = ribbon
End Sub


Public Sub fncGetEnabled(control As IRibbonControl, ByRef enabled)
42600     On Error GoTo fError

42610     Select Case control.ID
              Case "xxx"
                  'button that has the id xxx
42620         Case Else
42630             enabled = False
42640     End Select

fError_Exit:
42650     On Error Resume Next
42660     Exit Sub
fError:
42670     MsgBox "Error: " & Err.Number & vbCrLf & Err.Description & vbCrLf & "Line: " & Erl, vbCritical, "Warning", Err.HelpFile, Err.HelpContext

42680     Resume fError_Exit
42690     Resume
End Sub

Public Sub fncGetImage(control As IRibbonControl, ByRef Image)
42700     On Error GoTo fError

          Dim strPath As String
          Dim strNameImage As String
42710     strPath = CurrentProject.Path & "\images\"
42720     Select Case control.ID
              Case "IdButton"
                  'Can be used GIF, JPEG, PNG and ICO
                  'The image should appear in the images folder of your project.
42730             strNameImage = "ImageName.gif"
42740     End Select

42750     If InStr(strNameImage, ".png") > 0 Or InStr(strNameImage, ".ico") > 0 Then
42760         If Len(Dir(strPath & strNameImage)) = 0 Then
42770             MsgBox "Image " & strNameImage & " not found in the folder Images ...", vbInformation, "Warning"
42780             Exit Sub
42790         Else
42800             Set Image = LoadImage(strPath & strNameImage)
42810         End If
42820     Else
42830         Set Image = LoadPicture(strPath & strNameImage)
42840     End If

fError_Exit:
42850     On Error Resume Next
42860     Exit Sub
fError:
42870     Select Case Err.Number
              Case 2220
42880             MsgBox "Image " & control.ID & " not found in the folder Images...", vbInformation, "Warning"
42890         Case Else
42900             MsgBox "Error: " & Err.Number & vbCrLf & Err.Description & vbCrLf & "Line: " & Erl, vbCritical, "Warning", Err.HelpFile, Err.HelpContext

42910     End Select
42920     Resume fError_Exit
42930     Resume
End Sub

Public Sub fncGetLabel(control As IRibbonControl, ByRef label)
42940     On Error GoTo fError

42950     Select Case control.ID
              Case "IDName"
42960             label = "Label Name"
42970         Case Else
42980             label = " "
42990     End Select

fError_Exit:
43000     On Error Resume Next
43010     Exit Sub
fError:
43020     Select Case Err.Number
              Case 2220
43030             MsgBox "Button Label " & control.ID & " not found in this Path...", vbInformation, "Warning"
43040         Case Else
43050             MsgBox "Error: " & Err.Number & vbCrLf & Err.Description & vbCrLf & "Line: " & Erl, vbCritical, "Warning", Err.HelpFile, Err.HelpContext

43060     End Select
43070     Resume fError_Exit
43080     Resume
End Sub

Public Sub fncGetVisible(control As IRibbonControl, ByRef visible)
43090     On Error GoTo fError

43100     Select Case control.ID
              Case "xxx"
                  'button that has the id xxx
43110         Case Else
43120             visible = True
43130     End Select

fError_Exit:
43140     On Error Resume Next
43150     Exit Sub
fError:
43160     MsgBox "Error: " & Err.Number & vbCrLf & Err.Description & vbCrLf & "Line: " & Erl, vbCritical, "Warning", Err.HelpFile, Err.HelpContext

43170     Resume fError_Exit
43180     Resume
End Sub

Public Sub fncLoadImage(imageId As String, ByRef Image)
43190     On Error GoTo fError

          Dim strPath As String
43200     strPath = CurrentProject.Path & "\images\"
43210     If InStr(imageId, ".png") > 0 Or InStr(imageId, ".ico") > 0 Then
43220         If Len(Dir(strPath & imageId)) = 0 Then
43230             MsgBox "Image " & imageId & " not found in the folder Images ...", vbInformation, "Warning"
43240             Exit Sub
43250         Else
43260             Set Image = LoadImage(strPath & imageId)
43270         End If
43280     Else
43290         Set Image = LoadPicture(strPath & imageId)
43300     End If
fError_Exit:
43310     On Error Resume Next
43320     Exit Sub
fError:
43330     Select Case Err.Number
              Case 2220
43340             MsgBox "Image " & imageId & " not found in the folder Images ...", vbInformation, "Warning"
43350         Case Else
43360             MsgBox "Error: " & Err.Number & vbCrLf & Err.Description & vbCrLf & "Line: " & Erl, vbCritical, "Warning", Err.HelpFile, Err.HelpContext

43370     End Select
43380     Resume fError_Exit
43390     Resume
End Sub

Public Function fncLoadRibbon()
          Dim rsRib As DAO.Recordset
43400     On Error GoTo fError
          '--------------------------------------------------------------------------------
          'This function loads the ribbons stored in the table tblRibbons,
          'that must be called by the macro autoexec
          '
          'Create the macro autoexec, select the action RunCode
          'and type the function name in the argument : fncLoadRibbon()
          '---------------------------------------------------------------------------------
43410     Set rsRib = CurrentDb.OpenRecordset("tblRibbons", dbOpenDynaset)
43420     Do While Not rsRib.EOF
43430         Application.LoadCustomUI rsRib!RibbonName, rsRib!RibbonXml
43440         rsRib.MoveNext
43450     Loop
43460     rsRib.Close
43470     Set rsRib = Nothing
fError_Exit:
43480     On Error Resume Next
43490     Exit Function
fError:
43500     Select Case Err.Number
              Case 3078
43510             MsgBox "Table not found...", vbInformation, "Warning"
43520         Case Else
43530             MsgBox "Error: " & Err.Number & vbCrLf & Err.Description & vbCrLf & "Line: " & Erl, vbCritical, "Warning", Err.HelpFile, Err.HelpContext

43540     End Select
43550     Resume fError_Exit
43560     Resume
End Function

Public Function fncLoadRibbonXml()
43570     On Error GoTo fError

          Dim f           As Long
          Dim strText     As String
          Dim strOut      As String
          Dim rsXml As DAO.Recordset


          '-------------------------------------------------------------------------------------
          'This function loads the ribbons stored in the XML file,
          'that must be called by the macro autoexec.
          '
          'Create the macro AutoExec, select the action RunCode
          'and type the function name in the argument: fncLoadRibbonXml()
          '
          'Create a table named tblRibbonsXml with the fields:
          'RibbonName - In this field you stores the name you want to give to the ribbon
          'RibbonXml - In this field you enter the Xml file name
          '
          'This example assumes that you are with the XML files in
          'the same place of your Database
          '--------------------------------------------------------------------------------------
43580     f = FreeFile
43590     Set rsXml = CurrentDb.OpenRecordset("tblRibbonsXml")
43600     Do While Not rsXml.EOF
43610         Open CurrentProject.Path & "\" & rsXml!RibbonXml For Input As f

43620         Do While Not EOF(f)
43630             Line Input #f, strText
43640             strOut = strOut & strText & vbCrLf
43650         Loop

43660         Application.LoadCustomUI rsXml!RibbonName, strOut
43670         strOut = ""
43680         strText = ""
43690         f = FreeFile
43700         rsXml.MoveNext
43710     Loop

fError_Exit:
43720     On Error Resume Next
43730     Exit Function
fError:
43740     Select Case Err.Number
              Case 3078
43750             MsgBox "Table not found...", vbInformation, "Warning"
43760         Case Else
43770             MsgBox "Error: " & Err.Number & vbCrLf & Err.Description & vbCrLf & "Line: " & Erl, vbCritical, "Warning", Err.HelpFile, Err.HelpContext

43780     End Select
43790     Resume fError_Exit
43800     Resume
End Function


Private Sub savetest()
      'Application.SaveAsText acForm, "formname", "filename.txt"
      'Application.SaveAsText acForm, "frm_Entry_Split", "entrysplit.txt"
43810 Application.LoadFromText acForm, "frm_Entry_Split", "entrysplit.txt"
43820 MsgBox "Done"
End Sub
