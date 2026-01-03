# myK9Q Three-Tier Architecture (Mermaid Diagrams)

**Purpose:** Visual documentation of the data flow through the application's three-tier architecture using interactive Mermaid diagrams.

**Generated:** 2025-10-25

---

## 🏛️ Architectural Overview

```mermaid
graph TB
    subgraph UI["🖥️ USER INTERFACE LAYER"]
        Components["React Components<br/>ClassDetail.tsx<br/>DogCard.tsx<br/>Scoresheets"]
        Pages["Pages<br/>Dashboard<br/>ClassView<br/>Settings"]
    end

    subgraph Store["🗂️ STORE LAYER (Zustand)"]
        EntryStore["entryStore.ts<br/>• Entry data<br/>• Filters<br/>• Pagination"]
        ScoringStore["scoringStore.ts<br/>• Active sessions<br/>• Timer state<br/>• LocalStorage"]
        OtherStores["Other Stores<br/>• offlineQueueStore<br/>• nationalsStore<br/>• timerStore<br/>• announcementStore"]
    end

    subgraph Service["🛠️ SERVICE LAYER"]
        EntryService["entryService.ts<br/>• Entry CRUD<br/>• Score submission<br/>• Real-time subs"]
        PlacementService["placementService.ts<br/>• Placement calc<br/>• Tie-breaking"]
        OtherServices["Other Services<br/>• authService<br/>• syncManager<br/>• nationalsScoring"]
    end

    subgraph DB["🗄️ DATABASE (Supabase)"]
        Shows[("shows<br/>(license_key)")]
        Trials[("trials")]
        Classes[("classes")]
        Entries[("entries")]
        Results[("results")]
    end

    Components -->|hooks| EntryStore
    Pages -->|hooks| ScoringStore
    Components -->|hooks| OtherStores

    EntryStore -->|calls| EntryService
    ScoringStore -->|calls| PlacementService
    OtherStores -->|calls| OtherServices

    EntryService -->|Supabase client| Shows
    PlacementService -->|Supabase client| Entries
    OtherServices -->|Supabase client| Classes

    Shows -->|1:N| Trials
    Trials -->|1:N| Classes
    Classes -->|1:N| Entries
    Entries -->|1:1| Results

    Results -.->|Real-time broadcast| EntryService
    Entries -.->|Real-time broadcast| EntryService

    classDef uiLayer fill:#e1f5ff,stroke:#0288d1,stroke-width:2px
    classDef storeLayer fill:#f3e5f5,stroke:#7b1fa2,stroke-width:2px
    classDef serviceLayer fill:#fff3e0,stroke:#f57c00,stroke-width:2px
    classDef dbLayer fill:#e8f5e9,stroke:#388e3c,stroke-width:2px

    class Components,Pages uiLayer
    class EntryStore,ScoringStore,OtherStores storeLayer
    class EntryService,PlacementService,OtherServices serviceLayer
    class Shows,Trials,Classes,Entries,Results dbLayer
```

---

## 📊 Entry Management Flow

```mermaid
sequenceDiagram
    participant User
    participant Component as ClassDetail.tsx
    participant Store as entryStore
    participant Service as entryService
    participant DB as Supabase DB

    User->>Component: Click on class to view entries
    activate Component

    Component->>Service: getClassEntries(classId, licenseKey)
    activate Service

    Service->>DB: Query entries with joins
    Note over Service,DB: SELECT e.*, c.element, c.level<br/>FROM entries e<br/>JOIN classes c ON e.class_id = c.id<br/>WHERE license_key = 'myK9Q1-...'

    DB-->>Service: Raw data (snake_case)
    Note over DB,Service: {<br/>  id: 6714,<br/>  armband_number: 101,<br/>  dog_call_name: 'Max',<br/>  entry_status: 'none'<br/>}

    Service->>Service: Transform to camelCase
    Note over Service: {<br/>  id: 6714,<br/>  armband: 101,<br/>  callName: 'Max',<br/>  status: 'none'<br/>}

    Service-->>Component: Entry[]
    deactivate Service

    Component->>Store: setEntries(entries)
    activate Store
    Store->>Store: Update state & pagination
    Store-->>Component: State updated
    deactivate Store

    Component->>Component: Re-render with new data
    Component-->>User: Display entry list
    deactivate Component
```

---

## 🎯 Score Submission Flow

