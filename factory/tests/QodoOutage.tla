---------------------------- MODULE QodoOutage ----------------------------
EXTENDS Naturals
VARIABLES state, reviewed
vars == <<state, reviewed>>
Init == /\ state = "checking" /\ reviewed = FALSE
Outage == /\ state = "checking" /\ state' = "waiting" /\ UNCHANGED reviewed
Resume == /\ state = "waiting" /\ state' = "checking" /\ UNCHANGED reviewed
Review == /\ state = "checking" /\ state' = "checking" /\ reviewed' = TRUE
Merge == /\ state = "checking" /\ reviewed /\ state' = "merged" /\ UNCHANGED reviewed
Next == Outage \/ Resume \/ Review \/ Merge
Spec == Init /\ [][Next]_vars
Safe == state = "merged" => reviewed
=============================================================================
