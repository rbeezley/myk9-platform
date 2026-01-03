Attribute VB_Name = "mod_License"
Option Compare Database
Option Explicit
Private Declare PtrSafe Function InternetGetConnectedStateEx Lib "wininet.dll" (ByRef lpdwFlags As Long, ByVal lpszConnectionName As String, ByVal dwNameLen As Integer, ByVal dwReserved As Long) As Long
Dim sConnType As String * 255

Public Function CheckInternetConnectivity() As Boolean
          Dim ret As Long
20840     ret = InternetGetConnectedStateEx(ret, sConnType, 254, 0)
20850     If ret = 1 Then
20860         CheckInternetConnectivity = True
20870     Else
20880         CheckInternetConnectivity = False
20890     End If
 End Function
 
Public Function License_Status(iClubID As Integer)

20900   On Error Resume Next

        Dim strAction As String, strKey As String, strClubname As String, strProduct As String
        Dim db As DAO.Database
        Dim rs As DAO.Recordset
        Dim dExpDate As Date

20910   Set db = CurrentDb
20920   Set rs = db.OpenRecordset("SELECT USysClubLicense.*, USysClubLicense.ClubID FROM USysClubLicense WHERE USysClubLicense.ClubID = " & iClubID)

20930   strAction = "status-check"
20940   strProduct = "mySWT"

20950   strClubname = DLookup("AKCClubName", "tbl_Club", "clubID = " & iClubID)
20960   strKey = DLookup("SWT_LicKey", "USysClubLicense", "clubID = " & iClubID)

20970   If InStr(1, strKey, "mySWT") Then
20980       rs.Edit
20990       rs!SWT_Status = "Verifying Key Status"
21000       rs!SWT_Status = WebRequest(strAction, strProduct, strKey, strClubname, dExpDate)
21010       rs!SWT_ExpDate = TempVars!tmpExpDate
21020       rs.Update
21030   End If
End Function



Public Function WebRequest(strAction As String, strProduct As String, strKey As String, strClubname As String, dExpDate As Date)

21040 On Error GoTo fError

      'https://myk9t.com/?woo_sl_action=status-check&product_unique_id=mySWT&licence_key=mySWT-8fe0a402-cd6d8a5c-4fc71ff1&domain=clubname

          Dim httpReq As Object
          Dim strCommand As String
          Dim strResponse As String
          Dim strExpireDate As String
          Dim strClubNameLowercase As String
          Dim iStart As String
          
          
21050     Set httpReq = CreateObject("MSXML2.ServerXMLHTTP")
              'strCommand = "http://myk9t.com/?woo_sl_action=" & strAction & "&product_unique_id=mySWT" & "&licence_key=" & strKey & "&domain=" & strClubName & "/"
                
              'Check all lowercase - This is the default
21060         strClubNameLowercase = LCase(strClubname)
21070         strCommand = "http://myk9t.com/?woo_sl_action=" & strAction & "&product_unique_id=" & strProduct & "&licence_key=" & strKey & "&domain=" & strClubNameLowercase
              'strCommand = "http://myk9t.com/1667479628429/?woo_sl_action=" & strAction & "&product_unique_id=" & strProduct & "&licence_key=" & strKey & "&domain=" & strClubNameLowercase

              'Debug.Print strCommand
              
21080         httpReq.Open "GET", strCommand, False
21090         httpReq.send
21100         strResponse = httpReq.responseText
              'Debug.Print strResponse
                         
              
              'Check as written
21110         If InStr(1, strResponse, "e204") Then 'Or InStr(1, strResponse, "e1") Or InStr(1, strResponse, "e2") Or InStr(1, strResponse, "e3") Or InStr(1, strResponse, "e4") Then
21120             strCommand = "http://myk9t.com/?woo_sl_action=" & strAction & "&product_unique_id=" & strProduct & "&licence_key=" & strKey & "&domain=" & strClubname
                  'Debug.Print strCommand
                
21130             httpReq.Open "GET", strCommand, False
21140             httpReq.send
21150             strResponse = httpReq.responseText
                  'Debug.Print strResponse
21160         End If
              
              'Check lowercase with slash
21170         If InStr(1, strResponse, "e204") Then 'Or InStr(1, strResponse, "e1") Or InStr(1, strResponse, "e2") Or InStr(1, strResponse, "e3") Or InStr(1, strResponse, "e4") Then
21180             strCommand = "http://myk9t.com/?woo_sl_action=" & strAction & "&product_unique_id=" & strProduct & "&licence_key=" & strKey & "&domain=" & strClubNameLowercase & "/"
                  'Debug.Print strCommand
                
21190             httpReq.Open "GET", strCommand, False
21200             httpReq.send
21210             strResponse = httpReq.responseText
                  'Debug.Print strResponse
21220         End If
              
              'Check as written with slash
21230         If InStr(1, strResponse, "e204") Then 'Or InStr(1, strResponse, "e1") Or InStr(1, strResponse, "e2") Or InStr(1, strResponse, "e3") Or InStr(1, strResponse, "e4") Then
21240             strCommand = "http://myk9t.com/?woo_sl_action=" & strAction & "&product_unique_id=" & strProduct & "&licence_key=" & strKey & "&domain=" & strClubname & "/"
                  'Debug.Print strCommand
                
