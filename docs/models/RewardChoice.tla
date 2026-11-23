------------------------- MODULE RewardChoice -------------------------
EXTENDS Naturals
VARIABLES selected, taken
vars == <<selected, taken>>
Init == /\ selected = "none" /\ taken = "none"
Select(r) == /\ taken = "none" /\ selected' = r /\ UNCHANGED taken
Confirm == /\ taken = "none" /\ selected # "none" /\ taken' = selected /\ UNCHANGED selected
Next == (\E r \in {"gold", "routine"}: Select(r)) \/ Confirm
Spec == Init /\ [][Next]_vars
TypeOK == /\ selected \in {"none", "gold", "routine"} /\ taken \in {"none", "gold", "routine"}
CorrectReward == taken = "none" \/ taken = selected
=============================================================================
