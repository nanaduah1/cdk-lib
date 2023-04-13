import {
  Effect,
  PolicyDocument,
  PolicyStatement,
  Role,
  ServicePrincipal,
} from "aws-cdk-lib/aws-iam";
import { Queue } from "aws-cdk-lib/aws-sqs";
import { StateMachine } from "aws-cdk-lib/aws-stepfunctions";
import { Construct } from "constructs";
import { CfnPipe } from "aws-cdk-lib/aws-pipes";

type SqsToStepFunctionPipeProps = {
  sqs: Queue;
  stepFunction: StateMachine;
};

export class SqsToStepFunctionPipe extends Construct {
  constructor(scope: Construct, id: string, props: SqsToStepFunctionPipeProps) {
    super(scope, id);

    // - Allow pipe to read and delete jobs form queue
    const sqsAccessPolicy = new PolicyDocument({
      statements: [
        new PolicyStatement({
          actions: [
            "sqs:ReceiveMessage",
            "sqs:DeleteMessage",
            "sqs:GetQueueAttributes",
          ],
          effect: Effect.ALLOW,
          resources: [props.sqs.queueArn],
        }),
      ],
    });

    // - Allow pipe to start execution
    const stepFunctionExecutePolicy = new PolicyDocument({
      statements: [
        new PolicyStatement({
          actions: ["states:StartExecution"],
          effect: Effect.ALLOW,
          resources: [props.stepFunction.stateMachineArn],
        }),
      ],
    });

    const role = new Role(this, "PipeRole", {
      assumedBy: new ServicePrincipal("pipes.amazonaws.com"),
      inlinePolicies: {
        SourcePolicy: sqsAccessPolicy,
        TargetPolicy: stepFunctionExecutePolicy,
      },
    });

    const pipe = new CfnPipe(this, "Pipe", {
      roleArn: role.roleArn,
      source: props.sqs.queueArn,
      sourceParameters: {
        sqsQueueParameters: {
          batchSize: 1,
        },
      },
      target: props.stepFunction.stateMachineArn,
      targetParameters: {
        stepFunctionStateMachineParameters: {
          invocationType: "FIRE_AND_FORGET",
        },
      },
    });
  }
}
