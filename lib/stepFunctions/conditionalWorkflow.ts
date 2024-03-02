import { LogGroup, RetentionDays } from "aws-cdk-lib/aws-logs";
import {
  Chain,
  Choice,
  Condition,
  DefinitionBody,
  LogLevel,
  State,
  StateMachine,
  StateMachineType,
  Succeed,
  TaskStateBase,
} from "aws-cdk-lib/aws-stepfunctions";
import { Construct } from "constructs";
import { WorkflowDEfinition } from "./states";
import { Stack } from "aws-cdk-lib";

type StateStep = TaskStateBase | Chain | State;
type ConditionalWorkflowProps = {
  executeIfCondition: Condition;
  mainJobTask: StateStep;
  formatInputTask?: StateStep;
  formatOutputTask?: StateStep;
  workflowType?: StateMachineType;
};

export class ConditionalWorkflow extends Construct {
  readonly stateMachine: StateMachine;
  readonly name: string;
  constructor(scope: Construct, id: string, props: ConditionalWorkflowProps) {
    super(scope, id);
    this.name = id;

    const {
      mainJobTask: makePaymentTask,
      formatInputTask,
      formatOutputTask,
      executeIfCondition,
      workflowType,
    } = props;

    const complete = new Succeed(this, `Success`, {
      comment: "Payment successful",
    });
    const canProcessThisEventState = new Choice(this, "Can Process Event?");

    const processJob = WorkflowDEfinition.fromArray([
      formatInputTask,
      makePaymentTask,
      formatOutputTask,
      complete,
    ]);

    canProcessThisEventState
      .when(executeIfCondition, processJob)
      .otherwise(complete);

    this.stateMachine = new StateMachine(this, `${id}-workflow`, {
      definitionBody: DefinitionBody.fromChainable(canProcessThisEventState),
      stateMachineType: workflowType || StateMachineType.EXPRESS,
      logs:
        workflowType && workflowType === StateMachineType.STANDARD
          ? undefined
          : {
              includeExecutionData: true,
              destination: new LogGroup(this, `${id}-Logs`, {
                retention: RetentionDays.ONE_DAY,
                logGroupName: `/aws/vendedlogs/${Stack.of(scope).stackName}-${
                  this.name
                }-${id}-Logs`,
              }),
              level: LogLevel.ALL,
            },
    });
  }
}
