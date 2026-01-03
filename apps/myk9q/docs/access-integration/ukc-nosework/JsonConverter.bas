Attribute VB_Name = "JsonConverter"
''
' VBA-JSON v2.3.1
' (c) Tim Hall - https://github.com/VBA-tools/VBA-JSON
'
' JSON Converter for VBA
'
' Errors:
' 10001 - JSON parse error
'
' @class JsonConverter
' @author tim.hall.engr@gmail.com
' @license MIT (http://www.opensource.org/licenses/mit-license.php)
'' ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~ '
'
' Based originally on vba-json (with extensive changes)
' BSD license included below
'
' JSONLib, http://code.google.com/p/vba-json/
'
' Copyright (c) 2013, Ryo Yokoyama
' All rights reserved.
'
' Redistribution and use in source and binary forms, with or without
' modification, are permitted provided that the following conditions are met:
'     * Redistributions of source code must retain the above copyright
'       notice, this list of conditions and the following disclaimer.
'     * Redistributions in binary form must reproduce the above copyright
'       notice, this list of conditions and the following disclaimer in the
'       documentation and/or other materials provided with the distribution.
'     * Neither the name of the <organization> nor the
'       names of its contributors may be used to endorse or promote products
'       derived from this software without specific prior written permission.
'
' THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND
' ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
' WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
' DISCLAIMED. IN NO EVENT SHALL <COPYRIGHT HOLDER> BE LIABLE FOR ANY
' DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES
' (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES;
' LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND
' ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
' (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS
' SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
' ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~ '
Option Explicit

' === VBA-UTC Headers
#If Mac Then

#If VBA7 Then

' 64-bit Mac (2016)
Private Declare PtrSafe Function utc_popen Lib "/usr/lib/libc.dylib" Alias "popen" _
    (ByVal utc_Command As String, ByVal utc_Mode As String) As LongPtr
Private Declare PtrSafe Function utc_pclose Lib "/usr/lib/libc.dylib" Alias "pclose" _
    (ByVal utc_File As LongPtr) As LongPtr
Private Declare PtrSafe Function utc_fread Lib "/usr/lib/libc.dylib" Alias "fread" _
    (ByVal utc_Buffer As String, ByVal utc_Size As LongPtr, ByVal utc_Number As LongPtr, ByVal utc_File As LongPtr) As LongPtr
Private Declare PtrSafe Function utc_feof Lib "/usr/lib/libc.dylib" Alias "feof" _
    (ByVal utc_File As LongPtr) As LongPtr

#Else

' 32-bit Mac
Private Declare Function utc_popen Lib "libc.dylib" Alias "popen" _
    (ByVal utc_Command As String, ByVal utc_Mode As String) As Long
Private Declare Function utc_pclose Lib "libc.dylib" Alias "pclose" _
    (ByVal utc_File As Long) As Long
Private Declare Function utc_fread Lib "libc.dylib" Alias "fread" _
    (ByVal utc_Buffer As String, ByVal utc_Size As Long, ByVal utc_Number As Long, ByVal utc_File As Long) As Long
Private Declare Function utc_feof Lib "libc.dylib" Alias "feof" _
    (ByVal utc_File As Long) As Long

#End If

#ElseIf VBA7 Then

' http://msdn.microsoft.com/en-us/library/windows/desktop/ms724421.aspx
' http://msdn.microsoft.com/en-us/library/windows/desktop/ms724949.aspx
' http://msdn.microsoft.com/en-us/library/windows/desktop/ms725485.aspx
Private Declare PtrSafe Function utc_GetTimeZoneInformation Lib "kernel32" Alias "GetTimeZoneInformation" _
    (utc_lpTimeZoneInformation As utc_TIME_ZONE_INFORMATION) As Long
Private Declare PtrSafe Function utc_SystemTimeToTzSpecificLocalTime Lib "kernel32" Alias "SystemTimeToTzSpecificLocalTime" _
    (utc_lpTimeZoneInformation As utc_TIME_ZONE_INFORMATION, utc_lpUniversalTime As utc_SYSTEMTIME, utc_lpLocalTime As utc_SYSTEMTIME) As Long
Private Declare PtrSafe Function utc_TzSpecificLocalTimeToSystemTime Lib "kernel32" Alias "TzSpecificLocalTimeToSystemTime" _
    (utc_lpTimeZoneInformation As utc_TIME_ZONE_INFORMATION, utc_lpLocalTime As utc_SYSTEMTIME, utc_lpUniversalTime As utc_SYSTEMTIME) As Long

#Else

Private Declare Function utc_GetTimeZoneInformation Lib "kernel32" Alias "GetTimeZoneInformation" _
    (utc_lpTimeZoneInformation As utc_TIME_ZONE_INFORMATION) As Long
Private Declare Function utc_SystemTimeToTzSpecificLocalTime Lib "kernel32" Alias "SystemTimeToTzSpecificLocalTime" _
    (utc_lpTimeZoneInformation As utc_TIME_ZONE_INFORMATION, utc_lpUniversalTime As utc_SYSTEMTIME, utc_lpLocalTime As utc_SYSTEMTIME) As Long
Private Declare Function utc_TzSpecificLocalTimeToSystemTime Lib "kernel32" Alias "TzSpecificLocalTimeToSystemTime" _
    (utc_lpTimeZoneInformation As utc_TIME_ZONE_INFORMATION, utc_lpLocalTime As utc_SYSTEMTIME, utc_lpUniversalTime As utc_SYSTEMTIME) As Long

#End If

#If Mac Then

#If VBA7 Then
Private Type utc_ShellResult
    utc_Output As String
    utc_ExitCode As LongPtr
End Type

#Else

Private Type utc_ShellResult
    utc_Output As String
    utc_ExitCode As Long
End Type

#End If

#Else

Private Type utc_SYSTEMTIME
    utc_wYear As Integer
    utc_wMonth As Integer
    utc_wDayOfWeek As Integer
    utc_wDay As Integer
    utc_wHour As Integer
    utc_wMinute As Integer
    utc_wSecond As Integer
    utc_wMilliseconds As Integer
End Type

