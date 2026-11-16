import type { SandboxResult as BackendResult } from "../src/lib/types";
import type { SandboxResult as AgentResult } from "../sandbox/src/types";

type Assert<T extends true> = T;
type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false;

/** Der separat baubare Agent und das Backend müssen denselben Vertrag haben. */
export type SandboxContract = Assert<Equal<BackendResult, AgentResult>>;