```mermaid
sequenceDiagram
    participant Judge as Judge (Device)
    participant Scoresheet as AKCScentWorkScoresheet
    participant Service as entryService
    participant PlacementSvc as placementService
    participant DB as Supabase DB
    participant OtherDevice as Other Devices

    Judge->>Scoresheet: Submit score
    activate Scoresheet

    Note over Judge,Scoresheet: scoreData = {<br/>  resultText: 'Qualified',<br/>  searchTime: '1:32',<br/>  faultCount: 0<br/>}

    Scoresheet->>Service: submitScore(entryId, scoreData)
    activate Service

    Service->>Service: Transform data
    Note over Service: 'Qualified' → 'qualified'<br/>'1:32' → 92 seconds

    Service->>DB: Upsert result
    Note over Service,DB: INSERT INTO results (...)<br/>ON CONFLICT (entry_id)<br/>DO UPDATE

    DB-->>Service: Success

    Service->>PlacementSvc: recalculatePlacementsForClass()
    activate PlacementSvc

    PlacementSvc->>DB: Fetch all qualified results
    DB-->>PlacementSvc: Results data

    PlacementSvc->>PlacementSvc: Sort by faults, then time
    PlacementSvc->>DB: Update placements (1st, 2nd, 3rd...)
    DB-->>PlacementSvc: Updated
    deactivate PlacementSvc

    DB->>DB: Trigger real-time broadcast

    DB-->>Service: Real-time event
    Service-->>Scoresheet: Score saved
    deactivate Service
    deactivate Scoresheet

    DB-.->OtherDevice: Real-time UPDATE event
    Note over OtherDevice: All subscribed clients<br/>receive updated data instantly
```

---

## 🔄 Real-time Subscription Flow

```mermaid
graph LR
    subgraph DeviceA["📱 Device A (Gate Steward)"]
        A_Component["ExhibitorCheckin.tsx"]
        A_Service["entryService"]
    end

    subgraph Database["🗄️ Supabase"]
        EntriesTable[("entries table")]
        RealtimeTrigger["Real-time Trigger"]
    end

    subgraph DeviceB["📱 Device B (Judge Tablet)"]
        B_Sync["syncManager"]
        B_Store["entryStore"]
        B_Component["ClassDetail.tsx"]
    end

    subgraph DeviceC["📺 Device C (TV Display)"]
        C_Sync["syncManager"]
        C_Store["entryStore"]
        C_Component["TVDisplay.tsx"]
    end

    A_Component -->|updateEntryCheckinStatus| A_Service
    A_Service -->|UPDATE entries| EntriesTable
    EntriesTable -->|Trigger fires| RealtimeTrigger

    RealtimeTrigger -.->|Broadcast event| B_Sync
    RealtimeTrigger -.->|Broadcast event| C_Sync

    B_Sync -->|updateEntry| B_Store
    B_Store -->|Re-render| B_Component

    C_Sync -->|updateEntry| C_Store
    C_Store -->|Re-render| C_Component

    style EntriesTable fill:#4caf50,stroke:#2e7d32,stroke-width:3px,color:#fff
    style RealtimeTrigger fill:#ff9800,stroke:#f57c00,stroke-width:2px,color:#000
    style A_Component fill:#e3f2fd,stroke:#1976d2,stroke-width:2px
    style B_Component fill:#e3f2fd,stroke:#1976d2,stroke-width:2px
    style C_Component fill:#e3f2fd,stroke:#1976d2,stroke-width:2px
```

---

## 🗄️ Database Schema Relationships

