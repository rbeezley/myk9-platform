Attribute VB_Name = "mod_XML"
Option Compare Database
' Add formatting to the document.
Private Sub FormatXmlDocument(ByVal xml_doc As MSXML2.DOMDocument60)
1970      FormatXmlNode xml_doc.DocumentElement, 0
End Sub

' Add formatting to this element. Indent it and add a
' carriage return before its children. Then recursively
' format the children with increased indentation.
Private Sub FormatXmlNode(ByVal node As IXMLDOMNode, ByVal _
    indent As Integer)
      Dim child As IXMLDOMNode
      Dim text_only As Boolean

          ' Do nothing if this is a text node.
1980      If TypeOf node Is IXMLDOMText Then Exit Sub

          ' See if this node contains only text.
1990      text_only = True
2000      If node.HasChildNodes Then
2010          For Each child In node.ChildNodes
2020              If Not (TypeOf child Is IXMLDOMText) Then
2030                  text_only = False
2040                  Exit For
2050              End If
2060          Next child
2070      End If

          ' Process child nodes.
2080      If node.HasChildNodes Then
              ' Add a carriage return before the children.
2090          If Not text_only Then
2100              node.InsertBefore _
                      node.OwnerDocument.createTextNode(vbCrLf), _
                      node.FirstChild
2110          End If

              ' Format the children.
2120          For Each child In node.ChildNodes
2130              FormatXmlNode child, indent + 2
2140          Next child
2150      End If

          ' Format this element.
2160      If indent > 0 Then
              ' Indent before this element.
2170          node.ParentNode.InsertBefore _
                  node.OwnerDocument.createTextNode(Space$(indent)), _
 _
                  node

              ' Indent after the last child node.
2180          If Not text_only Then _
                  node.appendChild _
                      node.OwnerDocument.createTextNode(Space$(indent))

              ' Add a carriage return after this node.
2190          If node.NextSibling Is Nothing Then
2200              node.ParentNode.appendChild _
                      node.OwnerDocument.createTextNode(vbCrLf)
2210          Else
2220              node.ParentNode.InsertBefore _
                      node.OwnerDocument.createTextNode(vbCrLf), _
                      node.NextSibling
2230          End If
2240      End If
End Sub

' Create Normalized Text (Change &, <, >, ', " to &name; format)
Private Function anXMLString(theString As String)
          Dim aString As String
          
2250      aString = theString
          'aString = Replace(aString, "&", "&amp;")
          'aString = Replace(aString, "<", "&lt;")
          'aString = Replace(aString, ">", "&gt;")
          'aString = Replace(aString, "'", "&apos;")
          'aString = Replace(aString, """", "&quot;")
          
2260      anXMLString = aString
      'Debug.Print aString
          
End Function

' Return the Minimum of 2 Integers
Private Function minOf2Integers(integer1 As Integer, integer2 As Integer)
2270      If integer1 < integer2 Then
2280          minOf2Integers = integer1
2290      Else
2300          minOf2Integers = integer2
2310      End If
End Function

' Create a Node
Private Function createNode(theDom As DOMDocument60, theName As String)

          ' Set createNode = theDom.createElement(theName)
2320      Set createNode = theDom.createNode(NODE_ELEMENT, theName, "http://www.akc.org")

End Function

' Create A Node and Make it a Child of the Parent Node
Private Function createNodeAndAdd(theDom As DOMDocument60, theName As String, theParentNode As MSXML2.IXMLDOMElement)
          Dim theNode As MSXML2.IXMLDOMElement
          
2330      Set theNode = createNode(theDom, theName)
          
2340      theParentNode.appendChild theNode
          
2350      Set createNodeAndAdd = theNode
          
End Function

' Add a Node with a Value as Child of A Parent Node
Private Sub addNodeWithValue(theDom As DOMDocument60, theName As String, theParentNode As MSXML2.IXMLDOMElement, theValue As String)
          Dim theNode As MSXML2.IXMLDOMElement
          
2360      Set theNode = createNodeAndAdd(theDom, theName, theParentNode)
          
2370      theNode.text = anXMLString(theValue)
          
End Sub

