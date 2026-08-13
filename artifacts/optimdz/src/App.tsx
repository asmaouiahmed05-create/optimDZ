import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import { LanguageProvider } from "@/lib/LanguageContext";
import { ProblemProvider } from "@/lib/ProblemContext";
import { ScenarioProvider } from "@/lib/ScenarioContext";
import { TransportProvider } from "@/lib/TransportContext";
import { TransportHistoryProvider } from "@/lib/TransportHistoryContext";
import { AssignmentHistoryProvider } from "@/lib/AssignmentHistoryContext";
import { Layout } from "@/components/Layout";
import { TransportLayout } from "@/components/TransportLayout";
import { AssignmentLayout } from "@/components/AssignmentLayout";

import PlatformHome from "@/pages/PlatformHome";
import Activity from "@/pages/Activity";
import Home from "@/pages/Home";
import History from "@/pages/History";
import Solve from "@/pages/Solve";
import Results from "@/pages/Results";
import ScenarioCompare from "@/pages/ScenarioCompare";

import Transport from "@/pages/transportation/Transport";

import Assignment from "@/pages/assignment/Assignment";

import PertCpm from "@/pages/pert-cpm/PertCpm";
import { PertLayout } from "@/components/PertLayout";
import ProjectFeasibilityHome from "@/pages/project-feasibility/ProjectFeasibilityHome";
import ProjectFeasibility from "@/pages/project-feasibility/ProjectFeasibility";
import InvestmentAppraisal from "@/pages/project-feasibility/InvestmentAppraisal";
import SensitivityAnalysis from "@/pages/project-feasibility/SensitivityAnalysis";
import InvestmentComparison from "@/pages/project-feasibility/InvestmentComparison";
import { ProjectFeasibilityLayout } from "@/components/ProjectFeasibilityLayout";
import KpiDashboardHome   from "@/pages/kpi-dashboard/KpiDashboardHome";
import ManualKpiTracking  from "@/pages/kpi-dashboard/ManualKpiTracking";
import { KpiDashboardLayout } from "@/components/KpiDashboardLayout";
import DecisionAssistantHome from "@/pages/decision-assistant/DecisionAssistantHome";
import SmartRouter from "@/pages/decision-assistant/SmartRouter";
import BusinessAdvisor from "@/pages/decision-assistant/BusinessAdvisor";
import { DecisionAssistantLayout } from "@/components/DecisionAssistantLayout";
import VarianceAnalysis from "@/pages/variance-analysis/VarianceAnalysis";
import OverallVariance  from "@/pages/variance-analysis/OverallVariance";
import { VarianceLayout } from "@/components/VarianceLayout";
import SupplyChainHome         from "@/pages/supply-chain/SupplyChainHome";
import InventoryManagement     from "@/pages/supply-chain/InventoryManagement";
import DemandForecasting       from "@/pages/supply-chain/DemandForecasting";
import SupplierSelection       from "@/pages/supply-chain/SupplierSelection";
import TransportDistribution   from "@/pages/supply-chain/TransportDistribution";
import SupplyChainKpi          from "@/pages/supply-chain/SupplyChainKpi";
import { SupplyChainLayout }   from "@/components/SupplyChainLayout";
import IndustrialManagementHome  from "@/pages/industrial-management/IndustrialManagementHome";
import ProductionPlanning        from "@/pages/industrial-management/ProductionPlanning";
import WorkshopScheduling        from "@/pages/industrial-management/WorkshopScheduling";
import CapacityPlanning          from "@/pages/industrial-management/CapacityPlanning";
import QualityControl            from "@/pages/industrial-management/QualityControl";
import EquipmentMaintenance      from "@/pages/industrial-management/EquipmentMaintenance";
import Mst                          from "@/pages/industrial-management/Mst";
import { IndustrialManagementLayout } from "@/components/IndustrialManagementLayout";

const queryClient = new QueryClient();

