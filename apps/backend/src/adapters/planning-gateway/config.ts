import { loadConfig } from "../../config/env.js";

export interface PlanningGatewayConfig {
  host: string;
  port: number;
  maxRequestBytes: number;
  maxRecordsPerRequest: number;
  authToken: string | undefined;
}

export function loadPlanningGatewayConfig(): PlanningGatewayConfig {
  const appConfig = loadConfig();
  return {
    host: appConfig.planningGatewayHost,
    port: appConfig.planningGatewayPort,
    maxRequestBytes: appConfig.planningGatewayMaxRequestBytes,
    maxRecordsPerRequest: appConfig.planningGatewayMaxRecordsPerRequest,
    authToken: appConfig.planningGatewayAuthToken
  };
}