' Add an Attribute to a Node
Private Sub addAttribute(theDom As DOMDocument60 _
                        , theNode As IXMLDOMElement _
                        , theAttribute As String _
                        , theValue As String _
                        )
          Dim aAttribute As IXMLDOMAttribute

          ' Init athe Attribute
2380      Set aAttribute = theDom.createAttribute(theAttribute)

          ' Set the Attribute Value
2390      aAttribute.Value = anXMLString(theValue)

          ' Add the Attribute to the Node
2400      theNode.setAttributeNode aAttribute
          
End Sub

' Add the ownerAddress to a Node
Private Sub addOwnerAddress(theDom As DOMDocument60 _
                           , theNode As IXMLDOMElement _
                           , theAddressLine1 As String _
                           , theAddressLine2 As String _
                           , theAddressLine3 As String _
                           , theCity As String _
                           , theState As String _
                           , thePostalCode As String _
                           , isUstrAddress As Boolean _
                           )
                                 
          Dim addressNode As MSXML2.IXMLDOMElement
          Dim theStateName As String
          Dim thePostalCodeName As String
          
2410      Set addressNode = createNodeAndAdd(theDom, "ownerAddress", theNode)
          
2420      Call addNodeWithValue(theDom, "addressLine", addressNode, theAddressLine1)
2430      If Len(theAddressLine2) > 0 Then
2440          Call addNodeWithValue(theDom, "addressLine", addressNode, theAddressLine2)
2450      End If
2460      If Len(theAddressLine3) > 0 Then
2470          Call addNodeWithValue(theDom, "addressLine", addressNode, theAddressLine3)
2480      End If
2490      Call addNodeWithValue(theDom, "city", addressNode, theCity)
2500      If isUstrAddress Then
2510          theStateName = "USState"
2520          thePostalCodeName = "USPostalCode"
2530      Else
2540          theStateName = "ForeignState"
2550          thePostalCodeName = "ForeignPostalCode"
2560      End If
2570      Call addNodeWithValue(theDom, theStateName, addressNode, theState)
2580      Call addNodeWithValue(theDom, thePostalCodeName, addressNode, thePostalCode)
          
End Sub
                          
Private Function buildXML()

2590      On Error GoTo fError

          Dim xmlDom As MSXML2.DOMDocument60
          Dim xmlRootNode As MSXML2.IXMLDOMElement
          Dim xmlAttribute As MSXML2.IXMLDOMAttribute
          
          Dim eventNode As MSXML2.IXMLDOMElement
          Dim eventIndex As Integer
          Dim eventCount As Integer
2600      eventCount = 1
          
          Dim classNode As MSXML2.IXMLDOMElement
          Dim classIndex As Integer
          Dim classCount As Integer
2610      classCount = 1
          
          Dim resultsNode As MSXML2.IXMLDOMElement
          Dim resultsIndex As Integer
          Dim resultsCount As Integer
2620      resultsCount = 2
          
          Dim ownerIndex As Integer
          Dim ownerCount As Integer
          Dim theMaximumOwners As Integer
2630      theMaximumOwners = 6    ' Max Owners Set by XSD file
          
          Dim jrShowInfoNode As MSXML2.IXMLDOMElement
          
          Dim resultCode As MSXML2.IXMLDOMElement
          
          Dim db As DAO.Database
          Dim rsTrial As DAO.Recordset
          Dim rsClass As DAO.Recordset
          Dim strSQL As String
          Dim iSecretaryID As Integer
          Dim strSecretaryName As String
          Dim strSecretaryEmail As String
          Dim iTrialCount As Integer
          Dim iResultCount As Integer
          Dim iSearchTime As Double
          Dim strActionCode As String
          Dim iEntries As Integer
          Dim iWithdrawn As Integer
          Dim iStarters As Integer
          Dim iAbsent As Integer
          Dim iQualified As Integer
          Dim strTrialDate As String
          Dim strPrimaryClass As String
          Dim strSecondaryClass As String
          Dim isUstrAddress As Boolean
          Dim strGender As String
          Dim strPlacement As String
          Dim iPlacement As Integer
          Dim strMaxTime As String
          Dim strMaxTimeMin As String
          Dim strMaxTimeSec As String
          Dim iMaxTime As Integer
          Dim iLength
          
          ' Init the DOM object
