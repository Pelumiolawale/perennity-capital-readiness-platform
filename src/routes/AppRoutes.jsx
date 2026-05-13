import { Routes, Route } from "react-router-dom";
import { LegacyAppShell } from "../App.jsx";
import { SnapshotRoute } from "./SnapshotRoute";
import { ReportRoute } from "./ReportRoute";
import { NotFound } from "./NotFound";

// Path B sequencing:
//   /                       → LegacyAppShell (the existing prototype, untouched)
//   /assessment/snapshot    → IntakeWizard → SnapshotResults (engine-driven)
//   /assessment/report      → Day 5 placeholder
//   *                       → 404
//
// LegacyAppShell continues to render until Day 4+ when src/export/ and the
// inline scoring/regulations modules are deleted.
export default function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<LegacyAppShell />} />
      <Route path="/assessment/snapshot" element={<SnapshotRoute />} />
      <Route path="/assessment/report" element={<ReportRoute />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
