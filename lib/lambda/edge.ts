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
  templates?: string[];
} & FunctionConfig;

export class PythonEdgeFunction extends PythonFunctionV2 {
  constructor(scope: Construct, id: string, props: PythonEdgeFunctionProps) {
    if (props.templates) {
      // We need to copy the templates to the asset directory
      // so that they are included in the deployment

      for (const template of props.templates) {
        PythonEdgeFunction.copyAssetToLambda(template, props.path);
      }
    }
    super(scope, id, { ...props, architecture: Architecture.X86_64 });
  }

  private static copyAssetToLambda(assetPath: string, lambdaRoot: string) {
    const fs = require("fs");
    // Copy the index.html file from the build folder
    // to the lambda function folder
    const assetFileName = assetPath.split("/").pop();
    const assetContent = fs.readFileSync(assetPath, "utf-8");
    const destination = `${lambdaRoot}/${assetFileName}`;
    fs.writeFileSync(destination, assetContent);
  }
}
