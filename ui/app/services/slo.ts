import {
  serviceLevelObjectivesClient,
  serviceLevelObjectivesEvaluationClient,
  type SloEvaluationResponse,
} from "@dynatrace-sdk/client-service-level-objectives";
import type { Status } from "../model/types";

export interface SloOption {
  id: string;
  name: string;
  target?: number;
  warning?: number;
}

export async function listSlos(signal?: AbortSignal): Promise<SloOption[]> {
  const list = await serviceLevelObjectivesClient.getSlos({ abortSignal: signal });
  return list.slos
    .map((slo) => ({
      id: slo.id,
      name: slo.name,
      target: slo.criteria[0]?.target,
      warning: slo.criteria[0]?.warning,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export interface SloEvaluation {
  name: string;
  status: Status;
  value?: number;
  errorBudget?: number;
  target?: number;
  message?: string;
}

const STATUS_MAP: Record<string, Status> = {
  SUCCESS: "pass",
  WARNING: "warning",
  FAILURE: "failing",
  ERROR: "unknown",
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Evaluates an SLO with its own timeframe (the one defined in its criteria).
 * green = meets the target, orange = below warning, red = below target.
 */
export async function evaluateSlo(id: string, signal?: AbortSignal): Promise<SloEvaluation> {
  let response: SloEvaluationResponse = await serviceLevelObjectivesEvaluationClient.startSloEvaluation({
    body: { id, requestTimeoutMilliseconds: 15_000 },
    abortSignal: signal,
  });
  for (let i = 0; i < 20 && !response.evaluationResults?.length && response.evaluationToken; i++) {
    await sleep(750);
    response = await serviceLevelObjectivesEvaluationClient.pollSloEvaluation({
      evaluationToken: response.evaluationToken,
      abortSignal: signal,
    });
  }
  const result = response.evaluationResults?.[0];
  const name = response.definition?.name ?? id;
  const target = response.definition?.criteria?.[0]?.target;
  if (!result) {
    return { name, status: "unknown", target, message: "La evaluación del SLO no devolvió resultados." };
  }
  return {
    name,
    status: STATUS_MAP[result.status] ?? "unknown",
    value: result.value,
    errorBudget: result.errorBudget,
    target,
    message: result.message,
  };
}
