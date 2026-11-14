# DAG Action Graph

```mermaid
flowchart TD
    N0["navigate [/]<br/>step 1"]
    N1["click [/]<br/>step 2"]
    N2["click on @150,200 [/]<br/>step 3"]
    N0 --> N1
    N1 --> N2
```

## Node Legend

| ID | Signature | First Seen |
|-----|-----------|------------|
| N0 | `http://localhost:4173/\|navigate\|\|none` | step 1 |
| N1 | `http://localhost:4173/\|click\|\|none` | step 2 |
| N2 | `http://localhost:4173/\|click\|\|@150,200` | step 3 |