2640      Set xmlDom = New MSXML2.DOMDocument60

          ' Add the XML Declaration
          'xmlDom.appendChild xmlDom.createProcessingInstruction("xml", "version=""1.0""  encoding=""UTF-8"" standalone=""yes""")
2650      xmlDom.appendChild xmlDom.createProcessingInstruction("xml", "version=""1.0""")

          ' Init the Root Node and set the NameSpace (xmlns)
2660      Set xmlRootNode = createNode(xmlDom, "sender")
          
          
          ' Add the Root Node to the DOM
2670      xmlDom.appendChild xmlRootNode

          'Get Trial Secretary Name and email Address
2680      iSecretaryID = Nz(DLookup("SecretaryID_FK", "tbl_Show", "ShowID = " & TempVars!tmpShowID), 0)
2690      strSecretaryName = Nz(DLookup("FullName", "tbl_Person", "PersonID = " & iSecretaryID), "-")
2700      strSecretaryEmail = Nz(DLookup("Email", "tbl_Person", "PersonID = " & iSecretaryID), "-")

          ' Add schemaVersion, xmlns, xmlns:xsi, and xsi:schemaLocation to the "sender" node
2710      Call addAttribute(xmlDom, xmlRootNode, "schemaVersion", "1.0")
          
          ' Call addAttribute(xmlDom, xmlRootNode, "xmlns", "http://www.akc.org")
          
2720      Call addAttribute(xmlDom, xmlRootNode, "xmlns:xsi", "http://www.w3.org/2001/XMLSchema-instance")
          
2730      Call addAttribute(xmlDom, xmlRootNode, "xsi:schemaLocation", "http://www.akc.org electres.xsd")
          
          ' Add the Attributes to the Root Node
2740      Call addAttribute(xmlDom, xmlRootNode, "name", Nz(strSecretaryName, ""))
          '   responseEmail=
2750      Call addAttribute(xmlDom, xmlRootNode, "responseEmail", Nz(strSecretaryEmail, ""))
          
          'Get Trials
2760      strSQL = "SELECT tbl_Show.showID, tbl_Trial.trialID, tbl_Trial.TrialDate, tbl_Trial.AKCEvent, tbl_Club.AKCClubName " & _
          "FROM (tbl_Show INNER JOIN tbl_Trial ON tbl_Show.showID = tbl_Trial.ShowID_FK) INNER JOIN tbl_Club ON tbl_Show.ClubID_FK = tbl_Club.clubID " & _
          "WHERE (((tbl_Show.showID)=" & TempVars!tmpShowID & "));"
          
      'Debug.Print strSQL
          
2770      Set db = CurrentDb
2780      Set rsTrial = db.OpenRecordset(strSQL)
          
          ' Get number of Trials in the Show
2790      rsTrial.MoveLast
2800      rsTrial.MoveFirst
2810      iTrialCount = rsTrial.RecordCount

          
          ' Event Loop
2820      For eventIndex = 1 To iTrialCount
          
              'Get TrialID
              'TempVars.Add "tmpTrialID_XML", rsTrial!trialID.value
              
              ' Init the Event Node
2830          Set eventNode = createNodeAndAdd(xmlDom, "event", xmlRootNode)
              
              ' Add the Attributes to the Event Node
              '    akceventid
2840          Call addAttribute(xmlDom, eventNode, "akceventid", Nz(rsTrial!AKCEvent, ""))
              
              '    clubName
2850          TempVars.Add "tmpClubName", rsTrial!AKCClubName.Value
2860          Call addAttribute(xmlDom, eventNode, "clubName", Nz(rsTrial!AKCClubName, ""))
              
              '    eventDate
2870          strTrialDate = rsTrial!TrialDate
2880          strTrialDate = Format(strTrialDate, "yyyy-mm-dd")
2890          Call addAttribute(xmlDom, eventNode, "eventDate", strTrialDate)
             
              ' Get Classes
