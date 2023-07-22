import { Stack, StackProps } from "aws-cdk-lib";
import { Construct } from "constructs";
import { FunctionConfig } from "./types";

export type BaseAppProps = {
  stages?: string[];
  projectRoot: string;
  functions?: FunctionConfig;
} & StackProps;

export abstract class BaseApp extends Stack {
  readonly stageName: string;
  readonly productionStageName: string;
  readonly projectRoot: string;
  readonly functions: FunctionConfig;
  constructor(scope: Construct, id: string, props: BaseAppProps) {
    // We read the stage name from the context passed in from the CDK CLI.
    const stageName = scope.node.tryGetContext("stage") || "beta";

    // We read the allowed stages from the environment variable called ALLOWED_STAGES.
    const allowedStages = process.env.ALLOWED_STAGES?.split(",").map((s) =>
      s.trim()
    );

    const supportedStages = allowedStages || props.stages || [];

    if (!supportedStages.includes(stageName)) {
      throw Error(`ALLOWED_STAGES does not include ${stageName}`);
    }

    super(scope, `${id}-${stageName}`, props);
    this.stageName = stageName;
    this.projectRoot = props.projectRoot;
    this.functions = props.functions || {};
  }

  get IsProductionStage() {
    return this.ProductionStageNames.includes(this.stageName);
  }

  get ProductionStageNames() {
    return ["prod", "production"];
  }
}