Private Type utc_TIME_ZONE_INFORMATION
    utc_Bias As Long
    utc_StandardName(0 To 31) As Integer
    utc_StandardDate As utc_SYSTEMTIME
    utc_StandardBias As Long
    utc_DaylightName(0 To 31) As Integer
    utc_DaylightDate As utc_SYSTEMTIME
    utc_DaylightBias As Long
End Type

#End If
' === End VBA-UTC

Private Type json_Options
    ' VBA only stores 15 significant digits, so any numbers larger than that are truncated
    ' This can lead to issues when BIGINT's are used (e.g. for Ids or Credit Cards), as they will be invalid above 15 digits
    ' See: http://support.microsoft.com/kb/269370
    '
    ' By default, VBA-JSON will use String for numbers longer than 15 characters that contain only digits
    ' to override set `JsonConverter.JsonOptions.UseDoubleForLargeNumbers = True`
    UseDoubleForLargeNumbers As Boolean

    ' The JSON standard requires object keys to be quoted (" or '), use this option to allow unquoted keys
    AllowUnquotedKeys As Boolean

    ' The solidus (/) is not required to be escaped, use this option to escape them as \/ in ConvertToJson
    EscapeSolidus As Boolean
End Type
Public JsonOptions As json_Options

' ============================================= '
' Public Methods
' ============================================= '

''
' Convert JSON string to object (Dictionary/Collection)
'
' @method ParseJson
' @param {String} json_String
' @return {Object} (Dictionary or Collection)
' @throws 10001 - JSON parse error
''
Public Function ParseJson(ByVal jsonString As String) As Object
          Dim json_Index As Long
10        json_Index = 1

          ' Remove vbCr, vbLf, and vbTab from json_String
20        jsonString = VBA.Replace(VBA.Replace(VBA.Replace(jsonString, VBA.vbCr, ""), VBA.vbLf, ""), VBA.vbTab, "")

30        json_SkipSpaces jsonString, json_Index
40        Select Case VBA.Mid$(jsonString, json_Index, 1)
          Case "{"
50            Set ParseJson = json_ParseObject(jsonString, json_Index)
60        Case "["
70            Set ParseJson = json_ParseArray(jsonString, json_Index)
80        Case Else
              ' Error: Invalid JSON string
90            Err.Raise 10001, "JSONConverter", json_ParseErrorMessage(jsonString, json_Index, "Expecting '{' or '['")
100       End Select
End Function

''
' Convert object (Dictionary/Collection/Array) to JSON
'
' @method ConvertToJson
' @param {Variant} JsonValue (Dictionary, Collection, or Array)
' @param {Integer|String} Whitespace "Pretty" print json with given number of spaces per indentation (Integer) or given string
' @return {String}
''
Public Function ConvertToJson(ByVal JsonValue As Variant, Optional ByVal Whitespace As Variant, Optional ByVal json_CurrentIndentation As Long = 0) As String
          Dim json_Buffer As String
          Dim json_BufferPosition As Long
          Dim json_BufferLength As Long
          Dim json_Index As Long
          Dim json_LBound As Long
          Dim json_UBound As Long
          Dim json_IsFirstItem As Boolean
          Dim json_Index2D As Long
          Dim json_LBound2D As Long
          Dim json_UBound2D As Long
          Dim json_IsFirstItem2D As Boolean
          Dim json_Key As Variant
          Dim json_Value As Variant
          Dim json_DateStr As String
          Dim json_Converted As String
          Dim json_SkipItem As Boolean
          Dim json_PrettyPrint As Boolean
          Dim json_Indentation As String
          Dim json_InnerIndentation As String

110       json_LBound = -1
120       json_UBound = -1
130       json_IsFirstItem = True
140       json_LBound2D = -1
150       json_UBound2D = -1
160       json_IsFirstItem2D = True
170       json_PrettyPrint = Not IsMissing(Whitespace)

180       Select Case VBA.VarType(JsonValue)
          Case VBA.vbNull
190           ConvertToJson = "null"
200       Case VBA.vbDate
              ' Date
210           json_DateStr = ConvertToIso(VBA.CDate(JsonValue))

220           ConvertToJson = """" & json_DateStr & """"
230       Case VBA.vbString
              ' String (or large number encoded as string)
240           If Not JsonOptions.UseDoubleForLargeNumbers And json_StringIsLargeNumber(JsonValue) Then
250               ConvertToJson = JsonValue
260           Else
270               ConvertToJson = """" & json_Encode(JsonValue) & """"
280           End If
290       Case VBA.vbBoolean
300           If JsonValue Then
310               ConvertToJson = "true"
320           Else
330               ConvertToJson = "false"
340           End If
350       Case VBA.vbArray To VBA.vbArray + VBA.vbByte
360           If json_PrettyPrint Then
370               If VBA.VarType(Whitespace) = VBA.vbString Then
380                   json_Indentation = VBA.String$(json_CurrentIndentation + 1, Whitespace)
390                   json_InnerIndentation = VBA.String$(json_CurrentIndentation + 2, Whitespace)
400               Else
410                   json_Indentation = VBA.Space$((json_CurrentIndentation + 1) * Whitespace)
420                   json_InnerIndentation = VBA.Space$((json_CurrentIndentation + 2) * Whitespace)
430               End If
440           End If

              ' Array
450           json_BufferAppend json_Buffer, "[", json_BufferPosition, json_BufferLength

460           On Error Resume Next

470           json_LBound = LBound(JsonValue, 1)
480           json_UBound = UBound(JsonValue, 1)
490           json_LBound2D = LBound(JsonValue, 2)
500           json_UBound2D = UBound(JsonValue, 2)

510           If json_LBound >= 0 And json_UBound >= 0 Then
520               For json_Index = json_LBound To json_UBound
530                   If json_IsFirstItem Then
540                       json_IsFirstItem = False
550                   Else
                          ' Append comma to previous line
560                       json_BufferAppend json_Buffer, ",", json_BufferPosition, json_BufferLength
570                   End If

580                   If json_LBound2D >= 0 And json_UBound2D >= 0 Then
                          ' 2D Array
590                       If json_PrettyPrint Then
600                           json_BufferAppend json_Buffer, vbNewLine, json_BufferPosition, json_BufferLength
610                       End If
620                       json_BufferAppend json_Buffer, json_Indentation & "[", json_BufferPosition, json_BufferLength

