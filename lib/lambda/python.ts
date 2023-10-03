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

  /**
   * The list of paths to poetry projects that should be installed in the lambda layer.
   */
  localDependancies?: string[];
} & FunctionConfig;

export class PythonFunctionV2 extends PythonFunction {
  constructor(scope: Construct, id: string, props: PythonFunctionPropsV2) {
    const runtime = props.runtime || Runtime.PYTHON_3_11;
    const projectName = props.path.split("/").slice(-1)[0];

    let beforeBundling: string[] = [];
    let afterBundling = [];
    let volumes = [];
    if (props.localDependancies) {
      beforeBundling = createSymlinkCommands(props.localDependancies);
      afterBundling = ["rm -rf cdk.out/tmp-shared"];
    }
    super(scope, id, {
      entry: props.path,
      runtime,
      description: props.description,
      logRetention: props.logRetention || RetentionDays.ONE_WEEK,
      handler: props.handler,
      index: props.handlerFileName || `${projectName.toLowerCase()}/handler.py`,
      environment: props.environment,
      memorySize: props.memorySize || 128,
      layers: props.layers,
      timeout: Duration.seconds(props.timeout || 5),
      architecture: Architecture.ARM_64,
      vpc: props.vpc,
      bundling: {
        assetExcludes: [...(props.excludeAssests || []), "tests", "README.md"],
        commandHooks: {
          beforeBundling(inputDir: string, outputDir: string) {
            return beforeBundling;
          },
          afterBundling(inputDir: string, outputDir: string) {
            return ['echo "Done with shared dependencies"'];
          },
        },
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

/**
 * Generate sequence of commands to create symlink of all the shared projects
 * to the cdk.out folder.
 * @param localDependancies
 */
function createSymlinkCommands(localDependancies: string[]): string[] {
  const commands = ["mkdir -p cdk.out/tmp-shared"];
  for (const project of localDependancies) {
    commands.push(`ln -s ${project} cdk.out/tmp-shared/${project}`);
  }

  // copy tmp-shared to the docker working directory
  commands.push("cp -r cdk.out/tmp-shared .");

  return commands;
}
