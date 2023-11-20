import { Construct } from "constructs";
import { PythonFunctionV2 } from "..";
import { Architecture, Runtime } from "aws-cdk-lib/aws-lambda";
import { FunctionConfig } from "../types";

type PythonEdgeFunctionProps = {
  path: string;
  runtime?: Runtime;
  description?: string;
  handler?: string;
  handlerFileName?: string;
} & FunctionConfig;

export class PythonEdgeFunction extends PythonFunctionV2 {
  constructor(scope: Construct, id: string, props: PythonEdgeFunctionProps) {
    super(scope, id, { ...props, architecture: Architecture.X86_64 });
  }
}