2900          strSQL = "SELECT tbl_Trial.trialID, tbl_Class.classID, [Level] & ' ' & [Section] AS PrimaryClass, [Element] AS SecondaryClass, [TimeLimit] AS MaxTime " & _
              "FROM tbl_Trial INNER JOIN tbl_Class ON tbl_Trial.trialID = tbl_Class.TrialID_FK " & _
              "WHERE (((tbl_Trial.trialID)= " & rsTrial!trialID & ") AND ((tbl_Class.Element)<>'Waitlist')) Order By ClassOrder;"

      'Debug.Print strSQL

2910          Set db = CurrentDb
2920          Set rsClass = db.OpenRecordset(strSQL)
              
              ' Move to Next Trial in Recordset
2930          rsTrial.MoveNext
              
              ' Get Number of Classes in this Trial
2940          rsClass.MoveLast
2950          rsClass.MoveFirst
2960          iClassCount = rsClass.RecordCount
                      
              ' Class Loop
2970          For classIndex = 1 To iClassCount
              
                  'Get ClassID
                  'TempVars.Add "tmpClassID_XML", rsClass!ClassID.value
                  
                  ' Get Results
2980              strSQL = "SELECT tbl_Class.classID, tbl_Entry.Armband, tbl_Entry.Qualified, tbl_Entry.NQ, tbl_Entry.Absent, tbl_Entry.Withdrawn, tbl_Entry.Placement, tbl_Entry.Millisecs1, tbl_Entry.Millisecs2, tbl_Entry.Millisecs3, tbl_Exhibitor.RegisteredName, tbl_Exhibitor.AKCRegistrationNumber, tbl_Exhibitor.Gender, tbl_Breed.breedCodeType, tbl_Person.FullName AS Owner, tbl_Person.Address, tbl_Person.City, tbl_State.StateAbbr, tbl_Person.ZipCode, tbl_Person_1.AKC_JRNumber, tbl_Person_1.JRDOB, tbl_Person_1.FullName AS Handler " & _
                    "FROM tbl_Person AS tbl_Person_1 INNER JOIN (tbl_Class INNER JOIN ((tbl_State INNER JOIN tbl_Person ON tbl_State.StateID = tbl_Person.StateID_FK) INNER JOIN ((tbl_Exhibitor INNER JOIN tbl_Entry ON tbl_Exhibitor.exhibitorID = tbl_Entry.exhibitorID_FK) INNER JOIN tbl_Breed ON tbl_Exhibitor.AKCBreedID_FK = tbl_Breed.breedID) ON tbl_Person.personID = tbl_Exhibitor.OwnerID_FK) ON tbl_Class.classID = tbl_Entry.classID_FK) ON tbl_Person_1.personID = tbl_Entry.HandlerID_FK " & _
                    "WHERE (((tbl_Class.classID)= " & rsClass!classID & ")) AND ((tbl_Entry.entry_status)= 'Accepted') " & _
                    "ORDER BY tbl_Entry.PlacementSort;"
                  
      'Debug.Print strSQL
          
2990              Set db = CurrentDb
3000              Set rsResult = db.OpenRecordset(strSQL)
                  
                  ' Get Number of Exhibitors in this Class
                  'If Not rsResult.BOF And Not rsResult.EOF Then
                      'rsResult.MoveLast
                      'rsResult.MoveFirst
                      'iResultCount = rsResult.RecordCount
                  'Else
                    'iResultCount = 0
                   'End If

3010               If rsResult.BOF And rsResult.EOF Then
3020                    iResultCount = 0
3030                    rsClass.MoveNext
3040               Else
3050                    rsResult.MoveLast
3060                    rsResult.MoveFirst
3070                    iResultCount = rsResult.RecordCount

                  
                  ' Init the Class Node
3080              Set classNode = createNodeAndAdd(xmlDom, "class", eventNode)
                  
                  ' Add the Attributes to the Class Node
                  '    compGroup
3090              Call addAttribute(xmlDom, classNode, "compGroup", "SCWK")
                  
                  '    primaryClass