630                       For json_Index2D = json_LBound2D To json_UBound2D
640                           If json_IsFirstItem2D Then
650                               json_IsFirstItem2D = False
660                           Else
670                               json_BufferAppend json_Buffer, ",", json_BufferPosition, json_BufferLength
680                           End If

690                           json_Converted = ConvertToJson(JsonValue(json_Index, json_Index2D), Whitespace, json_CurrentIndentation + 2)

                              ' For Arrays/Collections, undefined (Empty/Nothing) is treated as null
700                           If json_Converted = "" Then
                                  ' (nest to only check if converted = "")
710                               If json_IsUndefined(JsonValue(json_Index, json_Index2D)) Then
720                                   json_Converted = "null"
730                               End If
740                           End If

750                           If json_PrettyPrint Then
760                               json_Converted = vbNewLine & json_InnerIndentation & json_Converted
770                           End If

780                           json_BufferAppend json_Buffer, json_Converted, json_BufferPosition, json_BufferLength
790                       Next json_Index2D

800                       If json_PrettyPrint Then
810                           json_BufferAppend json_Buffer, vbNewLine, json_BufferPosition, json_BufferLength
820                       End If

830                       json_BufferAppend json_Buffer, json_Indentation & "]", json_BufferPosition, json_BufferLength
840                       json_IsFirstItem2D = True
850                   Else
                          ' 1D Array
860                       json_Converted = ConvertToJson(JsonValue(json_Index), Whitespace, json_CurrentIndentation + 1)

                          ' For Arrays/Collections, undefined (Empty/Nothing) is treated as null
870                       If json_Converted = "" Then
                              ' (nest to only check if converted = "")
880                           If json_IsUndefined(JsonValue(json_Index)) Then
890                               json_Converted = "null"
900                           End If
910                       End If

920                       If json_PrettyPrint Then
930                           json_Converted = vbNewLine & json_Indentation & json_Converted
940                       End If

950                       json_BufferAppend json_Buffer, json_Converted, json_BufferPosition, json_BufferLength
960                   End If
970               Next json_Index
980           End If

990           On Error GoTo 0

1000          If json_PrettyPrint Then
1010              json_BufferAppend json_Buffer, vbNewLine, json_BufferPosition, json_BufferLength

1020              If VBA.VarType(Whitespace) = VBA.vbString Then
1030                  json_Indentation = VBA.String$(json_CurrentIndentation, Whitespace)
1040              Else
1050                  json_Indentation = VBA.Space$(json_CurrentIndentation * Whitespace)
1060              End If
1070          End If

1080          json_BufferAppend json_Buffer, json_Indentation & "]", json_BufferPosition, json_BufferLength

1090          ConvertToJson = json_BufferToString(json_Buffer, json_BufferPosition)

          ' Dictionary or Collection
1100      Case VBA.vbObject
1110          If json_PrettyPrint Then
1120              If VBA.VarType(Whitespace) = VBA.vbString Then
1130                  json_Indentation = VBA.String$(json_CurrentIndentation + 1, Whitespace)
1140              Else
1150                  json_Indentation = VBA.Space$((json_CurrentIndentation + 1) * Whitespace)
1160              End If
1170          End If

              ' Dictionary
1180          If VBA.TypeName(JsonValue) = "Dictionary" Then
1190              json_BufferAppend json_Buffer, "{", json_BufferPosition, json_BufferLength
1200              For Each json_Key In JsonValue.Keys
                      ' For Objects, undefined (Empty/Nothing) is not added to object
1210                  json_Converted = ConvertToJson(JsonValue(json_Key), Whitespace, json_CurrentIndentation + 1)
1220                  If json_Converted = "" Then
1230                      json_SkipItem = json_IsUndefined(JsonValue(json_Key))
1240                  Else
1250                      json_SkipItem = False
1260                  End If

1270                  If Not json_SkipItem Then
1280                      If json_IsFirstItem Then
1290                          json_IsFirstItem = False
1300                      Else
1310                          json_BufferAppend json_Buffer, ",", json_BufferPosition, json_BufferLength
1320                      End If

1330                      If json_PrettyPrint Then
1340                          json_Converted = vbNewLine & json_Indentation & """" & json_Key & """: " & json_Converted
1350                      Else
1360                          json_Converted = """" & json_Key & """:" & json_Converted
1370                      End If

1380                      json_BufferAppend json_Buffer, json_Converted, json_BufferPosition, json_BufferLength
1390                  End If
1400              Next json_Key

1410              If json_PrettyPrint Then
1420                  json_BufferAppend json_Buffer, vbNewLine, json_BufferPosition, json_BufferLength

1430                  If VBA.VarType(Whitespace) = VBA.vbString Then
1440                      json_Indentation = VBA.String$(json_CurrentIndentation, Whitespace)
1450                  Else
1460                      json_Indentation = VBA.Space$(json_CurrentIndentation * Whitespace)
1470                  End If
1480              End If

1490              json_BufferAppend json_Buffer, json_Indentation & "}", json_BufferPosition, json_BufferLength

              ' Collection
1500          ElseIf VBA.TypeName(JsonValue) = "Collection" Then
1510              json_BufferAppend json_Buffer, "[", json_BufferPosition, json_BufferLength
1520              For Each json_Value In JsonValue
1530                  If json_IsFirstItem Then
1540                      json_IsFirstItem = False
1550                  Else
1560                      json_BufferAppend json_Buffer, ",", json_BufferPosition, json_BufferLength
1570                  End If

1580                  json_Converted = ConvertToJson(json_Value, Whitespace, json_CurrentIndentation + 1)

                      ' For Arrays/Collections, undefined (Empty/Nothing) is treated as null
1590                  If json_Converted = "" Then
                          ' (nest to only check if converted = "")
1600                      If json_IsUndefined(json_Value) Then
1610                          json_Converted = "null"
1620                      End If
1630                  End If

1640                  If json_PrettyPrint Then
1650                      json_Converted = vbNewLine & json_Indentation & json_Converted
1660                  End If

