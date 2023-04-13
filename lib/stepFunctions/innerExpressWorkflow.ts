import { JsonPath } from "aws-cdk-lib/aws-stepfunctions";
import { CallAwsService } from "aws-cdk-lib/aws-stepfunctions-tasks";
import { Construct } from "constructs";

type InnerExpressWorkflowProps = {
  stateMachineArn: string;
};

export class InnerExpressWorkflow extends CallAwsService {
  constructor(scope: Construct, id: string, props: InnerExpressWorkflowProps) {
    const { stateMachineArn } = props;

    const cleanedId = id.trim().replace(" ", "");

    super(scope, id, {
      service: "sfn",
      action: "startSyncExecution",
      iamResources: [stateMachineArn],
      parameters: {
        StateMachineArn: stateMachineArn,
        Input: JsonPath.stringAt("$"),
      },
      resultSelector: {
        Output: JsonPath.stringToJson(JsonPath.stringAt("$.Output")),
      },
      resultPath: `$.${cleanedId}`,
      outputPath: `$.${cleanedId}.Output`,
    });
  }
}