```mermaid
erDiagram
    SHOWS ||--o{ TRIALS : "has many"
    TRIALS ||--o{ CLASSES : "has many"
    CLASSES ||--o{ ENTRIES : "has many"
    ENTRIES ||--|| RESULTS : "has one"
    ENTRIES ||--o| NATIONALS_RANKINGS : "may have"
    ENTRIES ||--o| NATIONALS_ADVANCEMENT : "may have"
    ENTRIES ||--o{ NATIONALS_SCORES : "may have many"
    ANNOUNCEMENTS ||--o{ ANNOUNCEMENT_READS : "has many"

    SHOWS {
        bigint id PK
        varchar license_key UK "Multi-tenant key"
        text show_name
        text organization "AKC/UKC/ASCA"
        text show_type "Regular/National"
        date start_date
        date end_date
    }

    TRIALS {
        bigint id PK
        bigint show_id FK
        text trial_name
        date trial_date
        int trial_number "CHECK > 0"
        timestamptz actual_start_time
    }

    CLASSES {
        bigint id PK
        bigint trial_id FK
        text element "Interior/Exterior/etc"
        text level "Novice/Advanced/etc"
        text section "A/B/-"
        text class_status "ENUM 7 values"
        int time_limit_seconds
        int area_count "CHECK 1-10"
        bool self_checkin_enabled
    }

    ENTRIES {
        bigint id PK
        bigint class_id FK
        int armband_number "CHECK > 0"
        text dog_call_name
        text handler_name
        text entry_status "ENUM 8 values"
        int exhibitor_order
        bool is_paid
    }

    RESULTS {
        bigint id PK
        bigint entry_id FK "UNIQUE - 1:1"
        text result_status "ENUM 6 values"
        bool is_scored
        numeric search_time_seconds
        int final_placement
        int total_faults
        int total_correct_finds
    }

    NATIONALS_RANKINGS {
        bigint id PK
        int entry_id FK
        varchar armband UK
        int rank
        int total_points
        bool qualified_for_finals
    }

    NATIONALS_ADVANCEMENT {
        bigint id PK
        int entry_id FK "UNIQUE - 1:1"
        varchar armband
        int preliminary_rank
        int finals_rank
        int championship_rank
        bool national_champion
    }

    NATIONALS_SCORES {
        bigint id PK
        bigint entry_id FK
        int day_number "CHECK 1-3"
        text element
        int preliminary_score
        int finals_score
    }

    ANNOUNCEMENTS {
        bigint id PK
        text license_key "Multi-tenant"
        text title
        text content
        text priority "normal/high/urgent"
        timestamptz expires_at
    }

    ANNOUNCEMENT_READS {
        bigint id PK
        bigint announcement_id FK
        text user_identifier
        timestamptz read_at
    }
```

---

## 🔄 Data Transformation Pipeline

```mermaid
flowchart LR
    subgraph Read["📖 READ FLOW (DB → UI)"]
        direction TB
        DB_Read[("Database Query<br/>(snake_case)")]
        Service_Read["Service Transform<br/>(camelCase)"]
        Store_Read["Store State<br/>(Entry interface)"]
        UI_Read["UI Render<br/>(React)"]

        DB_Read -->|"armband_number: 101<br/>dog_call_name: 'Max'"| Service_Read
        Service_Read -->|"armband: 101<br/>callName: 'Max'"| Store_Read
        Store_Read -->|Entry object| UI_Read
    end

    subgraph Write["✍️ WRITE FLOW (UI → DB)"]
        direction TB
        UI_Write["Component Submit<br/>(user-friendly)"]
        Service_Write["Service Transform<br/>(DB format)"]
        DB_Write[("Database Insert<br/>(snake_case)")]
        Broadcast["Real-time Broadcast"]

        UI_Write -->|"resultText: 'Qualified'<br/>searchTime: '1:32'"| Service_Write
        Service_Write -->|"result_status: 'qualified'<br/>search_time_seconds: 92"| DB_Write
        DB_Write -->|Trigger fires| Broadcast
    end

    Broadcast -.->|Real-time event| DB_Read

    style DB_Read fill:#4caf50,stroke:#2e7d32,stroke-width:2px,color:#fff
    style DB_Write fill:#4caf50,stroke:#2e7d32,stroke-width:2px,color:#fff
    style Service_Read fill:#ff9800,stroke:#f57c00,stroke-width:2px
    style Service_Write fill:#ff9800,stroke:#f57c00,stroke-width:2px
    style Broadcast fill:#f44336,stroke:#c62828,stroke-width:2px,color:#fff
```

---

## 🏪 Store Architecture

