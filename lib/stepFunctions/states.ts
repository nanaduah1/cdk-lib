import {
  Chain,
  IChainable,
  State,
  TaskStateBase,
} from "aws-cdk-lib/aws-stepfunctions";

type WorkflowDefinitionTask =
  | State
  | TaskStateBase
  | Chain
  | IChainable
  | undefined;

export class WorkflowDEfinition {
  static fromArray(states: WorkflowDefinitionTask[]) {
    const [startStep, ...otherSteps] = states.filter((state) => state);

    // HACK HACK: Had to set this to any to stop linter errors
    let chainedResult: any = startStep;
    otherSteps.forEach((state) => {
      chainedResult = chainedResult.next(state);
    });
    return chainedResult as Chain;
  }
}
