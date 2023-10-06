import { BaseApp } from "@fast-ninjas/cdk-constructs/dist";
import { FunctionConfig } from "@fast-ninjas/cdk-constructs/dist/types";
import { ITable } from "aws-cdk-lib/aws-dynamodb";
import { PythonFunctionV2 } from "@fast-ninjas/cdk-constructs/dist/lambda/python";
import { DynamoEventSource } from "aws-cdk-lib/aws-lambda-event-sources";
import { StartingPosition } from "aws-cdk-lib/aws-lambda";

type StreamProcessorProps = {
  /**
   * The path to the root folder of the lambda function.
   * It should be relative to the bin folder.
   */
  fuction: string | { [path: string]: FunctionConfig };

  /**
   * The DynamoDB table to stream
   */
  table: ITable;

  /**
   * The batch size to use when processing the stream
   * @default 100
   */
  batchSize?: number;
} & FunctionConfig;

export class StreamProcessor {
  readonly streamHandler: PythonFunctionV2;
  constructor(app: BaseApp, id: string, props: StreamProcessorProps) {
    const { fuction, table, batchSize, ...selfConfig } = props;

    const path =
      typeof fuction === "string" ? fuction : Object.keys(fuction)[0];
    const functionConfig = typeof fuction === "string" ? {} : fuction[path];

    // Merge the function config with the base app config
    const mergedFunctionConfig = {
      ...app.functions,
      ...selfConfig,
      ...functionConfig,
    };

    const streamHandler = new PythonFunctionV2(app, id, {
      path,
      ...mergedFunctionConfig,
    });

    streamHandler.addEventSource(
      new DynamoEventSource(table, {
        batchSize: batchSize ?? 100,
        startingPosition: StartingPosition.LATEST,
      })
    );

    this.streamHandler = streamHandler;
  }
}