```mermaid
graph TB
    subgraph Stores["Zustand Stores"]
        direction LR

        Entry["entryStore<br/>━━━━━━━━<br/>• entries: Entry[]<br/>• filters<br/>• pagination<br/>• isLoading<br/><br/>Actions:<br/>• setEntries()<br/>• updateEntry()<br/>• setFilter()"]

        Scoring["scoringStore<br/>━━━━━━━━<br/>• currentSession<br/>• isScoring<br/>• lastScoredEntry<br/><br/>Actions:<br/>• submitScore()<br/>• undoLastScore()<br/><br/>💾 LocalStorage"]

        Offline["offlineQueueStore<br/>━━━━━━━━<br/>• queue: QueuedScore[]<br/>• syncStatus<br/><br/>Actions:<br/>• enqueue()<br/>• processQueue()<br/><br/>💾 LocalStorage"]

        Nationals["nationalsStore<br/>━━━━━━━━<br/>• rankings<br/>• advancement<br/>• dailyScores<br/><br/>Actions:<br/>• updateRankings()<br/>• advanceToFinals()"]

        Timer["timerStore<br/>━━━━━━━━<br/>• timers: Timer[]<br/>• activeTimerId<br/><br/>Actions:<br/>• startTimer()<br/>• pauseTimer()<br/>• resetTimer()"]

        Announce["announcementStore<br/>━━━━━━━━<br/>• announcements<br/>• unreadCount<br/><br/>Actions:<br/>• markAsRead()<br/>• create()"]
    end

    Entry -.->|persist| LS1[("Session")]
    Scoring -.->|persist| LS2[("LocalStorage")]
    Offline -.->|persist| LS3[("LocalStorage")]
    Nationals -.->|persist| LS4[("Session")]
    Timer -.->|persist| LS5[("Session")]
    Announce -.->|persist| LS6[("Session")]

    style Entry fill:#e3f2fd,stroke:#1976d2,stroke-width:2px
    style Scoring fill:#f3e5f5,stroke:#7b1fa2,stroke-width:2px
    style Offline fill:#fff3e0,stroke:#f57c00,stroke-width:2px
    style Nationals fill:#e8f5e9,stroke:#388e3c,stroke-width:2px
    style Timer fill:#fce4ec,stroke:#c2185b,stroke-width:2px
    style Announce fill:#e0f2f1,stroke:#00796b,stroke-width:2px
```

---

## 🛠️ Service Architecture

```mermaid
graph LR
    subgraph Services["Service Layer"]
        direction TB

        Entry["entryService.ts<br/>━━━━━━━━━━━<br/>• getClassEntries()<br/>• submitScore()<br/>• markInRing()<br/>• subscribeToUpdates()<br/>• updateCheckinStatus()"]

        Placement["placementService.ts<br/>━━━━━━━━━━━<br/>• recalculatePlacementsForClass()<br/>• sortByFaultsAndTime()<br/>• handleTieBreaking()"]

        Auth["authService.ts<br/>━━━━━━━━━━━<br/>• generatePasscodes()<br/>• validatePasscode()<br/>• deriveRole()"]

        Sync["syncManager.ts<br/>━━━━━━━━━━━<br/>• subscribeToUpdates()<br/>• unsubscribe()<br/>• handleReconnect()"]

        NationalScore["nationalsScoring.ts<br/>━━━━━━━━━━━<br/>• calculateDailyPoints()<br/>• determineFinalRank()<br/>• checkChampionship()"]

        Announcement["announcementService.ts<br/>━━━━━━━━━━━<br/>• createAnnouncement()<br/>• getActiveAnnouncements()<br/>• markAsRead()"]
    end

    subgraph DB["Supabase"]
        Tables[("PostgreSQL<br/>Tables")]
        Realtime["Real-time<br/>Subscriptions"]
    end

    Entry -->|CRUD| Tables
    Placement -->|UPDATE| Tables
    Auth -->|Query| Tables
    Sync -->|Subscribe| Realtime
    NationalScore -->|Query + UPDATE| Tables
    Announcement -->|CRUD| Tables

    Realtime -.->|Events| Sync

    style Entry fill:#42a5f5,stroke:#1976d2,stroke-width:2px,color:#fff
    style Placement fill:#66bb6a,stroke:#388e3c,stroke-width:2px,color:#fff
    style Auth fill:#ffa726,stroke:#f57c00,stroke-width:2px,color:#fff
    style Sync fill:#ab47bc,stroke:#7b1fa2,stroke-width:2px,color:#fff
    style NationalScore fill:#26c6da,stroke:#0097a7,stroke-width:2px,color:#fff
    style Announcement fill:#ec407a,stroke:#c2185b,stroke-width:2px,color:#fff
```

---

## 📱 Multi-Device Sync Example