1670                  json_BufferAppend json_Buffer, json_Converted, json_BufferPosition, json_BufferLength
1680              Next json_Value

1690              If json_PrettyPrint Then
1700                  json_BufferAppend json_Buffer, vbNewLine, json_BufferPosition, json_BufferLength

1710                  If VBA.VarType(Whitespace) = VBA.vbString Then
1720                      json_Indentation = VBA.String$(json_CurrentIndentation, Whitespace)
1730                  Else
1740                      json_Indentation = VBA.Space$(json_CurrentIndentation * Whitespace)
1750                  End If
1760              End If

1770              json_BufferAppend json_Buffer, json_Indentation & "]", json_BufferPosition, json_BufferLength
1780          End If

1790          ConvertToJson = json_BufferToString(json_Buffer, json_BufferPosition)
1800      Case VBA.vbInteger, VBA.vbLong, VBA.vbSingle, VBA.vbDouble, VBA.vbCurrency, VBA.vbDecimal
              ' Number (use decimals for numbers)
1810          ConvertToJson = VBA.Replace(JsonValue, ",", ".")
1820      Case Else
              ' vbEmpty, vbError, vbDataObject, vbByte, vbUserDefinedType
              ' Use VBA's built-in to-string
1830          On Error Resume Next
1840          ConvertToJson = JsonValue
1850          On Error GoTo 0
1860      End Select
End Function

' ============================================= '
' Private Functions
' ============================================= '

Private Function json_ParseObject(json_String As String, ByRef json_Index As Long) As Dictionary
          Dim json_Key As String
          Dim json_NextChar As String

1870      Set json_ParseObject = New Dictionary
1880      json_SkipSpaces json_String, json_Index
1890      If VBA.Mid$(json_String, json_Index, 1) <> "{" Then
1900          Err.Raise 10001, "JSONConverter", json_ParseErrorMessage(json_String, json_Index, "Expecting '{'")
1910      Else
1920          json_Index = json_Index + 1

1930          Do
1940              json_SkipSpaces json_String, json_Index
1950              If VBA.Mid$(json_String, json_Index, 1) = "}" Then
1960                  json_Index = json_Index + 1
1970                  Exit Function
1980              ElseIf VBA.Mid$(json_String, json_Index, 1) = "," Then
1990                  json_Index = json_Index + 1
2000                  json_SkipSpaces json_String, json_Index
2010              End If

2020              json_Key = json_ParseKey(json_String, json_Index)
2030              json_NextChar = json_Peek(json_String, json_Index)
2040              If json_NextChar = "[" Or json_NextChar = "{" Then
2050                  Set json_ParseObject.item(json_Key) = json_ParseValue(json_String, json_Index)
2060              Else
2070                  json_ParseObject.item(json_Key) = json_ParseValue(json_String, json_Index)
2080              End If
2090          Loop
2100      End If
End Function

Private Function json_ParseArray(json_String As String, ByRef json_Index As Long) As Collection
2110      Set json_ParseArray = New Collection

2120      json_SkipSpaces json_String, json_Index
2130      If VBA.Mid$(json_String, json_Index, 1) <> "[" Then
2140          Err.Raise 10001, "JSONConverter", json_ParseErrorMessage(json_String, json_Index, "Expecting '['")
2150      Else
2160          json_Index = json_Index + 1

2170          Do
2180              json_SkipSpaces json_String, json_Index
2190              If VBA.Mid$(json_String, json_Index, 1) = "]" Then
2200                  json_Index = json_Index + 1
2210                  Exit Function
2220              ElseIf VBA.Mid$(json_String, json_Index, 1) = "," Then
2230                  json_Index = json_Index + 1
2240                  json_SkipSpaces json_String, json_Index
2250              End If

2260              json_ParseArray.Add json_ParseValue(json_String, json_Index)
2270          Loop
2280      End If
End Function

Private Function json_ParseValue(json_String As String, ByRef json_Index As Long) As Variant
2290      json_SkipSpaces json_String, json_Index
2300      Select Case VBA.Mid$(json_String, json_Index, 1)
          Case "{"
2310          Set json_ParseValue = json_ParseObject(json_String, json_Index)
2320      Case "["
2330          Set json_ParseValue = json_ParseArray(json_String, json_Index)
2340      Case """", "'"
2350          json_ParseValue = json_ParseString(json_String, json_Index)
2360      Case Else
2370          If VBA.Mid$(json_String, json_Index, 4) = "true" Then
2380              json_ParseValue = True
2390              json_Index = json_Index + 4
2400          ElseIf VBA.Mid$(json_String, json_Index, 5) = "false" Then
2410              json_ParseValue = False
2420              json_Index = json_Index + 5
2430          ElseIf VBA.Mid$(json_String, json_Index, 4) = "null" Then
2440              json_ParseValue = Null
2450              json_Index = json_Index + 4
2460          ElseIf VBA.InStr("+-0123456789", VBA.Mid$(json_String, json_Index, 1)) Then
2470              json_ParseValue = json_ParseNumber(json_String, json_Index)
2480          Else
2490              Err.Raise 10001, "JSONConverter", json_ParseErrorMessage(json_String, json_Index, "Expecting 'STRING', 'NUMBER', null, true, false, '{', or '['")
2500          End If
2510      End Select
End Function

Private Function json_ParseString(json_String As String, ByRef json_Index As Long) As String
          Dim json_Quote As String
          Dim json_Char As String
          Dim json_Code As String
          Dim json_Buffer As String
          Dim json_BufferPosition As Long
          Dim json_BufferLength As Long

2520      json_SkipSpaces json_String, json_Index

          ' Store opening quote to look for matching closing quote
2530      json_Quote = VBA.Mid$(json_String, json_Index, 1)
2540      json_Index = json_Index + 1

2550      Do While json_Index > 0 And json_Index <= Len(json_String)
2560          json_Char = VBA.Mid$(json_String, json_Index, 1)

2570          Select Case json_Char
              Case "\"
                  ' Escaped string, \\, or \/
2580              json_Index = json_Index + 1
2590              json_Char = VBA.Mid$(json_String, json_Index, 1)

2600              Select Case json_Char
                  Case """", "\", "/", "'"
