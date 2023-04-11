import { EventBus } from "aws-cdk-lib/aws-events";
import { TaskInput, TaskStateBaseProps } from "aws-cdk-lib/aws-stepfunctions";
import { EventBridgePutEvents } from "aws-cdk-lib/aws-stepfunctions-tasks";
import { Construct } from "constructs";

type DispatchToEventBusProps = {
  eventBus: EventBus;
  eventName: string;
} & TaskStateBaseProps;

export class DispatchToEventBus extends EventBridgePutEvents {
  constructor(scope: Construct, id: string, props: DispatchToEventBusProps) {
    const { eventBus, eventName, ...taskProps } = props;
    super(scope, id, {
      entries: [
        {
          detailType: eventName,
          detail: TaskInput.fromJsonPathAt("$"),
          source: "api.service.payment",
          eventBus,
        },
      ],
      ...taskProps,
      resultPath: taskProps.resultPath || "$.collectedEvent",
    });
  }
}
