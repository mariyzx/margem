import { z } from "zod";

export const healthStatusSchema = z.enum(["ok", "error"]);
export type HealthStatus = z.infer<typeof healthStatusSchema>;
export * from "./auth";
export * from "./limits";
export * from "./notebooks";
export * from "./questions";
export * from "./reviews";
export * from "./sources";
export * from "./search";
