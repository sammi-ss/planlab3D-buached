/**
 * Application feature flags and switches.
 * When ENABLE_COMPLIANCE_ANALYSIS is false:
 * - Hides IC/LA compliance tab, rule codes (IC-xx, LA-xx), pass/fail status, and score %.
 * - Hides executive metrics and scenario comparison tabs/buttons.
 * - Hides 3D crossing collision warning beacons/labels.
 * - Disables calling evaluation functions in labAnalysis.ts.
 * - Keeps conceptual flow arrows labeled "แนวการไหลเชิงแนวคิด" without numeric distances/crossings.
 */
export const ENABLE_COMPLIANCE_ANALYSIS = false;
