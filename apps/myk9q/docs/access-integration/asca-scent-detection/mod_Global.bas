Attribute VB_Name = "mod_Global"
Option Compare Database
Option Explicit

' ===================================================================
' Global Constants for Supabase API - ASCA Scent Detection
' ===================================================================
' Define these here in one place. Use Public Const to make them
' available to all other modules and forms in the application.
' ===================================================================

' myK9Q v3 Supabase Database (shared across all sports)
Public Const SUPABASE_URL_2 As String = "https://yyzgjyiqgmjzyhzkqdfx.supabase.co"
Public Const SUPABASE_KEY_2 As String = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl5emdqeWlxZ21qenloemtxZGZ4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTUwMjYzMzIsImV4cCI6MjA3MDYwMjMzMn0.vXgwI9HyBMiH-t6WP13unRgFVc9rg3khDRNdhIedWqs"


' ===================================================================
' Global Constants for ASCA Scoring
' ===================================================================
' ASCA Scent Detection scoring differs from AKC:
' - Novice/Open: Max 2 faults allowed
' - Advanced/Excellent: Max 1 fault allowed
' ===================================================================
Public Const SCORE_CORRECT As Long = 10
Public Const SCORE_INCORRECT As Long = -5
Public Const SCORE_NO_FINISH As Long = -5
Public Const SCORE_FAULT As Long = -2
Public Const SCORE_EXCUSED As Long = 0


' ===================================================================
' JSON Helper Functions
' ===================================================================

Public Function JsonSafe(str As String) As String
    ' This function takes a string and escapes characters that would break a JSON structure.
    Dim temp As String
    temp = str
    ' Replace backslashes first!
    temp = Replace(temp, "\", "\\")
    ' Replace double quotes
    temp = Replace(temp, """", "\""")
    ' Replace other common control characters
    temp = Replace(temp, vbLf, "\n")
    temp = Replace(temp, vbCr, "\r")
    temp = Replace(temp, vbTab, "\t")

    JsonSafe = temp
End Function

Public Function ParseSupabaseDate(ByVal dateString As Variant) As Date
    ' Safely parses a Supabase timestamp string (YYYY-MM-DDTHH:MM:SS+ZZ:ZZ)
    ' into a valid Access Date/Time value.
    On Error GoTo DateError

    If IsNull(dateString) Or dateString = "" Then
        ParseSupabaseDate = Now ' Return current time as a fallback
        Exit Function
    End If

    ' Split the string at the "T" to separate date and time
    Dim parts() As String
    parts = Split(dateString, "T")

    Dim datePart As String
    datePart = parts(0)

    ' Get the time part and remove any timezone info
    Dim timePart As String
    timePart = parts(1)
    If InStr(timePart, "+") > 0 Then timePart = Split(timePart, "+")(0)
    If InStr(timePart, ".") > 0 Then timePart = Split(timePart, ".")(0) ' Handle milliseconds

    ' Combine and convert
    ParseSupabaseDate = CDate(datePart & " " & timePart)

    Exit Function

DateError:
    ' If anything goes wrong, return the current time as a safe default.
    ParseSupabaseDate = Now
End Function

Public Function FormatTimeValue(ByVal timeValue As Variant) As String
    ' A robust, global function to format various time inputs into a consistent MM:SS format.

    Dim cleanString As String

    ' Handle Nulls and clean the input string of any separators
    cleanString = Replace(Nz(timeValue, ""), ":", "")
    cleanString = Replace(cleanString, ".", "")

    If Len(cleanString) >= 4 And IsNumeric(cleanString) Then
        ' If we have at least 4 digits, format it as MM:SS
        FormatTimeValue = Left(cleanString, 2) & ":" & Mid(cleanString, 3, 2)
    Else
        ' Otherwise, return a safe default
        FormatTimeValue = "00:00"
    End If

End Function

' NOTE: CheckInternetConnectivity() is provided by mod_License.bas - do not duplicate here