2610                  json_BufferAppend json_Buffer, json_Char, json_BufferPosition, json_BufferLength
2620                  json_Index = json_Index + 1
2630              Case "b"
2640                  json_BufferAppend json_Buffer, vbBack, json_BufferPosition, json_BufferLength
2650                  json_Index = json_Index + 1
2660              Case "f"
2670                  json_BufferAppend json_Buffer, vbFormFeed, json_BufferPosition, json_BufferLength
2680                  json_Index = json_Index + 1
2690              Case "n"
2700                  json_BufferAppend json_Buffer, vbCrLf, json_BufferPosition, json_BufferLength
2710                  json_Index = json_Index + 1
2720              Case "r"
2730                  json_BufferAppend json_Buffer, vbCr, json_BufferPosition, json_BufferLength
2740                  json_Index = json_Index + 1
2750              Case "t"
2760                  json_BufferAppend json_Buffer, vbTab, json_BufferPosition, json_BufferLength
2770                  json_Index = json_Index + 1
2780              Case "u"
                      ' Unicode character escape (e.g. \u00a9 = Copyright)
2790                  json_Index = json_Index + 1
2800                  json_Code = VBA.Mid$(json_String, json_Index, 4)
2810                  json_BufferAppend json_Buffer, VBA.ChrW(VBA.Val("&h" + json_Code)), json_BufferPosition, json_BufferLength
2820                  json_Index = json_Index + 4
2830              End Select
2840          Case json_Quote
2850              json_ParseString = json_BufferToString(json_Buffer, json_BufferPosition)
2860              json_Index = json_Index + 1
2870              Exit Function
2880          Case Else
2890              json_BufferAppend json_Buffer, json_Char, json_BufferPosition, json_BufferLength
2900              json_Index = json_Index + 1
2910          End Select
2920      Loop
End Function

Private Function json_ParseNumber(json_String As String, ByRef json_Index As Long) As Variant
          Dim json_Char As String
          Dim json_Value As String
          Dim json_IsLargeNumber As Boolean

2930      json_SkipSpaces json_String, json_Index

2940      Do While json_Index > 0 And json_Index <= Len(json_String)
2950          json_Char = VBA.Mid$(json_String, json_Index, 1)

2960          If VBA.InStr("+-0123456789.eE", json_Char) Then
                  ' Unlikely to have massive number, so use simple append rather than buffer here
2970              json_Value = json_Value & json_Char
2980              json_Index = json_Index + 1
2990          Else
                  ' Excel only stores 15 significant digits, so any numbers larger than that are truncated
                  ' This can lead to issues when BIGINT's are used (e.g. for Ids or Credit Cards), as they will be invalid above 15 digits
                  ' See: http://support.microsoft.com/kb/269370
                  '
                  ' Fix: Parse -> String, Convert -> String longer than 15/16 characters containing only numbers and decimal points -> Number
                  ' (decimal doesn't factor into significant digit count, so if present check for 15 digits + decimal = 16)
3000              json_IsLargeNumber = IIf(InStr(json_Value, "."), Len(json_Value) >= 17, Len(json_Value) >= 16)
3010              If Not JsonOptions.UseDoubleForLargeNumbers And json_IsLargeNumber Then
3020                  json_ParseNumber = json_Value
3030              Else
                      ' VBA.Val does not use regional settings, so guard for comma is not needed
3040                  json_ParseNumber = VBA.Val(json_Value)
3050              End If
3060              Exit Function
3070          End If
3080      Loop
End Function

Private Function json_ParseKey(json_String As String, ByRef json_Index As Long) As String
          ' Parse key with single or double quotes
