import { Construct } from "constructs";
import { Runtime, Function, Code, Architecture } from "aws-cdk-lib/aws-lambda";
import { Duration } from "aws-cdk-lib";
import { RetentionDays } from "aws-cdk-lib/aws-logs";

const inlineHandlerCode = `
from boto3.dynamodb.transform import TypeDeserializer
deserializer = TypeDeserializer()

def handler(event, context):
    return {k: deserializer.deserialize(v) for k, v in event.items()}
`;

export class DynamoJsonConverterFunction extends Function {
  constructor(scope: Construct, id: string) {
    super(scope, id, {
      code: Code.fromInline(inlineHandlerCode),
      runtime: Runtime.PYTHON_3_8,
      architecture: Architecture.ARM_64,
      timeout: Duration.seconds(5),
      handler: "index.handler",
      logRetention: RetentionDays.ONE_DAY,
    });
  }
}
