import {
  PythonFunction,
  PythonLayerVersion,
} from "@aws-cdk/aws-lambda-python-alpha";
import { Duration } from "aws-cdk-lib";
import { ISecurityGroup, IVpc, SubnetSelection } from "aws-cdk-lib/aws-ec2";
import { Architecture, ILayerVersion, Runtime } from "aws-cdk-lib/aws-lambda";
import { RetentionDays } from "aws-cdk-lib/aws-logs";
import { Construct } from "constructs";
import { FunctionConfig } from "../types";
import fs, { readFileSync } from "fs";
import path from "path";
import { parse as parseYml } from "yaml";
import { PoetryLockParser } from "./bundling";

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
  subnets?: SubnetSelection;
  securityGroups?: ISecurityGroup[];

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

    let localDependencies = undefined;
    if (fs.existsSync(path.join(props.path, "poetry.lock"))) {
      const depsParser = new PoetryLockParser();
      const lockFileContent = fs.readFileSync(
        path.join(props.path, "poetry.lock"),
        "utf-8"
      );
      localDependencies = depsParser.getLocalDependencies(lockFileContent);
    }
    const volumes = localDependencies?.map((d) => ({
      containerPath: `/${d.name}`,
      hostPath: `${path.resolve(props.path, d.url)}`,
    }));

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
      architecture: props.architecture ?? Architecture.ARM_64,
      vpc: props.vpc,
      vpcSubnets: props.subnets,
      securityGroups: props.securityGroups,
      bundling: {
        assetExcludes: [
          ...(props.excludeAssests || []),
          "tests",
          "README.md",
          ".venv",
          "venv",
          ".gitignore",
          ".git",
        ],
        volumes,
      },
    });

    props.permissions?.forEach((p) => {
      if (!p) return;
      if ("grantReadWriteData" in p) {
        p.grantReadWriteData(this);
      } else if ("grantReadWrite" in p) {
        p.grantReadWrite(this);
      } else if ("grantSendMessages" in p) {
        p.grantSendMessages(this);
      }
    });
  }
}

export class FunctionLayer {
  static getLayer(
    scope: Construct,
    projectRoot: string,
    fileName?: string
  ): { [key: string]: ILayerVersion } {
    const config = parseYml(readFileSync(fileName ?? "Cloudly.yml", "utf-8"));
    const layers = config.layers ?? [];

    const layerMap: { [key: string]: ILayerVersion } = {};
    for (const layer of layers) {
      const runtimes = layer.runtimes?.map(this.getRuntime) ?? [];

      if (runtimes.length === 0) {
        runtimes.push(Runtime.PYTHON_3_11);
      }

      layerMap[layer.name] = new PythonLayerVersion(scope, layer.name, {
        entry: path.join(projectRoot, layer.path),
        compatibleRuntimes: runtimes,
        description: layer.description,
      });
    }

    return layerMap;
  }

  static getRuntime(runtime: string): Runtime {
    switch (runtime.toLowerCase()) {
      case "python3.9":
        return Runtime.PYTHON_3_9;
      case "python3.10":
        return Runtime.PYTHON_3_10;
      case "python3.11":
        return Runtime.PYTHON_3_11;
      default:
        throw new Error(`Unsupported runtime: ${runtime}`);
    }
  }
}