3100                strPrimaryClass = Nz(rsClass!PrimaryClass, "")
3110                If strPrimaryClass = "Novice A" Then
3120                    strPrimaryClass = "SWNOVA"
3130                ElseIf strPrimaryClass = "Novice B" Then
3140                    strPrimaryClass = "SWNOVB"
3150                ElseIf strPrimaryClass = "Advanced -" Then
3160                    strPrimaryClass = "SWADV"
3170                ElseIf strPrimaryClass = "Excellent -" Then
3180                    strPrimaryClass = "SWEXC"
3190                ElseIf strPrimaryClass = "Master -" Then
3200                    strPrimaryClass = "SWMAST"
3210                ElseIf strPrimaryClass = "- -" Then ' Detective
3220                    strPrimaryClass = "SWDC"
3230                End If
                    

3240                    Call addAttribute(xmlDom, classNode, "primaryClass", strPrimaryClass)
                  
                  '    secondaryClass
3250                strSecondaryClass = Nz(rsClass!SecondaryClass, "")
3260                If strSecondaryClass = "Container" Then
3270                    strSecondaryClass = "CONTAINR"
3280                ElseIf strSecondaryClass = "Interior" Then
3290                    strSecondaryClass = "INTERIOR"
3300                ElseIf strSecondaryClass = "Exterior" Then
3310                    strSecondaryClass = "EXTERIOR"
3320                ElseIf strSecondaryClass = "Buried" Then
3330                    strSecondaryClass = "BURIED"
3340                ElseIf strSecondaryClass = "Handler Discrimination" Then
3350                    strSecondaryClass = "HANDDISC"
3360                End If

3370                If strSecondaryClass <> "Detective" Then
3380                    Call addAttribute(xmlDom, classNode, "secondaryClass", strSecondaryClass)
3390                End If

      'Debug.Print strPrimaryClass & " - " & strSecondaryClass
                  
                  '    breedCode
3400              Call addAttribute(xmlDom, classNode, "breedCode", "ALLB")
                  
                  '    gender - Always C for Combined
3410              Call addAttribute(xmlDom, classNode, "gender", "C")
                  
                  '    courseTime - Time Limit
3420              strMaxTimeMin = Left(Nz(rsClass!MaxTime, 0), 2)
3430              strMaxTimeSec = Right(Nz(rsClass!MaxTime, 0), 2)
3440              iMaxTime = Nz(strMaxTimeMin, 0)
3450              iMaxTime = iMaxTime * 60
3460              strMaxTime = iMaxTime & "." & Nz(strMaxTimeSec, 0)
                  
3470              Call addAttribute(xmlDom, classNode, "courseTime", strMaxTime)
                  
                  
                  
3480              iEntries = rsResult.RecordCount
3490              iWithdrawn = DCount("Armband", "tbl_Entry", "classID_FK = " & rsClass!classID & " and Withdrawn = True")
3500              iAbsent = DCount("Armband", "tbl_Entry", "classID_FK = " & rsClass!classID & " and Absent = True")
3510              iQualified = DCount("Armband", "tbl_Entry", "classID_FK = " & rsClass!classID & " and Qualified = True")
                  
                  '    numEntries
3520              iEntries = iEntries - iWithdrawn
3530              Call addAttribute(xmlDom, classNode, "numEntries", CStr(iEntries))
                  
                  '    numStarters
3540              iStarters = iEntries - (iWithdrawn + iAbsent)
3550              Call addAttribute(xmlDom, classNode, "numStarters", CStr(iStarters))
                  
                  '    numQualifying
3560              Call addAttribute(xmlDom, classNode, "numQualifying", CStr(iQualified))
                  
                  '    numWithdrawals
3570              Call addAttribute(xmlDom, classNode, "numWithdrawals", CStr(iWithdrawn))
                  
                  ' Move to Next Class in Recordset
3580              rsClass.MoveNext

              
                  ' Results Loop
3590              For resultsIndex = 1 To iResultCount
      'Debug.Print "Index: " & resultsIndex
                      ' Init the Results Node
3600                  Set resultsNode = createNodeAndAdd(xmlDom, "results", classNode)
         
      'Debug.Print resultsNode

                      ' Add the Attributes to the Results Node
                      '    akcDogRegnum
3610                  Call addAttribute(xmlDom, resultsNode, "akcDogRegnum", Nz(rsResult!AKCRegistrationNumber, ""))
                      
                      '    gender