3090      If VBA.Mid$(json_String, json_Index, 1) = """" Or VBA.Mid$(json_String, json_Index, 1) = "'" Then
3100          json_ParseKey = json_ParseString(json_String, json_Index)
3110      ElseIf JsonOptions.AllowUnquotedKeys Then
              Dim json_Char As String
3120          Do While json_Index > 0 And json_Index <= Len(json_String)
3130              json_Char = VBA.Mid$(json_String, json_Index, 1)
3140              If (json_Char <> " ") And (json_Char <> ":") Then
3150                  json_ParseKey = json_ParseKey & json_Char
3160                  json_Index = json_Index + 1
3170              Else
3180                  Exit Do
3190              End If
3200          Loop
3210      Else
3220          Err.Raise 10001, "JSONConverter", json_ParseErrorMessage(json_String, json_Index, "Expecting '""' or '''")
3230      End If

          ' Check for colon and skip if present or throw if not present
3240      json_SkipSpaces json_String, json_Index
3250      If VBA.Mid$(json_String, json_Index, 1) <> ":" Then
3260          Err.Raise 10001, "JSONConverter", json_ParseErrorMessage(json_String, json_Index, "Expecting ':'")
3270      Else
3280          json_Index = json_Index + 1
3290      End If
End Function

Private Function json_IsUndefined(ByVal json_Value As Variant) As Boolean
          ' Empty / Nothing -> undefined
3300      Select Case VBA.VarType(json_Value)
          Case VBA.vbEmpty
3310          json_IsUndefined = True
3320      Case VBA.vbObject
3330          Select Case VBA.TypeName(json_Value)
              Case "Empty", "Nothing"
3340              json_IsUndefined = True
3350          End Select
3360      End Select
End Function

Private Function json_Encode(ByVal json_Text As Variant) As String
          ' Reference: http://www.ietf.org/rfc/rfc4627.txt
          ' Escape: ", \, /, backspace, form feed, line feed, carriage return, tab
          Dim json_Index As Long
          Dim json_Char As String
          Dim json_AscCode As Long
          Dim json_Buffer As String
          Dim json_BufferPosition As Long
          Dim json_BufferLength As Long

3370      For json_Index = 1 To VBA.Len(json_Text)
3380          json_Char = VBA.Mid$(json_Text, json_Index, 1)
3390          json_AscCode = VBA.AscW(json_Char)

              ' When AscW returns a negative number, it returns the twos complement form of that number.
              ' To convert the twos complement notation into normal binary notation, add 0xFFF to the return result.
              ' https://support.microsoft.com/en-us/kb/272138
3400          If json_AscCode < 0 Then
3410              json_AscCode = json_AscCode + 65536
3420          End If

              ' From spec, ", \, and control characters must be escaped (solidus is optional)

3430          Select Case json_AscCode
              Case 34
                  ' " -> 34 -> \"
3440              json_Char = "\"""
3450          Case 92
                  ' \ -> 92 -> \\
3460              json_Char = "\\"
3470          Case 47
                  ' / -> 47 -> \/ (optional)
3480              If JsonOptions.EscapeSolidus Then
3490                  json_Char = "\/"
3500              End If
3510          Case 8
                  ' backspace -> 8 -> \b
3520              json_Char = "\b"
3530          Case 12
                  ' form feed -> 12 -> \f
3540              json_Char = "\f"
3550          Case 10
                  ' line feed -> 10 -> \n
3560              json_Char = "\n"
3570          Case 13
                  ' carriage return -> 13 -> \r
3580              json_Char = "\r"
3590          Case 9
                  ' tab -> 9 -> \t
3600              json_Char = "\t"
3610          Case 0 To 31, 127 To 65535
                  ' Non-ascii characters -> convert to 4-digit hex
3620              json_Char = "\u" & VBA.Right$("0000" & VBA.Hex$(json_AscCode), 4)
3630          End Select

3640          json_BufferAppend json_Buffer, json_Char, json_BufferPosition, json_BufferLength
3650      Next json_Index

3660      json_Encode = json_BufferToString(json_Buffer, json_BufferPosition)
End Function

Private Function json_Peek(json_String As String, ByVal json_Index As Long, Optional json_NumberOfCharacters As Long = 1) As String
          ' "Peek" at the next number of characters without incrementing json_Index (ByVal instead of ByRef)
3670      json_SkipSpaces json_String, json_Index
3680      json_Peek = VBA.Mid$(json_String, json_Index, json_NumberOfCharacters)
End Function

Private Sub json_SkipSpaces(json_String As String, ByRef json_Index As Long)
          ' Increment index to skip over spaces
3690      Do While json_Index > 0 And json_Index <= VBA.Len(json_String) And VBA.Mid$(json_String, json_Index, 1) = " "
3700          json_Index = json_Index + 1
3710      Loop
End Sub

Private Function json_StringIsLargeNumber(json_String As Variant) As Boolean
          ' Check if the given string is considered a "large number"
          ' (See json_ParseNumber)

          Dim json_Length As Long
          Dim json_CharIndex As Long
3720      json_Length = VBA.Len(json_String)

          ' Length with be at least 16 characters and assume will be less than 100 characters
3730      If json_Length >= 16 And json_Length <= 100 Then
              Dim json_CharCode As String

3740          json_StringIsLargeNumber = True

3750          For json_CharIndex = 1 To json_Length
3760              json_CharCode = VBA.Asc(VBA.Mid$(json_String, json_CharIndex, 1))
3770              Select Case json_CharCode
                  ' Look for .|0-9|E|e
                  Case 46, 48 To 57, 69, 101
                      ' Continue through characters
3780              Case Else
3790                  json_StringIsLargeNumber = False
3800                  Exit Function
3810              End Select
3820          Next json_CharIndex
3830      End If
End Function

Private Function json_ParseErrorMessage(json_String As String, ByRef json_Index As Long, ErrorMessage As String)
          ' Provide detailed parse error message, including details of where and what occurred
          '
          ' Example:
          ' Error parsing JSON:
          ' {"abcde":True}
          '          ^
          ' Expecting 'STRING', 'NUMBER', null, true, false, '{', or '['

          Dim json_StartIndex As Long
          Dim json_StopIndex As Long

          ' Include 10 characters before and after error (if possible)
3840      json_StartIndex = json_Index - 10
3850      json_StopIndex = json_Index + 10
3860      If json_StartIndex <= 0 Then
3870          json_StartIndex = 1
3880      End If
3890      If json_StopIndex > VBA.Len(json_String) Then
3900          json_StopIndex = VBA.Len(json_String)
3910      End If

3920      json_ParseErrorMessage = "Error parsing JSON:" & VBA.vbNewLine & _
                                   VBA.Mid$(json_String, json_StartIndex, json_StopIndex - json_StartIndex + 1) & VBA.vbNewLine & _
                                   VBA.Space$(json_Index - json_StartIndex) & "^" & VBA.vbNewLine & _
                                   ErrorMessage
End Function

Private Sub json_BufferAppend(ByRef json_Buffer As String, _
                              ByRef json_Append As Variant, _
                              ByRef json_BufferPosition As Long, _
                              ByRef json_BufferLength As Long)
          ' VBA can be slow to append strings due to allocating a new string for each append
          ' Instead of using the traditional append, allocate a large empty string and then copy string at append position
          '
          ' Example:
          ' Buffer: "abc  "
          ' Append: "def"
          ' Buffer Position: 3
          ' Buffer Length: 5
          '
          ' Buffer position + Append length > Buffer length -> Append chunk of blank space to buffer
          ' Buffer: "abc       "
          ' Buffer Length: 10
          '
          ' Put "def" into buffer at position 3 (0-based)
          ' Buffer: "abcdef    "
          '
          ' Approach based on cStringBuilder from vbAccelerator
          ' http://www.vbaccelerator.com/home/VB/Code/Techniques/RunTime_Debug_Tracing/VB6_Tracer_Utility_zip_cStringBuilder_cls.asp
          '
          ' and clsStringAppend from Philip Swannell
          ' https://github.com/VBA-tools/VBA-JSON/pull/82

          Dim json_AppendLength As Long
          Dim json_LengthPlusPosition As Long

3930      json_AppendLength = VBA.Len(json_Append)
3940      json_LengthPlusPosition = json_AppendLength + json_BufferPosition

3950      If json_LengthPlusPosition > json_BufferLength Then
              ' Appending would overflow buffer, add chunk
              ' (double buffer length or append length, whichever is bigger)
              Dim json_AddedLength As Long
3960          json_AddedLength = IIf(json_AppendLength > json_BufferLength, json_AppendLength, json_BufferLength)

3970          json_Buffer = json_Buffer & VBA.Space$(json_AddedLength)
3980          json_BufferLength = json_BufferLength + json_AddedLength
3990      End If

          ' Note: Namespacing with VBA.Mid$ doesn't work properly here, throwing compile error:
          ' Function call on left-hand side of assignment must return Variant or Object
4000      Mid$(json_Buffer, json_BufferPosition + 1, json_AppendLength) = CStr(json_Append)
4010      json_BufferPosition = json_BufferPosition + json_AppendLength
End Sub

Private Function json_BufferToString(ByRef json_Buffer As String, ByVal json_BufferPosition As Long) As String
4020      If json_BufferPosition > 0 Then
4030          json_BufferToString = VBA.Left$(json_Buffer, json_BufferPosition)
4040      End If
End Function

''
' VBA-UTC v1.0.6
' (c) Tim Hall - https://github.com/VBA-tools/VBA-UtcConverter
'
' UTC/ISO 8601 Converter for VBA
'
' Errors:
' 10011 - UTC parsing error
' 10012 - UTC conversion error
' 10013 - ISO 8601 parsing error
' 10014 - ISO 8601 conversion error
'
' @module UtcConverter
' @author tim.hall.engr@gmail.com
' @license MIT (http://www.opensource.org/licenses/mit-license.php)
'' ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~ '

' (Declarations moved to top)

' ============================================= '
' Public Methods
' ============================================= '

''
' Parse UTC date to local date
'
' @method ParseUtc
' @param {Date} UtcDate
' @return {Date} Local date
' @throws 10011 - UTC parsing error
''
Public Function ParseUtc(utc_UtcDate As Date) As Date
4050      On Error GoTo utc_ErrorHandling

#If Mac Then
4060      ParseUtc = utc_ConvertDate(utc_UtcDate)
#Else
          Dim utc_TimeZoneInfo As utc_TIME_ZONE_INFORMATION
          Dim utc_LocalDate As utc_SYSTEMTIME

4070      utc_GetTimeZoneInformation utc_TimeZoneInfo
4080      utc_SystemTimeToTzSpecificLocalTime utc_TimeZoneInfo, utc_DateToSystemTime(utc_UtcDate), utc_LocalDate

4090      ParseUtc = utc_SystemTimeToDate(utc_LocalDate)
#End If

4100      Exit Function

utc_ErrorHandling:
4110      Err.Raise 10011, "UtcConverter.ParseUtc", "UTC parsing error: " & Err.Number & " - " & Err.Description
End Function

''
' Convert local date to UTC date
'
' @method ConvertToUrc
' @param {Date} utc_LocalDate
' @return {Date} UTC date
' @throws 10012 - UTC conversion error
''
Public Function ConvertToUtc(utc_LocalDate As Date) As Date
4120      On Error GoTo utc_ErrorHandling

#If Mac Then
4130      ConvertToUtc = utc_ConvertDate(utc_LocalDate, utc_ConvertToUtc:=True)
#Else
          Dim utc_TimeZoneInfo As utc_TIME_ZONE_INFORMATION
          Dim utc_UtcDate As utc_SYSTEMTIME

4140      utc_GetTimeZoneInformation utc_TimeZoneInfo
4150      utc_TzSpecificLocalTimeToSystemTime utc_TimeZoneInfo, utc_DateToSystemTime(utc_LocalDate), utc_UtcDate

4160      ConvertToUtc = utc_SystemTimeToDate(utc_UtcDate)
#End If

4170      Exit Function

utc_ErrorHandling:
4180      Err.Raise 10012, "UtcConverter.ConvertToUtc", "UTC conversion error: " & Err.Number & " - " & Err.Description
End Function

''
' Parse ISO 8601 date string to local date
'
' @method ParseIso
' @param {Date} utc_IsoString
' @return {Date} Local date
' @throws 10013 - ISO 8601 parsing error
''
Public Function ParseIso(utc_IsoString As String) As Date
4190      On Error GoTo utc_ErrorHandling

          Dim utc_Parts() As String
          Dim utc_DateParts() As String
          Dim utc_TimeParts() As String
          Dim utc_OffsetIndex As Long
          Dim utc_HasOffset As Boolean
          Dim utc_NegativeOffset As Boolean
          Dim utc_OffsetParts() As String
          Dim utc_Offset As Date

4200      utc_Parts = VBA.Split(utc_IsoString, "T")
4210      utc_DateParts = VBA.Split(utc_Parts(0), "-")
4220      ParseIso = VBA.DateSerial(VBA.CInt(utc_DateParts(0)), VBA.CInt(utc_DateParts(1)), VBA.CInt(utc_DateParts(2)))

4230      If UBound(utc_Parts) > 0 Then
4240          If VBA.InStr(utc_Parts(1), "Z") Then
4250              utc_TimeParts = VBA.Split(VBA.Replace(utc_Parts(1), "Z", ""), ":")
4260          Else
4270              utc_OffsetIndex = VBA.InStr(1, utc_Parts(1), "+")
4280              If utc_OffsetIndex = 0 Then
4290                  utc_NegativeOffset = True
4300                  utc_OffsetIndex = VBA.InStr(1, utc_Parts(1), "-")
4310              End If

4320              If utc_OffsetIndex > 0 Then
4330                  utc_HasOffset = True
4340                  utc_TimeParts = VBA.Split(VBA.Left$(utc_Parts(1), utc_OffsetIndex - 1), ":")
4350                  utc_OffsetParts = VBA.Split(VBA.Right$(utc_Parts(1), Len(utc_Parts(1)) - utc_OffsetIndex), ":")

4360                  Select Case UBound(utc_OffsetParts)
                      Case 0
4370                      utc_Offset = TimeSerial(VBA.CInt(utc_OffsetParts(0)), 0, 0)
4380                  Case 1
4390                      utc_Offset = TimeSerial(VBA.CInt(utc_OffsetParts(0)), VBA.CInt(utc_OffsetParts(1)), 0)
4400                  Case 2
                          ' VBA.Val does not use regional settings, use for seconds to avoid decimal/comma issues
4410                      utc_Offset = TimeSerial(VBA.CInt(utc_OffsetParts(0)), VBA.CInt(utc_OffsetParts(1)), Int(VBA.Val(utc_OffsetParts(2))))
4420                  End Select

4430                  If utc_NegativeOffset Then: utc_Offset = -utc_Offset
4440              Else
4450                  utc_TimeParts = VBA.Split(utc_Parts(1), ":")
4460              End If
4470          End If

4480          Select Case UBound(utc_TimeParts)
              Case 0
4490              ParseIso = ParseIso + VBA.TimeSerial(VBA.CInt(utc_TimeParts(0)), 0, 0)
4500          Case 1
4510              ParseIso = ParseIso + VBA.TimeSerial(VBA.CInt(utc_TimeParts(0)), VBA.CInt(utc_TimeParts(1)), 0)
4520          Case 2
                  ' VBA.Val does not use regional settings, use for seconds to avoid decimal/comma issues
4530              ParseIso = ParseIso + VBA.TimeSerial(VBA.CInt(utc_TimeParts(0)), VBA.CInt(utc_TimeParts(1)), Int(VBA.Val(utc_TimeParts(2))))
4540          End Select

4550          ParseIso = ParseUtc(ParseIso)

4560          If utc_HasOffset Then
4570              ParseIso = ParseIso - utc_Offset
4580          End If
4590      End If

4600      Exit Function

utc_ErrorHandling:
4610      Err.Raise 10013, "UtcConverter.ParseIso", "ISO 8601 parsing error for " & utc_IsoString & ": " & Err.Number & " - " & Err.Description
End Function

''
' Convert local date to ISO 8601 string
'
' @method ConvertToIso
' @param {Date} utc_LocalDate
' @return {Date} ISO 8601 string
' @throws 10014 - ISO 8601 conversion error
''
Public Function ConvertToIso(utc_LocalDate As Date) As String
4620      On Error GoTo utc_ErrorHandling

4630      ConvertToIso = VBA.Format$(ConvertToUtc(utc_LocalDate), "yyyy-mm-ddTHH:mm:ss.000Z")

4640      Exit Function

utc_ErrorHandling:
4650      Err.Raise 10014, "UtcConverter.ConvertToIso", "ISO 8601 conversion error: " & Err.Number & " - " & Err.Description
End Function

' ============================================= '
' Private Functions
' ============================================= '

#If Mac Then

Private Function utc_ConvertDate(utc_Value As Date, Optional utc_ConvertToUtc As Boolean = False) As Date
          Dim utc_ShellCommand As String
          Dim utc_Result As utc_ShellResult
          Dim utc_Parts() As String
          Dim utc_DateParts() As String
          Dim utc_TimeParts() As String

4660      If utc_ConvertToUtc Then
4670          utc_ShellCommand = "date -ur `date -jf '%Y-%m-%d %H:%M:%S' " & _
                  "'" & VBA.Format$(utc_Value, "yyyy-mm-dd HH:mm:ss") & "' " & _
                  " +'%s'` +'%Y-%m-%d %H:%M:%S'"
4680      Else
4690          utc_ShellCommand = "date -jf '%Y-%m-%d %H:%M:%S %z' " & _
                  "'" & VBA.Format$(utc_Value, "yyyy-mm-dd HH:mm:ss") & " +0000' " & _
                  "+'%Y-%m-%d %H:%M:%S'"
4700      End If

4710      utc_Result = utc_ExecuteInShell(utc_ShellCommand)

4720      If utc_Result.utc_Output = "" Then
4730          Err.Raise 10015, "UtcConverter.utc_ConvertDate", "'date' command failed"
4740      Else
4750          utc_Parts = Split(utc_Result.utc_Output, " ")
4760          utc_DateParts = Split(utc_Parts(0), "-")
4770          utc_TimeParts = Split(utc_Parts(1), ":")

4780          utc_ConvertDate = DateSerial(utc_DateParts(0), utc_DateParts(1), utc_DateParts(2)) + _
                  TimeSerial(utc_TimeParts(0), utc_TimeParts(1), utc_TimeParts(2))
4790      End If
End Function

Private Function utc_ExecuteInShell(utc_ShellCommand As String) As utc_ShellResult
#If VBA7 Then
          Dim utc_File As LongPtr
          Dim utc_Read As LongPtr
#Else
          Dim utc_File As Long
          Dim utc_Read As Long
#End If

          Dim utc_Chunk As String

4800      On Error GoTo utc_ErrorHandling
4810      utc_File = utc_popen(utc_ShellCommand, "r")

4820      If utc_File = 0 Then: Exit Function

4830      Do While utc_feof(utc_File) = 0
4840          utc_Chunk = VBA.Space$(50)
4850          utc_Read = CLng(utc_fread(utc_Chunk, 1, Len(utc_Chunk) - 1, utc_File))
4860          If utc_Read > 0 Then
4870              utc_Chunk = VBA.Left$(utc_Chunk, CLng(utc_Read))
4880              utc_ExecuteInShell.utc_Output = utc_ExecuteInShell.utc_Output & utc_Chunk
4890          End If
4900      Loop

utc_ErrorHandling:
4910      utc_ExecuteInShell.utc_ExitCode = CLng(utc_pclose(utc_File))
End Function

#Else

Private Function utc_DateToSystemTime(utc_Value As Date) As utc_SYSTEMTIME
4920      utc_DateToSystemTime.utc_wYear = VBA.Year(utc_Value)
4930      utc_DateToSystemTime.utc_wMonth = VBA.Month(utc_Value)
4940      utc_DateToSystemTime.utc_wDay = VBA.Day(utc_Value)
4950      utc_DateToSystemTime.utc_wHour = VBA.Hour(utc_Value)
4960      utc_DateToSystemTime.utc_wMinute = VBA.Minute(utc_Value)
4970      utc_DateToSystemTime.utc_wSecond = VBA.Second(utc_Value)
4980      utc_DateToSystemTime.utc_wMilliseconds = 0
End Function

Private Function utc_SystemTimeToDate(utc_Value As utc_SYSTEMTIME) As Date
4990      utc_SystemTimeToDate = DateSerial(utc_Value.utc_wYear, utc_Value.utc_wMonth, utc_Value.utc_wDay) + _
              TimeSerial(utc_Value.utc_wHour, utc_Value.utc_wMinute, utc_Value.utc_wSecond)
End Function

#End If
