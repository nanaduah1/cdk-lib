import { PythonFunction } from "@aws-cdk/aws-lambda-python-alpha";
import { Duration } from "aws-cdk-lib";
import { IVpc } from "aws-cdk-lib/aws-ec2";
import { Architecture, Runtime } from "aws-cdk-lib/aws-lambda";
import { RetentionDays } from "aws-cdk-lib/aws-logs";
import { Construct } from "constructs";
import { FunctionConfig } from "../types";
import { Table } from "aws-cdk-lib/aws-dynamodb";
import { Bucket } from "aws-cdk-lib/aws-s3";
import { Queue } from "aws-cdk-lib/aws-sqs";
import fs from "fs";
import path from "path";

type PythonFunctionPropsV2 = {
  /**
   * The path to the root folder of the lambda function.
   * It should be relative to the bin folder.
   */
  path: string;
  runtime?: Runtime;
  description?: string;

  /**Name of the handler function. Default: handler */
  handler?: string;
  /**Name of the handler file. Default: handler.py */
  handlerFileName?: string;
  vpc?: IVpc;

  /**File name patterns to exclude when packaging */
  excludeAssests?: string[];
} & FunctionConfig;

export class PythonFunctionV2 extends PythonFunction {
  constructor(scope: Construct, id: string, props: PythonFunctionPropsV2) {
    const runtime = props.runtime || Runtime.PYTHON_3_11;
    const projectName = props.path.split("/").slice(-1)[0];
    let handlerModule =
      props.handlerFileName ?? `${projectName.toLowerCase()}/handler.py`;

    // We want to support the default poetry project structure
    // where the handler is in a folder with the same name as the project
    // e.g. project-name/project-name/handler.py
    // So we need to get the project name from the path
    //check if handler exists in the project folder
    if (!fs.existsSync(path.join(props.path, handlerModule ?? ""))) {
      if (fs.existsSync(path.join(props.path, "handler.py"))) {
        // Project uses a flat structure where the handler is in the root folder
        handlerModule = `handler.py`;
      }

      if (!fs.existsSync(path.join(props.path, handlerModule ?? ""))) {
        throw new Error(`Could not find ${handlerModule} in ${props.path}`);
      }
    }

    super(scope, id, {
      entry: props.path,
      runtime,
      description: props.description,
      logRetention: props.logRetention || RetentionDays.ONE_WEEK,
      handler: props.handler,
      index: handlerModule,
      environment: props.environment,
      memorySize: props.memorySize || 128,
      layers: props.layers,
      timeout: Duration.seconds(props.timeout || 5),
      architecture: Architecture.ARM_64,
      vpc: props.vpc,
      bundling: {
        assetExcludes: [...(props.excludeAssests || []), "tests", "README.md"],
      },
    });

    props.permissions?.forEach((p) => {
      if (!p) return;
      if (p instanceof Table) {
        p.grantReadWriteData(this);
      } else if (p instanceof Bucket) {
        p.grantReadWrite(this);
      } else if (p instanceof Queue) {
        p.grantSendMessages(this);
      }
    });
  }
}