21250             httpReq.Open "GET", strCommand, False
21260             httpReq.send
21270             strResponse = httpReq.responseText
                  'Debug.Print strResponse
21280         End If
          
          'Set Status Message
21290   If InStr(1, strResponse, "licence_expire") Then
21300     iStart = InStr(1, strResponse, "licence_expire")
21310     strExpireDate = Mid(strResponse, iStart, 27)
21320     strExpireDate = Replace(strExpireDate, "licence_expire", "")
21330     strExpireDate = Replace(strExpireDate, ":", "")
21340     strExpireDate = Replace(strExpireDate, """", "")
21350     TempVars.Add "tmpExpDate", strExpireDate
21360   End If
          
          
21370     If InStr(1, strResponse, "S100") Then
21380         strResponse = "License Key Successfully activated - s100"
21390     ElseIf InStr(1, strResponse, "s101") Then
21400         strResponse = "License Key Successfully activated - s101"
21410     ElseIf InStr(1, strResponse, "s201") Then
21420         strResponse = "License Key Successfully Unassigned - s201"
21430     ElseIf InStr(1, strResponse, "s203") Then
21440         strResponse = "License Key Is Unassigned - s203"
21450     ElseIf InStr(1, strResponse, "s205") Then
21460         strResponse = "License key Is Active and Valid - s205"
          'ElseIf InStr(1, strResponse, "s215") Then
              'strResponse = "License key Is Active and Valid - s215"
21470     ElseIf InStr(1, strResponse, "s610") Then
21480         strResponse = "License Key Successfully Deleted - s610"
21490     ElseIf InStr(1, strResponse, "e001") Then
21500         strResponse = "Invalid data provided - e001"
21510     ElseIf InStr(1, strResponse, "e002") Then
21520         strResponse = "Invalid or missing License key - e002"
21530     ElseIf InStr(1, strResponse, "e003") Then
21540         strResponse = "Order does not exists anymore - e003"
21550     ElseIf InStr(1, strResponse, "e004") Then
21560         strResponse = "No Order Status - e004"
21570     ElseIf InStr(1, strResponse, "e111") Then
21580         strResponse = "Invalid Data - e111"
21590     ElseIf InStr(1, strResponse, "e112") Then
21600         strResponse = "Maximum number for this key reached - e112"
21610     ElseIf InStr(1, strResponse, "e204") Then
21620         strResponse = "License key NOT Active for this Club - e204"
21630     ElseIf InStr(1, strResponse, "e301") Then
21640         strResponse = "License Key does not match this application - e301"
21650     ElseIf InStr(1, strResponse, "e312") Then
21660         strResponse = "License key is Inactive or Expired for this Club - e312"
21670     ElseIf InStr(1, strResponse, "e419") Then
21680         strResponse = "Invalid Application ID - e419"
21690     ElseIf InStr(1, strResponse, "expired") Then
21700         strResponse = "License key Is Expired for this Club"
21710     ElseIf InStr(1, strResponse, "Inactive") Then
21720         strResponse = "License key Is Inactive for this Club"
21730     ElseIf InStr(1, strResponse, "Active") Then
21740         strResponse = "License key Is Active and Valid for this Club - s205"
21750     End If
              
21760     WebRequest = strResponse
      'Debug.Print WebRequest
          
21770     Set httpReq = Nothing
          
fError_Exit:
21780       On Error Resume Next
21790       Exit Function
fError:
21800       Select Case Err.Number
                 Case 3078
21810               MsgBox "Table not found...", vbInformation, "Warning"
                    
21820           Case -2147012889 'No internet
21830               MsgBox "Unable to validate License for " & strClubname & ". Check your internet connectivity.", vbInformation, "Warning"

21840           Case -2147012891 'Invalid URL Windows 7 bug
21850               If dExpDate < Date Then
21860                   strResponse = "License key is NOT Active (Expired) for this Club - e2891"
21870               Else
21880                   strResponse = "License key Is Active and Valid for this Club - s205"
21890               End If
                    
21900           Case -2147012739 'Secure Channel Windows 7 bug
21910               If dExpDate < Date Then
21920                   strResponse = "License key is NOT Active (Expired) for this Club - e2739"
21930               Else
21940                   strResponse = "License key Is Active and Valid for this Club - s205"
21950               End If
                    
21960           Case -2147012894 'Operation Timed Out
21970               If dExpDate < Date Then
21980                   strResponse = "License key is NOT Active (Expired) for this Club - e2894"
21990               Else
22000                   strResponse = "License key Is Active and Valid for this Club - s2894"
22010               End If
                    
22020           Case -2147012744 'Unrecognized Response
22030               If dExpDate < Date Then
22040                   strResponse = "License key is NOT Active (Expired) for this Club - e2744"
22050               Else
22060                   strResponse = "License key Is Active and Valid for this Club - s2744"
22070               End If
                
22080           Case Else
22090               MsgBox "Error: " & Err.Number & vbCrLf & Err.Description & vbCrLf & "Line: " & Erl, vbCritical, "Warning", Err.HelpFile, Err.HelpContext

22100       End Select
22110       Resume fError_Exit
22120       Resume

End Function