3620                  strGender = Nz(rsResult!Gender, "B")
3630                  If strGender = "Male" Then
3640                    strGender = "D"
3650                  ElseIf strGender = "Female" Or strGender = "" Then
3660                    strGender = "B"
3670                  End If
3680                  Call addAttribute(xmlDom, resultsNode, "gender", strGender)
                      
                      '    dogName
3690                  Call addAttribute(xmlDom, resultsNode, "dogName", Nz(rsResult!RegisteredName, ""))
                      
                      '    breedCode
3700                  Call addAttribute(xmlDom, resultsNode, "breedCode", "ALLB")
                      
                      '    dogWelpDate
                      'Call addAttribute(xmlDom, resultsNode, "dogWhelpDate", "YYYY-MM-DD")
                      
                      '    catalogNumber
3710                  Call addAttribute(xmlDom, resultsNode, "catalogNumber", Nz(rsResult!Armband, ""))

                      
                      '    courseTime
                      'Debug.Print Nz(rsResult!Millisecs1, 0)
                      'Debug.Print Nz(rsResult!Millisecs2, 0)
                      'Debug.Print Nz(rsResult!Millisecs3, 0)
                      
3720                  iSearchTime = Nz(rsResult!Millisecs1, 0) + Nz(rsResult!Millisecs2, 0) + Nz(rsResult!Millisecs3, 0)
3730                    iSearchTime = iSearchTime / 1000
3740                  Call addAttribute(xmlDom, resultsNode, "courseTime", CStr(iSearchTime))
                      
                      '    indAmateurHandler
                      'Call addAttribute(xmlDom, resultsNode, "indAmateurHandler", "Y/N")
                      
                      '    indSecondEntry
                      'Call addAttribute(xmlDom, resultsNode, "indSecondEntry", "Y/N")
                       
                      '    actionCode
3750                  strActionCode = Nz(rsResult!Placement, "ABSN")

      'Debug.Print strActionCode

3760                  If IsNumeric(strActionCode) = True Then
3770                      If CInt(strActionCode) >= 1 And CInt(strActionCode) <= 4 Then
3780                          strActionCode = "PLAC"
3790                      ElseIf CInt(strActionCode) >= 5 Then
3800                            strActionCode = "CNT"
3810                        ElseIf CInt(strActionCode) = 0 Then
3820                          strActionCode = "ABSN"
3830                      End If
3840                  Else
3850                      If strActionCode = "Absent" Or strActionCode = "" Then
3860                          strActionCode = "ABSN"
3870                      ElseIf strActionCode = "NQ" Then
3880                          strActionCode = "CNT"
3890                      ElseIf strActionCode = "Disqualified" Then
3900                          strActionCode = "DISQ"
3910                      ElseIf strActionCode = "Excused" Then
3920                          strActionCode = "EXCU"
3930                      ElseIf strActionCode = "Withdrawn" Then
3940                          strActionCode = "WHLD"
3950                      End If
3960                  End If

                      
3970                  Call addAttribute(xmlDom, resultsNode, "actionCode", strActionCode)
                     
                     
                      ' Add the Data for the Result Code
3980                  strPlacement = Nz(rsResult!Placement, "A")
3990                    iPlacement = Val(strPlacement)
                        
4000                  If strPlacement = "Absent" Or strPlacement = "" Or strPlacement = "0" Then
4010                        strPlacement = "A"
4020                  ElseIf strPlacement = "Excused" Or strPlacement = "Withdrawn" Then
4030                        strPlacement = "EXO"
4040                  End If
                      
4050                  If iPlacement > 4 Then
4060                    strPlacement = "Q"
4070                  End If
                      
4080                  Call addNodeWithValue(xmlDom, "resultCode", resultsNode, strPlacement)
                      
                      ' Owner Loop Up to theMaximumOwners Owners
4090                  ownerCount = 1  ' Always send only 1 Owner
4100                  For ownerIndex = 1 To minOf2Integers(ownerCount, theMaximumOwners)
                          ' Query for  Owner of Dog - Name and Address
                          
                          ' Add the Data for the Owner name
4110                      Call addNodeWithValue(xmlDom, "ownerName", resultsNode, Nz(rsResult!Owner, ""))
                      
                          ' Add the Owner Address