```mermaid
sequenceDiagram
    participant GateSteward as 📱 Gate Steward
    participant Judge as 📱 Judge Tablet
    participant TV as 📺 TV Display
    participant DB as 🗄️ Supabase

    Note over GateSteward,TV: All devices subscribed to entries real-time updates

    GateSteward->>DB: UPDATE entries<br/>SET entry_status = 'checked-in'<br/>WHERE id = 6714

    activate DB
    DB->>DB: Trigger fires
    Note over DB: Real-time broadcast initiated

    DB-->>GateSteward: ✅ Update confirmed

    par Broadcast to all subscribers
        DB-.->Judge: 📡 Real-time event<br/>{<br/>  eventType: 'UPDATE',<br/>  new: { entry_status: 'checked-in' }<br/>}
        DB-.->TV: 📡 Real-time event<br/>{<br/>  eventType: 'UPDATE',<br/>  new: { entry_status: 'checked-in' }<br/>}
    end
    deactivate DB

    Judge->>Judge: syncManager receives event
    Judge->>Judge: entryStore.updateEntry()
    Judge->>Judge: DogCard re-renders
    Note over Judge: Badge shows "Checked In"

    TV->>TV: syncManager receives event
    TV->>TV: entryStore.updateEntry()
    TV->>TV: TVDisplay re-renders
    Note over TV: Entry status updates instantly

    Note over GateSteward,TV: All devices now in sync within ~100ms
```

---

## 🚨 Architectural Rules Visualization

```mermaid
flowchart TB
    subgraph Correct["✅ CORRECT PATTERNS"]
        direction LR
        C1["Component"] -->|"useEntryStore()"| C2["Store"]
        C2 -->|"entryService.get()"| C3["Service"]
        C3 -->|"supabase.from()"| C4[("Database")]
        C4 -.->|"Real-time"| C3
    end

    subgraph Wrong["❌ WRONG PATTERNS"]
        direction LR
        W1["Component"] -->|"❌ Direct call"| W2[("Database")]
        W3["Component"] -->|"❌ Transform data"| W4["Component State"]
        W5["Store"] -->|"❌ Direct DB"| W6[("Database")]
    end

    style Correct fill:#e8f5e9,stroke:#388e3c,stroke-width:3px
    style Wrong fill:#ffebee,stroke:#c62828,stroke-width:3px
    style C1 fill:#bbdefb,stroke:#1976d2
    style C2 fill:#e1bee7,stroke:#7b1fa2
    style C3 fill:#ffe0b2,stroke:#f57c00
    style C4 fill:#c8e6c9,stroke:#388e3c
    style W1 fill:#ef9a9a,stroke:#c62828
    style W2 fill:#ef9a9a,stroke:#c62828
    style W3 fill:#ef9a9a,stroke:#c62828
    style W4 fill:#ef9a9a,stroke:#c62828
    style W5 fill:#ef9a9a,stroke:#c62828
    style W6 fill:#ef9a9a,stroke:#c62828
```

---

## 📚 How to View These Diagrams

### On GitHub
✅ Mermaid diagrams render automatically in GitHub markdown files!

### In VS Code
1. Install extension: **Markdown Preview Mermaid Support**
2. Open this file and press `Ctrl+Shift+V` (Markdown Preview)

### In IDE (other)
- **IntelliJ/WebStorm**: Built-in Mermaid support
- **Obsidian**: Native rendering
- **Notion**: Copy-paste diagram code

### Online Editor
Visit [Mermaid Live Editor](https://mermaid.live/) to edit and export diagrams.

---

## 🎨 Diagram Types Used

| Diagram Type | Use Case | Syntax |
|--------------|----------|--------|
| **Flowchart** | Architecture overview, data flow | `graph TB` |
| **Sequence** | Time-based interactions, API calls | `sequenceDiagram` |
| **Entity-Relationship** | Database schema | `erDiagram` |

---

## 📝 Editing Tips

**To modify diagrams:**
1. Find the diagram you want to edit
2. Update the text within the ` ```mermaid` code block
3. Preview changes (GitHub renders automatically)
4. Commit the updated markdown file

**Common edits:**
- Add new store: Edit "Store Architecture" diagram
- Add new service: Edit "Service Architecture" diagram
- Add new table: Edit "Database Schema Relationships" diagram

---

## 🔗 Related Documentation

- [DATABASE_REFERENCE.md](./DATABASE_REFERENCE.md) - Views, functions, query patterns
- [TYPE_MAPPING.md](./TYPE_MAPPING.md) - TypeScript ↔ PostgreSQL mappings
- [ARCHITECTURE_DIAGRAM.md](./ARCHITECTURE_DIAGRAM.md) - ASCII version (fallback)
- [README.md](./README.md) - Documentation index

---

**Last Updated:** 2025-10-25
**Format:** Mermaid diagrams (interactive, version-control friendly)
**Compatibility:** GitHub, GitLab, VS Code, IntelliJ, Obsidian, Notion