function Router() {
  const [location] = useLocation();

  return (
    <Switch>
      {/* Platform landing — has its own nav, no Layout wrapper */}
      <Route path="/" component={PlatformHome} />
      <Route path="/activity" component={Activity} />

      {/* All module routes share a catch-all route; layout is chosen by path prefix */}
      <Route>
        {location.startsWith("/transport") ? (
          <TransportHistoryProvider>
            <TransportProvider>
              <TransportLayout>
                <Switch>
                  <Route path="/transport" component={Transport} />
                  <Route component={NotFound} />
                </Switch>
              </TransportLayout>
            </TransportProvider>
          </TransportHistoryProvider>
        ) : location.startsWith("/assignment") ? (
          <AssignmentHistoryProvider>
            <AssignmentLayout>
              <Switch>
                <Route path="/assignment" component={Assignment} />
                <Route component={NotFound} />
              </Switch>
            </AssignmentLayout>
          </AssignmentHistoryProvider>
        ) : location.startsWith("/pert-cpm") ? (
          <PertLayout>
            <Switch>
              <Route path="/pert-cpm" component={PertCpm} />
              <Route component={NotFound} />
            </Switch>
          </PertLayout>
        ) : location.startsWith("/project-feasibility") ? (
          <ProjectFeasibilityLayout>
            <Switch>
              <Route path="/project-feasibility"                        component={ProjectFeasibilityHome} />
              <Route path="/project-feasibility/breakeven"             component={ProjectFeasibility} />
              <Route path="/project-feasibility/investment-appraisal"  component={InvestmentAppraisal} />
              <Route path="/project-feasibility/sensitivity-analysis" component={SensitivityAnalysis} />
              <Route path="/project-feasibility/comparison"          component={InvestmentComparison} />
              <Route component={NotFound} />
            </Switch>
          </ProjectFeasibilityLayout>
        ) : location.startsWith("/kpi-dashboard") ? (
          <KpiDashboardLayout>
            <Switch>
              <Route path="/kpi-dashboard"          component={KpiDashboardHome} />
              <Route path="/kpi-dashboard/tracking" component={ManualKpiTracking} />
              <Route component={NotFound} />
            </Switch>
          </KpiDashboardLayout>
        ) : location.startsWith("/decision-assistant") ? (
          <DecisionAssistantLayout>
            <Switch>
              <Route path="/decision-assistant"          component={DecisionAssistantHome} />
              <Route path="/decision-assistant/router"  component={SmartRouter} />
              <Route path="/decision-assistant/advisor" component={BusinessAdvisor} />
              <Route component={NotFound} />
            </Switch>
          </DecisionAssistantLayout>
        ) : location.startsWith("/variance-analysis") ? (
          <VarianceLayout>
            <Switch>
              <Route path="/variance-analysis"         component={VarianceAnalysis} />
              <Route path="/variance-analysis/overall" component={OverallVariance}  />
              <Route component={NotFound} />
            </Switch>
          </VarianceLayout>
        ) : location.startsWith("/supply-chain") ? (
          <TransportHistoryProvider>
            <SupplyChainLayout>
              <Switch>
                <Route path="/supply-chain"            component={SupplyChainHome} />
                <Route path="/supply-chain/inventory"  component={InventoryManagement} />
                <Route path="/supply-chain/forecast"   component={DemandForecasting} />
                <Route path="/supply-chain/suppliers"  component={SupplierSelection} />
                <Route path="/supply-chain/transport"  component={TransportDistribution} />
                <Route path="/supply-chain/kpi"        component={SupplyChainKpi} />
                <Route component={NotFound} />
              </Switch>
            </SupplyChainLayout>
          </TransportHistoryProvider>
        ) : location.startsWith("/industrial-management") ? (
          <IndustrialManagementLayout>
            <Switch>
              <Route path="/industrial-management"                          component={IndustrialManagementHome} />
              <Route path="/industrial-management/production-planning"      component={ProductionPlanning} />
              <Route path="/industrial-management/workshop-scheduling"      component={WorkshopScheduling} />
              <Route path="/industrial-management/capacity-planning"       component={CapacityPlanning} />
              <Route path="/industrial-management/quality-control"        component={QualityControl} />
              <Route path="/industrial-management/maintenance"           component={EquipmentMaintenance} />
                <Route path="/industrial-management/mst"                   component={Mst} />
              <Route component={NotFound} />
            </Switch>
          </IndustrialManagementLayout>
        ) : (
          <Layout>
            <Switch>
              <Route path="/simplex" component={Home} />
              <Route path="/simplex/solve" component={Solve} />
              <Route path="/simplex/results" component={Results} />
              <Route path="/simplex/history" component={History} />
              <Route path="/simplex/scenarios" component={ScenarioCompare} />
              <Route component={NotFound} />
            </Switch>
          </Layout>
        )}
      </Route>
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <LanguageProvider>
        <ProblemProvider>
          <ScenarioProvider>
            <TooltipProvider>
              <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
                <Router />
              </WouterRouter>
              <Toaster />
            </TooltipProvider>
          </ScenarioProvider>
        </ProblemProvider>
      </LanguageProvider>
    </QueryClientProvider>
  );
}

export default App;
