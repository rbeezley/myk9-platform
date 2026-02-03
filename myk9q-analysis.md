Analyzing codebase in: apps/myk9q/src
Traceback (most recent call last):
  File "C:\Users\Richard\.claude\skills\tech-debt-analyzer\scripts\detect_code_smells.py", line 402, in <module>
    main()
    ~~~~^^
  File "C:\Users\Richard\.claude\skills\tech-debt-analyzer\scripts\detect_code_smells.py", line 398, in main
    print(report)
    ~~~~~^^^^^^^^
  File "C:\Program Files\WindowsApps\PythonSoftwareFoundation.Python.3.13_3.13.2544.0_x64__qbz5n2kfra8p0\Lib\encodings\cp1252.py", line 19, in encode
    return codecs.charmap_encode(input,self.errors,encoding_table)[0]
           ~~~~~~~~~~~~~~~~~~~~~^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
UnicodeEncodeError: 'charmap' codec can't encode character '\U0001f4f1' in position 4594: character maps to <undefined>
