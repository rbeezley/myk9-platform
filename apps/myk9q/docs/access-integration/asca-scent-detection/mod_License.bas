Attribute VB_Name = "mod_License"
Option Compare Database
Option Explicit
Private Declare PtrSafe Function InternetGetConnectedStateEx Lib "wininet.dll" (ByRef lpdwFlags As Long, ByVal lpszConnectionName As String, ByVal dwNameLen As Integer, ByVal dwReserved As Long) As Long
Dim sConnType As String * 255

Public Function CheckInternetConnectivity() As Boolean
          Dim ret As Long
17960     ret = InternetGetConnectedStateEx(ret, sConnType, 254, 0)
17970     If ret = 1 Then
17980         CheckInternetConnectivity = True
17990     Else
18000         CheckInternetConnectivity = False
18010     End If
 End Function
 
Public Function License_Status(iClubID As Integer)

18020   On Error Resume Next

        Dim strAction As String, strKey As String, strClubname As String, strProduct As String
        Dim db As DAO.Database
        Dim rs As DAO.Recordset
        Dim dExpDate As Date

18030   Set db = CurrentDb
18040   Set rs = db.OpenRecordset("SELECT USysClubLicense.*, USysClubLicense.ClubID FROM USysClubLicense WHERE USysClubLicense.ClubID = " & iClubID)

18050   strAction = "status-check"
18060   strProduct = "mySCT"

18070   strClubname = DLookup("ASCAClubName", "tbl_Club", "clubID = " & iClubID)
18080   strKey = DLookup("SCT_LicKey", "USysClubLicense", "clubID = " & iClubID)

18090   If InStr(1, strKey, "mySCT") Then
18100       rs.Edit
18110       rs!SCT_Status = "Verifying Key Status"
18120       rs!SCT_Status = WebRequest(strAction, strProduct, strKey, strClubname, dExpDate)
18130       rs!SCT_ExpDate = TempVars!tmpExpDate
18140       rs.Update
18150   End If
End Function



Public Function WebRequest(strAction As String, strProduct As String, strKey As String, strClubname As String, dExpDate As Date)

18160 On Error GoTo fError

      'https://myk9t.com/?woo_sl_action=status-check&product_unique_id=mySCT&licence_key=mySCT-8fe0a402-cd6d8a5c-4fc71ff1&domain=clubname

          Dim httpReq As Object
          Dim strCommand As String
          Dim strResponse As String
          Dim strExpireDate As String
          Dim strClubNameLowercase As String
          Dim iStart As String
          
          
18170     Set httpReq = CreateObject("MSXML2.ServerXMLHTTP")
              'strCommand = "http://myk9t.com/?woo_sl_action=" & strAction & "&product_unique_id=mySCT" & "&licence_key=" & strKey & "&domain=" & strClubName & "/"
                
              'Check all lowercase - This is the default
18180         strClubNameLowercase = LCase(strClubname)
18190         strCommand = "http://myk9t.com/?woo_sl_action=" & strAction & "&product_unique_id=" & strProduct & "&licence_key=" & strKey & "&domain=" & strClubNameLowercase
              'strCommand = "http://myk9t.com/1667479628429/?woo_sl_action=" & strAction & "&product_unique_id=" & strProduct & "&licence_key=" & strKey & "&domain=" & strClubNameLowercase

              'Debug.Print strCommand
              
18200         httpReq.Open "GET", strCommand, False
18210         httpReq.send
18220         strResponse = httpReq.responseText
18230         Debug.Print strResponse
              
              'Check as written
18240         If InStr(1, strResponse, "e204") Then 'Or InStr(1, strResponse, "e1") Or InStr(1, strResponse, "e2") Or InStr(1, strResponse, "e3") Or InStr(1, strResponse, "e4") Then
18250             strCommand = "http://myk9t.com/?woo_sl_action=" & strAction & "&product_unique_id=" & strProduct & "&licence_key=" & strKey & "&domain=" & strClubname
                  'Debug.Print strCommand
                
18260             httpReq.Open "GET", strCommand, False
18270             httpReq.send
18280             strResponse = httpReq.responseText
                  'Debug.Print strResponse
18290         End If
              
              'Check lowercase with slash
18300         If InStr(1, strResponse, "e204") Then 'Or InStr(1, strResponse, "e1") Or InStr(1, strResponse, "e2") Or InStr(1, strResponse, "e3") Or InStr(1, strResponse, "e4") Then
18310             strCommand = "http://myk9t.com/?woo_sl_action=" & strAction & "&product_unique_id=" & strProduct & "&licence_key=" & strKey & "&domain=" & strClubNameLowercase & "/"
                  'Debug.Print strCommand
                
