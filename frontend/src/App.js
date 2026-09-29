import "@/App.css";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Toaster } from "sonner";
import Shell from "@/components/Shell";
import Dashboard from "@/pages/Dashboard";
import Expeditions from "@/pages/Expeditions";
import Cargo from "@/pages/Cargo";
import Inventory from "@/pages/Inventory";
import Personnel from "@/pages/Personnel";
import Weather from "@/pages/Weather";
import Emergency from "@/pages/Emergency";
import Alerts from "@/pages/Alerts";
import AIAssistant from "@/pages/AIAssistant";
import LiveOperations from "@/pages/LiveOperations";
import Communications from "@/pages/Communications";
import ExpeditionIntelligence from "@/pages/ExpeditionIntelligence";
import FieldIntelligence from "@/pages/FieldIntelligence";
import EquipmentMaintenance from "@/pages/EquipmentMaintenance";
import CommandIntelligenceLab from "@/pages/CommandIntelligenceLab";
import PredictiveOperations from "@/pages/PredictiveOperations";
import AdaptiveMissionView from "@/pages/AdaptiveMissionView";
import AutonomousMissionPlanner from "@/pages/AutonomousMissionPlanner";
import MissionSuccessMonitor from "@/pages/MissionSuccessMonitor";
import MissionGovernance from "@/pages/MissionGovernance";
import ResearchTrustCenter from "@/pages/ResearchTrustCenter";
import MissionAnalyticsConsole from "@/pages/MissionAnalyticsConsole";
import Feedback from "@/pages/Feedback";
import LearningLoop from "@/pages/LearningLoop";
import Auth from "@/pages/Auth";

function App() {
  return (
    <div className="App">
      <BrowserRouter>
        <Toaster theme="dark" position="top-right" richColors />
        <Routes>
          <Route path="/login" element={<Auth mode="login" />} />
          <Route path="/signup" element={<Auth mode="signup" />} />
          <Route path="/" element={<Shell />}>
            <Route index element={<Dashboard />} />
            <Route path="live" element={<LiveOperations />} />
            <Route path="comms" element={<Communications />} />
            <Route path="intelligence" element={<ExpeditionIntelligence />} />
            <Route path="field-intelligence" element={<FieldIntelligence />} />
            <Route path="expeditions" element={<Expeditions />} />
            <Route path="cargo" element={<Cargo />} />
            <Route path="inventory" element={<Inventory />} />
            <Route path="equipment-maintenance" element={<EquipmentMaintenance />} />
            <Route path="command-intelligence" element={<CommandIntelligenceLab />} />
            <Route path="predictive-operations" element={<PredictiveOperations />} />
            <Route path="adaptive-mission" element={<AdaptiveMissionView />} />
            <Route path="mission-planner" element={<AutonomousMissionPlanner />} />
            <Route path="mission-success" element={<MissionSuccessMonitor />} />
            <Route path="mission-governance" element={<MissionGovernance />} />
            <Route path="research-trust" element={<ResearchTrustCenter />} />
            <Route path="mission-analytics" element={<MissionAnalyticsConsole />} />
            <Route path="feedback" element={<Feedback />} />
            <Route path="learning-loop" element={<LearningLoop />} />
            <Route path="personnel" element={<Personnel />} />
            <Route path="weather" element={<Weather />} />
            <Route path="emergency" element={<Emergency />} />
            <Route path="alerts" element={<Alerts />} />
            <Route path="ai" element={<AIAssistant />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </div>
  );
}

export default App;
