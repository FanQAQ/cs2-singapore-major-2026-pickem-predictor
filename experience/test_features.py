import unittest

from experience.features import snapshot


class PointInTimeExperience(unittest.TestCase):
    def test_rosters_and_cutoff(self):
        lineup = ["Ace", "Rookie", "Third", "Fourth", "Fifth"]
        history = dict(aliases={"old-nick": "ace"}, teamAliases={"New Org": {"Rookie": "rookie@second"}},
                       unresolved=["rookie"], events=[
            dict(id="first", endDate="2013-12-01", attendanceComplete=True,
                 players=["old-nick","rookie@first","third","fourth","fifth"],
                 champions=["ace","third","fourth","fifth","rookie@first"]),
            dict(id="current", endDate="2026-11-21", attendanceComplete=True,
                 players=lineup, champions=lineup)])
        snap = snapshot(history, [dict(name="New Org",roster=lineup),dict(name="Other",roster=lineup)], "2026-11-21")
        self.assertTrue(snap["full"])
        new = snap["teams"]["New Org"]
        self.assertEqual([p["appearances"] for p in new["players"]], [1,0,1,1,1])
        self.assertEqual((new["champions"],new["zero"],new["few"]), (4,1,4))
        self.assertIsNone(snap["teams"]["Other"]["players"][1]["appearances"])
        self.assertIsNone(snap["teams"]["Other"]["vector"])

    def test_gap_cannot_certify_career_debut(self):
        e=dict(id="incomplete",endDate="2013-12-01",attendanceComplete=False,players=["p"],champions=[])
        team=dict(name="team",roster=list("pqrst"))
        snap=snapshot(dict(events=[e]),[team],"2025-01-01")
        self.assertFalse(snap["full"])
        self.assertIsNone(snap["teams"]["team"]["vector"])

if __name__ == "__main__":
    unittest.main()