18320             httpReq.Open "GET", strCommand, False
18330             httpReq.send
18340             strResponse = httpReq.responseText
                  'Debug.Print strResponse
18350         End If
              
              'Check as written with slash
18360         If InStr(1, strResponse, "e204") Then 'Or InStr(1, strResponse, "e1") Or InStr(1, strResponse, "e2") Or InStr(1, strResponse, "e3") Or InStr(1, strResponse, "e4") Then
18370             strCommand = "http://myk9t.com/?woo_sl_action=" & strAction & "&product_unique_id=" & strProduct & "&licence_key=" & strKey & "&domain=" & strClubname & "/"
                  'Debug.Print strCommand
                
18380             httpReq.Open "GET", strCommand, False
18390             httpReq.send
18400             strResponse = httpReq.responseText
                  'Debug.Print strResponse
18410         End If
          
          'Set Status Message
18420     If InStr(1, strResponse, "licence_expire") Then
18430       iStart = InStr(1, strResponse, "licence_expire")
18440       strExpireDate = Mid(strResponse, iStart, 27)
18450       strExpireDate = Replace(strExpireDate, "licence_expire", "")
18460       strExpireDate = Replace(strExpireDate, ":", "")
18470       strExpireDate = Replace(strExpireDate, """", "")
18480       TempVars.Add "tmpExpDate", strExpireDate
18490     End If
          
          
18500     If InStr(1, strResponse, "S100") Then
18510         strResponse = "License Key Successfully activated - s100"
18520     ElseIf InStr(1, strResponse, "s101") Then
18530         strResponse = "License Key Successfully activated - s101"
18540     ElseIf InStr(1, strResponse, "s201") Then
18550         strResponse = "License Key Successfully Unassigned - s201"
18560     ElseIf InStr(1, strResponse, "s203") Then
18570         strResponse = "License Key Is Unassigned - s203"
18580     ElseIf InStr(1, strResponse, "s205") Then
18590         strResponse = "License key Is Active and Valid - s205"
          'ElseIf InStr(1, strResponse, "s215") Then
              'strResponse = "License key Is Active and Valid - s215"
18600     ElseIf InStr(1, strResponse, "s610") Then
18610         strResponse = "License Key Successfully Deleted - s610"
18620     ElseIf InStr(1, strResponse, "e001") Then
18630         strResponse = "Invalid data provided - e001"
18640     ElseIf InStr(1, strResponse, "e002") Then
18650         strResponse = "Invalid or missing License key - e002"
18660     ElseIf InStr(1, strResponse, "e003") Then
18670         strResponse = "Order does not exists anymore - e003"
18680     ElseIf InStr(1, strResponse, "e004") Then
18690         strResponse = "No Order Status - e004"
18700     ElseIf InStr(1, strResponse, "e111") Then
18710         strResponse = "Invalid Data - e111"
18720     ElseIf InStr(1, strResponse, "e112") Then
18730         strResponse = "Maximum number for this key reached - e112"
18740     ElseIf InStr(1, strResponse, "e204") Then
18750         strResponse = "License key NOT Active for this Club - e204"
18760     ElseIf InStr(1, strResponse, "e301") Then
18770         strResponse = "License Key does not match this application - e301"
18780     ElseIf InStr(1, strResponse, "e312") Then
18790         strResponse = "License key is Inactive or Expired for this Club - e312"
18800     ElseIf InStr(1, strResponse, "e419") Then
18810         strResponse = "Invalid Application ID - e419"
18820     ElseIf InStr(1, strResponse, "expired") Then
18830         strResponse = "License key Is Expired for this Club"
18840     ElseIf InStr(1, strResponse, "Inactive") Then
18850         strResponse = "License key Is Inactive for this Club"
18860     ElseIf InStr(1, strResponse, "Active") Then
18870         strResponse = "License key Is Active and Valid for this Club - s205"
18880     End If
              
18890     WebRequest = strResponse
      'Debug.Print WebRequest
          
18900     Set httpReq = Nothing
          
fError_Exit:
18910       On Error Resume Next
18920       Exit Function
fError:
18930       Select Case Err.Number
                 Case 3078
18940               MsgBox "Table not found...", vbInformation, "Warning"
                    
18950           Case -2147012889 'No internet
18960               MsgBox "Unable to validate License for " & strClubname & ". Check your internet connectivity.", vbInformation, "Warning"

18970           Case -2147012891 'Invalid URL Windows 7 bug
18980               If dExpDate < Date Then
18990                   strResponse = "License key is NOT Active (Expired) for this Club - e2891"
19000               Else
19010                   strResponse = "License key Is Active and Valid for this Club - s205"
19020               End If
                    
19030           Case -2147012739 'Secure Channel Windows 7 bug
19040               If dExpDate < Date Then
19050                   strResponse = "License key is NOT Active (Expired) for this Club - e2739"
19060               Else
19070                   strResponse = "License key Is Active and Valid for this Club - s205"
19080               End If
                    
19090           Case -2147012894 'Operation Timed Out
19100               If dExpDate < Date Then
19110                   strResponse = "License key is NOT Active (Expired) for this Club - e2894"
19120               Else
19130                   strResponse = "License key Is Active and Valid for this Club - s2894"
19140               End If
                    
19150           Case -2147012744 'Unrecognized Response
19160               If dExpDate < Date Then
19170                   strResponse = "License key is NOT Active (Expired) for this Club - e2744"
19180               Else
19190                   strResponse = "License key Is Active and Valid for this Club - s2744"
19200               End If
                
19210           Case Else
19220               MsgBox "Error: " & Err.Number & vbCrLf & Err.Description & vbCrLf & "Line: " & Erl, vbCritical, "Warning", Err.HelpFile, Err.HelpContext

19230       End Select
19240       Resume fError_Exit
19250       Resume

End Function


' ==========================================================================
' myK9Q License Status Check
' ==========================================================================
' Validates the myK9Q v3 license key for a show.
' This is called before uploading data to the myK9Q mobile app.
'
' Parameters:
'   iShowID - The ShowID to check license for
'   strClubname - The club name (used for display/logging)
'
' Returns: Nothing (updates tbl_Show.MobileAppLicKeyStatus field)
' ==========================================================================

Public Sub myK9Q_License_Status(iShowID As Integer, strClubname As String)
    On Error GoTo License_Error

    Dim db As DAO.Database
    Dim rs As DAO.Recordset
    Dim strKey As String
    Dim strStatus As String
    Dim strAction As String
    Dim strProduct As String
    Dim dExpDate As Date

    Set db = CurrentDb

    ' Get the current license key from the show
    strKey = Nz(DLookup("MobileAppLicKey", "tbl_Show", "showID = " & iShowID), "")

    If strKey = "" Then
        ' No license key entered
        strStatus = "No License Key"
        GoTo Update_Status
    End If

    ' Check internet connectivity first
    If Not CheckInternetConnectivity() Then
        ' No internet - use cached status if available
        strStatus = Nz(DLookup("MobileAppLicKeyStatus", "tbl_Show", "showID = " & iShowID), "")
        If strStatus = "" Then
            strStatus = "Unable to verify - No Internet"
        End If
        GoTo Update_Status
    End If

    ' Validate license key using WebRequest (same as AKC/UKC)
    ' Note: dExpDate is passed by reference - WebRequest will use it for error handling
    strAction = "status-check"
    strProduct = "myK9Q"
    dExpDate = #1/1/1900#  ' Default value - WebRequest handles expired key logic
    strStatus = WebRequest(strAction, strProduct, strKey, strClubname, dExpDate)

Update_Status:
    ' Update the status in tbl_Show (only MobileAppLicKeyStatus - ExpDate field may not exist)
    Set rs = db.OpenRecordset("SELECT MobileAppLicKeyStatus FROM tbl_Show WHERE showID = " & iShowID, dbOpenDynaset)
    If Not rs.EOF Then
        rs.Edit
        rs!MobileAppLicKeyStatus = strStatus
        rs.Update
    End If
    rs.Close

    Set rs = Nothing
    Set db = Nothing
    Exit Sub

License_Error:
    ' On error, set a generic status with error details for debugging
    On Error Resume Next
    Dim strErrMsg As String
    strErrMsg = "Unable to verify - Error " & Err.Number
    Set db = CurrentDb
    Set rs = db.OpenRecordset("SELECT MobileAppLicKeyStatus FROM tbl_Show WHERE showID = " & iShowID, dbOpenDynaset)
    If Not rs.EOF Then
        rs.Edit
        rs!MobileAppLicKeyStatus = strErrMsg
        rs.Update
    End If
    rs.Close
    Set rs = Nothing
    Set db = Nothing
End Sub