4120                      If rsResult!StateAbbr = "ON" Or rsResult!StateAbbr = "AB" Or rsResult!StateAbbr = "QC" Or rsResult!StateAbbr = "NS" Or rsResult!StateAbbr = "NB" Or rsResult!StateAbbr = "MB" Or rsResult!StateAbbr = "BC" Or rsResult!StateAbbr = "PE" Or rsResult!StateAbbr = "SK" Or rsResult!StateAbbr = "NL" Then
4130                        isUstrAddress = False
4140                      Else
4150                        isUstrAddress = True
4160                      End If
4170                      Call addOwnerAddress(xmlDom, resultsNode, Nz(rsResult!Address, ""), "", "", Nz(rsResult!City, ""), Nz(rsResult!StateAbbr, ""), Replace(Nz(rsResult!ZipCode, ""), "-", ""), isUstrAddress)
                      
                     
                          ' Add the Data for jrShowInfo - If any
4180                      If IsNull(rsResult!AKC_JRNumber) Or rsResult!AKC_JRNumber = "" Then
                              'Skip Junior Fields
4190                      Else
                              ' Init the JR Show Info Node
4200                          Set jrShowInfoNode = createNodeAndAdd(xmlDom, "jrShowInfo", resultsNode)
                      
                              ' Add the Attributes to the JR Show Info Node
                              '    id
4210                          Call addAttribute(xmlDom, jrShowInfoNode, "id", rsResult!AKC_JRNumber)
                              
                              '    birthdate
4220                          Call addAttribute(xmlDom, jrShowInfoNode, "birthdate", Format(rsResult!JRDOB, "yyyy-mm-dd"))
                              
                              '    name
4230                          Call addAttribute(xmlDom, jrShowInfoNode, "name", rsResult!Handler)
                                 
                              ' Force Ending Tag
4240                          jrShowInfoNode.text = " "
4250                      End If
                          
                          'Move to next Result
4260                      rsResult.MoveNext
                      
4270                  Next ownerIndex
             
4280              Next resultsIndex

4290            End If
             
4300          Next classIndex
              
4310      Next eventIndex

          ' Return the DOM (XML Document)
4320      Set buildXML = xmlDom

          
          
fError_Exit:
4330       On Error Resume Next
4340       Exit Function
fError:

4350      Select Case Err.Number

               Case 2501
                        'Do Nothing
4360           Case Else
4370               MsgBox "Error: " & Err.Number & vbCrLf & Err.Description & vbCrLf & "Line: " & Erl, vbCritical, "Warning", Err.HelpFile, Err.HelpContext

4380       End Select
4390       Resume fError_Exit
4400       Resume

End Function

Public Sub xmlMain()
          Dim xmlDom As MSXML2.DOMDocument60
          Dim strClubname As String
          Dim strAnswer As String
          Dim arrSplit
          Dim strCalledBy As String
          
4410      Set xmlDom = buildXML()
          
4420      strClubname = TempVars!tmpClubName

4430    FormatXmlDocument xmlDom
          
4440      xmlDom.Save (CurrentProject.path & "\Reports\" & strClubname & "-Results_" & Format(Now, "yyyymmddhhnnss") & ".xml")
          
4450      arrSplit = Split(CurrentProject.path & "\Reports\" & strClubname & "-Results_" & Format(Now, "yyyymmddhhnnss") & ".xml", "\Reports\")
4460      TempVars.Add "tmpXMLResults", arrSplit(1)
          
4470      strAnswer = MsgBox("Results have been exported to the file below." & vbCr & vbCr & CurrentProject.path & "\Reports\" & TempVars!tmpClubName & "-Results_" & Format(Now, "yyyymmddhhnnss") & ".xml" & vbCr & vbCr & "Would you like to Email this file to AKC?", vbQuestion + vbYesNo, "Results Export")
          
4480      If strAnswer = 6 Then
4490          strCalledBy = "XMLResults"
4500          TempVars.Add "tmpEmailTemplate", "XML"
4510          Call CheckEmailTemplate
4520          Call PopulateEmailTemporary(strCalledBy)
4530          DoCmd.OpenForm "frm_Show_Email_Results_XML"
4540      End If
End Sub

